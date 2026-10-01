// Verifies the built package against the shipped 1.0.0.7 baseline and writes the release evidence.
//
//   node scripts/verify-package.mjs [--package sharepoint/solution/overture-ai-coe-front-door.sppkg]
//                                   [--out evidence/port-verification.json]
//                                   [--inventory evidence/dependency-inventory.json]
//                                   [--tests "<summary of the test run>"]
//
// Checks: package identity and version in AppManifest.xml, list provisioning XML byte-identical to the
// shipped package (recovered/inventory.json), exactly one JavaScript bundle plus its strings chunk, no phrase,
// host, roster surname or secret shape of the tenant word list (src/provisioning/tenantWords.json) in the
// bundle, the strings chunk or the packaged component manifest, the data contracts still present, the word
// list itself and its entries (client words included, beyond the documented identifiers) absent from every entry
// of the archive, and every dependency pinned exactly.
// Writes the dependency inventory (one row per runtime component of package-lock.json, the sixteen fields of
// 13_SECURITY_AND_THREAT_MODEL/secrets-supply-chain.yaml `required_inventory_fields`) and records its hash.
// Exits non-zero on any failure.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const packagePath = path.resolve(root, argument('--package', 'sharepoint/solution/overture-ai-coe-front-door.sppkg'));
const outPath = path.resolve(root, argument('--out', 'evidence/port-verification.json'));
const inventoryPath = path.resolve(root, argument('--inventory', 'evidence/dependency-inventory.json'));
const testSummary = argument('--tests', undefined);

// The one list of tenant words every portability scan reads; deliberately not tenant-neutral, never packaged.
const TENANT_WORDS_PATH = 'src/provisioning/tenantWords.json';
const CASE_INSENSITIVE_LISTS = ['clientWords', 'hosts'];

const EXPECTED = {
  productId: 'f125ebdf-4a9d-4e6e-8479-3a18874e7752',
  version: '1.0.0.18',
  featureId: '69ab84b7-608c-47ee-9623-af8ebaf2cb10',
  webPartId: 'cf2e5904-0703-4fe4-ae5a-ec012d6fa689',
  provisioningFiles: ['elements.xml', 'intake-schema.xml', 'decision-schema.xml'],
  // The lists of the tenant word list the bundle, its strings chunk and the packaged manifest are scanned with
  // (a bare product name stays legal: the parity-pinned telemetry labels use it).
  forbiddenInBundle: { path: TENANT_WORDS_PATH, lists: ['bundlePhrases', 'hosts', 'people', 'secretPatterns'] },
  // The lists every entry of the archive is scanned with. Client words (case-insensitive) are applied after the
  // documented identifiers below are masked, so any other appearance of one fails the scan.
  forbiddenInPackage: ['clientWords', 'bundlePhrases', 'hosts', 'people', 'caseIds', 'secretPatterns'],
  requiredInBundle: ['OVT-AICOE-', 'overture-ai-coe-front-door:draft:', 'overture-ai-coe-pilot', 'AI CoE Pilot Intakes']
};

// The identifiers that carry the vendor word by contract (README "Data contracts never change" and "Portability
// exceptions"), masked before the client-word scan of every archive entry and nowhere else:
//  - the overture-ai-coe- family: the package overture-ai-coe-front-door, the solution name
//    overture-ai-coe-front-door-client-side-solution (AppManifest Name and Title), the localStorage draft key prefix
//    overture-ai-coe-front-door:draft:, the DOM scope id overture-ai-coe-pilot and the download file names
//    overture-ai-coe-*.txt (the bundle also carries the bare prefix, concatenated with a workflow id);
//  - the confirm dialog heading id overture-confirm-title (controls/ConfirmDialog.tsx, a legacy screen);
//  - the .overture-* classes of the shipped stylesheet, read from the parity baseline rather than listed by hand.
const SHIPPED_THEME_PATH = 'parity/theme.1.0.0.7.css';
const DOCUMENTED_IDENTIFIERS = [/\boverture-ai-coe-[a-z0-9:.-]*/g, /\boverture-confirm-title\b/g];

/** The shipped stylesheet's vendor-prefixed class names, longest first so no name masks a prefix of another. */
function shippedClassPatterns() {
  const css = fs.readFileSync(path.join(root, SHIPPED_THEME_PATH), 'utf8');
  const names = [...new Set((css.match(/\.overture-[a-z0-9-]+/g) ?? []).map((token) => token.slice(1)))];
  names.sort((a, b) => b.length - a.length);
  return names.map((name) => new RegExp(`\\b${name}\\b`, 'g'));
}

/** The text with every documented identifier replaced, so the client-word scan sees only what is not one. */
function maskDocumentedIdentifiers(text, patterns) {
  let masked = text;
  for (const pattern of patterns) {
    masked = masked.replace(pattern, '[documented-identifier]');
  }
  return masked;
}

// The sixteen `required_inventory_fields` of 13_SECURITY_AND_THREAT_MODEL/secrets-supply-chain.yaml, in its order.
const INVENTORY_FIELDS = [
  'ComponentID',
  'Class',
  'Provider',
  'Name',
  'Version',
  'Source',
  'Owner',
  'Environment',
  'DataClasses',
  'AllowedActions',
  'Terms',
  'Risk',
  'LastValidatedAt',
  'ExpiresAt',
  'QualificationReceiptID',
  'KillSwitch'
];
// The explicit token for what the lock file cannot say; the tenant inventory replaces it.
const AWAITING_TENANT_INVENTORY = 'AWAITING_TENANT_INVENTORY';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Reads a plain ZIP archive (stored or deflated entries, no ZIP64) without external tools. */
function readZipEntries(buffer) {
  const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
  const CENTRAL_FILE_HEADER = 0x02014b50;
  const LOCAL_FILE_HEADER = 0x04034b50;
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== END_OF_CENTRAL_DIRECTORY) {
    end--;
  }
  if (end < 0) {
    throw new Error('Not a ZIP archive: end of central directory not found.');
  }
  const entryCount = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) {
      throw new Error(`Corrupt central directory at offset ${offset}.`);
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
      throw new Error(`Corrupt local header for ${name}.`);
    }
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (!name.endsWith('/')) {
      if (method === 0) {
        entries.push({ name, bytes: Buffer.from(data) });
      } else if (method === 8) {
        entries.push({ name, bytes: inflateRawSync(data) });
      } else {
        throw new Error(`Unsupported compression method ${method} for ${name}.`);
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** One expression over a whole list of the tenant word file (the same shape src/provisioning/tenantWords.ts builds). */
function tenantWordPattern(words, list) {
  return new RegExp(words[list].map((entry) => `(?:${entry})`).join('|'), CASE_INSENSITIVE_LISTS.includes(list) ? 'gi' : 'g');
}

/** Every match of the given lists in a text, as "<list>: <match>", so a failing scan names what it found. */
function findTenantWords(text, words, lists) {
  const found = [];
  for (const list of lists) {
    const pattern = tenantWordPattern(words, list);
    let match = pattern.exec(text);
    while (match !== null) {
      found.push(`${list}: ${match[0]}`);
      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
      match = pattern.exec(text);
    }
  }
  return found;
}

function unescapeXml(text) {
  return text.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const failures = [];
const check = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

if (!fs.existsSync(packagePath)) {
  console.error(`Package not found: ${packagePath}. Run npm run build first.`);
  process.exit(1);
}

const tenantWords = JSON.parse(fs.readFileSync(path.join(root, TENANT_WORDS_PATH), 'utf8'));
const packageBytes = fs.readFileSync(packagePath);
const entries = readZipEntries(packageBytes);
const byName = new Map(entries.map((entry) => [entry.name, entry.bytes]));

const appManifest = (byName.get('AppManifest.xml') ?? Buffer.alloc(0)).toString('utf8');
const version = /\sVersion="([^"]+)"/.exec(appManifest)?.[1];
const productId = /\sProductID="([^"]+)"/i.exec(appManifest)?.[1];
const domainIsolated = /\sIsDomainIsolated="([^"]+)"/i.exec(appManifest)?.[1];
check(version === EXPECTED.version, `AppManifest Version is ${version}, expected ${EXPECTED.version}`);
check(productId?.toLowerCase() === EXPECTED.productId, `AppManifest ProductID is ${productId}, expected ${EXPECTED.productId}`);
check(domainIsolated === 'false', `AppManifest IsDomainIsolated is ${domainIsolated}, expected false`);
// The AI draft flow is reached with a framework-issued Entra token; the package must ask for that API permission.
// The packager writes the request as <WebApiPermissionRequest ResourceId="…" Scope="…">.
const permissionRequest = /<WebApiPermissionRequest [^>]*ResourceId="([^"]+)"[^>]*Scope="([^"]+)"/i.exec(appManifest);
check(
  permissionRequest !== null && permissionRequest[1] === 'Microsoft Flow Service' && permissionRequest[2] === 'User',
  `AppManifest lacks the "Microsoft Flow Service / User" web API permission request (found: ${permissionRequest === null ? 'none' : `${permissionRequest[1]} / ${permissionRequest[2]}`})`
);

const inventory = JSON.parse(fs.readFileSync(path.join(root, 'recovered/inventory.json'), 'utf8'));
const shippedHashes = new Map();
for (const entry of inventory.files ?? []) {
  shippedHashes.set(path.basename(entry.path), entry.sha256);
}
const provisioning = {};
for (const file of EXPECTED.provisioningFiles) {
  const built = entries.find((entry) => path.basename(entry.name) === file);
  const builtHash = built ? sha256(built.bytes) : undefined;
  const shippedHash = shippedHashes.get(file);
  provisioning[file] = { built: builtHash, shipped: shippedHash, identical: builtHash !== undefined && builtHash === shippedHash };
  check(provisioning[file].identical, `${file} differs from the shipped package (${builtHash} vs ${shippedHash})`);
}

// The web part bundle plus, since the port, the localized strings chunk of the property pane.
const scripts = entries.filter((entry) => /^ClientSideAssets\/.*\.js$/.test(entry.name));
const bundles = scripts.filter((entry) => /^ClientSideAssets\/ai-coe-front-door-web-part.*\.js$/.test(entry.name));
check(bundles.length === 1, `Expected exactly one web part bundle under ClientSideAssets, found ${bundles.length}`);
check(scripts.length === bundles.length + 1, `Expected the bundle and one strings chunk under ClientSideAssets, found ${scripts.length} scripts`);
const bundleText = scripts.map((entry) => entry.bytes.toString('utf8')).join('\n');
for (const marker of EXPECTED.requiredInBundle) {
  check(bundleText.includes(marker), `The bundle lacks the data-contract marker "${marker}"`);
}
check(bundleText.includes(`define("${EXPECTED.webPartId}_1.0.0"`), 'The bundle does not define the shipped web part module id');
const featureManifest = entries.find((entry) => /feature.*\.xml$|manifest\.xml$/i.test(entry.name) && entry.bytes.toString('utf8').includes(EXPECTED.featureId));
check(featureManifest !== undefined, `No manifest references feature ${EXPECTED.featureId}`);

// The packaged component manifest (HTML-escaped JSON inside the feature's WebPart element) must keep the
// consolidated app first so a new instance opens as one page. An absent view on an existing instance still
// parses to legacy. The outcome record stays last.
const componentXml = entries.find((entry) => new RegExp(`WebPart_${EXPECTED.webPartId}\\.xml$`, 'i').test(entry.name));
check(componentXml !== undefined, `No WebPart_${EXPECTED.webPartId}.xml element manifest in the package`);
const componentText = componentXml === undefined ? '' : componentXml.bytes.toString('utf8');
const preconfiguredViews = (componentText.match(/&quot;view&quot;:&quot;([A-Za-z]+)&quot;/g) ?? []).map((match) => match.replace(/&quot;/g, '').split(':')[1]);
check(preconfiguredViews[0] === 'app', `The first toolbox entry presets view "${preconfiguredViews[0]}", expected "app"`);
check(
  preconfiguredViews.length === 12,
  `Expected twelve toolbox entries (consolidated app, legacy, one per piece, the content page and the outcome record), found ${preconfiguredViews.length}`
);
check(
  preconfiguredViews[preconfiguredViews.length - 1] === 'outcome',
  `The last toolbox entry presets view "${preconfiguredViews[preconfiguredViews.length - 1]}", expected "outcome"`
);
check(
  componentText.includes('&quot;contentUrl&quot;:&quot;SiteAssets/ai-coe-pages.json&quot;'),
  'The toolbox entries do not preset the content document path SiteAssets/ai-coe-pages.json'
);
check(componentText.includes('ClientSideComponent Name="AI CoE Front Door"'), 'The component manifest lost the shipped web part name');

// Tenant words: the bundle, the strings chunk and the packaged component manifest carry no phrase, tenant host,
// roster surname or secret shape of the word list; the counts per list are recorded.
const forbiddenWordCounts = {};
for (const list of EXPECTED.forbiddenInBundle.lists) {
  const found = [...findTenantWords(bundleText, tenantWords, [list]), ...findTenantWords(unescapeXml(componentText), tenantWords, [list])];
  forbiddenWordCounts[list] = found.length;
  check(found.length === 0, `The bundle, strings chunk or packaged manifest contains ${list} of the tenant word list: ${[...new Set(found)].join(', ')}`);
}

// The archive as a whole: neither the word list file nor any of its entries. Three documented exemptions, all recorded
// in the evidence: the phrase and client-word lists are not applied to the three shipped provisioning XML files
// (asserted byte-identical to 1.0.0.7 above; their site column group and the list description name the vendor), no
// list is applied to the publisher block of AppManifest.xml (<DeveloperProperties>, from config/package-solution.json),
// and the documented identifiers are masked before the client-word scan. Image entries are not text and are listed as
// skipped.
const identifierPatterns = [...DOCUMENTED_IDENTIFIERS, ...shippedClassPatterns()];
const packageScan = {
  lists: EXPECTED.forbiddenInPackage,
  exempt: [
    `bundlePhrases and clientWords in ${EXPECTED.provisioningFiles.join(', ')} (byte-identical to the shipped 1.0.0.7 package)`,
    'every list in the <DeveloperProperties> element of AppManifest.xml (the publisher, from config/package-solution.json)',
    `clientWords in the documented identifiers: the overture-ai-coe- family (package, solution name, draft key prefix, DOM scope id, download file names), overture-confirm-title and the .overture-* classes of ${SHIPPED_THEME_PATH}`
  ],
  binarySkipped: [],
  scanned: [],
  findings: []
};
for (const entry of entries) {
  const isWordList = path.basename(entry.name) === 'tenantWords.json';
  check(!isWordList, `The package contains the tenant word list ${entry.name}`);
  if (/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|eot)$/i.test(entry.name)) {
    packageScan.binarySkipped.push(entry.name);
    continue;
  }
  let text = entry.bytes.toString('utf8');
  let lists = EXPECTED.forbiddenInPackage;
  if (EXPECTED.provisioningFiles.includes(path.basename(entry.name))) {
    lists = lists.filter((list) => list !== 'bundlePhrases' && list !== 'clientWords');
  }
  if (path.basename(entry.name) === 'AppManifest.xml') {
    text = text.replace(/<DeveloperProperties>[\s\S]*?<\/DeveloperProperties>/, '<DeveloperProperties/>');
  }
  text = unescapeXml(text);
  packageScan.scanned.push(entry.name);
  for (const list of lists) {
    const subject = list === 'clientWords' ? maskDocumentedIdentifiers(text, identifierPatterns) : text;
    for (const finding of findTenantWords(subject, tenantWords, [list])) {
      packageScan.findings.push(`${entry.name}: ${finding}`);
    }
  }
}
check(packageScan.findings.length === 0, `The package contains entries of the tenant word list: ${[...new Set(packageScan.findings)].join('; ')}`);

// Dependencies: every declared dependency pinned exactly, and the inventory of runtime components written from the
// lock file with the sixteen required fields on every row. What the lock cannot say carries the explicit token.
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const group of ['dependencies', 'devDependencies']) {
  for (const [name, range] of Object.entries(packageJson[group] ?? {})) {
    check(/^\d+\.\d+\.\d+$/.test(range), `package.json ${group} ${name} is "${range}", expected an exact version`);
  }
}
const lockBytes = fs.readFileSync(path.join(root, 'package-lock.json'));
const lock = JSON.parse(lockBytes.toString('utf8'));
check(lock.lockfileVersion === 3, `package-lock.json is lockfileVersion ${lock.lockfileVersion}, expected 3`);
const components = new Map();
for (const [key, entry] of Object.entries(lock.packages ?? {})) {
  if (key === '' || entry.dev === true) {
    continue;
  }
  const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const id = `npm:${name}@${entry.version}`;
  if (components.has(id)) {
    continue;
  }
  check(typeof entry.resolved === 'string' && typeof entry.integrity === 'string', `${id} has no resolved URL or integrity in package-lock.json`);
  components.set(id, {
    ComponentID: id,
    Class: 'LIBRARY',
    Provider: AWAITING_TENANT_INVENTORY,
    Name: name,
    Version: entry.version,
    Source: `${entry.resolved} ${entry.integrity}`,
    Owner: AWAITING_TENANT_INVENTORY,
    Environment: 'portable-build',
    DataClasses: AWAITING_TENANT_INVENTORY,
    AllowedActions: AWAITING_TENANT_INVENTORY,
    Terms: AWAITING_TENANT_INVENTORY,
    Risk: AWAITING_TENANT_INVENTORY,
    LastValidatedAt: AWAITING_TENANT_INVENTORY,
    ExpiresAt: AWAITING_TENANT_INVENTORY,
    QualificationReceiptID: AWAITING_TENANT_INVENTORY,
    KillSwitch: AWAITING_TENANT_INVENTORY
  });
}
for (const name of Object.keys(packageJson.dependencies ?? {})) {
  check(components.has(`npm:${name}@${packageJson.dependencies[name]}`), `Runtime dependency ${name}@${packageJson.dependencies[name]} is not in the lock file's runtime tree`);
}
const dependencyInventory = {
  release: EXPECTED.version,
  source: 'package-lock.json',
  lockSha256: sha256(lockBytes),
  fields: INVENTORY_FIELDS,
  components: [...components.values()].sort((a, b) => (a.ComponentID < b.ComponentID ? -1 : a.ComponentID > b.ComponentID ? 1 : 0))
};
const inventoryText = `${JSON.stringify(dependencyInventory, null, 2)}\n`;
fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
fs.writeFileSync(inventoryPath, inventoryText);

const record = {
  verifiedAt: new Date().toISOString(),
  package: {
    path: path.relative(root, packagePath).split(path.sep).join('/'),
    sha256: sha256(packageBytes),
    bytes: packageBytes.length,
    version,
    productId,
    isDomainIsolated: domainIsolated,
    webApiPermissionRequest: permissionRequest === null ? undefined : { resource: permissionRequest[1], scope: permissionRequest[2] },
    entries: entries.map((entry) => entry.name).sort()
  },
  provisioning,
  bundle: {
    files: scripts.map((entry) => ({ name: entry.name, sha256: sha256(entry.bytes), bytes: entry.bytes.length })),
    tenantWordList: EXPECTED.forbiddenInBundle.path,
    forbiddenWordCounts,
    dataContractMarkers: EXPECTED.requiredInBundle,
    preconfiguredViews
  },
  packageScan,
  dependencyInventory: {
    path: path.relative(root, inventoryPath).split(path.sep).join('/'),
    sha256: sha256(Buffer.from(inventoryText, 'utf8')),
    components: dependencyInventory.components.length,
    fields: INVENTORY_FIELDS.length,
    awaitingToken: AWAITING_TENANT_INVENTORY,
    fieldsSource: '13_SECURITY_AND_THREAT_MODEL/secrets-supply-chain.yaml required_inventory_fields'
  },
  tests: testSummary,
  scope: 'Local build verification only: no tenant upload, deployment, SharePoint change or model call.',
  failures
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}: ${path.relative(root, outPath)} (${dependencyInventory.components.length} components in ${path.relative(root, inventoryPath)})`);
for (const failure of failures) {
  console.error(` - ${failure}`);
}
process.exit(failures.length === 0 ? 0 : 1);

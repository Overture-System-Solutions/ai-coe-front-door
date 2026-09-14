// Verifies the built package against the shipped 1.0.0.7 baseline and writes an evidence record.
//
//   node scripts/verify-package.mjs [--package sharepoint/solution/overture-ai-coe-front-door.sppkg]
//                                   [--out evidence/port-verification.json] [--tests "<summary of the test run>"]
//
// Checks: package identity and version in AppManifest.xml, list provisioning XML byte-identical to the
// shipped package (recovered/inventory.json), exactly one JavaScript bundle, no organization branding
// in the bundle, and the data contracts still present. Exits non-zero on any failure.
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
const testSummary = argument('--tests', undefined);

const EXPECTED = {
  productId: 'f125ebdf-4a9d-4e6e-8479-3a18874e7752',
  version: '1.0.0.10',
  featureId: '69ab84b7-608c-47ee-9623-af8ebaf2cb10',
  webPartId: 'cf2e5904-0703-4fe4-ae5a-ec012d6fa689',
  provisioningFiles: ['elements.xml', 'intake-schema.xml', 'decision-schema.xml'],
  forbiddenInBundle: ['Overture'],
  requiredInBundle: ['OVT-AICOE-', 'overture-ai-coe-front-door:draft:', 'overture-ai-coe-pilot', 'AI CoE Pilot Intakes']
};

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
// The Claude draft flow is reached with a framework-issued Entra token; the package must ask for that API permission.
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
const branding = {};
for (const word of EXPECTED.forbiddenInBundle) {
  branding[word] = bundleText.split(word).length - 1;
  check(branding[word] === 0, `The bundle contains "${word}" ${branding[word]} time(s)`);
}
for (const marker of EXPECTED.requiredInBundle) {
  check(bundleText.includes(marker), `The bundle lacks the data-contract marker "${marker}"`);
}
check(bundleText.includes(`define("${EXPECTED.webPartId}_1.0.0"`), 'The bundle does not define the shipped web part module id');
const featureManifest = entries.find((entry) => /feature.*\.xml$|manifest\.xml$/i.test(entry.name) && entry.bytes.toString('utf8').includes(EXPECTED.featureId));
check(featureManifest !== undefined, `No manifest references feature ${EXPECTED.featureId}`);

// The packaged component manifest (HTML-escaped JSON inside the feature's WebPart element) must keep the shipped
// toolbox entry first, presetting the legacy view, so an upgraded instance without a view renders as before.
const componentXml = entries.find((entry) => new RegExp(`WebPart_${EXPECTED.webPartId}\\.xml$`, 'i').test(entry.name));
check(componentXml !== undefined, `No WebPart_${EXPECTED.webPartId}.xml element manifest in the package`);
const componentText = componentXml === undefined ? '' : componentXml.bytes.toString('utf8');
const preconfiguredViews = (componentText.match(/&quot;view&quot;:&quot;([A-Za-z]+)&quot;/g) ?? []).map((match) => match.replace(/&quot;/g, '').split(':')[1]);
check(preconfiguredViews[0] === 'legacy', `The first toolbox entry presets view "${preconfiguredViews[0]}", expected "legacy"`);
check(preconfiguredViews.length === 9, `Expected nine toolbox entries (one per piece), found ${preconfiguredViews.length}`);
check(componentText.includes('ClientSideComponent Name="AI CoE Front Door"'), 'The component manifest lost the shipped web part name');

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
    forbiddenWordCounts: branding,
    dataContractMarkers: EXPECTED.requiredInBundle,
    preconfiguredViews
  },
  tests: testSummary,
  scope: 'Local build verification only: no tenant upload, deployment, SharePoint change or model call.',
  failures
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}: ${path.relative(root, outPath)}`);
for (const failure of failures) {
  console.error(` - ${failure}`);
}
process.exit(failures.length === 0 ? 0 : 1);

/**
 * @jest-environment node
 */
/**
 * Pins the release verifier (scripts/verify-package.mjs) and the evidence it writes: the package scan that
 * reads the tenant word list, the dependency inventory built from the lock file with the sixteen fields the
 * supply-chain inventory requires on every row (PV-47), the release version, and the exact dependency pins
 * that make the lock file the one description of the build.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TENANT_WORDS_PATH } from './tenantWords';

const ROOT: string = process.cwd();
const RELEASE: string = '1.0.0.16';
const script: string = fs.readFileSync(path.join(ROOT, 'scripts/verify-package.mjs'), 'utf8');

/** The sixteen `required_inventory_fields` of 13_SECURITY_AND_THREAT_MODEL/secrets-supply-chain.yaml, in its order. */
const REQUIRED_INVENTORY_FIELDS: string[] = [
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

/** The fields the lock file cannot fill; each carries the explicit token until the tenant inventory names them. */
const AWAITING_FIELDS: string[] = ['Provider', 'Owner', 'DataClasses', 'AllowedActions', 'Terms', 'Risk', 'LastValidatedAt', 'ExpiresAt', 'QualificationReceiptID', 'KillSwitch'];

interface IInventoryRow {
  [field: string]: string;
}

interface IInventory {
  release: string;
  source: string;
  lockSha256: string;
  fields: string[];
  components: IInventoryRow[];
}

interface ILockPackage {
  version: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
}

interface ILock {
  lockfileVersion: number;
  packages: { [key: string]: ILockPackage & { dependencies?: { [name: string]: string }; devDependencies?: { [name: string]: string } } };
}

interface IPackageJson {
  dependencies: { [name: string]: string };
  devDependencies: { [name: string]: string };
}

function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8')) as T;
}

function sha256(relative: string): string {
  return createHash('sha256').update(fs.readFileSync(path.join(ROOT, relative))).digest('hex');
}

describe('verify-package', () => {
  it('expects the release version and keeps the shipped identities and data-contract markers', () => {
    expect(script).toContain(`version: '${RELEASE}'`);
    expect(script).toContain("productId: 'f125ebdf-4a9d-4e6e-8479-3a18874e7752'");
    expect(script).toContain("featureId: '69ab84b7-608c-47ee-9623-af8ebaf2cb10'");
    expect(script).toContain("webPartId: 'cf2e5904-0703-4fe4-ae5a-ec012d6fa689'");
    expect(script).toContain("requiredInBundle: ['OVT-AICOE-', 'overture-ai-coe-front-door:draft:', 'overture-ai-coe-pilot', 'AI CoE Pilot Intakes']");
    // The three files bump together (CON-VERSION-BUMP).
    expect(readJson<{ solution: { version: string } }>('config/package-solution.json').solution.version).toBe(RELEASE);
    expect(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')).toContain(`## Deploy ${RELEASE}`);
  });

  it('counts the twelve toolbox entries of 1.0.0.16, the consolidated app first and the outcome record last', () => {
    // The packaged component manifest is what a site reads: the consolidated app first so a new instance opens
    // as one page, the legacy view next so an author can still place the shipped screen, then one entry per piece,
    // the content page and the outcome record last.
    expect(script).toMatch(/preconfiguredViews\.length === 12/);
    expect(script).toContain('Expected twelve toolbox entries');
    expect(script).toMatch(/preconfiguredViews\[0\] === 'app'/);
    expect(script).toMatch(/preconfiguredViews\[preconfiguredViews\.length - 1\] === 'outcome'/);
  });

  it('reads the forbidden words from the tenant word list and scans the bundle, the strings chunk and the packaged manifest', () => {
    expect(script).toContain(TENANT_WORDS_PATH);
    // No hard-coded word: the list is the one home of tenant words (CON-TENANT-NEUTRAL).
    expect(script).not.toMatch(/forbiddenInBundle:\s*\[\s*'[A-Za-z]/);
    expect(script).toMatch(/forbiddenInBundle/);
    for (const list of ['bundlePhrases', 'hosts', 'people', 'secretPatterns']) {
      expect(script).toContain(`'${list}'`);
    }
    expect(script).toMatch(/componentText/);
    expect(script).toMatch(/strings chunk/i);
  });

  it('asserts the package carries neither the tenant word list nor any of its entries', () => {
    expect(script).toMatch(/basename\([^)]*\)\s*===\s*'tenantWords\.json'/);
    expect(script).toMatch(/contains the tenant word list/);
    // Every entry of the archive is scanned, the two documented exemptions are named in the evidence record.
    expect(script).toMatch(/packageScan/);
    expect(script).toContain("'caseIds'");
    expect(script).toContain('DeveloperProperties');
    expect(script).toMatch(/exempt/);
  });

  it('applies the client words to every archive entry, exempting only the documented identifiers', () => {
    expect(script).toMatch(/forbiddenInPackage: \['clientWords', 'bundlePhrases', 'hosts', 'people', 'caseIds', 'secretPatterns'\]/);
    // The identifiers that carry the vendor word by contract are masked before the client-word scan, nothing else is.
    expect(script).toMatch(/DOCUMENTED_IDENTIFIERS/);
    expect(script).toMatch(/list === 'clientWords'/);
    for (const identifier of ['overture-ai-coe-front-door-client-side-solution', 'overture-ai-coe-front-door:draft:', 'overture-ai-coe-front-door', 'overture-ai-coe-pilot', 'overture-confirm-title']) {
      expect(script).toContain(identifier);
    }
    // The shipped stylesheet classes come from the parity baseline, never from a list written by hand.
    expect(script).toContain('parity/theme.1.0.0.7.css');
    expect(script).not.toMatch(/'overture-(app|input|btn-primary)'/);
  });

  it('writes the dependency inventory from the lock file with the sixteen required fields on every row', () => {
    expect(script).toContain('package-lock.json');
    expect(script).toContain('evidence/dependency-inventory.json');
    expect(script).toContain('AWAITING_TENANT_INVENTORY');
    for (const field of REQUIRED_INVENTORY_FIELDS) {
      expect(script).toContain(`'${field}'`);
    }
    const inventory: IInventory = readJson<IInventory>('evidence/dependency-inventory.json');
    expect(inventory.release).toBe(RELEASE);
    expect(inventory.source).toBe('package-lock.json');
    expect(inventory.lockSha256).toBe(sha256('package-lock.json'));
    expect(inventory.fields).toEqual(REQUIRED_INVENTORY_FIELDS);
    expect(inventory.components.length).toBeGreaterThan(0);
    const lock: ILock = readJson<ILock>('package-lock.json');
    const ids: string[] = [];
    for (const row of inventory.components) {
      expect(Object.keys(row)).toEqual(REQUIRED_INVENTORY_FIELDS);
      for (const field of REQUIRED_INVENTORY_FIELDS) {
        expect({ id: row.ComponentID, field, value: row[field] }).toEqual({ id: row.ComponentID, field, value: expect.stringMatching(/\S/) });
      }
      expect(row.ComponentID).toBe(`npm:${row.Name}@${row.Version}`);
      expect(row.Class).toBe('LIBRARY');
      expect(row.Environment).toBe('portable-build');
      // Source is the lock's resolved URL and integrity, so the row names one artifact.
      expect(row.Source).toMatch(/^https:\/\/\S+ (sha512|sha256|sha1)-\S+$/);
      for (const field of AWAITING_FIELDS) {
        expect({ id: row.ComponentID, field, value: row[field] }).toEqual({ id: row.ComponentID, field, value: 'AWAITING_TENANT_INVENTORY' });
      }
      ids.push(row.ComponentID);
    }
    expect(ids.slice().sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    // Every runtime package of the lock is a row, and no development-only package is.
    const runtime: string[] = [];
    for (const key of Object.keys(lock.packages)) {
      const entry: ILockPackage = lock.packages[key];
      if (key.length > 0 && entry.dev !== true) {
        const name: string = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
        runtime.push(`npm:${name}@${entry.version}`);
      }
    }
    expect(ids).toEqual(runtime.filter((id: string, index: number): boolean => runtime.indexOf(id) === index).sort());
    const packageJson: IPackageJson = readJson<IPackageJson>('package.json');
    for (const name of Object.keys(packageJson.dependencies)) {
      expect(ids).toContain(`npm:${name}@${packageJson.dependencies[name]}`);
    }
  });

  it('records the inventory hash and a clean run in the verification record', () => {
    interface IRecord {
      package: { version: string };
      dependencyInventory: { path: string; sha256: string; components: number };
      packageScan: { lists: string[]; exempt: string[]; findings: string[] };
      failures: string[];
    }
    const record: IRecord = readJson<IRecord>('evidence/port-verification.json');
    expect(record.package.version).toBe(RELEASE);
    expect(record.packageScan.lists).toEqual(['clientWords', 'bundlePhrases', 'hosts', 'people', 'caseIds', 'secretPatterns']);
    expect(record.packageScan.exempt).toHaveLength(3);
    expect(record.dependencyInventory.path).toBe('evidence/dependency-inventory.json');
    expect(record.dependencyInventory.sha256).toBe(sha256('evidence/dependency-inventory.json'));
    expect(record.dependencyInventory.components).toBe(readJson<IInventory>('evidence/dependency-inventory.json').components.length);
    expect(record.packageScan.findings).toEqual([]);
    expect(record.failures).toEqual([]);
  });

  it('pins every dependency exactly and the lock resolves the same versions', () => {
    const packageJson: IPackageJson = readJson<IPackageJson>('package.json');
    const lock: ILock = readJson<ILock>('package-lock.json');
    expect(lock.lockfileVersion).toBe(3);
    for (const group of ['dependencies', 'devDependencies'] as const) {
      const declared: { [name: string]: string } = packageJson[group];
      expect(Object.keys(declared).length).toBeGreaterThan(0);
      for (const name of Object.keys(declared)) {
        expect({ name, range: declared[name] }).toEqual({ name, range: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
        expect({ name, resolved: lock.packages[`node_modules/${name}`]?.version }).toEqual({ name, resolved: declared[name] });
      }
      expect(lock.packages[''][group]).toEqual(declared);
    }
  });
});

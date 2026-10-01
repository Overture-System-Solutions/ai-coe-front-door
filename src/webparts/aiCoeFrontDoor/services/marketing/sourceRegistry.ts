/**
 * The permission-aware source retrieval seam: where a run gets the register it may read, the approval recorded
 * for it, the revocations since, and the excerpt of each source at its pinned version.
 *
 * Two adapters ship. `SyntheticSourceRegistry` serves the fixture register with fixture excerpts and a fixture
 * approval whose `source` says so; the gate accepts it only in synthetic mode. `UnboundBusinessSourceRegistry`
 * answers every call with the reasons the business route is closed: no approved, versioned, retained register has
 * been supplied and no store holds its approval receipt (LIVE_BINDINGS_REQUIRED.md, item 3). Neither adapter lets
 * the payload name a register or a source that the adapter did not return.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { FIXTURE_MEETING_NOTES, FIXTURE_REGISTER } from '../../content/marketing/sourceRegister';
import type { ISourceEntry, ISourceRef, ISourceRegister } from '../../content/marketing/sourceRegister';
import { checkSourceSet, qualifyRegister, registerSnapshotHash } from '../../content/marketing/sourceGate';
import type { IMarketingArtifactEnvelopeV1 } from '../../content/marketing/artifactEnvelope';
import type { IRegisterApprovalEvidence, RegisterMode } from '../../content/marketing/sourceGate';
import type { IPermittedSourceExcerpt } from './providers';

export interface IRegisterReadback {
  register: ISourceRegister;
  /** The approval as read back from the store; undefined when none exists. */
  evidence?: IRegisterApprovalEvidence;
  /** Source ids revoked since the snapshot, as the store records them. */
  revoked: string[];
  /** Where the retained snapshot lives, for the envelope to reference. */
  snapshotRef: string;
}

export type RegisterReadResult = { available: true; readback: IRegisterReadback } | { available: false; reasons: string[] };

export interface ISourceRegistry {
  readonly mode: RegisterMode;
  readRegister(): Promise<RegisterReadResult>;
  /** The excerpt of one permitted source at its pinned version; undefined when the source or version is not held. */
  readExcerpt(reference: ISourceRef, entry: ISourceEntry): Promise<IPermittedSourceExcerpt | undefined>;
  /** Marks a source as revoked from now on (synthetic only; a business registry records this in its store). */
  revoke?(sourceId: string): void;
}

/** The excerpts behind the fixture rows. Every line says it is invented. */
const FIXTURE_EXCERPTS: { [sourceId: string]: string } = {
  'FIXTURE-BRAND-001': 'Message house (fixture): the AI CoE reviews every request and says what is allowed before you start. Say what the thing does; avoid promises the tenant has not proved.',
  'FIXTURE-PRODUCT-002': 'Capability notes (fixture): anything sent through the front door is read by a person and its state is visible to the sender. Availability and security posture are not established here.',
  'FIXTURE-AUDIENCE-003': 'Segment notes (fixture): team leads who have not asked for anything yet; people who tried an AI tool once and stopped. No adoption figure is established.',
  'FIXTURE-MEETING-004': FIXTURE_MEETING_NOTES
};

export class SyntheticSourceRegistry implements ISourceRegistry {
  public readonly mode: RegisterMode = 'synthetic';
  private readonly _register: ISourceRegister;
  private readonly _revoked: string[] = [];
  private readonly _excerpts: { [sourceId: string]: string };

  public constructor(register: ISourceRegister = FIXTURE_REGISTER, excerpts: { [sourceId: string]: string } = FIXTURE_EXCERPTS) {
    this._register = register;
    this._excerpts = excerpts;
  }

  public async readRegister(): Promise<RegisterReadResult> {
    const snapshotHash: string | undefined = await registerSnapshotHash(this._register);
    if (snapshotHash === undefined) {
      return { available: false, reasons: ['The platform offers no SHA-256 digest, so the fixture snapshot cannot be bound.'] };
    }
    const evidence: IRegisterApprovalEvidence = {
      receiptId: 'FIXTURE-APPROVAL-RECEIPT',
      registerId: this._register.registerId,
      registerVersion: this._register.version,
      snapshotHash,
      approvedByBindingRef: 'fixture:register-owner (synthetic)',
      approvedAt: `${this._register.asOf}T00:00:00Z`,
      expiresAt: '2099-01-01T00:00:00Z',
      source: 'syntheticFixture'
    };
    return { available: true, readback: { register: this._register, evidence, revoked: this._revoked.slice(), snapshotRef: `synthetic:register:${this._register.registerId}@${this._register.version}` } };
  }

  public async readExcerpt(reference: ISourceRef, entry: ISourceEntry): Promise<IPermittedSourceExcerpt | undefined> {
    if (entry.id !== reference.sourceId || entry.versionOrETag !== reference.versionOrETag) {
      return undefined;
    }
    const excerpt: string | undefined = this._excerpts[entry.id];
    if (excerpt === undefined) {
      return undefined;
    }
    return { sourceId: entry.id, versionOrETag: entry.versionOrETag, locator: `${entry.location}#excerpt`, excerpt, mayNotProve: entry.mayNotProve };
  }

  public revoke(sourceId: string): void {
    if (this._revoked.indexOf(sourceId) < 0) {
      this._revoked.push(sourceId);
    }
  }
}

/** Re-read source approval, revocations, versions and access; hashes alone do not prove current permission. */
export async function validateEnvelopeSources(registry: ISourceRegistry, envelope: IMarketingArtifactEnvelopeV1, now: Date, audience: string = 'Local testing only'): Promise<boolean> {
  const read: RegisterReadResult = await registry.readRegister();
  if (!read.available) return false;
  const { register, evidence, revoked } = read.readback;
  const qualified = await qualifyRegister(register, { mode: registry.mode, now, evidence });
  if (!qualified.usable || qualified.snapshotHash !== envelope.registerSnapshot.snapshotHash) return false;
  const access = checkSourceSet(register, envelope.sourcesUsed, { callerId: envelope.createdBy, purpose: envelope.kind, audience, now, revoked });
  if (access.gaps.length > 0) return false;
  for (const reference of access.usable) {
    const entry = register.entries.filter(candidate => candidate.id === reference.sourceId)[0];
    if (entry === undefined || await registry.readExcerpt(reference, entry) === undefined) return false;
  }
  return true;
}

export const BUSINESS_REGISTER_REASONS: readonly string[] = [
  'No approved, versioned, retained permitted-source register has been supplied by the Marketing owner.',
  'No store holds an authenticated approval receipt for a register snapshot.',
  'The activation package\'s own source register is documentary provenance, not an operational allowlist.'
];

export class UnboundBusinessSourceRegistry implements ISourceRegistry {
  public readonly mode: RegisterMode = 'business';

  public async readRegister(): Promise<RegisterReadResult> {
    return { available: false, reasons: BUSINESS_REGISTER_REASONS.slice() };
  }

  public async readExcerpt(): Promise<IPermittedSourceExcerpt | undefined> {
    return undefined;
  }
}

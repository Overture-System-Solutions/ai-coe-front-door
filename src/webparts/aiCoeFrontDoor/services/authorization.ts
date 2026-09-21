/**
 * The capability gate: what the signed-in person may ask the server for, decided before the request is made.
 *
 * Why this exists. Until now a protected surface was a separate SharePoint page, and SharePoint's own item
 * permissions on that page were the control: an unauthorized person could not open it, so its pieces never ran and
 * never called a list. The consolidated view puts those surfaces in one page as internal sections, which removes
 * that control entirely. A tab left undrawn is not authorization. So the bundle now refuses the call itself: every
 * capability names the roles that may use it, and a denied caller gets a result, not a request.
 *
 * What this is NOT. This is a client-side gate and it cannot be the boundary, because the person controls the
 * client. It stops the honest cases - a section that should not have loaded, a link pasted between colleagues, a
 * stale tab after a group change - and it keeps unauthorized data out of the page. The boundary stays where it has
 * always been: item-level security on the lists (`ReadSecurity 2`) and the permissions the provisioning script
 * applies. A capability allowed here still returns only the rows the server is willing to hand out.
 *
 * Fail closed. An unresolved membership never widens a capability. The resolver already refuses to widen on a failed
 * read; this gate additionally refuses every capability that needs a role beyond employee while the membership is
 * unresolved, so a refused group read shows "cannot confirm" rather than an operator's queue.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { RoleId } from '../content/roles';
import type { IRoleResolution } from './roleResolver';
import { includes } from '../utils/collections';

/** The things a caller can ask for that are not open to everyone. */
export type Capability =
  | 'readOwnRequests'
  | 'submitRequest'
  | 'recordOutcome'
  | 'readAdminQueue'
  | 'readUsageTelemetry'
  | 'readProgramMeasures'
  | 'draftCampaignBrief'
  | 'draftContentPlan'
  | 'draftMeetingFollowThrough'
  | 'decideMarketingReview';

export const CAPABILITIES: readonly Capability[] = [
  'readOwnRequests',
  'submitRequest',
  'recordOutcome',
  'readAdminQueue',
  'readUsageTelemetry',
  'readProgramMeasures',
  'draftCampaignBrief',
  'draftContentPlan',
  'draftMeetingFollowThrough',
  'decideMarketingReview'
];

/**
 * The roles each capability accepts. `employee` means everyone signed in, which is the only case that survives an
 * unresolved membership. Anything naming a narrower role is refused until the membership is known.
 *
 * `readAdminQueue` deliberately does not accept `leader`: the queue carries other people's request text, and a
 * leader is given the measured view instead. `decideMarketingReview` is the only write a role other than the
 * submitter may make, and it is held to the two roles the Marketing playbook names as approvers.
 */
const ALLOWED: { [capability in Capability]: readonly RoleId[] } = {
  readOwnRequests: ['employee'],
  submitRequest: ['employee'],
  recordOutcome: ['employee'],
  readAdminQueue: ['operator'],
  readUsageTelemetry: ['operator'],
  readProgramMeasures: ['leader', 'operator'],
  draftCampaignBrief: ['operator', 'designAuthority'],
  draftContentPlan: ['operator', 'designAuthority'],
  draftMeetingFollowThrough: ['operator', 'designAuthority'],
  decideMarketingReview: ['operator', 'designAuthority']
};

/** Why a capability was refused, in words a page may show without naming a group or a permission level. */
export type DenialReason = 'notInRole' | 'membershipUnresolved';

export interface IAllowed {
  allowed: true;
}

export interface IDenied {
  allowed: false;
  reason: DenialReason;
  /** The message a section shows in place of its content; it never names the group or the role that would pass. */
  message: string;
}

export type IDecision = IAllowed | IDenied;

const ALLOW: IAllowed = { allowed: true };

const NOT_IN_ROLE: string = 'This part of the front door is not available to you. Ask the AI CoE if you think it should be.';
const UNRESOLVED: string =
  'Your access could not be confirmed, so this part of the front door is closed. Reload the page; if it stays closed, ask the AI CoE.';

/** True when the capability is open to everyone signed in, so an unresolved membership cannot narrow it. */
export function isOpenToEveryone(capability: Capability): boolean {
  return includes(ALLOWED[capability], 'employee' as RoleId);
}

/**
 * Whether this person may use this capability. The decision reads only the resolution handed in: it makes no
 * request of its own, so a section can ask before it renders and before any service is touched.
 */
export function decide(capability: Capability, resolution: IRoleResolution): IDecision {
  if (isOpenToEveryone(capability)) {
    return ALLOW;
  }
  if (resolution.resolution === 'unresolved') {
    return { allowed: false, reason: 'membershipUnresolved', message: UNRESOLVED };
  }
  const permitted: readonly RoleId[] = ALLOWED[capability];
  const held: boolean = resolution.roles.filter((role: RoleId): boolean => includes(permitted, role)).length > 0;
  return held ? ALLOW : { allowed: false, reason: 'notInRole', message: NOT_IN_ROLE };
}

/** The roles a capability accepts, for a test or an operator page to read; never used to widen a decision. */
export function rolesFor(capability: Capability): readonly RoleId[] {
  return ALLOWED[capability];
}

/**
 * The shape a gated call gives back when it was refused: the same shape the data services already use for a
 * failure, so a caller handles a denial exactly as it handles a refused read and no caller learns a new path.
 */
export interface IRefused {
  state: 'denied';
  reason: DenialReason;
  message: string;
}

export function refuse(decision: IDenied): IRefused {
  return { state: 'denied', reason: decision.reason, message: decision.message };
}

/**
 * Runs `call` only when the capability is allowed. The point is the negative case: when it is not allowed the
 * function is never invoked, so no request leaves the browser and no unauthorized row can reach the page even if a
 * later change forgot to hide the section.
 */
export async function gated<T>(
  capability: Capability,
  resolution: IRoleResolution,
  call: () => Promise<T>
): Promise<T | IRefused> {
  const decision: IDecision = decide(capability, resolution);
  if (!decision.allowed) {
    return refuse(decision);
  }
  return call();
}

/** True when a gated result is the refusal rather than the service's own answer. */
export function isRefused(value: unknown): value is IRefused {
  return value !== null && typeof value === 'object' && (value as IRefused).state === 'denied' && typeof (value as IRefused).reason === 'string';
}

/**
 * The truth-state vocabulary: the five states a page shows for a route, tool or record, the activation
 * codes an operator may write behind them, the plain wording of every request status, and the
 * placeholders a measure shows instead of a number. Labels and definitions are data (the playbook's
 * words) and a content document may override them through its `vocabulary` section.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { IBranding } from '../branding/branding';
import type { IVocabulary, PagePlane } from './pageContent';
import { includes } from '../utils/collections';

export type TruthStateKey = 'availableNow' | 'draftOnly' | 'needsApproval' | 'needsAccess' | 'notSupported';
export const TRUTH_STATE_KEYS: readonly TruthStateKey[] = ['availableNow', 'draftOnly', 'needsApproval', 'needsAccess', 'notSupported'];

/** The colour of a state pill; the traffic-light tones plus blue for a draft. */
export type TruthTone = 'green' | 'blue' | 'amber' | 'red';

/** Whoever the definition is shown for; only the organization label is read. */
export type BrandingLabels = Pick<IBranding, 'organizationLabel'>;

export interface ITruthState {
  key: TruthStateKey;
  label: string;
  /** The playbook definition with `{organization}` filled in from the branding. */
  definition(branding: BrandingLabels | undefined): string;
  /** Name of a shipped icon (see pageIcons.ts). */
  icon: string;
  tone: TruthTone;
}

const ORGANIZATION_TOKEN: RegExp = /\{organization\}/g;
const DEFAULT_ORGANIZATION_LABEL: string = 'the organization';

/** Fills the `{organization}` token of a label or definition. */
export function fillOrganization(text: string, branding: BrandingLabels | undefined): string {
  const label: string = branding === undefined ? DEFAULT_ORGANIZATION_LABEL : branding.organizationLabel;
  return text.replace(ORGANIZATION_TOKEN, label);
}

interface ITruthStateDefault {
  key: TruthStateKey;
  label: string;
  definition: string;
  icon: string;
  tone: TruthTone;
}

// The definitions are the playbook's lines; "tenant" is rendered as "{organization} environment".
const TRUTH_STATE_DEFAULTS: readonly ITruthStateDefault[] = [
  { key: 'availableNow', label: 'Available now', definition: 'proved in the current {organization} environment and permitted for this person.', icon: 'CircleCheck', tone: 'green' },
  { key: 'draftOnly', label: 'Draft only', definition: 'the output is prepared but has not been sent, posted or published.', icon: 'Save', tone: 'blue' },
  { key: 'needsApproval', label: 'Needs approval', definition: 'a named person must decide.', icon: 'Clock3', tone: 'amber' },
  { key: 'needsAccess', label: 'Needs access', definition: 'the source or tool is not currently available to this person.', icon: 'ShieldAlert', tone: 'amber' },
  { key: 'notSupported', label: 'Not supported', definition: 'use the stated fallback; do not improvise.', icon: 'X', tone: 'red' }
];

function truthStateDefault(key: TruthStateKey): ITruthStateDefault {
  return TRUTH_STATE_DEFAULTS.filter((state: ITruthStateDefault): boolean => state.key === key)[0];
}

function overrideText(vocabulary: IVocabulary | undefined, key: TruthStateKey, field: 'label' | 'definition'): string | undefined {
  const entry: { label?: string; definition?: string } | undefined = vocabulary === undefined ? undefined : vocabulary.truthStates[key];
  const text: string | undefined = entry === undefined ? undefined : entry[field];
  return text === undefined || text === '' ? undefined : text;
}

/** The label of a truth state, as the document vocabulary overrides it. */
export function truthStateLabel(key: TruthStateKey, vocabulary?: IVocabulary): string {
  return overrideText(vocabulary, key, 'label') ?? truthStateDefault(key).label;
}

/** The definition of a truth state with the organization filled in, as the document vocabulary overrides it. */
export function truthStateDefinition(key: TruthStateKey, branding: BrandingLabels | undefined, vocabulary?: IVocabulary): string {
  return fillOrganization(overrideText(vocabulary, key, 'definition') ?? truthStateDefault(key).definition, branding);
}

/** The five states in the playbook's order. */
export const TRUTH_STATES: readonly ITruthState[] = TRUTH_STATE_DEFAULTS.map(
  (state: ITruthStateDefault): ITruthState => ({
    key: state.key,
    label: state.label,
    definition: (branding: BrandingLabels | undefined): string => fillOrganization(state.definition, branding),
    icon: state.icon,
    tone: state.tone
  })
);

/** The truth state with that key. */
export function truthState(key: TruthStateKey): ITruthState {
  return TRUTH_STATES.filter((state: ITruthState): boolean => state.key === key)[0];
}

/** Activation codes an operator writes behind a route or capability. */
export type ActivationCode = 'DESIGNED' | 'QUALIFIED' | 'AVAILABLE' | 'ACTIVE' | 'PAUSED' | 'RETIRED';
export const ACTIVATION_STATES: readonly ActivationCode[] = ['DESIGNED', 'QUALIFIED', 'AVAILABLE', 'ACTIVE', 'PAUSED', 'RETIRED'];

export type StateCode = TruthStateKey | ActivationCode;

const COMING_LABEL: string = 'Coming: not yet enabled';
const PAUSED_LABEL: string = 'Paused';

/** A truth-state key or an activation code, trimmed; undefined for anything else. */
export function readState(value: unknown): StateCode | undefined {
  const text: string = typeof value === 'string' ? value.trim() : '';
  if (includes(TRUTH_STATE_KEYS, text as TruthStateKey)) {
    return text as TruthStateKey;
  }
  return includes(ACTIVATION_STATES, text as ActivationCode) ? (text as ActivationCode) : undefined;
}

/** What an activation code says to a person; a retired one says nothing and is not rendered. */
export function activationLabel(code: ActivationCode, vocabulary?: IVocabulary): string | undefined {
  switch (code) {
    case 'DESIGNED':
    case 'QUALIFIED':
      return COMING_LABEL;
    case 'AVAILABLE':
    case 'ACTIVE':
      return truthStateLabel('availableNow', vocabulary);
    case 'PAUSED':
      return PAUSED_LABEL;
    default:
      return undefined;
  }
}

/** The three chrome pills a page draws beside a fact: an illustrative item, a stale one, one still awaiting its source. */
export type ChromePillKey = 'example' | 'needsRefresh' | 'awaitingSource';

export interface IChromePill {
  key: ChromePillKey;
  label: string;
  /** Name of a shipped icon (see pageIcons.ts). */
  icon: string;
  tone: TruthTone;
}

export const CHROME_PILLS: readonly IChromePill[] = [
  { key: 'example', label: 'Example', icon: 'Info', tone: 'blue' },
  { key: 'needsRefresh', label: 'Needs refresh', icon: 'RefreshCw', tone: 'amber' },
  { key: 'awaitingSource', label: 'Awaiting source', icon: 'Clock3', tone: 'amber' }
];

/** The chrome pill with that key. */
export function chromePill(key: ChromePillKey): IChromePill {
  return CHROME_PILLS.filter((pill: IChromePill): boolean => pill.key === key)[0];
}

/** The label of a chrome pill, as the document vocabulary overrides it; a blank keeps the default. */
export function chromeLabel(key: ChromePillKey, vocabulary?: IVocabulary): string {
  const override: string | undefined = vocabulary === undefined ? undefined : vocabulary.chrome[key];
  return override === undefined || override === '' ? chromePill(key).label : override;
}

/** The four status words the pilot intake list carries today. */
export const PILOT_STATUSES: readonly string[] = ['Submitted - Pilot', 'In Review - Pilot', 'Closed - Pilot', 'Test Failed'];

/** The 26 canonical status codes (reference Appendix D, in its order). */
export const CANONICAL_STATUS: readonly string[] = [
  'DRAFT',
  'CLARIFYING',
  'AWAITING_SOURCE',
  'AWAITING_SME',
  'AWAITING_OWNER',
  'AWAITING_PERMISSION',
  'READY_FOR_TRIAGE',
  'EVIDENCE_BUILDING',
  'NOT_DECISION_READY',
  'DECISION_READY',
  'READY_FOR_AI_COE',
  'READY_FOR_ARB',
  'READY_FOR_ELT',
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'DEFERRED',
  'REJECTED',
  'PROJECT_ACTIVATING',
  'IN_DELIVERY',
  'AT_RISK',
  'BLOCKED',
  'VALUE_REVIEW',
  'OPERATING',
  'IMPROVEMENT_PROPOSED',
  'REVALIDATION_REQUIRED',
  'RETIRED'
];

export const STATUS_UNAVAILABLE: string = 'Status unavailable';

const RECEIVED: string = 'Received';
const IN_REVIEW: string = 'In review';
const CLOSED: string = 'Closed';
const NEEDS_ATTENTION: string = 'Needs attention';
const WAITING: string = 'Waiting on someone else';
const READY_FOR_DECISION: string = 'Ready for a decision';
const DECIDED: string = 'Decided';
const UNDER_WAY: string = 'Under way';
const IN_USE: string = 'In use';

/** Plain wording per status code, user plane. */
const PLAIN_REQUEST_STATUS: { [code: string]: string } = {
  'Submitted - Pilot': RECEIVED,
  READY_FOR_TRIAGE: RECEIVED,
  'In Review - Pilot': IN_REVIEW,
  EVIDENCE_BUILDING: IN_REVIEW,
  NOT_DECISION_READY: IN_REVIEW,
  DECISION_READY: IN_REVIEW,
  'Closed - Pilot': CLOSED,
  RETIRED: CLOSED,
  'Test Failed': NEEDS_ATTENTION,
  BLOCKED: NEEDS_ATTENTION,
  DRAFT: 'Draft',
  CLARIFYING: 'We need a little more from you',
  AWAITING_SOURCE: WAITING,
  AWAITING_SME: WAITING,
  AWAITING_OWNER: WAITING,
  AWAITING_PERMISSION: WAITING,
  READY_FOR_AI_COE: READY_FOR_DECISION,
  READY_FOR_ARB: READY_FOR_DECISION,
  READY_FOR_ELT: READY_FOR_DECISION,
  APPROVED: DECIDED,
  APPROVED_WITH_CONDITIONS: DECIDED,
  DEFERRED: DECIDED,
  REJECTED: DECIDED,
  PROJECT_ACTIVATING: UNDER_WAY,
  IN_DELIVERY: UNDER_WAY,
  AT_RISK: 'Under way, at risk',
  VALUE_REVIEW: IN_USE,
  OPERATING: IN_USE,
  IMPROVEMENT_PROPOSED: IN_USE,
  REVALIDATION_REQUIRED: 'Needs a re-check'
};

function lookup(map: { [code: string]: string }, code: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, code) ? map[code] : undefined;
}

/** The plain wording of a request status; the document vocabulary may rename a code; anything unknown is unavailable. */
export function toPlainRequestStatus(status: unknown, vocabulary?: IVocabulary): string {
  const code: string = typeof status === 'string' ? status.trim() : '';
  if (code === '') {
    return STATUS_UNAVAILABLE;
  }
  const override: string | undefined = vocabulary === undefined ? undefined : lookup(vocabulary.requestStatuses, code);
  return override ?? lookup(PLAIN_REQUEST_STATUS, code) ?? STATUS_UNAVAILABLE;
}

/** The plain wording, with the code appended on the operator plane. */
export function describeRequestStatus(status: unknown, plane: PagePlane, vocabulary?: IVocabulary): string {
  const code: string = typeof status === 'string' ? status.trim() : '';
  const plain: string = toPlainRequestStatus(code, vocabulary);
  return plane === 'operator' && code !== '' ? `${plain} (${code})` : plain;
}

/** The states a program measure can be in. */
export type KpiState = 'MEASURED' | 'NOT_ESTABLISHED' | 'PENDING_BASELINE' | 'NOT_AVAILABLE' | 'INSUFFICIENT_VOLUME';
export const KPI_STATES: readonly KpiState[] = ['MEASURED', 'NOT_ESTABLISHED', 'PENDING_BASELINE', 'NOT_AVAILABLE', 'INSUFFICIENT_VOLUME'];

/** What a measure shows instead of a number; a measured state shows the number itself. */
export const KPI_PLACEHOLDERS: { [code: string]: string } = {
  NOT_ESTABLISHED: 'Not established',
  PENDING_BASELINE: 'Pending baseline',
  NOT_AVAILABLE: 'Not available',
  INSUFFICIENT_VOLUME: 'Not shown: group too small'
};

/** The text of a measure: the number when measured and present, otherwise the placeholder; a blank never becomes zero. */
export function kpiPlaceholderLabel(state: unknown, value: unknown): string {
  const code: string = typeof state === 'string' ? state.trim() : '';
  if (code === 'MEASURED') {
    return typeof value === 'number' && isFinite(value) ? String(value) : KPI_PLACEHOLDERS.NOT_AVAILABLE;
  }
  return lookup(KPI_PLACEHOLDERS, code) ?? KPI_PLACEHOLDERS.NOT_AVAILABLE;
}

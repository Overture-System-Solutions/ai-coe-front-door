import { CORRECTION_CATEGORIES, OUTCOME_COLUMNS, OUTCOME_TASK_TYPES, OUTCOME_VALUES, OUTCOME_WORKFLOW_VERSION, REVIEW_STATES, ROUTE_AVAILABILITY } from '../content/workflows/outcome';

export interface IOutcomeAggregationOptions {
  expectedScope: { tenant: string; site: string; list: string; cohort: string };
  /** SHA-256 of the exact source bytes, computed by the offline CLI, not taken from the receipt. */
  sourceSha256: string;
  asOf: string;
}
export interface IObservedOutcomes {
  outcomes: { [choice: string]: number };
  correctionThemes: { [choice: string]: number };
  reviewStates: { [choice: string]: number };
  routeAvailability: { [choice: string]: number };
  reviewedOutputs: number;
  reviewedOutputPass?: number;
  materialCorrectionRate?: number;
}
export interface IOutcomeAggregationResult {
  status: 'review-required' | 'blocked' | 'suppressed';
  publication: 'manual-only';
  mode?: 'synthetic' | 'business';
  reasons: string[];
  unknown: string[];
  observed?: IObservedOutcomes;
  evidence?: { sourceReceipt: string; sourceSha256: string; methodApproval: string; privacyApproval: string; periodStart: string; periodEnd: string };
  reconciliation?: { input: number; unique: number; duplicates: number };
}
const UNKNOWN: readonly string[] = [
  'eligible-cohort', 'first-useful-outcome', 'repeat-useful-outcome', 'useful-safe-completion-rate',
  'median-time-to-useful-outcome', 'repeat-use-useful-completion-rate', 'baseline', 'cost', 'verified-savings',
  'honest-unavailable-behavior', 'unauthorized-consequential-action', 'uncertain-outcome-reconciled',
  'support-confidence', 'champion-teach-back'
];

type Fields = Record<string, unknown>;
function object(value: unknown): Fields {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {};
}
function exact(value: unknown, keys: readonly string[]): boolean {
  const record = object(value);
  return keys.length === Object.keys(record).length && keys.every(key => Object.prototype.hasOwnProperty.call(record, key));
}
function token(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}
function day(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) { return NaN; }
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? stamp : NaN;
}
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function sameScope(left: unknown, right: unknown): boolean {
  const keys = ['tenant', 'site', 'list', 'cohort'];
  return exact(left, keys) && exact(right, keys) && keys.every(key => token(object(left)[key]) && object(left)[key] === object(right)[key]);
}
function blocked(reason: string): IOutcomeAggregationResult {
  return { status: 'blocked', publication: 'manual-only', reasons: [reason], unknown: UNKNOWN.slice() };
}

/**
 * Qualification references are operator-supplied attestations, not authenticated signatures.
 * The CLI binds bytes; the separate commissioning procedure must establish who can attest.
 */
export function aggregateWorkflowOutcomes(source: unknown, qualification: unknown, options: IOutcomeAggregationOptions): IOutcomeAggregationResult {
  const data = object(source);
  const q = object(qualification);
  const receipt = object(q.sourceReceipt);
  const method = object(q.method);
  const privacy = object(q.privacy);
  const period = object(q.period);
  if (!exact(source, ['schemaVersion', 'scope', 'rows']) || data.schemaVersion !== 'workflow-outcomes-export.v1' || !Array.isArray(data.rows) ||
      !exact(qualification, ['schemaVersion', 'mode', 'scope', 'period', 'sourceReceipt', 'method', 'privacy', 'freshnessDays']) ||
      q.schemaVersion !== 'workflow-outcomes-qualification.v1' || (q.mode !== 'synthetic' && q.mode !== 'business')) {
    return blocked('Export or qualification schema invalid. No content is echoed.');
  }
  if (!sameScope(data.scope, options.expectedScope) || !sameScope(q.scope, options.expectedScope)) {
    return blocked('Source, receipt and expected scope must match exactly.');
  }
  if (!exact(receipt, ['reference', 'sha256', 'complete']) || !token(receipt.reference) || receipt.complete !== true ||
      typeof receipt.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.sha256) || receipt.sha256 !== options.sourceSha256 ||
      !exact(method, ['id', 'approvalRef']) || method.id !== 'content-free-outcomes-v1' || !token(method.approvalRef)) {
    return blocked('Complete trusted source receipt, byte binding and explicit method approval required.');
  }
  const start = day(period.start); const end = day(period.end); const asOf = day(options.asOf);
  if (!exact(period, ['start', 'end']) || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(asOf) ||
      start > end || end > asOf || !integer(q.freshnessDays) || asOf - end > q.freshnessDays * 86400000) {
    return blocked('Valid completed current observation period required.');
  }
  if (!exact(privacy, ['approvalRef', 'cohortSize', 'minimumCohort', 'minimumCellCohort']) || !token(privacy.approvalRef) ||
      !integer(privacy.cohortSize) || !integer(privacy.minimumCohort) || !integer(privacy.minimumCellCohort) || privacy.minimumCellCohort > privacy.cohortSize) {
    return blocked('People and cell privacy qualification required; task counts are not people.');
  }
  const byId = new Map<string, Record<string, string>>();
  for (const input of data.rows) {
    const r = object(input);
    const stamp = typeof r.RecordedAt === 'string' ? Date.parse(r.RecordedAt) : NaN;
    if (!exact(r, OUTCOME_COLUMNS) || OUTCOME_COLUMNS.some(key => typeof r[key] !== 'string') ||
        typeof r.OutcomeId !== 'string' || !/^OVT-AICOE-\d{8}-[A-Z0-9]{8}$/.test(r.OutcomeId) ||
        r.Title !== `Task outcome — ${r.OutcomeId}` || r.WorkflowVersion !== OUTCOME_WORKFLOW_VERSION ||
        !Number.isFinite(stamp) || new Date(stamp).toISOString() !== r.RecordedAt || stamp < start || stamp >= end + 86400000 ||
        OUTCOME_TASK_TYPES.indexOf(r.TaskType as string) < 0 || OUTCOME_VALUES.indexOf(r.Outcome as string) < 0 ||
        REVIEW_STATES.indexOf(r.ReviewState as string) < 0 || ROUTE_AVAILABILITY.indexOf(r.RouteAvailability as string) < 0 ||
        (r.Outcome === 'Corrected' ? CORRECTION_CATEGORIES.indexOf(r.CorrectionCategory as string) < 0 : r.CorrectionCategory !== '') ||
        ((r.Outcome === 'Accepted' || r.Outcome === 'Corrected') && r.ReviewState === 'Not reviewed')) {
      return blocked('Invalid content-free event, inconsistent review, or event outside the qualified period. Reconcile the export.');
    }
    const previous = byId.get(r.OutcomeId);
    if (previous && OUTCOME_COLUMNS.some(key => previous[key] !== r[key])) {
      return blocked('Conflicting duplicate identity. Reconcile source-native state before retry.');
    }
    byId.set(r.OutcomeId, r as Record<string, string>);
  }
  const rows = Array.from(byId.values());
  if (privacy.cohortSize > rows.length) { return blocked('Qualified distinct people exceed distinct task events.'); }
  const counts = (column: string, choices: readonly string[]): { [key: string]: number } => {
    const result: { [key: string]: number } = {};
    for (const choice of choices) { result[choice] = rows.filter(row => row[column] === choice).length; }
    return result;
  };
  const outcomes = counts('Outcome', OUTCOME_VALUES);
  const correctionThemes = counts('CorrectionCategory', CORRECTION_CATEGORIES);
  const reviewStates = counts('ReviewState', REVIEW_STATES);
  const routeAvailability = counts('RouteAvailability', ROUTE_AVAILABILITY);
  const reviewed = rows.filter(row => row.ReviewState !== 'Not reviewed' && (row.Outcome === 'Accepted' || row.Outcome === 'Corrected'));
  const accepted = reviewed.filter(row => row.Outcome === 'Accepted').length;
  const minimum = Math.max(5, privacy.minimumCohort);
  const minimumCell = privacy.minimumCellCohort;
  const cells = [outcomes, correctionThemes, reviewStates, routeAvailability].reduce<number[]>((all, group) => all.concat(Object.keys(group).map(key => group[key])), [reviewed.length, accepted, reviewed.length - accepted]);
  if (privacy.cohortSize < minimum || minimumCell < minimum || cells.some(count => count > 0 && count < minimumCell)) {
    return { status: 'suppressed', publication: 'manual-only', mode: q.mode, reasons: ['Whole report withheld: people or cell privacy threshold not met.'], unknown: UNKNOWN.slice() };
  }
  return {
    status: 'review-required', publication: 'manual-only', mode: q.mode,
    evidence: { sourceReceipt: receipt.reference, sourceSha256: receipt.sha256, methodApproval: method.approvalRef, privacyApproval: privacy.approvalRef, periodStart: period.start as string, periodEnd: period.end as string },
    reconciliation: { input: data.rows.length, unique: rows.length, duplicates: data.rows.length - rows.length },
    reasons: ['Descriptive task statistics only. Operator review and separate publication approval required.'],
    unknown: UNKNOWN.slice(), observed: {
      outcomes, correctionThemes, reviewStates, routeAvailability, reviewedOutputs: reviewed.length,
      ...(reviewed.length ? { reviewedOutputPass: accepted / reviewed.length, materialCorrectionRate: (reviewed.length - accepted) / reviewed.length } : {})
    }
  };
}

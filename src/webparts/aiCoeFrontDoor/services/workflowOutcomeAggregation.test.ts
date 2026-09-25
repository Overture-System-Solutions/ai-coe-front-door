import { aggregateWorkflowOutcomes } from './workflowOutcomeAggregation';
import { GovernanceService, OUTCOME_RECORDS_LIST_TITLE } from './GovernanceService';
import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';

const scope = { tenant: 'synthetic-tenant', site: 'synthetic-site', list: 'synthetic-outcomes', cohort: 'synthetic-cohort' };
const digest = 'a'.repeat(64);
const period = { start: '2026-09-01', end: '2026-09-20' };
function row(id: number, outcome: string = 'Accepted'): Record<string, unknown> {
  return {
    Title: `Task outcome — OVT-AICOE-20260910-${String(id).padStart(8, '0')}`,
    OutcomeId: `OVT-AICOE-20260910-${String(id).padStart(8, '0')}`,
    RecordedAt: '2026-09-10T12:00:00.000Z', TaskType: 'Drafting or writing', Outcome: outcome,
    ReviewState: 'Reviewed by me', CorrectionCategory: outcome === 'Corrected' ? 'fact' : '',
    RouteAvailability: 'Draft only', WorkflowVersion: '1.0'
  };
}
function fixture(): { source: Record<string, unknown>; qualification: any; options: any } {
  return {
    source: { schemaVersion: 'workflow-outcomes-export.v1', scope, rows: Array.from({ length: 10 }, (_, i) => row(i, i < 5 ? 'Accepted' : 'Corrected')) },
    qualification: {
      schemaVersion: 'workflow-outcomes-qualification.v1', mode: 'synthetic', scope, period,
      sourceReceipt: { reference: 'fixture-source', sha256: digest, complete: true },
      method: { id: 'content-free-outcomes-v1', approvalRef: 'fixture-method-only' },
      privacy: { approvalRef: 'fixture-privacy-only', cohortSize: 5, minimumCohort: 5, minimumCellCohort: 5 },
      freshnessDays: 30
    },
    options: { expectedScope: scope, sourceSha256: digest, asOf: '2026-09-23' }
  };
}

describe('content-free offline outcome aggregation', () => {
  it('consumes the existing writer fields after actual local save/readback, without a second tracker', async () => {
    const f = fixture();
    const store = new InMemoryListStore([OUTCOME_RECORDS_LIST_TITLE]);
    let sequence = 0;
    const service = new GovernanceService({ siteUrl: 'https://example.invalid/sites/fixture', user: { displayName: 'Synthetic', email: 'fixture@example.invalid' }, client: createFakeListClient(store), configuration: 'fixture' }, () => new Date('2026-09-10T12:00:00.000Z'), () => `OVT-AICOE-20260910-${String(sequence++).padStart(8, '0')}`);
    for (let i = 0; i < 5; i++) {
      expect((await service.submitOutcome({ taskType: 'Drafting or writing', outcome: 'Accepted', reviewState: 'Reviewed by me', routeAvailability: 'Draft only', prompt: 'PRIVATE-CONTENT-CANARY' })).state).toBe('saved');
    }
    f.source.rows = store.requests.filter(request => request.method === 'POST').map(request => request.body);
    const result = aggregateWorkflowOutcomes(f.source, f.qualification, f.options);
    expect(result.status).toBe('review-required');
    expect(result.observed?.outcomes.Accepted).toBe(5);
    expect(result.observed?.reviewedOutputPass).toBe(1);
    expect(JSON.stringify(f.source)).not.toContain('PRIVATE-CONTENT-CANARY');
  });

  it.each([
    ['missing qualification', (f: ReturnType<typeof fixture>) => { f.qualification = undefined; }],
    ['missing receipt', (f: ReturnType<typeof fixture>) => { delete f.qualification.sourceReceipt; }],
    ['untrusted receipt bytes', (f: ReturnType<typeof fixture>) => { f.qualification.sourceReceipt.sha256 = 'b'.repeat(64); }],
    ['incomplete export', (f: ReturnType<typeof fixture>) => { f.qualification.sourceReceipt.complete = false; }],
    ['string boolean', (f: ReturnType<typeof fixture>) => { f.qualification.sourceReceipt.complete = 'true'; }],
    ['missing method approval', (f: ReturnType<typeof fixture>) => { delete f.qualification.method.approvalRef; }],
    ['unrecognized method', (f: ReturnType<typeof fixture>) => { f.qualification.method.id = 'invented'; }],
    ['cross-scope export', (f: ReturnType<typeof fixture>) => { f.source.scope = { ...scope, tenant: 'another-tenant' }; }],
    ['cross-scope receipt', (f: ReturnType<typeof fixture>) => { f.qualification.scope = { ...scope, cohort: 'another-cohort' }; }],
    ['invalid date', (f: ReturnType<typeof fixture>) => { f.qualification.period = { start: '2026-02-30', end: period.end }; }],
    ['reversed period', (f: ReturnType<typeof fixture>) => { f.qualification.period = { start: period.end, end: period.start }; }],
    ['future period', (f: ReturnType<typeof fixture>) => { f.qualification.period = { ...period, end: '2026-10-01' }; }],
    ['stale period', (f: ReturnType<typeof fixture>) => { f.options.asOf = '2026-12-01'; }],
    ['privacy approval absent', (f: ReturnType<typeof fixture>) => { delete f.qualification.privacy.approvalRef; }],
    ['cohort unknown', (f: ReturnType<typeof fixture>) => { delete f.qualification.privacy.cohortSize; }],
    ['non-person exemption for task outcomes', (f: ReturnType<typeof fixture>) => { f.qualification.privacy = { kind: 'nonPerson' }; }],
    ['unexpected raw content', (f: ReturnType<typeof fixture>) => { f.qualification.prompt = 'PRIVATE-CONTENT-CANARY'; }]
  ])('blocks %s without publishing counts or reflecting input', (_name, mutate) => {
    const f = fixture(); mutate(f);
    const result = aggregateWorkflowOutcomes(f.source, f.qualification, f.options);
    expect(result.status).toBe('blocked');
    expect(result.observed).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('PRIVATE-CONTENT-CANARY');
  });

  it.each([
    ['invalid choice', { Outcome: 'PRIVATE-CONTENT-CANARY' }],
    ['missing choice', { TaskType: '' }],
    ['raw work content', { prompt: 'PRIVATE-CONTENT-CANARY' }],
    ['author data', { Author: 'PRIVATE-CONTENT-CANARY' }],
    ['unknown version', { WorkflowVersion: '2.0' }],
    ['invalid recorded day', { RecordedAt: '2026-02-30T12:00:00.000Z' }],
    ['before period', { RecordedAt: '2026-08-31T23:59:59.999Z' }],
    ['after period', { RecordedAt: '2026-09-21T00:00:00.000Z' }],
    ['unreviewed acceptance', { ReviewState: 'Not reviewed' }],
    ['unexpected category', { CorrectionCategory: 'fact' }],
    ['missing correction category', { Outcome: 'Corrected', CorrectionCategory: '' }],
    ['wrong identity format', { OutcomeId: ' private-id ' }]
  ])('rejects the entire export for %s rather than hiding invalid rows', (_name, changes) => {
    const f = fixture(); (f.source.rows as unknown[])[0] = { ...row(0), ...changes };
    const result = aggregateWorkflowOutcomes(f.source, f.qualification, f.options);
    expect(result.status).toBe('blocked');
    expect(result.observed).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('PRIVATE-CONTENT-CANARY');
  });

  it('deduplicates identical ids regardless of key order and refuses conflicting duplicates', () => {
    const f = fixture();
    const rows = f.source.rows as Array<Record<string, unknown>>;
    rows.push(Object.fromEntries(Object.entries(rows[0]).reverse()));
    let result = aggregateWorkflowOutcomes(f.source, f.qualification, f.options);
    expect(result.observed?.outcomes.Accepted).toBe(5);
    expect(result.reconciliation).toEqual({ input: 11, unique: 10, duplicates: 1 });
    rows.push({ ...row(0), Outcome: 'Stopped', ReviewState: 'Not reviewed' });
    result = aggregateWorkflowOutcomes(f.source, f.qualification, f.options);
    expect(result.status).toBe('blocked');
    expect(result.observed).toBeUndefined();
  });

  it.each([
    { cohortSize: 4, minimumCellCohort: 4 },
    { minimumCellCohort: 4 },
    { minimumCohort: 6 },
    { cohortSize: 1, minimumCellCohort: 1, minimumCohort: 1 }
  ])('withholds the whole report for a small or unsafely partitioned cohort %j', privacy => {
    const f = fixture(); Object.assign(f.qualification.privacy, privacy);
    const result = aggregateWorkflowOutcomes(f.source, f.qualification, f.options);
    expect(result.status).toBe('suppressed');
    expect(result.observed).toBeUndefined();
    expect(result.reconciliation).toBeUndefined();
  });

  it('blocks impossible people attestations and suppresses a tiny correction cell', () => {
    const f = fixture(); f.qualification.privacy.cohortSize = 11;
    expect(aggregateWorkflowOutcomes(f.source, f.qualification, f.options).status).toBe('blocked');
    f.qualification.privacy.cohortSize = 5;
    (f.source.rows as unknown[])[0] = { ...row(0, 'Corrected'), CorrectionCategory: 'brand' };
    expect(aggregateWorkflowOutcomes(f.source, f.qualification, f.options).status).toBe('suppressed');
  });

  it('keeps unavailable reports distinct from tested fallback and omits zero-denominator rates', () => {
    const f = fixture();
    f.source.rows = Array.from({ length: 5 }, (_, i) => ({ ...row(i, 'Unavailable'), ReviewState: 'Not reviewed' }));
    const result = aggregateWorkflowOutcomes(f.source, f.qualification, f.options);
    expect(result.observed?.outcomes.Unavailable).toBe(5);
    expect(result.observed?.reviewedOutputPass).toBeUndefined();
    expect(result.observed?.materialCorrectionRate).toBeUndefined();
    expect(result.unknown).toContain('honest-unavailable-behavior');
  });

  it('accepts timestamps through the inclusive end day and binds output evidence without raw rows', () => {
    const f = fixture();
    (f.source.rows as Array<Record<string, unknown>>).forEach(r => { r.RecordedAt = '2026-09-20T23:59:59.999Z'; });
    const result = aggregateWorkflowOutcomes(f.source, f.qualification, f.options);
    expect(result.status).toBe('review-required');
    expect(result.evidence).toEqual({ sourceReceipt: 'fixture-source', sourceSha256: digest, methodApproval: 'fixture-method-only', privacyApproval: 'fixture-privacy-only', periodStart: period.start, periodEnd: period.end });
  });

  it('computes only qualified observed task statistics and keeps unsupported scorecard claims unknown', () => {
    const { source, qualification, options } = fixture();
    const result = aggregateWorkflowOutcomes(source, qualification, options);
    expect(result.status).toBe('review-required');
    expect(result.mode).toBe('synthetic');
    expect(result.publication).toBe('manual-only');
    expect(result.observed).toMatchObject({
      outcomes: { Accepted: 5, Corrected: 5, Unavailable: 0, Stopped: 0 },
      correctionThemes: { fact: 5 }, reviewStates: { 'Reviewed by me': 10, 'Reviewed by someone else': 0, 'Not reviewed': 0 },
      routeAvailability: { 'Draft only': 10, 'Needs access': 0 }, reviewedOutputs: 10,
      reviewedOutputPass: 0.5, materialCorrectionRate: 0.5
    });
    expect(result.unknown).toEqual(expect.arrayContaining([
      'eligible-cohort', 'first-useful-outcome', 'repeat-useful-outcome',
      'useful-safe-completion-rate', 'median-time-to-useful-outcome', 'repeat-use-useful-completion-rate',
      'baseline', 'cost', 'verified-savings'
    ]));
    expect(JSON.stringify(result)).not.toContain('OVT-AICOE');
  });
});

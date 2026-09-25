import {
  buildCaseAnalysisRequest,
  CASE_ANALYSIS_QUESTION_LIMIT,
  CaseAnalysisError,
  caseAnalysisFailureText,
  ClaudeCaseAnalysisService,
  createCaseAnalysisService,
  DEFAULT_CASE_ANALYSIS_QUESTION,
  parseCaseAnalysisResponse
} from './caseAnalysisService';
import type { CaseAnalysisFailureKind, ICaseAnalysisResult } from './caseAnalysisService';
import type { IDraftHttpClient, IDraftHttpResponse } from './draftService';

const REQUEST_ID: string = 'analysis-0001';

function analysis(overrides: { [key: string]: unknown } = {}): { [key: string]: unknown } {
  return {
    summary: 'Two high-risk cases need a decision this week.',
    priorities: [
      { coeId: 'OVT-AICOE-20260920-AAAA1111', title: 'Ticket replies', whyItMatters: 'High risk and restricted data.', suggestedNextStep: 'Schedule the review.' }
    ],
    patterns: ['Most open cases wait on information.'],
    gaps: ['Two cases have no estimated cost.'],
    ...overrides
  };
}

function envelope(overrides: { [key: string]: unknown } = {}): string {
  return JSON.stringify({
    ok: true,
    schemaVersion: '1.0',
    requestId: REQUEST_ID,
    draftOnly: true,
    humanReviewRequired: true,
    provider: 'anthropic',
    model: 'claude-opus-5',
    responseId: 'msg_01',
    caseCount: 7,
    truncated: false,
    asOf: '2026-09-25T14:00:00Z',
    analysis: analysis(),
    ...overrides
  });
}

function kindOf(action: () => unknown): CaseAnalysisFailureKind | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof CaseAnalysisError ? error.kind : undefined;
  }
  return undefined;
}

function respond(status: number, body: string): () => Promise<IDraftHttpClient> {
  return async (): Promise<IDraftHttpClient> => ({
    post: jest.fn(async (): Promise<IDraftHttpResponse> => ({ ok: status < 300, status, text: async (): Promise<string> => body }))
  });
}

describe('case analysis request', () => {
  it('sends only the trimmed question under the flow contract', () => {
    expect(buildCaseAnalysisRequest('  Which cases first?  ', REQUEST_ID)).toEqual({
      schemaVersion: '1.0',
      workflowId: 'caseAnalysis',
      requestId: REQUEST_ID,
      demoDataOnly: true,
      question: 'Which cases first?'
    });
  });

  it('refuses a blank or over-long question before anything is sent', () => {
    expect(kindOf(() => buildCaseAnalysisRequest('   ', REQUEST_ID))).toBe('invalid-request');
    expect(kindOf(() => buildCaseAnalysisRequest('x'.repeat(CASE_ANALYSIS_QUESTION_LIMIT + 1), REQUEST_ID))).toBe('invalid-request');
    expect(buildCaseAnalysisRequest('x'.repeat(CASE_ANALYSIS_QUESTION_LIMIT), REQUEST_ID).question).toHaveLength(CASE_ANALYSIS_QUESTION_LIMIT);
  });

  it('starts from a suggested question inside the limit', () => {
    expect(DEFAULT_CASE_ANALYSIS_QUESTION.length).toBeLessThanOrEqual(CASE_ANALYSIS_QUESTION_LIMIT);
  });
});

describe('case analysis response', () => {
  it('reads a complete analysis with its provenance', () => {
    const result: ICaseAnalysisResult = parseCaseAnalysisResponse(200, envelope(), REQUEST_ID);
    expect(result.caseCount).toBe(7);
    expect(result.truncated).toBe(false);
    expect(result.analysis?.priorities[0].coeId).toBe('OVT-AICOE-20260920-AAAA1111');
    expect(result.provenance).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5',
      responseId: 'msg_01',
      requestId: REQUEST_ID,
      draftOnly: true,
      humanReviewRequired: true
    });
  });

  it('reads an empty portfolio as no analysis, and refuses an analysis of nothing', () => {
    expect(parseCaseAnalysisResponse(200, envelope({ caseCount: 0, analysis: null, model: '', responseId: '' }), REQUEST_ID).analysis).toBeUndefined();
    expect(kindOf(() => parseCaseAnalysisResponse(200, envelope({ caseCount: 0 }), REQUEST_ID))).toBe('invalid-response');
  });

  it('refuses an answer that drifted from the contract', () => {
    const drifted: { [key: string]: unknown }[] = [
      { ok: false },
      { schemaVersion: '2.0' },
      { requestId: 'someone-else' },
      { caseCount: -1 },
      { caseCount: 201 },
      { caseCount: 1.5 },
      { truncated: 'no' },
      { asOf: '' },
      { analysis: analysis({ summary: '   ' }) },
      { analysis: analysis({ priorities: new Array(11).fill(analysis().priorities) }) },
      { analysis: analysis({ priorities: [{ coeId: 'X', title: 'T', whyItMatters: '', suggestedNextStep: 'N' }] }) },
      { analysis: analysis({ priorities: [{ coeId: 'X'.repeat(41), title: 'T', whyItMatters: 'W', suggestedNextStep: 'N' }] }) },
      { analysis: analysis({ patterns: new Array(9).fill('p') }) },
      { analysis: analysis({ gaps: ['x'.repeat(601)] }) },
      { analysis: undefined }
    ];
    for (const overrides of drifted) {
      expect({ overrides, kind: kindOf(() => parseCaseAnalysisResponse(200, envelope(overrides), REQUEST_ID)) }).toEqual({ overrides, kind: 'invalid-response' });
    }
    expect(kindOf(() => parseCaseAnalysisResponse(200, 'not json', REQUEST_ID))).toBe('invalid-response');
  });

  it('names each failure the flow reports', () => {
    const failure = (code: string): string => JSON.stringify({ ok: false, error: { code, message: 'x' } });
    expect(kindOf(() => parseCaseAnalysisResponse(503, failure('CASES_UNAVAILABLE'), REQUEST_ID))).toBe('cases-unavailable');
    expect(kindOf(() => parseCaseAnalysisResponse(502, failure('AI_ANALYSIS_UNAVAILABLE'), REQUEST_ID))).toBe('unavailable');
    expect(kindOf(() => parseCaseAnalysisResponse(400, failure('INVALID_REQUEST'), REQUEST_ID))).toBe('invalid-request');
    expect(kindOf(() => parseCaseAnalysisResponse(413, failure('INPUT_TOO_LARGE'), REQUEST_ID))).toBe('too-large');
    expect(kindOf(() => parseCaseAnalysisResponse(403, '', REQUEST_ID))).toBe('unauthorized');
    expect(kindOf(() => parseCaseAnalysisResponse(404, '', REQUEST_ID))).toBe('not-found');
  });

  it('has words for every failure, none naming a status code', () => {
    const kinds: CaseAnalysisFailureKind[] = ['invalid-request', 'too-large', 'unauthorized', 'not-found', 'cases-unavailable', 'unavailable', 'invalid-response', 'network', 'not-permitted'];
    for (const kind of kinds) {
      expect(caseAnalysisFailureText(kind)).not.toMatch(/\b(400|401|403|404|413|502|503)\b/);
    }
  });
});

describe('case analysis service', () => {
  it('posts the request to the bound trigger and returns the checked answer', async () => {
    const post: jest.Mock = jest.fn(async (): Promise<IDraftHttpResponse> => ({ ok: true, status: 200, text: async (): Promise<string> => envelope() }));
    const service: ClaudeCaseAnalysisService = new ClaudeCaseAnalysisService('https://flow.invalid/analysis', async (): Promise<IDraftHttpClient> => ({ post }), (): string => REQUEST_ID);
    const result: ICaseAnalysisResult = await service.analyze('Which cases first?');
    expect(result.analysis?.summary).toContain('high-risk');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('https://flow.invalid/analysis');
    expect(JSON.parse(post.mock.calls[0][1])).toEqual({ schemaVersion: '1.0', workflowId: 'caseAnalysis', requestId: REQUEST_ID, demoDataOnly: true, question: 'Which cases first?' });
  });

  it('reports an unreachable flow as a network failure', async () => {
    const service: ClaudeCaseAnalysisService = new ClaudeCaseAnalysisService('https://flow.invalid/analysis', async (): Promise<IDraftHttpClient> => {
      throw new Error('offline');
    });
    await expect(service.analyze('Which cases first?')).rejects.toMatchObject({ kind: 'network' });
  });

  it('passes the flow failure through', async () => {
    const service: ClaudeCaseAnalysisService = new ClaudeCaseAnalysisService('https://flow.invalid/analysis', respond(503, JSON.stringify({ ok: false, error: { code: 'CASES_UNAVAILABLE' } })));
    await expect(service.analyze('Which cases first?')).rejects.toMatchObject({ kind: 'cases-unavailable' });
  });

  it('exists only when a trigger URL is bound', () => {
    const client = respond(200, envelope());
    expect(createCaseAnalysisService('', client)).toBeUndefined();
    expect(createCaseAnalysisService('   ', client)).toBeUndefined();
    expect(createCaseAnalysisService(undefined, client)).toBeUndefined();
    expect(createCaseAnalysisService('https://flow.invalid/analysis', client)).toBeInstanceOf(ClaudeCaseAnalysisService);
  });
});

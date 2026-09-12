import { IDEA_JOURNEY, journeyAnswers } from '../../../testing/journeys';
import { createBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import { IDEA_SUMMARY_FIELDS } from '../summaries/ideaSummary';
import type { IIdeaSummaryDraft } from '../summaries/ideaSummary';
import type { IAnswers, IWorkflowDefinition } from '../workflows/types';
import {
  buildIdeaDraftRequest,
  ClaudeDraftService,
  createIdeaDraftService,
  DraftServiceError,
  FLOW_SERVICE_RESOURCE,
  IDEA_DRAFT_ANSWER_KEYS,
  parseIdeaDraftResponse
} from './draftService';
import type { IDraftHttpClient, IDraftHttpResponse, IIdeaDraftRequest, IIdeaDraftResult } from './draftService';

const idea: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).idea;
const answers: IAnswers = journeyAnswers(IDEA_JOURNEY);

function draftFixture(prefix: string = 'AI'): IIdeaSummaryDraft {
  const draft: { [key: string]: string } = {};
  for (const field of IDEA_SUMMARY_FIELDS) {
    draft[field.key] = `${prefix} ${field.key}`;
  }
  return draft as IIdeaSummaryDraft;
}

function successBody(overrides: { [key: string]: unknown } = {}): string {
  return JSON.stringify({
    ok: true,
    schemaVersion: '1.0',
    requestId: 'draft-1',
    draftOnly: true,
    humanReviewRequired: true,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    responseId: 'msg_01ABC',
    draft: draftFixture(),
    ...overrides
  });
}

function response(status: number, body: string): IDraftHttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async (): Promise<string> => body };
}

function failure(run: () => unknown): DraftServiceError {
  try {
    run();
  } catch (error) {
    if (error instanceof DraftServiceError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected a DraftServiceError.');
}

describe('buildIdeaDraftRequest', () => {
  it('sends only the visible, answered fields the flow accepts', () => {
    const request: IIdeaDraftRequest = buildIdeaDraftRequest(idea, answers, 'draft-abc');
    expect(request.schemaVersion).toBe('1.0');
    expect(request.workflowId).toBe('idea');
    expect(request.requestId).toBe('draft-abc');
    expect(request.demoDataOnly).toBe(true);
    expect(request.answers).toEqual({
      workToImprove: answers.workToImprove,
      painPoints: answers.painPoints,
      peopleInvolved: answers.peopleInvolved,
      frequency: 'weekly',
      timeSpent: 'hours',
      systemsInvolved: 'Teams and SharePoint',
      informationUsed: 'Team status updates',
      informationCategories: ['internal'],
      aiAlreadyUsed: 'no',
      desiredOutcome: answers.desiredOutcome,
      successMeasure: 'Hours saved each week.',
      hasDeadlineSponsor: 'no',
      anythingElse: 'Nothing else.'
    });
    for (const key of Object.keys(request.answers)) {
      expect(IDEA_DRAFT_ANSWER_KEYS).toContain(key);
    }
  });

  it('includes conditional answers only when their question is visible and skips blanks', () => {
    const withTool: IAnswers = { ...answers, aiAlreadyUsed: 'yes', aiToolName: 'Copilot', hasDeadlineSponsor: 'yes', deadlineSponsorDetail: 'End of quarter', systemsInvolved: '   ' };
    const request: IIdeaDraftRequest = buildIdeaDraftRequest(idea, withTool, 'draft-1');
    expect(request.answers.aiToolName).toBe('Copilot');
    expect(request.answers.deadlineSponsorDetail).toBe('End of quarter');
    expect(request.answers.systemsInvolved).toBeUndefined();

    const hidden: IAnswers = { ...answers, aiAlreadyUsed: 'no', aiToolName: 'Stale answer', informationSensitiveNotice: 'ignored' };
    expect(buildIdeaDraftRequest(idea, hidden, 'draft-1').answers.aiToolName).toBeUndefined();
    expect(buildIdeaDraftRequest(idea, hidden, 'draft-1').answers.informationSensitiveNotice).toBeUndefined();
  });
});

describe('parseIdeaDraftResponse', () => {
  it('returns the draft and its provenance on success', () => {
    const result: IIdeaDraftResult = parseIdeaDraftResponse(200, successBody(), 'draft-1');
    expect(result.draft).toEqual(draftFixture());
    expect(result.provenance).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      responseId: 'msg_01ABC',
      requestId: 'draft-1',
      draftOnly: true,
      humanReviewRequired: true
    });
  });

  it('rejects a success response that does not carry a complete draft', () => {
    expect(failure((): unknown => parseIdeaDraftResponse(200, successBody({ ok: false }), 'draft-1')).kind).toBe('invalid-response');
    expect(failure((): unknown => parseIdeaDraftResponse(200, successBody({ draft: { ...draftFixture(), title: '  ' } }), 'draft-1')).kind).toBe('invalid-response');
    expect(failure((): unknown => parseIdeaDraftResponse(200, successBody({ draft: { title: 'only' } }), 'draft-1')).kind).toBe('invalid-response');
    expect(failure((): unknown => parseIdeaDraftResponse(200, 'not json', 'draft-1')).kind).toBe('invalid-response');
    expect(failure((): unknown => parseIdeaDraftResponse(200, successBody({ requestId: 'other' }), 'draft-1')).kind).toBe('invalid-response');
  });

  it('maps the flow error statuses', () => {
    const invalid: DraftServiceError = failure((): unknown => parseIdeaDraftResponse(400, JSON.stringify({ ok: false, code: 'INVALID_REQUEST', message: 'bad' }), 'draft-1'));
    expect(invalid.kind).toBe('invalid-request');
    expect(invalid.status).toBe(400);
    expect(invalid.code).toBe('INVALID_REQUEST');
    expect(failure((): unknown => parseIdeaDraftResponse(413, JSON.stringify({ error: { code: 'INPUT_TOO_LARGE' } }), 'draft-1')).kind).toBe('too-large');
    expect(failure((): unknown => parseIdeaDraftResponse(401, '', 'draft-1')).kind).toBe('unauthorized');
    expect(failure((): unknown => parseIdeaDraftResponse(403, '<html>', 'draft-1')).kind).toBe('unauthorized');
    expect(failure((): unknown => parseIdeaDraftResponse(404, '', 'draft-1')).kind).toBe('not-found');
    expect(failure((): unknown => parseIdeaDraftResponse(502, JSON.stringify({ ok: false, code: 'AI_DRAFT_UNAVAILABLE' }), 'draft-1')).kind).toBe('unavailable');
    expect(failure((): unknown => parseIdeaDraftResponse(500, '', 'draft-1')).kind).toBe('unavailable');
  });
});

describe('ClaudeDraftService', () => {
  interface IPost {
    url: string;
    body: string;
  }

  function client(reply: IDraftHttpResponse | Error, posts: IPost[]): () => Promise<IDraftHttpClient> {
    return async (): Promise<IDraftHttpClient> => ({
      post: async (url: string, body: string): Promise<IDraftHttpResponse> => {
        posts.push({ url, body });
        if (reply instanceof Error) {
          throw reply;
        }
        return reply;
      }
    });
  }

  it('posts the request as JSON to the configured trigger and returns the draft', async () => {
    const posts: IPost[] = [];
    const service: ClaudeDraftService = new ClaudeDraftService('https://flow.example/invoke?api-version=1', client(response(200, successBody()), posts), (): string => 'draft-1');
    const result: IIdeaDraftResult = await service.draftIdea(idea, answers);
    expect(result.draft.title).toBe('AI title');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('https://flow.example/invoke?api-version=1');
    expect(JSON.parse(posts[0].body)).toEqual(buildIdeaDraftRequest(idea, answers, 'draft-1'));
  });

  it('reports transport failures and flow errors as draft errors', async () => {
    const network: ClaudeDraftService = new ClaudeDraftService('https://flow.example/invoke', client(new Error('offline'), []));
    await expect(network.draftIdea(idea, answers)).rejects.toMatchObject({ kind: 'network' });
    const unavailable: ClaudeDraftService = new ClaudeDraftService('https://flow.example/invoke', client(response(502, '{"ok":false}'), []));
    await expect(unavailable.draftIdea(idea, answers)).rejects.toMatchObject({ kind: 'unavailable', status: 502 });
    const noClient: ClaudeDraftService = new ClaudeDraftService('https://flow.example/invoke', async (): Promise<IDraftHttpClient> => {
      throw new Error('consent missing');
    });
    await expect(noClient.draftIdea(idea, answers)).rejects.toMatchObject({ kind: 'network' });
  });

  it('is only created when a trigger url is configured', () => {
    const factory = client(response(200, successBody()), []);
    expect(createIdeaDraftService(undefined, factory)).toBeUndefined();
    expect(createIdeaDraftService('   ', factory)).toBeUndefined();
    expect(createIdeaDraftService('https://flow.example/invoke', factory)).toBeInstanceOf(ClaudeDraftService);
    expect(FLOW_SERVICE_RESOURCE).toBe('https://service.flow.microsoft.com/');
  });
});

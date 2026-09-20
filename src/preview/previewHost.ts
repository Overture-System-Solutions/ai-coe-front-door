/**
 * Offline preview host for the built web part bundle (`npm run preview`).
 *
 * Runs in the browser as a module script and simulates the parts of the SharePoint Framework the
 * bundle needs: `BaseClientSideWebPart`, the page context, permissions and an in-memory SharePoint
 * list store. Every response is simulated and all external network access is blocked; nothing here
 * contacts a tenant. Compiled to lib/preview/previewHost.js and served as /host.js.
 *
 * Query switches beside `view=` and `page=`: `deny=intakes` makes every read of the intake list answer
 * 403, so the my-work piece and the status strip show their refused state; `readback=fail` makes the
 * GET by id that follows a POST answer 503, so a submission from a form page shows the pending receipt
 * ("Saved, not yet confirmed" with the confirm-again button) instead of the confirmed one.
 *
 * Written without spread, rest or async/await on purpose: the ES5 build would otherwise import
 * tslib helpers, which a browser cannot resolve from a bare module specifier.
 */

interface IPreviewItem {
  Id: number;
  [field: string]: unknown;
}

interface IPreviewRequest {
  method: 'GET' | 'POST';
  list: string;
  body: unknown;
  simulated: true;
}

interface IPreviewResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

interface IPreviewWebPart {
  onInit(): Promise<void>;
  render(): void;
  onDispose(): void;
  properties: { [name: string]: unknown };
}

interface IPreviewApi {
  mode: 'OFFLINE_SIMULATION';
  requests: IPreviewRequest[];
  lists: { [title: string]: IPreviewItem[] };
  mount(properties: { [name: string]: unknown }): Promise<IPreviewWebPart>;
  setOrganizationName(name: string): void;
  /** Points the web part at the simulated draft flow (any non-empty URL) or back to plain summaries. */
  setDraftServiceUrl(url: string): void;
  /** Switches the telemetry strip between the Claude, OpenAI and combined tile sets. */
  setTelemetryProvider(mode: string): void;
  /** Switches the piece this instance renders (the view property) without reloading. */
  setView(view: string): void;
  /** Switches between the wide and narrow layouts. */
  setLayout(layout: string): void;
  /** Switches the page of the simulated content document a content page shows. */
  setPageKey(pageKey: string): void;
}

type AmdFactory = (...modules: unknown[]) => { default: new () => IPreviewWebPart };

interface IPreviewWindow {
  React: unknown;
  ReactDOM: unknown;
  define: unknown;
  FrontDoorPreview: IPreviewApi;
}

const LIST_TITLES: string[] = ['AI CoE Pilot Intakes', 'AI CoE Use Cases', 'AI CoE Decisions', 'AI Usage Daily', 'AI CoE Incidents'];
const previewWindow: IPreviewWindow = window as unknown as IPreviewWindow;
const lists: { [title: string]: IPreviewItem[] } = {};
const requests: IPreviewRequest[] = [];
let nextId: number = 1;
let webPartClass: (new () => IPreviewWebPart) | undefined;
let strings: { [key: string]: string } = {};
let mounted: IPreviewWebPart | undefined;
let pendingProperties: { [name: string]: unknown } = {};

for (let index: number = 0; index < LIST_TITLES.length; index++) {
  lists[LIST_TITLES[index]] = [];
}

/**
 * Fictional usage rows for both feeds (previous month and month to date, cost plus per-model
 * completions, the shape the Claude telemetry flow writes) and one open incident, so the
 * telemetry strip shows totals, deltas and an alert offline.
 */
function seedTelemetry(): void {
  const now: Date = new Date();
  const year: number = now.getUTCFullYear();
  const month: number = now.getUTCMonth();
  const usage: IPreviewItem[] = lists['AI Usage Daily'];
  const months: { offset: number; days: number }[] = [
    { offset: -1, days: 10 },
    { offset: 0, days: Math.min(now.getUTCDate(), 10) }
  ];
  const row = (provider: string, metricType: string, bucket: Date, model: string | undefined, fields: { [name: string]: unknown }): IPreviewItem => {
    const start: string = bucket.toISOString();
    const epoch: number = Math.floor(bucket.getTime() / 1000);
    const key: string = `${provider}|${metricType}|${start.slice(0, 10)}${model === undefined ? '' : `|${model}`}`;
    const item: IPreviewItem = {
      Id: nextId++,
      Title: key,
      Provider: provider,
      MetricType: metricType,
      BucketStart: start,
      BucketStartEpoch: epoch,
      BucketEndEpoch: epoch + 86400,
      CompositeKey: key
    };
    if (model !== undefined) {
      item.Model = model;
    }
    return Object.assign(item, fields);
  };
  for (let index: number = 0; index < months.length; index++) {
    for (let day: number = 1; day <= months[index].days; day++) {
      const bucket: Date = new Date(Date.UTC(year, month + months[index].offset, day));
      usage.push(row('anthropic', 'cost', bucket, undefined, { Amount: 3.25 + day * 0.5, Currency: 'USD' }));
      usage.push(row('anthropic', 'completions', bucket, 'claude-sonnet-5', { InputTokens: 12000 + day * 400, OutputTokens: 1800 + day * 60 }));
      usage.push(row('anthropic', 'completions', bucket, 'claude-opus-5', { InputTokens: 3000 + day * 100, OutputTokens: 700 + day * 20 }));
      usage.push(row('openai', 'cost', bucket, undefined, { Amount: 1.1 + day * 0.3, Currency: 'USD' }));
      usage.push(row('openai', 'completions', bucket, 'openai-default', { Requests: 40 + day, InputTokens: 5000 + day * 100, OutputTokens: 900 + day * 10 }));
    }
  }
  lists['AI CoE Incidents'].push({
    Id: nextId++,
    Title: 'Claude API spend exceeded the monthly budget',
    Category: 'Cost',
    Severity: 'High',
    Status: 'Open',
    Provider: 'anthropic',
    DetectedAt: now.toISOString(),
    Details: 'Simulated preview data: month-to-date Claude API spend exceeds the ClaudeMonthlyBudgetUsd setting in AI CoE Configuration. No tenant or provider was contacted.'
  });
}
seedTelemetry();

/** Fictional requests of the preview person, so the my-work piece and the status strip have rows to count. */
function seedIntakes(): void {
  const intakes: IPreviewItem[] = lists['AI CoE Pilot Intakes'];
  const rows: { suffix: string; workflowType: string; status: string; daysAgo: number }[] = [
    { suffix: 'PREVIEW1', workflowType: 'idea', status: 'Submitted - Pilot', daysAgo: 2 },
    { suffix: 'PREVIEW2', workflowType: 'helpTraining', status: 'In Review - Pilot', daysAgo: 9 },
    { suffix: 'PREVIEW3', workflowType: 'feedback', status: 'Closed - Pilot', daysAgo: 20 }
  ];
  for (let index: number = 0; index < rows.length; index++) {
    const submitted: Date = new Date(Date.now() - rows[index].daysAgo * 86400000);
    const intakeId: string = `OVT-AICOE-${submitted.toISOString().slice(0, 10).replace(/-/g, '')}-${rows[index].suffix}`;
    intakes.push({
      Id: nextId++,
      Title: `${rows[index].workflowType} — ${intakeId}`,
      IntakeId: intakeId,
      WorkflowType: rows[index].workflowType,
      Status: rows[index].status,
      RequestorName: 'Local Preview (fictional)',
      RequestorEmail: 'preview@example.invalid',
      SubmittedAt: submitted.toISOString(),
      Modified: new Date(submitted.getTime() + 3600000).toISOString(),
      PayloadJson: '{"simulated":true}'
    });
  }
  // Another person's row: the simulated item-level security below keeps it out of the preview person's reads.
  intakes.push({
    Id: nextId++,
    Title: 'idea — OVT-AICOE-20260101-OTHERONE',
    IntakeId: 'OVT-AICOE-20260101-OTHERONE',
    WorkflowType: 'idea',
    Status: 'Submitted - Pilot',
    RequestorName: 'Someone Else (fictional)',
    RequestorEmail: 'someone.else@example.invalid',
    SubmittedAt: '2026-01-01T09:00:00Z',
    Modified: '2026-01-01T09:00:00Z',
    PayloadJson: '{"simulated":true}'
  });
}
seedIntakes();

/** A page of this preview showing another piece or content page. */
function previewLink(query: string): string {
  return `/?${query}`;
}

/** The YYYY-MM-DD date that many days before today (UTC), so the preview's dated facts stay current or stale by design, whenever it runs. */
function isoDaysAgo(days: number): string {
  const date: Date = new Date(Date.now() - days * 86400000);
  const month: number = date.getUTCMonth() + 1;
  const day: number = date.getUTCDate();
  return `${date.getUTCFullYear()}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day}`;
}

// Simulated preview data: the content document a site would keep in Site Assets, with Contoso wording and links
// back into this preview. Every block type appears at least once. The route table shows the three answers a route
// can give: an on-site route that is available, an off-site one still awaiting its tenant receipt (closed, with the
// guided intake as fallback), and one with no link at all.
const SAMPLE_PAGE_DOCUMENT: { [key: string]: unknown } = {
  version: 1,
  routes: {
    guidedIntake: { label: 'Start a guided request', href: previewLink('view=idea'), state: 'availableNow' },
    work: { label: 'Get work done', state: 'availableNow', note: 'The work command is not yet proved in this environment.' },
    // carriesReference: the hand-off card after a saved request would append the record reference once the route opens.
    assistant: { label: 'the assistant', href: 'https://assistant.example/chat', state: 'availableNow', carriesReference: true, note: 'Opens in a new tab once the tenant receipt is recorded.' },
    improve: { label: 'Improve a task', href: previewLink('view=toolCheck'), state: 'availableNow' }
  },
  // Telemetry tile labels by metric key: read only by a telemetry piece that names its own kicker, so the page names the feed.
  vocabulary: {
    telemetry: {
      anthropic_api_spend_mtd: 'Usage feed A: spend this month',
      anthropic_api_tokens_mtd: 'Usage feed A: tokens this month',
      anthropic_api_output_tokens_mtd: 'Usage feed A: output tokens this month',
      open_coe_alerts: 'Open incidents'
    }
  },
  // The shared footer: the same support route below every page view, the five wizard views included (open "?view=idea").
  shared: {
    footer: [
      {
        type: 'supportRoute',
        label: 'Ask in the pilot channel in Teams',
        href: 'https://teams.microsoft.com/l/channel/contoso',
        stopWhen: [
          'the signed-in account or destination is unclear',
          'someone else\'s information appears',
          'a source is missing or a claim cannot be verified',
          'the system appears ready to take an external action you did not approve'
        ],
        reportFields: ['the task type', 'the time', 'the status shown', 'what you expected', 'never a secret or private content you do not need to share'],
        // kind: which row the failure notice of a wizard page names as owner (identity for an access failure, support for the rest).
        routes: [
          { issue: 'Wrong identity, audience or access', owner: 'Identity owner (simulated)', action: 'Stop; do not widen access', kind: 'identity' },
          { issue: 'Someone else\'s information appears', owner: 'Privacy owner (simulated)', action: 'Stop the affected workflow; preserve minimal evidence', kind: 'privacy' },
          { issue: 'A claim looks incorrect or unsupported', action: 'Remove or label the claim; correct the source binding', kind: 'claims' },
          { issue: 'Send, publish or record change is proposed', owner: 'Business approver (simulated)', action: 'Keep draft-only until separately approved', kind: 'approval' },
          { issue: 'Outcome is uncertain after an action', owner: 'Recovery owner (simulated)', action: 'Reconcile the native state before retrying', kind: 'recovery' },
          { issue: 'Anything else', owner: 'Support owner (simulated)', action: 'Report it as it is: the task, the time, the status shown', kind: 'support' }
        ]
      }
    ]
  },
  pages: {
    startHere: {
      title: 'Start here',
      blocks: [
        {
          // The operating promise, no call to action: the work command below is the page's one primary control.
          type: 'hero',
          title: 'What do you need done?',
          text: 'Ask the AI CoE in [Teams](https://teams.microsoft.com/l/channel/contoso), [learn the basics](/?page=learn) or [start a request](/?page=requests).'
        },
        {
          type: 'workCommand',
          prompt: 'What do you need done?',
          placeholder: 'Say it in one sentence, for example: prepare me for a customer meeting.',
          submitLabel: 'Start',
          route: 'work',
          note: 'Your sentence is saved as a draft request on this device and is never sent anywhere else. Until the work command is proved here, the guided request opens with it filled in.'
        },
        { type: 'heading', level: 2, text: 'What do you want to do?' },
        {
          type: 'tiles',
          prominent: true,
          items: [
            { title: 'Get work done', kicker: 'Do', route: 'work', description: 'Say what you need and the right path opens.', icon: 'Lightbulb' },
            { title: 'Ask the assistant', kicker: 'Ask', route: 'assistant', description: 'Questions answered from approved sources.', icon: 'MessageSquare', tone: 'blue' },
            { title: 'Improve a task', kicker: 'Improve', route: 'improve', description: 'Check a tool or a task before you rely on it.', icon: 'BriefcaseBusiness', tone: 'gold' }
          ]
        },
        {
          type: 'tiles',
          items: [
            { title: 'Ask the AI CoE', href: 'https://teams.microsoft.com/l/channel/contoso', description: 'Questions, ideas, worries. A person answers.', icon: 'MessageSquare' },
            { title: 'Use AI for my work', href: previewLink('page=useAi'), description: 'What is allowed and how to do it well.', icon: 'BriefcaseBusiness' },
            { title: 'Start a request', href: previewLink('page=requests'), description: 'Ideas, tools, team use, training, feedback.', icon: 'Inbox', tone: 'blue' },
            { title: 'Check status', href: previewLink('page=status'), description: 'What is running, what is not, what is next.', icon: 'LayoutDashboard', tone: 'gold' }
          ]
        },
        { type: 'heading', level: 2, text: 'Three rules for the pilot' },
        {
          type: 'rules',
          items: [
            { title: 'You decide', text: 'The tool *suggests*; you decide, and you sign what goes out.' },
            { title: 'Check every number', text: 'Against the source, every time, before it leaves your hands.' },
            { title: 'Say when you used it', text: 'One line is enough: "drafted with AI, checked by me".' }
          ]
        },
        {
          type: 'notice',
          tone: 'caution',
          title: 'Data boundary',
          text: 'Keep **personal data**, contracts and anything regulated out of every prompt. If you are not sure, [check the tool or task](/?view=toolCheck) first.'
        },
        { type: 'heading', level: 2, text: 'Three prompts to try today' },
        {
          type: 'cards',
          columns: 3,
          items: [
            { title: 'Summarise a long thread', kicker: 'Prompt', body: '**Do this**: paste the thread and ask for the three decisions and the open questions.', meta: 'Copilot Chat . 2 min', tone: 'teal' },
            { title: 'Draft a reply', kicker: 'Prompt', body: ['Paste the message you received.', 'Ask for a *short* reply in your own voice, then edit it.'], meta: 'Copilot Chat . 2 min', tone: 'violet' },
            { title: 'Prepare for a meeting', kicker: 'Prompt', body: 'Paste the agenda and ask what to read first and which questions to bring.', meta: 'Copilot Chat . 5 min', tone: 'gold' }
          ]
        },
        {
          // The status strip: the person's own request counts (read from the simulated intake list; add "&deny=intakes" to see the refused state) beside two labelled lines.
          type: 'statusStrip',
          items: [
            { kind: 'myRequests', label: 'My requests', href: previewLink('page=status') },
            // A source with no read-back date: the line says "Awaiting source. Do not infer progress." instead of inventing one.
            { kind: 'text', label: 'Assistant', text: 'Answering from approved sources.', route: 'assistant', source: 'AI CoE check (simulated)' },
            { kind: 'text', label: 'Support', text: 'Ask in [Teams](https://teams.microsoft.com/l/channel/contoso) or reply to any AI CoE mail.' }
          ]
        }
      ]
    },
    learn: {
      title: 'Learn',
      blocks: [
        { type: 'paragraph', text: 'Four exercises, about ten minutes in total. Do them in Copilot Chat with your own work; nothing is graded.' },
        {
          type: 'rules',
          title: 'Before you start',
          ordered: false,
          items: [
            { title: 'Use your own work', text: 'A document you have read, a message you need to send.' },
            { title: 'Keep the boundary', text: 'Public information and your own notes only.' },
            { title: 'Expect mistakes', text: 'Finding them is the exercise.' }
          ]
        },
        { type: 'notice', tone: 'info', text: 'Nothing here is recorded. The exercises stay on your device and in your own chat history.' },
        {
          type: 'cards',
          columns: 2,
          items: [
            { title: '1. Summarise something you already know', kicker: '2 minutes', body: ['Paste a document you have read and ask for a summary.', 'Check it against what you remember. Where is it wrong?'] },
            { title: '2. Ask for a first draft', kicker: '3 minutes', body: ['Describe a message you need to send and ask for a draft.', 'Edit it until it sounds like you.'], tone: 'violet' }
          ]
        },
        { type: 'heading', level: 2, text: 'How we know you have done it' },
        { type: 'paragraph', text: 'We do not track it. Tell your manager, or post one thing you learned in [Teams](https://teams.microsoft.com/l/channel/contoso).' }
      ]
    },
    useAi: {
      title: 'Use AI',
      blocks: [
        { type: 'paragraph', text: 'Copilot Chat is approved for everyday work with public information and your own notes. Anything else: [check the tool or task](/?view=toolCheck) first.' },
        { type: 'heading', level: 2, text: 'Everyday tasks' },
        {
          type: 'cards',
          columns: 3,
          items: [
            { title: 'Writing', body: 'Drafts, rewrites, summaries.', meta: 'Boundary: never paste customer data.' },
            { title: 'Reading', body: 'Long documents, threads, transcripts.', meta: 'Boundary: check every number against the source.', tone: 'blue' },
            { title: 'Planning', body: 'Agendas, checklists, first versions of plans.', meta: 'Boundary: decisions stay with people.', tone: 'cyan' }
          ]
        },
        { type: 'heading', level: 2, text: 'What this page does not do' },
        { type: 'paragraph', text: 'It does not approve new tools. That is a [request](/?page=requests).' }
      ]
    },
    requests: {
      title: 'Requests',
      blocks: [
        { type: 'heading', level: 2, text: 'Not sure which form? Start with the lane.' },
        { type: 'paragraph', text: 'Most things people want to do with AI fall into one of three lanes. The lane tells you whether you need to ask at all.' },
        {
          type: 'lanes',
          items: [
            { tone: 'green', title: 'Green: just do it', body: 'Public information, your own notes, drafts you will edit.', note: 'No form needed.' },
            { tone: 'amber', title: 'Amber: ask first', body: ['Internal documents, team data, anything you would not post publicly.', 'Use *Check a tool or task* below.'], badge: 'Ask' },
            { tone: 'red', title: 'Red: not yet', body: 'Personal data, contracts, anything regulated.', note: 'The AI CoE will tell you when this changes.' }
          ]
        },
        { type: 'heading', level: 2, text: 'If you would rather use a form' },
        { type: 'paragraph', text: 'Each path below opens a short guided form. Your answers are saved as a draft on this device until you send them.' },
        {
          type: 'piece',
          piece: 'home',
          pages: {
            idea: previewLink('view=idea'),
            toolCheck: previewLink('view=toolCheck'),
            teamUsage: previewLink('view=teamUsage'),
            helpTraining: previewLink('view=helpTraining'),
            feedback: previewLink('view=feedback'),
            // No snapshot link: the telemetry strip sits on the operator-plane Operations page since 1.0.0.13.
            admin: previewLink('view=admin')
          }
        }
      ]
    },
    prompts: {
      title: 'Prompts',
      blocks: [
        { type: 'paragraph', text: 'Tested prompts from the pilot. Copy one, change the words in brackets, and keep what works.' },
        { type: 'heading', level: 2, text: 'Start with these three' },
        {
          type: 'cards',
          columns: 3,
          items: [
            { title: 'Admin queue', body: 'Paste your inbox subjects and ask: **which three need me today**, and why?', meta: 'P-001 . Copilot Chat . about 2 minutes' },
            { title: 'Morning brief', body: 'Paste yesterday\'s notes and ask for the three things to carry forward.', meta: 'P-002 . Copilot Chat . about 2 minutes', tone: 'blue' },
            { title: 'Repeatable work', body: 'Describe a task you do weekly and ask for a checklist you can reuse.', meta: 'P-003 . Copilot Chat . about 5 minutes', tone: 'gold' }
          ]
        }
      ]
    },
    status: {
      title: 'Status',
      blocks: [
        { type: 'paragraph', text: 'Updated every Friday by the AI CoE. Your own requests below come from the simulated request list of this preview.' },
        // The person's own requests, read from the simulated intake list (add "&deny=intakes" to see the refused state).
        { type: 'piece', piece: 'myWork', pages: {} },
        {
          // The one illustrative case card: an example, its source read 45 days ago, so the example and needs-refresh pills both show.
          type: 'caseCards',
          items: [
            {
              id: 'EXAMPLE-01',
              title: 'Example case: a proof-of-value programme',
              description: 'Shows how a case looks when its latest evidence is older than the freshness threshold.',
              state: 'AWAITING_SOURCE',
              historicalStage: 'Validate',
              historicalHealth: 'amber',
              sourceDate: isoDaysAgo(45),
              nextAction: 'Read the latest authoritative source before updating the case.',
              caption: 'Do not infer progress',
              illustrative: true
            }
          ]
        },
        {
          type: 'cards',
          columns: 2,
          items: [
            // Dated facts: the first was read back this week (current), the second long ago (the needs-refresh pill).
            { title: 'What is running', body: ['**Copilot Chat** for everyone in the pilot.', '**Prompt library** with tested prompts.'], asOf: isoDaysAgo(3), source: 'AI CoE check (simulated)' },
            { title: 'What is not running', body: ['**Agents** are still in review.', '**Connectors to line-of-business systems** are not enabled.'], tone: 'cyan', asOf: isoDaysAgo(45), source: 'AI CoE check (simulated)' }
          ]
        },
        {
          type: 'cards',
          columns: 2,
          items: [
            { title: 'Checking a request you sent', body: 'Reply to the confirmation mail you received; it carries the request id.' },
            { title: 'If something is wrong', body: 'Say so in [Teams](https://teams.microsoft.com/l/channel/contoso) or use [Share feedback](/?view=feedback).', tone: 'gold' }
          ]
        }
      ]
    },
    // The operator-plane page (owners-only on a site): the telemetry strip left Status for it in 1.0.0.13. On the
    // operator plane a case card or request row also shows its status code beside the plain wording.
    operations: {
      title: 'Operations',
      plane: 'operator',
      blocks: [
        { type: 'heading', level: 2, text: 'Operations diagnostics' },
        { type: 'paragraph', text: 'Usage and cost of the AI services this site reads about, for the people who run the pilot. Numbers below come from the simulated telemetry lists of this preview.' },
        // The kicker names the strip as diagnostics; with it set, the tiles take their labels from the document's vocabulary above.
        { type: 'piece', piece: 'telemetry', pages: {}, kicker: 'Diagnostics: usage and cost, not a measure of value (simulated)' }
      ]
    }
  }
};

const files: { [sitePath: string]: string } = { 'SiteAssets/ai-coe-pages.json': JSON.stringify(SAMPLE_PAGE_DOCUMENT) };

function blocked(): never {
  throw new Error('External network access is blocked in the offline preview.');
}

// Belt and braces: the bundle never calls these, but the preview must stay offline even if it did.
window.fetch = blocked;
window.XMLHttpRequest = function XMLHttpRequest(): void {
  blocked();
} as unknown as typeof XMLHttpRequest;
window.WebSocket = blocked as unknown as typeof WebSocket;
// The work command opens an available route in a new tab after saving the draft (the sample document keeps that route
// closed, so the guided request opens instead). A stub records the call and opens nothing: the preview stays offline.
window.open = function open(url?: string | URL): undefined {
  requests.push({ method: 'GET', list: `new tab (${String(url)})`, body: undefined, simulated: true });
  return undefined;
} as unknown as typeof window.open;
document.addEventListener('click', (event: MouseEvent): void => {
  const target: Element | null = event.target as Element | null;
  const link: HTMLAnchorElement | null = target === null ? null : target.closest('a[href]');
  if (link === null || link.href.indexOf('blob:') === 0 || (link.getAttribute('href') ?? '').indexOf('#') === 0) {
    return;
  }
  // The preview's own page-map links ("/?view=idea", "/?page=learn") reload this page showing another piece; everything else stays blocked.
  if (link.origin === location.origin && (link.search.indexOf('view=') >= 0 || link.search.indexOf('page=') >= 0)) {
    return;
  }
  event.preventDefault();
});

/** The simulated file behind `GetFileByServerRelativeUrl('<path>')/$value`: matched on the trailing site path, 404 otherwise. */
function fileResponse(method: 'GET' | 'POST', path: string): Promise<IPreviewResponse> {
  const name: string | undefined = Object.keys(files).filter(
    (candidate: string): boolean => path.length >= candidate.length && path.slice(path.length - candidate.length) === candidate
  )[0];
  requests.push({ method, list: `file ${path}`, body: undefined, simulated: true });
  const body: string = name === undefined ? 'File not found' : files[name];
  return Promise.resolve({
    ok: name !== undefined,
    status: name === undefined ? 404 : 200,
    json: (): Promise<unknown> => Promise.resolve(body),
    text: (): Promise<string> => Promise.resolve(body)
  });
}

function request(method: 'GET' | 'POST', url: string, options: { body?: string } | undefined): Promise<IPreviewResponse> {
  const fileMatch: RegExpMatchArray | null = String(url).match(/GetFileByServerRelativeUrl\('((?:[^']|'')+)'\)\/\$value/i);
  if (fileMatch !== null) {
    return fileResponse(method, fileMatch[1].replace(/''/g, "'"));
  }
  const match: RegExpMatchArray | null = String(url).match(/getbytitle\('((?:[^']|'')+)'\)\/items/);
  const list: string | undefined = match === null ? undefined : match[1].replace(/''/g, "'");
  if (list === undefined || lists[list] === undefined) {
    return Promise.reject(new Error(`Unknown simulated SharePoint list in ${url}`));
  }
  const body: unknown = options !== undefined && options.body ? JSON.parse(options.body) : undefined;
  requests.push({ method, list, body, simulated: true });
  let result: unknown;
  let status: number = 200;
  const itemMatch: RegExpMatchArray | null = String(url).match(/\/items\((\d+)\)/);
  const filterMatch: RegExpMatchArray | null = String(url).match(/[?&]\$filter=([^&]*)/);
  if (method === 'GET' && list === 'AI CoE Pilot Intakes' && location.search.indexOf('deny=intakes') >= 0) {
    // "?deny=intakes": the list refuses every read, as it does for a person without permission on it.
    result = 'Access denied (simulated)';
    status = 403;
  } else if (method === 'POST') {
    const item: IPreviewItem = Object.assign({}, body as object, { Id: nextId++ }) as IPreviewItem;
    lists[list].push(item);
    result = item;
    status = 201;
  } else if (itemMatch !== null && list === 'AI CoE Pilot Intakes' && location.search.indexOf('readback=fail') >= 0) {
    // "?readback=fail": the row was written but the read that should confirm it fails, so the receipt reads pending.
    result = 'Service unavailable (simulated readback failure)';
    status = 503;
  } else if (itemMatch !== null) {
    // The readback that follows a write: one row by id, 404 when the list holds no such row.
    const id: number = Number(itemMatch[1]);
    const found: IPreviewItem | undefined = lists[list].filter((item: IPreviewItem): boolean => item.Id === id)[0];
    result = found === undefined ? 'Item does not exist' : found;
    status = found === undefined ? 404 : 200;
  } else if (filterMatch !== null) {
    // The pre-read of a retry and the my-work read: a one-field `<Field> eq '<value>'` filter; any other shape matches
    // nothing. The intake list also simulates item-level read security: only the preview person's own rows come back.
    const clause: RegExpExecArray | null = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+eq\s+'((?:[^']|'')*)'\s*$/.exec(decodeURIComponent(filterMatch[1]));
    const rows: IPreviewItem[] =
      clause === null ? [] : lists[list].filter((item: IPreviewItem): boolean => item[clause[1]] !== undefined && String(item[clause[1]]) === clause[2].replace(/''/g, "'"));
    const visible: IPreviewItem[] =
      list === 'AI CoE Pilot Intakes' ? rows.filter((item: IPreviewItem): boolean => item.RequestorEmail === undefined || item.RequestorEmail === 'preview@example.invalid') : rows;
    result = { value: visible };
  } else {
    result = { value: lists[list].slice() };
  }
  return Promise.resolve({
    ok: status < 300,
    status,
    json: (): Promise<unknown> => Promise.resolve(result),
    text: (): Promise<string> => Promise.resolve(typeof result === 'string' ? result : JSON.stringify(result))
  });
}

/** Stands in for the AI draft flow: echoes the answers into the twelve draft fields, no model involved. */
function simulatedDraft(url: string, options: { body?: string } | undefined): Promise<IPreviewResponse> {
  const draftRequest: { requestId?: string; answers?: { [key: string]: unknown } } = options !== undefined && options.body ? JSON.parse(options.body) : {};
  const answers: { [key: string]: unknown } = draftRequest.answers ?? {};
  const text = (key: string): string => (typeof answers[key] === 'string' && answers[key] ? String(answers[key]) : 'Not specified');
  const categories: unknown = answers.informationCategories;
  requests.push({ method: 'POST', list: `simulated draft flow (${url})`, body: draftRequest, simulated: true });
  const envelope: unknown = {
    ok: true,
    schemaVersion: '1.0',
    requestId: draftRequest.requestId,
    draftOnly: true,
    humanReviewRequired: true,
    provider: 'offline-preview-simulation',
    model: 'none',
    responseId: `preview-${Date.now()}`,
    draft: {
      title: `[Simulated] ${text('workToImprove').slice(0, 60)}`,
      problemToSolve: text('painPoints'),
      currentProcess: text('workToImprove'),
      peopleAffected: text('peopleInvolved'),
      frequencyAndEffort: `${text('frequency')}; ${text('timeSpent')}`,
      systemsInvolved: text('systemsInvolved'),
      informationCategories: Array.isArray(categories) ? categories.join(', ') : 'Not specified',
      currentAiActivity: text('aiAlreadyUsed'),
      desiredOutcome: text('desiredOutcome'),
      possibleMeasuresOfSuccess: text('successMeasure'),
      openQuestions: 'This draft was produced by the offline preview simulation; no model was called.',
      suggestedNextStep: 'An AI CoE team member will review this idea.'
    }
  };
  return Promise.resolve({
    ok: true,
    status: 200,
    json: (): Promise<unknown> => Promise.resolve(envelope),
    text: (): Promise<string> => Promise.resolve(JSON.stringify(envelope))
  });
}

const context: unknown = {
  pageContext: {
    user: { displayName: 'Local Preview (fictional)', email: 'preview@example.invalid' },
    web: { absoluteUrl: `${location.origin}/simulated-site`, permissions: { hasPermission: (): boolean => true } }
  },
  spHttpClient: {
    get: (url: string, _configuration: unknown, options?: { body?: string }): Promise<IPreviewResponse> => request('GET', url, options),
    post: (url: string, _configuration: unknown, options?: { body?: string }): Promise<IPreviewResponse> => request('POST', url, options)
  },
  aadHttpClientFactory: {
    getClient: (): Promise<unknown> =>
      Promise.resolve({
        post: (url: string, _configuration: unknown, options?: { body?: string }): Promise<IPreviewResponse> => simulatedDraft(url, options)
      })
  }
};

function BaseClientSideWebPart(this: { context: unknown; domElement: HTMLElement; properties: unknown }): void {
  const app: HTMLElement | null = document.getElementById('app');
  if (app === null) {
    throw new Error('The preview page has no #app element.');
  }
  this.context = context;
  this.domElement = app;
  this.properties = pendingProperties;
}
BaseClientSideWebPart.prototype.onInit = function onInit(): Promise<void> {
  return Promise.resolve();
};

const externals: { [name: string]: unknown } = {
  '@microsoft/sp-core-library': { Version: { parse: (value: string): { toString(): string } => ({ toString: (): string => value }) } },
  '@microsoft/sp-webpart-base': { BaseClientSideWebPart },
  '@microsoft/sp-page-context': { SPPermission: { manageWeb: 'simulated:manageWeb' } },
  '@microsoft/sp-http': { SPHttpClient: { configurations: { v1: { name: 'v1' } } }, AadHttpClient: { configurations: { v1: { name: 'aad-v1' } } } },
  '@microsoft/sp-property-pane': {
    PropertyPaneTextField: (targetProperty: string, properties: unknown): unknown => ({ targetProperty, properties }),
    PropertyPaneDropdown: (targetProperty: string, properties: unknown): unknown => ({ targetProperty, properties })
  }
};

function resolveDependency(name: string): unknown {
  if (name === 'react') {
    return previewWindow.React;
  }
  if (name === 'react-dom') {
    return previewWindow.ReactDOM;
  }
  if (name === 'AiCoeFrontDoorWebPartStrings') {
    return strings;
  }
  if (externals[name] === undefined) {
    throw new Error(`Unsupported SharePoint Framework dependency: ${name}`);
  }
  return externals[name];
}

/** AMD shim: the strings chunk calls define([], factory); the bundle calls define(id, dependencies, factory). */
previewWindow.define = (first: string | string[], second: string[] | AmdFactory, third?: AmdFactory): void => {
  if (Array.isArray(first)) {
    strings = (second as unknown as () => { [key: string]: string })();
    return;
  }
  const dependencies: string[] = second as string[];
  const factory: AmdFactory = third as AmdFactory;
  webPartClass = factory.apply(undefined, dependencies.map(resolveDependency)).default;
};

previewWindow.FrontDoorPreview = {
  mode: 'OFFLINE_SIMULATION',
  requests,
  lists,
  mount: (properties: { [name: string]: unknown }): Promise<IPreviewWebPart> => {
    if (webPartClass === undefined) {
      return Promise.reject(new Error('Load the built bundle before mounting.'));
    }
    pendingProperties = Object.assign({}, properties);
    const webPart: IPreviewWebPart = new webPartClass();
    mounted = webPart;
    return webPart.onInit().then((): IPreviewWebPart => {
      webPart.render();
      return webPart;
    });
  },
  setOrganizationName: (name: string): void => {
    if (mounted === undefined) {
      throw new Error('Mount the web part first.');
    }
    mounted.properties.organizationName = name;
    mounted.render();
  },
  setDraftServiceUrl: (url: string): void => {
    if (mounted === undefined) {
      throw new Error('Mount the web part first.');
    }
    mounted.properties.draftServiceUrl = url;
    mounted.render();
  },
  setTelemetryProvider: (mode: string): void => {
    if (mounted === undefined) {
      throw new Error('Mount the web part first.');
    }
    mounted.properties.telemetryProvider = mode;
    mounted.render();
  },
  setView: (view: string): void => {
    if (mounted === undefined) {
      throw new Error('Mount the web part first.');
    }
    mounted.properties.view = view;
    mounted.render();
  },
  setLayout: (layout: string): void => {
    if (mounted === undefined) {
      throw new Error('Mount the web part first.');
    }
    mounted.properties.layout = layout;
    mounted.render();
  },
  setPageKey: (pageKey: string): void => {
    if (mounted === undefined) {
      throw new Error('Mount the web part first.');
    }
    mounted.properties.pageKey = pageKey;
    mounted.render();
  }
};

export {};

/* eslint-disable no-script-url -- the script URLs are the hostile inputs the href guard is tested against */
import {
  DEFAULT_CONTENT_URL,
  DEFAULT_KPI_UNAVAILABLE_TEXT,
  DEFAULT_SETTINGS,
  DEFAULT_VOCABULARY,
  isExternalHref,
  PAGE_DOCUMENT_VERSION,
  pagePlane,
  parseBlock,
  parseContentUrl,
  parseNotice,
  parseOptionalContentUrl,
  parsePageDocument,
  parseRules,
  parseSettings,
  parseShared,
  parseSupportRoute,
  parseVocabulary,
  parseWorkCommand,
  readPlane,
  readParagraphs,
  resolveContentHref
} from './pageContent';
import { CANONICAL_STATUS } from './truthStates';
import type {
  IBindingsBlock,
  ICardsBlock,
  ICaseCardsBlock,
  IContentPage,
  IHeroBlock,
  ILanesBlock,
  INoticeBlock,
  IKpiBlock,
  IPageDocument,
  IPieceBlock,
  IRulesBlock,
  ISharedSections,
  IStatusStripBlock,
  ISupportRouteBlock,
  ITilesBlock,
  IVocabulary,
  IWorkCommandBlock
} from './pageContent';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';

describe('page document', () => {
  it('accepts only a version 1 object with pages', () => {
    expect(PAGE_DOCUMENT_VERSION).toBe(1);
    expect(parsePageDocument('not json')).toBeUndefined();
    expect(parsePageDocument('{}')).toBeUndefined();
    expect(parsePageDocument('[]')).toBeUndefined();
    expect(parsePageDocument('null')).toBeUndefined();
    expect(parsePageDocument(JSON.stringify({ version: 2, pages: {} }))).toBeUndefined();
    expect(parsePageDocument(JSON.stringify({ version: 1 }))).toBeUndefined();
    expect(parsePageDocument(JSON.stringify({ version: 1, pages: [] }))).toBeUndefined();
    expect(parsePageDocument(JSON.stringify({ version: 1, pages: {} }))).toEqual({ version: 1, pages: {} });
  });

  it('keeps the pages that have a title and blocks and drops malformed blocks', () => {
    const document: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({
        version: 1,
        pages: {
          startHere: { title: ' Start here ', blocks: [{ type: 'paragraph', text: 'Hello' }, { type: 'bogus' }, 42, { type: 'heading' }] },
          noTitle: { blocks: [] },
          noBlocks: { title: 'x' },
          notAnObject: 'x'
        }
      })
    );
    expect(document).toEqual({ version: 1, pages: { startHere: { title: 'Start here', blocks: [{ type: 'paragraph', text: 'Hello' }] } } });
  });
});

describe('document envelope', () => {
  it('parses a document without vocabulary, settings or planes exactly as before', () => {
    const document: IPageDocument | undefined = parsePageDocument(JSON.stringify({ version: 1, pages: { learn: { title: 'Learn', blocks: [] } } }));
    expect(document).toEqual({ version: 1, pages: { learn: { title: 'Learn', blocks: [] } } });
    expect(Object.keys(document as IPageDocument)).toEqual(['version', 'pages']);
    expect(pagePlane((document as IPageDocument).pages.learn)).toBe('user');
  });

  it('keeps only string maps of the vocabulary and ignores unknown keys', () => {
    expect(DEFAULT_VOCABULARY).toEqual({ truthStates: {}, requestStatuses: {}, chrome: {}, roles: {}, telemetry: {} });
    expect(parseVocabulary(undefined)).toEqual(DEFAULT_VOCABULARY);
    expect(parseVocabulary('x')).toEqual(DEFAULT_VOCABULARY);
    expect(parseVocabulary([])).toEqual(DEFAULT_VOCABULARY);
    const vocabulary: IVocabulary = parseVocabulary({
      truthStates: {
        availableNow: { label: ' Ready ', definition: 'checked in the {organization} environment.' },
        needsAccess: { label: '', definition: 7 },
        draftOnly: 'Draft',
        bogus: { label: 'x' }
      },
      requestStatuses: { BLOCKED: 'Stuck', DRAFT: '', AT_RISK: 3, EXTRA: ' Custom ' },
      chrome: { badge: 'Pilot', example: 'Sample', needsRefresh: 'Stale', awaitingSource: ' Source pending ', protectedPage: 'Not for {role}.', unknown: 'x', hidden: 4 },
      roles: { leader: 'Leaders', operator: '', 7: 'seven' },
      telemetry: { claude: 'Assistant', openai: 2 },
      unknownSection: { a: 'b' }
    });
    expect(vocabulary).toEqual({
      truthStates: { availableNow: { label: 'Ready', definition: 'checked in the {organization} environment.' }, needsAccess: {} },
      requestStatuses: { BLOCKED: 'Stuck', EXTRA: 'Custom' },
      chrome: { badge: 'Pilot', example: 'Sample', needsRefresh: 'Stale', awaitingSource: 'Source pending', protectedPage: 'Not for {role}.' },
      roles: { leader: 'Leaders', '7': 'seven' },
      telemetry: { claude: 'Assistant' }
    });
    expect(parseVocabulary({ truthStates: 'x', requestStatuses: ['a'], chrome: null })).toEqual(DEFAULT_VOCABULARY);
  });

  it('reads settings as bounded integers with defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({ freshnessDays: 30, minimumCohort: 5 });
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ freshnessDays: 14, minimumCohort: 10 })).toEqual({ freshnessDays: 14, minimumCohort: 10 });
    expect(parseSettings({ freshnessDays: 1, minimumCohort: 1 })).toEqual({ freshnessDays: 1, minimumCohort: 1 });
    expect(parseSettings({ freshnessDays: 3650, minimumCohort: 1000 })).toEqual({ freshnessDays: 3650, minimumCohort: 1000 });
    expect(parseSettings({ freshnessDays: 0, minimumCohort: 0 })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ freshnessDays: 3651, minimumCohort: 1001 })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ freshnessDays: 2.5, minimumCohort: '5' })).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ freshnessDays: -7, minimumCohort: NaN })).toEqual(DEFAULT_SETTINGS);
  });

  it('carries vocabulary and settings on the document and drops a malformed section, never the document', () => {
    const document: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({
        version: 1,
        settings: { freshnessDays: 7 },
        vocabulary: { chrome: { example: 'Sample' } },
        pages: { learn: { title: 'Learn', blocks: [] } }
      })
    );
    expect(document).toEqual({
      version: 1,
      pages: { learn: { title: 'Learn', blocks: [] } },
      settings: { freshnessDays: 7, minimumCohort: 5 },
      vocabulary: { truthStates: {}, requestStatuses: {}, chrome: { example: 'Sample' }, roles: {}, telemetry: {} }
    });
    const damaged: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({ version: 1, settings: 'soon', vocabulary: ['x'], pages: { learn: { title: 'Learn', blocks: [] } } })
    );
    expect(damaged).toEqual({ version: 1, pages: { learn: { title: 'Learn', blocks: [] } } });
  });

  it('carries the route table on the document and drops a malformed one, never the document', () => {
    const document: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({
        version: 1,
        routes: {
          guidedIntake: { label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
          work: { label: 'Work command', href: '', state: 'availableNow', fallback: 'guidedIntake' },
          noLabel: { href: 'x' }
        },
        pages: { learn: { title: 'Learn', blocks: [] } }
      })
    );
    expect(document).toEqual({
      version: 1,
      pages: { learn: { title: 'Learn', blocks: [] } },
      routes: {
        guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
        work: { key: 'work', label: 'Work command', state: 'availableNow', fallback: 'guidedIntake' }
      }
    });
    const damaged: IPageDocument | undefined = parsePageDocument(JSON.stringify({ version: 1, routes: ['x'], pages: { learn: { title: 'Learn', blocks: [] } } }));
    expect(damaged).toEqual({ version: 1, pages: { learn: { title: 'Learn', blocks: [] } } });
  });

  it('carries the shared footer on the document, dropping the hero, the piece and the work command from it', () => {
    const shared: ISharedSections = parseShared({
      footer: [
        { type: 'hero', title: 'Not in a footer' },
        { type: 'piece', piece: 'home', pages: {} },
        { type: 'workCommand', prompt: 'Not in a footer either' },
        { type: 'paragraph', text: 'Questions? Ask the AI CoE.' },
        { type: 'supportRoute', label: 'Ask in the pilot channel', href: 'https://teams.microsoft.com/l/channel/contoso', stopWhen: ['a source is missing'], reportFields: ['the task type'], routes: [] },
        { type: 'bogus' },
        'text'
      ]
    });
    expect(shared.footer.map((block): string => block.type)).toEqual(['paragraph', 'supportRoute']);
    expect(parseShared(undefined)).toEqual({ footer: [] });
    expect(parseShared({ footer: 'soon' })).toEqual({ footer: [] });
    const document: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({
        version: 1,
        shared: { footer: [{ type: 'paragraph', text: 'Questions? Ask the AI CoE.' }] },
        pages: { learn: { title: 'Learn', blocks: [] } }
      })
    );
    expect(document).toEqual({
      version: 1,
      pages: { learn: { title: 'Learn', blocks: [] } },
      shared: { footer: [{ type: 'paragraph', text: 'Questions? Ask the AI CoE.' }] }
    });
    const damaged: IPageDocument | undefined = parsePageDocument(JSON.stringify({ version: 1, shared: ['x'], pages: { learn: { title: 'Learn', blocks: [] } } }));
    expect(damaged).toEqual({ version: 1, pages: { learn: { title: 'Learn', blocks: [] } } });
  });

  it('carries the release and the bindings the run wrote, and drops a malformed one, never the document', () => {
    const document: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({
        version: 1,
        release: { id: ' 2026-09-14-a ', publishedAt: '2026-09-14', source: ' SiteAssets/ai-coe-pages.json ' },
        bindings: [
          { name: ' AssistantUrl ', kind: 'url', state: 'awaiting' },
          { name: 'AssistantReceiptRef', kind: 'optional', state: 'bound', receiptRef: ' QR-0001 ' },
          { name: 'LeadersGroup', kind: 'group', state: 'bound' },
          // A row is only as good as its three fields; an unknown kind or state, or a value where none belongs, drops it.
          { name: 'Unknown', kind: 'secret', state: 'bound' },
          { name: 'Unstated', kind: 'url', state: 'maybe' },
          { kind: 'url', state: 'bound' },
          'text'
        ],
        pages: { operations: { title: 'Operations', blocks: [] } }
      })
    );
    expect(document).toEqual({
      version: 1,
      pages: { operations: { title: 'Operations', blocks: [] } },
      release: { id: '2026-09-14-a', publishedAt: '2026-09-14', source: 'SiteAssets/ai-coe-pages.json' },
      bindings: [
        { name: 'AssistantUrl', kind: 'url', state: 'awaiting' },
        { name: 'AssistantReceiptRef', kind: 'optional', state: 'bound', receiptRef: 'QR-0001' },
        { name: 'LeadersGroup', kind: 'group', state: 'bound' }
      ]
    });
    // A release needs an id; the published date is a calendar date or nothing, so no date is invented.
    const partial: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({ version: 1, release: { id: 'r1', publishedAt: 'last Tuesday' }, bindings: [], pages: { operations: { title: 'Operations', blocks: [] } } })
    );
    expect(partial).toEqual({ version: 1, pages: { operations: { title: 'Operations', blocks: [] } }, release: { id: 'r1' }, bindings: [] });
    const damaged: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({ version: 1, release: { publishedAt: '2026-09-14' }, bindings: { AssistantUrl: 'url' }, pages: { operations: { title: 'Operations', blocks: [] } } })
    );
    expect(damaged).toEqual({ version: 1, pages: { operations: { title: 'Operations', blocks: [] } } });
  });

  it('accepts the operator plane on a page and treats everything else as the user plane', () => {
    expect(readPlane('operator')).toBe('operator');
    expect(readPlane(' operator ')).toBe('operator');
    expect(readPlane('user')).toBe('user');
    expect(readPlane('OPERATOR')).toBe('user');
    expect(readPlane('admin')).toBe('user');
    expect(readPlane(undefined)).toBe('user');
    const document: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({
        version: 1,
        pages: {
          operations: { title: 'Operations', plane: 'operator', blocks: [] },
          learn: { title: 'Learn', plane: 'user', blocks: [] },
          status: { title: 'Status', plane: 'bogus', blocks: [] }
        }
      })
    );
    const pages: { [key: string]: IContentPage } = (document as IPageDocument).pages;
    expect(pages.operations).toEqual({ title: 'Operations', blocks: [], plane: 'operator' });
    expect(pages.learn).toEqual({ title: 'Learn', blocks: [] });
    expect(pages.status).toEqual({ title: 'Status', blocks: [] });
    expect(pagePlane(pages.operations)).toBe('operator');
    expect(pagePlane(pages.learn)).toBe('user');
  });

  it('reads the required role of a page as one id or a list of them, and drops a blank one', () => {
    const document: IPageDocument | undefined = parsePageDocument(
      JSON.stringify({
        version: 1,
        pages: {
          operations: { title: 'Operations', requiredRole: 'operator', blocks: [] },
          value: { title: 'Enterprise value', requiredRole: [' leader ', 'operator', '', 4], blocks: [] },
          learn: { title: 'Learn', requiredRole: [], blocks: [] },
          status: { title: 'Status', requiredRole: 7, blocks: [] }
        }
      })
    );
    const pages: { [key: string]: IContentPage } = (document as IPageDocument).pages;
    expect(pages.operations).toEqual({ title: 'Operations', blocks: [], requiredRole: ['operator'] });
    expect(pages.value).toEqual({ title: 'Enterprise value', blocks: [], requiredRole: ['leader', 'operator'] });
    // Nothing to satisfy is an open page: an empty list and a malformed value leave the page as it was.
    expect(pages.learn).toEqual({ title: 'Learn', blocks: [] });
    expect(pages.status).toEqual({ title: 'Status', blocks: [] });
  });
});

describe('blocks', () => {
  it('rejects anything that is not a typed object', () => {
    expect(parseBlock(undefined)).toBeUndefined();
    expect(parseBlock('hero')).toBeUndefined();
    expect(parseBlock({})).toBeUndefined();
    expect(parseBlock({ type: 'unknown', text: 'x' })).toBeUndefined();
  });

  it('carries the audience of any block as role ids, and leaves an absent or malformed one out', () => {
    expect(parseBlock({ type: 'paragraph', text: 'For leaders.', audience: [' leader ', 'operator', '', 4] })).toEqual({
      type: 'paragraph',
      text: 'For leaders.',
      audience: ['leader', 'operator']
    });
    expect(parseBlock({ type: 'heading', level: 2, text: 'Decisions', audience: ['leader'] })).toEqual({ type: 'heading', level: 2, text: 'Decisions', audience: ['leader'] });
    // An audience nobody can hold is still an audience: the block waits for a role rather than showing itself.
    expect(parseBlock({ type: 'paragraph', text: 'x', audience: ['auditor'] })).toEqual({ type: 'paragraph', text: 'x', audience: ['auditor'] });
    expect(parseBlock({ type: 'paragraph', text: 'x', audience: [] })).toEqual({ type: 'paragraph', text: 'x' });
    expect(parseBlock({ type: 'paragraph', text: 'x', audience: 'leader' })).toEqual({ type: 'paragraph', text: 'x' });
  });

  it('reads a hero with its optional badge, text and call to action', () => {
    expect(parseBlock({ type: 'hero', title: 'What do you need done?' })).toEqual({ type: 'hero', title: 'What do you need done?' });
    const hero: IHeroBlock = parseBlock({
      type: 'hero',
      title: ' T ',
      text: 'Ask [us](https://x/y).',
      badge: 'Pilot',
      cta: { label: 'Start a request', href: 'SitePages/Requests.aspx' }
    }) as IHeroBlock;
    expect(hero).toEqual({ type: 'hero', title: 'T', text: 'Ask [us](https://x/y).', badge: 'Pilot', cta: { label: 'Start a request', href: 'SitePages/Requests.aspx' } });
    expect(parseBlock({ type: 'hero', title: 'T', cta: { label: 'Go', href: ' ' } })).toEqual({ type: 'hero', title: 'T' });
    expect(parseBlock({ type: 'hero', title: 'T', cta: { href: 'x' } })).toEqual({ type: 'hero', title: 'T' });
    expect(parseBlock({ type: 'hero', text: 'no title' })).toBeUndefined();
    expect(parseBlock({ type: 'hero', title: '  ' })).toBeUndefined();
  });

  it('reads a call to action with a state or a route and no link, and its note', () => {
    expect(parseBlock({ type: 'hero', title: 'T', cta: { label: 'Go', state: 'needsAccess' } })).toEqual({ type: 'hero', title: 'T', cta: { label: 'Go', state: 'needsAccess' } });
    expect(parseBlock({ type: 'hero', title: 'T', cta: { label: 'Go', href: '', route: ' work ', note: ' Opens the assistant. ' } })).toEqual({
      type: 'hero',
      title: 'T',
      cta: { label: 'Go', route: 'work', note: 'Opens the assistant.' }
    });
    expect(parseBlock({ type: 'hero', title: 'T', cta: { label: 'Go', href: 'SitePages/x.aspx', state: ' ACTIVE ', route: 'work' } })).toEqual({
      type: 'hero',
      title: 'T',
      cta: { label: 'Go', href: 'SitePages/x.aspx', state: 'ACTIVE', route: 'work' }
    });
    expect(parseBlock({ type: 'hero', title: 'T', cta: { label: 'Go', state: 'bogus' } })).toEqual({ type: 'hero', title: 'T' });
    expect(parseBlock({ type: 'hero', title: 'T', cta: { state: 'needsAccess' } })).toEqual({ type: 'hero', title: 'T' });
  });

  it('reads headings at level 2 or 3 and paragraphs', () => {
    expect(parseBlock({ type: 'heading', text: 'The three lanes' })).toEqual({ type: 'heading', level: 2, text: 'The three lanes' });
    expect(parseBlock({ type: 'heading', level: 3, text: 'Sub' })).toEqual({ type: 'heading', level: 3, text: 'Sub' });
    expect(parseBlock({ type: 'heading', level: 5, text: 'Sub' })).toEqual({ type: 'heading', level: 2, text: 'Sub' });
    expect(parseBlock({ type: 'heading', level: '3', text: 'Sub' })).toEqual({ type: 'heading', level: 2, text: 'Sub' });
    expect(parseBlock({ type: 'heading', text: '' })).toBeUndefined();
    expect(parseBlock({ type: 'paragraph', text: ' Words **here**. ' })).toEqual({ type: 'paragraph', text: 'Words **here**.' });
    expect(parseBlock({ type: 'paragraph' })).toBeUndefined();
  });

  it('reads tiles with a teal default tone and drops items without a title or target', () => {
    const tiles: ITilesBlock = parseBlock({
      type: 'tiles',
      items: [
        { title: 'Ask the AI CoE', href: 'https://teams/x', description: 'Talk to us', icon: 'MessageSquare', tone: 'blue' },
        { title: 'Check status', href: 'SitePages/Status.aspx', tone: 'plaid' },
        { title: 'No target', href: '' },
        { href: 'SitePages/x.aspx' },
        'nope'
      ]
    }) as ITilesBlock;
    expect(tiles).toEqual({
      type: 'tiles',
      items: [
        { title: 'Ask the AI CoE', href: 'https://teams/x', description: 'Talk to us', icon: 'MessageSquare', tone: 'blue' },
        { title: 'Check status', href: 'SitePages/Status.aspx', tone: 'teal' }
      ]
    });
    expect(parseBlock({ type: 'tiles', items: [] })).toBeUndefined();
    expect(parseBlock({ type: 'tiles', items: [{ title: 'x' }] })).toBeUndefined();
    expect(parseBlock({ type: 'tiles' })).toBeUndefined();
  });

  it('reads prominent tiles with a kicker, a note, a state or a route, which may have no link', () => {
    const tiles: ITilesBlock = parseBlock({
      type: 'tiles',
      prominent: true,
      items: [
        { title: 'Ask the assistant', kicker: ' Ask ', note: ' Opens in a new tab. ', route: ' assistant ', tone: 'teal' },
        { title: 'Work command', href: '', state: 'needsAccess' },
        { title: 'Improve a task', href: 'SitePages/Check-a-tool-or-task.aspx', state: ' AVAILABLE ', route: 'improve' },
        { title: 'Bogus state', href: 'SitePages/x.aspx', state: 'bogus' },
        { title: 'Nothing', href: '', state: 'bogus' }
      ]
    }) as ITilesBlock;
    expect(tiles).toEqual({
      type: 'tiles',
      prominent: true,
      items: [
        { title: 'Ask the assistant', kicker: 'Ask', note: 'Opens in a new tab.', route: 'assistant', tone: 'teal' },
        { title: 'Work command', state: 'needsAccess', tone: 'teal' },
        { title: 'Improve a task', href: 'SitePages/Check-a-tool-or-task.aspx', state: 'AVAILABLE', route: 'improve', tone: 'teal' },
        { title: 'Bogus state', href: 'SitePages/x.aspx', tone: 'teal' }
      ]
    });
    expect(parseBlock({ type: 'tiles', prominent: 'yes', items: [{ title: 'x', href: 'y' }] })).toEqual({ type: 'tiles', items: [{ title: 'x', href: 'y', tone: 'teal' }] });
    expect(parseBlock({ type: 'tiles', prominent: false, items: [{ title: 'x', href: 'y' }] })).toEqual({ type: 'tiles', items: [{ title: 'x', href: 'y', tone: 'teal' }] });
  });

  it('reads cards in two or three columns with paragraph bodies', () => {
    const cards: ICardsBlock = parseBlock({
      type: 'cards',
      columns: 3,
      items: [
        { title: 'A', kicker: '2 minutes', body: 'First.\n\nSecond.', meta: 'Copilot Chat', tone: 'gold' },
        { title: 'B', body: ['a', '', ' b '] },
        { title: 'C' },
        { body: 'no title' }
      ]
    }) as ICardsBlock;
    expect(cards).toEqual({
      type: 'cards',
      columns: 3,
      items: [
        { title: 'A', kicker: '2 minutes', body: ['First.', 'Second.'], meta: 'Copilot Chat', tone: 'gold' },
        { title: 'B', body: ['a', 'b'], tone: 'teal' },
        { title: 'C', body: [], tone: 'teal' }
      ]
    });
    expect((parseBlock({ type: 'cards', items: [{ title: 'A' }] }) as ICardsBlock).columns).toBe(2);
    expect((parseBlock({ type: 'cards', columns: 4, items: [{ title: 'A' }] }) as ICardsBlock).columns).toBe(2);
    expect(parseBlock({ type: 'cards', columns: 2, items: [] })).toBeUndefined();
  });

  it('reads a state, a route, an as-of date, a source and the example flag on cards', () => {
    const cards: ICardsBlock = parseBlock({
      type: 'cards',
      items: [
        { title: 'What is running', body: 'x', state: ' availableNow ', route: ' assistant ', asOf: ' 2026-09-01 ', source: ' Read back from the tenant. ' },
        { title: 'Loose', body: 'y', state: 'bogus', asOf: 'last Friday', source: '', illustrative: 'yes' },
        { title: 'Example', body: 'z', asOf: '2026-08-28', illustrative: true }
      ]
    }) as ICardsBlock;
    expect(cards.items).toEqual([
      { title: 'What is running', body: ['x'], tone: 'teal', state: 'availableNow', route: 'assistant', asOf: '2026-09-01', source: 'Read back from the tenant.' },
      { title: 'Loose', body: ['y'], tone: 'teal' },
      { title: 'Example', body: ['z'], tone: 'teal', asOf: '2026-08-28', illustrative: true }
    ]);
  });

  it('reads lanes and drops items whose tone is not a traffic light', () => {
    const lanes: ILanesBlock = parseBlock({
      type: 'lanes',
      items: [
        { tone: 'green', title: 'Green', body: 'Just do it.', note: 'No form.', badge: 'Go' },
        { tone: 'amber', title: 'Amber', body: ['Ask first.'] },
        { tone: 'red', title: 'Red', body: 'Stop.' },
        { tone: 'teal', title: 'Teal', body: 'x' },
        { tone: 'green', body: 'no title' }
      ]
    }) as ILanesBlock;
    expect(lanes.items).toEqual([
      { tone: 'green', title: 'Green', body: ['Just do it.'], note: 'No form.', badge: 'Go' },
      { tone: 'amber', title: 'Amber', body: ['Ask first.'] },
      { tone: 'red', title: 'Red', body: ['Stop.'] }
    ]);
    expect(parseBlock({ type: 'lanes', items: [{ tone: 'teal', title: 'x' }] })).toBeUndefined();
  });

  it('reads a status row of labelled lines', () => {
    expect(parseBlock({ type: 'statusRow', items: [{ label: 'Status', text: 'Green' }, { label: 'x' }, { text: 'y' }] })).toEqual({
      type: 'statusRow',
      items: [{ label: 'Status', text: 'Green' }]
    });
    expect(parseBlock({ type: 'statusRow', items: [] })).toBeUndefined();
  });

  it('reads a state, a route, an as-of date, a source and the example flag on status items', () => {
    expect(
      parseBlock({
        type: 'statusRow',
        items: [
          { label: 'Assistant', text: 'Answering from approved sources.', state: ' AVAILABLE ', route: ' assistant ', asOf: '2026-09-01', source: ' Tenant read-back ' },
          { label: 'Prompts', text: 'All draft.', state: 'bogus', asOf: '2026-9-1', source: '  ', illustrative: 1 },
          { label: 'Example', text: 'Made up.', illustrative: true }
        ]
      })
    ).toEqual({
      type: 'statusRow',
      items: [
        { label: 'Assistant', text: 'Answering from approved sources.', state: 'AVAILABLE', route: 'assistant', asOf: '2026-09-01', source: 'Tenant read-back' },
        { label: 'Prompts', text: 'All draft.' },
        { label: 'Example', text: 'Made up.', illustrative: true }
      ]
    });
  });

  it('reads a work command, fills its defaults and drops one without a prompt', () => {
    expect(parseWorkCommand({ prompt: ' What do you need done? ' })).toEqual({
      type: 'workCommand',
      prompt: 'What do you need done?',
      submitLabel: 'Start',
      route: 'work',
      emptyText: 'Say what you need done first.'
    });
    const command: IWorkCommandBlock = parseBlock({
      type: 'workCommand',
      prompt: 'Tell us',
      placeholder: ' One sentence. ',
      submitLabel: ' Go ',
      route: ' assistant ',
      note: ' Saved as a **draft**. ',
      emptyText: ' Say something. '
    }) as IWorkCommandBlock;
    expect(command).toEqual({ type: 'workCommand', prompt: 'Tell us', placeholder: 'One sentence.', submitLabel: 'Go', route: 'assistant', note: 'Saved as a **draft**.', emptyText: 'Say something.' });
    expect(parseWorkCommand({ prompt: 'Tell us', placeholder: '', submitLabel: '  ', route: 3, note: 7, emptyText: ' ' })).toEqual({
      type: 'workCommand',
      prompt: 'Tell us',
      submitLabel: 'Start',
      route: 'work',
      emptyText: 'Say what you need done first.'
    });
    expect(parseWorkCommand({ prompt: '  ', submitLabel: 'Go' })).toBeUndefined();
    expect(parseWorkCommand({ submitLabel: 'Go' })).toBeUndefined();
    expect(parseBlock({ type: 'workCommand' })).toBeUndefined();
  });

  it('reads a notice with an info default tone, an optional title, and drops one without text', () => {
    expect(parseNotice({ text: ' Never paste customer data. ' })).toEqual({ type: 'notice', tone: 'info', text: 'Never paste customer data.' });
    const caution: INoticeBlock = parseBlock({ type: 'notice', tone: ' caution ', title: ' Data boundary ', text: 'Keep **personal data** out of every prompt.' }) as INoticeBlock;
    expect(caution).toEqual({ type: 'notice', tone: 'caution', title: 'Data boundary', text: 'Keep **personal data** out of every prompt.' });
    // An unknown tone, a blank title and a non-string title fall back rather than dropping the notice.
    expect(parseNotice({ tone: 'danger', title: '   ', text: 'Read this.' })).toEqual({ type: 'notice', tone: 'info', text: 'Read this.' });
    expect(parseNotice({ tone: 3, title: 7, text: 'Read this.' })).toEqual({ type: 'notice', tone: 'info', text: 'Read this.' });
    expect(parseNotice({ tone: 'caution', title: 'Data boundary' })).toBeUndefined();
    expect(parseNotice({ tone: 'caution', text: '   ' })).toBeUndefined();
    expect(parseBlock({ type: 'notice' })).toBeUndefined();
  });

  it('reads rules as titled items, ordered unless the block says otherwise, and drops a block without a titled item', () => {
    expect(parseRules({ items: [{ title: ' Check every number. ' }] })).toEqual({ type: 'rules', ordered: true, items: [{ title: 'Check every number.' }] });
    const rules: IRulesBlock = parseBlock({
      type: 'rules',
      title: ' Three rules ',
      ordered: false,
      items: [
        { title: 'You decide', text: ' The tool *suggests*; you decide. ' },
        { text: 'No title here' },
        'not an item',
        { title: '   ', text: 'Blank title' },
        { title: 'Say when you used it', text: '' }
      ]
    }) as IRulesBlock;
    expect(rules).toEqual({
      type: 'rules',
      title: 'Three rules',
      ordered: false,
      items: [
        { title: 'You decide', text: 'The tool *suggests*; you decide.' },
        { title: 'Say when you used it' }
      ]
    });
    // Only a literal false turns the numbering off; anything else keeps the default.
    expect((parseRules({ ordered: 'false', items: [{ title: 'A' }] }) as IRulesBlock).ordered).toBe(true);
    expect((parseRules({ ordered: 0, items: [{ title: 'A' }] }) as IRulesBlock).ordered).toBe(true);
    expect((parseRules({ ordered: true, items: [{ title: 'A' }] }) as IRulesBlock).ordered).toBe(true);
    expect(parseRules({ title: 'Three rules', items: [{ text: 'no title' }] })).toBeUndefined();
    expect(parseRules({ title: 'Three rules', items: [] })).toBeUndefined();
    expect(parseRules({ title: 'Three rules', items: 'not a list' })).toBeUndefined();
    expect(parseRules({ title: 'Three rules' })).toBeUndefined();
    expect(parseBlock({ type: 'rules' })).toBeUndefined();
  });

  it('reads a support route with its stop list, report fields and routing rows, and drops one without a label', () => {
    const block: ISupportRouteBlock = parseBlock({
      type: 'supportRoute',
      label: ' Ask in the pilot channel ',
      href: ' https://teams.microsoft.com/l/channel/contoso ',
      stopWhen: [' a source is missing ', '', 7, 'a claim cannot be verified'],
      reportFields: ['the task type', ' the time '],
      routes: [
        { issue: ' Wrong identity or access ', owner: ' Identity owner ', action: ' Stop; do not widen access ', kind: ' identity ' },
        { issue: 'Outcome is uncertain after an action', owner: '   ', action: 'Reconcile the native state before retrying', kind: 'recovery' },
        { issue: 'A claim looks wrong', kind: 'bogus' },
        { issue: 'Anything else', owner: 'Support desk', kind: 'support' },
        { owner: 'Nobody', action: 'No issue named' },
        'not a row'
      ]
    }) as ISupportRouteBlock;
    expect(block).toEqual({
      type: 'supportRoute',
      label: 'Ask in the pilot channel',
      href: 'https://teams.microsoft.com/l/channel/contoso',
      stopWhen: ['a source is missing', 'a claim cannot be verified'],
      reportFields: ['the task type', 'the time'],
      routes: [
        { issue: 'Wrong identity or access', owner: 'Identity owner', action: 'Stop; do not widen access', kind: 'identity' },
        { issue: 'Outcome is uncertain after an action', action: 'Reconcile the native state before retrying', kind: 'recovery' },
        // An unknown kind is dropped, never the row: the failure notice then cannot route to it, and says so.
        { issue: 'A claim looks wrong' },
        { issue: 'Anything else', owner: 'Support desk', kind: 'support' }
      ]
    });
    // The lists and the rows are optional; the label alone makes a block, without a link.
    expect(parseSupportRoute({ label: 'Ask the AI CoE' })).toEqual({ type: 'supportRoute', label: 'Ask the AI CoE', stopWhen: [], reportFields: [], routes: [] });
    expect(parseSupportRoute({ label: 'Ask the AI CoE', href: '  ', stopWhen: 'not a list', reportFields: {}, routes: 'nope' })).toEqual({
      type: 'supportRoute',
      label: 'Ask the AI CoE',
      stopWhen: [],
      reportFields: [],
      routes: []
    });
    expect(parseSupportRoute({ href: 'https://teams.microsoft.com/l/channel/contoso', stopWhen: ['x'] })).toBeUndefined();
    expect(parseSupportRoute({ label: '   ' })).toBeUndefined();
    expect(parseBlock({ type: 'supportRoute' })).toBeUndefined();
  });

  it('reads the three embeddable pieces and keeps only known page targets', () => {
    const home: IPieceBlock = parseBlock({
      type: 'piece',
      piece: 'home',
      pages: { idea: 'SitePages/Idea.aspx', policy: '', admin: ' SitePages/Admin.aspx ', bogus: 'x', toolCheck: 3 }
    }) as IPieceBlock;
    expect(home).toEqual({ type: 'piece', piece: 'home', pages: { idea: 'SitePages/Idea.aspx', admin: 'SitePages/Admin.aspx' } });
    expect(parseBlock({ type: 'piece', piece: 'telemetry', pages: { idea: 'x' } })).toEqual({ type: 'piece', piece: 'telemetry', pages: {} });
    expect(parseBlock({ type: 'piece', piece: 'home' })).toEqual({ type: 'piece', piece: 'home', pages: {} });
    expect(parseBlock({ type: 'piece', piece: 'myWork', pages: { idea: 'x' } })).toEqual({ type: 'piece', piece: 'myWork', pages: {} });
    expect(parseBlock({ type: 'piece', piece: 'admin' })).toBeUndefined();
    expect(parseBlock({ type: 'piece' })).toBeUndefined();
  });

  it('reads a kicker on the telemetry piece only', () => {
    expect(parseBlock({ type: 'piece', piece: 'telemetry', kicker: ' Diagnostics: usage feed ' })).toEqual({ type: 'piece', piece: 'telemetry', pages: {}, kicker: 'Diagnostics: usage feed' });
    expect(parseBlock({ type: 'piece', piece: 'telemetry', kicker: '   ' })).toEqual({ type: 'piece', piece: 'telemetry', pages: {} });
    expect(parseBlock({ type: 'piece', piece: 'telemetry', kicker: 7 })).toEqual({ type: 'piece', piece: 'telemetry', pages: {} });
    expect(parseBlock({ type: 'piece', piece: 'home', kicker: 'x' })).toEqual({ type: 'piece', piece: 'home', pages: {} });
    expect(parseBlock({ type: 'piece', piece: 'myWork', kicker: 'x' })).toEqual({ type: 'piece', piece: 'myWork', pages: {} });
  });

  it('reads a status strip of request counts and labelled lines, filling the two default texts', () => {
    const strip: IStatusStripBlock = parseBlock({
      type: 'statusStrip',
      items: [
        { kind: 'myRequests', label: ' My requests ', href: ' SitePages/Status.aspx ' },
        { label: 'Assistant', text: 'Answering from approved sources.', state: ' AVAILABLE ', route: ' assistant ', asOf: '2026-09-01', source: ' Tenant read-back ' },
        { kind: 'text', label: 'Prompts', text: 'All draft.', state: 'bogus', asOf: '2026-9-1', source: '  ', illustrative: 'true' },
        { kind: 'text', label: 'Example', text: 'Made up.', illustrative: true },
        { kind: 'text', label: 'No text' },
        { kind: 'myRequests', text: 'No label' },
        { kind: 'cases', label: 'Unknown kind', text: 'x' },
        'text'
      ]
    }) as IStatusStripBlock;
    expect(strip).toEqual({
      type: 'statusStrip',
      items: [
        { kind: 'myRequests', label: 'My requests', href: 'SitePages/Status.aspx' },
        { kind: 'text', label: 'Assistant', text: 'Answering from approved sources.', state: 'AVAILABLE', route: 'assistant', asOf: '2026-09-01', source: 'Tenant read-back' },
        { kind: 'text', label: 'Prompts', text: 'All draft.' },
        { kind: 'text', label: 'Example', text: 'Made up.', illustrative: true }
      ],
      emptyText: 'No requests from you yet.',
      unavailableText: 'Status unavailable: the request list could not be read.'
    });
    expect(
      parseBlock({ type: 'statusStrip', items: [{ kind: 'myRequests', label: 'Mine', text: 'Yours:' }], emptyText: ' Nothing yet. ', unavailableText: ' Not now. ' })
    ).toEqual({
      type: 'statusStrip',
      items: [{ kind: 'myRequests', label: 'Mine', text: 'Yours:' }],
      emptyText: 'Nothing yet.',
      unavailableText: 'Not now.'
    });
    expect(parseBlock({ type: 'statusStrip', items: [] })).toBeUndefined();
    expect(parseBlock({ type: 'statusStrip', items: [{ kind: 'text', label: 'x' }] })).toBeUndefined();
    expect(parseBlock({ type: 'statusStrip' })).toBeUndefined();
    // The strip may sit in the shared footer; the pieces still may not.
    expect(parseShared({ footer: [{ type: 'statusStrip', items: [{ kind: 'myRequests', label: 'Mine' }] }, { type: 'piece', piece: 'myWork' }] }).footer.map((block): string => block.type)).toEqual(['statusStrip']);
  });

  it('reads case cards: an id, a title and a canonical status code each, with the historical stage and health, the source date, the next action and the caption', () => {
    const cases: ICaseCardsBlock = parseBlock({
      type: 'caseCards',
      items: [
        {
          id: ' EXAMPLE-01 ',
          title: ' Example case ',
          description: ' Shows a case. ',
          state: ' AWAITING_SOURCE ',
          historicalStage: ' Validate ',
          historicalHealth: 'amber',
          sourceDate: '2026-08-28',
          nextAction: ' Read the source. ',
          caption: ' Do not infer progress ',
          illustrative: true,
          // Where the block will read its cases from once a cases list exists: parsed and ignored until then.
          source: { list: 'AI CoE Cases' }
        },
        { id: 'C-2', title: 'Loose fields', state: 'IN_DELIVERY', historicalHealth: 'teal', sourceDate: 'last Friday', illustrative: 'yes', description: '', nextAction: 7, caption: '  ' },
        { id: 'C-3', title: 'A pilot word is not a canonical code', state: 'Submitted - Pilot' },
        { id: 'C-4', title: 'Unknown code', state: 'SHIPPED' },
        { id: 'C-5', title: 'No state' },
        { title: 'No id', state: 'DRAFT' },
        { id: 'C-7', state: 'DRAFT' },
        'text'
      ]
    }) as ICaseCardsBlock;
    expect(cases).toEqual({
      type: 'caseCards',
      items: [
        {
          id: 'EXAMPLE-01',
          title: 'Example case',
          description: 'Shows a case.',
          state: 'AWAITING_SOURCE',
          historicalStage: 'Validate',
          historicalHealth: 'amber',
          sourceDate: '2026-08-28',
          nextAction: 'Read the source.',
          caption: 'Do not infer progress',
          illustrative: true
        },
        { id: 'C-2', title: 'Loose fields', state: 'IN_DELIVERY' }
      ]
    });
    expect(parseBlock({ type: 'caseCards', items: [] })).toBeUndefined();
    expect(parseBlock({ type: 'caseCards', items: [{ id: 'x', title: 'y', state: 'bogus' }] })).toBeUndefined();
    expect(parseBlock({ type: 'caseCards' })).toBeUndefined();
    // A malformed source is ignored like a well-formed one: the block reads no list yet.
    expect((parseBlock({ type: 'caseCards', items: [{ id: 'x', title: 'y', state: 'DRAFT', source: 'AI CoE Cases' }] }) as ICaseCardsBlock).items).toEqual([{ id: 'x', title: 'y', state: 'DRAFT' }]);
    // Every canonical code is accepted; the block is a page block like the others and may sit in the shared footer.
    for (const code of CANONICAL_STATUS) {
      expect((parseBlock({ type: 'caseCards', items: [{ id: 'x', title: 'y', state: code }] }) as ICaseCardsBlock).items[0].state).toBe(code);
    }
    expect(parseShared({ footer: [{ type: 'caseCards', items: [{ id: 'x', title: 'y', state: 'DRAFT' }] }] }).footer.map((block): string => block.type)).toEqual(['caseCards']);
  });

  it('reads measure tiles: an id each, an optional label and example flag, and nothing the row alone may say', () => {
    const kpi: IKpiBlock = parseBlock({
      type: 'kpi',
      items: [
        { id: ' useful-safe-completion-rate ', label: ' Useful safe completion rate ' },
        // A tile that illustrates how a measure reads carries the flag; the number still comes from the row.
        { id: 'median-time-to-useful-outcome', illustrative: true },
        // Anything a document might be tempted to assert about a measure is dropped: only the list holds these.
        { id: 'repeat-use', label: '', value: 0.62, unit: '%', state: 'MEASURED', periodEnd: '2026-06-30', evidenceRef: 'EV-2026-Q2', cohortSize: 48, illustrative: 'yes' },
        { label: 'No id' },
        { id: '   ' },
        'text'
      ],
      unavailableText: ' No measures could be read. '
    }) as IKpiBlock;
    expect(kpi).toEqual({
      type: 'kpi',
      items: [
        { id: 'useful-safe-completion-rate', label: 'Useful safe completion rate' },
        { id: 'median-time-to-useful-outcome', illustrative: true },
        { id: 'repeat-use' }
      ],
      unavailableText: 'No measures could be read.'
    });
    expect((parseBlock({ type: 'kpi', items: [{ id: 'a' }] }) as IKpiBlock).unavailableText).toBe(DEFAULT_KPI_UNAVAILABLE_TEXT);
    expect(DEFAULT_KPI_UNAVAILABLE_TEXT).toBe('Measures unavailable: the measures list could not be read.');
    expect(parseBlock({ type: 'kpi', items: [] })).toBeUndefined();
    expect(parseBlock({ type: 'kpi', items: [{ label: 'No id' }] })).toBeUndefined();
    expect(parseBlock({ type: 'kpi' })).toBeUndefined();
    // The block may name the roles it is written for, like every other block, and may sit in the shared footer.
    expect((parseBlock({ type: 'kpi', items: [{ id: 'a' }], audience: ['leader'] }) as IKpiBlock).audience).toEqual(['leader']);
    expect(parseShared({ footer: [{ type: 'kpi', items: [{ id: 'a' }] }] }).footer.map((block): string => block.type)).toEqual(['kpi']);
  });

  it('reads the bindings block, with or without a title of its own', () => {
    expect(parseBlock({ type: 'bindings' })).toEqual({ type: 'bindings' });
    expect(parseBlock({ type: 'bindings', title: '  Tenant bindings  ' })).toEqual({ type: 'bindings', title: 'Tenant bindings' });
    expect(parseBlock({ type: 'bindings', title: '   ' })).toEqual({ type: 'bindings' });
    // The block renders what the run wrote on the document; it carries no binding of its own.
    expect(parseBlock({ type: 'bindings', items: [{ name: 'AssistantUrl' }] })).toEqual({ type: 'bindings' });
    expect((parseBlock({ type: 'bindings', audience: ['operator'] }) as IBindingsBlock).audience).toEqual(['operator']);
  });
});

describe('paragraph bodies', () => {
  it('splits a string on blank lines and cleans an array', () => {
    expect(readParagraphs('a\n\nb')).toEqual(['a', 'b']);
    expect(readParagraphs('a\r\n \r\n b ')).toEqual(['a', 'b']);
    expect(readParagraphs('single line\nwith a break')).toEqual(['single line\nwith a break']);
    expect(readParagraphs(['a', '', ' b ', 3])).toEqual(['a', 'b']);
    expect(readParagraphs(undefined)).toEqual([]);
    expect(readParagraphs(42)).toEqual([]);
  });
});

describe('content links', () => {
  it('resolves site paths against the site and leaves other targets alone', () => {
    expect(resolveContentHref(SITE, 'SitePages/Requests.aspx')).toBe(`${SITE}/SitePages/Requests.aspx`);
    expect(resolveContentHref(`${SITE}/`, ' SitePages/Requests.aspx ')).toBe(`${SITE}/SitePages/Requests.aspx`);
    expect(resolveContentHref(SITE, '/sites/other/x.aspx')).toBe('/sites/other/x.aspx');
    expect(resolveContentHref(SITE, 'https://teams.microsoft.com/l/x')).toBe('https://teams.microsoft.com/l/x');
    expect(resolveContentHref(SITE, '#paths')).toBe('#paths');
    expect(resolveContentHref(SITE, '?view=page&page=learn')).toBe('?view=page&page=learn');
    expect(resolveContentHref(SITE, 'mailto:coe@contoso.com')).toBe('mailto:coe@contoso.com');
    expect(resolveContentHref(SITE, 'MAILTO:coe@contoso.com')).toBe('MAILTO:coe@contoso.com');
    expect(resolveContentHref(SITE, 'http://intranet.contoso.com/x')).toBe('http://intranet.contoso.com/x');
    expect(resolveContentHref(SITE, 'HTTPS://CONTOSO.sharepoint.com/sites/ai/x')).toBe('HTTPS://CONTOSO.sharepoint.com/sites/ai/x');
    expect(resolveContentHref(SITE, '')).toBe('#');
  });

  it('renders any scheme outside the allow-list as a dead anchor, never appended to the site', () => {
    expect(resolveContentHref(SITE, 'javascript:alert(1)')).toBe('#');
    expect(resolveContentHref(SITE, 'JavaScript:alert(1)')).toBe('#');
    expect(resolveContentHref(SITE, '  javascript:alert(1)')).toBe('#');
    expect(resolveContentHref(SITE, 'data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(resolveContentHref(SITE, 'vbscript:MsgBox(1)')).toBe('#');
    expect(resolveContentHref(SITE, 'tel:+15551234567')).toBe('#');
    expect(resolveContentHref(SITE, 'ms-word:ofe|u|https://x')).toBe('#');
    expect(resolveContentHref(SITE, 'file:///C:/x')).toBe('#');
    expect(resolveContentHref(SITE, '//evil.example/x')).toBe('#');
    expect(resolveContentHref(SITE, 'javascript:alert(1)')).not.toContain(SITE);
    // A colon later in a path is not a scheme: the page path still resolves against the site.
    expect(resolveContentHref(SITE, 'SitePages/Requests.aspx?u=javascript:alert(1)')).toBe(`${SITE}/SitePages/Requests.aspx?u=javascript:alert(1)`);
  });

  it('tells an off-site URL from a site path or a same-origin URL', () => {
    expect(isExternalHref(SITE, 'https://teams.microsoft.com/l/x')).toBe(true);
    expect(isExternalHref(SITE, 'http://contoso.sharepoint.com/sites/ai/x')).toBe(true);
    expect(isExternalHref(SITE, 'HTTPS://CONTOSO.sharepoint.com/sites/ai/SitePages/x.aspx')).toBe(false);
    expect(isExternalHref(SITE, `${SITE}/SitePages/Status.aspx`)).toBe(false);
    expect(isExternalHref(SITE, 'SitePages/Status.aspx')).toBe(false);
    expect(isExternalHref(SITE, '/sites/other/x.aspx')).toBe(false);
    expect(isExternalHref(SITE, 'mailto:coe@contoso.com')).toBe(false);
    expect(isExternalHref(SITE, '#top')).toBe(false);
  });

  it('defaults the document path and trims a configured one', () => {
    expect(DEFAULT_CONTENT_URL).toBe('SiteAssets/ai-coe-pages.json');
    expect(parseContentUrl(undefined)).toBe(DEFAULT_CONTENT_URL);
    expect(parseContentUrl('   ')).toBe(DEFAULT_CONTENT_URL);
    expect(parseContentUrl(7)).toBe(DEFAULT_CONTENT_URL);
    expect(parseContentUrl(' SiteAssets/other.json ')).toBe('SiteAssets/other.json');
    expect(parseContentUrl('/sites/ai/SiteAssets/x.json')).toBe('/sites/ai/SiteAssets/x.json');
  });

  it('reads a configured document path as optional: blank means none, so a form page without one reads nothing', () => {
    expect(parseOptionalContentUrl(undefined)).toBeUndefined();
    expect(parseOptionalContentUrl('   ')).toBeUndefined();
    expect(parseOptionalContentUrl(7)).toBeUndefined();
    expect(parseOptionalContentUrl(' SiteAssets/other.json ')).toBe('SiteAssets/other.json');
  });
});

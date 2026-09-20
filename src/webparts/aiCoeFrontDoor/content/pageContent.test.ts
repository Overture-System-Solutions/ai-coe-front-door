import {
  DEFAULT_CONTENT_URL,
  DEFAULT_SETTINGS,
  DEFAULT_VOCABULARY,
  PAGE_DOCUMENT_VERSION,
  pagePlane,
  parseBlock,
  parseContentUrl,
  parsePageDocument,
  parseSettings,
  parseVocabulary,
  readPlane,
  readParagraphs,
  resolveContentHref
} from './pageContent';
import type { ICardsBlock, IContentPage, IHeroBlock, ILanesBlock, IPageDocument, IPieceBlock, ITilesBlock, IVocabulary } from './pageContent';

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
});

describe('blocks', () => {
  it('rejects anything that is not a typed object', () => {
    expect(parseBlock(undefined)).toBeUndefined();
    expect(parseBlock('hero')).toBeUndefined();
    expect(parseBlock({})).toBeUndefined();
    expect(parseBlock({ type: 'unknown', text: 'x' })).toBeUndefined();
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

  it('reads the two embeddable pieces and keeps only known page targets', () => {
    const home: IPieceBlock = parseBlock({
      type: 'piece',
      piece: 'home',
      pages: { idea: 'SitePages/Idea.aspx', policy: '', admin: ' SitePages/Admin.aspx ', bogus: 'x', toolCheck: 3 }
    }) as IPieceBlock;
    expect(home).toEqual({ type: 'piece', piece: 'home', pages: { idea: 'SitePages/Idea.aspx', admin: 'SitePages/Admin.aspx' } });
    expect(parseBlock({ type: 'piece', piece: 'telemetry', pages: { idea: 'x' } })).toEqual({ type: 'piece', piece: 'telemetry', pages: {} });
    expect(parseBlock({ type: 'piece', piece: 'home' })).toEqual({ type: 'piece', piece: 'home', pages: {} });
    expect(parseBlock({ type: 'piece', piece: 'admin' })).toBeUndefined();
    expect(parseBlock({ type: 'piece' })).toBeUndefined();
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
    expect(resolveContentHref(SITE, '')).toBe('#');
  });

  it('defaults the document path and trims a configured one', () => {
    expect(DEFAULT_CONTENT_URL).toBe('SiteAssets/ai-coe-pages.json');
    expect(parseContentUrl(undefined)).toBe(DEFAULT_CONTENT_URL);
    expect(parseContentUrl('   ')).toBe(DEFAULT_CONTENT_URL);
    expect(parseContentUrl(7)).toBe(DEFAULT_CONTENT_URL);
    expect(parseContentUrl(' SiteAssets/other.json ')).toBe('SiteAssets/other.json');
    expect(parseContentUrl('/sites/ai/SiteAssets/x.json')).toBe('/sites/ai/SiteAssets/x.json');
  });
});

import {
  createPageViewSettings,
  DEFAULT_FRONT_DOOR_VIEW,
  DEFAULT_PIECE_LAYOUT,
  FRONT_DOOR_VIEWS,
  isWorkflowView,
  PAGE_TARGET_PROPERTIES,
  PAGE_TARGETS,
  parseFrontDoorView,
  parsePieceLayout,
  PIECE_LAYOUTS,
  resolvePageUrl
} from './pageViews';
import type { IPageViewSettings } from './pageViews';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';

describe('front door views', () => {
  it('defaults to legacy and accepts the ten views case-insensitively', () => {
    expect(FRONT_DOOR_VIEWS).toEqual(['legacy', 'home', 'idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'telemetry', 'admin', 'page']);
    expect(DEFAULT_FRONT_DOOR_VIEW).toBe('legacy');
    expect(parseFrontDoorView(undefined)).toBe('legacy');
    expect(parseFrontDoorView('')).toBe('legacy');
    expect(parseFrontDoorView('landing')).toBe('legacy');
    expect(parseFrontDoorView(42)).toBe('legacy');
    expect(parseFrontDoorView(' Home ')).toBe('home');
    expect(parseFrontDoorView('TOOLCHECK')).toBe('toolCheck');
    expect(parseFrontDoorView('helptraining')).toBe('helpTraining');
    expect(parseFrontDoorView('admin')).toBe('admin');
    expect(parseFrontDoorView('PAGE')).toBe('page');
  });

  it('identifies the five workflow views', () => {
    expect(FRONT_DOOR_VIEWS.filter(isWorkflowView)).toEqual(['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback']);
    expect(isWorkflowView('legacy')).toBe(false);
    expect(isWorkflowView('home')).toBe(false);
    expect(isWorkflowView('telemetry')).toBe(false);
    expect(isWorkflowView('admin')).toBe(false);
    expect(isWorkflowView('page')).toBe(false);
  });
});

describe('piece layouts', () => {
  it('defaults to wide and accepts narrow case-insensitively', () => {
    expect(PIECE_LAYOUTS).toEqual(['wide', 'narrow']);
    expect(DEFAULT_PIECE_LAYOUT).toBe('wide');
    expect(parsePieceLayout(undefined)).toBe('wide');
    expect(parsePieceLayout('')).toBe('wide');
    expect(parsePieceLayout('compact')).toBe('wide');
    expect(parsePieceLayout(1)).toBe('wide');
    expect(parsePieceLayout(' Narrow ')).toBe('narrow');
  });
});

describe('page urls', () => {
  it('resolves site paths against the site and passes full or root-based urls through', () => {
    expect(resolvePageUrl(`${SITE}/`, 'SitePages/Idea.aspx')).toBe(`${SITE}/SitePages/Idea.aspx`);
    expect(resolvePageUrl(SITE, 'SitePages/Idea.aspx')).toBe(`${SITE}/SitePages/Idea.aspx`);
    expect(resolvePageUrl(SITE, ' SitePages/Idea.aspx ')).toBe(`${SITE}/SitePages/Idea.aspx`);
    expect(resolvePageUrl(SITE, 'https://x/y')).toBe('https://x/y');
    expect(resolvePageUrl(SITE, 'HTTP://x/y')).toBe('HTTP://x/y');
    expect(resolvePageUrl(SITE, '/sites/other/p.aspx')).toBe('/sites/other/p.aspx');
    expect(resolvePageUrl(SITE, '')).toBeUndefined();
    expect(resolvePageUrl(SITE, '   ')).toBeUndefined();
    expect(resolvePageUrl(SITE, undefined)).toBeUndefined();
    expect(resolvePageUrl(SITE, 42)).toBeUndefined();
  });
});

describe('page view settings', () => {
  it('reads the eleven properties into a settings object', () => {
    const settings: IPageViewSettings = createPageViewSettings(
      { view: 'home', layout: 'narrow', returnUrl: 'SitePages/Front.aspx', pageIdea: 'SitePages/Idea.aspx', pagePolicy: '/sites/ai/AICoEPilotPolicies' },
      SITE
    );
    expect(settings).toEqual({
      view: 'home',
      layout: 'narrow',
      returnUrl: `${SITE}/SitePages/Front.aspx`,
      pages: { idea: `${SITE}/SitePages/Idea.aspx`, policy: '/sites/ai/AICoEPilotPolicies' }
    });
    expect(Object.keys(settings.pages)).toEqual(['idea', 'policy']);
    expect(settings.pageKey).toBeUndefined();
  });

  it('carries the trimmed page key of a content page; the document path is not a setting', () => {
    const settings: IPageViewSettings = createPageViewSettings({ view: 'page', pageKey: ' startHere ', contentUrl: 'SiteAssets/x.json' }, SITE);
    expect(settings).toEqual({ view: 'page', layout: 'wide', returnUrl: undefined, pages: {}, pageKey: 'startHere' });
    expect(Object.keys(settings)).not.toContain('contentUrl');
    expect(createPageViewSettings({ view: 'page', pageKey: '  ' }, SITE).pageKey).toBeUndefined();
  });

  it('falls back to the legacy view with no pages for an empty property bag', () => {
    const settings: IPageViewSettings = createPageViewSettings({}, SITE);
    expect(settings).toEqual({ view: 'legacy', layout: 'wide', returnUrl: undefined, pages: {} });
    expect(Object.keys(settings.pages)).toEqual([]);
  });

  it('maps every page target to its property', () => {
    expect(PAGE_TARGETS).toEqual(['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback', 'telemetry', 'admin', 'policy']);
    expect(PAGE_TARGET_PROPERTIES).toEqual({
      idea: 'pageIdea',
      toolCheck: 'pageToolCheck',
      teamUsage: 'pageTeamUsage',
      helpTraining: 'pageHelpTraining',
      feedback: 'pageFeedback',
      telemetry: 'pageTelemetry',
      admin: 'pageAdmin',
      policy: 'pagePolicy'
    });
  });
});

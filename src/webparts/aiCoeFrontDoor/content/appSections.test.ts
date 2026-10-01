import { APP_SECTIONS, APP_SECTION_IDS, ENTRY_CHOICES, parseAppSection, sectionOf } from './appSections';

describe('consolidated section routes', () => {
  it('removes System map from every section route while retaining guarded Admin and value', () => {
    expect(APP_SECTIONS.map(section => section.id)).toEqual(APP_SECTION_IDS);
    expect(APP_SECTIONS.map(section => section.label)).not.toContain('System map');
    expect(sectionOf('admin').capability).toBe('readAdminQueue');
    expect(sectionOf('value').capability).toBe('readProgramMeasures');
    expect(sectionOf('marketing').alternativeCapabilities).toContain('decideMarketingReview');
  });

  it('orders the tabs Requests, Improvement, Marketing, then Cases, Metrics and Admin at the far end (1.0.0.18)', () => {
    // The ids stay as they were, so saved links and drafts still resolve; only the order and the wording moved.
    expect(APP_SECTION_IDS).toEqual(['home', 'engineering', 'improvement', 'marketing', 'cases', 'value', 'admin']);
    expect(APP_SECTIONS.map(section => section.label)).toEqual(['Home', 'Requests', 'Improvement', 'Marketing', 'Cases', 'Metrics', 'Admin']);
    expect(APP_SECTIONS.filter(section => section.end === true).map(section => section.id)).toEqual(['cases', 'value', 'admin']);
    // Neither old name is left on a tab, a summary or a way in.
    const words: string = JSON.stringify({ APP_SECTIONS, ENTRY_CHOICES });
    expect(words).not.toMatch(/Engineering|[Ee]nterprise (AI )?value/);
  });

  it('names the third way in after the Metrics tab it opens', () => {
    expect(ENTRY_CHOICES.map(choice => `${choice.title} -> ${choice.section}`)).toEqual([
      'Get my work done -> engineering',
      'Run or improve the business -> improvement',
      'Review AI metrics -> value'
    ]);
  });

  it.each(['map', ' MAP ', 'System map', undefined, null, 3])('returns Home for stale or unknown route %s', value => {
    expect(parseAppSection(value)).toBe('home');
  });

  it.each(APP_SECTION_IDS)('keeps supported route %s addressable', id => {
    expect(parseAppSection(id)).toBe(id);
    expect(sectionOf(id).id).toBe(id);
  });
});

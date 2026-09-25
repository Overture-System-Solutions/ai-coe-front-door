import { APP_SECTIONS, APP_SECTION_IDS, parseAppSection, sectionOf } from './appSections';

describe('consolidated section routes', () => {
  it('removes System map from every section route while retaining guarded Admin and value', () => {
    expect(APP_SECTION_IDS).toEqual(['home', 'cases', 'engineering', 'marketing', 'improvement', 'value', 'admin']);
    expect(APP_SECTIONS.map(section => section.id)).toEqual(APP_SECTION_IDS);
    expect(APP_SECTIONS.map(section => section.label)).not.toContain('System map');
    expect(sectionOf('admin').capability).toBe('readAdminQueue');
    expect(sectionOf('value').capability).toBe('readProgramMeasures');
    expect(sectionOf('marketing').alternativeCapabilities).toContain('decideMarketingReview');
  });

  it.each(['map', ' MAP ', 'System map', undefined, null, 3])('returns Home for stale or unknown route %s', value => {
    expect(parseAppSection(value)).toBe('home');
  });

  it.each(APP_SECTION_IDS)('keeps supported route %s addressable', id => {
    expect(parseAppSection(id)).toBe(id);
    expect(sectionOf(id).id).toBe(id);
  });
});

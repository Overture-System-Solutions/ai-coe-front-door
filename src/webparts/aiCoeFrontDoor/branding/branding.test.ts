import { createBranding } from './branding';
import type { IBranding } from './branding';

describe('createBranding', () => {
  describe('with the original organization name', () => {
    const branding: IBranding = createBranding('Overture');

    it('reproduces every branded string of package 1.0.0.7', () => {
      expect(branding.organizationName).toBe('Overture');
      expect(branding.coeName).toBe('Overture AI CoE');
      expect(branding.headerPrefix).toBe('Overture ');
      expect(branding.heroBadge).toBe('OVERTURE AI COE');
      expect(branding.organizationLabel).toBe('Overture');
      expect(branding.organizationPossessive).toBe("Overture's");
      expect(branding.companyInformationOwner).toBe('Overture');
      expect(branding.reviewPathPhrase).toBe('the Overture review path');
      expect(branding.governanceReference).toBe('Overture AI CoE governance controls, version 1.1, August 26, 2026');
      expect(branding.offlineServiceMessage).toBe(
        'The SharePoint governance service is not initialized. Open this experience from the Overture AI CoE site.'
      );
      expect(branding.exportHeader('I have an idea for using AI')).toBe('Overture AI CoE — I have an idea for using AI');
      expect(branding.exportHeader('CoE review request')).toBe('Overture AI CoE — CoE review request');
    });
  });

  describe('with no organization name', () => {
    it.each([undefined, '', '   '])('uses neutral wording for %p', (value: string | undefined) => {
      const branding: IBranding = createBranding(value);
      expect(branding.organizationName).toBe('');
      expect(branding.coeName).toBe('AI CoE');
      expect(branding.headerPrefix).toBe('');
      expect(branding.heroBadge).toBe('AI COE');
      expect(branding.organizationLabel).toBe('the organization');
      expect(branding.organizationPossessive).toBe("the organization's");
      expect(branding.companyInformationOwner).toBe('company');
      expect(branding.reviewPathPhrase).toBe('the review path');
      expect(branding.governanceReference).toBe('AI CoE governance controls, version 1.1, August 26, 2026');
      expect(branding.offlineServiceMessage).toBe(
        'The SharePoint governance service is not initialized. Open this experience from the AI CoE site.'
      );
      expect(branding.exportHeader('I want to give the AI CoE feedback')).toBe('AI CoE — I want to give the AI CoE feedback');
    });
  });

  describe('with another organization', () => {
    it('trims the name and applies it everywhere', () => {
      const branding: IBranding = createBranding('  Contoso Health ');
      expect(branding.organizationName).toBe('Contoso Health');
      expect(branding.coeName).toBe('Contoso Health AI CoE');
      expect(branding.headerPrefix).toBe('Contoso Health ');
      expect(branding.heroBadge).toBe('CONTOSO HEALTH AI COE');
      expect(branding.organizationLabel).toBe('Contoso Health');
      expect(branding.organizationPossessive).toBe("Contoso Health's");
      expect(branding.companyInformationOwner).toBe('Contoso Health');
      expect(branding.reviewPathPhrase).toBe('the Contoso Health review path');
      expect(branding.governanceReference).toBe('Contoso Health AI CoE governance controls, version 1.1, August 26, 2026');
      expect(branding.exportHeader('X')).toBe('Contoso Health AI CoE — X');
    });
  });

  // Decision 21: the two tenant-bound literals the shipped package carries (a first tenant's policy version and date,
  // and the name of its review system) stay only in the legacy view while the properties are blank, so the parity
  // suites hold; a page view renders neutral wording; a filled property replaces the literal in either view.
  describe('governance reference and review system name', () => {
    it('reproduces the shipped literals in the legacy view while both properties are blank', () => {
      for (const blank of [{}, { governanceReference: '', reviewSystemName: '', pageView: false }, { governanceReference: '  ', reviewSystemName: '  ' }]) {
        const branding: IBranding = createBranding('Contoso', blank);
        expect(branding.governanceReference).toBe('Contoso AI CoE governance controls, version 1.1, August 26, 2026');
        expect(branding.reviewSystemName).toBe('TESS');
        expect(branding.reviewRequestPhrase).toBe('a TESS review');
      }
      expect(JSON.stringify(createBranding('Contoso'))).toBe(JSON.stringify(createBranding('Contoso', { governanceReference: '', reviewSystemName: '', pageView: false })));
    });

    it('renders neutral wording in a page view while both properties are blank', () => {
      const branding: IBranding = createBranding('Contoso', { governanceReference: '', reviewSystemName: '', pageView: true });
      expect(branding.governanceReference).toBe('Contoso AI CoE governance controls (reference not yet set)');
      expect(branding.reviewSystemName).toBe('the review system');
      expect(branding.reviewRequestPhrase).toBe('a review through the review system');
      expect(createBranding('', { pageView: true }).governanceReference).toBe('AI CoE governance controls (reference not yet set)');
      expect(createBranding(undefined, { pageView: true }).reviewSystemName).toBe('the review system');
    });

    it('quotes a filled value in either view, trimmed, and never the shipped literal', () => {
      for (const pageView of [false, true]) {
        const branding: IBranding = createBranding('Contoso', { governanceReference: ' Contoso AI policy 2.0, 1 March 2027 ', reviewSystemName: ' Contoso Review Desk ', pageView });
        expect(branding.governanceReference).toBe('Contoso AI policy 2.0, 1 March 2027');
        expect(branding.reviewSystemName).toBe('Contoso Review Desk');
        expect(branding.reviewRequestPhrase).toBe('a Contoso Review Desk review');
        expect(JSON.stringify(branding)).not.toContain('August 26, 2026');
        expect(JSON.stringify(branding)).not.toContain('TESS');
      }
    });

    it('phrases a review request through a name that starts with an article', () => {
      expect(createBranding('Contoso', { reviewSystemName: 'the Contoso portal' }).reviewRequestPhrase).toBe('a review through the Contoso portal');
      expect(createBranding('Contoso', { reviewSystemName: 'The Contoso portal' }).reviewRequestPhrase).toBe('a review through The Contoso portal');
      expect(createBranding('Contoso', { reviewSystemName: 'Theseus' }).reviewRequestPhrase).toBe('a Theseus review');
    });

    it('sets one property independently of the other', () => {
      const legacy: IBranding = createBranding('Contoso', { governanceReference: 'Contoso AI policy 2.0' });
      expect(legacy.governanceReference).toBe('Contoso AI policy 2.0');
      expect(legacy.reviewSystemName).toBe('TESS');
      const page: IBranding = createBranding('Contoso', { reviewSystemName: 'Contoso Review Desk', pageView: true });
      expect(page.governanceReference).toBe('Contoso AI CoE governance controls (reference not yet set)');
      expect(page.reviewSystemName).toBe('Contoso Review Desk');
    });
  });
});

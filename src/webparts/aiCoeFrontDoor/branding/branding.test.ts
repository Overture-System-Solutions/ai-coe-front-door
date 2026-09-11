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
});

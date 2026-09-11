/**
 * Every organization-specific string the shipped web part hard-coded, derived from one property.
 * With `organizationName === 'Overture'` each value reproduces package 1.0.0.7 verbatim; with no
 * organization the wording is neutral. Data contracts (list titles, field names, intake-id prefix,
 * storage keys, download file names) are deliberately not part of this object.
 */
export interface IBranding {
  /** Trimmed organization name; empty when the web part is unbranded. */
  readonly organizationName: string;
  /** "Overture AI CoE" or "AI CoE". */
  readonly coeName: string;
  /** Text before the "AI CoE Lab" span in the workflow header: "Overture " or "". */
  readonly headerPrefix: string;
  /** Hero badge: "OVERTURE AI COE" or "AI COE". */
  readonly heroBadge: string;
  /** Subject in sentences such as "shared outside …": the name or "the organization". */
  readonly organizationLabel: string;
  /** Possessive form: "Overture's" or "the organization's". */
  readonly organizationPossessive: string;
  /** Owner named in the company-information definition: the name or "company". */
  readonly companyInformationOwner: string;
  /** "the Overture review path" or "the review path". */
  readonly reviewPathPhrase: string;
  /** Policy reference printed on review requests. */
  readonly governanceReference: string;
  /** Message of the offline governance adapter. */
  readonly offlineServiceMessage: string;
  /** First line of every downloadable summary: "<CoE name> — <workflow title>". */
  exportHeader(title: string): string;
}

export function createBranding(organizationName: string | undefined): IBranding {
  const name: string = (organizationName ?? '').trim();
  const coeName: string = name ? `${name} AI CoE` : 'AI CoE';
  return {
    organizationName: name,
    coeName,
    headerPrefix: name ? `${name} ` : '',
    heroBadge: name ? `${name.toUpperCase()} AI COE` : 'AI COE',
    organizationLabel: name || 'the organization',
    organizationPossessive: name ? `${name}'s` : "the organization's",
    companyInformationOwner: name || 'company',
    reviewPathPhrase: name ? `the ${name} review path` : 'the review path',
    governanceReference: `${coeName} governance controls, version 1.1, August 26, 2026`,
    offlineServiceMessage: `The SharePoint governance service is not initialized. Open this experience from the ${coeName} site.`,
    exportHeader: (title: string): string => `${coeName} — ${title}`
  };
}

/**
 * Every organization-specific string the shipped web part hard-coded, derived from one property.
 * With `organizationName === 'Overture'` each value reproduces package 1.0.0.7 verbatim; with no
 * organization the wording is neutral. Data contracts (list titles, field names, intake-id prefix,
 * storage keys, download file names) are deliberately not part of this object.
 *
 * Two of the shipped strings are bound to a first tenant rather than to an organization name: the
 * policy reference quoted on review requests (a policy version and date) and the name of the review
 * system the tool guidance sends people to. Each is now a property; while it is blank, the legacy
 * view keeps the shipped wording (so the parity suites hold) and a page view renders neutral wording.
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
  /** Policy reference printed on review requests: the property, else the shipped wording (legacy) or "(reference not yet set)" (page views). */
  readonly governanceReference: string;
  /** The review system the tool guidance names: the property, else the shipped name (legacy) or "the review system" (page views). */
  readonly reviewSystemName: string;
  /** "a <system> review", or "a review through <system>" when the name itself starts with an article. */
  readonly reviewRequestPhrase: string;
  /** Message of the offline governance adapter. */
  readonly offlineServiceMessage: string;
  /** First line of every downloadable summary: "<CoE name> — <workflow title>". */
  exportHeader(title: string): string;
}

export interface IBrandingOptions {
  /** The `governanceReference` property; blank keeps the default wording of the view. */
  governanceReference?: string;
  /** The `reviewSystemName` property; blank keeps the default wording of the view. */
  reviewSystemName?: string;
  /** True for every page view (a piece on its own page); false, the default, for the legacy whole-page view. */
  pageView?: boolean;
}

/** The review system the shipped package named; kept only as the blank value in the legacy view. */
const SHIPPED_REVIEW_SYSTEM_NAME: string = 'TESS';
/** The policy reference the shipped package quoted, after the CoE name; kept only as the blank value in the legacy view. */
const SHIPPED_GOVERNANCE_REFERENCE_SUFFIX: string = ' governance controls, version 1.1, August 26, 2026';
const NEUTRAL_GOVERNANCE_REFERENCE_SUFFIX: string = ' governance controls (reference not yet set)';
const NEUTRAL_REVIEW_SYSTEM_NAME: string = 'the review system';

function reviewRequestPhrase(reviewSystemName: string): string {
  return /^the\s/i.test(reviewSystemName) ? `a review through ${reviewSystemName}` : `a ${reviewSystemName} review`;
}

export function createBranding(organizationName: string | undefined, options: IBrandingOptions = {}): IBranding {
  const name: string = (organizationName ?? '').trim();
  const coeName: string = name ? `${name} AI CoE` : 'AI CoE';
  const pageView: boolean = options.pageView === true;
  const governanceReference: string =
    (options.governanceReference ?? '').trim() || `${coeName}${pageView ? NEUTRAL_GOVERNANCE_REFERENCE_SUFFIX : SHIPPED_GOVERNANCE_REFERENCE_SUFFIX}`;
  const reviewSystemName: string = (options.reviewSystemName ?? '').trim() || (pageView ? NEUTRAL_REVIEW_SYSTEM_NAME : SHIPPED_REVIEW_SYSTEM_NAME);
  return {
    organizationName: name,
    coeName,
    headerPrefix: name ? `${name} ` : '',
    heroBadge: name ? `${name.toUpperCase()} AI COE` : 'AI COE',
    organizationLabel: name || 'the organization',
    organizationPossessive: name ? `${name}'s` : "the organization's",
    companyInformationOwner: name || 'company',
    reviewPathPhrase: name ? `the ${name} review path` : 'the review path',
    governanceReference,
    reviewSystemName,
    reviewRequestPhrase: reviewRequestPhrase(reviewSystemName),
    offlineServiceMessage: `The SharePoint governance service is not initialized. Open this experience from the ${coeName} site.`,
    exportHeader: (title: string): string => `${coeName} — ${title}`
  };
}

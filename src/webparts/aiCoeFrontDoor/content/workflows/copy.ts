import type { IBranding } from '../../branding/branding';

/** Notice shown when patient, employee or customer information may be involved (idea and tool-check workflows). */
export const SENSITIVE_INFO_NOTICE: string =
  'Thanks for letting us know. When patient, employee, or customer information may be involved, this may need an extra look before moving forward. That is okay — you do not need to add any details about the information itself. We will just ask a few more general questions.';

/** Team-usage variant of the notice: the sensitive part of the process should pause until the CoE looks at it. */
export const TEAM_USAGE_SENSITIVE_NOTICE: string =
  "Thanks for sharing that. When information like this may be involved, it's a good idea to pause that part of the process for now, just until the AI CoE can take a look and offer guidance. The rest of what you shared is still really helpful — please continue.";

/** Team-usage notice shown when the tool can act in another system on its own. */
export const TEAM_USAGE_ACTION_NOTICE: string =
  "Thanks for sharing that. When a tool can take an action in another system on its own, it's a good idea to pause that part of the process for now, just until the AI CoE can take a look and offer guidance. The rest of what you shared is still really helpful — please continue.";

export const COMPANY_INFORMATION_HELP_SUFFIX: string =
  ' — even when it is not patient, employee, customer, or otherwise confidential. An ongoing work process also counts as a business workflow. Describe information categories and the intended process; do not enter confidential values, source records, prompts, or response content.';

/** Definition of "company information" shown under the company-data question; names the organization. */
export function companyInformationHelp(branding: IBranding): string {
  return `Company information includes ${branding.companyInformationOwner}, client, partner, and internal work information${COMPANY_INFORMATION_HELP_SUFFIX}`;
}

/** Title of the tool-check question about sharing output outside the organization. */
export function externalSharingQuestion(branding: IBranding): string {
  return `Would the output be shared outside ${branding.organizationLabel}?`;
}

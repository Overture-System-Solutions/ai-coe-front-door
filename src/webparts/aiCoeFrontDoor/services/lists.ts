/**
 * Every SharePoint list title the front door reads or writes, in one place, so the page definition,
 * the script's list-security section, the portability inventory and the tests name the same lists.
 * The five shipped titles stay where their services declare them and are re-exported here; the
 * item-level security mode is the word `pages.json` uses for the two intake lists (decision 6).
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE } from './GovernanceService';

export { DECISIONS_LIST_TITLE, INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE } from './GovernanceService';
export { INCIDENTS_LIST_TITLE, USAGE_LIST_TITLE } from './UsageMetricsService';

/**
 * The security mode `pages.json` names for a list: each person reads and edits their own rows
 * (`ReadSecurity 2 / WriteSecurity 2`); owners, and operators once bound, read every row because
 * their permission level holds Override List Behaviors.
 */
export const OWN_ITEMS_SECURITY: string = 'ownItems';

/**
 * The two intake lists the front door writes to and the person's own requests are read from. The
 * script breaks their inheritance, grants the owners Full Control, leaves the site Members at their
 * level and sets the two flags; the web part never widens a read beyond what the server returns.
 */
export const OWN_ITEMS_LISTS: readonly string[] = [INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE];

/**
 * The measures an operator records by hand and the Enterprise value page reads, one row per measure (1.0.0.14).
 * The list is not part of the package feature: the script creates it from the `lists` section of `pages.json`,
 * which names it by this constant, so a rename has one home. A site whose script has not run yet carries no such
 * list, and every measure then reads as not available rather than as a number nobody can source.
 */
export const PROGRAM_MEASURES_LIST_TITLE: string = 'AI CoE Program Measures';

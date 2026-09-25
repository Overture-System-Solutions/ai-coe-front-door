/**
 * The four roles the front door knows, how a site group title binds to one of them, and the words a
 * page uses for each. Membership itself is resolved at run time from the site groups the signed-in
 * person belongs to (`services/roleResolver.ts`); nothing here reads a tenant. A document may rename
 * any role through its `vocabulary.roles` section, so the wording is data and the ids never change.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { IVocabulary } from './pageContent';
import { includes } from '../utils/collections';

/**
 * `employee` is everyone; `designAuthority` stays unheld until a site group is bound to it.
 *
 * The two Marketing roles are bounded participant roles, deliberately separate from the platform roles: an
 * ordinary Marketing participant may draft against permitted sources and save revisions; a Marketing reviewer
 * may record a review decision within the authority scope the review service binds to them. Neither is an
 * operator, a site owner or a design authority, and holding a platform role grants neither. Both stay unheld
 * until a site group is bound (`roleGroups`), and the real strategy/voice owner and copy/channel approver stay
 * unbound until the business confirms them; the ids exist so that binding is configuration, never code.
 */
export type RoleId = 'employee' | 'leader' | 'operator' | 'designAuthority' | 'marketingParticipant' | 'marketingReviewer';
export const ROLE_IDS: readonly RoleId[] = ['employee', 'leader', 'operator', 'designAuthority', 'marketingParticipant', 'marketingReviewer'];

/** The name each role carries in a sentence ("This page is for the ... role"); overridable per document. */
export const DEFAULT_ROLE_LABELS: { [id in RoleId]: string } = {
  employee: 'Employee',
  leader: 'Leader',
  operator: 'AI CoE operator',
  designAuthority: 'Design authority',
  marketingParticipant: 'Marketing participant',
  marketingReviewer: 'Marketing reviewer'
};

/** Which site group title stands for which role, as the `roleGroups` property binds them. */
export type RoleGroupMap = { [id in RoleId]?: string };

const PAIR_SEPARATOR: RegExp = /;/;

export function isRoleId(value: string): value is RoleId {
  return includes(ROLE_IDS, value as RoleId);
}

/**
 * Reads the `roleGroups` property: pairs of a role id and a site group title, one pair per
 * semicolon, the id and the title parted by the first equals sign and both trimmed. An entry with no
 * separator, an unknown id or a blank title is dropped on its own, so one typo never costs the rest;
 * when a role is named twice the last pair wins.
 */
export function parseRoleGroups(value: string | undefined): RoleGroupMap {
  const map: RoleGroupMap = {};
  if (typeof value !== 'string') {
    return map;
  }
  for (const entry of value.split(PAIR_SEPARATOR)) {
    const separator: number = entry.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const id: string = entry.slice(0, separator).trim();
    const title: string = entry.slice(separator + 1).trim();
    if (title !== '' && isRoleId(id)) {
      map[id] = title;
    }
  }
  return map;
}

/** The name of a role as the document vocabulary renames it; an unknown id comes back as it came. */
export function roleLabel(roleId: string, vocabulary?: IVocabulary): string {
  const named: string | undefined = vocabulary === undefined ? undefined : vocabulary.roles[roleId];
  if (typeof named === 'string' && named !== '') {
    return named;
  }
  return isRoleId(roleId) ? DEFAULT_ROLE_LABELS[roleId] : roleId;
}

/**
 * The any-of test behind every audience and every protected page: content that names no role is for
 * everyone, and content that names roles opens as soon as one of them is held. Roles that were never
 * read are no roles at all, so a page fails closed while the membership is unknown. Permissions, not
 * this test, keep a page shut; this only decides what the page offers to draw.
 */
export function holdsAnyRole(named: readonly string[] | undefined, held: readonly string[] | undefined): boolean {
  if (named === undefined || named.length === 0) {
    return true;
  }
  const roles: readonly string[] = held ?? [];
  return named.some((role: string): boolean => includes(roles, role));
}

/** The words shown instead of a page the person may not read; `{role}` is filled with the roles it is for. */
export const DEFAULT_PROTECTED_PAGE_TEXT: string = 'This page is for the {role} role and is not available to you.';
/** What the identity line says when no role beyond the default one was read for this person. */
export const NO_ROLE_TEXT: string = 'role not set';

const ROLE_TOKEN: RegExp = /\{role\}/g;

/** The roles named on a page or a block, as a sentence: "Leader", "Leader or AI CoE operator". */
function namedRoles(roleIds: readonly string[] | undefined, vocabulary?: IVocabulary): string {
  const labels: string[] = (roleIds ?? []).map((roleId: string): string => roleLabel(roleId, vocabulary));
  return labels.length === 0 ? NO_ROLE_TEXT : labels.join(' or ');
}

/** The protected-page wording, the document's own when it sets one, with the roles filled in. */
export function protectedPageText(roleIds: readonly string[] | undefined, vocabulary?: IVocabulary): string {
  const override: string | undefined = vocabulary === undefined ? undefined : vocabulary.chrome.protectedPage;
  const wording: string = override === undefined || override === '' ? DEFAULT_PROTECTED_PAGE_TEXT : override;
  return wording.replace(ROLE_TOKEN, namedRoles(roleIds, vocabulary));
}

/**
 * What the identity line says about the person's role: the roles they were granted, in the order of
 * the ids. `employee` is left out because everyone holds it: naming it would read as a binding the
 * site never made, so a person with nothing else reads "role not set".
 */
export function identityRole(held: readonly string[] | undefined, vocabulary?: IVocabulary): string {
  const roles: readonly string[] = held ?? [];
  const granted: RoleId[] = ROLE_IDS.filter((roleId: RoleId): boolean => roleId !== 'employee' && includes(roles, roleId));
  return granted.length === 0 ? NO_ROLE_TEXT : granted.map((roleId: RoleId): string => roleLabel(roleId, vocabulary)).join(', ');
}

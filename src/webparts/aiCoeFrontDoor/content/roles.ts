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

/** `employee` is everyone; `designAuthority` stays unheld until a site group is bound to it. */
export type RoleId = 'employee' | 'leader' | 'operator' | 'designAuthority';
export const ROLE_IDS: readonly RoleId[] = ['employee', 'leader', 'operator', 'designAuthority'];

/** The name each role carries in a sentence ("This page is for the ... role"); overridable per document. */
export const DEFAULT_ROLE_LABELS: { [id in RoleId]: string } = {
  employee: 'Employee',
  leader: 'Leader',
  operator: 'AI CoE operator',
  designAuthority: 'Design authority'
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

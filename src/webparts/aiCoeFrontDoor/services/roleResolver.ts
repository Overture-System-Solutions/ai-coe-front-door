/**
 * Resolves which of the four roles the signed-in person holds, from the site groups they belong to.
 * The web part binds a site group title to a role through one property (`roleGroups`); this service
 * reads `_api/web/currentuser/groups` once per instance, matches the titles case-insensitively and
 * gives back the roles held, employee always among them. Whether the person may administer the site
 * is not asked here: the web part makes that one permission check and passes the answer in, so the
 * bundle keeps its single check. A refused or unanswered read is never an error and never a wider
 * role: the person keeps the employee role and the answer says the membership was not resolved, so a
 * page can say so instead of quietly showing less than it should.
 *
 * Permissions, not this service, keep a protected page shut: the role decides what a page offers, the
 * site decides what the server hands out.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { ROLE_IDS } from '../content/roles';
import type { RoleGroupMap, RoleId } from '../content/roles';
import { includes } from '../utils/collections';
import { classifyError, classifyResponse } from './failureClass';
import type { FailureClass } from './failureClass';
import type { IListResponse, IServiceContext } from './types';

/** Whether the membership behind the roles was read; `unresolved` means the person may hold more. */
export type RoleResolutionState = 'resolved' | 'unresolved';

export interface IRoleResolution {
  roles: RoleId[];
  resolution: RoleResolutionState;
}

export interface IRoleResolveOptions {
  /** The answer to the web part's single `manageWeb` check; true adds the operator role. */
  isAdmin: boolean;
}

export interface IRoleResolver {
  resolve(options: IRoleResolveOptions): Promise<IRoleResolution>;
}

interface IMembership {
  /** The group titles of the signed-in person, trimmed and lowered for matching. */
  titles: string[];
  resolution: RoleResolutionState;
}

const ACCEPT_HEADER: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };
const RESOLVED_WITHOUT_READING: IMembership = { titles: [], resolution: 'resolved' };

/** `<site>/_api/web/currentuser/groups?$select=Title`: the titles only, never a member list. */
export function siteGroupsUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/_api/web/currentuser/groups?$select=Title`;
}

function matchable(title: string): string {
  return title.trim().toLowerCase();
}

function groupTitles(value: unknown): string[] {
  const rows: unknown = value !== null && typeof value === 'object' ? (value as { value?: unknown }).value : undefined;
  if (!Array.isArray(rows)) {
    return [];
  }
  const titles: string[] = [];
  for (const row of rows) {
    const title: unknown = row !== null && typeof row === 'object' ? (row as { Title?: unknown }).Title : undefined;
    if (typeof title === 'string' && title.trim() !== '') {
      titles.push(matchable(title));
    }
  }
  return titles;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class RoleResolver implements IRoleResolver {
  private readonly _context: IServiceContext;
  private readonly _roleGroups: RoleGroupMap;
  /** The one read of the site groups; every caller on the page shares it. */
  private _membership: Promise<IMembership> | undefined;

  public constructor(context: IServiceContext, roleGroups: RoleGroupMap) {
    this._context = context;
    this._roleGroups = roleGroups;
  }

  public async resolve(options: IRoleResolveOptions): Promise<IRoleResolution> {
    const membership: IMembership = await this._readMembership();
    const roles: RoleId[] = [];
    for (const id of ROLE_IDS) {
      if (id === 'employee' || (id === 'operator' && options.isAdmin)) {
        roles.push(id);
        continue;
      }
      const title: string | undefined = this._roleGroups[id];
      if (title !== undefined && includes(membership.titles, matchable(title))) {
        roles.push(id);
      }
    }
    return { roles, resolution: membership.resolution };
  }

  private _readMembership(): Promise<IMembership> {
    if (this._membership === undefined) {
      this._membership = this._boundGroupCount() === 0 ? Promise.resolve(RESOLVED_WITHOUT_READING) : this._fetchMembership();
    }
    return this._membership;
  }

  /** How many roles a site group title is bound to; with none there is nothing a read could decide. */
  private _boundGroupCount(): number {
    let count: number = 0;
    for (const id of ROLE_IDS) {
      if (id !== 'employee' && this._roleGroups[id] !== undefined) {
        count += 1;
      }
    }
    return count;
  }

  private async _fetchMembership(): Promise<IMembership> {
    try {
      const response: IListResponse = await this._context.client.get(siteGroupsUrl(this._context.siteUrl), this._context.configuration, { headers: ACCEPT_HEADER });
      if (!response.ok) {
        // The console gets the status and the class only, never the body.
        const failureClass: FailureClass = classifyResponse(response);
        console.error('AI CoE role resolution failed', `The site groups answered ${response.status} (${failureClass})`);
        return { titles: [], resolution: 'unresolved' };
      }
      return { titles: groupTitles(await response.json()), resolution: 'resolved' };
    } catch (error) {
      const failureClass: FailureClass = classifyError(error);
      console.error('AI CoE role resolution failed', `${failureClass}: ${describeError(error).slice(0, 200)}`);
      return { titles: [], resolution: 'unresolved' };
    }
  }
}

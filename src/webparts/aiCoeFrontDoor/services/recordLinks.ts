/**
 * Links from a card to the SharePoint record it stands for (1.0.0.18): a request to its row in the intake list, a
 * case to its row in the use-case list. The address is the list's own display form, read from the list, plus the
 * item id, so no list address is assumed. Every read is the signed-in person's own: a row they cannot see gives no
 * link, and any failure gives no link rather than an error, because a card without a link is still a card.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { optionalWords } from '../content/values';
import { INTAKES_LIST_TITLE, listItemsUrl, USE_CASES_LIST_TITLE } from './GovernanceService';
import type { IListItem, IListResponse, IServiceContext } from './types';

const ACCEPT_HEADER: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };

function odataLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function getJson(context: IServiceContext, url: string): Promise<unknown> {
  const response: IListResponse = await context.client.get(url, context.configuration, { headers: ACCEPT_HEADER });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/** The list's display form as a full address, or undefined when the list cannot be read. */
async function displayForm(context: IServiceContext, listTitle: string): Promise<string | undefined> {
  try {
    const site: string = context.siteUrl.replace(/\/+$/, '');
    const data: unknown = await getJson(context, `${site}/_api/web/lists/getbytitle(${odataLiteral(listTitle)})?$select=DefaultDisplayFormUrl`);
    const path: string | undefined = data !== null && typeof data === 'object' ? optionalWords((data as { DefaultDisplayFormUrl?: unknown }).DefaultDisplayFormUrl) : undefined;
    return path === undefined ? undefined : `${new URL(site).origin}${path.charAt(0) === '/' ? '' : '/'}${path}`;
  } catch {
    return undefined;
  }
}

function rowsOf(data: unknown): IListItem[] {
  return data !== null && typeof data === 'object' && Array.isArray((data as { value?: unknown }).value) ? ((data as { value: IListItem[] }).value) : [];
}

function idOf(row: IListItem): number | undefined {
  const id: unknown = row.Id !== undefined ? row.Id : row.ID;
  return typeof id === 'number' && id > 0 ? id : undefined;
}

/** The link to one request's row. */
export async function requestLink(context: IServiceContext, itemId: number): Promise<string | undefined> {
  const form: string | undefined = await displayForm(context, INTAKES_LIST_TITLE);
  return form === undefined ? undefined : `${form}?ID=${itemId}`;
}

/** The links to several requests' rows, reading the list's display form once. */
export async function requestLinks(context: IServiceContext, itemIds: readonly number[]): Promise<{ [itemId: number]: string }> {
  const links: { [itemId: number]: string } = {};
  const form: string | undefined = await displayForm(context, INTAKES_LIST_TITLE);
  if (form !== undefined) {
    for (const id of itemIds) {
      if (id > 0) {
        links[id] = `${form}?ID=${id}`;
      }
    }
  }
  return links;
}

/** The cases the person submitted, by reference, in one read of the use-case list. */
export async function myCaseLinks(context: IServiceContext, email: string): Promise<{ [reference: string]: string }> {
  const links: { [reference: string]: string } = {};
  try {
    const form: string | undefined = await displayForm(context, USE_CASES_LIST_TITLE);
    if (form === undefined) {
      return links;
    }
    const filter: string = encodeURIComponent(`SubmitterEmail eq ${odataLiteral(email)}`);
    const rows: IListItem[] = rowsOf(await getJson(context, `${listItemsUrl(context.siteUrl, USE_CASES_LIST_TITLE)}?$filter=${filter}&$select=Id,CoEID&$top=100`));
    for (const row of rows) {
      const reference: string | undefined = optionalWords(row.CoEID);
      const id: number | undefined = idOf(row);
      if (reference !== undefined && id !== undefined && links[reference] === undefined) {
        links[reference] = `${form}?ID=${id}`;
      }
    }
  } catch {
    // No links: the cards stay, unlinked.
  }
  return links;
}

/** Named cases, by reference, each read on its own; a case the reader cannot see is left out. */
export function caseLinksFor(context: IServiceContext, references: readonly string[]): Promise<{ [reference: string]: string }> {
  return linksByReference(context, USE_CASES_LIST_TITLE, 'CoEID', references);
}

/** Named requests, by reference, each read on its own; a request the reader cannot see is left out (1.0.0.19). */
export function requestLinksFor(context: IServiceContext, references: readonly string[]): Promise<{ [reference: string]: string }> {
  return linksByReference(context, INTAKES_LIST_TITLE, 'IntakeId', references);
}

async function linksByReference(context: IServiceContext, listTitle: string, field: string, references: readonly string[]): Promise<{ [reference: string]: string }> {
  const links: { [reference: string]: string } = {};
  const form: string | undefined = await displayForm(context, listTitle);
  if (form === undefined) {
    return links;
  }
  const unique: string[] = references.filter((reference: string, index: number): boolean => reference !== '' && references.indexOf(reference) === index);
  for (const reference of unique) {
    try {
      const filter: string = encodeURIComponent(`${field} eq ${odataLiteral(reference)}`);
      const rows: IListItem[] = rowsOf(await getJson(context, `${listItemsUrl(context.siteUrl, listTitle)}?$filter=${filter}&$select=Id,${field}&$top=1`));
      const id: number | undefined = rows.length > 0 ? idOf(rows[0]) : undefined;
      if (id !== undefined) {
        links[reference] = `${form}?ID=${id}`;
      }
    } catch {
      // This record stays unlinked.
    }
  }
  return links;
}

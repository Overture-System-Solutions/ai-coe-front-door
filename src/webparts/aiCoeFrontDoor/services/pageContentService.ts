/**
 * Reads the page content document (a JSON file in the site's assets) through the SharePoint REST
 * API and parses it once per instance. Failures become results, never exceptions, so a content
 * page can explain what is missing instead of rendering nothing.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { parsePageDocument } from '../content/pageContent';
import type { IPageDocument } from '../content/pageContent';
import type { IListResponse, IServiceContext } from './types';

export interface IPageContentResult {
  /** False when the file could not be read at all (missing, forbidden, network). */
  connected: boolean;
  /** Present only when the file is a version 1 page document. */
  document?: IPageDocument;
  message: string;
}

export interface IPageContentService {
  getDocument(): Promise<IPageContentResult>;
}

const FILE_HEADERS: { [name: string]: string } = { Accept: 'application/json;odata=nometadata', 'odata-version': '' };
const FULL_URL: RegExp = /^https?:\/\/[^/]*(\/.*)?$/i;

function serverRelativePath(siteUrl: string, contentUrl: string): string {
  const text: string = contentUrl.trim();
  const full: RegExpExecArray | null = FULL_URL.exec(text);
  if (full !== null) {
    return full[1] ?? '/';
  }
  if (text.charAt(0) === '/') {
    return text;
  }
  const site: RegExpExecArray | null = FULL_URL.exec(siteUrl.trim());
  const sitePath: string = (site !== null ? site[1] ?? '' : siteUrl.trim()).replace(/\/$/, '');
  return `${sitePath}/${text}`;
}

/** `<site>/_api/web/GetFileByServerRelativeUrl('<path>')/$value` for a site path, a root-based path or a full URL. */
export function fileContentUrl(siteUrl: string, contentUrl: string): string {
  const path: string = serverRelativePath(siteUrl, contentUrl).replace(/'/g, "''");
  return `${siteUrl.trim().replace(/\/$/, '')}/_api/web/GetFileByServerRelativeUrl('${path}')/$value`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class PageContentService implements IPageContentService {
  private readonly _context: IServiceContext;
  private readonly _contentUrl: string;
  private _pending: Promise<IPageContentResult> | undefined;

  public constructor(context: IServiceContext, contentUrl: string) {
    this._context = context;
    this._contentUrl = contentUrl;
  }

  public getDocument(): Promise<IPageContentResult> {
    if (this._pending === undefined) {
      this._pending = this._read();
    }
    return this._pending;
  }

  private async _read(): Promise<IPageContentResult> {
    try {
      const response: IListResponse = await this._context.client.get(fileContentUrl(this._context.siteUrl, this._contentUrl), this._context.configuration, {
        headers: FILE_HEADERS
      });
      if (!response.ok) {
        return { connected: false, message: `The page document could not be read: ${this._contentUrl} answered ${response.status}.` };
      }
      const document: IPageDocument | undefined = parsePageDocument(await response.text());
      if (document === undefined) {
        return { connected: true, message: `${this._contentUrl} is not a version 1 page document.` };
      }
      return { connected: true, document, message: `Page content loaded from ${this._contentUrl}.` };
    } catch (error) {
      return { connected: false, message: `The page document could not be read: ${describeError(error)}` };
    }
  }
}

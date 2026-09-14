import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import type { IRecordedRequest } from '../../../testing/listStore';
import { SAMPLE_PAGE_DOCUMENT } from '../../../testing/pageDocument';
import { fileContentUrl, PageContentService } from './pageContentService';
import type { IPageContentResult } from './pageContentService';
import type { IListClient, IServiceContext } from './types';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';
const FILE: string = '/sites/ai/SiteAssets/ai-coe-pages.json';
const CONTENT_URL: string = 'SiteAssets/ai-coe-pages.json';

function contextFor(client: IListClient, siteUrl: string = SITE): IServiceContext {
  return { siteUrl, user: { displayName: 'Pat Example', email: 'pat@contoso.com' }, client, configuration: 'v1' };
}

function fileRequests(store: InMemoryListStore): IRecordedRequest[] {
  return store.requests.filter((request: IRecordedRequest): boolean => request.file !== undefined);
}

describe('file content url', () => {
  it('asks the REST API for the file by its server-relative path', () => {
    const expected: string = `${SITE}/_api/web/GetFileByServerRelativeUrl('${FILE}')/$value`;
    expect(fileContentUrl(SITE, CONTENT_URL)).toBe(expected);
    expect(fileContentUrl(`${SITE}/`, ` ${CONTENT_URL} `)).toBe(expected);
    expect(fileContentUrl(SITE, FILE)).toBe(expected);
    expect(fileContentUrl(SITE, `https://contoso.sharepoint.com${FILE}`)).toBe(expected);
    expect(fileContentUrl('https://contoso.sharepoint.com', 'SiteAssets/x.json')).toBe(
      "https://contoso.sharepoint.com/_api/web/GetFileByServerRelativeUrl('/SiteAssets/x.json')/$value"
    );
    expect(fileContentUrl(SITE, "SiteAssets/it's.json")).toBe(`${SITE}/_api/web/GetFileByServerRelativeUrl('/sites/ai/SiteAssets/it''s.json')/$value`);
  });
});

describe('PageContentService', () => {
  it('reads the document once and hands every caller the parsed pages', async () => {
    const store: InMemoryListStore = new InMemoryListStore([]);
    store.seedFile(FILE, JSON.stringify(SAMPLE_PAGE_DOCUMENT));
    const service: PageContentService = new PageContentService(contextFor(createFakeListClient(store)), CONTENT_URL);
    const first: IPageContentResult = await service.getDocument();
    const second: IPageContentResult = await service.getDocument();
    expect(first.connected).toBe(true);
    expect(first.document?.pages.startHere.title).toBe(SAMPLE_PAGE_DOCUMENT.pages.startHere.title);
    expect(first.document?.pages.startHere.blocks).toHaveLength(SAMPLE_PAGE_DOCUMENT.pages.startHere.blocks.length);
    expect(first.message).toBe(`Page content loaded from ${CONTENT_URL}.`);
    expect(second).toBe(first);
    const requests: IRecordedRequest[] = fileRequests(store);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].file).toBe(FILE);
    expect(requests[0].headers).toEqual({ Accept: 'application/json;odata=nometadata', 'odata-version': '' });
  });

  it('reports a missing file as not connected', async () => {
    const store: InMemoryListStore = new InMemoryListStore([]);
    const service: PageContentService = new PageContentService(contextFor(createFakeListClient(store)), CONTENT_URL);
    expect(await service.getDocument()).toEqual({ connected: false, message: `The page document could not be read: ${CONTENT_URL} answered 404.` });
  });

  it('reports a file that is not a page document as connected but without pages', async () => {
    const store: InMemoryListStore = new InMemoryListStore([]);
    store.seedFile(FILE, '{ "version": 3 }');
    const service: PageContentService = new PageContentService(contextFor(createFakeListClient(store)), CONTENT_URL);
    expect(await service.getDocument()).toEqual({ connected: true, message: `${CONTENT_URL} is not a version 1 page document.` });
  });

  it('never throws when the client fails', async () => {
    const client: IListClient = {
      get: (): Promise<never> => Promise.reject(new Error('boom')),
      post: (): Promise<never> => Promise.reject(new Error('boom'))
    };
    const service: PageContentService = new PageContentService(contextFor(client), CONTENT_URL);
    expect(await service.getDocument()).toEqual({ connected: false, message: 'The page document could not be read: boom' });
  });
});

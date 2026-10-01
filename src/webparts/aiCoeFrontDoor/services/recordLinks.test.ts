import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import { INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE } from './GovernanceService';
import { caseLinksFor, myCaseLinks, requestLink } from './recordLinks';
import type { IServiceContext } from './types';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';

function harness(): { store: InMemoryListStore; context: IServiceContext } {
  const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE]);
  return { store, context: { siteUrl: SITE, user: { displayName: 'Ada', email: 'ada@contoso.com' }, client: createFakeListClient(store), configuration: 'v1' } };
}

describe('record links (1.0.0.18)', () => {
  it('links a request to its row through the list\'s own display form', async () => {
    const { context } = harness();
    expect(await requestLink(context, 7)).toBe('https://contoso.sharepoint.com/sites/ai/Lists/AI CoE Pilot Intakes/DispForm.aspx?ID=7');
  });

  it('finds the cases a person submitted in one read, keyed by their reference', async () => {
    const { store, context } = harness();
    store.seed(USE_CASES_LIST_TITLE, [
      { CoEID: 'OVT-1', SubmitterEmail: 'ada@contoso.com' },
      { CoEID: 'OVT-2', SubmitterEmail: 'bob@contoso.com' },
      { CoEID: 'OVT-3', SubmitterEmail: 'ada@contoso.com' }
    ]);
    const links: { [reference: string]: string } = await myCaseLinks(context, 'ada@contoso.com');
    expect(links).toEqual({
      'OVT-1': 'https://contoso.sharepoint.com/sites/ai/Lists/AI CoE Use Cases/DispForm.aspx?ID=1',
      'OVT-3': 'https://contoso.sharepoint.com/sites/ai/Lists/AI CoE Use Cases/DispForm.aspx?ID=3'
    });
    const itemReads = store.requests.filter((request) => request.list === USE_CASES_LIST_TITLE && request.url.indexOf('/items') >= 0);
    expect(itemReads).toHaveLength(1);
  });

  it('finds named cases one by one and leaves out any the reader cannot see', async () => {
    const { store, context } = harness();
    store.seed(USE_CASES_LIST_TITLE, [{ CoEID: 'OVT-9' }, { CoEID: 'OVT-8' }]);
    expect(await caseLinksFor(context, ['OVT-8', 'OVT-404', 'OVT-8'])).toEqual({
      'OVT-8': 'https://contoso.sharepoint.com/sites/ai/Lists/AI CoE Use Cases/DispForm.aspx?ID=2'
    });
  });

  it('gives no link, rather than failing, when a list cannot be read', async () => {
    const { store, context } = harness();
    store.deny(USE_CASES_LIST_TITLE);
    store.fail(INTAKES_LIST_TITLE);
    expect(await myCaseLinks(context, 'ada@contoso.com')).toEqual({});
    expect(await caseLinksFor(context, ['OVT-1'])).toEqual({});
    expect(await requestLink(context, 7)).toBeUndefined();
  });
});

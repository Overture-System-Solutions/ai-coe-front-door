import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import type { IRecordedRequest } from '../../../testing/listStore';
import { APPROVED_TOOLS_SELECT, APPROVED_TOOLS_TOP, approvedToolsUrl, ApprovedToolsService } from './approvedToolsService';
import type { IApprovedTool, IApprovedToolsResult } from './approvedToolsService';
import { APPROVED_TOOLS_LIST_TITLE } from './lists';
import type { IListClient, IServiceContext } from './types';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';
const TOOLS_URL: string = `${SITE}/_api/web/lists/getbytitle('AI CoE Approved Tools')/items`;

function contextFor(client: IListClient): IServiceContext {
  return { siteUrl: SITE, user: { displayName: 'Ada Example', email: 'ada@contoso.com' }, client, configuration: 'v1' };
}

function createHarness(): { store: InMemoryListStore; service: ApprovedToolsService } {
  const store: InMemoryListStore = new InMemoryListStore([APPROVED_TOOLS_LIST_TITLE]);
  return { store, service: new ApprovedToolsService(contextFor(createFakeListClient(store))) };
}

async function silenced<T>(run: (errorSpy: jest.SpyInstance) => Promise<T>): Promise<T> {
  const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
  try {
    return await run(errorSpy);
  } finally {
    errorSpy.mockRestore();
  }
}

describe('approved tools url', () => {
  it('projects the declared columns of the register and asks for one page of rows', () => {
    expect(approvedToolsUrl(SITE)).toBe(`${TOOLS_URL}?$select=${APPROVED_TOOLS_SELECT}&$top=200`);
    expect(APPROVED_TOOLS_TOP).toBe(200);
    expect(APPROVED_TOOLS_SELECT.split(',').slice(0, 3)).toEqual(['Id', 'Title', 'ToolId']);
  });
});

describe('ApprovedToolsService', () => {
  it('reads every reviewed tool once, by name, with exactly the allowances its row grants', async () => {
    const { store, service } = createHarness();
    store.seed(APPROVED_TOOLS_LIST_TITLE, [
      {
        Title: 'Writing Assistant',
        ToolId: 'writing-assistant',
        OtherNames: 'WA, the writer;  Assistant ',
        Vendor: 'Example Co',
        Status: 'Approved with conditions',
        ApprovedFor: 'Drafting and summarising.',
        CompanyInfoAllowed: true,
        EmployeeInfoAllowed: false,
        FileUploadsAllowed: true,
        Conditions: 'A person reviews the output.',
        NotApprovedFor: 'Customer letters.',
        HowToGetAccess: 'Sign in with your work account.',
        LastReviewed: '2026-09-30T00:00:00Z',
        ReviewedBy: 'AI CoE'
      },
      { Title: 'Another Tool', ToolId: 'another-tool', Status: 'Not approved' }
    ]);
    const result: IApprovedToolsResult = await service.getTools();
    expect(result.state).toBe('ok');
    expect(result.tools.map((tool: IApprovedTool): string => tool.name)).toEqual(['Another Tool', 'Writing Assistant']);
    expect(result.tools[1]).toEqual({
      id: 'writing-assistant',
      name: 'Writing Assistant',
      otherNames: ['WA', 'the writer', 'Assistant'],
      vendor: 'Example Co',
      status: 'Approved with conditions',
      approvedFor: 'Drafting and summarising.',
      allows: {
        companyInformation: true,
        employeeInformation: false,
        customerInformation: false,
        patientInformation: false,
        otherConfidentialInformation: false,
        regulatedInformation: false,
        fileUploads: true,
        externalSharing: false
      },
      conditions: 'A person reviews the output.',
      notApprovedFor: 'Customer letters.',
      howToGetAccess: 'Sign in with your work account.',
      lastReviewed: '2026-09-30',
      reviewedBy: 'AI CoE'
    });
    const gets: IRecordedRequest[] = store.requests.filter((request: IRecordedRequest): boolean => request.method === 'GET');
    expect(gets).toHaveLength(1);
    expect(gets[0].url).toBe(approvedToolsUrl(SITE));
    expect(gets[0].headers).toEqual({ Accept: 'application/json;odata=nometadata' });
  });

  it('never reads an approval into a blank: a blank allowance allows nothing and an unknown status is under review', async () => {
    const { store, service } = createHarness();
    store.seed(APPROVED_TOOLS_LIST_TITLE, [
      { Title: 'Blank', ToolId: 'blank', Status: '', CompanyInfoAllowed: null, PatientInfoAllowed: 'yes', ExternalSharingAllowed: 1 },
      { Title: 'Made up', ToolId: 'made-up', Status: 'Approved forever' }
    ]);
    const result: IApprovedToolsResult = await service.getTools();
    const blank: IApprovedTool = result.tools.filter((tool: IApprovedTool): boolean => tool.id === 'blank')[0];
    expect(blank.status).toBe('Under review');
    expect(Object.keys(blank.allows).filter((key: string): boolean => (blank.allows as unknown as { [key: string]: boolean })[key])).toEqual([]);
    expect(result.tools.filter((tool: IApprovedTool): boolean => tool.id === 'made-up')[0].status).toBe('Under review');
  });

  it('drops a row with no key or no name and keeps the first of two keys that differ only in case', async () => {
    const { store, service } = createHarness();
    store.seed(APPROVED_TOOLS_LIST_TITLE, [
      { Title: 'No key', Status: 'Approved' },
      { ToolId: 'no-name', Status: 'Approved' },
      { Title: 'First', ToolId: 'Twice', Status: 'Approved' },
      { Title: 'Second', ToolId: 'twice', Status: 'Not approved' }
    ]);
    const result: IApprovedToolsResult = await service.getTools();
    expect(result.tools.map((tool: IApprovedTool): string => `${tool.id}:${tool.name}`)).toEqual(['Twice:First']);
  });

  it('reports a site without the register as unavailable, with no tools at all', async () => {
    await silenced(async (errorSpy: jest.SpyInstance): Promise<void> => {
      const store: InMemoryListStore = new InMemoryListStore([]);
      const service: ApprovedToolsService = new ApprovedToolsService(contextFor(createFakeListClient(store)));
      const result: IApprovedToolsResult = await service.getTools();
      expect(result.state).toBe('unavailable');
      expect(result.tools).toEqual([]);
      expect(result.message).toBe('The approved tools could not be read: AI CoE Approved Tools answered 404.');
      expect(result.failureClass).toBe('SOURCE');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });
});

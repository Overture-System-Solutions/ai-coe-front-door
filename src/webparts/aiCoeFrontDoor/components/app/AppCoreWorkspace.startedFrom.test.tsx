import * as React from 'react';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithFrontDoor, TEST_SITE_URL, TEST_USER } from '../../../../testing/renderWithFrontDoor';
import { createFakeMyWorkService } from '../../../../testing/fakeServices';
import { createSyntheticCoreWorkService, SYNTHETIC_CORE_STORE_KEY } from '../../services/core/coreWorkService';
import type { ICoreWorkService } from '../../services/core/coreWorkService';
import type { ILegacyRefs } from '../../services/core/coreContract';
import { MemoryStorageBackend } from '../../services/marketing/artifactStore';
import type { IMyWorkService } from '../../services/myWorkService';
import { AppCoreWorkspace } from './AppCoreWorkspace';

// A business case that started as a request names that request and its AI CoE case, and links to both (1.0.0.19).
const session = { actorId: TEST_USER.email, tenantScope: TEST_SITE_URL };
const REFERENCE: string = 'OVT-AICOE-20260918-JOURNEY4';

async function businessCase(refs: ILegacyRefs | undefined): Promise<{ service: ICoreWorkService; workId: string }> {
  const backend: MemoryStorageBackend = new MemoryStorageBackend();
  const first: ICoreWorkService = createSyntheticCoreWorkService(TEST_USER.email, { backend });
  const made = await first.createOrResume(session, {
    s1: { Title: 'Draft first replies to billing questions', SourceChannel: 'FRONT_DOOR', ProblemStatement: 'Slow replies', DesiredOutcome: 'Same-day replies', Sponsor: 'Billing manager' }
  });
  if (made.kind !== 'ok' || made.work === undefined) {
    throw new Error('Fixture create failed');
  }
  const state = JSON.parse(backend.getItem(SYNTHETIC_CORE_STORE_KEY) as string);
  if (refs !== undefined) {
    state.engine.works[made.work.workId].work.LegacyRefs = refs;
  }
  backend.setItem(SYNTHETIC_CORE_STORE_KEY, JSON.stringify(state));
  return { service: createSyntheticCoreWorkService(TEST_USER.email, { backend }), workId: made.work.workId };
}

function links(): IMyWorkService {
  const service: IMyWorkService = createFakeMyWorkService();
  service.requestLinksFor = jest.fn(async (references: readonly string[]) =>
    references.indexOf(REFERENCE) >= 0 ? { [REFERENCE]: 'https://contoso.example/sites/ai/Lists/AI CoE Pilot Intakes/DispForm.aspx?ID=41' } : {}
  );
  service.caseLinks = jest.fn(async (references: readonly string[]) =>
    references.indexOf(REFERENCE) >= 0 ? { [REFERENCE]: 'https://contoso.example/sites/ai/Lists/AI CoE Use Cases/DispForm.aspx?ID=12' } : {}
  );
  return service;
}

async function open(service: ICoreWorkService, workId: string, myWork?: IMyWorkService): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />, { myWork });
  await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
  await waitFor((): void => { expect(view.getByRole('button', { name: new RegExp(workId) })).not.toBeDisabled(); });
  await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: new RegExp(workId) })); });
  await waitFor((): void => { expect(view.getByRole('region', { name: 'Selected case status' })).toBeInTheDocument(); });
  return view;
}

beforeEach(() => { window.localStorage.clear(); });

describe('where a business case started', () => {
  it('names the request and its case and opens each record in a new tab', async () => {
    const { service, workId } = await businessCase({ IntakeId: REFERENCE, CoEID: REFERENCE });
    const view = await open(service, workId, links());
    const overview: HTMLElement = view.getByRole('region', { name: 'Selected case status' });
    await waitFor((): void => { expect(within(overview).getByRole('link', { name: 'Open the case' })).toBeInTheDocument(); });
    expect(overview).toHaveTextContent(`Started from request ${REFERENCE}`);
    const request: HTMLElement = within(overview).getByRole('link', { name: 'Open the request' });
    expect(request).toHaveAttribute('href', 'https://contoso.example/sites/ai/Lists/AI CoE Pilot Intakes/DispForm.aspx?ID=41');
    expect(request).toHaveAttribute('target', '_blank');
    expect(request).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(overview).getByRole('link', { name: 'Open the case' })).toHaveAttribute('href', 'https://contoso.example/sites/ai/Lists/AI CoE Use Cases/DispForm.aspx?ID=12');
  });

  it('still names the request when its records cannot be linked', async () => {
    const { service, workId } = await businessCase({ IntakeId: REFERENCE, CoEID: REFERENCE });
    const view = await open(service, workId);
    const overview: HTMLElement = view.getByRole('region', { name: 'Selected case status' });
    expect(overview).toHaveTextContent(`Started from request ${REFERENCE}`);
    expect(within(overview).queryByRole('link')).toBeNull();
  });

  it('names a case that has no separate request reference by its case alone', async () => {
    const { service, workId } = await businessCase({ CoEID: 'AICOE-2026-000123' });
    const view = await open(service, workId);
    expect(view.getByRole('region', { name: 'Selected case status' })).toHaveTextContent('Started from AI CoE case AICOE-2026-000123');
  });

  it('says nothing about a start for a case created here', async () => {
    const { service, workId } = await businessCase(undefined);
    const view = await open(service, workId, links());
    expect(view.getByRole('region', { name: 'Selected case status' })).not.toHaveTextContent('Started from');
  });
});

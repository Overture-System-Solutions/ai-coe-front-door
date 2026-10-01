/**
 * My requests links each card to what it stands for (1.0.0.18): a request that opened a case to the case, any other
 * request to its own row, both in a new tab. A card the links could not be resolved for stays, unlinked.
 */
import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { createFakeListClient, InMemoryListStore } from '../../../../testing/listStore';
import { renderWithFrontDoor, TEST_SITE_URL, TEST_USER } from '../../../../testing/renderWithFrontDoor';
import { INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE } from '../../services/GovernanceService';
import { MyWorkService } from '../../services/myWorkService';
import { MyWork } from './MyWork';

function service(store: InMemoryListStore): MyWorkService {
  return new MyWorkService({ siteUrl: TEST_SITE_URL, user: TEST_USER, client: createFakeListClient(store), configuration: 'v1' });
}

describe('My requests links (1.0.0.18)', () => {
  it('links a request with a case to the case and any other request to its row, each in a new tab', async () => {
    const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE]);
    store.seed(INTAKES_LIST_TITLE, [
      { Title: 'AI idea', IntakeId: 'OVT-IDEA', WorkflowType: 'idea', Status: 'Submitted - Pilot', RequestorEmail: TEST_USER.email, SubmittedAt: '2026-09-02T10:00:00Z' },
      { Title: 'Help', IntakeId: 'OVT-HELP', WorkflowType: 'helpTraining', Status: 'Submitted - Pilot', RequestorEmail: TEST_USER.email, SubmittedAt: '2026-09-01T10:00:00Z' }
    ]);
    store.seed(USE_CASES_LIST_TITLE, [{ CoEID: 'OVT-IDEA', SubmitterEmail: TEST_USER.email }]);
    renderWithFrontDoor(<MyWork />, { myWork: service(store), pageView: true });
    const rows: HTMLElement[] = await screen.findAllByRole('article');
    const idea: HTMLAnchorElement = await within(rows[0]).findByRole('link', { name: /AI idea/ });
    expect(idea.getAttribute('href')).toBe(`${TEST_SITE_URL}/Lists/${USE_CASES_LIST_TITLE}/DispForm.aspx?ID=3`);
    expect(idea.getAttribute('target')).toBe('_blank');
    expect(idea.getAttribute('rel')).toBe('noopener noreferrer');
    expect(within(rows[0]).getByText('Open the case')).toBeInTheDocument();
    const help: HTMLAnchorElement = await within(rows[1]).findByRole('link', { name: /Help or training/ });
    expect(help.getAttribute('href')).toBe(`${TEST_SITE_URL}/Lists/${INTAKES_LIST_TITLE}/DispForm.aspx?ID=2`);
    expect(within(rows[1]).getByText('Open the request')).toBeInTheDocument();
  });

  it('keeps the cards, unlinked, when the links cannot be read', async () => {
    const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE]);
    store.seed(INTAKES_LIST_TITLE, [{ Title: 'Help', IntakeId: 'OVT-HELP', WorkflowType: 'helpTraining', Status: 'Submitted - Pilot', RequestorEmail: TEST_USER.email }]);
    const read: MyWorkService = service(store);
    const original = read.getMine.bind(read);
    read.getMine = async () => {
      const result = await original();
      store.fail(INTAKES_LIST_TITLE);
      return result;
    };
    renderWithFrontDoor(<MyWork />, { myWork: read, pageView: true });
    const rows: HTMLElement[] = await screen.findAllByRole('article');
    expect(rows).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(within(rows[0]).queryByRole('link')).toBeNull();
    expect(within(rows[0]).getByText('Help or training')).toBeInTheDocument();
  });
});

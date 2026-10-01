/**
 * The approved-tools register in the tabbed view (1.0.0.18): Home shows the register read-only at its foot (moved there
 * from Requests in 1.0.0.19), the tool check
 * picks its tool from it in five screens and answers from the tool's row - without the old "prototype" label - and the
 * other shorter forms ask their related questions together.
 */
import * as React from 'react';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { AppShell } from './AppShell';
import type { IApprovedTool, IApprovedToolsResult, IApprovedToolsService, IToolAllowances } from '../../services/approvedToolsService';

const NONE: IToolAllowances = { companyInformation: false, employeeInformation: false, customerInformation: false, patientInformation: false, otherConfidentialInformation: false, regulatedInformation: false, fileUploads: false, externalSharing: false };

const COPILOT: IApprovedTool = {
  id: 'copilot-chat',
  name: 'Microsoft 365 Copilot Chat',
  otherNames: ['Copilot'],
  status: 'Approved',
  approvedFor: 'Drafting and summarising',
  allows: { ...NONE, companyInformation: true },
  conditions: 'Sign in with your work account.',
  lastReviewed: '2026-09-30'
};
const GAMMA: IApprovedTool = { id: 'gamma', name: 'Gamma', otherNames: [], status: 'Not approved', allows: NONE };

function register(result: IApprovedToolsResult): IApprovedToolsService {
  return { getTools: jest.fn().mockResolvedValue(result) };
}

async function openHome(approvedTools?: IApprovedToolsService): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const view = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'wide', pages: {} }} />, { approvedTools });
  await act(async (): Promise<void> => undefined);
  expect(view.getByRole('tab', { name: 'Home', selected: true })).toBeInTheDocument();
  return view;
}

async function openRequests(approvedTools?: IApprovedToolsService): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const view = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'wide', pages: {} }} />, { approvedTools });
  await act(async (): Promise<void> => undefined);
  await act(async (): Promise<void> => {
    fireEvent.click(view.getByRole('tab', { name: 'Requests', exact: true }));
  });
  return view;
}

function choose(container: HTMLElement, question: string, option: string): void {
  const group: HTMLElement = within(container).getByRole('group', { name: question });
  fireEvent.click(within(group).getByRole('button', { name: option }));
}

async function next(view: ReturnType<typeof renderWithFrontDoor>, label: string = 'Continue'): Promise<void> {
  await act(async (): Promise<void> => {
    fireEvent.click(view.getByRole('button', { name: label }));
  });
}

describe('the approved-tools register in the tabbed view', () => {
  it('shows the register at the foot of Home: each tool with its status, what it is approved for and the information it may use', async () => {
    const view = await openHome(register({ state: 'ok', tools: [GAMMA, COPILOT], message: 'Read 2 tools.' }));
    const panel: HTMLElement = await view.findByRole('region', { name: 'Approved tools' });
    // Last on Home: after the entry panel and its three ways in.
    const choices: Element | null = view.container.querySelector('.ai-app-choices');
    expect(choices).not.toBeNull();
    expect((choices as Element).compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panel.parentElement?.lastElementChild).toBe(panel);
    const rows: HTMLElement[] = within(panel).getAllByRole('listitem');
    expect(rows.map((row: HTMLElement): string => within(row).getByRole('heading').textContent ?? '')).toEqual(['Gamma', 'Microsoft 365 Copilot Chat']);
    expect(rows[1].textContent).toContain('Approved');
    expect(rows[1].textContent).toContain('Drafting and summarising');
    expect(rows[1].textContent).toContain('Company information');
    expect(rows[1].textContent).toContain('Sign in with your work account.');
    expect(rows[1].textContent).toContain('Reviewed 2026-09-30');
    expect(rows[0].textContent).toContain('Not approved');
  });

  it('leaves the register off Requests, which now holds only the request forms and My requests (1.0.0.19)', async () => {
    const view = await openRequests(register({ state: 'ok', tools: [GAMMA, COPILOT], message: 'Read 2 tools.' }));
    expect(view.getByRole('region', { name: 'Start a request' })).toBeInTheDocument();
    expect(view.queryByRole('region', { name: 'Approved tools' })).toBeNull();
  });

  it('says so when the register is empty or cannot be read', async () => {
    const empty = await openHome(register({ state: 'ok', tools: [], message: 'Read 0 tools.' }));
    expect((await empty.findByRole('region', { name: 'Approved tools' })).textContent).toContain('No tools are on the approved list yet.');
    empty.unmount();
    const failed = await openHome(register({ state: 'unavailable', tools: [], message: 'x', failureClass: 'SOURCE', userMessage: 'x' }));
    expect((await failed.findByRole('region', { name: 'Approved tools' })).textContent).toContain('The approved tools could not be read on this site.');
  });

  it('walks the tool check in five screens with the tool picked from the register, and answers from its row', async () => {
    const view = await openRequests(register({ state: 'ok', tools: [COPILOT, GAMMA], message: 'Read 2 tools.' }));
    await act(async (): Promise<void> => {
      fireEvent.click(view.getByRole('button', { name: /^Check a tool or task/ }));
    });
    await waitFor((): void => expect(view.container.querySelector('#helpWith')).not.toBeNull());
    expect(view.container.textContent).not.toContain('Guidance prototype');
    fireEvent.change(view.container.querySelector('#helpWith') as Element, { target: { value: 'Summarise my meeting notes' } });
    choose(view.container, 'Which tool would you use?', 'Microsoft 365 Copilot Chat');
    expect(view.container.querySelector('#toolName')).toBeNull();
    await next(view);
    choose(view.container, 'Would this use, upload, connect to, or describe company information — or become part of an ongoing work process?', 'Yes');
    choose(view.container, 'Would any of these be involved: patient, employee, customer, confidential, or regulated information?', 'None of these');
    await next(view);
    choose(view.container, 'Would you upload any files?', 'No');
    choose(view.container, 'Would the output be shared outside Overture?', 'No');
    await next(view);
    expect(view.container.textContent).toContain('Decisions and actions');
    choose(view.container, 'Would AI recommend or make an important decision?', 'No');
    choose(view.container, 'Would AI take an action in another system, like sending something or updating a record?', 'No');
    await next(view);
    choose(view.container, "Would a person review the output before it's used?", 'Yes, every time');
    choose(view.container, "Is this something you'd try once, use occasionally, or use as part of an ongoing process?", 'Occasional use');
    await next(view, 'See guidance');
    await waitFor((): void => expect(view.container.textContent).toContain('This appears eligible for a standard-use check'));
    expect(view.container.textContent).toContain('Microsoft 365 Copilot Chat is on the AI CoE approved-tools list');
    expect(view.container.textContent).toContain('Follow the conditions for Microsoft 365 Copilot Chat: Sign in with your work account.');
    expect(view.container.textContent).not.toContain('Guidance prototype');
  });

  it('asks the idea form\'s related questions together on one screen', async () => {
    const view = await openRequests();
    await act(async (): Promise<void> => {
      fireEvent.click(view.getByRole('button', { name: /^Explore an AI idea/ }));
    });
    await waitFor((): void => expect(view.container.querySelector('#workToImprove')).not.toBeNull());
    expect(view.container.querySelector('#painPoints')).not.toBeNull();
  });
});

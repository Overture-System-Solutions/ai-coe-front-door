import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { InMemoryDraftStore } from '../../../testing/fakeServices';
import { enterAnswer } from '../../../testing/journeys';
import { renderWithFrontDoor } from '../../../testing/renderWithFrontDoor';
import { createBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import type { IWorkflowCatalog } from '../workflows/types';
import { FrontDoorShell } from './FrontDoorShell';

const catalog: IWorkflowCatalog = createWorkflowCatalog(createBranding('Overture'));

function card(title: string): HTMLElement {
  return screen.getByText(title).closest('button') as HTMLElement;
}

describe('FrontDoorShell', () => {
  it('starts on the landing page inside the home shell', () => {
    const { container } = renderWithFrontDoor(<FrontDoorShell />);
    expect(container.firstChild).toHaveClass('overture-app', 'min-h-screen');
    expect(container.querySelector('.ai-home-shell')).not.toBeNull();
    expect(container.querySelector('.ai-workflow-shell')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'AI, safely put to work.' })).toBeInTheDocument();
    expect(screen.queryByText('AI CoE Lab')).not.toBeInTheDocument();
  });

  it('discovers saved drafts and resumes them when their path is chosen', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('idea', { answers: { workToImprove: 'Reports' }, currentStepId: 'painPoints', phase: 'form' });
    await draftStore.save('feedback', { answers: {}, phase: 'form' });
    const { container } = renderWithFrontDoor(<FrontDoorShell />, { draftStore });
    await waitFor((): void => expect(screen.getAllByText('Resume draft')).toHaveLength(2));
    expect(within(card('Explore an AI idea')).getByText('Resume draft')).toBeInTheDocument();
    expect(within(card('Share feedback')).getByText('Resume draft')).toBeInTheDocument();

    fireEvent.click(card('Explore an AI idea'));
    expect(container.querySelector('.ai-workflow-shell')).not.toBeNull();
    const header: HTMLElement = screen.getByText('AI CoE Lab').closest('p') as HTMLElement;
    expect(header).toHaveTextContent('Overture AI CoE Lab');
    expect(screen.getByText('Governed intake · SharePoint connected')).toHaveClass('overture-badge');
    expect(screen.getByRole('heading', { level: 1, name: catalog.idea.title })).toBeInTheDocument();
    await screen.findByText('Picking up where you left off.');
    expect(screen.getByRole('heading', { level: 2, name: catalog.idea.steps[1].title })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    expect(screen.getByRole('heading', { level: 1, name: 'AI, safely put to work.' })).toBeInTheDocument();
    expect(within(card('Explore an AI idea')).getByText('Resume draft')).toBeInTheDocument();
  });

  it('routes every path to its workflow and keeps the draft badges in sync', async () => {
    renderWithFrontDoor(<FrontDoorShell />);
    fireEvent.click(card('Get help or training'));
    expect(screen.getByRole('heading', { level: 1, name: catalog.helpTraining.title })).toBeInTheDocument();
    await screen.findByRole('heading', { level: 2, name: catalog.helpTraining.steps[0].title });
    enterAnswer(catalog.helpTraining.steps[0], 'new');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved.');
    fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    expect(within(card('Get help or training')).getByText('Resume draft')).toBeInTheDocument();
    expect(screen.getAllByText('Resume draft')).toHaveLength(1);

    for (const [title, workflow] of [
      ['Check a tool or task', catalog.toolCheck],
      ['Register team AI use', catalog.teamUsage],
      ['Share feedback', catalog.feedback]
    ] as const) {
      fireEvent.click(card(title));
      expect(screen.getByRole('heading', { level: 1, name: workflow.title })).toBeInTheDocument();
      await screen.findByRole('heading', { level: 2, name: workflow.steps[0].title });
      fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    }
  });

  it('opens the administrator dashboard for site administrators', async () => {
    renderWithFrontDoor(<FrontDoorShell />, { isAdmin: true });
    fireEvent.click(screen.getByRole('button', { name: 'Open admin dashboard' }));
    expect(screen.getByRole('heading', { level: 1, name: 'AI CoE Admin Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('AI CoE Lab')).not.toBeInTheDocument();
    await screen.findByText('0 of 0 records shown');
    fireEvent.click(screen.getByRole('button', { name: 'Front Door' }));
    expect(screen.getByRole('heading', { level: 1, name: 'AI, safely put to work.' })).toBeInTheDocument();
  });

  it('drops the organization prefix from the header when unbranded', async () => {
    renderWithFrontDoor(<FrontDoorShell />, { organizationName: '' });
    fireEvent.click(card('Share feedback'));
    expect((screen.getByText('AI CoE Lab').closest('p') as HTMLElement).textContent).toBe('AI CoE Lab');
    await screen.findByRole('heading', { level: 2, name: catalog.feedback.steps[0].title });
  });
});

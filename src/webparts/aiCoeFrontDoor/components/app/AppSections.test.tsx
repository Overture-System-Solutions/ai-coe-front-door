import * as React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InMemoryDraftStore } from '../../../../testing/fakeServices';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { AppShell } from './AppShell';

async function shell(): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const result = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'narrow', pages: {} }} />);
  await act(async () => undefined);
  return result;
}

describe('same-app measurement and teaching entry', () => {
  it.each(['Explore an AI idea', 'Check a tool or task', 'Register team AI use', 'Get help or training'])('centers only the Requests form for %s', async starter => {
    const view = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'wide', pages: {} }} />);
    await act(async (): Promise<void> => undefined);
    fireEvent.click(view.getByRole('tab', { name: 'Requests', exact: true }));
    expect(view.container.querySelector('.ai-workflow-shell')).toBeNull();
    expect(view.container.querySelectorAll('.ai-app-starters--engineering .ai-app-starter')).toHaveLength(4);
    fireEvent.click(view.getByRole('button', { name: (name: string): boolean => name.startsWith(starter) }));
    await waitFor(() => expect(view.container.querySelector('.overture-card')).not.toBeNull());
    const card = view.container.querySelector('.overture-card');
    expect(card?.closest('.ai-workflow-shell')).not.toBeNull();
    expect(view.container.querySelectorAll('.ai-workflow-shell')).toHaveLength(1);
    expect(view.getByRole('heading', { name: 'Requests', exact: true }).closest('.ai-workflow-shell')).toBeNull();
    expect(view.getByRole('tablist').closest('.ai-workflow-shell')).toBeNull();
    expect(view.governance.submissions).toHaveLength(0);
    fireEvent.click(view.getByRole('tab', { name: 'Requests', exact: true }));
    expect(view.container.querySelector('.ai-workflow-shell')).toBeNull();
    expect(view.container.querySelectorAll('.ai-app-starters--engineering .ai-app-starter')).toHaveLength(4);
  });


  it.each(['Record a task outcome', 'Share feedback'])('centers only the Improvement form for %s', async starter => {
    const view = await shell();
    fireEvent.click(view.getByRole('tab', { name: 'Improvement' }));
    expect(view.container.querySelector('.ai-workflow-shell')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: (name: string): boolean => name.startsWith(starter) }));
    await waitFor(() => expect(view.container.querySelector('.ai-app-starters')).toBeNull());
    const shells: NodeListOf<Element> = view.container.querySelectorAll('.ai-workflow-shell');
    expect(shells).toHaveLength(1);
    expect(shells[0].querySelector('button, input, textarea, select')).not.toBeNull();
    expect(view.getByRole('heading', { name: 'Improvement', exact: true }).closest('.ai-workflow-shell')).toBeNull();
    expect(view.getByRole('tablist').closest('.ai-workflow-shell')).toBeNull();
    const styles = fs.readFileSync(path.join(process.cwd(), 'src/webparts/aiCoeFrontDoor/styles/frontDoor.global.scss'), 'utf8');
    expect(styles).toMatch(/\.ai-workflow-shell\s*\{[^}]*margin:\s*0 auto;[^}]*max-width:\s*48rem;/);
    fireEvent.click(view.getByRole('tab', { name: 'Improvement' }));
    expect(view.container.querySelector('.ai-workflow-shell')).toBeNull();
  });


  it('pads the Improvement starter row above its cards without narrowing the overview', async () => {
    const view = await shell();
    fireEvent.click(view.getByRole('tab', { name: 'Improvement' }));
    const row = view.getByRole('button', { name: /^Record a task outcome/ }).closest('ul');
    expect(row).toHaveClass('ai-app-starters--spaced');
    expect(row?.closest('.ai-workflow-shell')).toBeNull();
    const styles = fs.readFileSync(path.join(process.cwd(), 'src/webparts/aiCoeFrontDoor/styles/appShell.global.scss'), 'utf8');
    expect(styles).toMatch(/\.ai-app-starters--spaced\s*\{[^}]*padding-top:\s*24px;/);
  });


  it('marks the starters that have a saved draft, and opening one resumes it', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('idea', { answers: { workToImprove: 'Weekly status reports' }, currentStepId: 'workToImprove', phase: 'form' });
    await draftStore.save('feedback', { answers: {}, currentStepId: 'feedbackType', phase: 'form' });
    const view = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'wide', pages: {} }} />, { draftStore });
    await act(async (): Promise<void> => undefined);

    fireEvent.click(view.getByRole('tab', { name: 'Requests', exact: true }));
    const idea: HTMLElement = await view.findByRole('button', { name: /^Explore an AI idea.*Resume draft$/ });
    expect(within(idea).getByText('Resume draft')).toHaveClass('ai-app-draft-badge');
    expect(within(view.getByRole('button', { name: /^Check a tool or task/ })).queryByText('Resume draft')).toBeNull();
    expect(within(view.getByRole('button', { name: /^Get help or training/ })).queryByText('Resume draft')).toBeNull();

    fireEvent.click(view.getByRole('tab', { name: 'Improvement' }));
    const feedback: HTMLElement = await view.findByRole('button', { name: /^Share feedback.*Resume draft$/ });
    expect(within(feedback).getByText('Resume draft')).toBeInTheDocument();
    expect(view.getAllByText('Resume draft')).toHaveLength(1);

    fireEvent.click(view.getByRole('tab', { name: 'Requests', exact: true }));
    fireEvent.click(await view.findByRole('button', { name: /^Explore an AI idea.*Resume draft$/ }));
    expect(await view.findByDisplayValue('Weekly status reports')).toBeInTheDocument();
  });

  it('adds top padding to the Cases explanation row, not inside its cards', async () => {
    const view = await shell();
    fireEvent.click(view.getByRole('tab', { name: 'Cases' }));
    fireEvent.click(view.getByRole('button', { name: 'What is going on?' }));
    const row = view.getByRole('heading', { name: 'What happens to a request' }).closest('.ai-app-split');
    expect(row).toHaveClass('ai-app-cases-explanation');
    expect(row).toContainElement(view.getByRole('heading', { name: 'Truth controls' }));
    const styles = fs.readFileSync(path.join(process.cwd(), 'src/webparts/aiCoeFrontDoor/styles/appShell.global.scss'), 'utf8');
    expect(styles).toMatch(/\.ai-app-cases-explanation\s*\{\s*padding-top:\s*24px;/);
  });

  it.each(['wide', 'narrow'] as const)('lays the four Requests forms in one row and My requests in two columns in the %s layout, one column when narrow', async layout => {
    const view = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout, pages: {} }} />);
    await act(async () => undefined);
    fireEvent.click(view.getByRole('tab', { name: 'Requests' }));
    const starters = view.container.querySelector('.ai-app-starters--engineering');
    expect(starters).not.toBeNull();
    expect(starters?.querySelectorAll('.ai-app-starter-button')).toHaveLength(4);
    expect(starters?.closest('section.ai-app-requests-start')).not.toBeNull();
    expect(Array.from(starters?.querySelectorAll('.ai-app-starter-title') ?? []).map(node => node.textContent)).toEqual([
      'Explore an AI idea', 'Check a tool or task', 'Register team AI use', 'Get help or training'
    ]);
    const styles = fs.readFileSync(path.join(process.cwd(), 'src/webparts/aiCoeFrontDoor/styles/appShell.global.scss'), 'utf8');
    // 1.0.0.19: the four forms in one row (two by two on a medium screen), My requests in two columns that fill side by
    // side; the narrow layout and a small screen get one column of each. The 1.0.0.18 side-by-side grid is gone.
    expect(styles).not.toMatch(/\.ai-app-requests\s*\{/);
    expect(styles).toMatch(/\.ai-app-starters--engineering\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
    expect(styles).toMatch(/@media \(max-width: 1024px\)\s*\{\s*\.ai-view--app \.ai-app-starters--engineering\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
    expect(styles).toMatch(/\.ai-app-requests-mine \.ai-page-mywork-list\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
    expect(styles).toMatch(/\.ai-view--app\.ai-view--narrow\s*\{\s*\.ai-app-requests-mine \.ai-page-mywork-list\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
    expect(styles).toMatch(/@media \(max-width: 720px\)\s*\{\s*\.ai-view--app \.ai-app-requests-mine \.ai-page-mywork-list\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
    fireEvent.click(view.getByRole('button', { name: /Check a tool or task/ }));
    await waitFor(() => expect(view.container.querySelector('.ai-app-starters')).toBeNull());
    expect(view.governance.submissions).toHaveLength(0);
  });

  it('opens and closes the guidance with keyboard controls in the narrow layout', async () => {
    const view = await shell();
    const user = userEvent.setup();
    fireEvent.click(view.getByRole('tab', { name: 'Improvement' }));
    const button = view.getByRole('button', { name: 'Getting started: safe task and review' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(view.getByRole('region', { name: 'Getting started: safe task and review' })).toBeInTheDocument();
    await user.keyboard(' ');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(view.queryByRole('region', { name: 'Getting started: safe task and review' })).toBeNull();
    expect(view.container.querySelector('.ai-view--narrow')).not.toBeNull();
  });

  it('opens source, role, stop and recovery quick-start guidance from Engineering without a private source link', async () => {
    const view = await shell();
    fireEvent.click(view.getByRole('tab', { name: 'Requests' }));
    const guide = view.getByRole('button', { name: 'Getting started: safe task and review' });
    expect(guide).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(guide);
    expect(guide).toHaveAttribute('aria-expanded', 'true');
    const region = view.getByRole('region', { name: 'Getting started: safe task and review' });
    expect(region).toHaveTextContent('permitted sources');
    expect(region).toHaveTextContent('Reviewer');
    expect(region).toHaveTextContent('Champion');
    expect(region).toHaveTextContent('reconcile');
    expect(region).toHaveTextContent('not live acceptance');
    expect(region.querySelector('a[href^="http"]')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: /Get help or training/ }));
    await waitFor(() => expect(view.container.querySelector('.ai-app-starters')).toBeNull());
    expect(view.governance.submissions).toHaveLength(0);
  });

  it('connects Improvement guidance to the existing outcome form, not another tracker', async () => {
    const view = await shell();
    fireEvent.click(view.getByRole('tab', { name: 'Improvement' }));
    fireEvent.click(view.getByRole('button', { name: 'Getting started: safe task and review' }));
    fireEvent.click(view.getByRole('button', { name: 'What is going on?' }));
    expect(view.getByText(/No automatic policy change/)).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: /Record a task outcome/ }));
    await waitFor(() => expect(view.getByText('What kind of task was it?')).toBeInTheDocument());
    expect(view.governance.submissions).toHaveLength(0);
  });

  it('keeps Improvement proposal/retest guidance without the misplaced operator commissioning control', async () => {
    const view = await shell();
    fireEvent.click(view.getByRole('tab', { name: 'Improvement' }));
    expect(view.queryByRole('button', { name: /Operator commissioning/ })).toBeNull();
    expect(view.queryByRole('region', { name: /Operator commissioning/ })).toBeNull();
    expect(view.container.textContent).not.toContain('aggregate-workflow-outcomes.cjs');
    fireEvent.click(view.getByRole('button', { name: 'What is going on?' }));
    expect(view.getByText(/No automatic policy change/)).toBeInTheDocument();
    expect(view.getByText(/retest receipt/)).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: /Share feedback/ }));
    await waitFor(() => expect(view.container.querySelector('.ai-app-starters')).toBeNull());
    expect(view.governance.submissions).toHaveLength(0);
  });
});

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { InMemoryDraftStore } from '../../../../testing/fakeServices';
import { continueButton, enterAnswer, HELP_TRAINING_JOURNEY, journeyAnswers, playJourney } from '../../../../testing/journeys';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult, ITestFrontDoorOptions } from '../../../../testing/renderWithFrontDoor';
import { createBranding } from '../../branding/branding';
import { createWorkflowCatalog } from '../../content/workflows/catalog';
import type { IWorkflowDefinition } from '../../workflows/types';
import { GenericWorkflow } from './GenericWorkflow';

const helpTraining: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).helpTraining;
const firstTitle: string = helpTraining.steps[0].title;

interface IHarness extends FrontDoorRenderResult {
  onExit: jest.Mock;
  onDraftsChanged: jest.Mock;
}

function renderWorkflow(resumeDraft: boolean = false, options: ITestFrontDoorOptions = {}): IHarness {
  const onExit: jest.Mock = jest.fn();
  const onDraftsChanged: jest.Mock = jest.fn();
  const result: FrontDoorRenderResult = renderWithFrontDoor(
    <GenericWorkflow workflowId="helpTraining" resumeDraft={resumeDraft} onExit={onExit} onDraftsChanged={onDraftsChanged} />,
    options
  );
  return { ...result, onExit, onDraftsChanged };
}

async function firstStep(): Promise<void> {
  await screen.findByRole('heading', { level: 2, name: firstTitle });
}

describe('GenericWorkflow', () => {
  it('boots into the first step with the intro and validates before moving on', async () => {
    const { onExit } = renderWorkflow();
    expect(screen.getByRole('status')).toHaveTextContent('Setting things up…');
    expect(screen.getByRole('heading', { level: 1, name: helpTraining.title })).toBeInTheDocument();
    await firstStep();
    expect(screen.getByText('A few quick questions. You can save your progress and come back any time.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Progress: Just getting started');
    fireEvent.click(continueButton());
    expect(screen.getByRole('status')).toHaveTextContent('Please pick one option so we can keep going.');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onExit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('walks to the review page, allows edits, and submits the answers', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('helpTraining', { answers: {} });
    const { governance, onDraftsChanged, onExit } = renderWorkflow(false, { draftStore });
    await firstStep();
    playJourney(HELP_TRAINING_JOURNEY, helpTraining);

    expect(screen.getByRole('heading', { name: 'Check your answers' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Progress: Review your answers');
    expect(screen.getByText('Prompting basics and safe use of Copilot.')).toBeInTheDocument();
    expect(screen.queryByText('A few quick questions. You can save your progress and come back any time.')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
    expect(screen.getByRole('heading', { level: 2, name: helpTraining.steps.filter((step) => step.id === 'name')[0].title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save & return to review' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Check your answers' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
    enterAnswer(helpTraining.steps.filter((step) => step.id === 'name')[0], 'Sam Example');
    fireEvent.click(screen.getByRole('button', { name: 'Save & return to review' }));
    expect(screen.getByText('Sam Example')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 2, name: helpTraining.steps.filter((step) => step.id === 'email')[0].title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review my answers' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review my answers' }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('status')).toHaveTextContent('Putting your summary together…');
    await screen.findByRole('heading', { name: 'Thanks for reaching out.' });
    expect(screen.getByText('Submission received: OVT-AICOE-20260911-TESTTEST')).toBeInTheDocument();
    expect(screen.getByText(helpTraining.whatHappensNext as string)).toBeInTheDocument();
    expect(governance.submissions).toEqual([{ workflowType: 'helpTraining', payload: { ...journeyAnswers(HELP_TRAINING_JOURNEY), name: 'Sam Example' } }]);
    expect(draftStore.keys()).toEqual([]);
    expect(onDraftsChanged).toHaveBeenCalledWith('helpTraining', false);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    const summary: HTMLElement = screen.getByText(/^Overture AI CoE — /);
    expect(summary.tagName).toBe('PRE');
    expect(summary.textContent).toContain('Sam Example');

    fireEvent.click(screen.getByRole('button', { name: 'Back to all topics' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('saves and resumes drafts', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    const first: IHarness = renderWorkflow(false, { draftStore });
    await firstStep();
    enterAnswer(helpTraining.steps[0], 'new');
    fireEvent.click(continueButton());
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved on this device.');
    expect(JSON.parse(draftStore.drafts.helpTraining)).toEqual({ answers: { helpCategory: 'new' }, currentStepId: 'newToAiFocus', phase: 'form' });
    expect(first.onDraftsChanged).toHaveBeenCalledWith('helpTraining', true);
    first.unmount();

    renderWorkflow(true, { draftStore });
    await screen.findByText('Picking up where you left off.');
    expect(screen.getByRole('heading', { level: 2, name: helpTraining.steps[1].title })).toBeInTheDocument();
    expect(screen.queryByText('A few quick questions. You can save your progress and come back any time.')).not.toBeInTheDocument();
  });

  it('resumes straight onto the review page and ignores drafts when not asked to resume', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('helpTraining', { answers: journeyAnswers(HELP_TRAINING_JOURNEY), currentStepId: 'email', phase: 'review' });
    const resumed: IHarness = renderWorkflow(true, { draftStore });
    await screen.findByRole('heading', { name: 'Check your answers' });
    expect(screen.getByText('Picking up where you left off.')).toBeInTheDocument();
    resumed.unmount();

    renderWorkflow(false, { draftStore });
    await firstStep();
    expect(screen.queryByText('Picking up where you left off.')).not.toBeInTheDocument();
  });

  it('asks before starting over and then clears everything', async () => {
    const { draftStore, onDraftsChanged } = renderWorkflow();
    await firstStep();
    enterAnswer(helpTraining.steps[0], 'new');
    fireEvent.click(continueButton());
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved on this device.');
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByRole('alertdialog', { name: 'Start over?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my answers' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: helpTraining.steps[1].title })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Start over' }));
    await firstStep();
    await waitFor(() => expect(draftStore.keys()).toEqual([]));
    expect(onDraftsChanged).toHaveBeenLastCalledWith('helpTraining', false);
    expect(screen.getByRole('button', { name: 'I am new to AI' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports a failed save without losing answers', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    draftStore.save = async (): Promise<{ ok: boolean }> => ({ ok: false });
    const { onDraftsChanged } = renderWorkflow(false, { draftStore });
    await firstStep();
    enterAnswer(helpTraining.steps[0], 'new');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('We could not save a draft right now. Your answers are still here for this session.');
    expect(onDraftsChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'I am new to AI' })).toHaveAttribute('aria-pressed', 'true');
  });
});

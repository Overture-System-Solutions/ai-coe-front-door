import { fireEvent, screen, within } from '@testing-library/react';
import * as React from 'react';
import { spyOnDownloads } from '../../../../testing/dom';
import type { IDownloadSpy } from '../../../../testing/dom';
import { InMemoryDraftStore } from '../../../../testing/fakeServices';
import { enterAnswer, IDEA_JOURNEY, journeyAnswers, playJourney } from '../../../../testing/journeys';
import { firstStepOf, ISO_TIMESTAMP, renderWorkflowPage } from '../../../../testing/workflowHarness';
import type { IWorkflowHarness, IWorkflowPageOptions } from '../../../../testing/workflowHarness';
import { createBranding } from '../../branding/branding';
import { createWorkflowCatalog } from '../../content/workflows/catalog';
import { buildIdeaSummaryDraft, IDEA_SUMMARY_FIELDS, ideaReviewIndicators, ideaWhatHappensNext } from '../../summaries/ideaSummary';
import type { IIdeaSummaryDraft } from '../../summaries/ideaSummary';
import type { IAnswers, IWorkflowDefinition } from '../../workflows/types';
import { IdeaWorkflow } from './IdeaWorkflow';
import type { IWorkflowProps } from './shared';

const idea: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).idea;
const answers: IAnswers = journeyAnswers(IDEA_JOURNEY);
const draft: IIdeaSummaryDraft = buildIdeaSummaryDraft(idea, answers);

function renderIdea(options: IWorkflowPageOptions = {}): IWorkflowHarness {
  return renderWorkflowPage((props: IWorkflowProps): React.ReactElement => <IdeaWorkflow {...props} />, options);
}

async function reachSummary(options: IWorkflowPageOptions = {}): Promise<IWorkflowHarness> {
  const harness: IWorkflowHarness = renderIdea(options);
  await firstStepOf(idea);
  playJourney(IDEA_JOURNEY, idea);
  expect(screen.getByRole('heading', { name: 'Here is a draft summary' })).toBeInTheDocument();
  return harness;
}

describe('IdeaWorkflow', () => {
  it('drafts an editable summary from the answers and submits the confirmed version', async () => {
    const downloads: IDownloadSpy = spyOnDownloads();
    try {
      const { governance, draftStore, onDraftsChanged } = await reachSummary();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Progress: Review your draft summary');
      expect(screen.getByText('This draft was written with AI assistance, based on your answers. Please check it and make any changes before continuing.')).toBeInTheDocument();
      for (const field of IDEA_SUMMARY_FIELDS) {
        const input: HTMLElement = screen.getByLabelText(field.label);
        expect(input).toHaveValue(draft[field.key]);
        expect(input.tagName).toBe(field.multiline ? 'TEXTAREA' : 'INPUT');
      }
      const indicators: string[] = ideaReviewIndicators(answers);
      if (indicators.length === 0) {
        expect(screen.getByText("We didn't find any review indicators based on your answers.")).toBeInTheDocument();
      } else {
        for (const indicator of indicators) {
          expect(screen.getByText(indicator)).toBeInTheDocument();
        }
      }
      expect(screen.getByText(ideaWhatHappensNext(idea, answers))).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Suggested use-case title'), { target: { value: 'Edited title' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm this reflects my idea' }));
      expect(screen.getByRole('status')).toHaveTextContent('Putting your summary together…');
      await screen.findByRole('heading', { name: 'Thanks for sharing your idea.' });
      expect(screen.getByText('Submission received: OVT-AICOE-20260911-TESTTEST')).toBeInTheDocument();
      expect(governance.submissions).toHaveLength(1);
      expect(governance.submissions[0].workflowType).toBe('idea');
      expect(governance.submissions[0].payload).toEqual({
        submissionId: expect.stringMatching(/^idea-/),
        createdAt: expect.stringMatching(ISO_TIMESTAMP),
        workflowId: 'idea',
        workflowVersion: '2.1',
        originalAnswers: answers,
        confirmedSummary: { ...draft, title: 'Edited title' },
        reviewIndicators: indicators,
        status: 'confirmed'
      });
      expect(draftStore.keys()).toEqual([]);
      expect(onDraftsChanged).toHaveBeenCalledWith('idea', false);

      fireEvent.click(screen.getByRole('button', { name: 'Download summary' }));
      expect(downloads.names).toEqual(['overture-ai-coe-idea-summary.txt']);
      expect(await downloads.text(0)).toContain('Edited title');
    } finally {
      downloads.restore();
    }
  });

  it('lets the visitor revisit answers and regenerate the draft', async () => {
    await reachSummary();
    fireEvent.click(screen.getByRole('button', { name: 'View or edit my original answers' }));
    const list: HTMLElement = screen.getByRole('button', { name: 'Hide my original answers' }).nextElementSibling as HTMLElement;
    expect(within(list).getAllByRole('button', { name: 'Edit' })).toHaveLength(IDEA_JOURNEY.answers.length);
    expect(within(list).getByText('Summarising weekly status reports for leadership.')).toBeInTheDocument();

    fireEvent.click(within(list).getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByRole('heading', { level: 2, name: idea.steps[0].title })).toBeInTheDocument();
    expect(screen.queryByText('A few quick questions. You can save your progress and come back any time.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Here is a draft summary' })).toBeInTheDocument();
    expect(screen.queryByText(/Your answers have changed/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View or edit my original answers' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    enterAnswer(idea.steps[0], 'A brand new description of the work');
    fireEvent.click(screen.getByRole('button', { name: 'Save & return to summary' }));
    expect(screen.getByText('Your answers have changed since this draft was written. You may want to regenerate the summary.')).toBeInTheDocument();
    expect(screen.getByLabelText('Suggested use-case title')).toHaveValue(draft.title);

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate summary' }));
    expect(screen.queryByText(/Your answers have changed/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Suggested use-case title')).toHaveValue(
      buildIdeaSummaryDraft(idea, { ...answers, workToImprove: 'A brand new description of the work' }).title
    );
  });

  it('saves the summary draft and resumes onto it', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    const first: IWorkflowHarness = await reachSummary({ draftStore });
    fireEvent.change(screen.getByLabelText('Suggested use-case title'), { target: { value: 'Edited title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved on this device.');
    expect(JSON.parse(draftStore.drafts.idea)).toEqual({
      answers,
      currentStepId: 'anythingElse',
      phase: 'summary',
      summaryDraft: { ...draft, title: 'Edited title' },
      summarySourceSnapshot: JSON.stringify(answers)
    });
    expect(first.onDraftsChanged).toHaveBeenCalledWith('idea', true);
    first.unmount();

    renderIdea({ draftStore, resumeDraft: true });
    await screen.findByText('Picking up where you left off.');
    expect(screen.getByRole('heading', { name: 'Here is a draft summary' })).toBeInTheDocument();
    expect(screen.getByLabelText('Suggested use-case title')).toHaveValue('Edited title');
  });

  it('starts over from the summary page', async () => {
    const { draftStore, onDraftsChanged } = await reachSummary();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Start over' }));
    await firstStepOf(idea);
    expect(screen.getByText('A few quick questions. You can save your progress and come back any time.')).toBeInTheDocument();
    expect(draftStore.keys()).toEqual([]);
    expect(onDraftsChanged).toHaveBeenLastCalledWith('idea', false);
  });
});

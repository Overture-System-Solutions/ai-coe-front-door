import { fireEvent, screen } from '@testing-library/react';
import * as React from 'react';
import { spyOnDownloads } from '../../../../testing/dom';
import type { IDownloadSpy } from '../../../../testing/dom';
import { InMemoryDraftStore } from '../../../../testing/fakeServices';
import { enterAnswer, FEEDBACK_JOURNEY, journeyAnswers, playJourney } from '../../../../testing/journeys';
import { firstStepOf, ISO_TIMESTAMP, renderWorkflowPage } from '../../../../testing/workflowHarness';
import type { IWorkflowHarness, IWorkflowPageOptions } from '../../../../testing/workflowHarness';
import { createBranding } from '../../branding/branding';
import { createWorkflowCatalog } from '../../content/workflows/catalog';
import { buildFeedbackRecord, feedbackWhatHappensNext } from '../../summaries/feedbackSummary';
import type { IAnswers, IWorkflowDefinition } from '../../workflows/types';
import { FeedbackWorkflow } from './FeedbackWorkflow';
import type { IWorkflowProps } from './shared';

const feedback: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).feedback;
const answers: IAnswers = journeyAnswers(FEEDBACK_JOURNEY);
const NOTICE: string = 'This feedback is connected to your organization account and should not be considered anonymous.';

function renderFeedback(options: IWorkflowPageOptions = {}): IWorkflowHarness {
  return renderWorkflowPage((props: IWorkflowProps): React.ReactElement => <FeedbackWorkflow {...props} />, options);
}

async function reachReview(options: IWorkflowPageOptions = {}): Promise<IWorkflowHarness> {
  const harness: IWorkflowHarness = renderFeedback(options);
  await firstStepOf(feedback);
  playJourney(FEEDBACK_JOURNEY, feedback);
  expect(screen.getByRole('heading', { name: 'Check your feedback' })).toBeInTheDocument();
  return harness;
}

describe('FeedbackWorkflow', () => {
  it('reviews the answers and submits the feedback record', async () => {
    const downloads: IDownloadSpy = spyOnDownloads();
    try {
      const harness: IWorkflowHarness = renderFeedback();
      await firstStepOf(feedback);
      expect(screen.getByText(NOTICE)).toBeInTheDocument();
      playJourney(FEEDBACK_JOURNEY, feedback);

      expect(screen.getByRole('heading', { name: 'Check your feedback' })).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Progress: Review your answers');
      expect(screen.getAllByText(NOTICE)).toHaveLength(1);
      expect(screen.getByText('Take a look below. You can change anything before you confirm.')).toBeInTheDocument();
      expect(screen.getByText('Clear guidance.')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(FEEDBACK_JOURNEY.answers.length);
      expect(screen.getByText(feedbackWhatHappensNext(answers))).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[3]);
      expect(screen.getByRole('button', { name: 'Save & return to review' })).toBeInTheDocument();
      enterAnswer(feedback.steps[3], 'Really clear guidance.');
      fireEvent.click(screen.getByRole('button', { name: 'Save & return to review' }));
      expect(screen.getByText('Really clear guidance.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Confirm my feedback' }));
      expect(screen.getByRole('status')).toHaveTextContent('Putting your feedback together…');
      await screen.findByRole('heading', { name: 'Thank you for your feedback.' });
      expect(screen.getByText(feedbackWhatHappensNext(answers))).toBeInTheDocument();
      expect(harness.governance.submissions).toHaveLength(1);
      expect(harness.governance.submissions[0].workflowType).toBe('feedback');
      expect(harness.governance.submissions[0].payload).toEqual({
        ...buildFeedbackRecord(feedback, { ...answers, positiveFeedback: 'Really clear guidance.' }, []),
        recordId: expect.stringMatching(/^feedback-/),
        createdAt: expect.stringMatching(ISO_TIMESTAMP)
      });
      expect(harness.draftStore.keys()).toEqual([]);
      expect(harness.onDraftsChanged).toHaveBeenCalledWith('feedback', false);
      fireEvent.click(screen.getByRole('button', { name: 'Download summary' }));
      expect(downloads.names).toEqual(['overture-ai-coe-feedback.txt']);
      expect(await downloads.text(0)).toContain('Really clear guidance.');
    } finally {
      downloads.restore();
    }
  });

  it('saves a review-stage draft and resumes onto the review page', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    const first: IWorkflowHarness = await reachReview({ draftStore });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved on this device.');
    expect(JSON.parse(draftStore.drafts.feedback)).toEqual({ answers, currentStepId: 'contactEmail', phase: 'review', themes: [] });
    expect(first.onDraftsChanged).toHaveBeenCalledWith('feedback', true);
    first.unmount();

    renderFeedback({ draftStore, resumeDraft: true });
    await screen.findByText('Picking up where you left off.');
    expect(screen.getByRole('heading', { name: 'Check your feedback' })).toBeInTheDocument();
  });

  it('goes back from the review page to the last question', async () => {
    const { onExit } = await reachReview();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Check your feedback' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

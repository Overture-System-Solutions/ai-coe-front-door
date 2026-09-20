import { fireEvent, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { spyOnDownloads } from '../../../../testing/dom';
import type { IDownloadSpy } from '../../../../testing/dom';
import { InMemoryDraftStore } from '../../../../testing/fakeServices';
import { enterAnswer, journeyAnswers, playJourney, TEAM_USAGE_JOURNEY } from '../../../../testing/journeys';
import { firstStepOf, ISO_TIMESTAMP, renderWorkflowPage } from '../../../../testing/workflowHarness';
import type { IWorkflowHarness, IWorkflowPageOptions } from '../../../../testing/workflowHarness';
import { createBranding } from '../../branding/branding';
import type { IBranding } from '../../branding/branding';
import { createWorkflowCatalog } from '../../content/workflows/catalog';
import type { ISubmissionResult } from '../../services/types';
import { buildTeamUsageSummaryDraft, TEAM_USAGE_SUMMARY_FIELDS, teamUsageReviewIndicators, teamUsageWhatHappensNext } from '../../summaries/teamUsageSummary';
import type { ITeamUsageSummaryDraft } from '../../summaries/teamUsageSummary';
import type { IAnswers, IWorkflowDefinition } from '../../workflows/types';
import type { IWorkflowProps } from './shared';
import { TeamUsageWorkflow } from './TeamUsageWorkflow';

const branding: IBranding = createBranding('Overture');
const teamUsage: IWorkflowDefinition = createWorkflowCatalog(branding).teamUsage;
const answers: IAnswers = journeyAnswers(TEAM_USAGE_JOURNEY);
const draft: ITeamUsageSummaryDraft = buildTeamUsageSummaryDraft(teamUsage, answers);

function renderTeamUsage(options: IWorkflowPageOptions = {}): IWorkflowHarness {
  return renderWorkflowPage((props: IWorkflowProps): React.ReactElement => <TeamUsageWorkflow {...props} />, options);
}

async function reachSummary(options: IWorkflowPageOptions = {}): Promise<IWorkflowHarness> {
  const harness: IWorkflowHarness = renderTeamUsage(options);
  await firstStepOf(teamUsage);
  playJourney(TEAM_USAGE_JOURNEY, teamUsage);
  expect(screen.getByRole('heading', { name: "Here's a summary of what you shared" })).toBeInTheDocument();
  return harness;
}

describe('TeamUsageWorkflow', () => {
  it('introduces the disclosure, summarises the answers and submits the confirmed summary', async () => {
    const downloads: IDownloadSpy = spyOnDownloads();
    try {
      const harness: IWorkflowHarness = renderTeamUsage();
      await firstStepOf(teamUsage);
      expect(screen.getByText('AI tools are already helping people with many kinds of work. Telling the AI CoE what is being used helps Overture provide better guidance, tools, and support.')).toBeInTheDocument();
      expect(screen.queryByText('A few quick questions. You can save your progress and come back any time.')).not.toBeInTheDocument();
      playJourney(TEAM_USAGE_JOURNEY, teamUsage);

      expect(screen.getByRole('heading', { name: "Here's a summary of what you shared" })).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Progress: Review your summary');
      expect(screen.getByText('This is here to help, not to judge. You can edit anything below before confirming.')).toBeInTheDocument();
      for (const field of TEAM_USAGE_SUMMARY_FIELDS) {
        expect(screen.getByLabelText(field.label)).toHaveValue(draft[field.key]);
      }
      const indicators: string[] = teamUsageReviewIndicators(answers);
      if (indicators.length === 0) {
        expect(screen.getByText("We didn't find any review indicators based on your answers.")).toBeInTheDocument();
      } else {
        for (const indicator of indicators) {
          expect(screen.getByText(indicator)).toBeInTheDocument();
        }
        expect(screen.getByText("These just help the AI CoE know where to focus support — they aren't a judgment about how the tool is being used.")).toBeInTheDocument();
      }
      expect(screen.getByText(teamUsageWhatHappensNext(answers, branding))).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Tool and team'), { target: { value: 'Edited headline' } });
      fireEvent.click(screen.getByRole('button', { name: "Confirm this reflects what's happening" }));
      expect(screen.getByRole('status')).toHaveTextContent('Putting your summary together…');
      await screen.findByRole('heading', { name: 'Thank you for helping us understand real AI use at Overture.' });
      expect(harness.governance.submissions).toHaveLength(1);
      expect(harness.governance.submissions[0].workflowType).toBe('teamUsage');
      expect(harness.governance.submissions[0].payload).toEqual({
        recordId: expect.stringMatching(/^disclosure-/),
        createdAt: expect.stringMatching(ISO_TIMESTAMP),
        workflowId: 'teamUsage',
        workflowVersion: teamUsage.workflowVersion,
        originalAnswers: answers,
        confirmedSummary: { ...draft, headline: 'Edited headline' },
        reviewIndicators: indicators,
        requestedFollowUp: 'guidance',
        status: 'confirmed'
      });
      expect(harness.draftStore.keys()).toEqual([]);
      expect(harness.onDraftsChanged).toHaveBeenCalledWith('teamUsage', false);
      fireEvent.click(screen.getByRole('button', { name: 'Download summary' }));
      expect(downloads.names).toEqual(['overture-ai-coe-ai-use-disclosure.txt']);
      expect(await downloads.text(0)).toContain('Edited headline');
    } finally {
      downloads.restore();
    }
  });

  it('keeps the summary as a draft after a failed submission in a page view and clears it after a saved retry', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    const harness: IWorkflowHarness = await reachSummary({ draftStore, pageView: true });
    expect(screen.getByText('Draft only').closest('.ai-pill')).not.toBeNull();
    const saved: ISubmissionResult = harness.governance.result;
    harness.governance.result = {
      connected: false,
      state: 'failed',
      intakeId: 'OVT-AICOE-20260911-RETRYME3',
      message: 'SharePoint could not create the AI CoE record. AI CoE Pilot Intakes returned 503: boom',
      failureClass: 'TRANSIENT',
      userMessage: 'Not available right now; try again.'
    };
    fireEvent.change(screen.getByLabelText('Tool and team'), { target: { value: 'Edited headline' } });
    fireEvent.click(screen.getByRole('button', { name: "Confirm this reflects what's happening" }));
    const notice: HTMLElement = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Not available right now; try again');
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    await waitFor((): void => expect(draftStore.keys()).toEqual(['teamUsage']));
    expect(JSON.parse(draftStore.drafts.teamUsage)).toMatchObject({ answers, phase: 'summary', summaryDraft: { ...draft, headline: 'Edited headline' } });
    expect(harness.onDraftsChanged).not.toHaveBeenCalledWith('teamUsage', false);

    harness.governance.result = saved;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Saved and confirmed');
    expect(harness.governance.submissions).toHaveLength(2);
    expect(harness.governance.submissions[1].intakeId).toBe('OVT-AICOE-20260911-RETRYME3');
    expect(harness.governance.submissions[1].payload).toEqual(harness.governance.submissions[0].payload);
    expect(draftStore.keys()).toEqual([]);
    expect(harness.onDraftsChanged).toHaveBeenCalledWith('teamUsage', false);
  });

  it('flags changed answers and resets the summary on request', async () => {
    await reachSummary();
    fireEvent.click(screen.getByRole('button', { name: 'View or edit my original answers' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByRole('button', { name: 'Save & return to summary' })).toBeInTheDocument();
    enterAnswer(teamUsage.steps[0], 'Claude');
    fireEvent.click(screen.getByRole('button', { name: 'Save & return to summary' }));
    expect(screen.getByText('Your answers have changed since this summary was written. You may want to reset the summary to match.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tool and team')).toHaveValue(draft.headline);
    fireEvent.click(screen.getByRole('button', { name: 'Reset summary to my answers' }));
    expect(screen.queryByText(/Your answers have changed/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tool and team')).toHaveValue(buildTeamUsageSummaryDraft(teamUsage, { ...answers, toolName: 'Claude' }).headline);
  });

  it('uses neutral wording without an organization name', async () => {
    renderTeamUsage({ organizationName: '' });
    await firstStepOf(teamUsage);
    expect(screen.getByText('AI tools are already helping people with many kinds of work. Telling the AI CoE what is being used helps the organization provide better guidance, tools, and support.')).toBeInTheDocument();
    playJourney(TEAM_USAGE_JOURNEY, teamUsage);
    fireEvent.click(screen.getByRole('button', { name: "Confirm this reflects what's happening" }));
    await screen.findByRole('heading', { name: 'Thank you for helping us understand real AI use at the organization.' });
  });

  it('saves the summary draft and resumes onto it', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    const first: IWorkflowHarness = await reachSummary({ draftStore });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved on this device.');
    expect(JSON.parse(draftStore.drafts.teamUsage)).toEqual({
      answers,
      currentStepId: 'followUpPreference',
      phase: 'summary',
      summaryDraft: draft,
      summarySourceSnapshot: JSON.stringify(answers)
    });
    first.unmount();
    renderTeamUsage({ draftStore, resumeDraft: true });
    await screen.findByText('Picking up where you left off.');
    expect(screen.getByRole('heading', { name: "Here's a summary of what you shared" })).toBeInTheDocument();
  });
});

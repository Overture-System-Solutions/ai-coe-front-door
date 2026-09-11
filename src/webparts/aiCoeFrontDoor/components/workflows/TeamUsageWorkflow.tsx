import * as React from 'react';
import type { IBranding } from '../../branding/branding';
import { NoticeBanner } from '../../controls/NoticeBanner';
import { Info } from '../../icons';
import { createRecordId } from '../../services/recordId';
import {
  buildTeamUsageExportText,
  buildTeamUsageSummaryDraft,
  TEAM_USAGE_SUMMARY_FIELDS,
  teamUsageReviewIndicators,
  teamUsageWhatHappensNext
} from '../../summaries/teamUsageSummary';
import type { ITeamUsageSummaryDraft, TeamUsageSummaryKey } from '../../summaries/teamUsageSummary';
import type { ISummarySession } from '../../workflows/summarySession';
import type { IAnswers, IWorkflowDefinition } from '../../workflows/types';
import type { IWorkflowProps } from './shared';
import { SummaryWorkflow } from './SummaryWorkflow';
import type { ISummaryWorkflowConfig } from './SummaryWorkflow';

/** The AI-use disclosure as written to SharePoint. */
export interface ITeamUsageSubmission {
  recordId: string;
  createdAt: string;
  workflowId: string;
  workflowVersion: string | undefined;
  originalAnswers: IAnswers;
  confirmedSummary: ITeamUsageSummaryDraft | undefined;
  reviewIndicators: string[];
  requestedFollowUp: string;
  status: 'confirmed';
}

export const TEAM_USAGE_WORKFLOW_CONFIG: ISummaryWorkflowConfig<TeamUsageSummaryKey> = {
  workflowId: 'teamUsage',
  fields: TEAM_USAGE_SUMMARY_FIELDS,
  copy: {
    heading: "Here's a summary of what you shared",
    intro: 'This is here to help, not to judge. You can edit anything below before confirming.',
    indicatorsNote: "These just help the AI CoE know where to focus support — they aren't a judgment about how the tool is being used.",
    rebuildLabel: 'Reset summary to my answers',
    changedHint: 'Your answers have changed since this summary was written. You may want to reset the summary to match.',
    confirmLabel: "Confirm this reflects what's happening",
    fieldIdPrefix: 'disclosure'
  },
  lastStepLabel: 'See my summary',
  completeLabel: 'Review your summary',
  downloadFilename: 'overture-ai-coe-ai-use-disclosure.txt',
  intro: (branding: IBranding): React.ReactElement => (
    <div className="mb-5">
      <NoticeBanner icon={Info}>
        {`AI tools are already helping people with many kinds of work. Telling the AI CoE what is being used helps ${branding.organizationLabel} provide better guidance, tools, and support.`}
      </NoticeBanner>
    </div>
  ),
  buildDraft: buildTeamUsageSummaryDraft,
  indicators: teamUsageReviewIndicators,
  whatHappensNext: (_definition: IWorkflowDefinition, answers: IAnswers, branding: IBranding): string => teamUsageWhatHappensNext(answers, branding),
  exportText: (definition: IWorkflowDefinition, session: ISummarySession<ITeamUsageSummaryDraft>, branding: IBranding): string =>
    buildTeamUsageExportText(definition, { answers: session.answers, summaryDraft: session.summaryDraft }, branding),
  buildPayload: (definition: IWorkflowDefinition, session: ISummarySession<ITeamUsageSummaryDraft>, indicators: string[]): ITeamUsageSubmission => ({
    recordId: createRecordId('disclosure'),
    createdAt: new Date().toISOString(),
    workflowId: definition.id,
    workflowVersion: definition.workflowVersion,
    originalAnswers: session.answers,
    confirmedSummary: session.summaryDraft,
    reviewIndicators: indicators,
    requestedFollowUp: typeof session.answers.followUpPreference === 'string' && session.answers.followUpPreference ? session.answers.followUpPreference : 'none',
    status: 'confirmed'
  }),
  resultIntro: (_definition: IWorkflowDefinition, branding: IBranding): string =>
    `Thank you for helping us understand real AI use at ${branding.organizationLabel}.`
};

export function TeamUsageWorkflow(props: IWorkflowProps): React.ReactElement {
  return <SummaryWorkflow<TeamUsageSummaryKey> config={TEAM_USAGE_WORKFLOW_CONFIG} {...props} />;
}

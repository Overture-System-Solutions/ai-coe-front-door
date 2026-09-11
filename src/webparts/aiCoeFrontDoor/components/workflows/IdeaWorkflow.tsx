import * as React from 'react';
import type { IBranding } from '../../branding/branding';
import { createRecordId } from '../../services/recordId';
import { buildIdeaExportText, buildIdeaSummaryDraft, IDEA_SUMMARY_FIELDS, ideaReviewIndicators, ideaWhatHappensNext } from '../../summaries/ideaSummary';
import type { IdeaSummaryKey, IIdeaSummaryDraft } from '../../summaries/ideaSummary';
import type { ISummarySession } from '../../workflows/summarySession';
import type { IWorkflowDefinition } from '../../workflows/types';
import { IntroParagraph } from './shared';
import type { IWorkflowProps } from './shared';
import { SummaryWorkflow } from './SummaryWorkflow';
import type { ISummaryWorkflowConfig } from './SummaryWorkflow';

/** The idea submission as written to SharePoint. */
export interface IIdeaSubmission {
  submissionId: string;
  createdAt: string;
  workflowId: string;
  workflowVersion: string | undefined;
  originalAnswers: ISummarySession<IIdeaSummaryDraft>['answers'];
  confirmedSummary: IIdeaSummaryDraft | undefined;
  reviewIndicators: string[];
  status: 'confirmed';
}

export const IDEA_WORKFLOW_CONFIG: ISummaryWorkflowConfig<IdeaSummaryKey> = {
  workflowId: 'idea',
  fields: IDEA_SUMMARY_FIELDS,
  copy: {
    heading: 'Here is a draft summary',
    intro: 'This draft was written with AI assistance, based on your answers. Please check it and make any changes before continuing.',
    rebuildLabel: 'Regenerate summary',
    changedHint: 'Your answers have changed since this draft was written. You may want to regenerate the summary.',
    confirmLabel: 'Confirm this reflects my idea',
    fieldIdPrefix: 'summary'
  },
  lastStepLabel: 'Create my summary',
  completeLabel: 'Review your draft summary',
  downloadFilename: 'overture-ai-coe-idea-summary.txt',
  intro: (): React.ReactElement => <IntroParagraph />,
  buildDraft: buildIdeaSummaryDraft,
  indicators: ideaReviewIndicators,
  whatHappensNext: (definition: IWorkflowDefinition, answers: ISummarySession<IIdeaSummaryDraft>['answers']): string => ideaWhatHappensNext(definition, answers),
  exportText: (definition: IWorkflowDefinition, session: ISummarySession<IIdeaSummaryDraft>, branding: IBranding): string =>
    buildIdeaExportText(definition, { answers: session.answers, summaryDraft: session.summaryDraft }, branding),
  buildPayload: (definition: IWorkflowDefinition, session: ISummarySession<IIdeaSummaryDraft>, indicators: string[]): IIdeaSubmission => ({
    submissionId: createRecordId('idea'),
    createdAt: new Date().toISOString(),
    workflowId: definition.id,
    workflowVersion: definition.workflowVersion,
    originalAnswers: session.answers,
    confirmedSummary: session.summaryDraft,
    reviewIndicators: indicators,
    status: 'confirmed'
  }),
  resultIntro: (definition: IWorkflowDefinition): string => definition.resultIntro ?? ''
};

export function IdeaWorkflow(props: IWorkflowProps): React.ReactElement {
  return <SummaryWorkflow<IdeaSummaryKey> config={IDEA_WORKFLOW_CONFIG} {...props} />;
}

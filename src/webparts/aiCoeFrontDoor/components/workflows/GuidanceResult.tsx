import * as React from 'react';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { useSubmission } from '../../context/SubmissionContext';
import { AnswerList } from '../../controls/AnswerList';
import { NoticeBanner } from '../../controls/NoticeBanner';
import { SummaryActions, SummaryText } from '../../controls/SummaryActions';
import { Info, RotateCcw } from '../../icons';
import { indexSteps } from '../../services/toolPolicyEvaluator';
import type { IPolicyDecision } from '../../services/toolPolicyEvaluator';
import type { ISubmissionResult } from '../../services/types';
import { buildGuidanceExportText } from '../../summaries/guidanceExport';
import type { IAnswers, IStep, IWorkflowDefinition } from '../../workflows/types';

export interface IGuidanceResultProps {
  workflow: IWorkflowDefinition;
  answers: IAnswers;
  decision: IPolicyDecision;
  onEditAnswer: (stepId: string) => void;
  onStartOver: () => void;
  onDone: () => void;
  onRequestReview: () => void;
}

function SectionHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <h3 className="text-sm font-semibold" style={{ color: 'var(--color-ink-muted)' }}>
      {children}
    </h3>
  );
}

function BulletList({ items }: { items: string[] }): React.ReactElement {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base">
      {items.map(
        (item: string, index: number): React.ReactElement => (
          <li key={index}>{item}</li>
        )
      )}
    </ul>
  );
}

/** The routing outcome of the tool check, with the export, copy/download and the review-request call to action. */
export function GuidanceResult({ workflow, answers, decision, onEditAnswer, onStartOver, onDone, onRequestReview }: IGuidanceResultProps): React.ReactElement {
  const { branding } = useFrontDoor();
  const lastResult: ISubmissionResult | undefined = useSubmission().lastResult;
  const summaryText: string = React.useMemo((): string => buildGuidanceExportText(workflow, answers, decision, branding), [workflow, answers, decision, branding]);
  const contributingSteps: IStep[] = React.useMemo((): IStep[] => {
    const index: { [stepId: string]: IStep } = indexSteps(workflow);
    return decision.contributingStepIds.map((stepId: string): IStep | undefined => index[stepId]).filter((step): step is IStep => step !== undefined);
  }, [workflow, decision]);
  const reviewRecommended: boolean = decision.outcomeKey === 'reviewNeeded' || decision.outcomeKey === 'gap';

  return (
    <div className="space-y-6">
      <div>
        <span className="overture-badge inline-block rounded-full px-3 py-1 text-xs font-medium">Guidance prototype</span>
        <h2 className="mt-3 text-xl font-semibold leading-snug">{decision.label}</h2>
      </div>
      <NoticeBanner icon={Info}>
        This is routing guidance, not an approval decision. A person can still confirm anything you see here — that&apos;s what a CoE review request is
        for.
      </NoticeBanner>
      <div>
        <SectionHeading>Why you&apos;re seeing this</SectionHeading>
        <BulletList items={decision.reasons} />
      </div>
      <div>
        <SectionHeading>Next steps</SectionHeading>
        <BulletList items={decision.nextSteps} />
      </div>
      <div>
        <SectionHeading>Answers that shaped this result</SectionHeading>
        <AnswerList steps={contributingSteps} answers={answers} onEdit={onEditAnswer} className="mt-3 space-y-3" />
      </div>
      <NoticeBanner icon={Info}>
        {lastResult?.connected ? (
          <>
            <strong className="block font-semibold">{`Guidance record created: ${lastResult.intakeId}`}</strong>
            <span>This routing result was recorded for audit. Use the buttons below to copy or download it, or create a governed CoE review request.</span>
          </>
        ) : (
          <span>The guidance record could not be created. Copy or download this guidance and report the issue to the AI CoE administrator.</span>
        )}
      </NoticeBanner>
      <SummaryText text={summaryText} />
      <SummaryActions summaryText={summaryText} downloadFilename="overture-ai-coe-guidance-summary.txt" copyButtonClass="overture-btn-secondary" />
      <div className="pt-4" style={{ borderTop: '1px solid var(--color-line)' }}>
        <button
          type="button"
          onClick={onRequestReview}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold ${reviewRecommended ? 'overture-btn-primary' : 'overture-btn-secondary'}`}
        >
          {reviewRecommended ? 'Create a CoE review request' : 'Want a second opinion? Create a CoE review request'}
        </button>
      </div>
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={onStartOver}
          className="overture-btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-base font-medium"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Start a new one
        </button>
        <button type="button" onClick={onDone} className="overture-btn-ghost inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-base font-medium">
          Back to all topics
        </button>
      </div>
    </div>
  );
}

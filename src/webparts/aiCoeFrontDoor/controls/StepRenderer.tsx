import * as React from 'react';
import { Info } from '../icons';
import { groupFields } from '../workflows/formEngine';
import type { AnswerValue, IAnswers, IFieldStep, IStep } from '../workflows/types';
import { ChoiceGroup } from './ChoiceGroup';
import { NoticeBanner } from './NoticeBanner';
import type { OptionalElement } from './render';
import { TextArea } from './TextArea';
import { TextInput } from './TextInput';

export const SAFETY_NOTICE: string = 'Do not enter patient information or other sensitive personal information.';

export interface IStepRendererProps {
  step: IStep | undefined;
  value: AnswerValue;
  error: string | undefined;
  onAnswer: (value: string | string[]) => void;
  /** Every answer so far, for a grouped step's fields and follow-ups (1.0.0.18). */
  answers?: IAnswers;
  /** Records the answer of one field of a grouped step under its own key (1.0.0.18). */
  onAnswerField?: (stepId: string, value: string | string[]) => void;
}

/** One question inside a grouped step: its own label, help, input and optional note. */
function GroupField({ field, value, onAnswer }: { field: IFieldStep; value: AnswerValue; onAnswer: (value: string | string[]) => void }): React.ReactElement {
  if (field.type === 'notice') {
    return <NoticeBanner icon={Info}>{field.body}</NoticeBanner>;
  }
  return (
    <div className="ai-step-field space-y-3">
      <div>
        <h3 className="ai-step-field-title text-base font-semibold leading-snug">{field.title}</h3>
        {field.help && (
          <p className="mt-1.5 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
            {field.help}
          </p>
        )}
      </div>
      {field.showSafetyNotice && <NoticeBanner icon={Info}>{SAFETY_NOTICE}</NoticeBanner>}
      {(field.type === 'select' || field.type === 'multiselect') && <ChoiceGroup step={field} value={value} onChange={onAnswer} />}
      {field.type === 'text' && <TextInput step={field} value={value} onChange={onAnswer} />}
      {field.type === 'textarea' && <TextArea step={field} value={value} onChange={onAnswer} />}
      {!field.required && (
        <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          This question is optional.
        </p>
      )}
    </div>
  );
}

/** One question: title, help text, the matching input control and any validation message. */
export function StepRenderer({ step, value, error, onAnswer, answers = {}, onAnswerField }: IStepRendererProps): OptionalElement {
  if (step === undefined) {
    return null;
  }
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold leading-snug">{step.title}</h2>
        {step.help && (
          <p className="mt-1.5 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
            {step.help}
          </p>
        )}
      </div>
      {step.type === 'group' ? (
        <div className="ai-step-group space-y-6">
          {groupFields(step, answers).map(
            (field: IFieldStep): React.ReactElement => (
              <GroupField
                key={field.id}
                field={field}
                value={answers[field.id]}
                onAnswer={(fieldValue: string | string[]): void => {
                  if (onAnswerField !== undefined) {
                    onAnswerField(field.id, fieldValue);
                  }
                }}
              />
            )
          )}
        </div>
      ) : step.type === 'notice' ? (
        <NoticeBanner icon={Info}>{step.body}</NoticeBanner>
      ) : (
        <>
          {step.showSafetyNotice && <NoticeBanner icon={Info}>{SAFETY_NOTICE}</NoticeBanner>}
          {(step.type === 'select' || step.type === 'multiselect') && <ChoiceGroup step={step} value={value} onChange={onAnswer} />}
          {step.type === 'text' && <TextInput step={step} value={value} onChange={onAnswer} />}
          {step.type === 'textarea' && <TextArea step={step} value={value} onChange={onAnswer} />}
          {!step.required && (
            <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
              This question is optional.
            </p>
          )}
        </>
      )}
      {error && (
        <p className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-info-text)' }} role="status">
          <Info className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

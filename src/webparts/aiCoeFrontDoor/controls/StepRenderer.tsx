import * as React from 'react';
import { Info } from '../icons';
import type { AnswerValue, IStep } from '../workflows/types';
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
}

/** One question: title, help text, the matching input control and any validation message. */
export function StepRenderer({ step, value, error, onAnswer }: IStepRendererProps): OptionalElement {
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
      {step.type === 'notice' ? (
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

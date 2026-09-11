import * as React from 'react';
import type { AnswerValue, IStep } from '../workflows/types';

export interface ITextControlProps {
  step: IStep;
  value: AnswerValue;
  onChange: (value: string) => void;
}

/** The text of a free-form answer; anything that is not a string renders as empty. */
export function textValue(value: AnswerValue): string {
  return typeof value === 'string' ? value : '';
}

export function TextInput({ step, value, onChange }: ITextControlProps): React.ReactElement {
  return (
    <input
      type="text"
      id={step.id}
      value={textValue(value)}
      onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange(event.target.value)}
      placeholder={step.placeholder ?? ''}
      className="overture-input w-full rounded-xl px-4 py-3 text-base"
    />
  );
}

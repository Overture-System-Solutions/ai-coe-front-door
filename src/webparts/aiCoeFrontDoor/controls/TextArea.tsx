import * as React from 'react';
import { textValue } from './TextInput';
import type { ITextControlProps } from './TextInput';

export function TextArea({ step, value, onChange }: ITextControlProps): React.ReactElement {
  return (
    <textarea
      id={step.id}
      value={textValue(value)}
      onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => onChange(event.target.value)}
      placeholder={step.placeholder ?? ''}
      rows={4}
      className="overture-input w-full rounded-xl px-4 py-3 text-base"
    />
  );
}

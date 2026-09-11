import * as React from 'react';
import { Check } from '../icons';
import { asStringArray, includes } from '../utils/collections';
import type { AnswerValue, IChoiceStep, IStepOption } from '../workflows/types';

export interface IChoiceGroupProps {
  step: IChoiceStep;
  value: AnswerValue;
  onChange: (value: string | string[]) => void;
}

/** Next multiselect value after toggling `optionValue`; exclusive options clear the others. */
export function toggleSelection(step: IChoiceStep, selected: readonly string[], optionValue: string): string[] {
  if (includes(selected, optionValue)) {
    return selected.filter((item: string): boolean => item !== optionValue);
  }
  const option: IStepOption | undefined = step.options.filter((candidate: IStepOption): boolean => candidate.value === optionValue)[0];
  if (option?.exclusive) {
    return [optionValue];
  }
  const exclusiveValues: string[] = step.options
    .filter((candidate: IStepOption): boolean => candidate.exclusive === true)
    .map((candidate: IStepOption): string => candidate.value);
  return selected.filter((item: string): boolean => !includes(exclusiveValues, item)).concat([optionValue]);
}

/** Single- or multi-select answer rendered as pressable option cards. */
export function ChoiceGroup({ step, value, onChange }: IChoiceGroupProps): React.ReactElement {
  const multiple: boolean = step.type === 'multiselect';
  const selected: string[] = asStringArray(value);

  const select = (optionValue: string): void => {
    if (multiple) {
      onChange(toggleSelection(step, selected, optionValue));
    } else {
      onChange(optionValue);
    }
  };

  return (
    <div role="group" aria-label={step.title} className="grid gap-3">
      {step.options.map((option: IStepOption): React.ReactElement => {
        const pressed: boolean = multiple ? includes(selected, option.value) : value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={(): void => select(option.value)}
            className="overture-choice w-full rounded-xl px-5 py-4 text-left text-base font-medium"
          >
            <span className="flex items-center justify-between gap-3">
              <span>{option.label}</span>
              {pressed && <Check className="h-5 w-5 flex-shrink-0" color="var(--color-primary)" aria-hidden="true" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

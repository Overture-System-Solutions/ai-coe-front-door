import { includesAny } from '../../utils/collections';
import type { IAnswers } from '../../workflows/types';

/** showIf predicate: the answer to `stepId` equals `expected`. */
export function answerIs(stepId: string, expected: string): (answers: IAnswers) => boolean {
  return (answers: IAnswers): boolean => answers[stepId] === expected;
}

/** showIf predicate: the multiselect answer to `stepId` contains any of `values`. */
export function answerIncludesAny(stepId: string, values: readonly string[]): (answers: IAnswers) => boolean {
  return (answers: IAnswers): boolean => includesAny(answers[stepId], values);
}

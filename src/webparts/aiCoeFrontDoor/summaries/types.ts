/** A labelled field of an editable summary draft. */
export interface ISummaryField<TKey extends string> {
  key: TKey;
  label: string;
  multiline: boolean;
}

/** A review indicator: a label reported when its test matches the answers. */
export interface IReviewIndicator<TAnswers> {
  id: string;
  label: string;
  test: (answers: TAnswers) => boolean;
}

export function matchingIndicators<TAnswers>(indicators: readonly IReviewIndicator<TAnswers>[], answers: TAnswers): string[] {
  return indicators
    .filter((indicator: IReviewIndicator<TAnswers>): boolean => indicator.test(answers))
    .map((indicator: IReviewIndicator<TAnswers>): string => indicator.label);
}

export const NOT_SPECIFIED: string = 'Not specified';
export const NO_INDICATORS: string = 'None noted based on the answers given.';

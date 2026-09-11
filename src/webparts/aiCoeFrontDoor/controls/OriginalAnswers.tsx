import * as React from 'react';
import type { IAnswers, IStep } from '../workflows/types';
import { AnswerList } from './AnswerList';

export interface IOriginalAnswersProps {
  steps: IStep[];
  answers: IAnswers;
  onEdit: (stepId: string) => void;
}

/** Collapsible list of the original answers under a summary draft. */
export function OriginalAnswers({ steps, answers, onEdit }: IOriginalAnswersProps): React.ReactElement {
  const [open, setOpen] = React.useState<boolean>(false);
  return (
    <div>
      <button type="button" onClick={(): void => setOpen((current: boolean): boolean => !current)} className="overture-link rounded-lg text-sm font-medium">
        {open ? 'Hide my original answers' : 'View or edit my original answers'}
      </button>
      {open && <AnswerList steps={steps} answers={answers} onEdit={onEdit} className="mt-3 space-y-3" />}
    </div>
  );
}

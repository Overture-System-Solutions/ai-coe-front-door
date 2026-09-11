/**
 * Pieces every workflow page shares: the draft boot sequence, step lookup, the save-draft notice,
 * the start-over confirmation and the copy that is identical across workflows.
 */
import * as React from 'react';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { ConfirmDialog } from '../../controls/ConfirmDialog';
import { visibleSteps } from '../../workflows/formEngine';
import type { ISessionBase } from '../../workflows/formEngine';
import type { IStep, IWorkflowDefinition, WorkflowId } from '../../workflows/types';

export interface IWorkflowProps {
  /** True when the visitor chose to resume the draft saved on this device. */
  resumeDraft: boolean;
  onExit: () => void;
  /** Reports whether a draft now exists for the workflow, so the landing page can show "Resume draft". */
  onDraftsChanged: (workflowId: WorkflowId, hasDraft: boolean) => void;
}

export const SETTING_UP_TEXT: string = 'Setting things up…';
export const INTRO_TEXT: string = 'A few quick questions. You can save your progress and come back any time.';
export const SUBMITTING_TEXT: string = 'Putting your summary together…';
export const DRAFT_SAVED_TEXT: string = 'Draft saved on this device.';
export const DRAFT_NOT_SAVED_TEXT: string = 'We could not save a draft right now. Your answers are still here for this session.';

/**
 * Loads the saved draft (when resuming) and hands it to `onLoaded` once; returns true until then.
 * A workflow that unmounts before the draft arrives is left alone.
 */
export function useDraftBoot<TDraft>(workflowId: WorkflowId, resumeDraft: boolean, onLoaded: (draft: TDraft | undefined) => void): boolean {
  const { draftStore } = useFrontDoor().services;
  const [loading, setLoading] = React.useState<boolean>(true);
  const latestOnLoaded: React.MutableRefObject<(draft: TDraft | undefined) => void> = React.useRef(onLoaded);

  React.useEffect((): void => {
    latestOnLoaded.current = onLoaded;
  });

  React.useEffect((): (() => void) => {
    let cancelled: boolean = false;
    const pending: Promise<TDraft | undefined> = resumeDraft ? draftStore.load<TDraft>(workflowId) : Promise.resolve(undefined);
    const finish = (draft: TDraft | undefined): void => {
      if (!cancelled) {
        latestOnLoaded.current(draft);
        setLoading(false);
      }
    };
    pending.then(finish, (): void => finish(undefined));
    return (): void => {
      cancelled = true;
    };
  }, [workflowId, resumeDraft, draftStore]);

  return loading;
}

export interface IStepPosition {
  steps: IStep[];
  /** Index of the current step among the visible ones, or -1 when it is not visible. */
  index: number;
  /** The current step, falling back to the first visible one. */
  step: IStep | undefined;
}

export function stepPosition(definition: IWorkflowDefinition, session: ISessionBase<string, string>): IStepPosition {
  const steps: IStep[] = visibleSteps(definition, session.answers);
  let index: number = -1;
  for (let candidate: number = 0; candidate < steps.length; candidate++) {
    if (steps[candidate].id === session.currentStepId) {
      index = candidate;
      break;
    }
  }
  return { steps, index, step: index >= 0 ? steps[index] : steps[0] };
}

/** Saves the draft and returns the notice to show; reports a new draft to the landing page on success. */
export function useSaveDraft(workflowId: WorkflowId, onDraftsChanged: IWorkflowProps['onDraftsChanged']): (draft: unknown) => Promise<string> {
  const { draftStore } = useFrontDoor().services;
  return React.useCallback(
    async (draft: unknown): Promise<string> => {
      const outcome: { ok: boolean } = await draftStore.save(workflowId, draft);
      if (outcome.ok) {
        onDraftsChanged(workflowId, true);
      }
      return outcome.ok ? DRAFT_SAVED_TEXT : DRAFT_NOT_SAVED_TEXT;
    },
    [draftStore, workflowId, onDraftsChanged]
  );
}

/** Clears the stored draft and tells the landing page it is gone (after a submission or a restart). */
export function useClearDraft(workflowId: WorkflowId, onDraftsChanged: IWorkflowProps['onDraftsChanged']): () => Promise<void> {
  const { draftStore } = useFrontDoor().services;
  return React.useCallback(async (): Promise<void> => {
    await draftStore.clear(workflowId);
    onDraftsChanged(workflowId, false);
  }, [draftStore, workflowId, onDraftsChanged]);
}

export interface IStartOverDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function StartOverDialog({ open, onConfirm, onCancel }: IStartOverDialogProps): React.ReactElement {
  return (
    <ConfirmDialog
      open={open}
      title="Start over?"
      body="This will clear your answers for this topic. You can't undo this."
      confirmLabel="Start over"
      cancelLabel="Keep my answers"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export interface IWorkflowCardProps {
  children?: React.ReactNode;
}

/** The rounded card that frames every workflow phase. */
export function WorkflowCard({ children }: IWorkflowCardProps): React.ReactElement {
  return <div className="overture-card rounded-2xl p-6 sm:p-8">{children}</div>;
}

export function IntroParagraph(): React.ReactElement {
  return (
    <p className="mb-5 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
      {INTRO_TEXT}
    </p>
  );
}

/** Border-topped block under summary pages that hosts the secondary actions. */
export function SummaryFooter({ children }: IWorkflowCardProps): React.ReactElement {
  return (
    <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--color-line)' }}>
      {children}
    </div>
  );
}

/** Text shown in an answer list when the visitor skipped a question. */
export function NotAnswered(): React.ReactElement {
  return (
    <span className="italic" style={{ color: 'var(--color-ink-muted)' }}>
      Not answered
    </span>
  );
}

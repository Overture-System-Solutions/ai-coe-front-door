import * as React from 'react';
import type { OptionalElement } from './render';

export interface IConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const TITLE_ID: string = 'overture-confirm-title';

/** Modal confirmation used before discarding answers. Escape, the backdrop and the cancel button all cancel. */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, onConfirm, onCancel }: IConfirmDialogProps): OptionalElement {
  const cancelButton: React.RefObject<HTMLButtonElement> = React.useRef<HTMLButtonElement>(null);

  React.useEffect((): void => {
    if (open) {
      cancelButton.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(30, 42, 46, 0.45)' }} onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        onClick={(event: React.MouseEvent<HTMLDivElement>): void => event.stopPropagation()}
        onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>): void => {
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
        className="overture-card w-full max-w-sm rounded-2xl p-6 shadow-lg"
      >
        <h3 id={TITLE_ID} className="text-lg font-semibold">
          {title}
        </h3>
        <p className="mt-2 text-[15px]" style={{ color: 'var(--color-ink-muted)' }}>
          {body}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button ref={cancelButton} type="button" onClick={onCancel} className="overture-btn-secondary rounded-xl px-4 py-2 text-base font-medium">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="overture-btn-primary rounded-xl px-4 py-2 text-base font-semibold">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

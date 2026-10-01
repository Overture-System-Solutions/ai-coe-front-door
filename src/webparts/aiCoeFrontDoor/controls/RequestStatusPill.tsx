import * as React from 'react';
import { usePageDocument } from '../components/pages/PageDocumentContext';
import { pageIcon } from '../content/pageIcons';
import { requestStatusLook, toPlainRequestStatus } from '../content/truthStates';
import type { IRequestStatusLook } from '../content/truthStates';
import type { LucideIcon } from '../icons';

export interface IRequestStatusPillProps {
  /** The list's status code (a pilot word or a canonical code); anything unknown reads "Status unavailable". */
  status: unknown;
}

/**
 * A request status as its plain wording plus an icon shape in a toned span, drawn like the truth-state
 * pill: the document vocabulary may rename a code, and the operator plane sees the code beside the
 * wording. Not interactive and without a role: it labels the request next to it.
 */
export function RequestStatusPill({ status }: IRequestStatusPillProps): React.ReactElement {
  const { vocabulary, plane } = usePageDocument();
  const look: IRequestStatusLook = requestStatusLook(status);
  const Icon: LucideIcon = pageIcon(look.icon);
  const code: string = typeof status === 'string' ? status.trim() : '';
  return (
    <span className={`ai-pill ai-pill--${look.tone}`}>
      <Icon aria-hidden="true" focusable="false" />
      <span className="ai-pill-label">{toPlainRequestStatus(status, vocabulary)}</span>
      {plane === 'operator' && code !== '' ? <code className="ai-pill-code">{code}</code> : undefined}
    </span>
  );
}

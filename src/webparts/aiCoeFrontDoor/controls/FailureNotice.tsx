import * as React from 'react';
import { findSupportRoute } from '../content/pageContent';
import type { ISupportRouteBlock, ISupportRouteItem, SupportRouteKind } from '../content/pageContent';
import { ShieldAlert } from '../icons';
import { FAILURE_LABELS } from '../services/failureClass';
import type { FailureClass } from '../services/failureClass';
import { usePageDocument } from '../components/pages/PageDocumentContext';
import { NOT_YET_NAMED } from '../components/pages/blocks/SupportRouteBlock';

export interface IFailureNoticeProps {
  failureClass: FailureClass;
  /** The body-free sentence the service attached to the result. */
  userMessage: string;
  /** Sends the same attempt again; offered for a transient failure only. */
  onRetry?: () => void;
}

/** What to do now, per class: the page names the action and the owner, the person decides. */
export const NEXT_ACTIONS: { [failureClass in FailureClass]: string } = {
  PERMISSION: 'Ask the owner named here for access to the AI CoE request list, then confirm your request again.',
  SOURCE: 'Report it to the owner named here: the AI CoE request list was not found on this site.',
  TRANSIENT: 'Try again now. If it fails again, report it to the owner named here with the time and the status shown.',
  IMPLEMENTATION: 'Report it to the owner named here with the time and the status shown; do not change your answers to work around it.',
  INCONCLUSIVE: 'Confirm again with the same reference; nothing is duplicated.'
};

/** When trying again makes sense, per class. */
export const RERUN_CONDITIONS: { [failureClass in FailureClass]: string } = {
  PERMISSION: 'after access is granted',
  SOURCE: 'when the list exists on this site',
  TRANSIENT: 'now',
  IMPLEMENTATION: 'after the AI CoE has looked at it',
  INCONCLUSIVE: 'now, with the same reference'
};

export const DRAFT_KEPT_TEXT: string = 'Your answers are kept as a draft on this device.';
export const TRY_AGAIN_LABEL: string = 'Try again';
export const NEXT_ACTION_KEY: string = 'What to do';
export const OWNER_KEY: string = 'Who owns it';
export const RERUN_KEY: string = 'Try again';

/** A permission failure goes to the identity owner; every other class to the support owner. */
function ownerKindFor(failureClass: FailureClass): SupportRouteKind {
  return failureClass === 'PERMISSION' ? 'identity' : 'support';
}

/** The owner of that kind of issue in the shared support route; undefined when no row is marked with the kind or the owner is blank. */
export function supportOwner(support: ISupportRouteBlock | undefined, kind: SupportRouteKind): string | undefined {
  if (support === undefined) {
    return undefined;
  }
  for (const row of support.routes) {
    const item: ISupportRouteItem = row;
    if (item.kind === kind) {
      return item.owner;
    }
  }
  return undefined;
}

/**
 * What a page view shows when a submission failed: the class of the failure in words, the sentence
 * the service attached (never the response body), what to do, who owns that kind of issue (from the
 * document's shared support route, "not yet named" when blank) and when trying again makes sense.
 * A transient failure offers the retry itself. The facts are a description list, never a data grid.
 */
export function FailureNotice({ failureClass, userMessage, onRetry }: IFailureNoticeProps): React.ReactElement {
  const { shared, plane } = usePageDocument();
  const owner: string = supportOwner(findSupportRoute(shared.footer), ownerKindFor(failureClass)) ?? NOT_YET_NAMED;
  return (
    <div className={`ai-failure ai-failure--${failureClass.toLowerCase()}`} role="alert">
      <div className="ai-failure-head">
        <ShieldAlert className="ai-failure-icon" aria-hidden="true" focusable="false" />
        <strong className="ai-failure-title">{FAILURE_LABELS[failureClass]}</strong>
        {plane === 'operator' && <code className="ai-failure-code">{failureClass}</code>}
      </div>
      <p className="ai-failure-message">{userMessage}</p>
      <dl className="ai-failure-facts">
        <div className="ai-failure-fact">
          <dt>{NEXT_ACTION_KEY}</dt>
          <dd>{NEXT_ACTIONS[failureClass]}</dd>
        </div>
        <div className="ai-failure-fact">
          <dt>{OWNER_KEY}</dt>
          <dd>{owner}</dd>
        </div>
        <div className="ai-failure-fact">
          <dt>{RERUN_KEY}</dt>
          <dd>{RERUN_CONDITIONS[failureClass]}</dd>
        </div>
      </dl>
      <p className="ai-failure-draft">{DRAFT_KEPT_TEXT}</p>
      {failureClass === 'TRANSIENT' && onRetry !== undefined && (
        <button type="button" onClick={onRetry} className="overture-btn-primary ai-failure-retry">
          {TRY_AGAIN_LABEL}
        </button>
      )}
    </div>
  );
}

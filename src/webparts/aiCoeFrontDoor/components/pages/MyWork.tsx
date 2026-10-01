import * as React from 'react';
import { DEFAULT_STATUS_STRIP_EMPTY_TEXT, DEFAULT_STATUS_STRIP_UNAVAILABLE_TEXT } from '../../content/pageContent';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { RequestStatusPill } from '../../controls/RequestStatusPill';
import { StatusPill } from '../../controls/StatusPill';
import type { IMyWorkItem, IRecordLink } from '../../services/myWorkService';
import { useMyWork } from './useMyWork';
import type { MyWorkLoadState } from './useMyWork';

export const MY_WORK_HEADING: string = 'My requests';
export const MY_WORK_LOADING_TEXT: string = 'Reading your requests…';
export const MY_WORK_EMPTY_TEXT: string = DEFAULT_STATUS_STRIP_EMPTY_TEXT;
export const MY_WORK_DENIED_TEXT: string = 'You cannot read the request list on this site.';
export const MY_WORK_UNAVAILABLE_TEXT: string = DEFAULT_STATUS_STRIP_UNAVAILABLE_TEXT;
export const REFERENCE_KEY: string = 'Reference';

/**
 * The link of each card (1.0.0.18), read once the requests have loaded: a request that opened a case links to the
 * case, any other to its own row. Until they arrive, or when they cannot be read, the cards are simply unlinked.
 */
function useRecordLinks(
  read: ((items: readonly IMyWorkItem[]) => Promise<{ [itemId: number]: IRecordLink }>) | undefined,
  state: MyWorkLoadState
): { [itemId: number]: IRecordLink } {
  const [links, setLinks] = React.useState<{ [itemId: number]: IRecordLink }>({});
  const items: readonly IMyWorkItem[] | undefined = state.status !== 'loading' && state.result.state === 'ok' ? state.result.items : undefined;
  React.useEffect((): (() => void) => {
    let cancelled: boolean = false;
    if (read !== undefined && items !== undefined && items.length > 0) {
      read(items).then(
        (found: { [itemId: number]: IRecordLink }): void => {
          if (!cancelled) {
            setLinks(found);
          }
        },
        (): void => undefined
      );
    }
    return (): void => {
      cancelled = true;
    };
    // The items array is stable for a load; reading again on every render would repeat the requests.
  }, [items]);
  return links;
}

/** "Sep 1, 2026" for a parseable timestamp; undefined for anything else, so no date is invented. */
export function formatShortDate(value: string | undefined): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const date: Date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Sent <date>", then " · Updated <date>" when the row changed on a later day; a missing or unreadable sent date says so. */
export function describeDates(item: IMyWorkItem): string {
  const sent: string | undefined = formatShortDate(item.submittedAt);
  const updated: string | undefined = formatShortDate(item.modified);
  let line: string = sent === undefined ? 'Sent: date unavailable' : `Sent ${sent}`;
  if (updated !== undefined && updated !== sent) {
    line += ` · Updated ${updated}`;
  }
  return line;
}

/**
 * The person's own requests, read from the intake list through the my-work service: one row per
 * request with the workflow, the plain status as a pill, the reference for copying and the dates.
 * The list's item-level security decides which rows come back; the piece shows exactly those. When
 * the list refuses the read the row says so with the needs-access pill, and when it cannot be read
 * at all the status is unavailable: never a number the list did not give.
 */
export function MyWork(): React.ReactElement {
  const { services } = useFrontDoor();
  const state: MyWorkLoadState = useMyWork(services.myWork, true);
  const links: { [itemId: number]: IRecordLink } = useRecordLinks(services.myWork?.recordLinks?.bind(services.myWork), state);

  let content: React.ReactNode;
  if (state.status === 'loading') {
    content = <p className="ai-mywork-note">{MY_WORK_LOADING_TEXT}</p>;
  } else if (state.result.state === 'denied') {
    content = (
      <p className="ai-mywork-note">
        <StatusPill state="needsAccess" /> {MY_WORK_DENIED_TEXT}
      </p>
    );
  } else if (state.result.state === 'unavailable') {
    content = <p className="ai-mywork-note">{MY_WORK_UNAVAILABLE_TEXT}</p>;
  } else if (state.result.items.length === 0) {
    content = <p className="ai-mywork-note">{MY_WORK_EMPTY_TEXT}</p>;
  } else {
    content = (
      <div className="ai-page-mywork-list">
        {state.result.items.map(
          (item: IMyWorkItem, index: number): React.ReactElement => (
            <article key={`${item.id}-${index}`} className="ai-mywork-row">
              <p className="ai-mywork-head">
                {links[item.id] === undefined ? (
                  <span className="ai-mywork-label">{item.workflowLabel}</span>
                ) : (
                  <a className="ai-mywork-label ai-mywork-link" href={links[item.id].url} target="_blank" rel="noopener noreferrer">
                    {item.workflowLabel}
                  </a>
                )}
                <RequestStatusPill status={item.status} />
              </p>
              <p className="ai-mywork-reference">
                <span className="ai-mywork-key">{REFERENCE_KEY}</span> <code>{item.reference}</code>
              </p>
              <p className="ai-mywork-dates">{describeDates(item)}</p>
              {links[item.id] !== undefined && (
                <p className="ai-mywork-open">{links[item.id].kind === 'case' ? 'Open the case' : 'Open the request'}</p>
              )}
            </article>
          )
        )}
      </div>
    );
  }

  return (
    <section className="ai-page-mywork" aria-label={MY_WORK_HEADING}>
      <h2 className="ai-page-mywork-title">{MY_WORK_HEADING}</h2>
      {content}
    </section>
  );
}

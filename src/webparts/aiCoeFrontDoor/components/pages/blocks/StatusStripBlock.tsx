import * as React from 'react';
import { resolvePill } from '../../../content/actions';
import type { IPillLook } from '../../../content/actions';
import { resolveContentHref } from '../../../content/pageContent';
import type { IStatusStripBlock, IStatusStripItem, IVocabulary } from '../../../content/pageContent';
import type { IRouteOptions } from '../../../content/routes';
import { toPlainRequestStatus } from '../../../content/truthStates';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { StatusPill } from '../../../controls/StatusPill';
import type { IMyWorkItem } from '../../../services/myWorkService';
import { Freshness } from '../Freshness';
import { anchorProps, Markup } from '../Markup';
import { usePageDocument } from '../PageDocumentContext';
import { useMyWork } from '../useMyWork';
import type { MyWorkLoadState } from '../useMyWork';

export interface IStatusStripBlockProps {
  block: IStatusStripBlock;
}

export const MY_REQUESTS_LOADING_TEXT: string = 'Reading your requests…';
const SEPARATOR: string = ' · ';

/** "2 received · 1 in review": the requests counted by plain status, in order of first appearance, lower-cased; empty for none. */
export function summariseRequests(items: readonly IMyWorkItem[], vocabulary?: IVocabulary): string {
  const order: string[] = [];
  const counts: { [plain: string]: number } = {};
  for (const item of items) {
    const plain: string = toPlainRequestStatus(item.status, vocabulary);
    if (!Object.prototype.hasOwnProperty.call(counts, plain)) {
      order.push(plain);
      counts[plain] = 0;
    }
    counts[plain] += 1;
  }
  return order.map((plain: string): string => `${counts[plain]} ${plain.toLowerCase()}`).join(SEPARATOR);
}

interface IRequestCountProps {
  item: IStatusStripItem;
  block: IStatusStripBlock;
  state: MyWorkLoadState;
}

/** The request count of a `myRequests` item: a link to the item's page when it has one and the list answered; never a number otherwise. */
function RequestCount({ item, block, state }: IRequestCountProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  const { vocabulary } = usePageDocument();
  if (state.status === 'loading') {
    return <span className="ai-page-strip-count">{MY_REQUESTS_LOADING_TEXT}</span>;
  }
  if (state.result.state === 'denied') {
    return (
      <>
        <StatusPill state="needsAccess" /> <span className="ai-page-strip-count">{block.unavailableText}</span>
      </>
    );
  }
  if (state.result.state === 'unavailable') {
    return <span className="ai-page-strip-count">{block.unavailableText}</span>;
  }
  const text: string = state.result.items.length === 0 ? block.emptyText : summariseRequests(state.result.items, vocabulary);
  if (item.href === undefined) {
    return <span className="ai-page-strip-count">{text}</span>;
  }
  // The item's link passes the same href guard as every other block link before it is used.
  return (
    <a className="ai-page-strip-link" {...anchorProps(siteUrl, resolveContentHref(siteUrl, item.href))}>
      {text}
    </a>
  );
}

function hasRequestItem(block: IStatusStripBlock): boolean {
  return block.items.some((item: IStatusStripItem): boolean => item.kind === 'myRequests');
}

/**
 * Short labelled lines side by side on the first screen. A `text` item behaves as a status-row item
 * (label, text, the pill of its state or route, and the freshness line under it when the item says
 * when and where its fact was read); a `myRequests` item counts the person's own requests by plain
 * status, read through the my-work service, and links to the page the item names. The list is asked
 * only when the strip carries a request item.
 */
export function StatusStripBlock({ block }: IStatusStripBlockProps): React.ReactElement {
  const { siteUrl, services } = useFrontDoor();
  const { routes, now, vocabulary, roles } = usePageDocument();
  const options: IRouteOptions = { siteUrl, now, vocabulary, roles };
  const state: MyWorkLoadState = useMyWork(services.myWork, hasRequestItem(block));
  return (
    <div className="ai-page-strip">
      {block.items.map((item: IStatusStripItem, index: number): React.ReactElement => {
        const look: IPillLook | undefined = item.kind === 'text' ? resolvePill(item, routes, options) : undefined;
        return (
          <div key={index} className="ai-page-strip-item">
            <strong>{item.label}</strong>
            {' — '}
            {item.text !== undefined && (
              <>
                <Markup text={item.text} />
                {item.kind === 'myRequests' ? ' ' : undefined}
              </>
            )}
            {item.kind === 'myRequests' && <RequestCount item={item} block={block} state={state} />}
            {look !== undefined && (
              <>
                {' '}
                <StatusPill state={look.pill} label={look.label} />
              </>
            )}
            {item.kind === 'text' && <Freshness asOf={item.asOf} source={item.source} illustrative={item.illustrative} />}
          </div>
        );
      })}
    </div>
  );
}

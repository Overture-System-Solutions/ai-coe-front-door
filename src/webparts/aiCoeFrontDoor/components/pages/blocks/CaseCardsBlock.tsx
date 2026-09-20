import * as React from 'react';
import { formatFactDate, freshness } from '../../../content/freshness';
import type { CaseHealth, ICaseCardItem, ICaseCardsBlock } from '../../../content/pageContent';
import { chromeLabel } from '../../../content/truthStates';
import type { ChromePillKey } from '../../../content/truthStates';
import type { OptionalElement } from '../../../controls/render';
import { RequestStatusPill } from '../../../controls/RequestStatusPill';
import { StatusPill } from '../../../controls/StatusPill';
import { DO_NOT_INFER_TEXT } from '../Freshness';
import { usePageDocument } from '../PageDocumentContext';

export interface ICaseCardsBlockProps {
  block: ICaseCardsBlock;
}

/** The code whose case is still waiting on its source: it draws the awaiting-source pill rather than its plain wording. */
const AWAITING_SOURCE_CODE: string = 'AWAITING_SOURCE';
/** The caption of a stale case that gives none of its own. */
export const STALE_CASE_CAPTION: string = DO_NOT_INFER_TEXT;
const STAGE_PREFIX: string = 'Historical stage: ';
const HEALTH_PREFIX: string = 'Historical health: ';
const SOURCE_PREFIX: string = 'Source: ';
const NEXT_PREFIX: string = 'Next: ';

const HEALTH_LABELS: { [health in CaseHealth]: string } = { green: 'Green', amber: 'Amber', red: 'Red' };

interface ICaseTag {
  text: string;
  health?: CaseHealth;
}

/** The chips under the description: the stage and health the latest source recorded, and the day it was read; none is invented. */
function tagsOf(item: ICaseCardItem): ICaseTag[] {
  const tags: ICaseTag[] = [];
  if (item.historicalStage !== undefined) {
    tags.push({ text: `${STAGE_PREFIX}${item.historicalStage}` });
  }
  if (item.historicalHealth !== undefined) {
    tags.push({ text: `${HEALTH_PREFIX}${HEALTH_LABELS[item.historicalHealth]}`, health: item.historicalHealth });
  }
  const date: string | undefined = formatFactDate(item.sourceDate);
  if (date !== undefined) {
    tags.push({ text: `${SOURCE_PREFIX}${date}` });
  }
  return tags;
}

/**
 * One card per case: the record id as code, the state pill (awaiting source for `AWAITING_SOURCE`,
 * the plain wording of every other code, with the code beside it on the operator plane), the title,
 * the description, the historical stage and health and source date as chips, then the next action
 * and the caption. A source date older than the document's freshness threshold adds the needs-refresh
 * pill and, when the item gives no caption, says not to infer progress; an illustrative case carries
 * the example pill. The clock and the threshold come from the page document context.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export function CaseCardsBlock({ block }: ICaseCardsBlockProps): React.ReactElement {
  const { now, settings, vocabulary, plane } = usePageDocument();
  const chrome = (key: ChromePillKey, code?: string): React.ReactElement => (
    <StatusPill state={key} label={chromeLabel(key, vocabulary)} code={code} showCode={plane === 'operator'} />
  );
  const renderCard = (item: ICaseCardItem, index: number): React.ReactElement => {
    const stale: boolean = freshness(item.sourceDate, now, settings.freshnessDays) === 'stale';
    const caption: string | undefined = item.caption ?? (stale ? STALE_CASE_CAPTION : undefined);
    const tags: ICaseTag[] = tagsOf(item);
    const cardClass: string = item.historicalHealth === undefined ? 'ai-case-card' : `ai-case-card ai-case-card--${item.historicalHealth}`;
    const footer: OptionalElement =
      item.nextAction === undefined && caption === undefined ? null : (
        <div className="ai-case-footer">
          {item.nextAction !== undefined && (
            <p className="ai-case-next">
              {NEXT_PREFIX}
              {item.nextAction}
            </p>
          )}
          {caption !== undefined && <p className="ai-case-caption">{caption}</p>}
        </div>
      );
    return (
      <article key={`${item.id}-${index}`} className={cardClass}>
        <p className="ai-case-head">
          <code className="ai-case-id">{item.id}</code>
          {item.state === AWAITING_SOURCE_CODE ? chrome('awaitingSource', item.state) : <RequestStatusPill status={item.state} />}
          {stale && chrome('needsRefresh')}
          {item.illustrative === true && chrome('example')}
        </p>
        <h3>{item.title}</h3>
        {item.description !== undefined && <p className="ai-case-description">{item.description}</p>}
        {tags.length > 0 && (
          <p className="ai-case-tags">
            {tags.map(
              (tag: ICaseTag, tagIndex: number): React.ReactElement => (
                <span key={tagIndex} className={tag.health === undefined ? 'ai-case-tag' : `ai-case-tag ai-case-tag--${tag.health}`}>
                  {tag.text}
                </span>
              )
            )}
          </p>
        )}
        {footer}
      </article>
    );
  };
  return <div className="ai-page-cases">{block.items.map(renderCard)}</div>;
}

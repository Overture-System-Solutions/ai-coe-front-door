import * as React from 'react';
import { formatFactDate, freshness } from '../../content/freshness';
import type { IFactFields } from '../../content/pageContent';
import { chromeLabel } from '../../content/truthStates';
import type { ChromePillKey } from '../../content/truthStates';
import type { OptionalElement } from '../../controls/render';
import { StatusPill } from '../../controls/StatusPill';
import { usePageDocument } from './PageDocumentContext';

export const DO_NOT_INFER_TEXT: string = 'Do not infer progress.';
const AS_OF_PREFIX: string = 'As of ';
const SOURCE_SEPARATOR: string = ' · ';

/**
 * The line under a fact that says how old it is and where it came from: "As of 1 Sep 2026 · AI CoE
 * check". Once the date is older than the document's freshness threshold the line adds the
 * needs-refresh pill; a source with no date is awaiting its source and the line says not to infer
 * progress from it; an illustrative item carries the example pill. The clock and the threshold come
 * from the page document context, never from the browser at render time, so tests inject both.
 * Nothing renders for an item that says nothing about its age or origin.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export function Freshness({ asOf, source, illustrative }: IFactFields): OptionalElement {
  const { now, settings, vocabulary } = usePageDocument();
  const date: string | undefined = formatFactDate(asOf);
  if (date === undefined && source === undefined && illustrative !== true) {
    return null;
  }
  const pill = (key: ChromePillKey): React.ReactElement => <StatusPill state={key} label={chromeLabel(key, vocabulary)} />;
  const parts: React.ReactNode[] = [];
  if (date !== undefined) {
    parts.push(`${AS_OF_PREFIX}${date}${source === undefined ? '' : `${SOURCE_SEPARATOR}${source}`}`);
    if (freshness(asOf, now, settings.freshnessDays) === 'stale') {
      parts.push(pill('needsRefresh'));
    }
  } else if (source !== undefined) {
    parts.push(pill('awaitingSource'));
    parts.push(DO_NOT_INFER_TEXT);
  }
  if (illustrative === true) {
    parts.push(pill('example'));
  }
  return (
    <p className="ai-page-freshness">
      {parts.map((part: React.ReactNode, index: number): React.ReactNode => (
        <React.Fragment key={index}>
          {index > 0 ? ' ' : undefined}
          {part}
        </React.Fragment>
      ))}
    </p>
  );
}

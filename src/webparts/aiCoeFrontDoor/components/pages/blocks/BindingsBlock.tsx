import * as React from 'react';
import { formatFactDate } from '../../../content/freshness';
import type { IBinding, IBindingsBlock } from '../../../content/pageContent';
import type { OptionalElement } from '../../../controls/render';
import { StatusPill } from '../../../controls/StatusPill';
import { usePageDocument } from '../PageDocumentContext';

export interface IBindingsBlockProps {
  block: IBindingsBlock;
}

export const RELEASE_PREFIX: string = 'Content release ';
export const PUBLISHED_PREFIX: string = ', published ';
export const SOURCE_PREFIX: string = 'Written to ';
export const RECEIPT_PREFIX: string = 'Receipt: ';
export const BOUND_LABEL: string = 'Bound';
export const AWAITING_LABEL: string = 'Awaiting';
export const NO_RELEASE_TEXT: string = 'No content release is recorded in this document.';
export const NO_BINDINGS_TEXT: string = 'No tenant bindings are recorded in this content release.';

/**
 * What the release line says: the name the run gave the content and, when it published one, the day
 * it did. A run that named nothing says so rather than showing an empty line, and a missing day is
 * simply left out: no date is invented here either.
 */
function releaseLine(id: string | undefined, publishedAt: string | undefined): string {
  if (id === undefined) {
    return NO_RELEASE_TEXT;
  }
  const day: string | undefined = formatFactDate(publishedAt);
  return day === undefined ? `${RELEASE_PREFIX}${id}` : `${RELEASE_PREFIX}${id}${PUBLISHED_PREFIX}${day}`;
}

/**
 * The bindings of the provisioning run: what it published, and which of the tenant's own inputs the
 * site holds. One row per input with its kind and a pill: bound when the run was given it (and, for a
 * site group, when the site carries a group of that title), awaiting while the site still owes it.
 * The value behind an input never appears; the reference of a qualification receipt does, because it
 * names a record rather than holding a secret.
 *
 * The rows belong to the operator plane. On a page written for everyone the block renders nothing at
 * all, so a run's inventory can never appear beside a person's own work.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export function BindingsBlock({ block }: IBindingsBlockProps): React.ReactElement {
  const { plane, release, bindings } = usePageDocument();
  if (plane !== 'operator') {
    return <></>;
  }
  const rows: OptionalElement =
    bindings.length === 0 ? (
      <p className="ai-page-bindings-empty">{NO_BINDINGS_TEXT}</p>
    ) : (
      <dl className="ai-page-bindings-list">
        {bindings.map(
          (binding: IBinding, index: number): React.ReactElement => (
            <div key={`${binding.name}-${index}`} className="ai-page-binding">
              <dt className="ai-page-binding-name">{binding.name}</dt>
              <dd className="ai-page-binding-state">
                <code className="ai-page-binding-kind">{binding.kind}</code>
                <StatusPill
                  state={binding.state === 'bound' ? 'availableNow' : 'needsAccess'}
                  label={binding.state === 'bound' ? BOUND_LABEL : AWAITING_LABEL}
                />
                {binding.receiptRef !== undefined && (
                  <span className="ai-page-binding-receipt">
                    {RECEIPT_PREFIX}
                    {binding.receiptRef}
                  </span>
                )}
              </dd>
            </div>
          )
        )}
      </dl>
    );
  return (
    <div className="ai-page-bindings">
      {block.title !== undefined && <h3 className="ai-page-bindings-title">{block.title}</h3>}
      <p className="ai-page-bindings-release">
        {releaseLine(release?.id, release?.publishedAt)}
        {release?.source !== undefined && (
          <span className="ai-page-bindings-source">
            {SOURCE_PREFIX}
            {release.source}
          </span>
        )}
      </p>
      {rows}
    </div>
  );
}

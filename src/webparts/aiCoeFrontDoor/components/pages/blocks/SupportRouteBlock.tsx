import * as React from 'react';
import { resolveContentHref } from '../../../content/pageContent';
import type { ISupportRouteBlock, ISupportRouteItem } from '../../../content/pageContent';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { anchorProps } from '../Markup';

export interface ISupportRouteBlockProps {
  block: ISupportRouteBlock;
}

export const SUPPORT_TITLE: string = 'Support';
export const STOP_HEADING: string = 'Stop and ask when';
export const REPORT_HEADING: string = 'What to include';
export const ROUTE_TO_KEY: string = 'Route to';
export const ACTION_KEY: string = 'Action';
/** Shown for a routing row whose owner the page owner has not named yet, so the gap is stated rather than left blank. */
export const NOT_YET_NAMED: string = 'not yet named';

function StopList({ items }: { items: string[] }): React.ReactElement {
  return (
    <div className="ai-page-support-list-group">
      <h3 className="ai-page-support-heading">{STOP_HEADING}</h3>
      <ul className="ai-page-support-list ai-page-support-stop">
        {items.map(
          (item: string, index: number): React.ReactElement => (
            <li key={index}>{item}</li>
          )
        )}
      </ul>
    </div>
  );
}

function ReportList({ items }: { items: string[] }): React.ReactElement {
  return (
    <div className="ai-page-support-list-group">
      <h3 className="ai-page-support-heading">{REPORT_HEADING}</h3>
      <ul className="ai-page-support-list ai-page-support-report">
        {items.map(
          (item: string, index: number): React.ReactElement => (
            <li key={index}>{item}</li>
          )
        )}
      </ul>
    </div>
  );
}

/**
 * The support route shared by every page view (the same help in the same place, WCAG 2.2 3.2.6):
 * where to ask, when to stop and ask, what a report should carry, and which owner each kind of issue
 * goes to with the action to take at once. The routing grid is a description list: a term per issue,
 * a detail for the owner (a blank one reads "not yet named") and one for the action.
 */
export function SupportRouteBlock({ block }: ISupportRouteBlockProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  const route: React.ReactNode =
    block.href === undefined ? (
      <span className="ai-page-support-label">{block.label}</span>
    ) : (
      <a className="ai-page-support-link" {...anchorProps(siteUrl, resolveContentHref(siteUrl, block.href))}>
        {block.label}
      </a>
    );
  const hasLists: boolean = block.stopWhen.length > 0 || block.reportFields.length > 0;
  return (
    <section className="ai-page-support">
      <h2 className="ai-page-support-title">{SUPPORT_TITLE}</h2>
      <p className="ai-page-support-route">{route}</p>
      {hasLists && (
        <div className="ai-page-support-columns">
          {block.stopWhen.length > 0 && <StopList items={block.stopWhen} />}
          {block.reportFields.length > 0 && <ReportList items={block.reportFields} />}
        </div>
      )}
      {block.routes.length > 0 && (
        <dl className="ai-page-support-grid">
          {block.routes.map(
            (item: ISupportRouteItem, index: number): React.ReactElement => (
              <div key={index} className="ai-page-support-row">
                <dt className="ai-page-support-issue">{item.issue}</dt>
                <dd className="ai-page-support-owner">
                  <span className="ai-page-support-key">{ROUTE_TO_KEY}</span>
                  {item.owner ?? NOT_YET_NAMED}
                </dd>
                {item.action !== undefined && (
                  <dd className="ai-page-support-action">
                    <span className="ai-page-support-key">{ACTION_KEY}</span>
                    {item.action}
                  </dd>
                )}
              </div>
            )
          )}
        </dl>
      )}
    </section>
  );
}

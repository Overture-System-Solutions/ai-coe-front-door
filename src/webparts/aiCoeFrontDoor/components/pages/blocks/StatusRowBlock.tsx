import * as React from 'react';
import { resolvePill } from '../../../content/actions';
import type { IPillLook } from '../../../content/actions';
import type { IStatusItem, IStatusRowBlock } from '../../../content/pageContent';
import type { IRouteOptions } from '../../../content/routes';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { StatusPill } from '../../../controls/StatusPill';
import { Markup } from '../Markup';
import { usePageDocument } from '../PageDocumentContext';

export interface IStatusRowBlockProps {
  block: IStatusRowBlock;
}

/**
 * Short labelled lines side by side, such as "Status" and "Support" at the foot of a page. An item
 * with a state or a route ends with its pill, resolved against the document's route list.
 */
export function StatusRowBlock({ block }: IStatusRowBlockProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  const { routes, now, vocabulary, roles } = usePageDocument();
  const options: IRouteOptions = { siteUrl, now, vocabulary, roles };
  return (
    <div className="ai-page-status">
      {block.items.map((item: IStatusItem, index: number): React.ReactElement => {
        const look: IPillLook | undefined = resolvePill(item, routes, options);
        return (
          <p key={index} className="ai-page-status-item">
            <strong>{item.label}</strong>
            {' — '}
            <Markup text={item.text} />
            {look !== undefined && (
              <>
                {' '}
                <StatusPill state={look.pill} label={look.label} />
              </>
            )}
          </p>
        );
      })}
    </div>
  );
}

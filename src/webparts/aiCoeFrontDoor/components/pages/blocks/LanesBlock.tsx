import * as React from 'react';
import type { ILaneItem, ILanesBlock } from '../../../content/pageContent';
import { Markup } from '../Markup';

export interface ILanesBlockProps {
  block: ILanesBlock;
}

/** The green, amber and red request lanes as toned articles. */
export function LanesBlock({ block }: ILanesBlockProps): React.ReactElement {
  return (
    <div className="ai-page-lanes">
      {block.items.map((item: ILaneItem, index: number): React.ReactElement => (
        <article key={index} className={`ai-page-lane ai-page-lane--${item.tone}`}>
          {item.badge !== undefined && <span className="ai-page-lane-badge">{item.badge}</span>}
          <h3>{item.title}</h3>
          {item.body.length > 0 && (
            <div className="ai-page-lane-body">
              {item.body.map((paragraph: string, paragraphIndex: number): React.ReactElement => (
                <p key={paragraphIndex}>
                  <Markup text={paragraph} />
                </p>
              ))}
            </div>
          )}
          {item.note !== undefined && (
            <p className="ai-page-lane-note">
              <Markup text={item.note} />
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

import * as React from 'react';
import type { ICardItem, ICardsBlock } from '../../../content/pageContent';
import { Markup } from '../Markup';

export interface ICardsBlockProps {
  block: ICardsBlock;
}

/** Two or three columns of toned cards: kicker, title, paragraphs and an emphasised closing line. */
export function CardsBlock({ block }: ICardsBlockProps): React.ReactElement {
  const gridClass: string = block.columns === 3 ? 'ai-page-cards ai-page-cards--3' : 'ai-page-cards';
  return (
    <div className={gridClass}>
      {block.items.map((item: ICardItem, index: number): React.ReactElement => (
        <article key={index} className={`ai-page-card ai-page-card--${item.tone}`}>
          {item.kicker !== undefined && <p className="ai-page-card-kicker">{item.kicker}</p>}
          <h3>{item.title}</h3>
          {item.body.length > 0 && (
            <div className="ai-page-card-body">
              {item.body.map((paragraph: string, paragraphIndex: number): React.ReactElement => (
                <p key={paragraphIndex}>
                  <Markup text={paragraph} />
                </p>
              ))}
            </div>
          )}
          {item.meta !== undefined && (
            <p className="ai-page-card-meta">
              <Markup text={item.meta} />
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

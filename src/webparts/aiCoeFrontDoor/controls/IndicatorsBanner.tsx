import * as React from 'react';
import { Info } from '../icons';
import { NoticeBanner } from './NoticeBanner';

export interface IIndicatorsBannerProps {
  indicators: string[];
  /** Extra sentence under the list (the disclosure summary reassures that indicators are not a judgement). */
  note?: string;
}

/** "Review indicators" banner of the summary pages. */
export function IndicatorsBanner({ indicators, note }: IIndicatorsBannerProps): React.ReactElement {
  return (
    <NoticeBanner icon={Info}>
      <strong className="block font-semibold" style={{ color: 'var(--color-info-text)' }}>
        Review indicators
      </strong>
      {indicators.length > 0 ? (
        <>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {indicators.map(
              (indicator: string): React.ReactElement => (
                <li key={indicator}>{indicator}</li>
              )
            )}
          </ul>
          {note !== undefined && <span className="mt-2 block">{note}</span>}
        </>
      ) : (
        <span>We didn&apos;t find any review indicators based on your answers.</span>
      )}
    </NoticeBanner>
  );
}

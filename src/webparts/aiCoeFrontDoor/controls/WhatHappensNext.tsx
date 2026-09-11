import * as React from 'react';
import { Info } from '../icons';
import { NoticeBanner } from './NoticeBanner';

export interface IWhatHappensNextProps {
  text: string | undefined;
}

/** The "What happens after you confirm" banner shown on every review and summary page. */
export function WhatHappensNext({ text }: IWhatHappensNextProps): React.ReactElement {
  return (
    <NoticeBanner icon={Info}>
      <strong className="block font-semibold" style={{ color: 'var(--color-info-text)' }}>
        What happens after you confirm
      </strong>
      <span>{text}</span>
    </NoticeBanner>
  );
}

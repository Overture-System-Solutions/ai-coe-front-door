import * as React from 'react';
import { Info } from '../icons';
import type { LucideIcon } from '../icons';

export interface INoticeBannerProps {
  icon?: LucideIcon;
  children?: React.ReactNode;
}

/** Soft informational banner with a decorative icon; the Info icon unless another one is given. */
export function NoticeBanner({ icon: Icon = Info, children }: INoticeBannerProps): React.ReactElement {
  return (
    <div className="overture-notice flex gap-3 rounded-xl px-4 py-3 text-[15px] leading-relaxed">
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

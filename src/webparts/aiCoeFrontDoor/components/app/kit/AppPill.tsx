import * as React from 'react';

/**
 * The chrome pill of the consolidated view: a short word about the state of something, in one of five tones.
 *
 * Five rather than the shipped four, because the reference prototype distinguishes a thing that is *designed* from
 * a thing that is *waiting* - and the difference matters on a page whose whole job is to say what is proved and
 * what is not. The shipped `StatusPill` keeps its own job, which is the five truth states of a route; this one
 * labels chrome, a card header or a work item.
 *
 * Tone carries the tenant palette wherever a token exists for it, so an organization's colours repaint the states
 * it already owns. `design` reads the soft surface token, being the one tone the shipped palette had no word for.
 *
 * The tone is never the only signal: every pill carries its own wording, so a reader who cannot separate the
 * colours still reads the state.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export type AppPillTone = 'good' | 'wait' | 'design' | 'block' | 'info';

export const APP_PILL_TONES: readonly AppPillTone[] = ['good', 'wait', 'design', 'block', 'info'];

export interface IAppPillProps {
  tone: AppPillTone;
  children: React.ReactNode;
}

export function AppPill({ tone, children }: IAppPillProps): React.ReactElement {
  return <span className={`ai-app-pill ai-app-pill--${tone}`}>{children}</span>;
}

import * as React from 'react';
import type { IConcierge } from '../services/concierge';

/**
 * Where a saved submission hands the person on to (1.0.0.18). The tabbed view provides it: the AI CoE Concierge when
 * the site set one up, and nothing otherwise, so no card points at a destination that does not exist. Page views
 * provide none and keep the route card their content document resolves.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export interface IHandOff {
  concierge?: IConcierge;
}

const HandOffContext: React.Context<IHandOff | undefined> = React.createContext<IHandOff | undefined>(undefined);

export const HandOffProvider: React.Provider<IHandOff | undefined> = HandOffContext.Provider;

/** The hand-off the view provides; undefined in page views, which keep their route card. */
export function useHandOff(): IHandOff | undefined {
  return React.useContext(HandOffContext);
}

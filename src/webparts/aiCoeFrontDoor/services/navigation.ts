/** Leaves the current page for `url`; page views use it for "All topics", "Back" on the first question and "Front Door". */
export type Navigate = (url: string) => void;

export interface INavigationWindow {
  location: { assign(url: string): void };
}

/** A navigator over any window-like object, so tests can observe navigation without leaving jsdom. */
export function createNavigator(win: INavigationWindow): Navigate {
  return (url: string): void => {
    win.location.assign(url);
  };
}

/** Full page load through the real browser window; evaluated only when called, never at import time. */
export const browserNavigate: Navigate = (url: string): void => {
  window.location.assign(url);
};

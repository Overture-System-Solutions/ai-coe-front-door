import * as React from 'react';
import { MyWork } from '../pages/MyWork';

/**
 * A person's own requests, inside the consolidated view.
 *
 * This is the existing `MyWork` piece unchanged, which matters: it issues one read filtered to the signed-in
 * person's address and never widens it, and what actually comes back is decided by item-level security on the
 * list. Wrapping it rather than rewriting it keeps that property and its tests.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export function AppCases(): React.ReactElement {
  return (
    <div className="ai-app-cases">
      <MyWork />
    </div>
  );
}

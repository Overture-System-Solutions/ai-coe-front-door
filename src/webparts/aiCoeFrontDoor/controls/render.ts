import type * as React from 'react';

/**
 * React 17 components that render nothing must return `null` (returning `undefined` throws), so this
 * alias is the one sanctioned use of null in the UI layer.
 */
// eslint-disable-next-line @rushstack/no-new-null
export type OptionalElement = React.ReactElement | null;

import * as React from 'react';
import { DEFAULT_SETTINGS, DEFAULT_VOCABULARY, pagePlane } from '../../content/pageContent';
import type { IContentPage, IDocumentSettings, IPageDocument, IVocabulary, PageBlock, PagePlane } from '../../content/pageContent';
import type { RouteTable } from '../../content/routes';

/** The sections every page view shares; the footer blocks arrive with the shared section of the document. */
export interface ISharedSections {
  footer: PageBlock[];
}

/**
 * What every block reads from the document it sits in, rather than from its props: the route list,
 * the wording overrides, the settings, the plane of the page, the shared sections, the clock the
 * freshness and verification checks use, and (once roles are resolved) the roles the person holds.
 */
export interface IPageDocumentContextValue {
  routes: RouteTable;
  vocabulary: IVocabulary;
  settings: IDocumentSettings;
  plane: PagePlane;
  shared: ISharedSections;
  now: Date;
  roles?: string[];
}

/** A context value with the defaults for anything not given; the clock is the moment of the call. */
export function createPageDocumentContext(overrides: Partial<IPageDocumentContextValue> = {}): IPageDocumentContextValue {
  const value: IPageDocumentContextValue = {
    routes: overrides.routes ?? {},
    vocabulary: overrides.vocabulary ?? DEFAULT_VOCABULARY,
    settings: overrides.settings ?? DEFAULT_SETTINGS,
    plane: overrides.plane ?? 'user',
    shared: overrides.shared ?? { footer: [] },
    now: overrides.now ?? new Date()
  };
  if (overrides.roles !== undefined) {
    value.roles = overrides.roles;
  }
  return value;
}

/** The context for one page of a loaded document: its sections, the page's plane, and the host's clock and roles. */
export function documentContext(document: IPageDocument, page: IContentPage | undefined, host: IPageDocumentContextValue): IPageDocumentContextValue {
  return createPageDocumentContext({
    routes: document.routes ?? {},
    vocabulary: document.vocabulary ?? DEFAULT_VOCABULARY,
    settings: document.settings ?? DEFAULT_SETTINGS,
    plane: page === undefined ? 'user' : pagePlane(page),
    now: host.now,
    roles: host.roles
  });
}

const PageDocumentContext: React.Context<IPageDocumentContextValue | undefined> = React.createContext<IPageDocumentContextValue | undefined>(undefined);

export interface IPageDocumentProviderProps {
  value: IPageDocumentContextValue;
  children?: React.ReactNode;
}

export function PageDocumentProvider({ value, children }: IPageDocumentProviderProps): React.ReactElement {
  return <PageDocumentContext.Provider value={value}>{children}</PageDocumentContext.Provider>;
}

/** The nearest page document context, or the defaults (created once per component) outside any provider. */
export function usePageDocument(): IPageDocumentContextValue {
  const value: IPageDocumentContextValue | undefined = React.useContext(PageDocumentContext);
  const fallback: IPageDocumentContextValue = React.useMemo((): IPageDocumentContextValue => createPageDocumentContext(), []);
  return value ?? fallback;
}

import * as React from 'react';
import type { IBranding } from '../branding/branding';
import type { TelemetryProvider } from '../content/telemetryTiles';
import type { IIdeaDraftService } from '../services/draftService';
import type { IDraftStore } from '../services/draftStorage';
import type { IMyWorkService } from '../services/myWorkService';
import type { Navigate } from '../services/navigation';
import type { IPageContentService } from '../services/pageContentService';
import type { IToolPolicyEvaluator } from '../services/toolPolicyEvaluator';
import type { IGovernanceService, IUsageMetricsService } from '../services/types';
import type { IWorkflowCatalog } from '../workflows/types';

export interface IFrontDoorUser {
  displayName: string;
  email: string;
}

export interface IFrontDoorServices {
  governance: IGovernanceService;
  usage: IUsageMetricsService;
  draftStore: IDraftStore;
  toolPolicyEvaluator: IToolPolicyEvaluator;
  /** Present only when the web part has an AI draft flow configured; otherwise summaries stay deterministic. */
  ideaDrafts?: IIdeaDraftService;
  /** Reads the page content document; present for web parts, absent in the legacy-only test setups. */
  pageContent?: IPageContentService;
  /** Reads the person's own requests; present for web parts, absent in the legacy-only test setups (the pieces then report the list as unavailable). */
  myWork?: IMyWorkService;
}

/** Everything the pages need from the host: who is looking, where they are, and the services to talk to. */
export interface IFrontDoorContextValue {
  branding: IBranding;
  catalog: IWorkflowCatalog;
  siteUrl: string;
  user: IFrontDoorUser;
  isAdmin: boolean;
  /** Which usage feed the telemetry strip shows; a presentation choice, so changing it never refetches. */
  telemetryProvider: TelemetryProvider;
  services: IFrontDoorServices;
  /** Leaves the page for another URL. Absent in the legacy shell, which never navigates; page views fall back to the browser. */
  navigate?: Navigate;
  /**
   * True when the instance renders one piece on a native page (a page view); false in the legacy
   * single-page shell. The receipt, the failure notice and the kept drafts exist in page views only,
   * so the legacy screens stay as shipped.
   */
  pageView: boolean;
}

const FrontDoorContext: React.Context<IFrontDoorContextValue | undefined> = React.createContext<IFrontDoorContextValue | undefined>(undefined);

export interface IFrontDoorProviderProps {
  value: IFrontDoorContextValue;
  children?: React.ReactNode;
}

export function FrontDoorProvider({ value, children }: IFrontDoorProviderProps): React.ReactElement {
  return <FrontDoorContext.Provider value={value}>{children}</FrontDoorContext.Provider>;
}

export function useFrontDoor(): IFrontDoorContextValue {
  const value: IFrontDoorContextValue | undefined = React.useContext(FrontDoorContext);
  if (value === undefined) {
    throw new Error('useFrontDoor must be called inside a FrontDoorProvider.');
  }
  return value;
}

/** Whether the tree is a page view; false outside any provider, where only the shipped legacy controls are ever mounted. */
export function usePageViewFlag(): boolean {
  const value: IFrontDoorContextValue | undefined = React.useContext(FrontDoorContext);
  return value !== undefined && value.pageView;
}

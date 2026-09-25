import type { ICaseAnalysisService } from '../webparts/aiCoeFrontDoor/services/caseAnalysisService';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import * as React from 'react';
import { createBranding } from '../webparts/aiCoeFrontDoor/branding/branding';
import type { IBranding } from '../webparts/aiCoeFrontDoor/branding/branding';
import type { IBinding, IContentRelease, IDocumentSettings, ISharedSections, IVocabulary, PagePlane } from '../webparts/aiCoeFrontDoor/content/pageContent';
import type { TelemetryProvider } from '../webparts/aiCoeFrontDoor/content/telemetryTiles';
import type { RouteTable } from '../webparts/aiCoeFrontDoor/content/routes';
import { createWorkflowCatalog } from '../webparts/aiCoeFrontDoor/content/workflows/catalog';
import { createPageDocumentContext, PageDocumentProvider } from '../webparts/aiCoeFrontDoor/components/pages/PageDocumentContext';
import type { RoleMembershipState } from '../webparts/aiCoeFrontDoor/components/pages/PageDocumentContext';
import { FrontDoorProvider } from '../webparts/aiCoeFrontDoor/context/FrontDoorContext';
import type { IFrontDoorContextValue, IFrontDoorUser } from '../webparts/aiCoeFrontDoor/context/FrontDoorContext';
import { SubmissionProvider } from '../webparts/aiCoeFrontDoor/context/SubmissionContext';
import type { IIdeaDraftService } from '../webparts/aiCoeFrontDoor/services/draftService';
import type { IMyWorkService } from '../webparts/aiCoeFrontDoor/services/myWorkService';
import type { IPageContentService } from '../webparts/aiCoeFrontDoor/services/pageContentService';
import type { IProgramMeasuresService } from '../webparts/aiCoeFrontDoor/services/programMeasuresService';
import type { IRoleResolver } from '../webparts/aiCoeFrontDoor/services/roleResolver';
import type { IToolPolicyEvaluator } from '../webparts/aiCoeFrontDoor/services/toolPolicyEvaluator';
import type { IUsageMetricsService } from '../webparts/aiCoeFrontDoor/services/types';
import type { IMarketingServices } from '../webparts/aiCoeFrontDoor/services/marketing/marketingServices';
import type { ICoreWorkService } from '../webparts/aiCoeFrontDoor/services/core/coreWorkService';
import { createFakeGovernanceService, createImmediateEvaluator, createPendingUsageService, InMemoryDraftStore } from './fakeServices';
import type { IFakeGovernanceService } from './fakeServices';

export const TEST_SITE_URL: string = 'https://contoso.sharepoint.com/sites/ai';
export const TEST_USER: IFrontDoorUser = { displayName: 'Pat Example', email: 'pat@contoso.com' };

export interface ITestFrontDoorOptions {
  /** Defaults to "Overture" so the rendered copy matches the shipped 1.0.0.7 strings. */
  organizationName?: string;
  siteUrl?: string;
  isAdmin?: boolean;
  user?: IFrontDoorUser;
  /** Defaults to the OpenAI tiles the shipped build rendered; the web part itself defaults to Claude. */
  telemetryProvider?: TelemetryProvider;
  governance?: IFakeGovernanceService;
  /** Defaults to a service that never answers; pass a fake to exercise the telemetry strip. */
  usage?: IUsageMetricsService;
  draftStore?: InMemoryDraftStore;
  toolPolicyEvaluator?: IToolPolicyEvaluator;
  /** Absent by default, like a web part without a configured draft flow. */
  ideaDrafts?: IIdeaDraftService;
  /** Absent by default; content pages report the document as unavailable without it. */
  pageContent?: IPageContentService;
  /** Absent by default; the my-work piece and the status strip report the request list as unavailable without it. */
  myWork?: IMyWorkService;
  /** Absent by default; the pieces then hold the employee role alone and report the membership as unresolved. */
  roleResolver?: IRoleResolver;
  /** Absent by default; the measure tiles then read every measure as not available. */
  programMeasures?: IProgramMeasuresService;
  /** Absent by default; the Marketing section then offers only the labelled demonstration. */
  marketing?: IMarketingServices;
  /** Absent by default; the Cases section then omits the Binding A workspace. */
  coreWork?: ICoreWorkService;
  /** Absent by default, like a web part without a case analysis flow bound. */
  caseAnalysis?: ICaseAnalysisService;
  /** The document's wording overrides the blocks read; the defaults unless given. */
  vocabulary?: IVocabulary;
  /** Records where page views navigate to; a fresh mock unless given. */
  navigate?: jest.Mock;
  /** The clock the page document context hands to the blocks; the moment of rendering unless given. */
  now?: Date;
  /** The route table the blocks resolve against when no content page provides one; empty by default. */
  routes?: RouteTable;
  /** Role ids the person holds; none by default. */
  roles?: string[];
  /** How the membership behind those roles stands; read when roles are given, unread when they are not. */
  rolesState?: RoleMembershipState;
  /** True to render as a page view (the receipt, the failure notice, the kept drafts); the legacy view by default. */
  pageView?: boolean;
  /** The shared sections of the document (the footer with the support route); empty by default. */
  shared?: ISharedSections;
  /** The plane of the page; the user plane by default. */
  plane?: PagePlane;
  /** The document settings the blocks read (the freshness threshold, the cohort minimum); the defaults unless given. */
  settings?: IDocumentSettings;
  /** What a provisioning run called the content; absent, as in a document no run has written yet. */
  release?: IContentRelease;
  /** The tenant inputs a run reported; none by default. */
  bindings?: IBinding[];
}

export interface ITestFrontDoor {
  value: IFrontDoorContextValue;
  branding: IBranding;
  governance: IFakeGovernanceService;
  draftStore: InMemoryDraftStore;
  navigate: jest.Mock;
}

export function createTestFrontDoor(options: ITestFrontDoorOptions = {}): ITestFrontDoor {
  const branding: IBranding = createBranding(options.organizationName ?? 'Overture');
  const governance: IFakeGovernanceService = options.governance ?? createFakeGovernanceService();
  const draftStore: InMemoryDraftStore = options.draftStore ?? new InMemoryDraftStore();
  const navigate: jest.Mock = options.navigate ?? jest.fn();
  const value: IFrontDoorContextValue = {
    branding,
    catalog: createWorkflowCatalog(branding),
    siteUrl: options.siteUrl ?? TEST_SITE_URL,
    user: options.user ?? TEST_USER,
    isAdmin: options.isAdmin ?? false,
    telemetryProvider: options.telemetryProvider ?? 'openai',
    services: {
      governance,
      usage: options.usage ?? createPendingUsageService(),
      draftStore,
      toolPolicyEvaluator: options.toolPolicyEvaluator ?? createImmediateEvaluator(branding),
      ideaDrafts: options.ideaDrafts,
      pageContent: options.pageContent,
      myWork: options.myWork,
      roles: options.roleResolver,
      programMeasures: options.programMeasures,
      marketing: options.marketing,
      coreWork: options.coreWork,
      caseAnalysis: options.caseAnalysis
    },
    navigate,
    pageView: options.pageView ?? false
  };
  return { value, branding, governance, draftStore, navigate };
}

export type FrontDoorRenderResult = RenderResult & ITestFrontDoor;

/** Renders `ui` inside the front-door and submission providers backed by fakes. */
export function renderWithFrontDoor(ui: React.ReactElement, options: ITestFrontDoorOptions = {}): FrontDoorRenderResult {
  const testFrontDoor: ITestFrontDoor = createTestFrontDoor(options);
  const result: RenderResult = render(
    <FrontDoorProvider value={testFrontDoor.value}>
      <SubmissionProvider governanceService={testFrontDoor.governance}>
        <PageDocumentProvider
          value={createPageDocumentContext({
            now: options.now,
            routes: options.routes,
            roles: options.roles,
            rolesState: options.rolesState,
            shared: options.shared,
            plane: options.plane,
            vocabulary: options.vocabulary,
            settings: options.settings,
            release: options.release,
            bindings: options.bindings
          })}
        >
          {ui}
        </PageDocumentProvider>
      </SubmissionProvider>
    </FrontDoorProvider>
  );
  return { ...result, ...testFrontDoor };
}

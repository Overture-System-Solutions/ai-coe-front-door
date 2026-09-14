import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import * as React from 'react';
import { createBranding } from '../webparts/aiCoeFrontDoor/branding/branding';
import type { IBranding } from '../webparts/aiCoeFrontDoor/branding/branding';
import type { TelemetryProvider } from '../webparts/aiCoeFrontDoor/content/telemetryTiles';
import { createWorkflowCatalog } from '../webparts/aiCoeFrontDoor/content/workflows/catalog';
import { FrontDoorProvider } from '../webparts/aiCoeFrontDoor/context/FrontDoorContext';
import type { IFrontDoorContextValue, IFrontDoorUser } from '../webparts/aiCoeFrontDoor/context/FrontDoorContext';
import { SubmissionProvider } from '../webparts/aiCoeFrontDoor/context/SubmissionContext';
import type { IIdeaDraftService } from '../webparts/aiCoeFrontDoor/services/draftService';
import type { IToolPolicyEvaluator } from '../webparts/aiCoeFrontDoor/services/toolPolicyEvaluator';
import type { IUsageMetricsService } from '../webparts/aiCoeFrontDoor/services/types';
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
  /** Records where page views navigate to; a fresh mock unless given. */
  navigate?: jest.Mock;
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
      ideaDrafts: options.ideaDrafts
    },
    navigate
  };
  return { value, branding, governance, draftStore, navigate };
}

export type FrontDoorRenderResult = RenderResult & ITestFrontDoor;

/** Renders `ui` inside the front-door and submission providers backed by fakes. */
export function renderWithFrontDoor(ui: React.ReactElement, options: ITestFrontDoorOptions = {}): FrontDoorRenderResult {
  const testFrontDoor: ITestFrontDoor = createTestFrontDoor(options);
  const result: RenderResult = render(
    <FrontDoorProvider value={testFrontDoor.value}>
      <SubmissionProvider governanceService={testFrontDoor.governance}>{ui}</SubmissionProvider>
    </FrontDoorProvider>
  );
  return { ...result, ...testFrontDoor };
}

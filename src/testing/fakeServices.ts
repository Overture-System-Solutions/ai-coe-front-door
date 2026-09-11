/**
 * In-memory doubles for the services the React layer talks to. They record what the UI sent and
 * return whatever the test configured, so journeys can be asserted without SharePoint.
 */
import type { IBranding } from '../webparts/aiCoeFrontDoor/branding/branding';
import type { IDraftStore } from '../webparts/aiCoeFrontDoor/services/draftStorage';
import { createToolPolicyEvaluator } from '../webparts/aiCoeFrontDoor/services/toolPolicyEvaluator';
import type { IToolPolicyEvaluator } from '../webparts/aiCoeFrontDoor/services/toolPolicyEvaluator';
import type {
  IAdminDashboardData,
  IGovernanceService,
  ISubmissionResult,
  IUsageMetricsResult,
  IUsageMetricsService
} from '../webparts/aiCoeFrontDoor/services/types';
import type { SubmissionWorkflowType } from '../webparts/aiCoeFrontDoor/workflows/types';

export interface IDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

export function createDeferred<T>(): IDeferred<T> {
  let resolveDeferred: (value: T) => void = (): void => undefined;
  let rejectDeferred: (reason: Error) => void = (): void => undefined;
  const promise: Promise<T> = new Promise<T>((resolve: (value: T) => void, reject: (reason: Error) => void): void => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}

export interface IRecordedSubmission {
  workflowType: SubmissionWorkflowType;
  payload: unknown;
}

export interface IFakeGovernanceService extends IGovernanceService {
  submissions: IRecordedSubmission[];
  /** Returned by every submission; tests overwrite it to simulate failures. */
  result: ISubmissionResult;
  dashboard: IAdminDashboardData;
  dashboardCalls: number;
}

export const FAKE_INTAKE_ID: string = 'OVT-AICOE-20260911-TESTTEST';

export function createFakeGovernanceService(): IFakeGovernanceService {
  const service: IFakeGovernanceService = {
    submissions: [],
    result: {
      connected: true,
      intakeId: FAKE_INTAKE_ID,
      itemId: 1,
      itemUrl: 'https://contoso.sharepoint.com/sites/ai/Lists/AI%20CoE%20Pilot%20Intakes/DispForm.aspx?ID=1',
      message: 'Submission received and added to the AI CoE service queue.'
    },
    dashboard: { connected: true, intakes: [], useCases: [], decisions: [], message: 'Loaded.' },
    dashboardCalls: 0,
    submitWorkflow: async (workflowType: SubmissionWorkflowType, payload: unknown): Promise<ISubmissionResult> => {
      service.submissions.push({ workflowType, payload });
      return service.result;
    },
    getAdminDashboardData: async (): Promise<IAdminDashboardData> => {
      service.dashboardCalls += 1;
      return service.dashboard;
    }
  };
  return service;
}

export interface IFakeUsageMetricsService extends IUsageMetricsService {
  calls: number;
}

export const EMPTY_USAGE_RESULT: IUsageMetricsResult = { connected: true, metrics: [], alerts: [], message: 'Telemetry refreshed.' };

/** Resolves with `result` (a value or a promise the test controls) on every call. */
export function createFakeUsageService(result: IUsageMetricsResult | Promise<IUsageMetricsResult> = EMPTY_USAGE_RESULT): IFakeUsageMetricsService {
  const service: IFakeUsageMetricsService = {
    calls: 0,
    getMetrics: async (): Promise<IUsageMetricsResult> => {
      service.calls += 1;
      return result;
    }
  };
  return service;
}

/** Never answers: for pages under test that render the telemetry strip but do not exercise it. */
export function createPendingUsageService(): IFakeUsageMetricsService {
  return createFakeUsageService(new Promise<IUsageMetricsResult>((): void => undefined));
}

/** Draft store that keeps JSON copies in memory, so tests see exactly what localStorage would. */
export class InMemoryDraftStore implements IDraftStore {
  public readonly drafts: { [workflowId: string]: string } = {};

  public async save(workflowId: string, draft: unknown): Promise<{ ok: boolean }> {
    this.drafts[workflowId] = JSON.stringify(draft);
    return { ok: true };
  }

  public async load<T>(workflowId: string): Promise<T | undefined> {
    const raw: string | undefined = this.drafts[workflowId];
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }

  public async clear(workflowId: string): Promise<void> {
    delete this.drafts[workflowId];
  }

  public keys(): string[] {
    return Object.keys(this.drafts);
  }
}

/** The real evaluator without its 400 ms pause. */
export function createImmediateEvaluator(branding: IBranding): IToolPolicyEvaluator {
  return createToolPolicyEvaluator(branding, 0, async (): Promise<void> => undefined);
}

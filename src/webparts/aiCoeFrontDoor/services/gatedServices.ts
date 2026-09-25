/**
 * Capability-aware service facades: the production wiring of the capability gate.
 *
 * Why this exists. `authorization.ts` decides whether a caller may use a capability, and `gated()` runs a call only
 * when it may. Until now nothing in the rendered tree used either: the consolidated shell kept a refused section out
 * of the tab list and relied on a `useEffect` to send a person back to Home *after* a forbidden section had already
 * rendered and asked its service for data. An omitted tab is not a gate, and an effect that runs after the request
 * has left the browser is not one either.
 *
 * What this does. Every protected read the consolidated view can reach is wrapped: the wrapper decides from the
 * resolution it was built with and, when the capability is refused, answers with the service's own denied shape
 * (`PERMISSION`, the wording the failure classes already carry) without constructing a request. A section that
 * somehow mounts without authority therefore renders its refused state and the server is never asked. The open
 * services (the person's own requests, their own submissions and outcomes, drafts) pass through untouched.
 *
 * What this is not. The client is under the person's control, so this is defence in depth. Item-level security on
 * the lists and the site's own permissions stay the boundary, and the two-account tenant test for them is recorded
 * as not performed. Server authorization remains mandatory.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { IFrontDoorServices } from '../context/FrontDoorContext';
import { decide } from './authorization';
import type { Capability, IDecision } from './authorization';
import { failureUserMessage } from './failureClass';
import type { IProgramMeasuresResult, IProgramMeasuresService } from './programMeasuresService';
import type { IRoleResolution } from './roleResolver';
import type { IAdminDashboardData, IGovernanceService, ISubmissionResult, ISubmitOptions, IUsageMetricsResult, IUsageMetricsService } from './types';
import type { SubmissionWorkflowType } from '../workflows/types';

/** The sentence a refused facade puts in a result's `message`; it names no group, role or list. */
export const GATED_MESSAGE: string = 'This read was not made: the signed-in person does not hold the capability it needs.';

function refusedMeasures(): IProgramMeasuresResult {
  return { state: 'unavailable', measures: {}, message: GATED_MESSAGE, failureClass: 'PERMISSION', userMessage: failureUserMessage('PERMISSION') };
}

function refusedUsage(): IUsageMetricsResult {
  return { connected: false, metrics: [], alerts: [], message: GATED_MESSAGE, failureClass: 'PERMISSION', userMessage: failureUserMessage('PERMISSION') };
}

function refusedDashboard(): IAdminDashboardData {
  return { connected: false, intakes: [], useCases: [], decisions: [], message: GATED_MESSAGE, failureClass: 'PERMISSION', userMessage: failureUserMessage('PERMISSION') };
}

/** How many refused reads each facade absorbed; a test reads it, a page never does. */
export interface IGateCounters {
  refused: { [capability in Capability]?: number };
}

function count(counters: IGateCounters, capability: Capability): void {
  counters.refused[capability] = (counters.refused[capability] ?? 0) + 1;
}

/**
 * The measures service behind the `readProgramMeasures` capability. Absent stays absent: a site whose script has
 * not created the list has no service, and the facade does not invent one.
 */
export function gateProgramMeasures(service: IProgramMeasuresService | undefined, resolution: IRoleResolution, counters: IGateCounters): IProgramMeasuresService | undefined {
  if (service === undefined) {
    return undefined;
  }
  return {
    getMeasures: async (): Promise<IProgramMeasuresResult> => {
      const decision: IDecision = decide('readProgramMeasures', resolution);
      if (!decision.allowed) {
        count(counters, 'readProgramMeasures');
        return refusedMeasures();
      }
      return service.getMeasures();
    }
  };
}

/** The usage service behind `readUsageTelemetry`. */
export function gateUsage(service: IUsageMetricsService, resolution: IRoleResolution, counters: IGateCounters): IUsageMetricsService {
  return {
    getMetrics: async (): Promise<IUsageMetricsResult> => {
      const decision: IDecision = decide('readUsageTelemetry', resolution);
      if (!decision.allowed) {
        count(counters, 'readUsageTelemetry');
        return refusedUsage();
      }
      return service.getMetrics();
    }
  };
}

/**
 * The governance service with its one protected read, the administrator queue, behind `readAdminQueue`. The two
 * writes are a person's own and pass through: the server decides what it accepts, exactly as before.
 */
export function gateGovernance(service: IGovernanceService, resolution: IRoleResolution, counters: IGateCounters): IGovernanceService {
  return {
    submitWorkflow: (workflowType: SubmissionWorkflowType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> =>
      service.submitWorkflow(workflowType, payload, options),
    submitOutcome: (payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> => service.submitOutcome(payload, options),
    getAdminDashboardData: async (): Promise<IAdminDashboardData> => {
      const decision: IDecision = decide('readAdminQueue', resolution);
      if (!decision.allowed) {
        count(counters, 'readAdminQueue');
        return refusedDashboard();
      }
      return service.getAdminDashboardData();
    }
  };
}

export interface IGatedServices {
  services: IFrontDoorServices;
  counters: IGateCounters;
}

/**
 * The service bundle a consolidated view hands to its sections: every protected read wrapped for the resolution
 * given, everything open passed through. Rebuilt whenever the resolution changes, so a membership that resolves to
 * less than a first guess narrows the facades at the same moment it narrows the tabs.
 */
export function gateServices(services: IFrontDoorServices, resolution: IRoleResolution): IGatedServices {
  const counters: IGateCounters = { refused: {} };
  return {
    counters,
    services: {
      ...services,
      governance: gateGovernance(services.governance, resolution, counters),
      usage: gateUsage(services.usage, resolution, counters),
      programMeasures: gateProgramMeasures(services.programMeasures, resolution, counters)
    }
  };
}

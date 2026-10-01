/**
 * The capability-aware facades: the cases that matter are the refusals. A refused read must answer in the
 * service's own denied shape and never reach the underlying service; an allowed one must reach it exactly once.
 */
import { createFakeGovernanceService, createFakeProgramMeasuresService, createFakeUsageService } from '../../../testing/fakeServices';
import type { IFakeGovernanceService, IFakeProgramMeasuresService, IFakeUsageMetricsService } from '../../../testing/fakeServices';
import { createTestFrontDoor } from '../../../testing/renderWithFrontDoor';
import type { RoleId } from '../content/roles';
import type { IFrontDoorServices } from '../context/FrontDoorContext';
import { GATED_MESSAGE, gateServices } from './gatedServices';
import type { IGatedServices } from './gatedServices';
import type { IProgramMeasuresResult } from './programMeasuresService';
import type { IRoleResolution } from './roleResolver';
import type { IAdminDashboardData, IUsageMetricsResult } from './types';

function resolved(...roles: RoleId[]): IRoleResolution {
  return { roles: ['employee', ...roles], resolution: 'resolved' };
}

function unresolved(...roles: RoleId[]): IRoleResolution {
  return { roles: ['employee', ...roles], resolution: 'unresolved' };
}

interface IFakes {
  measures: IFakeProgramMeasuresService;
  usage: IFakeUsageMetricsService;
  governance: IFakeGovernanceService;
}

function build(resolution: IRoleResolution): IGatedServices & IFakes {
  const measures: IFakeProgramMeasuresService = createFakeProgramMeasuresService();
  const usage: IFakeUsageMetricsService = createFakeUsageService();
  const governance: IFakeGovernanceService = createFakeGovernanceService();
  const bundle: IFrontDoorServices = createTestFrontDoor({ programMeasures: measures, usage, governance }).value.services;
  return { ...gateServices(bundle, resolution), measures, usage, governance };
}

describe('gated service facades', () => {
  it('refuses the measures read to an employee without calling the service, in the service\'s own denied shape', async () => {
    const gated: IGatedServices & IFakes = build(resolved());
    const result: IProgramMeasuresResult = await gated.services.programMeasures!.getMeasures();
    expect(gated.measures.calls).toBe(0);
    expect(result.state).toBe('unavailable');
    expect(result.failureClass).toBe('PERMISSION');
    expect(result.userMessage).toBe('Needs access.');
    expect(result.message).toBe(GATED_MESSAGE);
    expect(Object.keys(result.measures)).toEqual([]);
    expect(gated.counters.refused.readProgramMeasures).toBe(1);
  });

  it('refuses every protected read while the membership is unresolved, whatever roles it claims', async () => {
    const gated: IGatedServices & IFakes = build(unresolved('operator', 'leader'));
    await gated.services.programMeasures!.getMeasures();
    await gated.services.usage.getMetrics();
    await gated.services.governance.getAdminDashboardData();
    expect(gated.measures.calls).toBe(0);
    expect(gated.usage.calls).toBe(0);
    expect(gated.governance.dashboardCalls).toBe(0);
    expect(gated.counters.refused).toEqual({ readProgramMeasures: 1, readUsageTelemetry: 1, readAdminQueue: 1 });
  });

  it('lets a leader read the measures once and still refuses the operator surfaces', async () => {
    const gated: IGatedServices & IFakes = build(resolved('leader'));
    await gated.services.programMeasures!.getMeasures();
    const usage: IUsageMetricsResult = await gated.services.usage.getMetrics();
    const queue: IAdminDashboardData = await gated.services.governance.getAdminDashboardData();
    expect(gated.measures.calls).toBe(1);
    expect(gated.usage.calls).toBe(0);
    expect(gated.governance.dashboardCalls).toBe(0);
    expect(usage.connected).toBe(false);
    expect(usage.failureClass).toBe('PERMISSION');
    expect(queue.connected).toBe(false);
    expect(queue.intakes).toEqual([]);
  });

  it('passes every operator read through exactly once, untouched', async () => {
    const gated: IGatedServices & IFakes = build(resolved('operator'));
    await gated.services.programMeasures!.getMeasures();
    await gated.services.usage.getMetrics();
    const queue: IAdminDashboardData = await gated.services.governance.getAdminDashboardData();
    expect(gated.measures.calls).toBe(1);
    expect(gated.usage.calls).toBe(1);
    expect(gated.governance.dashboardCalls).toBe(1);
    expect(queue).toBe(gated.governance.dashboard);
    expect(gated.counters.refused).toEqual({});
  });

  it('leaves a person\'s own writes open, so an unconfirmed membership never blocks their own work', async () => {
    const gated: IGatedServices & IFakes = build(unresolved());
    await gated.services.governance.submitWorkflow('feedback', { a: 1 });
    await gated.services.governance.submitOutcome({ taskType: 'x' });
    expect(gated.governance.submissions).toHaveLength(2);
  });

  it('keeps an absent measures service absent rather than inventing one', () => {
    const bundle: IFrontDoorServices = createTestFrontDoor({}).value.services;
    expect(bundle.programMeasures).toBeUndefined();
    expect(gateServices(bundle, resolved('operator')).services.programMeasures).toBeUndefined();
  });

  it('never names a group, a role or a list in the refusal', async () => {
    const gated: IGatedServices & IFakes = build(resolved());
    const result: IUsageMetricsResult = await gated.services.usage.getMetrics();
    const text: string = `${result.message} ${result.userMessage ?? ''}`.toLowerCase();
    for (const word of ['operator', 'group', 'role', 'list']) {
      expect({ word, present: text.indexOf(word) >= 0 }).toEqual({ word, present: false });
    }
  });
});

/**
 * The capability gate. The cases that matter are the negative ones: a denied caller must not reach the service at
 * all, and an unresolved membership must not pass anything that needs a role.
 */
import { CAPABILITIES, decide, gated, isOpenToEveryone, isRefused, rolesFor } from './authorization';
import type { Capability, IDecision, IRefused } from './authorization';
import type { RoleId } from '../content/roles';
import type { IRoleResolution } from './roleResolver';

function resolved(...roles: RoleId[]): IRoleResolution {
  return { roles: ['employee', ...roles.filter((role: RoleId): boolean => role !== 'employee')], resolution: 'resolved' };
}

function unresolved(...roles: RoleId[]): IRoleResolution {
  return { roles: ['employee', ...roles.filter((role: RoleId): boolean => role !== 'employee')], resolution: 'unresolved' };
}

describe('capability gate', () => {
  it('lets everyone signed in do their own work', () => {
    for (const capability of ['readOwnRequests', 'submitRequest', 'recordOutcome'] as Capability[]) {
      expect({ capability, open: isOpenToEveryone(capability) }).toEqual({ capability, open: true });
      expect(decide(capability, resolved()).allowed).toBe(true);
    }
  });

  it('refuses the operator surfaces to an employee, and says so without naming a group or a role', () => {
    for (const capability of ['readAdminQueue', 'readUsageTelemetry'] as Capability[]) {
      const decision: IDecision = decide(capability, resolved());
      expect({ capability, allowed: decision.allowed }).toEqual({ capability, allowed: false });
      if (!decision.allowed) {
        expect(decision.reason).toBe('notInRole');
        // A denial must not leak the shape of the permission model to someone who failed it.
        expect(decision.message.toLowerCase()).not.toContain('operator');
        expect(decision.message.toLowerCase()).not.toContain('group');
        expect(decision.message.toLowerCase()).not.toContain('role');
      }
    }
  });

  it('gives the measured view to a leader and to an operator, and the queue only to an operator', () => {
    expect(decide('readProgramMeasures', resolved('leader')).allowed).toBe(true);
    expect(decide('readProgramMeasures', resolved('operator')).allowed).toBe(true);
    expect(decide('readAdminQueue', resolved('operator')).allowed).toBe(true);
    // A leader is deliberately not given the queue: it carries other people's request text.
    expect(decide('readAdminQueue', resolved('leader')).allowed).toBe(false);
    expect(rolesFor('readAdminQueue')).toEqual(['operator']);
  });

  it('fails closed while the membership is unresolved, however many roles the resolution claims', () => {
    // The resolver never widens on a failed read, but if it ever did, the gate still refuses.
    for (const capability of CAPABILITIES.filter((c: Capability): boolean => !isOpenToEveryone(c))) {
      const decision: IDecision = decide(capability, unresolved('operator', 'leader', 'designAuthority'));
      expect({ capability, allowed: decision.allowed }).toEqual({ capability, allowed: false });
      if (!decision.allowed) {
        expect(decision.reason).toBe('membershipUnresolved');
      }
    }
    // What everyone may do is still allowed, so an unconfirmed membership never blocks a person's own work.
    expect(decide('submitRequest', unresolved()).allowed).toBe(true);
  });

  it('never calls the service when the capability is refused', async () => {
    let called: number = 0;
    const call = async (): Promise<string> => {
      called += 1;
      return 'rows';
    };
    const result: string | IRefused = await gated('readAdminQueue', resolved(), call);
    expect(called).toBe(0);
    expect(isRefused(result)).toBe(true);
    if (isRefused(result)) {
      expect(result.state).toBe('denied');
    }
  });

  it('calls the service exactly once when the capability is allowed, and hands its answer back untouched', async () => {
    let called: number = 0;
    const call = async (): Promise<string> => {
      called += 1;
      return 'rows';
    };
    const result: string | IRefused = await gated('readAdminQueue', resolved('operator'), call);
    expect(called).toBe(1);
    expect(result).toBe('rows');
    expect(isRefused(result)).toBe(false);
  });

  it('holds the Marketing drafting and review capabilities to the two approving roles', () => {
    const marketing: Capability[] = ['draftCampaignBrief', 'draftContentPlan', 'draftMeetingFollowThrough', 'decideMarketingReview'];
    for (const capability of marketing) {
      expect({ capability, roles: rolesFor(capability).slice() }).toEqual({ capability, roles: ['operator', 'designAuthority'] });
      expect(decide(capability, resolved()).allowed).toBe(false);
      expect(decide(capability, resolved('leader')).allowed).toBe(false);
      expect(decide(capability, resolved('designAuthority')).allowed).toBe(true);
    }
  });

  it('declares a role list for every capability, so a new one cannot default to open', () => {
    for (const capability of CAPABILITIES) {
      expect({ capability, declared: rolesFor(capability).length > 0 }).toEqual({ capability, declared: true });
    }
  });
});

/**
 * Command-key adapter: the cases that matter are isolation, payload-only digest, Title length and intent fit.
 */
import { businessPayloadOf, deriveCommandKey, readCommandKey, sameCommand, SHAREPOINT_TITLE_MAX } from './commandKey';
import type { ICommandKey } from './commandKey';

const SCOPE: string = 'https://contoso.sharepoint.com/sites/ai';
const CALLER: string = 'pat@contoso.com';

describe('command-key adapter cmdk1', () => {
  it('derives a Title-safe key whose digest ignores Context', async () => {
    const payload: unknown = { S1: { Title: 'A', SourceChannel: 'FRONT_DOOR' }, WorkID: null };
    const first: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: SCOPE,
      callerId: CALLER,
      operation: 'CreateOrResumeWork',
      intent: { kind: 'mutation' },
      workId: null,
      businessPayload: payload
    });
    const second: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: SCOPE,
      callerId: CALLER,
      operation: 'CreateOrResumeWork',
      intent: { kind: 'mutation' },
      workId: null,
      businessPayload: payload
    });
    expect(first).toBeDefined();
    expect(second?.key).toBe(first?.key);
    expect(first!.key.indexOf('cmdk1:')).toBe(0);
    expect(first!.key.length).toBeLessThanOrEqual(SHAREPOINT_TITLE_MAX);
    expect(first!.key.length).toBeGreaterThanOrEqual(8);
    expect(readCommandKey(first!.key)?.operation).toBe('CreateOrResumeWork');
  });

  it('changes the key when the business payload changes, not when correlation changes', async () => {
    const a: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: SCOPE,
      callerId: CALLER,
      operation: 'CreateOrResumeWork',
      intent: { kind: 'mutation' },
      workId: null,
      businessPayload: businessPayloadOf({ Context: { CorrelationID: 'CORR-A' }, S1: { Title: 'One' }, WorkID: null })
    });
    const b: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: SCOPE,
      callerId: CALLER,
      operation: 'CreateOrResumeWork',
      intent: { kind: 'mutation' },
      workId: null,
      businessPayload: businessPayloadOf({ Context: { CorrelationID: 'CORR-B' }, S1: { Title: 'One' }, WorkID: null })
    });
    const c: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: SCOPE,
      callerId: CALLER,
      operation: 'CreateOrResumeWork',
      intent: { kind: 'mutation' },
      workId: null,
      businessPayload: businessPayloadOf({ Context: { CorrelationID: 'CORR-A' }, S1: { Title: 'Two' }, WorkID: null })
    });
    expect(a?.digest).toBe(b?.digest);
    expect(a?.digest).not.toBe(c?.digest);
  });

  it('isolates two callers and two sites, so a collision is a visible refusal rather than a replay', async () => {
    const input = {
      operation: 'CreateOrResumeWork' as const,
      intent: { kind: 'mutation' as const },
      workId: null,
      businessPayload: { S1: { Title: 'Same' } }
    };
    const pat: ICommandKey | undefined = await deriveCommandKey({ ...input, tenantScope: SCOPE, callerId: 'pat@contoso.com' });
    const sam: ICommandKey | undefined = await deriveCommandKey({ ...input, tenantScope: SCOPE, callerId: 'sam@contoso.com' });
    const otherSite: ICommandKey | undefined = await deriveCommandKey({ ...input, tenantScope: 'https://other.sharepoint.com/sites/ai', callerId: 'pat@contoso.com' });
    expect(pat?.caller8).not.toBe(sam?.caller8);
    expect(pat?.scope8).not.toBe(otherSite?.scope8);
    expect(pat?.key).not.toBe(sam?.key);
  });

  it('mints a new generation for a refresh read and keeps the same generation for a retry of that read', async () => {
    const payload: unknown = { WorkID: 'CW-LOCAL_0001' };
    const first: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: SCOPE,
      callerId: CALLER,
      operation: 'GetWorkStatus',
      intent: { kind: 'read', generation: 1 },
      workId: 'CW-LOCAL_0001',
      businessPayload: payload
    });
    const retry: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: SCOPE,
      callerId: CALLER,
      operation: 'GetWorkStatus',
      intent: { kind: 'read', generation: 1 },
      workId: 'CW-LOCAL_0001',
      businessPayload: payload
    });
    const refresh: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: SCOPE,
      callerId: CALLER,
      operation: 'GetWorkStatus',
      intent: { kind: 'read', generation: 2 },
      workId: 'CW-LOCAL_0001',
      businessPayload: payload
    });
    expect(first?.key).toBe(retry?.key);
    expect(refresh?.key).not.toBe(first?.key);
    expect(readCommandKey(refresh!.key)?.intent).toEqual({ kind: 'read', generation: 2 });
  });

  it('refuses a mutation intent on a read operation', async () => {
    await expect(
      deriveCommandKey({
        tenantScope: SCOPE,
        callerId: CALLER,
        operation: 'GetWorkStatus',
        intent: { kind: 'mutation' },
        workId: 'CW-LOCAL_0001',
        businessPayload: { WorkID: 'CW-LOCAL_0001' }
      })
    ).rejects.toThrow(/does not fit operation/);
  });

  it('treats a recovered row with a different business payload as a collision, not a pass', async () => {
    const expected: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: SCOPE,
      callerId: CALLER,
      operation: 'CreateOrResumeWork',
      intent: { kind: 'mutation' },
      workId: null,
      businessPayload: { S1: { Title: 'One' }, WorkID: null }
    });
    const same = await sameCommand(expected!, {
      title: expected!.key,
      operation: 'CreateOrResumeWork',
      requestJson: JSON.stringify({ Context: { CorrelationID: 'CORR-X' }, S1: { Title: 'Other' }, WorkID: null })
    });
    expect(same.same).toBe(false);
    expect(same.reason).toContain('business payload differs');
  });
});

import { act, render } from '@testing-library/react';
import * as React from 'react';
import { createFakeGovernanceService, FAKE_INTAKE_ID, InMemoryDraftStore } from '../../../testing/fakeServices';
import type { IFakeGovernanceService, IRecordedSubmission } from '../../../testing/fakeServices';
import { createBranding } from '../branding/branding';
import { DurableSubmissionService } from '../services/durableSubmissionService';
import type { IAdminDashboardData, IGovernanceService, ISubmissionResult, ISubmitOptions } from '../services/types';
import type { SubmissionPieceType, SubmissionWorkflowType } from '../workflows/types';
import { SubmissionProvider, useSubmission } from './SubmissionContext';
import type { ISubmissionContextValue } from './SubmissionContext';

let latest: ISubmissionContextValue | undefined;

function Probe(): React.ReactElement {
  latest = useSubmission();
  return <></>;
}

function context(): ISubmissionContextValue {
  if (latest === undefined) {
    throw new Error('The probe has not rendered.');
  }
  return latest;
}

function mount(governance: IGovernanceService): void {
  render(
    <SubmissionProvider governanceService={governance}>
      <Probe />
    </SubmissionProvider>
  );
}

/** The list behind the recovery record: it accepts without confirming back until told to confirm, and keeps the reference it is given. */
class ConfirmingList implements IGovernanceService {
  public readonly calls: IRecordedSubmission[] = [];
  public confirms: boolean = false;

  public async submitWorkflow(workflowType: SubmissionWorkflowType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    return this._answer(workflowType, payload, options);
  }

  public async submitOutcome(payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    return this._answer('outcome', payload, options);
  }

  public getAdminDashboardData(): Promise<IAdminDashboardData> {
    return Promise.reject(new Error('Not used by these tests.'));
  }

  private async _answer(workflowType: SubmissionPieceType, payload: unknown, options: ISubmitOptions | undefined): Promise<ISubmissionResult> {
    this.calls.push({ workflowType, payload, intakeId: options?.intakeId });
    return this.confirms
      ? { connected: true, state: 'saved', intakeId: options?.intakeId, message: 'Saved.' }
      : { connected: false, state: 'pending', intakeId: options?.intakeId, message: 'Accepted, not read back.' };
  }
}

/** The phase of the server recovery record the durable service keeps beside the drafts. */
function recordPhase(store: InMemoryDraftStore): string {
  return (JSON.parse(store.drafts.submission_last) as { phase: string }).phase;
}

const HELP: object = { helpCategory: 'new' };
const FEEDBACK: object = { summary: 'Example feedback' };

const PENDING: ISubmissionResult = {
  connected: false,
  state: 'pending',
  intakeId: 'OVT-AICOE-20260911-PENDING1',
  message: 'SharePoint accepted the AI CoE record OVT-AICOE-20260911-PENDING1 but did not confirm it back.',
  failureClass: 'INCONCLUSIVE',
  userMessage: 'Saved, not yet confirmed.'
};

describe('SubmissionProvider', () => {
  beforeEach((): void => {
    latest = undefined;
  });

  it('starts with no result and no attempt', () => {
    mount(createFakeGovernanceService());
    expect(context().lastResult).toBeUndefined();
    expect(context().lastAttempt).toBeUndefined();
  });

  it('submit hands the service no identifier on a first attempt and stores the result and the attempt', async () => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    mount(governance);
    const payload: object = { text: 'first' };
    let returned: ISubmissionResult | undefined;
    await act(async (): Promise<void> => {
      returned = await context().submit('feedback', payload);
    });
    expect(returned).toBe(governance.result);
    expect(context().lastResult).toBe(governance.result);
    expect(context().lastAttempt).toEqual({ workflowType: 'feedback', payload, intakeId: FAKE_INTAKE_ID });
    expect(governance.submissions).toEqual([{ workflowType: 'feedback', payload, intakeId: undefined }]);
  });

  it('retryLast resubmits the same payload under the same identifier and stores the new result', async () => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    governance.result = PENDING;
    mount(governance);
    const payload: object = { helpCategory: 'new' };
    await act(async (): Promise<void> => {
      await context().submit('helpTraining', payload);
    });
    expect(context().lastResult).toBe(PENDING);
    expect(context().lastAttempt).toEqual({ workflowType: 'helpTraining', payload, intakeId: 'OVT-AICOE-20260911-PENDING1' });

    const saved: ISubmissionResult = { connected: true, state: 'saved', intakeId: 'OVT-AICOE-20260911-PENDING1', message: 'Submission received and added to the AI CoE service queue.' };
    governance.result = saved;
    let retried: ISubmissionResult | undefined;
    await act(async (): Promise<void> => {
      retried = await context().retryLast();
    });
    expect(governance.submissions).toEqual([
      { workflowType: 'helpTraining', payload, intakeId: undefined },
      { workflowType: 'helpTraining', payload, intakeId: 'OVT-AICOE-20260911-PENDING1' }
    ]);
    expect(retried).toBe(saved);
    expect(context().lastResult).toBe(saved);
    expect(context().lastAttempt).toEqual({ workflowType: 'helpTraining', payload, intakeId: 'OVT-AICOE-20260911-PENDING1' });
  });

  it('keeps the identifier of a failed attempt so the retry can find a row the failure may have left', async () => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    governance.result = { connected: false, state: 'failed', intakeId: 'OVT-AICOE-20260911-FAILED01', message: 'no', failureClass: 'TRANSIENT', userMessage: 'Not available right now; try again.' };
    mount(governance);
    await act(async (): Promise<void> => {
      await context().submit('idea', { originalAnswers: {} });
    });
    await act(async (): Promise<void> => {
      await context().retryLast();
    });
    expect(governance.submissions.map((submission): string | undefined => submission.intakeId)).toEqual([undefined, 'OVT-AICOE-20260911-FAILED01']);
  });

  it('retryLast submits nothing and answers undefined when nothing was attempted', async () => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    mount(governance);
    let retried: ISubmissionResult | undefined = PENDING;
    await act(async (): Promise<void> => {
      retried = await context().retryLast();
    });
    expect(retried).toBeUndefined();
    expect(governance.submissions).toEqual([]);
    expect(context().lastResult).toBeUndefined();
  });

  it('a fresh submit after a retry starts a new attempt without the old identifier', async () => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    governance.result = PENDING;
    mount(governance);
    await act(async (): Promise<void> => {
      await context().submit('feedback', { a: 1 });
      await context().retryLast();
    });
    governance.result = { connected: true, intakeId: 'OVT-AICOE-20260911-SECOND02', message: 'ok' };
    await act(async (): Promise<void> => {
      await context().submit('feedback', { a: 2 });
    });
    expect(governance.submissions.map((submission): string | undefined => submission.intakeId)).toEqual([undefined, 'OVT-AICOE-20260911-PENDING1', undefined]);
    expect(context().lastAttempt).toEqual({ workflowType: 'feedback', payload: { a: 2 }, intakeId: 'OVT-AICOE-20260911-SECOND02' });
  });

  it('keeps a new submission as the service prepares it, and sends its retry as kept, without preparing it again', async () => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    governance.result = PENDING;
    const prepared: object = { ...HELP, reviewPriority: { level: 'executive', reason: 'Prepared by the service.' } };
    const prepare: jest.Mock = jest.fn((): unknown => prepared);
    governance.prepareSubmission = prepare;
    mount(governance);
    await act(async (): Promise<void> => {
      await context().submit('helpTraining', HELP);
    });
    await act(async (): Promise<void> => {
      await context().retryLast();
    });
    expect(prepare.mock.calls).toEqual([['helpTraining', HELP]]);
    expect(context().lastAttempt).toEqual({ workflowType: 'helpTraining', payload: prepared, intakeId: PENDING.intakeId });
    expect(governance.submissions).toEqual([
      { workflowType: 'helpTraining', payload: prepared, intakeId: undefined },
      { workflowType: 'helpTraining', payload: prepared, intakeId: PENDING.intakeId }
    ]);
  });

  describe('behind the server recovery record', () => {
    it('Confirm again completes the earlier attempt the record holds, instead of resending a refused form under its reference', async () => {
      const list: ConfirmingList = new ConfirmingList();
      const store: InMemoryDraftStore = new InMemoryDraftStore();
      mount(new DurableSubmissionService(list, store));
      await act(async (): Promise<void> => {
        await context().submit('helpTraining', HELP);
      });
      const earlier: string | undefined = list.calls[0].intakeId;
      let refused: ISubmissionResult | undefined;
      await act(async (): Promise<void> => {
        refused = await context().submit('feedback', FEEDBACK);
      });
      expect(refused).toMatchObject({ state: 'pending', intakeId: earlier });
      expect(list.calls).toHaveLength(1);

      list.confirms = true;
      let retried: ISubmissionResult | undefined;
      await act(async (): Promise<void> => {
        retried = await context().retryLast();
      });
      expect(list.calls[1]).toEqual({ workflowType: 'helpTraining', payload: HELP, intakeId: earlier });
      expect(recordPhase(store)).toBe('completed');
      // The outcome belongs to the earlier attempt, so the form on screen must not settle its own draft with it.
      expect(retried).toMatchObject({ state: 'saved', intakeId: earlier, earlierAttempt: true });
      expect(context().lastAttempt).toEqual({ workflowType: 'helpTraining', payload: HELP, intakeId: earlier, earlier: true });

      let sent: ISubmissionResult | undefined;
      await act(async (): Promise<void> => {
        sent = await context().submit('feedback', FEEDBACK);
      });
      expect(sent?.state).toBe('saved');
      expect(sent?.earlierAttempt).toBeUndefined();
      expect(sent?.intakeId).not.toBe(earlier);
      expect(list.calls[2]).toEqual({ workflowType: 'feedback', payload: FEEDBACK, intakeId: sent?.intakeId });
    });

    it('never sends a refused form under the earlier reference, even once that attempt was completed elsewhere', async () => {
      const list: ConfirmingList = new ConfirmingList();
      const store: InMemoryDraftStore = new InMemoryDraftStore();
      mount(new DurableSubmissionService(list, store));
      await act(async (): Promise<void> => {
        await context().submit('helpTraining', HELP);
        await context().submit('feedback', FEEDBACK);
      });
      const earlier: string | undefined = list.calls[0].intakeId;
      list.confirms = true;
      // Another tab confirms the earlier attempt from the same record.
      await new DurableSubmissionService(list, store).submitWorkflow('helpTraining', HELP, { intakeId: earlier });

      await act(async (): Promise<void> => {
        await context().retryLast();
      });

      expect(list.calls.filter((call: IRecordedSubmission): boolean => call.workflowType === 'feedback')).toEqual([]);
    });

    it('keeps a refused form apart from the earlier reference when the record cannot be read', async () => {
      const governance: IFakeGovernanceService = createFakeGovernanceService();
      governance.result = { connected: false, state: 'pending', intakeId: 'OVT-AICOE-20260929-EARLIER1', earlierAttempt: true, message: 'Confirm the earlier attempt first.' };
      mount(governance);
      await act(async (): Promise<void> => {
        await context().submit('feedback', FEEDBACK);
      });
      expect(context().lastAttempt).toEqual({ workflowType: 'feedback', payload: FEEDBACK });

      await act(async (): Promise<void> => {
        await context().retryLast();
      });
      expect(governance.submissions.map((submission: IRecordedSubmission): string | undefined => submission.intakeId)).toEqual([undefined, undefined]);
    });
  });

  it('outside a provider the offline value reports not connected and retries nothing, as the shipped build did', async () => {
    render(<Probe />);
    const result: ISubmissionResult = await context().submit('feedback', {});
    expect(result).toEqual({ connected: false, message: createBranding('').offlineServiceMessage });
    expect(await context().retryLast()).toBeUndefined();
    expect(context().lastResult).toBeUndefined();
    expect(context().lastAttempt).toBeUndefined();
  });
});

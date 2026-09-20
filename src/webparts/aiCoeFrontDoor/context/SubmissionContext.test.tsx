import { act, render } from '@testing-library/react';
import * as React from 'react';
import { createFakeGovernanceService, FAKE_INTAKE_ID } from '../../../testing/fakeServices';
import type { IFakeGovernanceService } from '../../../testing/fakeServices';
import { createBranding } from '../branding/branding';
import type { ISubmissionResult } from '../services/types';
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

function mount(governance: IFakeGovernanceService): void {
  render(
    <SubmissionProvider governanceService={governance}>
      <Probe />
    </SubmissionProvider>
  );
}

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

  it('outside a provider the offline value reports not connected and retries nothing, as the shipped build did', async () => {
    render(<Probe />);
    const result: ISubmissionResult = await context().submit('feedback', {});
    expect(result).toEqual({ connected: false, message: createBranding('').offlineServiceMessage });
    expect(await context().retryLast()).toBeUndefined();
    expect(context().lastResult).toBeUndefined();
    expect(context().lastAttempt).toBeUndefined();
  });
});

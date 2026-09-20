import * as React from 'react';
import { createBranding } from '../branding/branding';
import type { IGovernanceService, ISubmissionResult } from '../services/types';
import type { SubmissionWorkflowType } from '../workflows/types';

/** What was last sent: enough to send it again under the same identifier. */
export interface ISubmissionAttempt {
  workflowType: SubmissionWorkflowType;
  payload: unknown;
  /** The identifier the service gave the attempt; a retry hands it back so the rows are found, not written twice. */
  intakeId?: string;
}

export interface ISubmissionContextValue {
  /** Outcome of the most recent submission from this web part instance; shown by the result panel. */
  lastResult: ISubmissionResult | undefined;
  /** The most recent submission itself, kept for `retryLast`. */
  lastAttempt: ISubmissionAttempt | undefined;
  submit(workflowType: SubmissionWorkflowType, payload: unknown): Promise<ISubmissionResult>;
  /** Sends the last attempt again under its identifier (a pending or failed record completes, nothing duplicates); undefined when nothing was attempted. */
  retryLast(): Promise<ISubmissionResult | undefined>;
}

/** Used only when no provider is mounted, i.e. outside the web part; the shipped build behaved the same. */
const OFFLINE: ISubmissionContextValue = {
  lastResult: undefined,
  lastAttempt: undefined,
  submit: async (): Promise<ISubmissionResult> => ({ connected: false, message: createBranding('').offlineServiceMessage }),
  retryLast: async (): Promise<ISubmissionResult | undefined> => undefined
};

export const SubmissionContext: React.Context<ISubmissionContextValue> = React.createContext<ISubmissionContextValue>(OFFLINE);

export interface ISubmissionProviderProps {
  governanceService: IGovernanceService;
  children?: React.ReactNode;
}

/** Routes submissions to the governance service and remembers the last outcome and attempt for the result panel. */
export function SubmissionProvider({ governanceService, children }: ISubmissionProviderProps): React.ReactElement {
  const [lastResult, setLastResult] = React.useState<ISubmissionResult | undefined>(undefined);
  const [lastAttempt, setLastAttempt] = React.useState<ISubmissionAttempt | undefined>(undefined);
  // The retry reads the attempt through a ref so a handler created before the state settled still sees it.
  const attemptRef: React.MutableRefObject<ISubmissionAttempt | undefined> = React.useRef<ISubmissionAttempt | undefined>(undefined);

  const run = React.useCallback(
    async (workflowType: SubmissionWorkflowType, payload: unknown, intakeId: string | undefined): Promise<ISubmissionResult> => {
      const result: ISubmissionResult =
        intakeId === undefined ? await governanceService.submitWorkflow(workflowType, payload) : await governanceService.submitWorkflow(workflowType, payload, { intakeId });
      const attempt: ISubmissionAttempt = { workflowType, payload, intakeId: result.intakeId !== undefined ? result.intakeId : intakeId };
      attemptRef.current = attempt;
      setLastAttempt(attempt);
      setLastResult(result);
      return result;
    },
    [governanceService]
  );
  const submit = React.useCallback((workflowType: SubmissionWorkflowType, payload: unknown): Promise<ISubmissionResult> => run(workflowType, payload, undefined), [run]);
  const retryLast = React.useCallback(async (): Promise<ISubmissionResult | undefined> => {
    const attempt: ISubmissionAttempt | undefined = attemptRef.current;
    return attempt === undefined ? undefined : run(attempt.workflowType, attempt.payload, attempt.intakeId);
  }, [run]);
  const value: ISubmissionContextValue = React.useMemo(
    (): ISubmissionContextValue => ({ lastResult, lastAttempt, submit, retryLast }),
    [lastResult, lastAttempt, submit, retryLast]
  );
  return <SubmissionContext.Provider value={value}>{children}</SubmissionContext.Provider>;
}

export function useSubmission(): ISubmissionContextValue {
  return React.useContext(SubmissionContext);
}

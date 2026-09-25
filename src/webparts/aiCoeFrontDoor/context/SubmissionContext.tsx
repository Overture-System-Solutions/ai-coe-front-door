import * as React from 'react';
import { createBranding } from '../branding/branding';
import type { IGovernanceService, ISubmissionResult } from '../services/types';
import type { SubmissionPieceType } from '../workflows/types';

/** What was last sent: enough to send it again under the same identifier. */
export interface ISubmissionAttempt {
  workflowType: SubmissionPieceType;
  payload: unknown;
  /** The identifier the service gave the attempt; a retry hands it back so the rows are found, not written twice. */
  intakeId?: string;
}

export interface ISubmissionContextValue {
  /** Outcome of the most recent submission from this web part instance; shown by the result panel. */
  lastResult: ISubmissionResult | undefined;
  /** The most recent submission itself, kept for `retryLast`. */
  lastAttempt: ISubmissionAttempt | undefined;
  submit(workflowType: SubmissionPieceType, payload: unknown): Promise<ISubmissionResult>;
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

  React.useEffect((): (() => void) => {
    let mounted: boolean = true;
    if (governanceService.restoreSubmission !== undefined) {
      governanceService.restoreSubmission().then((restored): void => {
        if (mounted && restored !== undefined && attemptRef.current === undefined) {
          attemptRef.current = restored.attempt;
          setLastAttempt(restored.attempt);
          setLastResult(restored.result);
        }
      }).catch((): void => {
        if (mounted && attemptRef.current === undefined) {
          setLastResult({ connected: false, state: 'failed', message: 'The server recovery record could not be read. Do not resubmit an uncertain request until it can be confirmed.' });
        }
      });
    }
    return (): void => { mounted = false; };
  }, [governanceService]);

  const run = React.useCallback(
    async (workflowType: SubmissionPieceType, payload: unknown, intakeId: string | undefined): Promise<ISubmissionResult> => {
      // The outcome record is a list of its own with no submission payload in it, so it has a method of its own; the
      // five shipped workflows take exactly the route they took before (decision 16).
      const options: { intakeId: string } | undefined = intakeId === undefined ? undefined : { intakeId };
      const result: ISubmissionResult =
        workflowType === 'outcome' ? await governanceService.submitOutcome(payload, options) : await governanceService.submitWorkflow(workflowType, payload, options);
      const attempt: ISubmissionAttempt = { workflowType, payload, intakeId: result.intakeId !== undefined ? result.intakeId : intakeId };
      attemptRef.current = attempt;
      setLastAttempt(attempt);
      setLastResult(result);
      return result;
    },
    [governanceService]
  );
  const submit = React.useCallback((workflowType: SubmissionPieceType, payload: unknown): Promise<ISubmissionResult> => run(workflowType, payload, undefined), [run]);
  const retryLast = React.useCallback(async (): Promise<ISubmissionResult | undefined> => {
    const restored = attemptRef.current === undefined ? await governanceService.restoreSubmission?.() : undefined;
    const attempt: ISubmissionAttempt | undefined = attemptRef.current ?? restored?.attempt;
    return attempt === undefined ? undefined : run(attempt.workflowType, attempt.payload, attempt.intakeId);
  }, [run, governanceService]);
  const value: ISubmissionContextValue = React.useMemo(
    (): ISubmissionContextValue => ({ lastResult, lastAttempt, submit, retryLast }),
    [lastResult, lastAttempt, submit, retryLast]
  );
  return <SubmissionContext.Provider value={value}>{children}</SubmissionContext.Provider>;
}

export function useSubmission(): ISubmissionContextValue {
  return React.useContext(SubmissionContext);
}

import * as React from 'react';
import { createBranding } from '../branding/branding';
import type { IGovernanceService, IRecoveredSubmission, ISubmissionResult } from '../services/types';
import type { SubmissionPieceType } from '../workflows/types';

/** What was last sent: enough to send it again under the same identifier. */
export interface ISubmissionAttempt {
  workflowType: SubmissionPieceType;
  payload: unknown;
  /** The identifier the service gave the attempt; a retry hands it back so the rows are found, not written twice. */
  intakeId?: string;
  /**
   * True when this is not what the person sent but the earlier attempt the server recovery record holds, which
   * refused their submission until it is confirmed. A retry completes that attempt; its results are marked
   * `earlierAttempt`, so the form on screen never settles its own draft with them.
   */
  earlier?: boolean;
}

export interface ISubmissionContextValue {
  /** Outcome of the most recent submission from this web part instance; shown by the result panel. */
  lastResult: ISubmissionResult | undefined;
  /** The most recent submission itself, kept for `retryLast`. */
  lastAttempt: ISubmissionAttempt | undefined;
  submit(workflowType: SubmissionPieceType, payload: unknown): Promise<ISubmissionResult>;
  /**
   * Sends the last attempt again under its identifier (a pending or failed record completes, nothing duplicates);
   * when the recovery record refused the last submission, that is the earlier attempt it holds. Undefined when
   * nothing was attempted.
   */
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

  /**
   * The attempt a retry sends after `result`. A refusal in favour of an earlier attempt adopts that attempt from the
   * recovery record when it reads back under the refusal's reference. Otherwise the refused attempt stays as it was:
   * never paired with the earlier reference, since a retry under it would find the earlier rows and call these saved.
   */
  const nextAttempt = React.useCallback(
    async (attempt: ISubmissionAttempt, result: ISubmissionResult): Promise<ISubmissionAttempt> => {
      if (result.earlierAttempt !== true) {
        return { ...attempt, intakeId: result.intakeId !== undefined ? result.intakeId : attempt.intakeId };
      }
      const restored: IRecoveredSubmission | undefined = await governanceService.restoreSubmission?.().catch((): undefined => undefined);
      return restored !== undefined && restored.attempt.intakeId === result.intakeId ? { ...restored.attempt, earlier: true } : attempt;
    },
    [governanceService]
  );

  const run = React.useCallback(
    async (attempt: ISubmissionAttempt): Promise<ISubmissionResult> => {
      const { workflowType, payload, intakeId } = attempt;
      // The outcome record is a list of its own with no submission payload in it, so it has a method of its own; the
      // five shipped workflows take exactly the route they took before (decision 16).
      const options: { intakeId: string } | undefined = intakeId === undefined ? undefined : { intakeId };
      const sent: ISubmissionResult =
        workflowType === 'outcome' ? await governanceService.submitOutcome(payload, options) : await governanceService.submitWorkflow(workflowType, payload, options);
      // Whatever an earlier attempt comes to says nothing about the answers on screen.
      const result: ISubmissionResult = attempt.earlier === true && sent.earlierAttempt !== true ? { ...sent, earlierAttempt: true } : sent;
      const next: ISubmissionAttempt = await nextAttempt(attempt, sent);
      attemptRef.current = next;
      setLastAttempt(next);
      setLastResult(result);
      return result;
    },
    [governanceService, nextAttempt]
  );
  // A new attempt is kept as the service prepares it, so a retry, never prepared again, sends what the first recorded.
  const submit = React.useCallback(
    (workflowType: SubmissionPieceType, payload: unknown): Promise<ISubmissionResult> =>
      run({ workflowType, payload: governanceService.prepareSubmission === undefined ? payload : governanceService.prepareSubmission(workflowType, payload) }),
    [run, governanceService]
  );
  const retryLast = React.useCallback(async (): Promise<ISubmissionResult | undefined> => {
    const restored = attemptRef.current === undefined ? await governanceService.restoreSubmission?.() : undefined;
    const attempt: ISubmissionAttempt | undefined = attemptRef.current ?? restored?.attempt;
    return attempt === undefined ? undefined : run(attempt);
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

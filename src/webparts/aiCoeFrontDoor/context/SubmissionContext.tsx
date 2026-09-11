import * as React from 'react';
import { createBranding } from '../branding/branding';
import type { IGovernanceService, ISubmissionResult } from '../services/types';
import type { SubmissionWorkflowType } from '../workflows/types';

export interface ISubmissionContextValue {
  /** Outcome of the most recent submission from this web part instance; shown by the result panel. */
  lastResult: ISubmissionResult | undefined;
  submit(workflowType: SubmissionWorkflowType, payload: unknown): Promise<ISubmissionResult>;
}

/** Used only when no provider is mounted, i.e. outside the web part; the shipped build behaved the same. */
const OFFLINE: ISubmissionContextValue = {
  lastResult: undefined,
  submit: async (): Promise<ISubmissionResult> => ({ connected: false, message: createBranding('').offlineServiceMessage })
};

export const SubmissionContext: React.Context<ISubmissionContextValue> = React.createContext<ISubmissionContextValue>(OFFLINE);

export interface ISubmissionProviderProps {
  governanceService: IGovernanceService;
  children?: React.ReactNode;
}

/** Routes submissions to the governance service and remembers the last outcome for the result panel. */
export function SubmissionProvider({ governanceService, children }: ISubmissionProviderProps): React.ReactElement {
  const [lastResult, setLastResult] = React.useState<ISubmissionResult | undefined>(undefined);
  const submit = React.useCallback(
    async (workflowType: SubmissionWorkflowType, payload: unknown): Promise<ISubmissionResult> => {
      const result: ISubmissionResult = await governanceService.submitWorkflow(workflowType, payload);
      setLastResult(result);
      return result;
    },
    [governanceService]
  );
  const value: ISubmissionContextValue = React.useMemo((): ISubmissionContextValue => ({ lastResult, submit }), [lastResult, submit]);
  return <SubmissionContext.Provider value={value}>{children}</SubmissionContext.Provider>;
}

export function useSubmission(): ISubmissionContextValue {
  return React.useContext(SubmissionContext);
}

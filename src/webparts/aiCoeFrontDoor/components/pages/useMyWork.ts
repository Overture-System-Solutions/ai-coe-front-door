import * as React from 'react';
import type { IMyWorkResult, IMyWorkService } from '../../services/myWorkService';

export const NO_MY_WORK_SERVICE_TEXT: string = 'No request list service is configured.';

/** Where the person's own requests stand for the component reading them: on their way, or answered (rows, a refusal, or unavailable). */
export type MyWorkLoadState = { status: 'loading' } | { status: 'ready'; result: IMyWorkResult };

const NO_SERVICE_RESULT: IMyWorkResult = { state: 'unavailable', items: [], message: NO_MY_WORK_SERVICE_TEXT };

/**
 * Reads the person's own requests once per service when `enabled`. Without a service the list is
 * unavailable at once; without `enabled` nothing is read and the state stays loading (a strip with no
 * request item never asks). The service answers with a result, never an exception, so a late answer
 * after unmounting is simply dropped.
 */
export function useMyWork(service: IMyWorkService | undefined, enabled: boolean): MyWorkLoadState {
  const [state, setState] = React.useState<MyWorkLoadState>(service === undefined ? { status: 'ready', result: NO_SERVICE_RESULT } : { status: 'loading' });

  React.useEffect((): (() => void) => {
    if (service === undefined || !enabled) {
      return (): void => undefined;
    }
    let cancelled: boolean = false;
    service.getMine().then(
      (result: IMyWorkResult): void => {
        if (!cancelled) {
          setState({ status: 'ready', result });
        }
      },
      (): void => {
        if (!cancelled) {
          setState({ status: 'ready', result: { state: 'unavailable', items: [], message: '' } });
        }
      }
    );
    return (): void => {
      cancelled = true;
    };
  }, [service, enabled]);

  return state;
}

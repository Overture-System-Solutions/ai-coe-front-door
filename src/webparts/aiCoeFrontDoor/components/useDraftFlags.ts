import * as React from 'react';
import { WORKFLOW_ORDER } from '../content/workflows/catalog';
import type { IDraftStore } from '../services/draftStorage';
import type { DraftFlags } from './LandingPage';

/**
 * Discovers which workflows have a saved draft on this device, exactly as the legacy shell does when
 * it loads, so the home tiles can show their "Resume draft" badges. Disabled pieces get no badges.
 */
export function useDraftFlags(draftStore: IDraftStore, enabled: boolean): DraftFlags {
  const [drafts, setDrafts] = React.useState<DraftFlags>({});

  React.useEffect((): (() => void) => {
    if (!enabled) {
      return (): void => undefined;
    }
    let cancelled: boolean = false;
    const discover = async (): Promise<void> => {
      for (const workflowId of WORKFLOW_ORDER) {
        const draft: unknown = await draftStore.load<unknown>(workflowId);
        if (cancelled) {
          return;
        }
        if (draft !== undefined) {
          setDrafts((current: DraftFlags): DraftFlags => ({ ...current, [workflowId]: true }));
        }
      }
    };
    discover().catch((): void => undefined);
    return (): void => {
      cancelled = true;
    };
  }, [draftStore, enabled]);

  return drafts;
}

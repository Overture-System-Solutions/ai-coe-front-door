/**
 * Reads the roles of the signed-in person once per resolver: the pieces call it, the resolver makes
 * one request for the page and every caller shares that answer. Without a resolver (the legacy-only
 * test setups) the person keeps the employee role and the membership reads as unresolved, so nothing
 * claims a role it did not read. The resolver answers with a resolution, never an exception, so a
 * late answer after the piece is taken down is simply dropped.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import * as React from 'react';
import type { RoleId } from '../content/roles';
import type { IRoleResolution, IRoleResolver } from '../services/roleResolver';

/** Where the roles stand for the component reading them: on their way, or answered. */
export type RoleLoadState = { status: 'loading' } | { status: 'ready'; resolution: IRoleResolution };

/** What a page knows about a person whose membership was never read: they are an employee, and a site owner is also an operator. */
export function unresolvedRoles(isAdmin: boolean): IRoleResolution {
  const roles: RoleId[] = isAdmin ? ['employee', 'operator'] : ['employee'];
  return { roles, resolution: 'unresolved' };
}

export function useRoles(resolver: IRoleResolver | undefined, isAdmin: boolean): RoleLoadState {
  const [state, setState] = React.useState<RoleLoadState>(
    resolver === undefined ? { status: 'ready', resolution: unresolvedRoles(isAdmin) } : { status: 'loading' }
  );

  React.useEffect((): (() => void) => {
    if (resolver === undefined) {
      setState({ status: 'ready', resolution: unresolvedRoles(isAdmin) });
      return (): void => undefined;
    }
    let cancelled: boolean = false;
    resolver.resolve({ isAdmin }).then(
      (resolution: IRoleResolution): void => {
        if (!cancelled) {
          setState({ status: 'ready', resolution });
        }
      },
      (): void => {
        if (!cancelled) {
          setState({ status: 'ready', resolution: unresolvedRoles(isAdmin) });
        }
      }
    );
    return (): void => {
      cancelled = true;
    };
  }, [resolver, isAdmin]);

  return state;
}

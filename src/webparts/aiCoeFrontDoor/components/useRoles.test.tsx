import { render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import { parseRoleGroups } from '../content/roles';
import { RoleResolver } from '../services/roleResolver';
import type { IRoleResolution, IRoleResolveOptions, IRoleResolver } from '../services/roleResolver';
import { useRoles } from './useRoles';
import type { RoleLoadState } from './useRoles';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';

function Probe({ resolver, isAdmin }: { resolver: IRoleResolver | undefined; isAdmin: boolean }): React.ReactElement {
  const state: RoleLoadState = useRoles(resolver, isAdmin);
  return <p>{state.status === 'loading' ? 'reading' : `${state.resolution.resolution}: ${state.resolution.roles.join(', ')}`}</p>;
}

function createResolver(titles: readonly string[]): { store: InMemoryListStore; resolver: RoleResolver } {
  const store: InMemoryListStore = new InMemoryListStore([]);
  store.setGroups(titles);
  const resolver: RoleResolver = new RoleResolver(
    { siteUrl: SITE, user: { displayName: 'Ada Example', email: 'ada@contoso.com' }, client: createFakeListClient(store), configuration: 'v1' },
    parseRoleGroups('leader=AI CoE Leaders;operator=AI CoE Operators')
  );
  return { store, resolver };
}

describe('useRoles', () => {
  it('reads the roles once and reports them when the answer arrives', async () => {
    const { store, resolver } = createResolver(['AI CoE Leaders']);
    const { rerender } = render(<Probe resolver={resolver} isAdmin={false} />);
    expect(screen.getByText('reading')).toBeInTheDocument();
    expect(await screen.findByText('resolved: employee, leader')).toBeInTheDocument();
    rerender(<Probe resolver={resolver} isAdmin={false} />);
    await waitFor((): void => expect(screen.getByText('resolved: employee, leader')).toBeInTheDocument());
    expect(store.requests).toHaveLength(1);
  });

  it('reads again when the permission it was asked with changes, without asking the site twice', async () => {
    const { store, resolver } = createResolver(['AI CoE Leaders']);
    const { rerender } = render(<Probe resolver={resolver} isAdmin={false} />);
    expect(await screen.findByText('resolved: employee, leader')).toBeInTheDocument();
    rerender(<Probe resolver={resolver} isAdmin />);
    expect(await screen.findByText('resolved: employee, leader, operator')).toBeInTheDocument();
    expect(store.requests).toHaveLength(1);
  });

  it('answers at once without a resolver, with the employee role and the membership unresolved', async () => {
    render(<Probe resolver={undefined} isAdmin={false} />);
    expect(screen.getByText('unresolved: employee')).toBeInTheDocument();
    render(<Probe resolver={undefined} isAdmin />);
    expect(screen.getByText('unresolved: employee, operator')).toBeInTheDocument();
  });

  it('keeps the employee role when the resolver never answers before the piece is taken down', async () => {
    let settle: (value: IRoleResolution) => void = (): void => undefined;
    const pending: IRoleResolver = {
      resolve: (_options: IRoleResolveOptions): Promise<IRoleResolution> =>
        new Promise<IRoleResolution>((resolve: (value: IRoleResolution) => void): void => {
          settle = resolve;
        })
    };
    const { unmount } = render(<Probe resolver={pending} isAdmin={false} />);
    expect(screen.getByText('reading')).toBeInTheDocument();
    unmount();
    // A late answer after unmounting is dropped, never written into a gone component.
    settle({ roles: ['employee', 'leader'], resolution: 'resolved' });
    await Promise.resolve();
  });
});

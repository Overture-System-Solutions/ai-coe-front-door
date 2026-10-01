/**
 * The tabbed view's layout: Home without "What matters now" (1.0.0.18), Requests with the four request forms in their
 * own section above the person's own requests (1.0.0.19), Cases without the person's requests, and the explanatory
 * panels of Requests, Improvement and Cases behind one closed "What is going on?" disclosure (1.0.0.18).
 */
import * as React from 'react';
import { act, fireEvent } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { AppShell } from './AppShell';
import type { RoleId } from '../../content/roles';
import type { IRoleResolution, IRoleResolver } from '../../services/roleResolver';

function resolver(roles: RoleId[]): IRoleResolver {
  return { resolve: async (): Promise<IRoleResolution> => ({ roles, resolution: 'resolved' }) };
}

async function renderShell(roles: RoleId[] = ['employee'], isAdmin: boolean = false): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const result = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'wide', pages: {} }} />, { roleResolver: resolver(roles), isAdmin });
  await act(async (): Promise<void> => undefined);
  return result;
}

async function openTab(view: ReturnType<typeof renderWithFrontDoor>, name: string): Promise<void> {
  await act(async (): Promise<void> => {
    fireEvent.click(view.getByRole('tab', { name, exact: true }));
  });
}

function disclosure(container: HTMLElement): HTMLElement | undefined {
  return Array.from(container.querySelectorAll('button')).filter((button: Element): boolean => (button.textContent ?? '').trim() === 'What is going on?')[0] as HTMLElement | undefined;
}

describe('tabbed view layout (1.0.0.18)', () => {
  it('leaves "What matters now" off Home', async () => {
    const view = await renderShell(['employee', 'leader', 'operator'], true);
    expect(view.container.textContent).not.toContain('What matters now');
    expect(view.container.querySelector('.ai-app-panel .ai-app-threes')).toBeNull();
    expect(view.container.querySelector('.ai-app-hero')).not.toBeNull();
    expect(view.container.querySelectorAll('.ai-app-choice-button').length).toBeGreaterThan(0);
  });

  it('puts Start a request in its own section above My requests on Requests (1.0.0.19)', async () => {
    const view = await renderShell();
    await openTab(view, 'Requests');
    // The 1.0.0.18 two-column wrapper is gone: the two are sections one above the other.
    expect(view.container.querySelector('.ai-app-requests')).toBeNull();
    const start: HTMLElement = view.getByRole('region', { name: 'Start a request' });
    const mine: Element | null = view.container.querySelector('.ai-app-requests-mine');
    expect(start).toHaveClass('ai-app-requests-start');
    expect(mine?.querySelector('h2')?.textContent).toBe('My requests');
    expect(Array.from(start.querySelectorAll('.ai-app-starter-title')).map((node: Element): string => node.textContent ?? '')).toEqual([
      'Explore an AI idea',
      'Check a tool or task',
      'Register team AI use',
      'Get help or training'
    ]);
    expect(start.contains(mine)).toBe(false);
    expect((mine as Element).contains(start)).toBe(false);
    expect(start.compareDocumentPosition(mine as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The approved tools moved to the foot of Home (1.0.0.19).
    expect(view.container.querySelector('[aria-label="Approved tools"]')).toBeNull();
  });

  it('keeps My requests off Cases', async () => {
    const view = await renderShell();
    await openTab(view, 'Cases');
    expect(view.container.querySelector('.ai-page-mywork')).toBeNull();
    expect(view.container.textContent).not.toContain('My requests');
  });

  it.each(['Requests', 'Improvement', 'Cases'])('hides the explanation of %s under a closed "What is going on?" until it is opened', async (tab: string) => {
    const view = await renderShell();
    await openTab(view, tab);
    const button: HTMLElement | undefined = disclosure(view.container);
    expect(button).toBeDefined();
    expect((button as HTMLElement).getAttribute('aria-expanded')).toBe('false');
    expect(view.container.querySelector('.ai-app-split')).toBeNull();
    await act(async (): Promise<void> => {
      fireEvent.click(button as HTMLElement);
    });
    expect((button as HTMLElement).getAttribute('aria-expanded')).toBe('true');
    const region: Element | null = view.container.querySelector(`#${(button as HTMLElement).getAttribute('aria-controls') ?? ''}`);
    expect(region).not.toBeNull();
    expect((region as Element).querySelector('.ai-app-split')).not.toBeNull();
    await act(async (): Promise<void> => {
      fireEvent.click(button as HTMLElement);
    });
    expect(view.container.querySelector('.ai-app-split')).toBeNull();
  });

  it.each([
    ['Home', ['employee'], false],
    ['Marketing', ['employee', 'operator'], true],
    ['Metrics', ['employee', 'operator'], true],
    ['Admin', ['employee', 'operator'], true]
  ] as [string, RoleId[], boolean][])('draws no "What is going on?" on %s', async (tab: string, roles: RoleId[], isAdmin: boolean) => {
    const view = await renderShell(roles, isAdmin);
    if (tab !== 'Home') {
      await openTab(view, tab);
    }
    expect(disclosure(view.container)).toBeUndefined();
  });
});

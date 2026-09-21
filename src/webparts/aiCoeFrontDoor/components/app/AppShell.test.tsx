/**
 * The consolidated shell. The cases that matter are the ones a rebuild could quietly break: the gate must keep a
 * section out of the tab list AND out of the tree, the keyboard must be able to move along the tabs, and a section
 * change must land somewhere a screen reader announces.
 */
import * as React from 'react';
import { act, fireEvent } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { AppShell } from './AppShell';
import type { IPageViewSettings } from '../../content/pageViews';
import type { RoleId } from '../../content/roles';
import type { IRoleResolution, IRoleResolver } from '../../services/roleResolver';

const SETTINGS: IPageViewSettings = { view: 'app', layout: 'wide', pages: {} };

/**
 * The shell reads roles from the resolver service, not from the page-document context, so a test that wants a role
 * has to supply one. This answers at once with exactly what it is given, which is what lets the gate be exercised.
 */
function resolver(roles: RoleId[], resolution: IRoleResolution['resolution']): IRoleResolver {
  return {
    resolve: async (): Promise<IRoleResolution> => ({ roles, resolution })
  };
}

/**
 * Renders and lets the resolver's answer land. The resolver replies on a microtask, so without this the gate is
 * asserted against the membership it had before the answer arrived, and React reports the update as unwrapped.
 */
async function renderShell(options?: Parameters<typeof renderWithFrontDoor>[1]): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const result: ReturnType<typeof renderWithFrontDoor> = renderWithFrontDoor(<AppShell settings={SETTINGS} />, options);
  await act(async (): Promise<void> => undefined);
  return result;
}

function tabNames(container: HTMLElement): string[] {
  const names: string[] = [];
  container.querySelectorAll('[role="tab"]').forEach((tab: Element): void => {
    names.push((tab.textContent ?? '').trim());
  });
  return names;
}

function selected(container: HTMLElement): string {
  const tab: Element | null = container.querySelector('[role="tab"][aria-selected="true"]');
  return (tab?.textContent ?? '').trim();
}

describe('AppShell', () => {
  it('opens on the first screen with the entry panel and the three ways in', async () => {
    const { container } = await renderShell();
    expect(container.querySelector('.ai-app-hero-title')?.textContent).toBe('Make the next move.');
    const choices: number = container.querySelectorAll('.ai-app-choice-button').length;
    expect(choices).toBe(3);
    expect(selected(container)).toBe('Home');
  });

  it('keeps a section a person may not use out of the tab list entirely', async () => {
    // An employee holds none of the narrowed capabilities, so the three gated sections are absent - not disabled,
    // not styled differently, absent. Their services are therefore never constructed.
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const names: string[] = tabNames(container);
    expect(names).toEqual(['Home', 'Cases', 'Engineering', 'Improvement']);
    expect(names.indexOf('Marketing')).toBe(-1);
    expect(names.indexOf('Enterprise value')).toBe(-1);
    expect(names.indexOf('System map')).toBe(-1);
  });

  it('opens the measured view to a leader but still not the operator surface', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee', 'leader'], 'resolved') });
    const names: string[] = tabNames(container);
    expect(names.indexOf('Enterprise value')).toBeGreaterThan(-1);
    expect(names.indexOf('System map')).toBe(-1);
    expect(names.indexOf('Marketing')).toBe(-1);
  });

  it('shows nothing narrowed while the membership is unresolved, rather than guessing', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee', 'operator'], 'unresolved') });
    const names: string[] = tabNames(container);
    expect(names).toEqual(['Home', 'Cases', 'Engineering', 'Improvement']);
  });

  it('moves along the tabs with the arrow keys, and wraps at both ends', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const list: Element = container.querySelector('[role="tablist"]') as Element;
    expect(selected(container)).toBe('Home');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'ArrowRight' }); });
    expect(selected(container)).toBe('Cases');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'ArrowLeft' }); });
    expect(selected(container)).toBe('Home');
    // Left from the first wraps to the last, which is what a tab list promises.
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'ArrowLeft' }); });
    expect(selected(container)).toBe('Improvement');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'Home' }); });
    expect(selected(container)).toBe('Home');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'End' }); });
    expect(selected(container)).toBe('Improvement');
  });

  it('ignores a key the tab list does not own, so typing is not swallowed', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const list: Element = container.querySelector('[role="tablist"]') as Element;
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'a' }); });
    expect(selected(container)).toBe('Home');
  });

  it('keeps one tab in the tab order and points each panel at its tab', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const reachable: Element[] = [];
    container.querySelectorAll('[role="tab"]').forEach((tab: Element): void => {
      if (tab.getAttribute('tabindex') === '0') {
        reachable.push(tab);
      }
    });
    expect(reachable.length).toBe(1);
    const panel: Element | null = container.querySelector('[role="tabpanel"]');
    const labelledBy: string = panel?.getAttribute('aria-labelledby') ?? '';
    expect(container.querySelector(`#${labelledBy}`)?.getAttribute('aria-selected')).toBe('true');
  });

  it('gives the section a heading that can take focus, so a change is announced', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const heading: Element | null = container.querySelector('.ai-app-heading');
    expect(heading?.tagName).toBe('H2');
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    // On the first screen the entry panel already names the view, so the heading is there for readers only.
    expect(heading?.className).toContain('ai-app-heading--quiet');
  });

  it('names the person and what the view can say about their access', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const chips: string[] = [];
    container.querySelectorAll('.ai-app-chip-line').forEach((chip: Element): void => {
      chips.push((chip.textContent ?? '').trim());
    });
    expect(chips.filter((chip: string): boolean => chip.indexOf('Access confirmed') >= 0).length).toBe(1);
    expect(chips.filter((chip: string): boolean => chip.indexOf('Signed in as') >= 0).length).toBe(1);
  });

  it('says so when the membership could not be confirmed, rather than staying quiet about it', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'unresolved') });
    expect(container.textContent).toContain('Access not confirmed');
  });

  it('carries the footer promise on every section', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    expect(container.querySelector('.ai-app-foot')?.textContent).toContain('without a person deciding it');
  });
});

/**
 * The status pill: one truth state or chrome state rendered as text plus an icon shape inside a
 * toned span, so the meaning never rests on colour alone (FD-33, WCAG 1.4.1).
 */
import { render } from '@testing-library/react';
import * as React from 'react';
import { StatusPill } from './StatusPill';
import type { PillState } from './StatusPill';

interface IExpectedPill {
  state: PillState;
  tone: string;
  label: string;
  icon: string;
}

const TRUTH_PILLS: IExpectedPill[] = [
  { state: 'availableNow', tone: 'green', label: 'Available now', icon: 'lucide-circle-check' },
  { state: 'draftOnly', tone: 'blue', label: 'Draft only', icon: 'lucide-save' },
  { state: 'needsApproval', tone: 'amber', label: 'Needs approval', icon: 'lucide-clock-3' },
  { state: 'needsAccess', tone: 'amber', label: 'Needs access', icon: 'lucide-shield-alert' },
  { state: 'notSupported', tone: 'red', label: 'Not supported', icon: 'lucide-x' }
];

const CHROME_PILLS: IExpectedPill[] = [
  { state: 'example', tone: 'blue', label: 'Example', icon: 'lucide-info' },
  { state: 'needsRefresh', tone: 'amber', label: 'Needs refresh', icon: 'lucide-refresh-cw' },
  { state: 'awaitingSource', tone: 'amber', label: 'Awaiting source', icon: 'lucide-clock-3' }
];

function pillOf(container: HTMLElement): HTMLElement {
  const pill: HTMLElement | null = container.querySelector('span.ai-pill');
  if (pill === null) {
    throw new Error('no pill rendered');
  }
  return pill;
}

function expectPill(expected: IExpectedPill): void {
  const { container } = render(<StatusPill state={expected.state} />);
  const pill: HTMLElement = pillOf(container);
  expect(pill.classList.contains(`ai-pill--${expected.tone}`)).toBe(true);
  expect(pill.className.split(' ').filter((name: string): boolean => name.indexOf('ai-pill--') === 0)).toEqual([`ai-pill--${expected.tone}`]);
  const icon: SVGElement | null = pill.querySelector('svg[aria-hidden="true"]');
  expect(icon).not.toBeNull();
  expect(icon?.getAttribute('class')).toContain(expected.icon);
  expect(icon?.getAttribute('focusable')).toBe('false');
  const label: HTMLElement | null = pill.querySelector('span.ai-pill-label');
  expect(label?.textContent).toBe(expected.label);
  expect(pill.textContent).toBe(expected.label);
  expect(pill.querySelector('code')).toBeNull();
}

describe('StatusPill', () => {
  it('renders each of the five truth states as a toned span with an icon shape and its label', () => {
    for (const expected of TRUTH_PILLS) {
      expectPill(expected);
    }
  });

  it('renders the three chrome states with the chrome labels', () => {
    for (const expected of CHROME_PILLS) {
      expectPill(expected);
    }
  });

  it('lets a label override the default wording and keeps the tone and icon of the state', () => {
    const { container } = render(<StatusPill state="availableNow" label="Ready for you" />);
    const pill: HTMLElement = pillOf(container);
    expect(pill.textContent).toBe('Ready for you');
    expect(pill.classList.contains('ai-pill--green')).toBe(true);
    expect(pill.querySelector('svg[aria-hidden="true"]')?.getAttribute('class')).toContain('lucide-circle-check');
  });

  it('keeps a blank label override out and falls back to the state wording', () => {
    const { container } = render(<StatusPill state="needsAccess" label="   " />);
    expect(pillOf(container).textContent).toBe('Needs access');
  });

  it('shows the code in a code element only when asked', () => {
    const silent = render(<StatusPill state="needsAccess" code="AWAITING_SOURCE" />);
    expect(pillOf(silent.container).querySelector('code')).toBeNull();
    expect(pillOf(silent.container).textContent).toBe('Needs access');
    silent.unmount();

    const shown = render(<StatusPill state="needsAccess" code="AWAITING_SOURCE" showCode={true} />);
    const code: HTMLElement | null = pillOf(shown.container).querySelector('code.ai-pill-code');
    expect(code?.textContent).toBe('AWAITING_SOURCE');
    expect(pillOf(shown.container).querySelector('span.ai-pill-label')?.textContent).toBe('Needs access');
    shown.unmount();

    const noCode = render(<StatusPill state="needsAccess" showCode={true} />);
    expect(pillOf(noCode.container).querySelector('code')).toBeNull();
    noCode.unmount();

    const blankCode = render(<StatusPill state="needsAccess" code="  " showCode={true} />);
    expect(pillOf(blankCode.container).querySelector('code')).toBeNull();
  });

  it('carries no interactive role and no colour-only signal', () => {
    const { container } = render(<StatusPill state="notSupported" />);
    const pill: HTMLElement = pillOf(container);
    expect(pill.getAttribute('role')).toBeNull();
    expect(pill.querySelector('a, button')).toBeNull();
    expect(pill.textContent?.trim()).not.toBe('');
    expect(pill.querySelector('svg')).not.toBeNull();
  });
});

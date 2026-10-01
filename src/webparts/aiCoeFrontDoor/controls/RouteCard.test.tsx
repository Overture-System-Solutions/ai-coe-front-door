import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../testing/renderWithFrontDoor';
import type { ITestFrontDoorOptions } from '../../../testing/renderWithFrontDoor';
import { NO_FALLBACK_LABEL } from '../content/routes';
import type { RouteTable } from '../content/routes';
import { CONTINUE_WITH, REFERENCE_KEY, RouteCard } from './RouteCard';

const REFERENCE: string = 'OVT-AICOE-20260911-ABCDEFGH';
const NOW: Date = new Date('2026-09-20T12:00:00Z');

const ROUTES: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
  assistant: { key: 'assistant', label: 'the assistant', href: 'https://assistant.example/chat?tenant=contoso', state: 'availableNow', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007', carriesReference: true, note: 'Opens in a new tab.' },
  improve: { key: 'improve', label: 'Improve a task', href: 'SitePages/Check-a-tool-or-task.aspx', state: 'availableNow' },
  paused: { key: 'paused', label: 'The paused path', href: 'https://paused.example/', state: 'PAUSED', fallback: 'improve' }
};

function renderCard(routeKey: string, options: ITestFrontDoorOptions = {}, withReference: boolean = true): HTMLElement {
  const { container } = renderWithFrontDoor(<RouteCard routeKey={routeKey} reference={withReference ? REFERENCE : undefined} />, { pageView: true, now: NOW, routes: ROUTES, ...options });
  const card: HTMLElement | null = container.querySelector('section.ai-route-card');
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe('RouteCard', () => {
  it('renders an open off-site route as a new-tab link that carries the reference when the row says so', () => {
    const card: HTMLElement = renderCard('assistant');
    expect(within(card).getByRole('heading', { level: 3, name: `${CONTINUE_WITH} the assistant` })).toBeInTheDocument();
    expect(CONTINUE_WITH).toBe('Continue with');
    const reference: HTMLElement = card.querySelector('.ai-route-card-reference') as HTMLElement;
    expect(reference).toHaveTextContent(`${REFERENCE_KEY} ${REFERENCE}`);
    expect(reference.querySelector('code')?.textContent).toBe(REFERENCE);
    expect(within(card).getByText('Available now').closest('.ai-pill')).not.toBeNull();
    expect(within(card).getByText('Opens in a new tab.')).toBeInTheDocument();
    const link: HTMLElement = within(card).getByRole('link', { name: 'the assistant' });
    // The reference joins an existing query string; no user text ever does.
    expect(link).toHaveAttribute('href', `https://assistant.example/chat?tenant=contoso&ref=${REFERENCE}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(card).queryByRole('link', { name: 'Start a guided request' })).not.toBeInTheDocument();
  });

  it('keeps an on-site link in the same tab and appends nothing when the row does not carry the reference', () => {
    const card: HTMLElement = renderCard('improve');
    const link: HTMLElement = within(card).getByRole('link', { name: 'Improve a task' });
    expect(link).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Check-a-tool-or-task.aspx`);
    expect(link).not.toHaveAttribute('target');
    expect(card.querySelector('code')?.textContent).toBe(REFERENCE);
  });

  it('shows a closed route with its pill and links to the fallback without the reference', () => {
    const card: HTMLElement = renderCard('paused');
    expect(within(card).getByRole('heading', { level: 3, name: `${CONTINUE_WITH} The paused path` })).toBeInTheDocument();
    expect(within(card).getByText('Paused')).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'The paused path' })).not.toBeInTheDocument();
    const fallback: HTMLElement = within(card).getByRole('link', { name: 'Improve a task' });
    expect(fallback).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Check-a-tool-or-task.aspx`);
    expect(card.classList.contains('ai-route-card--closed')).toBe(true);
    expect(renderCard('improve').classList.contains('ai-route-card--closed')).toBe(false);
  });

  it('closes an off-site route that has no receipt yet and falls back to the guided intake', () => {
    const routes: RouteTable = { ...ROUTES, assistant: { ...ROUTES.assistant, receiptRef: undefined } };
    const card: HTMLElement = renderCard('assistant', { routes });
    expect(within(card).getByText('Awaiting source')).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'the assistant' })).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Start a guided request' })).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
  });

  it('says no fallback is configured for an unknown route with no guided intake, and omits the reference line without a reference', () => {
    const card: HTMLElement = renderCard('assistant', { routes: {} }, false);
    expect(within(card).getByRole('heading', { level: 3, name: `${CONTINUE_WITH} ${NO_FALLBACK_LABEL}` })).toBeInTheDocument();
    expect(within(card).getByText('Not supported')).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(card.querySelector('.ai-route-card-reference')).toBeNull();
    expect(screen.queryByText(REFERENCE)).not.toBeInTheDocument();
  });
});

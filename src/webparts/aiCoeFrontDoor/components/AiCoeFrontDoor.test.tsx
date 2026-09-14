import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { createTestFrontDoor } from '../../../testing/renderWithFrontDoor';
import type { ITestFrontDoor } from '../../../testing/renderWithFrontDoor';
import { firstStepOf } from '../../../testing/workflowHarness';
import type { IPageViewSettings } from '../content/pageViews';
import { AiCoeFrontDoor } from './AiCoeFrontDoor';

interface IRootExtras {
  pageView?: IPageViewSettings;
  navigate?: jest.Mock;
}

function renderRoot(isDarkTheme: boolean, extras: IRootExtras = {}): HTMLElement {
  const { value }: ITestFrontDoor = createTestFrontDoor();
  const { container } = render(
    <AiCoeFrontDoor
      isDarkTheme={isDarkTheme}
      branding={value.branding}
      siteUrl={value.siteUrl}
      user={value.user}
      isAdmin={value.isAdmin}
      telemetryProvider={value.telemetryProvider}
      services={value.services}
      pageView={extras.pageView}
      navigate={extras.navigate}
    />
  );
  return container.firstChild as HTMLElement;
}

describe('AiCoeFrontDoor', () => {
  it('renders the legacy shell for the legacy view', () => {
    const section: HTMLElement = renderRoot(false, { pageView: { view: 'legacy', layout: 'wide', pages: {} } });
    expect(screen.getByRole('heading', { level: 1, name: 'AI, safely put to work.' })).toBeInTheDocument();
    expect(section.querySelector('.ai-view')).toBeNull();
  });

  it('renders the page view shell for a configured view', () => {
    const section: HTMLElement = renderRoot(false, { pageView: { view: 'telemetry', layout: 'wide', pages: {} } });
    expect(section.querySelector('.ai-view--telemetry')).not.toBeNull();
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
  });

  it('hands navigate to the page views', async () => {
    const navigate: jest.Mock = jest.fn();
    const { value }: ITestFrontDoor = createTestFrontDoor();
    renderRoot(false, { pageView: { view: 'feedback', layout: 'wide', pages: {} }, navigate });
    await firstStepOf(value.catalog.feedback);
    fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    expect(navigate).toHaveBeenCalledWith(value.siteUrl);
  });

  it('mounts the scoped section with the signed-in user and the shell', () => {
    const section: HTMLElement = renderRoot(false);
    expect(section.tagName).toBe('SECTION');
    expect(section.id).toBe('overture-ai-coe-pilot');
    expect(section.className).toMatch(/^aiCoeFrontDoor(_|$)/);
    expect(section).toHaveAttribute('data-theme', 'light');
    const signedIn: HTMLElement = screen.getByText('Signed in as Pat Example');
    expect(signedIn.className).toMatch(/^signedInUser(_|$)/);
    expect(screen.getByRole('heading', { level: 1, name: 'AI, safely put to work.' })).toBeInTheDocument();
  });

  it('marks the dark theme', () => {
    expect(renderRoot(true)).toHaveAttribute('data-theme', 'dark');
  });
});

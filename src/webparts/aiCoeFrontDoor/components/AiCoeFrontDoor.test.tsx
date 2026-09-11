import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { createTestFrontDoor } from '../../../testing/renderWithFrontDoor';
import type { ITestFrontDoor } from '../../../testing/renderWithFrontDoor';
import { AiCoeFrontDoor } from './AiCoeFrontDoor';

function renderRoot(isDarkTheme: boolean): HTMLElement {
  const { value }: ITestFrontDoor = createTestFrontDoor();
  const { container } = render(
    <AiCoeFrontDoor isDarkTheme={isDarkTheme} branding={value.branding} siteUrl={value.siteUrl} user={value.user} isAdmin={value.isAdmin} services={value.services} />
  );
  return container.firstChild as HTMLElement;
}

describe('AiCoeFrontDoor', () => {
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

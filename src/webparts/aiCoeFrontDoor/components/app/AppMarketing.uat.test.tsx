import * as React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { act, fireEvent } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { INITIAL_JOURNEYS } from '../../content/marketing/demoJourney';
import { AppMarketing } from './AppMarketing';

it('adds bottom padding around the labelled demonstration cards without changing their actions', async () => {
  const view = renderWithFrontDoor(<AppMarketing demo={INITIAL_JOURNEYS} onDemoChange={jest.fn()} resolution={{ roles: ['employee', 'marketingParticipant'], resolution: 'resolved' }} />);
  await act(async (): Promise<void> => undefined);
  fireEvent.click(view.getByRole('button', { name: 'Labelled demonstration', exact: true }));
  const brief = view.getByRole('button', { name: /^Campaign brief/ });
  expect(brief.closest('ul')).toHaveClass('ai-app-starters--marketing-demo');
  expect(brief.closest('ul')?.querySelectorAll('.ai-app-starter')).toHaveLength(3);
  const styles = fs.readFileSync(path.join(process.cwd(), 'src/webparts/aiCoeFrontDoor/styles/appShell.global.scss'), 'utf8');
  expect(styles).toMatch(/\.ai-app-starters--marketing-demo\s*\{\s*padding-bottom:\s*24px;/);
  expect(view.container.querySelector('.ai-app-demo-banner')).toHaveAttribute('role', 'note');
  expect(view.container.querySelector('.ai-app-demo-banner')).toHaveTextContent('Demo — no live actions');
  fireEvent.click(brief);
  expect(view.getByRole('heading', { name: 'Campaign brief', exact: true })).toBeInTheDocument();
});

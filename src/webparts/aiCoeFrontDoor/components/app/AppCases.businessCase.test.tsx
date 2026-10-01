import * as React from 'react';
import { fireEvent, within } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import type { ICoreWorkService } from '../../services/core/coreWorkService';
import * as coreWorkspace from './AppCoreWorkspace';
import { AppCases } from './AppSections';

// Cases explains how a request becomes a business case wherever the business-case workspace is shown (1.0.0.19). The
// rule for which cases need one is not decided, so both options are shown as options.
beforeEach(() => {
  jest.spyOn(coreWorkspace, 'AppCoreWorkspace').mockImplementation(() => <div>Business-case workspace fixture</div>);
});
afterEach(() => jest.restoreAllMocks());

function explained(coreWork?: ICoreWorkService): HTMLElement | null {
  const view = renderWithFrontDoor(<AppCases />, { coreWork });
  fireEvent.click(view.getByRole('button', { name: 'What is going on?' }));
  return view.queryByRole('region', { name: 'From a request to a business case' });
}

describe('from a request to a business case', () => {
  it('walks a request through its case to a business case ready for the review board', () => {
    const panel = explained({ mode: 'synthetic', enabled: true } as ICoreWorkService) as HTMLElement;
    expect(panel).not.toBeNull();
    const steps: string[] = within(within(panel).getByRole('list', { name: 'From a request to a business case' }))
      .getAllByRole('listitem')
      .map((item: HTMLElement): string => (item.querySelector('.ai-app-flow-name')?.textContent ?? '').trim());
    expect(steps).toEqual(['Request', 'AI CoE case', 'Triage rates the risk', 'Business case', 'Each section reviewed', 'Ready for the review board']);
  });

  it('shows both rules for which cases need a business case, as options not yet decided', () => {
    const panel = explained({ mode: 'synthetic', enabled: true } as ICoreWorkService) as HTMLElement;
    expect(panel).toHaveTextContent('Option A: by risk');
    expect(panel).toHaveTextContent('Triage rates the case High, or it costs $1,000 a month or more.');
    expect(panel).toHaveTextContent('Option B: the approver decides');
    expect(panel).toHaveTextContent('A third choice, "Needs a business case", beside Approve and Decline.');
    expect(within(panel).getAllByText('Not decided')).toHaveLength(2);
    expect(panel).toHaveTextContent('Nothing moves a case into a business case yet');
  });

  it('leaves the explanation out where there is no business-case workspace', () => {
    expect(explained(undefined)).toBeNull();
  });
});

import { fireEvent, screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../testing/renderWithFrontDoor';
import type { ITestFrontDoorOptions } from '../../../testing/renderWithFrontDoor';
import type { ISharedSections } from '../content/pageContent';
import { FAILURE_LABELS } from '../services/failureClass';
import type { FailureClass } from '../services/failureClass';
import { DRAFT_KEPT_TEXT, FailureNotice, NEXT_ACTIONS, RERUN_CONDITIONS, TRY_AGAIN_LABEL } from './FailureNotice';

const SUPPORT: ISharedSections = {
  footer: [
    { type: 'paragraph', text: 'Nothing here is graded.' },
    {
      type: 'supportRoute',
      label: 'Ask the AI CoE for help',
      stopWhen: [],
      reportFields: [],
      routes: [
        { issue: 'Access or sign-in', owner: 'Identity owner', kind: 'identity' },
        { issue: 'Private or regulated data', owner: 'Privacy owner', kind: 'privacy' },
        { issue: 'Anything else', owner: 'Support desk', kind: 'support' }
      ]
    }
  ]
};

interface IRenderedNotice {
  notice: HTMLElement;
  unmount: () => void;
}

function renderNotice(failureClass: FailureClass, options: ITestFrontDoorOptions = {}, onRetry?: jest.Mock): IRenderedNotice {
  const { unmount } = renderWithFrontDoor(<FailureNotice failureClass={failureClass} userMessage={`${FAILURE_LABELS[failureClass]}.`} onRetry={onRetry} />, {
    pageView: true,
    shared: SUPPORT,
    ...options
  });
  return { notice: screen.getByRole('alert'), unmount };
}

describe('FailureNotice', () => {
  it('names the class, the next action, the owner and the rerun condition for each failure class', () => {
    const expected: { [failureClass in FailureClass]: { owner: string; rerun: string } } = {
      PERMISSION: { owner: 'Identity owner', rerun: 'after access is granted' },
      SOURCE: { owner: 'Support desk', rerun: 'when the list exists on this site' },
      TRANSIENT: { owner: 'Support desk', rerun: 'now' },
      IMPLEMENTATION: { owner: 'Support desk', rerun: 'after the AI CoE has looked at it' },
      INCONCLUSIVE: { owner: 'Support desk', rerun: 'now, with the same reference' }
    };
    for (const failureClass of Object.keys(expected) as FailureClass[]) {
      const { unmount } = renderWithFrontDoor(<FailureNotice failureClass={failureClass} userMessage={`${FAILURE_LABELS[failureClass]}.`} />, { pageView: true, shared: SUPPORT });
      const notice: HTMLElement = screen.getByRole('alert');
      expect(within(notice).getByText(FAILURE_LABELS[failureClass]).tagName).toBe('STRONG');
      expect(within(notice).getByText(`${FAILURE_LABELS[failureClass]}.`)).toBeInTheDocument();
      expect(within(notice).getByText(NEXT_ACTIONS[failureClass])).toBeInTheDocument();
      expect(within(notice).getByText(expected[failureClass].owner)).toBeInTheDocument();
      expect(within(notice).getByText(expected[failureClass].rerun)).toBeInTheDocument();
      expect(RERUN_CONDITIONS[failureClass]).toBe(expected[failureClass].rerun);
      expect(within(notice).getByText(DRAFT_KEPT_TEXT)).toBeInTheDocument();
      // The class code is for the operator plane only.
      expect(within(notice).queryByText(failureClass)).not.toBeInTheDocument();
      unmount();
    }
    expect(DRAFT_KEPT_TEXT).toBe('Your answers are kept as a draft on this device.');
  });

  it('lays the facts out as a description list, never a data grid element', () => {
    const { notice } = renderNotice('SOURCE');
    expect(notice.querySelector('dl.ai-failure-facts')).not.toBeNull();
    expect(notice.querySelector('table')).toBeNull();
    expect(notice.querySelector('[role="table"]')).toBeNull();
    const terms: NodeListOf<HTMLElement> = notice.querySelectorAll('dt');
    expect(Array.prototype.map.call(terms, (term: HTMLElement): string | null => term.textContent)).toEqual(['What to do', 'Who owns it', 'Try again']);
  });

  it('shows the class code beside the label on the operator plane', () => {
    const { notice } = renderNotice('IMPLEMENTATION', { plane: 'operator' });
    const code: HTMLElement = within(notice).getByText('IMPLEMENTATION');
    expect(code.tagName).toBe('CODE');
  });

  it('offers a try-again button for a transient failure only, and only when the workflow owns a retry', () => {
    const onRetry: jest.Mock = jest.fn();
    const transient: IRenderedNotice = renderNotice('TRANSIENT', {}, onRetry);
    fireEvent.click(within(transient.notice).getByRole('button', { name: TRY_AGAIN_LABEL }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(TRY_AGAIN_LABEL).toBe('Try again');
    transient.unmount();
    const denied: IRenderedNotice = renderNotice('PERMISSION', {}, onRetry);
    expect(within(denied.notice).queryByRole('button', { name: TRY_AGAIN_LABEL })).not.toBeInTheDocument();
    denied.unmount();
    const { notice } = renderNotice('TRANSIENT');
    expect(within(notice).queryByRole('button', { name: TRY_AGAIN_LABEL })).not.toBeInTheDocument();
  });

  it('reads "not yet named" when the support route has no owner of that kind, or no support route at all', () => {
    const unnamed: ISharedSections = {
      footer: [{ type: 'supportRoute', label: 'Ask the AI CoE for help', stopWhen: [], reportFields: [], routes: [{ issue: 'Access or sign-in', kind: 'identity' }, { issue: 'Anything else', owner: 'Support desk' }] }]
    };
    const first: IRenderedNotice = renderNotice('PERMISSION', { shared: unnamed });
    expect(first.notice).toHaveTextContent('not yet named');
    expect(first.notice).not.toHaveTextContent('Support desk');
    first.unmount();
    // An unmarked row is never guessed at by its wording.
    const second: IRenderedNotice = renderNotice('TRANSIENT', { shared: unnamed });
    expect(second.notice).toHaveTextContent('not yet named');
    expect(second.notice).not.toHaveTextContent('Support desk');
    second.unmount();
    const { notice } = renderNotice('SOURCE', { shared: { footer: [] } });
    expect(notice).toHaveTextContent('not yet named');
  });

  it('renders the user message and nothing that could carry a response body', () => {
    const { notice } = renderNotice('TRANSIENT');
    expect(notice.textContent).toBe(
      [
        FAILURE_LABELS.TRANSIENT,
        `${FAILURE_LABELS.TRANSIENT}.`,
        'What to do',
        NEXT_ACTIONS.TRANSIENT,
        'Who owns it',
        'Support desk',
        'Try again',
        RERUN_CONDITIONS.TRANSIENT,
        DRAFT_KEPT_TEXT
      ].join('')
    );
  });
});

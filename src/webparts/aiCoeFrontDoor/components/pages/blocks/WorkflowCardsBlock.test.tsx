import { within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import type { IVocabulary, IWorkflowCardItem, IWorkflowCardsBlock } from '../../../content/pageContent';
import type { RouteTable } from '../../../content/routes';
import { WORKFLOW_EXAMPLE_PREFIX, WORKFLOW_FIELD_LABELS, WORKFLOW_LINK_TEXT, WorkflowCardsBlock } from './WorkflowCardsBlock';

const BRIEF: IWorkflowCardItem = {
  title: 'Campaign brief',
  input: 'approved objective, audience context and permitted current sources.',
  output: 'audience, pain points, message, channel plan, content calendar, evidence gaps and review needs.',
  humanDecision: 'Marketing validates strategy and voice.',
  pass: 'Every factual claim cites a current source or is marked unknown; nothing is published.',
  illustrative: true
};

const PLAN: IWorkflowCardItem = {
  title: 'Content and internal PR plan',
  input: 'accepted campaign brief, current brand assets, channel owners and product truth.',
  output: 'asset register, copy variants, calendar, owners, dependencies and approvals.',
  humanDecision: 'Marketing/communications approves copy and channel.',
  pass: 'One destination, one CTA, accessible copy, no unsupported capability/value claim.',
  illustrative: true
};

const BLOCK: IWorkflowCardsBlock = { type: 'workflowCards', items: [BRIEF, PLAN] };

function cards(container: HTMLElement): NodeListOf<HTMLElement> {
  return container.querySelectorAll('.ai-page-workflows > article.ai-page-workflow');
}

function fieldsOf(card: HTMLElement): string[] {
  const terms: HTMLElement[] = [];
  card.querySelectorAll('dl.ai-page-workflow-fields > dt').forEach((term: Element): void => {
    terms.push(term as HTMLElement);
  });
  return terms.map((term: HTMLElement): string => term.textContent ?? '');
}

function valuesOf(card: HTMLElement): string[] {
  const values: HTMLElement[] = [];
  card.querySelectorAll('dl.ai-page-workflow-fields > dd').forEach((value: Element): void => {
    values.push(value as HTMLElement);
  });
  return values.map((value: HTMLElement): string => value.textContent ?? '');
}

describe('WorkflowCardsBlock', () => {
  it('draws one card per workflow, each answering what goes in, what comes out, who decides and what a pass is', () => {
    const { container } = renderWithFrontDoor(<WorkflowCardsBlock block={BLOCK} />);
    expect(cards(container)).toHaveLength(2);
    const brief: HTMLElement = cards(container)[0];
    expect(brief.querySelector('h3')?.textContent).toBe('Campaign brief');
    expect(fieldsOf(brief)).toEqual([WORKFLOW_FIELD_LABELS.input, WORKFLOW_FIELD_LABELS.output, WORKFLOW_FIELD_LABELS.humanDecision, WORKFLOW_FIELD_LABELS.pass]);
    expect(WORKFLOW_FIELD_LABELS.humanDecision).toBe('Who decides');
    expect(WORKFLOW_FIELD_LABELS.pass).toBe('What "pass" means');
    expect(valuesOf(brief)).toEqual([BRIEF.input, BRIEF.output, BRIEF.humanDecision, BRIEF.pass]);
    // The human decision is a field of its own on every card: no workflow may read as one nobody signs off.
    expect(valuesOf(cards(container)[1])[2]).toBe(PLAN.humanDecision);
    // Nothing is claimed and nothing is opened: a card without a state or a link draws no pill and no anchor.
    expect(brief.querySelectorAll('a')).toHaveLength(0);
  });

  it('marks an illustrative card with the example pill, in the document wording, and leaves a plain one unpilled', () => {
    const { container } = renderWithFrontDoor(<WorkflowCardsBlock block={{ type: 'workflowCards', items: [BRIEF, { ...PLAN, illustrative: undefined }] }} />);
    expect(within(cards(container)[0]).getByText('Example')).toHaveClass('ai-pill-label');
    expect(cards(container)[1].querySelector('.ai-pill')).toBeNull();
    const vocabulary: IVocabulary = { truthStates: {}, requestStatuses: {}, chrome: { example: 'Illustration' }, roles: {}, telemetry: {} };
    const worded = renderWithFrontDoor(<WorkflowCardsBlock block={BLOCK} />, { vocabulary });
    expect(within(cards(worded.container)[0]).getByText('Illustration')).toHaveClass('ai-pill-label');
  });

  it('opens one link on a card that names a destination, and shows the worked example above it', () => {
    const item: IWorkflowCardItem = { ...BRIEF, illustrative: undefined, href: 'SitePages/Use-AI.aspx', example: 'Turn an **approved objective** into a brief.' };
    const { container } = renderWithFrontDoor(<WorkflowCardsBlock block={{ type: 'workflowCards', items: [item] }} />);
    const links: NodeListOf<HTMLAnchorElement> = container.querySelectorAll('a.ai-page-workflow-link');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe(WORKFLOW_LINK_TEXT);
    expect(links[0].getAttribute('href')).toBe(`${TEST_SITE_URL}/SitePages/Use-AI.aspx`);
    expect(links[0].getAttribute('target')).toBeNull();
    expect(container.querySelector('.ai-page-workflow-example')?.textContent).toBe(`${WORKFLOW_EXAMPLE_PREFIX}Turn an approved objective into a brief.`);
    expect(container.querySelector('.ai-page-workflow-example strong')?.textContent).toBe('approved objective');
    // A destination on another site opens in a new tab, as every other block's link does.
    const offSite = renderWithFrontDoor(<WorkflowCardsBlock block={{ type: 'workflowCards', items: [{ ...item, href: 'https://example.invalid/brief' }] }} />);
    expect(offSite.container.querySelector('a.ai-page-workflow-link')?.getAttribute('target')).toBe('_blank');
  });

  it('closes a card whose state is not available: the state pill, no link, the closed class', () => {
    const { container } = renderWithFrontDoor(
      <WorkflowCardsBlock block={{ type: 'workflowCards', items: [{ ...BRIEF, illustrative: undefined, state: 'needsAccess', href: 'SitePages/Use-AI.aspx' }] }} />
    );
    const card: HTMLElement = cards(container)[0];
    expect(card).toHaveClass('ai-page-workflow--closed');
    expect(within(card).getByText('Needs access')).toHaveClass('ai-pill-label');
    expect(card.querySelectorAll('a')).toHaveLength(0);
    // The words of the workflow stay: a closed card still says what the workflow is and who decides.
    expect(valuesOf(card)).toEqual([BRIEF.input, BRIEF.output, BRIEF.humanDecision, BRIEF.pass]);
    // An available state with a link opens, and says so with its pill.
    const open = renderWithFrontDoor(
      <WorkflowCardsBlock block={{ type: 'workflowCards', items: [{ ...BRIEF, illustrative: undefined, state: 'availableNow', href: 'SitePages/Use-AI.aspx' }] }} />
    );
    expect(cards(open.container)[0]).not.toHaveClass('ai-page-workflow--closed');
    expect(within(cards(open.container)[0]).getByText('Available now')).toHaveClass('ai-pill-label');
    expect(open.container.querySelectorAll('a.ai-page-workflow-link')).toHaveLength(1);
    // An available state with nothing to open fails closed, as every other block's action does.
    const empty = renderWithFrontDoor(<WorkflowCardsBlock block={{ type: 'workflowCards', items: [{ ...BRIEF, illustrative: undefined, state: 'availableNow' }] }} />);
    expect(cards(empty.container)[0]).toHaveClass('ai-page-workflow--closed');
    expect(within(cards(empty.container)[0]).getByText('Needs access')).toHaveClass('ai-pill-label');
  });

  it('never draws the family tag: it is read for a catalogue that does not exist yet', () => {
    const routes: RouteTable = {};
    const { container } = renderWithFrontDoor(<WorkflowCardsBlock block={{ type: 'workflowCards', items: [{ ...BRIEF, family: 'marketing' }] }} />, { routes });
    expect(container.textContent).not.toContain('marketing');
    expect(container.querySelectorAll('.ai-page-workflow')).toHaveLength(1);
  });
});

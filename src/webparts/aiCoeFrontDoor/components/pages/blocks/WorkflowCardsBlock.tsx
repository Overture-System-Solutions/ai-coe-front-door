import * as React from 'react';
import { resolveAction } from '../../../content/actions';
import type { ResolvedAction } from '../../../content/actions';
import type { IWorkflowCardItem, IWorkflowCardsBlock } from '../../../content/pageContent';
import type { IRouteOptions } from '../../../content/routes';
import { chromeLabel } from '../../../content/truthStates';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { StatusPill } from '../../../controls/StatusPill';
import { anchorProps, Markup } from '../Markup';
import { usePageDocument } from '../PageDocumentContext';

export interface IWorkflowCardsBlockProps {
  block: IWorkflowCardsBlock;
}

/** The four questions every workflow card answers, in the order the playbook asks them. */
export const WORKFLOW_FIELD_LABELS: { input: string; output: string; humanDecision: string; pass: string } = {
  input: 'Input',
  output: 'Output',
  humanDecision: 'Who decides',
  pass: 'What "pass" means'
};

/** The words above a worked example on a card. */
export const WORKFLOW_EXAMPLE_PREFIX: string = 'For example: ';
/** What the link on a card that leads somewhere says. */
export const WORKFLOW_LINK_TEXT: string = 'Open this workflow';

/**
 * One card per workflow: the title, then a description list of what the workflow takes, what it
 * gives back, who decides and what counts as a pass, so the human decision is never implied. A card
 * that only illustrates a workflow carries the example pill in the document's wording; a card that
 * names a state draws that state's pill and, unless it is available, no link at all; a card with a
 * link and nothing to claim is a plain link. Nothing here reads a list: the family tag a card may
 * carry is parsed and left undrawn until a catalogue exists.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export function WorkflowCardsBlock({ block }: IWorkflowCardsBlockProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  const { routes, now, vocabulary, roles } = usePageDocument();
  const options: IRouteOptions = { siteUrl, now, vocabulary, roles };
  const renderCard = (item: IWorkflowCardItem, index: number): React.ReactElement => {
    const action: ResolvedAction | undefined = resolveAction(item, routes, options);
    const closed: boolean = action !== undefined && action.kind === 'closed';
    const pairs: [string, string][] = [
      [WORKFLOW_FIELD_LABELS.input, item.input],
      [WORKFLOW_FIELD_LABELS.output, item.output],
      [WORKFLOW_FIELD_LABELS.humanDecision, item.humanDecision],
      [WORKFLOW_FIELD_LABELS.pass, item.pass]
    ];
    return (
      <article key={index} className={closed ? 'ai-page-workflow ai-page-workflow--closed' : 'ai-page-workflow'}>
        {(item.illustrative === true || (action !== undefined && action.pill !== undefined)) && (
          <p className="ai-page-workflow-head">
            {item.illustrative === true && <StatusPill state="example" label={chromeLabel('example', vocabulary)} />}
            {action !== undefined && action.pill !== undefined && action.stateLabel !== undefined && <StatusPill state={action.pill} label={action.stateLabel} />}
          </p>
        )}
        <h3>{item.title}</h3>
        <dl className="ai-page-workflow-fields">
          {pairs.map(
            (pair: [string, string], pairIndex: number): React.ReactElement => (
              <React.Fragment key={pairIndex}>
                <dt>{pair[0]}</dt>
                <dd>
                  <Markup text={pair[1]} />
                </dd>
              </React.Fragment>
            )
          )}
        </dl>
        {item.example !== undefined && (
          <p className="ai-page-workflow-example">
            {WORKFLOW_EXAMPLE_PREFIX}
            <Markup text={item.example} />
          </p>
        )}
        {action !== undefined && action.kind === 'link' && (
          <a className="ai-page-workflow-link" {...anchorProps(siteUrl, action.href)}>
            {WORKFLOW_LINK_TEXT}
          </a>
        )}
      </article>
    );
  };
  return <div className="ai-page-workflows">{block.items.map(renderCard)}</div>;
}

import * as React from 'react';
import type { IWorkCommandBlock } from '../../../content/pageContent';
import { NO_FALLBACK_LABEL, resolveRoute } from '../../../content/routes';
import type { IResolvedRoute, IRouteOptions } from '../../../content/routes';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { browserNavigate } from '../../../services/navigation';
import type { Navigate } from '../../../services/navigation';
import { Markup } from '../Markup';
import { usePageDocument } from '../PageDocumentContext';

export interface IWorkCommandBlockProps {
  block: IWorkCommandBlock;
}

/** The workflow the sentence becomes a draft of, and its first (answerable, required) step. */
export const WORK_COMMAND_WORKFLOW_ID: string = 'idea';
export const WORK_COMMAND_FIRST_STEP_ID: string = 'workToImprove';

/**
 * The stored draft shape of the summary workflows (workflows/summarySession.ts), with the sentence as
 * the first answer, so the idea page resumes it on load. The nulls are part of the stored contract.
 */
export interface IWorkCommandDraft {
  answers: { [stepId: string]: string };
  currentStepId: string;
  phase: 'form';
  // eslint-disable-next-line @rushstack/no-new-null
  summaryDraft: null;
  // eslint-disable-next-line @rushstack/no-new-null
  summarySourceSnapshot: null;
}

export function workCommandDraft(sentence: string): IWorkCommandDraft {
  const answers: { [stepId: string]: string } = {};
  answers[WORK_COMMAND_FIRST_STEP_ID] = sentence;
  return { answers, currentStepId: WORK_COMMAND_FIRST_STEP_ID, phase: 'form', summaryDraft: null, summarySourceSnapshot: null };
}

/** The status line after an available destination opened, when its route carries no note of its own. */
export function openedText(label: string): string {
  return `${label} opened in a new tab; your sentence is saved as a draft request.`;
}

/** The alert when the draft store cannot keep the sentence (it answers `{ ok: false }`, it never throws). */
export const SAVE_FAILED_TEXT: string = 'Your draft save could not be confirmed. Keep this page open and confirm the same draft or ask the owner for help.';

let commandCount: number = 0;

/** Ids come from a counter, so two commands on one page (or one page rendered twice) never share an id. */
function nextCommandId(): string {
  commandCount += 1;
  return `ai-page-command-${commandCount}`;
}

/**
 * What the form says below its controls: `invalid` is the one message about the input itself (an
 * empty sentence), so only it marks the input; `alert` is about the document or the device; `status`
 * reports where an available destination opened.
 */
type CommandMessage = { kind: 'invalid' | 'alert'; text: string } | { kind: 'status'; text: string } | undefined;

/**
 * The first screen's one command (FD-05): a sentence about the work to be done. On submit the
 * sentence is saved as the idea draft, then the route the block names is resolved against the
 * document's route list: an available destination opens in a new tab (the draft keeps the sentence
 * for later); anything else, including an unknown route, goes to the fallback (the guided intake)
 * in the same tab, which resumes the draft with the sentence as its first answer. The sentence never
 * enters a URL. With no fallback link at all nothing is saved and the form says so; when the draft
 * cannot be kept nothing opens, the sentence stays in the field and the form says so.
 */
export function WorkCommandBlock({ block }: IWorkCommandBlockProps): React.ReactElement {
  const { siteUrl, services, navigate } = useFrontDoor();
  const { routes, now, vocabulary, roles } = usePageDocument();
  const [id] = React.useState<string>(nextCommandId);
  const [sentence, setSentence] = React.useState<string>('');
  const [message, setMessage] = React.useState<CommandMessage>(undefined);
  const inputRef: React.RefObject<HTMLInputElement> = React.useRef<HTMLInputElement>(null);
  const mounted: React.MutableRefObject<boolean> = React.useRef<boolean>(true);

  React.useEffect((): (() => void) => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);

  const inputId: string = `${id}-input`;
  const messageId: string = `${id}-message`;
  const isInvalid: boolean = message !== undefined && message.kind === 'invalid';
  const isAlert: boolean = message !== undefined && (message.kind === 'invalid' || message.kind === 'alert');

  const onSaveFailed = (): void => {
    if (mounted.current) {
      setMessage({ kind: 'alert', text: SAVE_FAILED_TEXT });
    }
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text: string = sentence.trim();
    if (text === '') {
      setMessage({ kind: 'invalid', text: block.emptyText });
      inputRef.current?.focus();
      return;
    }
    const options: IRouteOptions = { siteUrl, now, vocabulary, roles };
    const route: IResolvedRoute = resolveRoute(routes, block.route, options);
    const href: string | undefined = route.href;
    if (href === undefined) {
      setMessage({ kind: 'alert', text: NO_FALLBACK_LABEL });
      return;
    }
    setMessage(undefined);
    // Only the named route, proved available, opens as the destination; the fallback row is a same-tab hand-off.
    const opensDestination: boolean = route.state === 'availableNow' && route.key === block.route;
    const leave: Navigate = navigate ?? browserNavigate;
    services.draftStore.save(WORK_COMMAND_WORKFLOW_ID, workCommandDraft(text)).then((result: { ok: boolean }): void => {
      if (!result.ok) {
        onSaveFailed();
        return;
      }
      if (opensDestination) {
        if (mounted.current) {
          setMessage({ kind: 'status', text: route.note ?? openedText(route.label) });
        }
        window.open(href, '_blank', 'noopener');
      } else {
        leave(href);
      }
    }, onSaveFailed);
  };

  return (
    <form className="ai-page-command" onSubmit={onSubmit}>
      <label className="ai-page-command-label" htmlFor={inputId}>
        {block.prompt}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className="overture-input ai-page-command-input"
        type="text"
        value={sentence}
        placeholder={block.placeholder}
        autoComplete="off"
        aria-invalid={isInvalid || undefined}
        aria-describedby={isInvalid ? messageId : undefined}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setSentence(event.target.value)}
      />
      <button type="submit" className="overture-btn-primary ai-page-command-submit">
        {block.submitLabel}
      </button>
      {block.note !== undefined && (
        <p className="ai-page-command-note">
          <Markup text={block.note} />
        </p>
      )}
      {isAlert && message !== undefined && (
        <p id={messageId} className="ai-page-command-alert" role="alert">
          {message.text}
        </p>
      )}
      {message !== undefined && message.kind === 'status' && (
        <p id={messageId} className="ai-page-command-status" role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}

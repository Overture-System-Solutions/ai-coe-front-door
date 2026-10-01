import * as React from 'react';
import type { AppSectionId, IEntryChoice } from '../../content/appSections';
import { CONCIERGE_NAME, conciergeIntroduced, copyText, markConciergeIntroduced, openConcierge } from '../../services/concierge';
import type { IConcierge } from '../../services/concierge';
import { AppStatusCard } from './kit';
import type { IStatusRow } from './kit';

/**
 * The first screen: the entry panel, what the view can tell you about itself, and the three ways in. (The role-drawn
 * "What matters now" cards were taken off in 1.0.0.18: they repeated the ways in without adding a record.)
 *
 * The command (1.0.0.18). The box hands a question to the AI CoE Concierge, the Copilot Studio agent, in Microsoft 365
 * Copilot: it copies the question and opens the chat, where the person pastes it, because Copilot offers no supported
 * way to fill its message box from a link. The first time in a browser it offers to add the concierge in Teams first.
 * Nothing is saved or sent from the box, and a site with no concierge set up is told so; the button is named from the
 * branding, never a provider.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export interface IAppHeroProps {
  organizationName: string;
  choices: readonly IEntryChoice[];
  onChoose: (section: AppSectionId) => void;
  /** The concierge the site set up; absent when it has none, and the box then says so. */
  concierge?: IConcierge;
  /** The wording of the button, from the branding rather than a provider name. */
  commandLabel: string;
  /** What the view can say about its own state, shown down the side. */
  status: readonly IStatusRow[];
}

export const EMPTY_COMMAND: string = 'Say what you need done first.';

/** The three ways in carry the palette (1.0.0.18): work teal, improvement green, metrics blue. */
const CHOICE_TONES: { [section: string]: string } = { engineering: 'teal', improvement: 'green', value: 'blue' };
export const CONCIERGE_NOT_SET_UP: string = `The ${CONCIERGE_NAME} isn't set up on this site yet.`;
export const CONCIERGE_HINT: string = `Copies your question and opens the ${CONCIERGE_NAME} chat, where you paste it. Nothing is sent from this page.`;
export const CONCIERGE_COPIED: string = `Copied. Paste it into the ${CONCIERGE_NAME} chat (Ctrl+V).`;
export const CONCIERGE_COPY_BY_HAND: string = `Copy your question from the box, then paste it into the ${CONCIERGE_NAME} chat.`;
const CONCIERGE_OPEN: string = `Open the ${CONCIERGE_NAME}`;

type Line = { kind: 'hint' | 'status' | 'alert'; text: string };

export function AppHero({
  organizationName,
  choices,
  onChoose,
  concierge,
  commandLabel,
  status
}: IAppHeroProps): React.ReactElement {
  const [sentence, setSentence] = React.useState<string>('');
  const [line, setLine] = React.useState<Line>({ kind: 'hint', text: concierge === undefined ? CONCIERGE_NOT_SET_UP : CONCIERGE_HINT });
  // The "add it first" message, with whether the question made it to the clipboard.
  const [offer, setOffer] = React.useState<{ copied: boolean } | undefined>(undefined);
  const mounted: React.MutableRefObject<boolean> = React.useRef<boolean>(true);
  const offerRef: React.RefObject<HTMLDivElement> = React.useRef<HTMLDivElement>(null);

  React.useEffect((): (() => void) => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);

  React.useEffect((): void => {
    if (offer !== undefined && offerRef.current !== null) {
      const first: HTMLButtonElement | null = offerRef.current.querySelector('button');
      if (first !== null) {
        first.focus();
      }
    }
  }, [offer]);

  const copiedLine = (copied: boolean): Line => ({ kind: 'status', text: copied ? CONCIERGE_COPIED : CONCIERGE_COPY_BY_HAND });

  const submit = React.useCallback(
    (event: React.FormEvent): void => {
      event.preventDefault();
      const typed: string = sentence.trim();
      if (typed === '') {
        setLine({ kind: 'alert', text: EMPTY_COMMAND });
        return;
      }
      if (concierge === undefined) {
        setLine({ kind: 'alert', text: CONCIERGE_NOT_SET_UP });
        return;
      }
      const introduced: boolean = conciergeIntroduced();
      // Opened while the click still counts as the person's own, so no browser holds it back as a pop-up.
      if (introduced) {
        openConcierge(concierge.chatUrl);
      }
      copyText(typed).then(
        (copied: boolean): void => {
          if (!mounted.current) {
            return;
          }
          if (introduced) {
            setLine(copiedLine(copied));
          } else {
            setOffer({ copied });
          }
        },
        (): void => undefined
      );
    },
    [sentence, concierge]
  );

  const openFromOffer = (): void => {
    if (concierge === undefined || offer === undefined) {
      return;
    }
    openConcierge(concierge.chatUrl);
    markConciergeIntroduced();
    setLine(copiedLine(offer.copied));
    setOffer(undefined);
  };

  return (
    <React.Fragment>
      <div className="ai-app-first">
        <div className="ai-app-hero">
          <p className="ai-app-hero-eyebrow">{`${organizationName} AI Center of Excellence`}</p>
          <p className="ai-app-hero-title">Make the next move.</p>
          <p className="ai-app-hero-text">
            Start with the work. A person reads every request, and every answer says what it rests on.
          </p>
          <form className="ai-app-command" onSubmit={submit}>
            <label className="ai-app-command-label" htmlFor="ai-app-command-input">
              What are you trying to get done?
            </label>
            <span className="ai-app-command-row">
              <input
                id="ai-app-command-input"
                className="ai-app-command-input"
                autoComplete="off"
                placeholder="What are you trying to get done?"
                value={sentence}
                onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setSentence(event.target.value)}
              />
              <button type="submit" className="ai-app-primary">
                {commandLabel}
              </button>
            </span>
          </form>
          {offer !== undefined && concierge !== undefined && (
            <div className="ai-app-concierge" role="dialog" aria-label={CONCIERGE_OPEN} ref={offerRef}>
              <p className="ai-app-concierge-text">
                {offer.copied ? 'Your question is copied. ' : 'Copy your question from the box first. '}
                {`Open the ${CONCIERGE_NAME} and paste it (Ctrl+V).`}
                {concierge.addUrl !== undefined && " Haven't added it yet? Add it first, then open it."}
              </p>
              <span className="ai-app-concierge-actions">
                {concierge.addUrl !== undefined && (
                  <button type="button" className="ai-app-secondary" onClick={(): void => openConcierge(concierge.addUrl as string)}>
                    Add it first
                  </button>
                )}
                <button type="button" className="ai-app-primary" onClick={openFromOffer}>
                  {CONCIERGE_OPEN}
                </button>
                <button type="button" className="ai-app-link-button" onClick={(): void => setOffer(undefined)}>
                  Cancel
                </button>
              </span>
            </div>
          )}
          <p className="ai-app-hero-micro" role={line.kind === 'hint' ? undefined : line.kind}>
            {line.text}
          </p>
        </div>
        <div className="ai-app-first-side">
          <AppStatusCard title="What this view can say" rows={status} />
        </div>
      </div>

      <ul className="ai-app-choices">
        {choices.map((choice: IEntryChoice): React.ReactElement => (
          <li key={choice.step} className={`ai-app-choice ai-app-choice--${CHOICE_TONES[choice.section] ?? 'teal'}`}>
            <button type="button" className="ai-app-choice-button" onClick={(): void => onChoose(choice.section)}>
              <span className="ai-app-choice-step">{choice.step}</span>
              <span className="ai-app-choice-title">{choice.title}</span>
              <span className="ai-app-choice-text">{choice.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </React.Fragment>
  );
}

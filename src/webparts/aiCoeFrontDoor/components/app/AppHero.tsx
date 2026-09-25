import * as React from 'react';
import type { AppSectionId, IEntryChoice } from '../../content/appSections';
import type { RoleId } from '../../content/roles';
import { AppCaseCard, AppSectionHead, AppStatusCard } from './kit';
import type { IAppCase, IStatusRow } from './kit';

/**
 * The first screen: the entry panel, what the view can tell you about itself, the three ways in, and what matters
 * to the person reading it.
 *
 * The command. The reference puts a sentence box above everything and names a provider on the button. Ours takes
 * the sentence and sends it to the guided request, which is the destination this build can actually reach: the
 * route list fails closed until a tenant proves somewhere better, and a box that promised more than that would be
 * the one dishonest thing on an otherwise careful screen. The button is named from the branding, never a provider.
 *
 * What matters now. The reference derives three cards from a role switcher. Ours derives them from the role the
 * site groups actually resolved, so the screen answers to membership rather than to a control anyone can change.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export interface IAppHeroProps {
  organizationName: string;
  choices: readonly IEntryChoice[];
  onChoose: (section: AppSectionId) => void;
  /**
   * Where a typed sentence goes: kept as the idea draft and opened in the guided request, in this instance. Resolves
   * with a complaint when the sentence could not be kept, so the box keeps it and says so rather than losing it.
   */
  onCommand: (sentence: string) => Promise<string | undefined>;
  /** The wording of the button, from the branding rather than a provider name. */
  commandLabel: string;
  role: RoleId;
  /** What the view can say about its own state, shown down the side. */
  status: readonly IStatusRow[];
  /** True while the membership read is in flight. */
  pending: boolean;
}

export const EMPTY_COMMAND: string = 'Say what you need done first.';
/** The alert when the draft store cannot keep the sentence: it stays in the box, and nothing opens or is sent. */
export const SAVE_FAILED_TEXT: string = 'Your draft save could not be confirmed, so the guided request did not open. Your sentence is still here; confirm the same draft or ask the owner for help.';

/** The three things that matter, by role. Each is true of this build, and none of them invents a record. */
const PRIORITIES: { [role in RoleId]: IAppCase[] } = {
  employee: [
    { reference: '01', title: 'Your next request', tone: 'info', state: 'Open to you', summary: 'Start from the work rather than a catalogue of tools. A person reads every request.' },
    { reference: '02', title: 'Your own status', tone: 'info', state: 'Open to you', summary: 'See what you have sent and where each one stands, without asking anyone.' },
    { reference: '03', title: 'How a task turned out', tone: 'info', state: 'Open to you', summary: 'Record an outcome in five choices. Nothing you typed or produced is kept.' }
  ],
  leader: [
    { reference: '01', title: 'What has been measured', tone: 'wait', state: 'Evidence gated', summary: 'A measure appears once someone records it with its evidence. An absent one says what it is waiting for.' },
    { reference: '02', title: 'What your teams asked for', tone: 'info', state: 'Open to you', summary: 'Requests are read by a person and their state is visible to whoever sent them.' },
    { reference: '03', title: 'What is not established', tone: 'wait', state: 'Awaiting source', summary: 'The view names the gaps rather than filling them with a plausible number.' }
  ],
  operator: [
    { reference: '01', title: 'The request queue', tone: 'info', state: 'Open to you', summary: 'Every request with its payload, in the order it arrived.' },
    { reference: '02', title: 'What the site is bound to', tone: 'design', state: 'Design candidate', summary: 'Which tenant inputs the provisioning run was given, and which it is still owed.' },
    { reference: '03', title: 'Marketing workflows', tone: 'design', state: 'Demo only', summary: 'Three workflows walked end to end with invented material, so the safeguards can be seen.' }
  ],
  designAuthority: [
    { reference: '01', title: 'What needs a decision', tone: 'wait', state: 'Awaiting you', summary: 'Only what cannot proceed inside the boundaries already agreed.' },
    { reference: '02', title: 'Material changes', tone: 'design', state: 'Review candidate', summary: 'Changes to the shape of the system, rather than routine progress.' },
    { reference: '03', title: 'Marketing workflows', tone: 'design', state: 'Demo only', summary: 'Three workflows walked end to end with invented material.' }
  ],
  marketingParticipant: [
    { reference: '01', title: 'Draft against permitted sources', tone: 'design', state: 'Synthetic only', summary: 'A brief, a plan or a follow-through drafted from the fixture register until a real one is approved.' },
    { reference: '02', title: 'Send a draft for review', tone: 'wait', state: 'Reviewer unbound', summary: 'A review is requested of a role; the real owner and approver are not bound yet.' },
    { reference: '03', title: 'Your own drafts', tone: 'info', state: 'Open to you', summary: 'Every revision you saved, with its state as the store derives it.' }
  ],
  marketingReviewer: [
    { reference: '01', title: 'Decisions waiting on you', tone: 'wait', state: 'Within your scope', summary: 'Only reviews of the kinds your bound authority covers, on the exact revision requested.' },
    { reference: '02', title: 'What a decision binds', tone: 'info', state: 'Exact content', summary: 'The revision, its hash and the register snapshot. A later edit needs a new decision.' },
    { reference: '03', title: 'What a decision permits', tone: 'design', state: 'Drafting only', summary: 'An acceptance unlocks the next draft. It sends, publishes, assigns and schedules nothing.' }
  ]
};

export function AppHero({
  organizationName,
  choices,
  onChoose,
  onCommand,
  commandLabel,
  role,
  status,
  pending
}: IAppHeroProps): React.ReactElement {
  const [sentence, setSentence] = React.useState<string>('');
  const [complaint, setComplaint] = React.useState<string>('');
  const [busy, setBusy] = React.useState<boolean>(false);
  const mounted: React.MutableRefObject<boolean> = React.useRef<boolean>(true);

  React.useEffect((): (() => void) => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);

  const submit = React.useCallback(
    (event: React.FormEvent): void => {
      event.preventDefault();
      const typed: string = sentence.trim();
      if (typed === '') {
        setComplaint(EMPTY_COMMAND);
        return;
      }
      setComplaint('');
      setBusy(true);
      onCommand(typed).then(
        (failure: string | undefined): void => {
          if (mounted.current) {
            setBusy(false);
            // The sentence stays in the box either way: on success the shell has opened the request with it.
            if (failure !== undefined) {
              setComplaint(failure);
            }
          }
        },
        (): void => {
          if (mounted.current) {
            setBusy(false);
            setComplaint(SAVE_FAILED_TEXT);
          }
        }
      );
    },
    [sentence, onCommand]
  );

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
              <button type="submit" className="ai-app-primary" disabled={busy}>
                {commandLabel}
              </button>
            </span>
          </form>
          <p className="ai-app-hero-micro" role={complaint === '' ? undefined : 'alert'}>
            {complaint === '' ? 'Your sentence is saved as a draft in the configured store and opens the guided request here. It is not submitted for review from this box.' : complaint}
          </p>
        </div>
        <div className="ai-app-first-side">
          <AppStatusCard title="What this view can say" rows={status} />
        </div>
      </div>

      <ul className="ai-app-choices">
        {choices.map((choice: IEntryChoice): React.ReactElement => (
          <li key={choice.step} className="ai-app-choice">
            <button type="button" className="ai-app-choice-button" onClick={(): void => onChoose(choice.section)}>
              <span className="ai-app-choice-step">{choice.step}</span>
              <span className="ai-app-choice-title">{choice.title}</span>
              <span className="ai-app-choice-text">{choice.description}</span>
            </button>
          </li>
        ))}
      </ul>

      <AppSectionHead
        title="What matters now"
        note={pending ? 'Shown for everyone while your access is being checked.' : 'Drawn from the role your site groups resolved, not from anything this page can change.'}
      />
      <ul className="ai-app-threes">
        {PRIORITIES[role].map((item: IAppCase): React.ReactElement => (
          <AppCaseCard key={item.reference} item={item} />
        ))}
      </ul>
    </React.Fragment>
  );
}

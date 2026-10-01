import * as React from 'react';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { UsageTelemetryStrip } from '../UsageTelemetryStrip';
import { AppCoreWorkspace } from './AppCoreWorkspace';
import { AppFlow, AppLayerCard, AppNotice, AppPanel, AppSectionHead, AppSteps } from './kit';
import type { IAppStep } from './kit';

/**
 * The remaining sections, composed from the kit.
 *
 * Everything written here is true of this build. The reference fills these screens with records, work units and
 * named people; reproducing those would put invented state in front of someone as though it were the site's, which
 * is the one thing a front door about evidence must not do. So the records come from the person's own list, and
 * the panels describe the pipeline this code actually runs.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** What the front door does to a request, in the order it happens. */
const REQUEST_FLOW: readonly string[] = ['You send it', 'Written to the list', 'Read back', 'Receipt', 'A person reads it'];

/** The three controls the shipped services already keep, each with whether it is in force. */
const TRUTH_CONTROLS: readonly IAppStep[] = [
  {
    marker: '1',
    title: 'Read back before it is called saved',
    note: 'A write is confirmed by reading the row back. A write that cannot be confirmed is reported as pending, never as saved.',
    tone: 'good',
    state: 'In force'
  },
  {
    marker: '2',
    title: 'A retry writes nothing twice',
    note: 'A retry carries the same record key, and the service looks for that key before writing anything.',
    tone: 'good',
    state: 'In force'
  },
  {
    marker: '3',
    title: 'You see only your own',
    note: 'The request read is filtered to the signed-in person and is never widened. What returns is decided by the list itself.',
    tone: 'good',
    state: 'In force'
  }
];

/** What happens to an improvement, from noticing it to measuring it. */
const IMPROVEMENT_FLOW: readonly string[] = ['Notice', 'Evidence', 'Propose', 'Test', 'Approve', 'Measure'];

/** The layers of this build, and honestly which of them exist yet. */
interface ILayer {
  layer: string;
  title: string;
  note: string;
}

const LAYERS: readonly ILayer[] = [
  { layer: 'Experience', title: 'This web part', note: 'One part, one page, the sections reached by the tabs above. It drafts, records and shows.' },
  { layer: 'Records', title: 'SharePoint lists', note: 'Requests, use cases, outcomes and measures. Item-level security decides what each person gets back.' },
  { layer: 'Identity', title: 'Site groups', note: 'The roles come from group membership, resolved once per page and never widened by this code.' },
  { layer: 'Drafting', title: 'A flow you configure', note: 'The idea page can call a flow when a URL is set. Blank keeps plain summaries, which is the default.' },
  { layer: 'Provisioning', title: 'A script an owner runs', note: 'Pages, lists, permissions and the content document. It runs outside this code, against a site you name.' },
  { layer: 'Telemetry', title: 'Usage lists', note: 'The operator view reads them. Nothing in this package writes them; a companion solution does.' },
  { layer: 'CORE Binding A', title: 'Command list + polling', note: 'Typed client, validators and a synthetic local engine are built. Live SharePoint writes stay gated until native defects and bindings are independently verified.' },
  { layer: 'Control', title: 'A person', note: 'Sending, publishing, assigning and scheduling stay outside this part, behind their own authority.' }
];

/**
 * The explanatory panels at the foot of Requests, Improvement and Cases (1.0.0.18): kept, but behind one disclosure
 * that starts closed, so the section opens on what a person came to do. The panels are not mounted until it opens.
 */
export const WHAT_IS_GOING_ON: string = 'What is going on?';

export function AppWhatIsGoingOn({ section, children }: { section: string; children: React.ReactNode }): React.ReactElement {
  const [open, setOpen] = React.useState<boolean>(false);
  const id: string = `ai-app-going-on-${section}`;
  return (
    <div className="ai-app-going-on">
      <button
        type="button"
        className="ai-app-going-on-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={(): void => setOpen(!open)}
      >
        {WHAT_IS_GOING_ON}
      </button>
      {open && (
        <div id={id} className="ai-app-going-on-body" role="region" aria-label={WHAT_IS_GOING_ON}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The cases the AI CoE is deciding. A leader gets the case analysis panel first, handed in by the shell only when the
 * role holds it; then the case workspace when one is configured. The person's own requests moved to Requests in
 * 1.0.0.18, and the panels that explain the pipeline sit under "What is going on?".
 */
export function AppCases({ onDirtyChange, analysis }: { onDirtyChange?: (dirty: boolean) => void; analysis?: React.ReactNode }): React.ReactElement {
  const { services } = useFrontDoor();
  return (
    <React.Fragment>
      {analysis}
      {services.coreWork !== undefined && <AppCoreWorkspace coreWork={services.coreWork} onDirtyChange={onDirtyChange} />}
      <AppWhatIsGoingOn section="cases">
        <div className="ai-app-split ai-app-cases-explanation">
          <AppPanel>
            <AppSectionHead title="What happens to a request" />
            <AppFlow label="What happens to a request" steps={REQUEST_FLOW} />
            <p className="ai-app-note">No step here sends a message or changes anything outside the list.</p>
          </AppPanel>
          <AppPanel>
            <AppSectionHead title="Truth controls" />
            <AppSteps steps={TRUTH_CONTROLS} />
          </AppPanel>
        </div>
      </AppWhatIsGoingOn>
    </React.Fragment>
  );
}

/**
 * Requests (1.0.0.18): two columns, the person's own requests on the left and the request forms stacked on the right,
 * with anything else the section shows (`below`) under them and the explanation under "What is going on?".
 */
export function AppEngineering({ mine, starters, below }: { mine: React.ReactNode; starters: React.ReactNode; below?: React.ReactNode }): React.ReactElement {
  return (
    <React.Fragment>
      <AppGettingStarted section="engineering" />
      <div className="ai-app-requests">
        <div className="ai-app-requests-mine">{mine}</div>
        <div className="ai-app-requests-start">
          <AppSectionHead
            title="Start a request"
            note="A few short questions and a summary a person can act on. Nothing is submitted until you confirm it."
          />
          {starters}
        </div>
      </div>
      {below}
      <AppWhatIsGoingOn section="requests">
        <div className="ai-app-split">
          <AppPanel>
            <AppSectionHead title="What the front door does with it" />
            <AppFlow label="What the front door does with a request" steps={REQUEST_FLOW} />
          </AppPanel>
          <AppPanel>
            <AppSectionHead title="What it will not do" />
            <AppNotice>
              It does not decide your request or send anything on your behalf. It records what you asked for and shows
              you where it stands.
            </AppNotice>
          </AppPanel>
        </div>
      </AppWhatIsGoingOn>
    </React.Fragment>
  );
}

/** Recording how things went, and what happens to what you record. */
export function AppImprovement({ starters }: { starters: React.ReactNode }): React.ReactElement {
  return (
    <React.Fragment>
      <AppSectionHead
        title="Tell the AI CoE what happened"
        note="How a task turned out, or what is not working."
      />
      <AppGettingStarted section="improvement" />
      {starters}
      <AppWhatIsGoingOn section="improvement">
      <div className="ai-app-split">
        <AppPanel>
          <AppSectionHead title="What happens to what you record" note="Proposed manual improvement path — not automatic promotion." />
          <AppFlow label="Proposed manual improvement path" steps={IMPROVEMENT_FLOW} />
          <p className="ai-app-note">No automatic policy change or enterprise learning loop is implemented here. A proposal is not a policy.</p>
          <ol>
            <li>Record a task outcome above: fixed choices only, not prompts or output.</li>
            <li>Use Share feedback above to propose the smallest correction. Name the confusing step or correction category, not private work. Save its receipt.</li>
            <li>An authorized owner links that feedback reference to the existing decision record, permitted evidence, proposed change, approver and retest scope. This is manual follow-through, not automatic assignment.</li>
            <li>After an approved repair, repeat the same permitted task and a failure/recovery case. Keep the retest receipt with the original feedback reference; report another outcome only for a distinct task attempt.</li>
            <li>The decision authority reviews evidence before any change is approved. An operator reconciles measurement separately; no click here promotes feedback or expands permissions.</li>
          </ol>
        </AppPanel>
        <AppPanel>
          <AppSectionHead title="What an outcome keeps" />
          <AppNotice tone="info">
            Every answer is a choice from a fixed list, so the row holds no prompt, no output and no text of the work
            itself. Your name is not written to it either; the list records who saved the row, as it does for every row.
          </AppNotice>
        </AppPanel>
      </div>
      </AppWhatIsGoingOn>
    </React.Fragment>
  );
}

/** Client-neutral adaptation; source provenance stays in the operator document, outside the bundle. */
function AppGettingStarted({ section }: { section: 'engineering' | 'improvement' }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const id = `ai-${section}-quick-start`;
  const title = 'Getting started: safe task and review';
  return (
    <AppPanel>
      <button type="button" className="ai-app-starter-button" aria-expanded={open} aria-controls={id} onClick={(): void => setOpen(!open)}>{title}</button>
      {open && <section id={id} role="region" aria-label={title}>
        <p>Start with one small permitted task, not a product. A demonstration uses invented material and is not live acceptance.</p>
        <ol>
          <li>Minutes 0–2: confirm your own identity, intended audience and approved destination. Use Check a tool or task in Requests if permission is unclear.</li>
          <li>Minutes 2–4: identify current permitted sources and their versions. Supply only the minimum allowed context; label missing facts. Do not paste secrets, personal information or restricted client material.</li>
          <li>Minutes 4–7: use the permitted draft route. In Marketing, if your role permits it, start with a campaign brief, then an accepted brief for a content plan, or permitted meeting notes for draft follow-through. The labelled synthetic workspace is practice only.</li>
          <li>Minutes 7–9: verify claims, numbers, dates, sources, audience, voice and proposed commitments. Correct or stop if they cannot be supported. A draft is not permission to send, publish, assign, schedule or change production records.</li>
          <li>Minutes 9–10: in Improvement choose Record a task outcome: Accepted after review, Corrected after material correction, Unavailable for missing source/access, or Stopped for unsafe or unclear work. Never copy prompt or output text into measurement.</li>
        </ol>
        <h4>Role start</h4>
        <ul>
          <li>Employee: use only your approved sources and scope; retain the save/readback reference.</li>
          <li>Reviewer: use your own authorized review entry; check the exact artifact version and required review kind. Request corrections rather than accepting unsupported work.</li>
          <li>Champion: teach one permitted task and its fallback. You are not another person’s approver and cannot grant access. Use synthetic material when the audience’s access is uncertain.</li>
          <li>Operator: reconcile receipts and privacy before reporting counts. Participation, repeated use, safety, time saved and cost are not established by task volume.</li>
        </ul>
        <h4>Stop and recover</h4>
        <p>Stop for wrong identity, audience, missing sources, someone else’s information, an unsupported claim or an unexpected external action. Do not widen access. Use the named support route in the footer; if it is unbound, business commissioning remains incomplete. Get help or training in Requests records a request, not an emergency response.</p>
        <p>If a save is pending or an action is uncertain, retain its reference and reconcile the source-native state with the recovery owner before retrying the same intent. Do not create a new submission merely because confirmation is missing. Use the approved manual draft fallback only; do not bypass a refused route.</p>
        <h4>Teach-back and office hours</h4>
        <p>Explain permitted information, human review and the human decision. Demonstrate one safe task and one missing-source fallback. Ask a colleague to start, review, identify the stop condition and find help using their own identity. Keep content-free correction themes and outcome choices. A named champion, support owner and authorized two-user/no-builder exercise are still required; local tests are not that acceptance.</p>
        <p>{section === 'improvement' ? 'Use the Record a task outcome and Share feedback controls immediately below. The proposal and retest steps follow them.' : 'Use the request forms beside My requests: Check a tool or task, Register team AI use and Get help or training. For feedback and outcomes, choose the Improvement tab.'}</p>
      </section>}
    </AppPanel>
  );
}


/** What is connected, what it may do, and what is honestly not built. */
export function AppSystemMap({ admin }: { admin?: React.ReactNode }): React.ReactElement {
  return (
    <React.Fragment>
      <AppSectionHead
        title="What is connected"
        note="Each layer names what it actually does in this build. The last one names what is not built here at all."
      />
      <ul className="ai-app-fours">
        {LAYERS.map((layer: ILayer): React.ReactElement => (
          <AppLayerCard key={layer.layer} layer={layer.layer} title={layer.title} note={layer.note} />
        ))}
      </ul>
      <AppNotice>
        A connection existing is not permission to use it, and a list being readable is not proof a figure in it was
        measured. Each route is qualified on its own.
      </AppNotice>
      {admin}
    </React.Fragment>
  );
}

/** The usage lists, shown on Metrics when the person already holds that read. */
export function AppUsage(): React.ReactElement {
  return (
    <AppPanel>
      <AppSectionHead title="Usage" note="Read from the usage lists. Nothing in this package writes them." />
      <UsageTelemetryStrip />
    </AppPanel>
  );
}

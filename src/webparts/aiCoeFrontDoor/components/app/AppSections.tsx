import * as React from 'react';
import { MyWork } from '../pages/MyWork';
import { UsageTelemetryStrip } from '../UsageTelemetryStrip';
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
  { layer: 'Not connected', title: 'The wider system', note: 'Case records, work units and a canonical store are described in the engineering package and are not built here.' },
  { layer: 'Control', title: 'A person', note: 'Sending, publishing, assigning and scheduling stay outside this part, behind their own authority.' }
];

/**
 * A person's own requests, plus the controls that decide what they see.
 *
 * No head of its own: the shell already names the section and the reused list names itself, so a third heading here
 * said the same thing a third time. What it carried - that only your own rows are read - is a control rather than a
 * caption, and the panel beside it states it as one.
 */
export function AppCases(): React.ReactElement {
  return (
    <React.Fragment>
      <div className="ai-app-cases">
        <MyWork />
      </div>
      <div className="ai-app-split">
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
    </React.Fragment>
  );
}

/** The guided requests, and what the front door does with one. */
export function AppEngineering({ starters }: { starters: React.ReactNode }): React.ReactElement {
  return (
    <React.Fragment>
      <AppSectionHead
        title="Start a guided request"
        note="Four short questions and a summary a person can act on. Nothing is submitted until you confirm it."
      />
      {starters}
      <div className="ai-app-split">
        <AppPanel>
          <AppSectionHead title="What the front door does with it" />
          <AppFlow label="What the front door does with a request" steps={REQUEST_FLOW} />
        </AppPanel>
        <AppPanel>
          <AppSectionHead title="What it will not do" />
          <AppNotice>
            It does not decide your request, tell you a tool is approved, or send anything on your behalf. It records
            what you asked for and shows you where it stands.
          </AppNotice>
        </AppPanel>
      </div>
    </React.Fragment>
  );
}

/** Recording how things went, and what happens to what you record. */
export function AppImprovement({ starters }: { starters: React.ReactNode }): React.ReactElement {
  return (
    <React.Fragment>
      <AppSectionHead
        title="Tell the AI CoE what happened"
        note="How a task turned out, how your team is using AI, or what is not working."
      />
      {starters}
      <div className="ai-app-split">
        <AppPanel>
          <AppSectionHead title="What happens to what you record" />
          <AppFlow label="What happens to what you record" steps={IMPROVEMENT_FLOW} />
          <p className="ai-app-note">A proposal is not a policy. Nothing you record here changes what anyone is told is allowed.</p>
        </AppPanel>
        <AppPanel>
          <AppSectionHead title="What an outcome keeps" />
          <AppNotice tone="info">
            Every answer is a choice from a fixed list, so the row holds no prompt, no output and no text of the work
            itself. Your name is not written to it either; the list records who saved the row, as it does for every row.
          </AppNotice>
        </AppPanel>
      </div>
    </React.Fragment>
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
      <AppPanel>
        <AppSectionHead title="Usage" note="Read from the usage lists. Nothing in this package writes them." />
        <UsageTelemetryStrip />
      </AppPanel>
      {admin}
    </React.Fragment>
  );
}

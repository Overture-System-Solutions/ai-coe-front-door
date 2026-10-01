import * as React from 'react';
import { StatusPill } from '../../controls/StatusPill';
import { checkCopy } from '../../content/marketing/copyPolicy';
import type { ICopyCheckResult, ICopyFinding } from '../../content/marketing/copyPolicy';
import {
  DEMO_ACTION_PROPOSALS,
  DEMO_ASSETS,
  DEMO_AUDIENCE,
  DEMO_BRIEF_CHANGES,
  DEMO_CALENDAR,
  DEMO_CHANNELS,
  DEMO_COPY_REVIEWER,
  DEMO_COPY_VARIANTS,
  DEMO_DECISIONS,
  DEMO_DEPENDENCIES,
  DEMO_EVIDENCE_GAPS,
  DEMO_MEETING_NOTES,
  DEMO_MEETING_OWNER,
  DEMO_MESSAGE,
  DEMO_NOTICE,
  DEMO_OBJECTIVE,
  DEMO_PAIN_POINTS,
  DEMO_PROPOSED_OWNERS,
  DEMO_REVIEW_NEEDS,
  DEMO_SHORT,
  DEMO_STRATEGY_REVIEWER,
  DEMO_UNRESOLVED,
  DEMO_WORKFLOWS
} from '../../content/marketing/demoData';
import { MARKETING_WORKFLOW_IDS, STAGE_LABEL, STAGE_STATE, demoReference, lockReason, reduce } from '../../content/marketing/demoJourney';
import type { DemoEvent, DemoJourneys, IDemoState, MarketingWorkflowId } from '../../content/marketing/demoJourney';
import { FIXTURE_REGISTER } from '../../content/marketing/sourceRegister';
import type { ISourceEntry } from '../../content/marketing/sourceRegister';
import type { ICalendarEntry, IClaim } from '../../content/marketing/campaignBrief';
import type { PillState } from '../../controls/StatusPill';
import { useFrontDoor } from '../../context/FrontDoorContext';
import type { IMarketingServices } from '../../services/marketing/marketingServices';
import type { IRoleResolution } from '../../services/roleResolver';
import { AppMarketingWorkspace } from './AppMarketingWorkspace';
import { AppNotice } from './kit';

/**
 * The Marketing section: two clearly separated modes.
 *
 * The **synthetic workspace** is the implementation: the three drafting operations, the source gate, the review
 * protocol and the durable store, over a fixture register and a deterministic provider. It is the default when the
 * web part has the Marketing services.
 *
 * The **labelled demonstration** is the earlier walkthrough kept as it was: prepared text after a pause, fictional
 * reviewer buttons, no service. Its state now lives in the shell rather than here (review finding FD03), so
 * leaving the section and returning finds it where it was; it is still a demonstration, and every screen says so.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** How long the pretend drafting takes. Long enough to read as work, short enough not to annoy. */
const DRAFT_PAUSE_MS: number = 900;

export type MarketingMode = 'workspace' | 'demo';

export interface IAppMarketingProps {
  demo: DemoJourneys;
  onDemoChange: (next: DemoJourneys) => void;
  resolution: IRoleResolution;
}

export const NO_MARKETING_SERVICES_TEXT: string = 'The Marketing services are not wired on this instance, so only the labelled demonstration is available.';

export function AppMarketing({ demo, onDemoChange, resolution }: IAppMarketingProps): React.ReactElement {
  const { services } = useFrontDoor();
  const marketing: IMarketingServices | undefined = services.marketing;
  const [mode, setMode] = React.useState<MarketingMode>(marketing === undefined ? 'demo' : 'workspace');

  return (
    <div className="ai-app-marketing">
      <div className="ai-app-modes" role="group" aria-label="Marketing mode">
        <button type="button" className={`ai-app-mode${mode === 'workspace' ? ' ai-app-mode--on' : ''}`} aria-pressed={mode === 'workspace'} onClick={(): void => setMode('workspace')} disabled={marketing === undefined}>
          Synthetic workspace
        </button>
        <button type="button" className={`ai-app-mode${mode === 'demo' ? ' ai-app-mode--on' : ''}`} aria-pressed={mode === 'demo'} onClick={(): void => setMode('demo')}>
          Labelled demonstration
        </button>
      </div>
      {marketing === undefined && <AppNotice tone="info">{NO_MARKETING_SERVICES_TEXT}</AppNotice>}
      {mode === 'workspace' && marketing !== undefined ? <AppMarketingWorkspace marketing={marketing} resolution={resolution} /> : <DemoWalkthrough journeys={demo} onChange={onDemoChange} />}
    </div>
  );
}

interface IDemoWalkthroughProps {
  journeys: DemoJourneys;
  onChange: (next: DemoJourneys) => void;
}

/**
 * The demonstration. Nothing here calls a service, a provider or a tenant. Drafting is a short wait and then
 * prepared text. Reviewing is a button pressed by whoever is sitting there, labelled with a fictional reviewer.
 * The state is the shell's, handed in, so navigation keeps it; it is still not persistence, and the screen says so.
 */
function DemoWalkthrough({ journeys, onChange }: IDemoWalkthroughProps): React.ReactElement {
  const [open, setOpen] = React.useState<MarketingWorkflowId | undefined>(undefined);
  const timers: React.MutableRefObject<number[]> = React.useRef<number[]>([]);
  const latest: React.MutableRefObject<DemoJourneys> = React.useRef<DemoJourneys>(journeys);
  latest.current = journeys;

  const send = React.useCallback(
    (id: MarketingWorkflowId, event: DemoEvent): void => {
      const current: DemoJourneys = latest.current;
      const next: DemoJourneys = { ...current, [id]: reduce(current[id], event) };
      latest.current = next;
      onChange(next);
    },
    [onChange]
  );

  const armTimer = React.useCallback(
    (id: MarketingWorkflowId): void => {
      const handle: number = window.setTimeout((): void => send(id, { type: 'draftReady' }), DRAFT_PAUSE_MS);
      timers.current.push(handle);
    },
    [send]
  );

  // A journey left mid-draft (the person moved to another section) finishes drafting when the walkthrough returns.
  React.useEffect((): (() => void) => {
    for (const id of MARKETING_WORKFLOW_IDS) {
      if (journeys[id].stage === 'drafting') {
        armTimer(id);
      }
    }
    return (): void => {
      for (const handle of timers.current) {
        window.clearTimeout(handle);
      }
      timers.current = [];
    };
    // Arm once on mount for whatever was mid-draft; later drafts arm themselves in startDraft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDraft = React.useCallback(
    (id: MarketingWorkflowId): void => {
      send(id, { type: 'draft' });
      armTimer(id);
    },
    [send, armTimer]
  );

  if (open !== undefined) {
    return (
      <WorkflowDetail
        id={open}
        state={journeys[open]}
        briefVersion={journeys.campaignBrief.version}
        onBack={(): void => setOpen(undefined)}
        onDraft={(): void => startDraft(open)}
        onSubmit={(): void => send(open, { type: 'submitForReview' })}
        onAccept={(): void =>
          send(open, {
            type: 'accept',
            reference: demoReference(open, journeys[open].version),
            briefVersion: open === 'contentPlan' ? journeys.campaignBrief.version : undefined
          })
        }
        onRequestChanges={(): void => send(open, { type: 'requestChanges', note: 'Hold the availability claim until it has an approved source.' })}
        onReset={(): void => send(open, { type: 'reset' })}
      />
    );
  }

  return (
    <React.Fragment>
      <DemoBanner />
      <ul className="ai-app-starters">
        {MARKETING_WORKFLOW_IDS.map((id: MarketingWorkflowId): React.ReactElement => {
          const locked: string | undefined = lockReason(id, journeys);
          const state: IDemoState = journeys[id];
          return (
            <li key={id} className="ai-app-starter">
              <button type="button" className="ai-app-starter-button" onClick={(): void => setOpen(id)} disabled={locked !== undefined && state.stage === 'start'}>
                <span className="ai-app-starter-title">{DEMO_WORKFLOWS[id].title}</span>
                <span className="ai-app-stage">
                  <StatusPill state={STAGE_STATE[state.stage] as PillState} label={STAGE_LABEL[state.stage]} />
                </span>
                <span className="ai-app-starter-text">{DEMO_WORKFLOWS[id].summary}</span>
                {locked !== undefined && <span className="ai-app-lock">{locked}</span>}
                {state.reference !== undefined && <span className="ai-app-reference">{`Saved as ${state.reference}`}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <MarketingStatus journeys={journeys} />
    </React.Fragment>
  );
}

function DemoBanner(): React.ReactElement {
  return (
    <p className="ai-app-demo-banner" role="note">
      <span className="ai-app-demo-flag">{DEMO_SHORT}</span>
      <span className="ai-app-demo-text">{DEMO_NOTICE}</span>
    </p>
  );
}

interface IDetailProps {
  id: MarketingWorkflowId;
  state: IDemoState;
  briefVersion: number;
  onBack: () => void;
  onDraft: () => void;
  onSubmit: () => void;
  onAccept: () => void;
  onRequestChanges: () => void;
  onReset: () => void;
}

function WorkflowDetail(props: IDetailProps): React.ReactElement {
  const { id, state } = props;
  const copy = DEMO_WORKFLOWS[id];
  const heading: React.RefObject<HTMLHeadingElement> = React.useRef<HTMLHeadingElement>(null);
  React.useEffect((): void => {
    if (heading.current !== null) {
      heading.current.focus();
    }
  }, []);

  return (
    <div className="ai-app-detail">
      <button type="button" className="ai-app-back" onClick={props.onBack}>
        Back to the Marketing workflows
      </button>
      <DemoBanner />
      <h3 className="ai-app-detail-title" tabIndex={-1} ref={heading}>
        {copy.title}
      </h3>
      <StatusPill state={STAGE_STATE[state.stage] as PillState} label={STAGE_LABEL[state.stage]} />
      <dl className="ai-app-contract">
        <dt>What it takes</dt>
        <dd>{copy.input}</dd>
        <dt>Who decides</dt>
        <dd>{copy.humanDecision}</dd>
        <dt>What counts as a pass</dt>
        <dd>{copy.pass}</dd>
      </dl>

      {state.stage === 'start' && <StartPanel id={id} onDraft={props.onDraft} startLabel={copy.startLabel} />}
      {state.stage === 'drafting' && (
        <p className="ai-app-note" role="status">
          Drafting… this is a pause and some prepared text, not a model.
        </p>
      )}
      {(state.stage === 'draft' || state.stage === 'review') && <DraftPanel id={id} version={state.version} />}
      {state.stage === 'draft' && (
        <div className="ai-app-actions">
          <button type="button" className="ai-app-primary" onClick={props.onSubmit}>
            Send for review
          </button>
        </div>
      )}
      {state.stage === 'review' && <ReviewPanel id={id} onAccept={props.onAccept} onRequestChanges={props.onRequestChanges} />}
      {state.stage === 'changesRequested' && (
        <div className="ai-app-panel ai-app-panel--caution">
          <p className="ai-app-note">{`${DEMO_STRATEGY_REVIEWER} asked for a change: ${state.reviewNote ?? ''}`}</p>
          <div className="ai-app-actions">
            <button type="button" className="ai-app-primary" onClick={props.onDraft}>
              Draft again
            </button>
          </div>
        </div>
      )}
      {state.stage === 'saved' && (
        <div className="ai-app-panel">
          <p className="ai-app-note">{`Kept in this page as ${state.reference ?? ''}, version ${state.version}. Nothing left the browser; a reload starts the demonstration again.`}</p>
          {state.elaboratedBriefVersion !== undefined && <p className="ai-app-note">{`Elaborated from campaign brief version ${state.elaboratedBriefVersion}, which it does not overwrite.`}</p>}
          <div className="ai-app-actions">
            <button type="button" className="ai-app-secondary" onClick={props.onReset}>
              Start this demo again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StartPanel({ id, onDraft, startLabel }: { id: MarketingWorkflowId; onDraft: () => void; startLabel: string }): React.ReactElement {
  return (
    <div className="ai-app-panel">
      <h4 className="ai-app-subheading">What this run would read</h4>
      {id === 'meetingFollowThrough' ? (
        <React.Fragment>
          <p className="ai-app-field-label">Meeting notes (invented)</p>
          <p className="ai-app-quote">{DEMO_MEETING_NOTES}</p>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <p className="ai-app-field-label">Approved objective (invented)</p>
          <p className="ai-app-quote">{DEMO_OBJECTIVE}</p>
        </React.Fragment>
      )}
      <p className="ai-app-field-label">{`Permitted sources — register ${FIXTURE_REGISTER.registerId}, version ${FIXTURE_REGISTER.version}`}</p>
      <ul className="ai-app-sources">
        {FIXTURE_REGISTER.entries.map((entry: ISourceEntry): React.ReactElement => (
          <li key={entry.id} className="ai-app-source">
            <span className="ai-app-source-id">{entry.id}</span>
            <span className="ai-app-source-note">{`${entry.classification}. May not prove: ${entry.mayNotProve}`}</span>
          </li>
        ))}
      </ul>
      <p className="ai-app-note">This register is a synthetic fixture, so a real run would stop here. The demo carries on so the rest of the journey can be seen.</p>
      <div className="ai-app-actions">
        <button type="button" className="ai-app-primary" onClick={onDraft}>
          {startLabel}
        </button>
      </div>
    </div>
  );
}

function DraftPanel({ id, version }: { id: MarketingWorkflowId; version: number }): React.ReactElement {
  return (
    <div className="ai-app-panel">
      <h4 className="ai-app-subheading">{`Draft, version ${version}`}</h4>
      {id === 'campaignBrief' && <BriefBody />}
      {id === 'contentPlan' && <PlanBody />}
      {id === 'meetingFollowThrough' && <FollowThroughBody />}
    </div>
  );
}

function ClaimList({ claims }: { claims: IClaim[] }): React.ReactElement {
  return (
    <ul className="ai-app-claims">
      {claims.map((claim: IClaim, index: number): React.ReactElement => {
        const check: ICopyCheckResult = checkCopy(claim.text, { cited: claim.sources.length > 0 });
        return (
          <li key={index} className="ai-app-claim">
            <span className="ai-app-claim-text">{claim.text}</span>
            {claim.sources.length > 0 ? (
              <span className="ai-app-cite">{`Cites ${claim.sources.map((s: { sourceId: string }): string => s.sourceId).join(', ')}`}</span>
            ) : (
              <span className="ai-app-cite ai-app-cite--gap">
                <StatusPill state="needsAccess" label={claim.unknown ?? 'UNKNOWN'} />
                <span>No approved source, so the claim is marked rather than made.</span>
              </span>
            )}
            {check.findings.map((finding: ICopyFinding, spot: number): React.ReactElement => (
              <span key={spot} className="ai-app-finding">{`Copy policy: “${finding.found}” — ${finding.note}`}</span>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

function Section({ title, items }: { title: string; items: string[] }): React.ReactElement {
  return (
    <React.Fragment>
      <h5 className="ai-app-subheading">{title}</h5>
      {items.length === 0 ? (
        <p className="ai-app-empty">Nothing recorded here.</p>
      ) : (
        <ul className="ai-app-list">
          {items.map((item: string, index: number): React.ReactElement => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </React.Fragment>
  );
}

function BriefBody(): React.ReactElement {
  return (
    <React.Fragment>
      <Section title="Audience" items={DEMO_AUDIENCE} />
      <Section title="Pain points" items={DEMO_PAIN_POINTS} />
      <h5 className="ai-app-subheading">Message</h5>
      <ClaimList claims={DEMO_MESSAGE} />
      <Section title="Channel plan" items={DEMO_CHANNELS} />
      <h5 className="ai-app-subheading">Content calendar</h5>
      <ul className="ai-app-list">
        {DEMO_CALENDAR.map((entry: ICalendarEntry, index: number): React.ReactElement => (
          <li key={index}>{`${entry.phase} — week ${entry.weekOffset}: ${entry.item}`}</li>
        ))}
      </ul>
      <p className="ai-app-note">Weeks count from the campaign start. No date is set and no calendar entry is created.</p>
      <Section title="Evidence gaps" items={DEMO_EVIDENCE_GAPS} />
      <Section title="Review needs" items={DEMO_REVIEW_NEEDS} />
      <h5 className="ai-app-subheading">Proposed owners</h5>
      <ul className="ai-app-list">
        {DEMO_PROPOSED_OWNERS.map((owner: { role: string; note: string }, index: number): React.ReactElement => (
          <li key={index}>{`${owner.role} — ${owner.note}`}</li>
        ))}
      </ul>
      <p className="ai-app-note">A role, never a person. Nothing here allocates work to anybody.</p>
      <Section title="Dependencies" items={DEMO_DEPENDENCIES} />
    </React.Fragment>
  );
}

function PlanBody(): React.ReactElement {
  return (
    <React.Fragment>
      <h5 className="ai-app-subheading">Asset register</h5>
      <ul className="ai-app-list">
        {DEMO_ASSETS.map((asset: { name: string; channel: string; note: string }, index: number): React.ReactElement => (
          <li key={index}>{`${asset.name} (${asset.channel}) — ${asset.note}`}</li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Copy variants</h5>
      <ul className="ai-app-variants">
        {DEMO_COPY_VARIANTS.map((variant, index: number): React.ReactElement => {
          // Demonstration copy is uncited on purpose: the figure check shows what a real run would catch.
          const check: ICopyCheckResult = checkCopy(`${variant.headline} ${variant.body}`, { cited: false });
          return (
            <li key={index} className="ai-app-variant">
              <span className="ai-app-field-label">{variant.audience}</span>
              <span className="ai-app-variant-headline">{variant.headline}</span>
              <span className="ai-app-claim-text">{variant.body}</span>
              <span className="ai-app-cite">{`One action: ${variant.action}`}</span>
              <span className="ai-app-cite">{`Release gate: ${variant.gate}`}</span>
              {check.findings.map((finding: ICopyFinding, spot: number): React.ReactElement => (
                <span key={spot} className="ai-app-finding">{`Copy policy: “${finding.found}” — ${finding.note}`}</span>
              ))}
            </li>
          );
        })}
      </ul>
      <p className="ai-app-note">Approved copy is not permission to send it. Nothing is published from here.</p>
    </React.Fragment>
  );
}

function FollowThroughBody(): React.ReactElement {
  return (
    <React.Fragment>
      <Section title="Decisions" items={DEMO_DECISIONS} />
      <h5 className="ai-app-subheading">Action proposals</h5>
      <ul className="ai-app-list">
        {DEMO_ACTION_PROPOSALS.map((item: { proposal: string; suggestedRole: string }, index: number): React.ReactElement => (
          <li key={index}>{`${item.proposal} — suggested for ${item.suggestedRole}, not assigned.`}</li>
        ))}
      </ul>
      <Section title="Brief changes" items={DEMO_BRIEF_CHANGES} />
      <Section title="Unresolved questions" items={DEMO_UNRESOLVED} />
      <p className="ai-app-note">{`${DEMO_MEETING_OWNER} would accept decisions and actions; ${DEMO_COPY_REVIEWER} would send anything that goes out. Neither happens here.`}</p>
    </React.Fragment>
  );
}

function ReviewPanel({ id, onAccept, onRequestChanges }: { id: MarketingWorkflowId; onAccept: () => void; onRequestChanges: () => void }): React.ReactElement {
  const reviewer: string = id === 'contentPlan' ? DEMO_COPY_REVIEWER : id === 'meetingFollowThrough' ? DEMO_MEETING_OWNER : DEMO_STRATEGY_REVIEWER;
  return (
    <div className="ai-app-panel ai-app-panel--review">
      <h4 className="ai-app-subheading">Review</h4>
      <p className="ai-app-note">{`Standing in for ${reviewer}. In a real run this decision belongs to a named person with the authority to make it, and that identity is not bound yet.`}</p>
      <div className="ai-app-actions">
        <button type="button" className="ai-app-primary" onClick={onAccept}>
          Accept
        </button>
        <button type="button" className="ai-app-secondary" onClick={onRequestChanges}>
          Request changes
        </button>
      </div>
    </div>
  );
}

function MarketingStatus({ journeys }: { journeys: DemoJourneys }): React.ReactElement {
  const saved: MarketingWorkflowId[] = MARKETING_WORKFLOW_IDS.filter((id: MarketingWorkflowId): boolean => journeys[id].stage === 'saved');
  return (
    <div className="ai-app-panel">
      <h4 className="ai-app-subheading">Status</h4>
      {saved.length === 0 ? (
        <p className="ai-app-empty">Nothing kept yet. Finish a workflow and it will be listed here with its reference.</p>
      ) : (
        <ul className="ai-app-list">
          {saved.map((id: MarketingWorkflowId): React.ReactElement => (
            <li key={id}>{`${DEMO_WORKFLOWS[id].title} — ${journeys[id].reference ?? ''}, version ${journeys[id].version}`}</li>
          ))}
        </ul>
      )}
      <p className="ai-app-note">Kept means kept in this page while it is open: leaving the section and coming back finds it, a reload does not. Durable records are the synthetic workspace's job.</p>
    </div>
  );
}

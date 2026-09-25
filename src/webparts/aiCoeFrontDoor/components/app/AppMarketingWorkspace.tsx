import * as React from 'react';
import { decide } from '../../services/authorization';
import { StatusPill } from '../../controls/StatusPill';
import { ARTIFACT_STATE_LABEL } from '../../content/marketing/artifactEnvelope';
import type { ArtifactState, IMarketingArtifactEnvelopeV1, IMarketingReviewDecisionV1 } from '../../content/marketing/artifactEnvelope';
import type { ArtifactKind, IArtifactRef, IDependency, IProposedOwnerForScope, IReviewRequirement, ISourceLocator, ReviewKind } from '../../content/marketing/artifactTypes';
import { parseCampaignBrief } from '../../content/marketing/campaignBrief';
import type { ICalendarEntry, IClaim, IClaimMapEntry, ICampaignBriefV1, IProposedOwner } from '../../content/marketing/campaignBrief';
import { parseContentPlan } from '../../content/marketing/contentPlan';
import type { IAsset, IContentPlanV1, ICopyVariant, IPlanCalendarEntry } from '../../content/marketing/contentPlan';
import { checkCopy } from '../../content/marketing/copyPolicy';
import type { ICopyCheckResult, ICopyFinding } from '../../content/marketing/copyPolicy';
import { parseMeetingFollowThrough } from '../../content/marketing/meetingFollowThrough';
import type { IActionProposal, IBriefChangeProposal, ICommunicationDraft, IDecisionProposal, IMeetingFollowThroughV1, IUnresolvedQuestion } from '../../content/marketing/meetingFollowThrough';
import { FIXTURE_MEETING_NOTES, FIXTURE_REGISTER } from '../../content/marketing/sourceRegister';
import type { ISourceEntry } from '../../content/marketing/sourceRegister';
import { useFrontDoor } from '../../context/FrontDoorContext';
import type { IArtifactWithState, IAuthorityBinding } from '../../services/marketing/artifactRepository';
import type { DraftResult, IMarketingSession } from '../../services/marketing/marketingDraftService';
import type { IReviewSession, RequestResult, ReviewResult } from '../../services/marketing/marketingReviewService';
import type { IMarketingServices } from '../../services/marketing/marketingServices';
import type { IRoleResolution } from '../../services/roleResolver';
import type { PillState } from '../../controls/StatusPill';
import { AppNotice } from './kit';

/**
 * The synthetic Marketing workspace: the three drafting operations, the review protocol and the durable store,
 * exercised end to end over the fixture register and the deterministic provider.
 *
 * What this is. Real code paths: the strict validators, the source gate, the provider boundary, the envelope, the
 * review service and the persistent store are the ones a live run would use. What is synthetic is the material:
 * the register is a fixture, the provider is deterministic and calls no model, the reviewers are fictional roles a
 * person assumes explicitly, and every record says `testRecord: true`. Every screen says so.
 *
 * What survives. The records live in the store, not here: leaving the section, reloading the page or opening a new
 * session finds the same revisions, decisions and states, because this component reads them back on mount and
 * after every write and holds nothing the store does not.
 *
 * What it will not do. Nothing here sends, publishes, assigns, schedules or changes a campaign; an acceptance
 * unlocks the next draft and nothing else.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** The one canonical Work ID the synthetic workspace drafts under; a real work binds a real ID through CORE. */
export const SYNTHETIC_WORK_ID: string = 'CW-SYNTHETIC_MARKETING_WORKSPACE';

export const WORKSPACE_NOTICE: string =
  'Synthetic workspace: real validation, review and persistence over invented sources and a deterministic provider. Nothing here is business content or a live AI response; nothing is sent, published, assigned or scheduled.';

const REVIEW_KIND_OF: { [kind in ArtifactKind]: ReviewKind } = {
  campaignBrief: 'strategyVoice',
  contentPlan: 'copyChannel',
  meetingFollowThrough: 'meetingDecisionsActions'
};

const KIND_TITLE: { [kind in ArtifactKind]: string } = {
  campaignBrief: 'Campaign brief',
  contentPlan: 'Content and internal PR plan',
  meetingFollowThrough: 'Meeting follow-through'
};

const STATE_PILL: { [state in ArtifactState]: PillState } = {
  draft: 'draftOnly',
  reviewRequested: 'needsApproval',
  changesRequested: 'needsAccess',
  accepted: 'availableNow',
  rejected: 'notSupported',
  superseded: 'notSupported',
  revalidationRequired: 'needsApproval'
};

const DEFAULT_OBJECTIVE: string = 'Help every team understand what the AI Center of Excellence offers and how to ask for help (synthetic objective).';

type Busy = { kind: 'idle' } | { kind: 'busy'; what: string } | { kind: 'error'; reasons: string[] } | { kind: 'uncertain'; reasons: string[]; intentKey?: string } | { kind: 'info'; text: string };

export interface ISyntheticMarketingInputs { objective: string; notes: string }

export interface IAppMarketingWorkspaceProps {
  marketing: IMarketingServices;
  resolution: IRoleResolution;
  workingInputs?: ISyntheticMarketingInputs;
  onWorkingInputsChange?: (next: ISyntheticMarketingInputs) => void;
}

export function AppMarketingWorkspace({ marketing, resolution, workingInputs, onWorkingInputsChange }: IAppMarketingWorkspaceProps): React.ReactElement {
  const { user, siteUrl } = useFrontDoor();
  const mayDraft: boolean = decide('draftCampaignBrief', resolution).allowed;
  const mayReview: boolean = decide('decideMarketingReview', resolution).allowed;
  const session: IMarketingSession = React.useMemo((): IMarketingSession => ({ actorId: user.email, tenantScope: siteUrl, resolution }), [user.email, siteUrl, resolution]);
  const [artifacts, setArtifacts] = React.useState<IArtifactWithState[] | undefined>(undefined);
  const [selected, setSelected] = React.useState<string | undefined>(undefined);
  const [busy, setBusy] = React.useState<Busy>({ kind: 'idle' });
  const [objective, setObjective] = React.useState<string>(workingInputs?.objective ?? DEFAULT_OBJECTIVE);
  const [notes, setNotes] = React.useState<string>(workingInputs?.notes ?? FIXTURE_MEETING_NOTES);
  const [authorities, setAuthorities] = React.useState<IAuthorityBinding[]>([]);
  const [reviewer, setReviewer] = React.useState<IReviewSession | undefined>(undefined);
  const [comment, setComment] = React.useState<string>('Hold the availability claim until it has an approved source.');
  const [decisions, setDecisions] = React.useState<IMarketingReviewDecisionV1[]>([]);
  const intentKey: React.MutableRefObject<string | undefined> = React.useRef<string | undefined>(undefined);
  const mounted: React.MutableRefObject<boolean> = React.useRef<boolean>(true);

  const refresh = React.useCallback(async (): Promise<void> => {
    const list: IArtifactWithState[] = await marketing.review.listArtifacts(SYNTHETIC_WORK_ID);
    if (mounted.current) {
      setArtifacts(list);
    }
  }, [marketing]);

  React.useEffect((): (() => void) => {
    mounted.current = true;
    refresh().catch((): void => {
      if (mounted.current) {
        setArtifacts([]);
        setBusy({ kind: 'error', reasons: ['The synthetic store could not be read.'] });
      }
    });
    marketing.review
      .authorities()
      .then((bindings: IAuthorityBinding[]): void => {
        if (mounted.current) {
          setAuthorities(bindings);
        }
      })
      .catch((): void => undefined);
    return (): void => {
      mounted.current = false;
    };
  }, [marketing, refresh]);

  React.useEffect((): void => {
    if (selected === undefined) {
      setDecisions([]);
      return;
    }
    marketing.review
      .decisionsFor(selected)
      .then((found: IMarketingReviewDecisionV1[]): void => {
        if (mounted.current) {
          setDecisions(found);
        }
      })
      .catch((): void => undefined);
  }, [marketing, selected, artifacts]);

  const current: IArtifactWithState | undefined = artifacts === undefined || selected === undefined ? undefined : artifacts.filter((item: IArtifactWithState): boolean => item.envelope.artifactId === selected)[0];
  const acceptedBrief: IArtifactWithState | undefined = (artifacts ?? []).filter((item: IArtifactWithState): boolean => item.envelope.kind === 'campaignBrief' && item.state === 'accepted')[0];
  const anyBrief: IArtifactWithState | undefined = (artifacts ?? []).filter((item: IArtifactWithState): boolean => item.envelope.kind === 'campaignBrief')[0];

  const runDraft = React.useCallback(
    async (what: string, run: () => Promise<DraftResult>): Promise<void> => {
      setBusy({ kind: 'busy', what });
      try {
        const result: DraftResult = await run();
        if (!mounted.current) {
          return;
        }
        if (result.kind === 'saved') {
          await refresh();
          setSelected(result.envelope.artifactId);
          setBusy({ kind: 'info', text: `Saved revision ${result.envelope.revision} and read it back (${result.copyFindings.length} copy-policy finding${result.copyFindings.length === 1 ? '' : 's'}, ${result.sourceGaps.length} source gap${result.sourceGaps.length === 1 ? '' : 's'}). ${result.limitation}` });
        } else if (result.failure === 'uncertain') {
          setBusy({ kind: 'uncertain', reasons: result.reasons, intentKey: result.intentKey });
        } else {
          setBusy({ kind: 'error', reasons: result.reasons });
        }
      } catch (error) {
        if (mounted.current) {
          setBusy({ kind: 'error', reasons: [error instanceof Error ? error.message : String(error)] });
        }
      }
    },
    [refresh]
  );

  const sourceIds: string[] = FIXTURE_REGISTER.entries.map((entry: ISourceEntry): string => entry.id);

  const draftBrief = (artifactId?: string, correctedObjective: string = objective): Promise<void> =>
    runDraft('Drafting the campaign brief', (): Promise<DraftResult> => marketing.draft.draftCampaignBrief(session, { workId: SYNTHETIC_WORK_ID, objective: correctedObjective, audienceContext: ['Team leads who have not asked the AI CoE for anything yet (synthetic)'], sourceIds, artifactId }));

  const draftPlan = (artifactId?: string): Promise<void> =>
    runDraft('Drafting the content plan', (): Promise<DraftResult> => {
      if (acceptedBrief === undefined) {
        return Promise.resolve({ kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['A content plan starts from an accepted campaign brief, read back from the store. None is accepted yet.'] });
      }
      return marketing.draft.draftContentPlan(session, { workId: SYNTHETIC_WORK_ID, briefArtifactId: acceptedBrief.envelope.artifactId, sourceIds, artifactId });
    });

  const draftFollowThrough = (artifactId?: string): Promise<void> =>
    runDraft('Drafting the follow-through', (): Promise<DraftResult> => {
      if (anyBrief === undefined) {
        return Promise.resolve({ kind: 'failed', failure: 'prerequisiteNotAccepted', reasons: ['A follow-through binds the current campaign packet; draft a campaign brief first.'] });
      }
      return marketing.draft.draftMeetingFollowThrough(session, {
        workId: SYNTHETIC_WORK_ID,
        briefArtifactId: anyBrief.envelope.artifactId,
        notes: [{ sourceId: 'FIXTURE-MEETING-004', versionOrETag: 'fixture-v1', locator: 'fixture://meeting/notes-week-1#notes', text: notes }],
        sourceIds,
        artifactId
      });
    });

  const requestReview = async (): Promise<void> => {
    if (current === undefined) {
      return;
    }
    setBusy({ kind: 'busy', what: 'Requesting the review' });
    const target: IArtifactRef = { kind: current.envelope.kind, artifactId: current.envelope.artifactId, revision: current.envelope.revision, payloadHash: current.envelope.payloadHash };
    const result: RequestResult = await marketing.review.requestReview(session, target, REVIEW_KIND_OF[current.envelope.kind]);
    if (!mounted.current) {
      return;
    }
    await refresh();
    setBusy(result.kind === 'recorded' ? { kind: 'info', text: `Review requested of the ${REVIEW_KIND_OF[current.envelope.kind]} role and recorded. No one was notified; the reviewer identity is unbound.` } : { kind: 'error', reasons: result.reasons });
  };

  const assume = async (bindingRef: string): Promise<void> => {
    if (!mayReview || marketing.mode !== 'synthetic') { return; }
    if (bindingRef === '') {
      setReviewer(undefined);
      return;
    }
    const result: IReviewSession | { kind: 'failed'; reasons: string[] } = await marketing.review.assumeSyntheticReviewer(session, bindingRef);
    if (!mounted.current) {
      return;
    }
    if ('kind' in result) {
      setBusy({ kind: 'error', reasons: result.reasons });
      return;
    }
    intentKey.current = undefined;
    setReviewer(result);
  };

  const decideReview = async (outcome: 'accept' | 'requestChanges' | 'reject'): Promise<void> => {
    if (current === undefined || reviewer === undefined) {
      return;
    }
    // One intent per opened decision: a retry after an uncertain outcome reuses the key rather than minting one.
    if (intentKey.current === undefined) {
      intentKey.current = `ui:${current.envelope.artifactId}:${current.envelope.revision}:${reviewer.actorId}:${Date.now().toString(36)}`;
    }
    setBusy({ kind: 'busy', what: 'Recording the decision' });
    const result: ReviewResult = await marketing.review.recordReviewDecision(reviewer, {
      target: { kind: current.envelope.kind, artifactId: current.envelope.artifactId, revision: current.envelope.revision, payloadHash: current.envelope.payloadHash },
      reviewKind: REVIEW_KIND_OF[current.envelope.kind],
      outcome,
      comments: comment,
      expectedStoreVersion: current.storeVersion,
      idempotencyKey: intentKey.current
    });
    if (!mounted.current) {
      return;
    }
    await refresh();
    if (result.kind === 'recorded') {
      // eslint-disable-next-line require-atomic-updates -- this instance's decision slot; a completed record must not retry on a new key
      intentKey.current = undefined;
      setBusy({ kind: 'info', text: `Decision ${result.decision.outcome} recorded as ${result.decision.reviewId}, read back and receipted (${result.receipt.receiptId}). State is now ${ARTIFACT_STATE_LABEL[result.state]}.${result.replayed ? ' This was the earlier decision for the same intent; nothing was written twice.' : ''}` });
    } else if (result.failure === 'uncertain') {
      setBusy({ kind: 'uncertain', reasons: result.reasons, intentKey: result.intentKey });
    } else {
      setBusy({ kind: 'error', reasons: result.reasons });
    }
  };

  const reconcile = async (key: string): Promise<void> => {
    setBusy({ kind: 'busy', what: 'Reconciling the earlier attempt' });
    const result: ReviewResult | undefined = await marketing.review.reconcileAttempt(key);
    if (!mounted.current) {
      return;
    }
    await refresh();
    setBusy(result === undefined ? { kind: 'error', reasons: ['Nothing was found for that attempt; it may be retried with the same key.'] } : result.kind === 'recorded' ? { kind: 'info', text: `Reconciled: the decision exists and reads as ${ARTIFACT_STATE_LABEL[result.state]}.` } : { kind: 'error', reasons: result.reasons });
  };

  const canRequest: boolean = mayDraft && current !== undefined && (current.state === 'draft' || current.state === 'changesRequested') && current.envelope.createdBy === session.actorId;
  const canDecide: boolean = mayReview && current !== undefined && reviewer !== undefined && current.state === 'reviewRequested';
  const canRedraft: boolean = mayDraft && current !== undefined && current.state === 'changesRequested' && current.envelope.createdBy === session.actorId;

  return (
    <div className="ai-app-workspace">
      <p className="ai-app-demo-banner" role="note">
        <span className="ai-app-demo-flag">Synthetic workspace</span>
        <span className="ai-app-demo-text">{WORKSPACE_NOTICE}</span>
      </p>
      <div className="ai-app-split">
        <div className="ai-app-panel">
          {mayDraft ? <React.Fragment>
          <h4 className="ai-app-subheading">Start a draft</h4>
          <label className="ai-app-field-label" htmlFor="ai-app-ws-objective">
            Approved objective (synthetic)
          </label>
          <textarea id="ai-app-ws-objective" className="ai-app-textarea" value={objective} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => { setObjective(event.target.value); onWorkingInputsChange?.({ objective: event.target.value, notes }); }} rows={3} />
          <p className="ai-app-field-label">{`Permitted sources: register ${FIXTURE_REGISTER.registerId}, version ${FIXTURE_REGISTER.version} (fixture)`}</p>
          <ul className="ai-app-sources">
            {FIXTURE_REGISTER.entries.map((entry: ISourceEntry): React.ReactElement => (
              <li key={entry.id} className="ai-app-source">
                <span className="ai-app-source-id">{entry.id}</span>
                <span className="ai-app-source-note">{`May not prove: ${entry.mayNotProve}`}</span>
              </li>
            ))}
          </ul>
          <div className="ai-app-actions">
            <button type="button" className="ai-app-primary" onClick={(): void => void draftBrief()} disabled={busy.kind === 'busy'}>
              Draft a campaign brief
            </button>
            <button type="button" className="ai-app-secondary" onClick={(): void => void draftPlan()} disabled={busy.kind === 'busy' || acceptedBrief === undefined} title={acceptedBrief === undefined ? 'Needs an accepted campaign brief, read back from the store.' : undefined}>
              Draft a content plan
            </button>
          </div>
          {acceptedBrief === undefined && <p className="ai-app-lock">A content plan starts from an accepted campaign brief, read back from the store. None is accepted yet.</p>}
          <label className="ai-app-field-label" htmlFor="ai-app-ws-notes">
            Permitted meeting notes (fixture source FIXTURE-MEETING-004)
          </label>
          <textarea id="ai-app-ws-notes" className="ai-app-textarea" value={notes} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => { setNotes(event.target.value); onWorkingInputsChange?.({ objective, notes: event.target.value }); }} rows={4} />
          <div className="ai-app-actions">
            <button type="button" className="ai-app-secondary" onClick={(): void => void draftFollowThrough()} disabled={busy.kind === 'busy' || anyBrief === undefined}>
              Draft follow-through
            </button>
          </div>
          </React.Fragment> : <AppNotice>Review access does not grant drafting. Open a saved record to review its current revision.</AppNotice>}
        </div>
        <div className="ai-app-panel">
          <h4 className="ai-app-subheading">{mayReview && !mayDraft ? 'Review queue' : 'Saved records'}</h4>
          {artifacts === undefined ? (
            <p className="ai-app-note" role="status">
              Reading the synthetic store…
            </p>
          ) : artifacts.length === 0 ? (
            <p className="ai-app-empty">Nothing saved yet. A draft appears here once it is validated, written and read back.</p>
          ) : (
            <ul className="ai-app-list ai-app-records">
              {artifacts.map((item: IArtifactWithState): React.ReactElement => (
                <li key={item.envelope.artifactId}>
                  <button type="button" className={`ai-app-record${item.envelope.artifactId === selected ? ' ai-app-record--selected' : ''}`} onClick={(): void => setSelected(item.envelope.artifactId)} aria-pressed={item.envelope.artifactId === selected}>
                    <span className="ai-app-starter-title">{`${KIND_TITLE[item.envelope.kind]} — ${item.envelope.artifactId}`}</span>
                    <span className="ai-app-stage">
                      <StatusPill state={STATE_PILL[item.state]} label={ARTIFACT_STATE_LABEL[item.state]} />
                    </span>
                    <span className="ai-app-starter-text">{`Revision ${item.envelope.revision} · hash ${item.envelope.payloadHash.slice(0, 12)}… · ${item.envelope.providerProvenance.mode} provenance`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="ai-app-note">Records are read back from the store on every change; leaving this section, reloading or a new session finds the same revisions and states.</p>
        </div>
      </div>

      <StatusLine busy={busy} onReconcile={reconcile} />

      {current !== undefined && (
        <div className="ai-app-detail ai-app-panel">
          <h4 className="ai-app-detail-title">{`${KIND_TITLE[current.envelope.kind]} — ${current.envelope.artifactId}, revision ${current.envelope.revision}`}</h4>
          <StatusPill state={STATE_PILL[current.state]} label={ARTIFACT_STATE_LABEL[current.state]} />
          <dl className="ai-app-contract">
            <dt>Provenance</dt>
            <dd>{`${current.envelope.providerProvenance.mode}: ${current.envelope.providerProvenance.provider}, model ${current.envelope.providerProvenance.model}. A deterministic fixture, not a live AI response.`}</dd>
            <dt>Register snapshot</dt>
            <dd>{`${current.envelope.registerSnapshot.registerId} ${current.envelope.registerSnapshot.version}, hash ${current.envelope.registerSnapshot.snapshotHash.slice(0, 12)}…`}</dd>
            <dt>Content hash</dt>
            <dd>{current.envelope.payloadHash}</dd>
            <dt>Saved by</dt>
            <dd>{`${current.envelope.createdBy} at ${current.envelope.createdAt} (test record)`}</dd>
            {current.envelope.parents.length > 0 && (
              <React.Fragment>
                <dt>Elaborates</dt>
                <dd>{current.envelope.parents.map((parent: IArtifactRef): string => `${parent.kind} ${parent.artifactId} revision ${parent.revision}`).join('; ')}</dd>
              </React.Fragment>
            )}
          </dl>
          <ArtifactBody envelope={current.envelope} />
          <Section title="Evidence gaps" items={current.envelope.evidenceGaps} />
          <Section title="Unknown" items={current.envelope.knowledge.unknown} />

          <h5 className="ai-app-subheading">Review</h5>
          {decisions.length > 0 && (
            <ul className="ai-app-list">
              {decisions
                .filter((decision: IMarketingReviewDecisionV1): boolean => decision.target.revision === current.envelope.revision)
                .map((decision: IMarketingReviewDecisionV1): React.ReactElement => (
                  <li key={decision.reviewId}>{`${decision.outcome} by ${decision.actorId} (${decision.reviewKind}) at ${decision.decidedAt}: ${decision.comments || 'no comment'} — receipt ${decision.receiptId}${decision.readbackVerified ? ', read back' : ', not yet verified'}`}</li>
                ))}
            </ul>
          )}
          <div className="ai-app-actions">
            <button type="button" className="ai-app-primary" onClick={(): void => void requestReview()} disabled={!canRequest || busy.kind === 'busy'}>
              Send for review
            </button>
            {canRedraft && current.envelope.kind === 'campaignBrief' && <ObjectiveCorrection
              key={`${current.envelope.artifactId}:${current.envelope.revision}`}
              envelope={current.envelope}
              busy={busy.kind === 'busy' || busy.kind === 'uncertain'}
              onDraft={(value): Promise<void> => draftBrief(current.envelope.artifactId, value)}
            />}
            {canRedraft && current.envelope.kind !== 'campaignBrief' && <p>Direct content correction is not supported by this service. The existing revision is unchanged; do not replay an unchanged draft as a correction.</p>}
          </div>
          {mayReview && <div className="ai-app-panel ai-app-panel--review">
            <label className="ai-app-field-label" htmlFor="ai-app-ws-reviewer">
              Act as a fictional reviewer (synthetic identities; the real owner and approver are unbound)
            </label>
            <select id="ai-app-ws-reviewer" className="ai-app-select" value={reviewer?.authorityBindingRef ?? ''} onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => void assume(event.target.value)}>
              <option value="">Signed-in person (no reviewer authority bound)</option>
              {authorities.map((binding: IAuthorityBinding): React.ReactElement => (
                <option key={binding.bindingRef} value={binding.bindingRef}>{`${binding.label} — ${binding.scope.join(', ')}`}</option>
              ))}
            </select>
            <label className="ai-app-field-label" htmlFor="ai-app-ws-comment">
              Review comment
            </label>
            <input id="ai-app-ws-comment" className="ai-app-command-input" value={comment} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setComment(event.target.value)} />
            <div className="ai-app-actions">
              <button type="button" className="ai-app-primary" onClick={(): void => void decideReview('accept')} disabled={!canDecide || busy.kind === 'busy'}>
                Accept
              </button>
              <button type="button" className="ai-app-secondary" onClick={(): void => void decideReview('requestChanges')} disabled={!canDecide || busy.kind === 'busy'}>
                Request changes
              </button>
              <button type="button" className="ai-app-secondary" onClick={(): void => void decideReview('reject')} disabled={!canDecide || busy.kind === 'busy'}>
                Reject
              </button>
            </div>
            {!canDecide && current.state === 'reviewRequested' && reviewer === undefined && <p className="ai-app-lock">A decision needs a reviewer with a bound authority for this review kind. Choose a fictional reviewer above to exercise the protocol.</p>}
            {current.state !== 'reviewRequested' && <p className="ai-app-lock">{`A decision can be recorded only while a review is requested; this revision reads as ${ARTIFACT_STATE_LABEL[current.state]}.`}</p>}
          </div>}
          <AppNotice>An acceptance binds this exact revision, content hash and register snapshot, and unlocks the next draft. It sends, publishes, assigns and schedules nothing.</AppNotice>
        </div>
      )}
    </div>
  );
}

function ObjectiveCorrection({ envelope, busy, onDraft }: { envelope: IMarketingArtifactEnvelopeV1; busy: boolean; onDraft: (value: string) => Promise<void> }): React.ReactElement {
  const original = parseCampaignBrief(envelope.payload).value?.objective ?? '';
  const [value, setValue] = React.useState<string>(original);
  return <div>
    <label htmlFor="ai-app-correct-objective">Corrected objective</label>
    <textarea id="ai-app-correct-objective" value={value} disabled={busy} onChange={(event): void => setValue(event.target.value)} />
    <p>This uses the existing drafting service to create a new revision with your corrected objective. It is not a direct copy editor and does not change an accepted revision.</p>
    <button type="button" disabled={busy || value.trim() === '' || value.trim() === original.trim()} onClick={(): void => { void onDraft(value.trim()); }}>Draft corrected objective as a new revision</button>
  </div>;
}

function StatusLine({ busy, onReconcile }: { busy: Busy; onReconcile: (key: string) => Promise<void> }): React.ReactElement | null {
  switch (busy.kind) {
    case 'idle':
      return null;
    case 'busy':
      return (
        <p className="ai-app-note" role="status">
          {`${busy.what}…`}
        </p>
      );
    case 'info':
      return (
        <p className="ai-app-note" role="status">
          {busy.text}
        </p>
      );
    case 'error':
      return (
        <div className="ai-app-panel ai-app-panel--caution" role="alert">
          <p className="ai-app-note">This was refused; nothing was saved.</p>
          <ul className="ai-app-list">
            {busy.reasons.map((reason: string, index: number): React.ReactElement => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      );
    case 'uncertain':
      return (
        <div className="ai-app-panel ai-app-panel--caution" role="alert">
          <p className="ai-app-note">The outcome is uncertain: the write may or may not have landed. It is not retried blind.</p>
          <ul className="ai-app-list">
            {busy.reasons.map((reason: string, index: number): React.ReactElement => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
          {busy.intentKey !== undefined && (
            <button type="button" className="ai-app-secondary" onClick={(): void => void onReconcile(busy.intentKey ?? '')}>
              Reconcile the earlier attempt
            </button>
          )}
        </div>
      );
    default: {
      const exhaustive: never = busy;
      return <p className="ai-app-note">{String(exhaustive)}</p>;
    }
  }
}

function Section({ title, items }: { title: string; items: readonly string[] }): React.ReactElement {
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

function ClaimLine({ claim }: { claim: IClaim }): React.ReactElement {
  const check: ICopyCheckResult = checkCopy(claim.text, { cited: claim.sources.length > 0 });
  return (
    <li className="ai-app-claim">
      <span className="ai-app-claim-text">{claim.text}</span>
      {claim.sources.length > 0 ? (
        <span className="ai-app-cite">{`Cites ${claim.sources.map((source: { sourceId: string; versionOrETag: string }): string => `${source.sourceId}@${source.versionOrETag}`).join(', ')} (provenance, not proof)`}</span>
      ) : (
        <span className="ai-app-cite ai-app-cite--gap">
          <StatusPill state="needsAccess" label={claim.unknown ?? 'UNKNOWN'} />
          <span>No approved source, so the claim is marked rather than made.</span>
        </span>
      )}
      {check.findings.map((finding: ICopyFinding, index: number): React.ReactElement => (
        <span key={index} className="ai-app-finding">{`Copy policy: “${finding.found}” — ${finding.note}`}</span>
      ))}
    </li>
  );
}

function ClaimList({ claims }: { claims: readonly IClaim[] }): React.ReactElement {
  return (
    <ul className="ai-app-claims">
      {claims.map((claim: IClaim, index: number): React.ReactElement => (
        <ClaimLine key={index} claim={claim} />
      ))}
    </ul>
  );
}

function Requirements({ items }: { items: readonly IReviewRequirement[] }): React.ReactElement {
  return (
    <React.Fragment>
      <h5 className="ai-app-subheading">Approval requirements (requirements, not decisions)</h5>
      <ul className="ai-app-list">
        {items.map((item: IReviewRequirement): React.ReactElement => (
          <li key={item.requirementId}>{`${item.requirementId}: ${item.reviewKind} by ${item.requiredRole} over ${item.scopeRefs.join(', ')} — ${item.authorityBindingRef === null ? 'authority unbound' : item.authorityBindingRef}. ${item.blockingReason}`}</li>
        ))}
      </ul>
    </React.Fragment>
  );
}

function locatorsText(items: readonly ISourceLocator[]): string {
  return items.map((item: ISourceLocator): string => `${item.source.sourceId}@${item.source.versionOrETag} ${item.locator}`).join('; ');
}

export function ArtifactBody({ envelope }: { envelope: IMarketingArtifactEnvelopeV1 }): React.ReactElement {
  switch (envelope.kind) {
    case 'campaignBrief': {
      const brief: ICampaignBriefV1 | undefined = parseCampaignBrief(envelope.payload).value;
      return brief === undefined ? <AppNotice>This stored record no longer parses as CampaignBrief.v1 and is quarantined.</AppNotice> : <BriefBody brief={brief} />;
    }
    case 'contentPlan': {
      const plan: IContentPlanV1 | undefined = parseContentPlan(envelope.payload).value;
      return plan === undefined ? <AppNotice>This stored record no longer parses as ContentPlan.v1 and is quarantined.</AppNotice> : <PlanBody plan={plan} />;
    }
    case 'meetingFollowThrough': {
      const follow: IMeetingFollowThroughV1 | undefined = parseMeetingFollowThrough(envelope.payload).value;
      return follow === undefined ? <AppNotice>This stored record no longer parses as MeetingFollowThrough.v1 and is quarantined.</AppNotice> : <FollowThroughBody follow={follow} />;
    }
    default: {
      const exhaustive: never = envelope.kind;
      return <AppNotice>{`Unknown artifact kind ${String(exhaustive)}.`}</AppNotice>;
    }
  }
}

function BriefBody({ brief }: { brief: ICampaignBriefV1 }): React.ReactElement {
  return (
    <React.Fragment>
      <h5 className="ai-app-subheading">Objective</h5>
      <p className="ai-app-quote">{brief.objective}</p>
      <Section title="Audience" items={brief.audience} />
      <Section title="Pain points" items={brief.painPoints} />
      <h5 className="ai-app-subheading">Message</h5>
      <ClaimList claims={brief.message} />
      <Section title="Channel plan" items={brief.channelPlan} />
      <h5 className="ai-app-subheading">Content calendar</h5>
      <ul className="ai-app-list">
        {brief.contentCalendar.map((entry: ICalendarEntry, index: number): React.ReactElement => (
          <li key={index}>{`${entry.phase} — week ${entry.weekOffset}: ${entry.item}`}</li>
        ))}
      </ul>
      <p className="ai-app-note">Weeks count from an approved start that does not exist yet. No date is set and no calendar entry is created.</p>
      <Section title="Evidence gaps" items={brief.evidenceGaps} />
      <Section title="Review needs" items={brief.reviewNeeds} />
      {brief.proposedOwners !== undefined && (
        <React.Fragment>
          <h5 className="ai-app-subheading">Proposed owners</h5>
          <ul className="ai-app-list">
            {brief.proposedOwners.map((owner: IProposedOwner, index: number): React.ReactElement => (
              <li key={index}>{`${owner.role} — ${owner.note}`}</li>
            ))}
          </ul>
          <p className="ai-app-note">A role, never a person. Nothing here allocates work to anybody.</p>
        </React.Fragment>
      )}
      {brief.dependencies !== undefined && <Section title="Dependencies" items={brief.dependencies} />}
      {brief.claimMap !== undefined && (
        <React.Fragment>
          <h5 className="ai-app-subheading">Claim map</h5>
          <ul className="ai-app-list">
            {brief.claimMap.map((entry: IClaimMapEntry): React.ReactElement => (
              <li key={entry.path}>{`${entry.path}: ${entry.sources.length > 0 ? `cites ${entry.sources.map((source: { sourceId: string }): string => source.sourceId).join(', ')}` : `marked ${entry.unknown ?? 'UNKNOWN'}`}`}</li>
            ))}
          </ul>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

function PlanBody({ plan }: { plan: IContentPlanV1 }): React.ReactElement {
  return (
    <React.Fragment>
      <h5 className="ai-app-subheading">Accepted brief</h5>
      <p className="ai-app-note">{`${plan.acceptedBrief.artifactId} revision ${plan.acceptedBrief.revision}, hash ${plan.acceptedBrief.payloadHash.slice(0, 12)}…, acceptance receipt ${plan.acceptedBrief.acceptanceReceiptId}. This plan elaborates it and does not overwrite it.`}</p>
      <h5 className="ai-app-subheading">One destination, one action</h5>
      <p className="ai-app-note">{`Destination: ${plan.primaryDestination.label} — ${plan.primaryDestination.href === null ? `no link yet (${plan.primaryDestination.unknown ?? 'UNKNOWN'})` : plan.primaryDestination.href}. Action: ${plan.primaryCta.label}.`}</p>
      <h5 className="ai-app-subheading">Asset register</h5>
      <ul className="ai-app-list">
        {plan.assetRegister.map((asset: IAsset): React.ReactElement => (
          <li key={asset.assetId}>{`${asset.assetId} ${asset.name} (${asset.format}, ${asset.channel}; channel owner ${asset.channelOwnerBindingRef === null ? 'unbound' : asset.channelOwnerBindingRef}) — ${asset.purpose} Accessibility: ${asset.accessibilityRequirements.join('; ')}.`}</li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Copy variants</h5>
      <ul className="ai-app-variants">
        {plan.copyVariants.map((variant: ICopyVariant): React.ReactElement => (
          <li key={variant.variantId} className="ai-app-variant">
            <span className="ai-app-field-label">{`${variant.variantId} for ${variant.assetId} · ${variant.audience.join(', ')} · ${variant.channel}`}</span>
            <ClaimList claims={[variant.headline].concat(variant.body)} />
            <span className="ai-app-cite">{`One action: ${plan.primaryCta.label}. Accessibility: link label “${variant.accessibility.linkLabel}”, alt text ${variant.accessibility.altText ?? 'none'}, review ${variant.accessibility.reviewState}.`}</span>
          </li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Content calendar</h5>
      <ul className="ai-app-list">
        {plan.contentCalendar.map((entry: IPlanCalendarEntry): React.ReactElement => (
          <li key={entry.entryId}>{`${entry.phase} — week ${entry.weekOffset}: ${entry.item} (${entry.assetIds.join(', ')}${entry.dependencyIds.length > 0 ? `; depends on ${entry.dependencyIds.join(', ')}` : ''})`}</li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Proposed owners</h5>
      <ul className="ai-app-list">
        {plan.proposedOwners.map((owner: IProposedOwnerForScope, index: number): React.ReactElement => (
          <li key={index}>{`${owner.owner.role} for ${owner.scopeRefs.join(', ')} — ${owner.owner.note}`}</li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Dependencies</h5>
      <ul className="ai-app-list">
        {plan.dependencies.map((dependency: IDependency): React.ReactElement => (
          <li key={dependency.dependencyId}>{`${dependency.dependencyId} (${dependency.status}): ${dependency.description.text}${dependency.description.unknown !== undefined ? ` [${dependency.description.unknown}]` : ''}`}</li>
        ))}
      </ul>
      <Requirements items={plan.approvalRequirements} />
      <Section title="Evidence gaps" items={plan.evidenceGaps} />
      <Section title="Review needs" items={plan.reviewNeeds} />
      <p className="ai-app-note">Approved copy is not permission to send it. Nothing is published from here.</p>
    </React.Fragment>
  );
}

function FollowThroughBody({ follow }: { follow: IMeetingFollowThroughV1 }): React.ReactElement {
  return (
    <React.Fragment>
      <h5 className="ai-app-subheading">Campaign packet</h5>
      <p className="ai-app-note">{`Brief ${follow.campaignPacket.brief.artifactId} revision ${follow.campaignPacket.brief.revision}; content plan ${follow.campaignPacket.contentPlan === null ? 'none' : `${follow.campaignPacket.contentPlan.artifactId} revision ${follow.campaignPacket.contentPlan.revision}`}.`}</p>
      <h5 className="ai-app-subheading">Meeting sources</h5>
      <p className="ai-app-note">{locatorsText(follow.meetingSources)}</p>
      <h5 className="ai-app-subheading">Decisions (proposed; the meeting owner accepts)</h5>
      <ul className="ai-app-list">
        {follow.decisions.map((decision: IDecisionProposal): React.ReactElement => (
          <li key={decision.decisionProposalId}>{`${decision.decisionProposalId} [${decision.classification}, ${decision.status}]: ${decision.statement.text} — evidence ${locatorsText(decision.evidence)}`}</li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Action proposals (nothing assigned)</h5>
      <ul className="ai-app-list">
        {follow.actionProposals.map((action: IActionProposal): React.ReactElement => (
          <li key={action.actionProposalId}>{`${action.actionProposalId}: ${action.description.text} — suggested for ${action.suggestedOwner === null ? 'no role yet' : action.suggestedOwner.role}; timing ${action.proposedTiming.kind === 'phaseWeek' ? `${action.proposedTiming.phase} week ${action.proposedTiming.weekOffset}` : action.proposedTiming.kind === 'sourceDate' ? action.proposedTiming.date : `unknown (${action.proposedTiming.reason})`}. ${action.requiredConfirmation}`}</li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Brief changes (proposals; the brief is not changed)</h5>
      <ul className="ai-app-list">
        {follow.briefChanges.map((change: IBriefChangeProposal): React.ReactElement => (
          <li key={change.changeProposalId}>{`${change.changeProposalId}: ${change.field} of ${change.targetBrief.artifactId} revision ${change.targetBrief.revision} — ${change.rationale.text}`}</li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Communications drafts (unsent)</h5>
      <ul className="ai-app-variants">
        {follow.communicationsDrafts.map((draft: ICommunicationDraft): React.ReactElement => (
          <li key={draft.communicationDraftId} className="ai-app-variant">
            <span className="ai-app-field-label">{`${draft.communicationDraftId} · ${draft.channel} · to ${draft.proposedAudience.join(', ')} · sent: ${String(draft.sent)}`}</span>
            <ClaimList claims={[draft.subject].concat(draft.body, [draft.proposedCta, draft.proposedDestination])} />
            <span className="ai-app-cite">{draft.requiredSenderApproval}</span>
          </li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Unresolved questions</h5>
      <ul className="ai-app-list">
        {follow.unresolvedQuestions.map((question: IUnresolvedQuestion): React.ReactElement => (
          <li key={question.questionId}>{question.question.text}</li>
        ))}
      </ul>
      <h5 className="ai-app-subheading">Risks</h5>
      <ClaimList claims={follow.risks} />
      <h5 className="ai-app-subheading">Next gate</h5>
      <p className="ai-app-note">{`${follow.nextGate.description.text} (${follow.nextGate.requiredReviewIds.join(', ')})`}</p>
      <Requirements items={follow.approvalRequirements} />
      <Section title="Evidence gaps" items={follow.evidenceGaps} />
      <Section title="Review needs" items={follow.reviewNeeds} />
      <p className="ai-app-note">Meeting-owner acceptance is distinct from copy/channel approval and from permission to send. None of the three happens here.</p>
    </React.Fragment>
  );
}

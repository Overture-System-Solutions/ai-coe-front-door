import * as React from 'react';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { decide } from '../../services/authorization';
import { payloadHash } from '../../content/actionEnvelope';
import { parseCampaignBrief } from '../../content/marketing/campaignBrief';
import { parseContentPlan } from '../../content/marketing/contentPlan';
import { parseMeetingFollowThrough } from '../../content/marketing/meetingFollowThrough';
import { MANUAL_SERVER_FIELDS } from '../../content/marketing/manualDraft';
import { CANONICAL_WORK_ID } from '../../content/workIdentity';
import { isUsableForBusinessContent } from '../../content/marketing/sourceRegister';
import type { ISourceRegister } from '../../content/marketing/sourceRegister';
import type { IMarketingReviewDecisionV1, ReviewOutcome } from '../../content/marketing/artifactEnvelope';
import type { RequestResult, ReviewResult } from '../../services/marketing/marketingReviewService';
import type { IAuthorityBinding } from '../../services/marketing/artifactRepository';
import type { ArtifactKind, ReviewKind } from '../../content/marketing/artifactTypes';
import type { IArtifactWithState } from '../../services/marketing/artifactRepository';
import type { IMarketingServices } from '../../services/marketing/marketingServices';
import type { DraftResult, IMarketingSession } from '../../services/marketing/marketingDraftService';
import type { IRoleResolution } from '../../services/roleResolver';
import { ArtifactBody } from './AppMarketingWorkspace';
import { AppNotice } from './kit';

export interface IBusinessMarketingWorkspaceProps {
  marketing: IMarketingServices;
  resolution: IRoleResolution;
  onDirtyChange?: (dirty: boolean) => void;
  onNavigationBlockedChange?: (blocked: boolean) => void;
}
interface IWorkingDraft { workId: string; objective: string; audience: string; manualJson: string; manualKind: ArtifactKind; manualTarget?: { artifactId: string; expectedStoreVersion: string } }
const REVIEW_KIND: { [kind in ArtifactKind]: ReviewKind } = { campaignBrief: 'strategyVoice', contentPlan: 'copyChannel', meetingFollowThrough: 'meetingDecisionsActions' };
const TITLES: { [kind in ArtifactKind]: string } = { campaignBrief: 'Campaign brief', contentPlan: 'Content and internal PR plan', meetingFollowThrough: 'Meeting follow-through' };

/** Business access is gated before mounting any effect or reading any service. */
export function AppBusinessMarketingWorkspace(props: IBusinessMarketingWorkspaceProps): React.ReactElement {
  const { user, siteUrl } = useFrontDoor();
  const serviceScope = React.useRef({ service: props.marketing, generation: 0 });
  if (serviceScope.current.service !== props.marketing) serviceScope.current = { service: props.marketing, generation: serviceScope.current.generation + 1 };
  if (props.marketing.mode !== 'live' || (!decide('draftCampaignBrief', props.resolution).allowed && !decide('decideMarketingReview', props.resolution).allowed)) {
    return <AppNotice>Marketing access is not authorized or has not resolved. No business records were read.</AppNotice>;
  }
  return <BusinessWorkspace key={`${siteUrl}:${user.email}:${JSON.stringify(props.resolution)}:${serviceScope.current.generation}`} {...props} />;
}

function BusinessWorkspace({ marketing, resolution, onDirtyChange, onNavigationBlockedChange }: IBusinessMarketingWorkspaceProps): React.ReactElement {
  const { user, siteUrl } = useFrontDoor();
  const session: IMarketingSession = React.useMemo(() => ({ actorId: user.email, tenantScope: siteUrl, resolution }), [user.email, siteUrl, resolution]);
  const [workIds, setWorkIds] = React.useState<string[]>([]);
  const [selection, setSelection] = React.useState<{ service: IMarketingServices; id: string }>();
  const [status, setStatus] = React.useState('Reading authorized cases…');
  const [caseBusy, setCaseBusy] = React.useState(false);
  const [caseDirty, setCaseDirty] = React.useState(false);
  const dirtyLock = React.useRef(false);
  const onDirty = React.useCallback((value: boolean): void => { dirtyLock.current = value; setCaseDirty(value); onDirtyChange?.(value); }, [onDirtyChange]);
  const caseLock = React.useRef(false);
  const onBusy = (value: boolean): void => { caseLock.current = value; setCaseBusy(value); };
  const [pending, setPending] = React.useState(true);
  const pendingRef = React.useRef(true);
  const [recovering, setRecovering] = React.useState(false);
  React.useEffect(() => { onNavigationBlockedChange?.(caseBusy || caseDirty || recovering); }, [caseBusy, caseDirty, recovering, onNavigationBlockedChange]);
  React.useEffect(() => () => { onNavigationBlockedChange?.(false); onDirtyChange?.(false); }, [onNavigationBlockedChange, onDirtyChange]);
  const repairLock = React.useRef(false);
  const [refreshVersion, setRefreshVersion] = React.useState(0);
  const alive = React.useRef(true);
  React.useEffect(() => () => { alive.current = false; }, []);
  // The synchronous entry guard gives one mounted operation ownership of this release.
  const releaseRepair = (): void => { if (alive.current) { repairLock.current = false; setRecovering(false); } };
  const block = (message: string): void => { pendingRef.current = true; setPending(true); setStatus(message); };
  const repair = async (): Promise<void> => {
    if (!alive.current || caseLock.current || repairLock.current || !marketing.recoverPending) return;
    repairLock.current = true; setRecovering(true);
    try {
      const result = await marketing.recoverPending(true);
      if (!alive.current) return;
      pendingRef.current = result.kind === 'pending'; setPending(pendingRef.current); setStatus(result.message);
      setRefreshVersion(value => value + 1);
    } catch { if (alive.current) block('Recovery is still unconfirmed. No new mutation is allowed.'); }
    finally { releaseRepair(); }
  };
  React.useEffect(() => {
    let active = true;
    setWorkIds([]); setSelection(undefined);
    if (!marketing.listWork) { setStatus('Business case listing is not bound. No guessed case or synthetic fallback is available.'); return; }
    pendingRef.current = true; setPending(true);
    Promise.all([marketing.listWork(), marketing.recoverPending ? marketing.recoverPending(false) : Promise.resolve({ kind: 'pending', message: 'Durable Marketing recovery is not bound; mutations are blocked.' })]).then(([ids, recovery]) => {
      if (!active) return;
      if (ids.some(id => !CANONICAL_WORK_ID.test(id))) throw new Error('Server returned an invalid canonical Work ID.');
      setWorkIds(ids); pendingRef.current = recovery.kind === 'pending'; setPending(pendingRef.current); setStatus(recovery.message);
    }).catch(() => { if (active) setStatus('Authorized case listing could not be read.'); });
    return () => { active = false; };
  }, [marketing, session]);
  const workId = selection?.service === marketing ? selection.id : '';
  return <div className="ai-app-workspace">
    <AppNotice>Business workspace. Draft and review only; nothing is sent, published, assigned or scheduled.</AppNotice>
    <p>{marketing.label}</p>
    {marketing.liveReasons.length > 0 && <AppNotice>{marketing.liveReasons.join(' ')}</AppNotice>}
    <label htmlFor="business-marketing-case">Marketing case</label>
    <select id="business-marketing-case" value={workId} disabled={caseBusy || caseDirty || recovering} onChange={event => { if (!caseLock.current && !dirtyLock.current && !repairLock.current && workIds.indexOf(event.target.value) >= 0) setSelection({ service: marketing, id: event.target.value }); }}>
      <option value="">Select an authorized case</option>{workIds.map(id => <option key={id} value={id}>{id}</option>)}
    </select>
    <p role="status">{status}</p>
    {pending && <AppNotice>Resolve the pending operation before any new mutation. {marketing.recoverPending ? <button type="button" disabled={recovering || caseBusy} onClick={() => void repair()}>Repair pending Marketing operation</button> : 'Recovery service not bound.'}</AppNotice>}
    {workId !== '' && <BusinessCase key={workId} marketing={marketing} session={session} workId={workId} onBusy={onBusy} onDirty={onDirty} pending={pending} pendingRef={pendingRef} onPending={block} refreshVersion={refreshVersion} />}
  </div>;
}

function BusinessCase({ marketing, session, workId, pending, pendingRef, onPending, refreshVersion, onBusy, onDirty }: { onDirty: (value: boolean) => void; onBusy: (value: boolean) => void; marketing: IMarketingServices; session: IMarketingSession; workId: string; pending: boolean; pendingRef: React.MutableRefObject<boolean>; onPending: (message: string) => void; refreshVersion: number }): React.ReactElement {
  const { services: { draftStore } } = useFrontDoor();
  const [workflowKey, setWorkflowKey] = React.useState<string>();
  const [draftStorageMessage, setDraftStorageMessage] = React.useState('Working draft not yet saved. Save before leaving this case.');
  const [manualJson, setManualJson] = React.useState('');
  const [manualKind, setManualKind] = React.useState<ArtifactKind>('campaignBrief');
  const [manualTarget, setManualTarget] = React.useState<{ artifactId: string; expectedStoreVersion: string }>();
  const mayDraft = decide('draftCampaignBrief', session.resolution).allowed;
  const mayReview = decide('decideMarketingReview', session.resolution).allowed;
  const [authorities, setAuthorities] = React.useState<IAuthorityBinding[]>([]);
  const [decisions, setDecisions] = React.useState<IMarketingReviewDecisionV1[]>([]);
  const [comment, setComment] = React.useState('');
  const [records, setRecords] = React.useState<IArtifactWithState[]>([]);
  const [register, setRegister] = React.useState<ISourceRegister>();
  const [sourceIds, setSourceIds] = React.useState<string[]>([]);
  const [meetingSource, setMeetingSource] = React.useState('');
  const [objective, setObjective] = React.useState('');
  const [audience, setAudience] = React.useState('');
  const [selected, setSelected] = React.useState('');
  const [message, setMessage] = React.useState('Reading server records…');
  const [busy, setBusyState] = React.useState(true);
  const setBusy = (value: boolean): void => { onBusy(value); setBusyState(value); };
  const lock = React.useRef(true);
  const dirtyParts = React.useRef({ author: false, review: false });
  const [dirty, setDirty] = React.useState(false);
  const markDirty = (part: 'author' | 'review', value: boolean): void => {
    dirtyParts.current[part] = value;
    const any = dirtyParts.current.author || dirtyParts.current.review;
    setDirty(any); onDirty(any);
  };
  const alive = React.useRef(true);
  // No second operation can enter while this component-local guard is held.
  const releaseOperation = (): void => { if (alive.current) { lock.current = false; setBusy(false); } };
  React.useEffect(() => { onBusy(true); return () => { alive.current = false; onBusy(false); }; }, []);
  const refresh = async (): Promise<IArtifactWithState[] | undefined> => {
    if (!alive.current) return;
    const [items, sources, bindings] = await Promise.all([marketing.review.listArtifacts(workId), marketing.registry.readRegister(), mayReview ? marketing.review.authorities() : Promise.resolve([])]);
    if (!alive.current) return;
    if (items.some(item => item.envelope.workId !== workId || item.envelope.tenantScope !== session.tenantScope || item.envelope.testRecord || item.envelope.providerProvenance.mode === 'synthetic')) throw new Error('Server returned an out-of-scope record; it was not displayed.');
    setRecords(items); setAuthorities(bindings);
    if (sources.available && isUsableForBusinessContent(sources.readback.register)) {
      const permitted = { ...sources.readback.register, entries: sources.readback.register.entries.filter(entry => sources.readback.revoked.indexOf(entry.id) < 0) };
      setRegister(permitted);
      setSourceIds(ids => ids.filter(id => permitted.entries.some(entry => entry.id === id)));
    } else { setRegister(undefined); setSourceIds([]); }
    return items;
  };
  const loadWorkingDraft = async (): Promise<void> => {
    if (!mayDraft || !alive.current) return;
    try {
      const digest = await payloadHash({ workId });
      if (!alive.current) return;
      if (!digest) throw new Error('Working draft key unavailable.');
      const key = `marketing-${digest.slice(0, 48)}`;
      setWorkflowKey(key);
      const saved = await draftStore.load<unknown>(key);
      if (!alive.current || saved === undefined) return;
      if (!saved || typeof saved !== 'object') throw new Error('Invalid working draft.');
      const raw = saved as Partial<IWorkingDraft>;
      if (raw.workId !== workId || typeof raw.objective !== 'string' || typeof raw.audience !== 'string' || typeof raw.manualJson !== 'string' || !raw.manualKind || !Object.prototype.hasOwnProperty.call(TITLES, raw.manualKind)) throw new Error('Working draft scope or shape mismatch.');
      if (raw.manualTarget && (typeof raw.manualTarget.artifactId !== 'string' || typeof raw.manualTarget.expectedStoreVersion !== 'string')) throw new Error('Invalid stored editing target.');
      setObjective(raw.objective); setAudience(raw.audience); setManualJson(raw.manualJson); setManualKind(raw.manualKind); setManualTarget(raw.manualTarget);
      setDraftStorageMessage('Working draft loaded from the server. Source selections must be confirmed again.');
    } catch { if (alive.current) { setWorkflowKey(undefined); setDraftStorageMessage('Server working-draft storage is not bound or could not be read. No browser fallback is used.'); } }
  };
  const workingLoaded = React.useRef(false);
  React.useEffect(() => {
    lock.current = true; setBusy(true);
    const working = workingLoaded.current ? Promise.resolve() : loadWorkingDraft(); workingLoaded.current = true;
    void Promise.all([refresh(), working]).then(() => { if (alive.current) setMessage('Current business records read from the server.'); }).catch(error => { if (alive.current) setMessage(error instanceof Error ? error.message : 'Server records unavailable.'); }).finally(() => { if (alive.current) { lock.current = false; setBusy(false); } });
    // This case is remounted for each selected work, account, site or service.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshVersion]);
  React.useEffect(() => {
    let active = true; setDecisions([]);
    if (selected) void marketing.review.decisionsFor(selected).then(items => { if (active && alive.current) setDecisions(items); }).catch(() => { if (active && alive.current) setMessage('Review history could not be read.'); });
    return () => { active = false; };
  }, [selected, records, marketing]);
  const current = records.find(item => item.envelope.artifactId === selected);
  const brief = records.find(item => item.envelope.kind === 'campaignBrief' && item.state !== 'superseded');
  const accepted = records.find(item => item.envelope.kind === 'campaignBrief' && item.state === 'accepted');
  const meeting = register?.entries.find(entry => entry.id === meetingSource && sourceIds.indexOf(entry.id) >= 0);
  const draft = async (kind: ArtifactKind): Promise<void> => {
    if (lock.current || pendingRef.current || !alive.current || !mayDraft || !register || sourceIds.length === 0) return;
    if ((kind === 'campaignBrief' && !objective.trim()) || (kind === 'contentPlan' && !accepted) || (kind === 'meetingFollowThrough' && (!brief || !meeting))) return;
    lock.current = true; setBusy(true); setMessage('Drafting…');
    try {
      const result: DraftResult = kind === 'campaignBrief'
        ? await marketing.draft.draftCampaignBrief(session, { workId, objective, audienceContext: audience.split(/\r?\n/).filter(line => line.trim() !== ''), sourceIds })
        : kind === 'contentPlan'
          ? await marketing.draft.draftContentPlan(session, { workId, briefArtifactId: accepted!.envelope.artifactId, sourceIds })
          : await marketing.draft.draftMeetingFollowThrough(session, { workId, briefArtifactId: brief!.envelope.artifactId, sourceIds, notes: [{ sourceId: meeting!.id, versionOrETag: meeting!.versionOrETag, locator: meeting!.location, text: '' }] });
      if (!alive.current) return;
      if (result.kind === 'failed' && result.failure === 'uncertain') onPending(result.reasons.join(' '));
      const latest = await refresh();
      if (!alive.current) return;
      if (result.kind === 'saved' && (result.envelope.workId !== workId || result.envelope.kind !== kind || !latest?.some(item => item.envelope.artifactId === result.envelope.artifactId && item.envelope.revision === result.envelope.revision && item.envelope.payloadHash === result.envelope.payloadHash))) throw new Error('Draft readback mismatch.');
      if (result.kind === 'saved') { setSelected(result.envelope.artifactId); setMessage(`Saved ${result.envelope.artifactId}, Work ID ${result.envelope.workId}, revision ${result.envelope.revision}. ${result.limitation}`); }
      else {
        setMessage(result.reasons.join(' '));
        if (result.manualFallback !== undefined) { setManualJson(JSON.stringify(result.manualFallback, null, 2)); setManualKind(kind); setManualTarget(undefined); }
      }
    } catch { if (alive.current) { onPending('Draft outcome unconfirmed; recover the original operation before continuing.'); setMessage('The draft outcome could not be confirmed.'); } }
    finally { releaseOperation(); }
  };
  const binding = current && authorities.find(item => item.actorId === session.actorId && item.tenantScope === session.tenantScope && item.synthetic === false && !item.revoked && Date.parse(item.expiresAt) > Date.now() && item.scope.indexOf(REVIEW_KIND[current.envelope.kind]) >= 0);
  const canRequest = mayDraft && current?.envelope.createdBy === session.actorId && (current.state === 'draft' || current.state === 'changesRequested');
  const canDecide = mayReview && !!binding && current?.state === 'reviewRequested' && current.envelope.createdBy !== session.actorId;
  const review = async (outcome?: ReviewOutcome): Promise<void> => {
    if (lock.current || pendingRef.current || !alive.current || !current || (outcome ? !canDecide : !canRequest)) return;
    lock.current = true; setBusy(true);
    const target = { kind: current.envelope.kind, artifactId: current.envelope.artifactId, revision: current.envelope.revision, payloadHash: current.envelope.payloadHash };
    try {
      const result: RequestResult | ReviewResult = outcome === undefined
        ? await marketing.review.requestReview(session, target, REVIEW_KIND[current.envelope.kind])
        : await marketing.review.recordReviewDecision({ ...session, synthetic: false, authorityBindingRef: binding!.bindingRef }, { target, reviewKind: REVIEW_KIND[current.envelope.kind], outcome, comments: comment, expectedStoreVersion: current.storeVersion, idempotencyKey: `marketing-${Array.from(crypto.getRandomValues(new Uint32Array(4))).map(n => n.toString(16)).join('-')}` });
      if (!alive.current) return;
      if (result.kind === 'failed' && result.failure === 'uncertain') onPending(result.reasons.join(' '));
      await refresh(); if (!alive.current) return;
      if (result.kind === 'recorded' && outcome !== undefined) { markDirty('review', false); setComment(''); }
      setMessage(result.kind === 'failed' ? result.reasons.join(' ') : 'request' in result ? `Review request ${result.request.requestId} recorded. No notification was sent.` : `Decision ${result.decision.outcome} recorded as ${result.decision.reviewId}; receipt ${result.receipt.receiptId}.`);
    } catch { if (alive.current) { onPending('Review outcome unconfirmed. Recover the original operation, not a new decision.'); setMessage('Review confirmation unavailable.'); } }
    finally { releaseOperation(); }
  };
  const saveWorking = async (): Promise<void> => {
    if (!alive.current || lock.current || pendingRef.current || !mayDraft || !workflowKey) return;
    lock.current = true; setBusy(true);
    const value: IWorkingDraft = { workId, objective, audience, manualJson, manualKind, ...(manualTarget ? { manualTarget } : {}) };
    try {
      const outcome = await draftStore.save(workflowKey, value);
      if (!alive.current) return;
      if (!outcome.ok) throw new Error('Save was not confirmed.');
      const readback = await draftStore.load<IWorkingDraft>(workflowKey);
      if (!alive.current) return;
      if (JSON.stringify(readback) !== JSON.stringify(value)) throw new Error('Readback differs.');
      markDirty('author', false);
      setDraftStorageMessage('Working draft saved and read back from the server.');
    } catch { if (alive.current) { markDirty('author', true); setWorkflowKey(undefined); setDraftStorageMessage('Working draft save is unconfirmed. Reload to reconcile server storage before saving again. No browser copy was made.'); } }
    finally { releaseOperation(); }
  };
  const saveManual = async (): Promise<void> => {
    if (!alive.current || lock.current || pendingRef.current || !mayDraft || !marketing.saveManualDraft || !register || sourceIds.length === 0) return;
    let value: unknown;
    try { value = JSON.parse(manualJson); } catch { setMessage('Manual payload invalid: enter valid artifact JSON.'); return; }
    const parsed = manualKind === 'campaignBrief' ? parseCampaignBrief(value) : manualKind === 'contentPlan' ? parseContentPlan(value) : parseMeetingFollowThrough(value);
    if (!parsed.value || parsed.value.workId !== workId) { setMessage(`Manual payload invalid: ${parsed.errors.join(' ')} The Work ID must match the selected case.`); return; }
    lock.current = true; setBusy(true);
    try {
      // Validate the displayed schema in full, but let the server derive identity,
      // register and timestamp metadata. Exact nested parent/source refs survive.
      const content: { [key: string]: unknown } = { ...parsed.value };
      MANUAL_SERVER_FIELDS.forEach(field => { delete content[field]; });
      const result = await marketing.saveManualDraft(session, { workId, kind: manualKind, payload: content, sourceIds, ...manualTarget });
      if (!alive.current) return;
      if (result.kind === 'failed' && result.failure === 'uncertain') onPending(result.reasons.join(' '));
      const latest = await refresh(); if (!alive.current) return;
      if (result.kind === 'saved') {
        if (result.envelope.kind !== manualKind || !latest?.some(item => item.envelope.artifactId === result.envelope.artifactId && item.envelope.revision === result.envelope.revision && item.envelope.payloadHash === result.envelope.payloadHash)) throw new Error('Manual readback mismatch.');
        if (result.envelope.workId !== workId || result.envelope.providerProvenance.mode !== 'manual') throw new Error('Manual confirmation mismatch.');
        setSelected(result.envelope.artifactId); setManualTarget(undefined);
        setMessage(`Saved human-authored artifact ${result.envelope.artifactId}, revision ${result.envelope.revision}.`);
      } else setMessage(result.reasons.join(' '));
    } catch { if (alive.current) onPending('Manual save outcome unconfirmed. Recover the original operation before continuing.'); }
    finally { releaseOperation(); }
  };
  const disabled = busy || pending;
  return <section className="ai-app-panel" aria-label={`Marketing case ${workId}`} onChangeCapture={event => {
    if (event.target instanceof HTMLTextAreaElement) markDirty(event.target.id === 'business-review-comment' ? 'review' : 'author', true);
  }}>
    <h3>{workId}</h3>
    {dirty && <div role="note"><p>Unsaved text stays in this case until saved, reviewed or explicitly discarded. Switching cases or workspace modes is blocked.</p><button type="button" disabled={disabled} onClick={() => {
      setObjective(''); setAudience(''); setManualJson(''); setManualTarget(undefined); setComment('');
      markDirty('author', false); markDirty('review', false);
    }}>Discard unsaved text</button></div>}
    {mayDraft && <React.Fragment>
      <label htmlFor="business-objective">Approved objective</label><textarea id="business-objective" value={objective} disabled={disabled} onChange={e => setObjective(e.target.value)} />
      <label htmlFor="business-audience">Audience context</label><textarea id="business-audience" value={audience} disabled={disabled} onChange={e => setAudience(e.target.value)} />
      <p>{draftStorageMessage}</p>
      <button type="button" disabled={disabled || !workflowKey} onClick={() => void saveWorking()}>Save working draft</button>
      <h4>Approved sources</h4>
      {!register ? <AppNotice>The approved business source register is unavailable. Drafting is blocked.</AppNotice> : <React.Fragment>
        <p>{`${register.registerId} · version ${register.version}`}</p>
        {register.entries.map(entry => <div key={entry.id}><label><input type="checkbox" aria-label={`Use source ${entry.id}`} checked={sourceIds.indexOf(entry.id) >= 0} disabled={disabled} onChange={e => { const checked = e.target.checked; setSourceIds(ids => checked ? ids.concat(entry.id) : ids.filter(id => id !== entry.id)); }} />{`${entry.id} · ${entry.versionOrETag} · ${entry.location}`}</label><p>{`${entry.classification}; audience: ${entry.audience}; may not prove: ${entry.mayNotProve}`}</p></div>)}
      </React.Fragment>}
      <div className="ai-app-actions">
        <button type="button" onClick={() => void draft('campaignBrief')} disabled={disabled || !register || !objective.trim() || !sourceIds.length}>Draft a campaign brief</button>
        <button type="button" onClick={() => void draft('contentPlan')} disabled={disabled || !register || !accepted || !sourceIds.length}>Draft a content plan</button>
      </div>
      {!accepted && <p>A content plan needs an accepted campaign brief, read from the server.</p>}
      <label htmlFor="business-meeting">Registered meeting source</label>
      <select id="business-meeting" value={meetingSource} disabled={disabled} onChange={e => setMeetingSource(e.target.value)}><option value="">Select approved meeting evidence</option>{register?.entries.filter(entry => sourceIds.indexOf(entry.id) >= 0).map(entry => <option key={entry.id} value={entry.id}>{entry.id}</option>)}</select>
      <p>The server rereads the registered notes at this exact version and location. Typed notes are not accepted as evidence.</p>
      <button type="button" onClick={() => void draft('meetingFollowThrough')} disabled={disabled || !brief || !meeting}>Draft follow-through</button>
      <h4>Manual draft or correction</h4>
      <p>Manual artifacts are human-authored, not AI output. The server validates sources, accepted parents and exact revision rules. Root identity, register and timestamps are server-owned and are not submitted; exact parent and source references are preserved. Save the working draft before leaving.</p>
      <label htmlFor="business-manual-kind">Manual artifact kind</label><select id="business-manual-kind" value={manualKind} disabled={disabled || !!manualTarget} onChange={e => { if (Object.prototype.hasOwnProperty.call(TITLES, e.target.value)) setManualKind(e.target.value as ArtifactKind); }}>{(Object.keys(TITLES) as ArtifactKind[]).map(kind => <option key={kind} value={kind}>{TITLES[kind]}</option>)}</select>
      <label htmlFor="business-manual-json">Manual artifact JSON</label><textarea id="business-manual-json" rows={12} value={manualJson} disabled={disabled} onChange={e => setManualJson(e.target.value)} />
      {manualTarget && <p>{`Revising ${manualTarget.artifactId} against store version ${manualTarget.expectedStoreVersion}. A stale version will be refused.`}</p>}
      {!marketing.saveManualDraft ? <AppNotice>Manual artifact saving is not bound. No provider or browser fallback will save it.</AppNotice> : <button type="button" disabled={disabled || !register || !sourceIds.length || !manualJson.trim()} onClick={() => void saveManual()}>Save manual artifact</button>}
      {manualTarget && <button type="button" disabled={disabled} onClick={() => { setManualTarget(undefined); setManualJson(''); }}>Start a new manual artifact</button>}
    </React.Fragment>}
    <p role="status">{message}</p>
    <h4>Saved records</h4>
    {records.map(item => <button type="button" key={item.envelope.artifactId} disabled={busy || dirtyParts.current.review} onClick={() => { if (!dirtyParts.current.review) setSelected(item.envelope.artifactId); }}>{`${TITLES[item.envelope.kind]} — ${item.envelope.artifactId}, revision ${item.envelope.revision} · ${item.state}`}</button>)}
    {current && <div><h4>{`${current.envelope.artifactId}, revision ${current.envelope.revision}`}</h4><p>{`Work ID ${current.envelope.workId} · ${current.state} · ${current.envelope.providerProvenance.mode} provenance`}</p><ArtifactBody envelope={current.envelope} />
      <p>{`Content hash ${current.envelope.payloadHash}; register ${current.envelope.registerSnapshot.registerId} version ${current.envelope.registerSnapshot.version}`}</p>
      {decisions.filter(item => item.target.revision === current.envelope.revision && item.target.payloadHash === current.envelope.payloadHash).map(item => <p key={item.reviewId}>{`${item.outcome} by ${item.actorId}: ${item.comments} · receipt ${item.receiptId}`}</p>)}
      {canRequest && <button type="button" disabled={disabled} onClick={() => { setManualJson(JSON.stringify(current.envelope.payload, null, 2)); setManualKind(current.envelope.kind); setManualTarget({ artifactId: current.envelope.artifactId, expectedStoreVersion: current.storeVersion }); }}>Edit this artifact manually</button>}
      {canRequest && <button type="button" disabled={disabled} onClick={() => void review()}>Request review</button>}
      {mayReview && <div><p>{`Signed in as ${session.actorId}. The server rechecks reviewer authority for every decision.`}</p>
        {!canDecide ? <AppNotice>No current review authority for this revision, or the revision is not awaiting another person's review.</AppNotice> : <React.Fragment>
          <label htmlFor="business-review-comment">Review comment</label><textarea id="business-review-comment" value={comment} disabled={disabled} onChange={e => setComment(e.target.value)} />
          <button type="button" disabled={disabled} onClick={() => void review('accept')}>Accept</button>
          <button type="button" disabled={disabled} onClick={() => void review('requestChanges')}>Request changes</button>
          <button type="button" disabled={disabled} onClick={() => void review('reject')}>Reject</button>
        </React.Fragment>}
      </div>}
    </div>}
  </section>;
}

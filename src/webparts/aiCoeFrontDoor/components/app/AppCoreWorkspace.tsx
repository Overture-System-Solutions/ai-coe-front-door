import * as React from 'react';
import { payloadHash } from '../../content/actionEnvelope';
import { CANONICAL_WORK_ID } from '../../content/workIdentity';
import { browserLocalStorage } from '../../services/draftStorage';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { usePageDocument } from '../pages/PageDocumentContext';
import type { CoreCallResult, ICoreSession, ICoreWorkService } from '../../services/core/coreWorkService';
import { evaluateDecisionPacket } from '../../services/core/coreWorkService';
import { KNOWN_ASSUMED_UNKNOWN, parseResponse, toEmployeeWork } from '../../services/core/coreContract';
import type { IEmployeeWork, IS1, KnownAssumedUnknown } from '../../services/core/coreContract';
import type { IWorkPacketProjection } from '../../services/core/packetProjection';
import { PACKET_PROJECTION_EXTENSION } from '../../services/core/packetProjection';
import { AppNotice } from './kit';
import '../../styles/coreWorkspace.global.scss';

/**
 * Case workspace over either the labelled synthetic engine or a qualified native service.
 * Native recovery and human validation retain server authority; UI role membership grants no backend rights.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export const SYNTHETIC_CORE_NOTICE: string =
  'Practice mode: use invented information. Cases and responses stay in this local simulation; nothing is sent to SharePoint or an AI provider.';

interface ICoreWorkspaceProps {
  coreWork: ICoreWorkService;
  onDirtyChange?: (dirty: boolean) => void;
}

const PACKET_LABELS: Readonly<Record<string, string>> = {
  S2_OPERATING: 'Operating details', S3_FINANCIAL: 'Costs and benefits', S4_TECHNICAL: 'Technical details', S5_RISK: 'Risks and safeguards'
};
const CERTAINTY_LABELS: Readonly<Record<KnownAssumedUnknown, string>> = {
  KNOWN: 'Confirmed — supported by evidence', ASSUMED: 'Assumption — needs checking', UNKNOWN: 'Unknown — still investigating', MIXED: 'Mixed — explain which parts are confirmed'
};
function packetLabel(packet: IWorkPacketProjection): string { return PACKET_LABELS[packet.packetType] ?? packet.packetType.replace(/_/g, ' '); }
function packetState(packet: IWorkPacketProjection): string {
  const labels: Readonly<Record<string, string>> = { OPEN: 'Needs a response', RETURNED: 'Awaiting review', VALIDATED: 'Reviewed', REJECTED: 'Needs changes', NOT_APPLICABLE: 'Not applicable' };
  return labels[packet.status] ?? packet.status.replace(/_/g, ' ').toLowerCase();
}
function nextStep(work: IEmployeeWork): string {
  if (work.nextAction === 'TRIAGE') { return 'Ready for an initial review.'; }
  if (work.nextAction?.indexOf('RETURN_TO_REQUESTER_CLARIFY') === 0) { return 'Add the missing problem, desired outcome or sponsor in Case details below.'; }
  if (work.nextAction?.indexOf('Complete:') === 0) { return 'Answer the outstanding information requests below, then check what is still needed for review.'; }
  return work.nextAction ?? 'No next action has been recorded.';
}

export function AppCoreWorkspace({ coreWork, onDirtyChange }: ICoreWorkspaceProps): React.ReactElement {
  const { user, siteUrl } = useFrontDoor();
  return <CoreCaseWorkspace key={`${siteUrl}:${user.email}:${coreWork.mode}`} coreWork={coreWork} onDirtyChange={onDirtyChange} />;
}

/** Only an opaque WorkID is kept; neither account names nor business text are storage values. */
export async function coreSelectionKey(session: ICoreSession, mode: ICoreWorkService['mode']): Promise<string | undefined> {
  const scope = await payloadHash({ actorId: session.actorId, tenantScope: session.tenantScope, mode });
  return scope === undefined ? undefined : `ai-coe:selected-work:v1:${scope}`;
}

function CoreCaseWorkspace({ coreWork, onDirtyChange }: ICoreWorkspaceProps): React.ReactElement {
  const { user, siteUrl } = useFrontDoor();
  const { roles, rolesState } = usePageDocument();
  const mayValidate = rolesState === 'resolved' && roles?.includes('designAuthority') === true;
  const [disposition, setDisposition] = React.useState<'' | 'VALIDATED' | 'REJECTED' | 'NOT_APPLICABLE'>('');
  const [assertion, setAssertion] = React.useState<string>('');
  const [sourceRefs, setSourceRefs] = React.useState<string>('');
  const references = sourceRefs.split(/\r?\n/).map((ref): string => ref.trim()).filter((ref): boolean => ref !== '');
  const session: ICoreSession = React.useMemo((): ICoreSession => ({ actorId: user.email, tenantScope: siteUrl }), [user.email, siteUrl]);
  const selectionKey = React.useMemo(() => coreSelectionKey(session, coreWork.mode), [session, coreWork.mode]);
  const mounted = React.useRef<boolean>(true);
  const [title, setTitle] = React.useState<string>('');
  const [outcome, setOutcome] = React.useState<string>('');
  const [problem, setProblem] = React.useState<string>('');
  const [sponsor, setSponsor] = React.useState<string>('');
  const [edited, setEdited] = React.useState<Partial<Record<keyof IS1, true>>>({});
  const editedRef = React.useRef<Partial<Record<keyof IS1, true>>>({});
  const markEdited = (field: keyof IS1): void => { editedRef.current = { ...editedRef.current, [field]: true }; setEdited(editedRef.current); };
  const clearEdited = (): void => { editedRef.current = {}; setEdited({}); };
  const hasEdits: boolean = Object.keys(edited).length > 0;
  const [work, setWork] = React.useState<IEmployeeWork | undefined>(undefined);
  const [items, setItems] = React.useState<IEmployeeWork[] | undefined>(undefined);
  const [packets, setPackets] = React.useState<IWorkPacketProjection[]>([]);
  const [packetId, setPacketId] = React.useState<string>('');
  const [response, setResponse] = React.useState<string>('');
  const [certainty, setCertainty] = React.useState<KnownAssumedUnknown>('UNKNOWN');
  const [packetReasons, setPacketReasons] = React.useState<readonly string[]>([]);
  const selectedPacket = packets.filter((packet): boolean => packet.packetId === packetId)[0];
  const savedCertainty = selectedPacket?.knownAssumedUnknown as KnownAssumedUnknown | undefined;
  const originalCertainty: KnownAssumedUnknown = savedCertainty !== undefined && KNOWN_ASSUMED_UNKNOWN.indexOf(savedCertainty) >= 0 ? savedCertainty : 'UNKNOWN';
  const responseDirty = selectedPacket !== undefined && (response !== (selectedPacket.response ?? '') || certainty !== originalCertainty);
  const validationDirty = disposition !== '' || assertion !== '' || sourceRefs !== '';
  const hasUnsaved = hasEdits || responseDirty || validationDirty;
  const [status, setStatus] = React.useState<string>('');
  const [phase, setPhase] = React.useState<string>('idle');
  const [busy, setBusy] = React.useState<boolean>(coreWork.enabled && coreWork.recoverPending !== undefined);
  const busyRef = React.useRef<boolean>(busy);
  const [recoveryBlocked, setRecoveryBlocked] = React.useState<boolean>(busy);
  const recoveryRef = React.useRef<boolean>(busy);
  const blockForRecovery = React.useCallback((blocked: boolean): void => {
    recoveryRef.current = blocked;
    setRecoveryBlocked(blocked);
  }, []);

  React.useEffect((): void => { onDirtyChange?.(hasUnsaved); }, [hasUnsaved, onDirtyChange]);
  React.useEffect((): (() => void) => (): void => { onDirtyChange?.(false); }, [onDirtyChange]);

  const apply = React.useCallback(
    async (result: CoreCallResult): Promise<void> => {
      if (!mounted.current) { return; }
      blockForRecovery(coreWork.recoverPending !== undefined && (result.kind === 'disabled' || result.observation.phase !== 'completed'));
      if (result.kind === 'disabled') {
        setPhase('error');
        setStatus(result.reasons.join(' '));
        return;
      }
      const observation = result.observation;
      setPhase(observation.phase);
      if (result.kind === 'ok') {
        if (observation.response !== undefined && 'Items' in observation.response) {
          const parsed = parseResponse('ListMyWork', observation.response, coreWork.mode === 'live' ? 'v0.2.0' : 'v0.1.1');
          if (!parsed.valid || parsed.value === undefined || !('Items' in parsed.value)) {
            setItems(undefined);
            setPhase('error');
            setStatus('The saved case list was malformed and was not displayed.');
            return;
          }
          setItems(parsed.value.Items.map(toEmployeeWork));
        }
        if (result.work !== undefined) {
          setWork(result.work);
          if (!editedRef.current.Title) { setTitle(result.work.title); }
          const key = await selectionKey;
          if (!mounted.current) { return; }
          try {
            if (key !== undefined) { browserLocalStorage()?.setItem(key, result.work.workId); }
          } catch { /* A refused reference cache never falls back to business-content storage. */ }
        }
        setStatus(observation.phase === 'completed' ? result.work === undefined ? 'Saved cases refreshed.' : `Case status: ${result.work.employeeStatus}.` : observation.reason ?? 'Waiting for confirmation.');
        if (result.packets !== undefined) {
          setPackets(result.packets);
          setPacketReasons([]);
        } else if (result.work !== undefined) {
          const listed = await coreWork.listPackets(session, result.work.workId);
          if (mounted.current) {
            setPackets(listed.packets); setPacketReasons(listed.unboundReasons);
            if (coreWork.recoverPending !== undefined && listed.unboundReasons.length > 0) { blockForRecovery(true); }
          }
        }
        return;
      }
      const message: string = observation.response !== undefined && observation.response.Result !== 'PASS' ? observation.response.Message : observation.reason ?? 'The command did not complete.';
      setStatus(message);
    },
    [coreWork, session, selectionKey, blockForRecovery]
  );

  const recoverAndList = React.useCallback(async (): Promise<void> => {
    if (!coreWork.enabled || coreWork.recoverPending === undefined) { return; }
    const result = await coreWork.recoverPending(session);
    if (!mounted.current) { return; }
    if (result === undefined) { blockForRecovery(false); }
    else { await apply(result); }
    if (!mounted.current || recoveryRef.current) { return; }
    await apply(await coreWork.listMine(session));
  }, [coreWork, session, apply, blockForRecovery]);

  React.useEffect((): (() => void) => {
    mounted.current = true;
    let cancelled = false;
    const restore = async (): Promise<void> => {
      if (!coreWork.enabled) { return; }
      if (coreWork.recoverPending !== undefined) {
        busyRef.current = true; setBusy(true);
        try { await recoverAndList(); }
        catch {
          if (!cancelled) { blockForRecovery(true); setStatus('Recovery could not confirm the original command. Recover the pending result before another request.'); }
        } finally { if (!cancelled) { busyRef.current = false; setBusy(false); } }
        if (cancelled || recoveryRef.current) { return; }
      }
      const key = await selectionKey;
      let reference: string | null | undefined;
      try { reference = key === undefined ? undefined : browserLocalStorage()?.getItem(key); } catch { return; }
      if (cancelled || !coreWork.enabled || typeof reference !== 'string' || !CANONICAL_WORK_ID.test(reference)) { return; }
      busyRef.current = true; setBusy(true);
      setProblem(''); setOutcome(''); setSponsor('');
      try {
        const result = await coreWork.getStatus(session, reference);
        if (!cancelled) { await apply(result); }
      } catch {
        if (!cancelled) { setStatus('The selected case could not be reloaded. Choose Show saved cases to try again.'); }
      } finally {
        if (!cancelled) { busyRef.current = false; setBusy(false); }
      }
    };
    void restore();
    return (): void => { cancelled = true; mounted.current = false; };
  }, [selectionKey, coreWork, session, apply, recoverAndList, blockForRecovery]);

  const s1 = React.useCallback((): IS1 => {
    const value: IS1 = {
      Title: title.trim(),
      SourceChannel: 'FRONT_DOOR'
    };
    if (work === undefined || edited.ProblemStatement) { value.ProblemStatement = problem.trim() === '' ? null : problem.trim(); }
    if (work === undefined || edited.DesiredOutcome) { value.DesiredOutcome = outcome.trim() === '' ? null : outcome.trim(); }
    if (work === undefined || edited.Sponsor) { value.Sponsor = sponsor.trim() === '' ? null : sponsor.trim(); }
    if (work === undefined) { value.Requester = user.email; value.DataClassification = 'INTERNAL'; }
    return value;
  }, [title, outcome, problem, sponsor, user.email, work, edited]);

  const run = React.useCallback(
    (work: () => Promise<void>, recovery: boolean = false): void => {
      if (!coreWork.enabled || busyRef.current || (!recovery && recoveryRef.current)) { return; }
      busyRef.current = true;
      setBusy(true);
      work().then(
        (): void => { if (mounted.current) { busyRef.current = false; setBusy(false); } },
        (): void => {
          if (!mounted.current) { return; }
          busyRef.current = false; setBusy(false);
          blockForRecovery(coreWork.recoverPending !== undefined);
          setPhase('error');
          setStatus('CORE could not confirm the result. Recover the pending result before repeating a request.');
        }
      );
    },
    [coreWork, blockForRecovery]
  );

  return (
    <div className="ai-case-workspace">
      <AppNotice tone="info">{coreWork.mode === 'synthetic' ? SYNTHETIC_CORE_NOTICE : 'Your cases are saved through the configured service. Wait for confirmation before retrying; saving a case is not approval.'}</AppNotice>
      {!coreWork.enabled && (
        <ul className="ai-app-list">
          {coreWork.liveReasons.map((reason: string): React.ReactElement => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {coreWork.enabled && (
        <React.Fragment>
          <div className="ai-case-toolbar">
            <div><h3 className="ai-app-detail-title">Your cases</h3><p className="ai-app-note">Start a case to track a piece of work, or open one you already saved.</p></div>
            <div className="ai-app-actions">
              <button type="button" className="ai-app-ghost" disabled={busy || recoveryBlocked} aria-expanded={items !== undefined} aria-controls="ai-core-saved-cases" onClick={(): void => {
                if (items !== undefined) { setItems(undefined); return; }
                run(async (): Promise<void> => apply(await coreWork.listMine(session)));
              }}>{items === undefined ? 'Show saved cases' : 'Hide saved cases'}</button>
              <button type="button" className="ai-app-ghost" disabled={busy || recoveryBlocked || hasUnsaved} onClick={(): void => run(async (): Promise<void> => {
                const key = await selectionKey;
                if (!mounted.current) { return; }
                try { if (key !== undefined) { browserLocalStorage()?.removeItem(key); } } catch { /* A refused reference cache never causes a business-content fallback. */ }
                setWork(undefined); clearEdited(); setTitle(''); setProblem(''); setOutcome(''); setSponsor('');
                setPackets([]); setPacketId(''); setResponse(''); setCertainty('UNKNOWN');
                setDisposition(''); setAssertion(''); setSourceRefs(''); setStatus(''); setPhase('idle'); setPacketReasons([]);
              })}>New case</button>
            </div>
          </div>
          {items !== undefined && <section id="ai-core-saved-cases" className="ai-case-library" aria-label="My saved cases">
            <h4 className="ai-app-subheading">My saved cases</h4>
            {items.length === 0 ? <p>No saved cases yet. Start one below.</p> : <ul className="ai-case-list">
              {items.map((item: IEmployeeWork): React.ReactElement => <li key={item.workId}>
                <button type="button" className="ai-case-choice" disabled={busy || recoveryBlocked || hasUnsaved} aria-pressed={work?.workId === item.workId} onClick={(): void => run(async (): Promise<void> => {
                  clearEdited(); setWork(undefined); setPackets([]); setPacketId(''); setResponse(''); setCertainty('UNKNOWN');
                  setDisposition(''); setAssertion(''); setSourceRefs('');
                  setTitle(item.title); setProblem(''); setOutcome(''); setSponsor('');
                  await apply(await coreWork.getStatus(session, item.workId));
                })}><strong>{item.title}</strong><span>{item.employeeStatus}</span><small>{item.workId}</small></button>
              </li>)}
            </ul>}
          </section>}
          {work !== undefined && <section className="ai-case-overview" aria-label="Selected case status">
            <div><span className="ai-app-note">Selected case</span><h3 className="ai-app-detail-title">{work.title}</h3><p className="ai-app-note">Case reference: <span>{work.workId}</span></p></div>
            <div><span className="ai-case-status">{work.employeeStatus}</span><p>{nextStep(work)}</p></div>
          </section>}
          <section className="ai-app-panel ai-case-details" aria-labelledby="ai-core-details-heading">
          <h3 className="ai-app-detail-title" id="ai-core-details-heading">{work === undefined ? 'Start a new case' : 'Case details'}</h3>
          <p className="ai-app-note">{work === undefined ? 'Give this work a clear name, describe the problem and say what a useful result would look like. You can fill gaps later.' : 'Update only what needs to change. Previously saved descriptions are not included in the status view; leaving a field untouched keeps its saved value.'}</p>
          <div className="ai-case-fields">
            <div className="ai-case-field ai-case-field--wide">
              <label htmlFor="ai-core-title">Case title</label>
              <input id="ai-core-title" required disabled={busy || recoveryBlocked} value={title} placeholder="For example, reduce time spent preparing weekly reports" onChange={(event): void => { setTitle(event.target.value); markEdited('Title'); }} />
              <p className="ai-case-help">Required. Use a short name you will recognize in your case list.</p>
            </div>
            <div className="ai-case-field">
              <label htmlFor="ai-core-problem">Problem statement</label>
              <textarea id="ai-core-problem" rows={4} disabled={busy || recoveryBlocked} value={problem} placeholder={work === undefined ? 'What is difficult today? Who is affected?' : 'Enter a revised problem, or leave unchanged'} onChange={(event): void => { setProblem(event.target.value); markEdited('ProblemStatement'); }} />
              <p className="ai-case-help">Describe the current task or problem, not a proposed product.</p>
            </div>
            <div className="ai-case-field">
              <label htmlFor="ai-core-outcome">Desired outcome</label>
              <textarea id="ai-core-outcome" rows={4} disabled={busy || recoveryBlocked} value={outcome} placeholder={work === undefined ? 'What should improve, and how would you recognize success?' : 'Enter a revised outcome, or leave unchanged'} onChange={(event): void => { setOutcome(event.target.value); markEdited('DesiredOutcome'); }} />
              <p className="ai-case-help">Explain the result you need. Leave unsupported numbers out.</p>
            </div>
            <div className="ai-case-field ai-case-field--wide">
              <label htmlFor="ai-core-sponsor">Business sponsor</label>
              <input id="ai-core-sponsor" disabled={busy || recoveryBlocked} value={sponsor} placeholder="For example, operations lead — if confirmed" onChange={(event): void => { setSponsor(event.target.value); markEdited('Sponsor'); }} />
              <p className="ai-case-help">The role or confirmed person accountable for this work. Needed for review; do not guess a name.</p>
            </div>
          </div>
          {work !== undefined && <p className="ai-case-help">To remove saved text, edit that field and clear it before saving. Only fields you edit are updated.</p>}
          {coreWork.recoverPending !== undefined && <button className="ai-app-ghost" type="button" disabled={busy} onClick={(): void => run(recoverAndList, true)}>Recover pending result</button>}
          {recoveryBlocked && <AppNotice>Confirm the original command before another request. Recovery reads the original result; it does not repeat a mutation.</AppNotice>}
          <div className="ai-app-actions">
            <button type="button" className="ai-app-primary" disabled={busy || recoveryBlocked || title.trim() === '' || responseDirty || validationDirty} onClick={(): void => run(async (): Promise<void> => {
              if (work !== undefined && !hasEdits) { setStatus('Edit a clarification field before saving.'); return; }
              const result = await coreWork.createOrResume(session, { s1: s1(), workId: work?.workId, changedFields: work === undefined ? undefined : Object.keys(edited) as (keyof IS1)[] });
              if (result.kind === 'ok' && result.observation.phase === 'completed') { clearEdited(); }
              await apply(result);
              if (mounted.current && result.kind === 'ok' && result.observation.phase === 'completed') { setStatus(`Case saved. Status: ${result.work?.employeeStatus ?? 'Confirmed'}.`); }
            })}>
              {work === undefined ? 'Create case' : 'Save case changes'}
            </button>
            <button
              type="button"
              className="ai-app-ghost"
              disabled={busy || recoveryBlocked || work === undefined || hasUnsaved}
              onClick={(): void =>
                run(async (): Promise<void> => {
                  if (work !== undefined) {
                    await apply(await coreWork.getStatus(session, work.workId));
                  }
                })
              }
            >
              Refresh status
            </button>
            {hasEdits && <button type="button" className="ai-app-ghost" disabled={busy || recoveryBlocked} onClick={(): void => { clearEdited(); setTitle(work?.title ?? ''); setProblem(''); setOutcome(''); setSponsor(''); }}>Discard changes</button>}

            <button
              type="button"
              className="ai-app-ghost"
              disabled={busy || recoveryBlocked || work === undefined || hasUnsaved}
              onClick={(): void =>
                run(async (): Promise<void> => {
                  if (work !== undefined) {
                    await apply(await evaluateDecisionPacket(coreWork, session, work.workId));
                  }
                })
              }
            >
              Check required information
            </button>
          </div>
          {hasUnsaved && <p className="ai-case-help">You have unsaved changes. Save or discard them before switching cases, changing information requests or refreshing.</p>}
          <p className="ai-case-help">This checks what is still needed; it does not approve the case or submit it to a board.</p>
          </section>
        </React.Fragment>
      )}
      <p className="ai-case-feedback" role="status" aria-live="polite" data-core-phase={phase}>{busy ? 'Checking the case service…' : status}</p>
      {packetReasons.length > 0 && <AppNotice>{packetReasons.join(' ')}</AppNotice>}
      {packets.length > 0 && <section className="ai-app-panel ai-case-evidence" aria-label="Requested information">
        <h3 className="ai-app-detail-title">Requested information</h3>
        <p className="ai-app-note">Choose a topic, read what is needed and save your response. An authorized reviewer checks the evidence separately.</p>
        <div className="ai-case-field">
        <label htmlFor="ai-core-packet">Information to provide</label>
        <select id="ai-core-packet" value={packetId} disabled={busy || recoveryBlocked || hasUnsaved} onChange={(event): void => {
          const next = packets.filter((packet): boolean => packet.packetId === event.target.value)[0];
          setPacketId(next?.packetId ?? '');
          setResponse(next?.response ?? '');
          setDisposition(''); setAssertion(''); setSourceRefs('');
          const known = next?.knownAssumedUnknown as KnownAssumedUnknown | undefined;
          setCertainty(known !== undefined && KNOWN_ASSUMED_UNKNOWN.indexOf(known) >= 0 ? known : 'UNKNOWN');
        }}>
          <option value="">Choose a topic</option>
          {packets.map((packet): React.ReactElement => <option key={packet.packetId} value={packet.packetId}>{`${packetLabel(packet)} — ${packetState(packet)}`}</option>)}
        </select>
        </div>
        {selectedPacket !== undefined && <React.Fragment>
          <div className="ai-case-request"><h4 className="ai-app-subheading">What to include</h4>
            <ul>{selectedPacket.questions.map((question, index): React.ReactElement => <li key={index}>{question}</li>)}</ul>
            <p className="ai-case-help">{`${selectedPacket.required ? 'Required for review' : 'Optional'}. Assigned to: ${selectedPacket.assignedPerson ?? 'not yet assigned'}. Due: ${selectedPacket.dueDate ?? 'not set'}.`}</p>
          </div>
          <div className="ai-case-field">
          <label htmlFor="ai-core-response">Your response</label>
          <textarea id="ai-core-response" rows={6} value={response} placeholder="Answer the question using permitted facts. State what is missing or still needs checking." disabled={busy || recoveryBlocked || hasEdits} onChange={(event): void => setResponse(event.target.value)} />
          </div>
          <div className="ai-case-field">
          <label htmlFor="ai-core-certainty">Certainty</label>
          <select id="ai-core-certainty" value={certainty} disabled={busy || recoveryBlocked || hasEdits} onChange={(event): void => setCertainty(event.target.value as KnownAssumedUnknown)}>
            {KNOWN_ASSUMED_UNKNOWN.map((known): React.ReactElement => <option key={known} value={known}>{CERTAINTY_LABELS[known]}</option>)}
          </select>
          <p className="ai-case-help">Choose how well your answer is supported, not how confident you feel. Explain assumptions and gaps in your response.</p>
          </div>
        </React.Fragment>}
        <div className="ai-app-actions">
        <button type="button" className="ai-app-primary" disabled={busy || recoveryBlocked || hasEdits || validationDirty || work === undefined || selectedPacket === undefined || response.trim() === ''} onClick={(): void => run(async (): Promise<void> => {
          if (work !== undefined && selectedPacket !== undefined) {
            await apply(await coreWork.submitEvidence(session, { workId: work.workId, evidencePacketId: selectedPacket.packetId, response: response.trim(), knownAssumedUnknown: certainty }));
          }
        })}>Save response</button>
        {responseDirty && <button type="button" className="ai-app-ghost" disabled={busy || recoveryBlocked} onClick={(): void => { setResponse(selectedPacket?.response ?? ''); setCertainty(originalCertainty); }}>Discard response changes</button>}
        </div>
        <p className="ai-case-help">Saving your response is not approval. Only an authorized reviewer can validate it.</p>
        {selectedPacket !== undefined && (mayValidate ? coreWork.validateEvidence === undefined ?
          <AppNotice>Human validation is unavailable in this service. A bound server-authorized validation operation is required.</AppNotice> :
          <fieldset className="ai-case-validation" disabled={busy || recoveryBlocked || hasEdits || responseDirty}>
            <legend>Human evidence validation</legend>
            <p>The server authorizes each validation against the signed-in reviewer and the current packet version. This form does not grant a role or bypass that check.</p>
            <label htmlFor="ai-core-disposition">Validation disposition</label>
            <select id="ai-core-disposition" value={disposition} onChange={(event): void => setDisposition(event.target.value as typeof disposition)}>
              <option value="">Choose a disposition</option>
              <option value="VALIDATED">Validated</option>
              <option value="REJECTED">Rejected</option>
              <option value="NOT_APPLICABLE">Not applicable</option>
            </select>
            <label htmlFor="ai-core-assertion">Human validation assertion</label>
            <textarea id="ai-core-assertion" value={assertion} maxLength={8000} onChange={(event): void => setAssertion(event.target.value)} />
            <label htmlFor="ai-core-source-refs">Supporting source references (one per line)</label>
            <textarea id="ai-core-source-refs" value={sourceRefs} onChange={(event): void => setSourceRefs(event.target.value)} />
            <button type="button" disabled={busy || recoveryBlocked || work === undefined || disposition === '' || assertion.trim().length < 10 || references.length === 0} onClick={(): void => {
              if (!mayValidate || coreWork.validateEvidence === undefined || work === undefined || disposition === '' || assertion.trim().length < 10 || references.length === 0) { return; }
              run(async (): Promise<void> => {
                const result = await coreWork.validateEvidence!(session, { workId: work.workId, evidencePacketId: selectedPacket.packetId, disposition, assertion: assertion.trim(), sourceRefs: references });
                await apply(result);
                if (mounted.current && result.kind === 'ok' && result.observation.phase === 'completed') {
                  setDisposition(''); setAssertion(''); setSourceRefs(''); setStatus('Human review saved and the case refreshed.');
                }
              });
            }}>Record human validation</button>
            {validationDirty && <button type="button" className="ai-app-ghost" disabled={busy || recoveryBlocked} onClick={(): void => { setDisposition(''); setAssertion(''); setSourceRefs(''); }}>Discard review changes</button>}
          </fieldset> : null)}
      </section>}
      {work !== undefined && <details className="ai-case-technical">
        <summary>Technical details</summary>
        <p>{coreWork.label}</p>
        <dl className="ai-case-metadata">
          <div><dt>Case version</dt><dd>{String(work.version)}</dd></div>
          <div><dt>Recorded state</dt><dd>{work.state}</dd></div>
          <div><dt>Recorded next action</dt><dd>{work.nextAction ?? 'None'}</dd></div>
          {selectedPacket !== undefined && <div><dt>Evidence reference / version</dt><dd>{`${selectedPacket.packetId} / ${selectedPacket.currentVersion}`}</dd></div>}
        </dl>
        <p className="ai-case-help">{`Packet interface: ${PACKET_PROJECTION_EXTENSION}`}</p>
      </details>}
    </div>
  );
}

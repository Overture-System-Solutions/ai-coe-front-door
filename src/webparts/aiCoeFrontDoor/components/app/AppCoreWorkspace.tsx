import * as React from 'react';
import { useFrontDoor } from '../../context/FrontDoorContext';
import type { CoreCallResult, ICoreSession, ICoreWorkService } from '../../services/core/coreWorkService';
import { evaluateDecisionPacket } from '../../services/core/coreWorkService';
import type { IEmployeeWork, IS1, KnownAssumedUnknown } from '../../services/core/coreContract';
import type { IWorkPacketProjection } from '../../services/core/packetProjection';
import { PACKET_PROJECTION_EXTENSION } from '../../services/core/packetProjection';
import { AppNotice } from './kit';

/**
 * Labelled synthetic Binding A workspace: create, status, evidence, decision packet request and the packet-list extension.
 * Live writes stay gated on the disabled service; this screen is the local engine only.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export const SYNTHETIC_CORE_NOTICE: string =
  'Synthetic Binding A workspace: real command keys, validators and polling over a local command list. Not a tenant write, not approval, and not a live model call.';

export function AppCoreWorkspace({ coreWork }: { coreWork: ICoreWorkService }): React.ReactElement {
  const { user, siteUrl } = useFrontDoor();
  const session: ICoreSession = { actorId: user.email, tenantScope: siteUrl };
  const [title, setTitle] = React.useState<string>('Automate a weekly operations pack');
  const [outcome, setOutcome] = React.useState<string>('A reviewed weekly pack with less copying.');
  const [problem, setProblem] = React.useState<string>('Hours spent copying numbers between tools.');
  const [sponsor, setSponsor] = React.useState<string>('Named sponsor (synthetic)');
  const [work, setWork] = React.useState<IEmployeeWork | undefined>(undefined);
  const [packets, setPackets] = React.useState<IWorkPacketProjection[]>([]);
  const [status, setStatus] = React.useState<string>(coreWork.label);
  const [phase, setPhase] = React.useState<string>('idle');
  const [busy, setBusy] = React.useState<boolean>(false);

  const apply = React.useCallback(
    async (result: CoreCallResult): Promise<void> => {
      if (result.kind === 'disabled') {
        setPhase('error');
        setStatus(result.reasons.join(' '));
        return;
      }
      const observation = result.observation;
      setPhase(observation.phase);
      if (result.kind === 'ok') {
        if (result.work !== undefined) {
          setWork(result.work);
        }
        setStatus(`${observation.phase}: ${result.work?.employeeStatus ?? observation.reason ?? 'completed'}`);
        if (result.work !== undefined) {
          const listed = await coreWork.listPackets(session, result.work.workId);
          setPackets(listed.packets);
        }
        return;
      }
      const message: string = observation.response !== undefined && observation.response.Result !== 'PASS' ? observation.response.Message : observation.reason ?? 'The command did not complete.';
      setStatus(message);
    },
    [coreWork, session]
  );

  const s1 = React.useCallback((): IS1 => {
    return {
      Title: title.trim(),
      SourceChannel: 'FRONT_DOOR',
      ProblemStatement: problem.trim() === '' ? null : problem.trim(),
      DesiredOutcome: outcome.trim() === '' ? null : outcome.trim(),
      Requester: user.email,
      Sponsor: sponsor.trim() === '' ? null : sponsor.trim(),
      DataClassification: 'INTERNAL'
    };
  }, [title, outcome, problem, sponsor, user.email]);

  const run = React.useCallback(
    (work: () => Promise<void>): void => {
      setBusy(true);
      work().then(
        (): void => setBusy(false),
        (): void => {
          setBusy(false);
          setPhase('error');
          setStatus('The synthetic command failed before a result was returned.');
        }
      );
    },
    []
  );

  return (
    <div className="ai-app-panel">
      <AppNotice tone="info">{SYNTHETIC_CORE_NOTICE}</AppNotice>
      <p className="ai-app-note">{coreWork.label}</p>
      {!coreWork.enabled && (
        <ul className="ai-app-list">
          {coreWork.liveReasons.map((reason: string): React.ReactElement => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {coreWork.enabled && (
        <React.Fragment>
          <label className="ai-app-field-label" htmlFor="ai-core-title">
            Title
            <input id="ai-core-title" className="ai-app-command-input" value={title} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setTitle(event.target.value)} />
          </label>
          <label className="ai-app-field-label" htmlFor="ai-core-problem">
            Problem statement
            <input id="ai-core-problem" className="ai-app-command-input" value={problem} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setProblem(event.target.value)} />
          </label>
          <label className="ai-app-field-label" htmlFor="ai-core-outcome">
            Desired outcome
            <input id="ai-core-outcome" className="ai-app-command-input" value={outcome} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setOutcome(event.target.value)} />
          </label>
          <label className="ai-app-field-label" htmlFor="ai-core-sponsor">
            Sponsor (role, not a default person)
            <input id="ai-core-sponsor" className="ai-app-command-input" value={sponsor} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setSponsor(event.target.value)} />
          </label>
          <div className="ai-app-actions">
            <button type="button" className="ai-app-primary" disabled={busy} onClick={(): void => run(async (): Promise<void> => apply(await coreWork.createOrResume(session, { s1: s1() })))}>
              Create work
            </button>
            <button
              type="button"
              className="ai-app-ghost"
              disabled={busy || work === undefined}
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
            <button type="button" className="ai-app-ghost" disabled={busy} onClick={(): void => run(async (): Promise<void> => apply(await coreWork.listMine(session)))}>
              List my work
            </button>
            <button
              type="button"
              className="ai-app-ghost"
              disabled={busy || work === undefined || packets.length === 0}
              onClick={(): void =>
                run(async (): Promise<void> => {
                  if (work === undefined || packets[0] === undefined) {
                    return;
                  }
                  const known: KnownAssumedUnknown = 'KNOWN';
                  await apply(await coreWork.submitEvidence(session, { workId: work.workId, evidencePacketId: packets[0].packetId, response: 'Synthetic evidence returned for local testing.', knownAssumedUnknown: known }));
                })
              }
            >
              Return first packet
            </button>
            <button
              type="button"
              className="ai-app-ghost"
              disabled={busy || work === undefined}
              onClick={(): void =>
                run(async (): Promise<void> => {
                  if (work !== undefined) {
                    await apply(await evaluateDecisionPacket(coreWork, session, work.workId));
                  }
                })
              }
            >
              Ask for a decision packet
            </button>
          </div>
        </React.Fragment>
      )}
      <p className="ai-app-note" data-core-phase={phase}>{`Command: ${phase}. ${status}`}</p>
      {work !== undefined && (
        <dl className="ai-app-contract">
          <dt>Work ID</dt>
          <dd>{work.workId}</dd>
          <dt>State</dt>
          <dd>{work.state}</dd>
          <dt>Employee status</dt>
          <dd>{work.employeeStatus}</dd>
          <dt>Version</dt>
          <dd>{String(work.version)}</dd>
          <dt>Next action</dt>
          <dd>{work.nextAction ?? 'None'}</dd>
        </dl>
      )}
      {packets.length > 0 && (
        <p className="ai-app-note">{`Packet projection (${PACKET_PROJECTION_EXTENSION}): ${packets.length} packets. Assigned people are unbound.`}</p>
      )}
    </div>
  );
}

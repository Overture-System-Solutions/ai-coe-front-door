/**
 * A local Binding A processor that follows the *generated* 3.0.0.0 flow semantics, not the recorded mock server.
 *
 * Deliberate agreements with the generated flows, recorded against the fixtures in the conformance matrix:
 * create writes Version 1 (fixtures show 2); a ready case is READY_FOR_ARB (fixtures show DECISION_READY and
 * Lane PREPARATION); replay returns the stored body including Created:true per v0.1.1 §7a (the replay fixture
 * rewrites Created to false). Partial resume without Title/SourceChannel is refused as a create-shaped request.
 *
 * This is not a native Power Automate runtime and not an authorization simulator of the tenant.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { NO_RECEIPT, parseRequest, parseResponse, toEmployeeWork } from './coreContract';
import type {
  CoreOperation,
  CoreRequest,
  CoreResponse,
  ICoreError,
  ICreateOrResumeRequest,
  ICreateOrResumeSuccess,
  IEmployeeWork,
  IGetWorkStatusRequest,
  IListMyWorkRequest,
  IRequestReadinessRequest,
  ISubmitEvidenceRequest,
  IWorkProjection,
  PacketStatus,
  ReadinessState
} from './coreContract';
import type { ICommandRow } from './commandTransport';
import type { IWorkPacketProjection } from './packetProjection';

export interface IStoredWork {
  work: IWorkProjection;
  requester: string;
  s1: ICreateOrResumeRequest['S1'];
  packets: IWorkPacketProjection[];
  created: boolean;
  createResponse: ICreateOrResumeSuccess | undefined;
}

export class LocalCoreEngine {
  private readonly _works: { [workId: string]: IStoredWork } = {};
  private _serial: number = 1;

  public constructor(private readonly _now: () => Date = (): Date => new Date()) {}

  public workOf(workId: string): IStoredWork | undefined {
    return this._works[workId];
  }

  public dump(): { serial: number; works: { [workId: string]: IStoredWork } } {
    const works: { [workId: string]: IStoredWork } = {};
    for (const id of Object.keys(this._works)) {
      works[id] = this._works[id];
    }
    return { serial: this._serial, works };
  }

  public load(dump: { serial: number; works: { [workId: string]: IStoredWork } }): void {
    this._serial = dump.serial;
    for (const id of Object.keys(this._works)) {
      delete this._works[id];
    }
    for (const id of Object.keys(dump.works)) {
      this._works[id] = dump.works[id];
    }
  }

  public allWorks(): IStoredWork[] {
    return Object.keys(this._works).map((id: string): IStoredWork => this._works[id]);
  }

  public async process(row: ICommandRow): Promise<ICommandRow> {
    const parsed = parseRequest(row.operation, JSON.parse(row.requestJson) as unknown);
    if (!parsed.valid || parsed.value === undefined) {
      return complete(row, error('FAIL', 'VALIDATION_FAILED', parsed.errors.join(' '), false));
    }
    const response: CoreResponse = this._handle(row.operation, parsed.value, row.author);
    return complete(row, response);
  }

  private _handle(operation: CoreOperation, request: CoreRequest, author: string): CoreResponse {
    switch (operation) {
      case 'CreateOrResumeWork':
        return this._createOrResume(request as ICreateOrResumeRequest, author);
      case 'GetWorkStatus':
        return this._status(request as IGetWorkStatusRequest, author);
      case 'ListMyWork':
        return this._list(request as IListMyWorkRequest, author);
      case 'SubmitEvidenceResponse':
        return this._evidence(request as ISubmitEvidenceRequest, author);
      case 'RequestDecisionReadiness':
        return this._readiness(request as IRequestReadinessRequest, author);
      case 'ListEvidencePackets':
      case 'ValidateEvidencePacket':
        return error('FAIL', 'UNSUPPORTED_OPERATION', 'Native evidence operations are not part of this synthetic v0.1.1 engine.', false);
      default: {
        const exhaustive: never = operation;
        return error('FAIL', 'UNSUPPORTED_OPERATION', `Unknown operation ${String(exhaustive)}.`, false);
      }
    }
  }

  private _createOrResume(request: ICreateOrResumeRequest, author: string): CoreResponse {
    const resumeId: string | null | undefined = request.WorkID;
    if (resumeId) {
      const held: IStoredWork | undefined = this._works[resumeId];
      if (held === undefined) {
        return error('FAIL', 'NOT_FOUND', 'No work with that identifier exists.', false);
      }
      if (held.requester !== author) {
        return this._denied();
      }
      held.s1 = { ...held.s1, ...request.S1, Requester: held.requester };
      // A changed intake needs current evidence; old returns are retained only as unvalidated draft answers.
      held.packets = held.packets.map((packet: IWorkPacketProjection): IWorkPacketProjection => ({
        ...packet,
        status: 'OPEN',
        currentVersion: packet.currentVersion + 1
      }));
      const gaps: string[] = s1Gaps(held.s1);
      held.work = {
        ...held.work,
        Title: held.s1.Title,
        Stage: 'INTAKE',
        State: gaps.length > 0 ? 'CLARIFYING' : 'READY_FOR_TRIAGE',
        EmployeeStatus: gaps.length > 0 ? 'Need one answer' : 'Working',
        Lane: 'INTAKE',
        NextAction: gaps.length > 0 ? `RETURN_TO_REQUESTER_CLARIFY: ${gaps.join(', ')}` : 'TRIAGE',
        NextOwner: author,
        Version: held.work.Version + 1,
        LastValidatedAt: iso(this._now()),
        OpenEvidenceGaps: gaps
      };
      return {
        Result: 'PASS',
        ReceiptID: this._receipt('RESUME'),
        Work: held.work,
        Created: false,
        ClarificationRequired: held.work.OpenEvidenceGaps ?? []
      };
    }
    const gaps: string[] = s1Gaps(request.S1);
    const workId: string = this._mintWorkId();
    const stamp: string = iso(this._now());
    const work: IWorkProjection = {
      WorkID: workId,
      Title: request.S1.Title,
      Stage: 'INTAKE',
      State: gaps.length > 0 ? 'CLARIFYING' : 'READY_FOR_TRIAGE',
      EmployeeStatus: gaps.length > 0 ? 'Need one answer' : 'Working',
      Lane: 'INTAKE',
      NextAction: gaps.length > 0 ? `RETURN_TO_REQUESTER_CLARIFY: ${gaps.join(', ').toLowerCase().replace(/s1_/g, '')}` : 'TRIAGE',
      NextOwner: author,
      NextDate: stamp,
      Version: 1,
      LastValidatedAt: stamp,
      OpenEvidenceGaps: gaps,
      DuplicateStatus: 'NOT_CHECKED'
    };
    const success: ICreateOrResumeSuccess = {
      Result: 'PASS',
      ReceiptID: this._receipt('CREATE'),
      Work: work,
      Created: true,
      ClarificationRequired: gaps
    };
    this._works[workId] = {
      work,
      requester: author,
      s1: request.S1,
      packets: defaultPackets(workId),
      created: true,
      createResponse: success
    };
    return success;
  }

  private _status(request: IGetWorkStatusRequest, author: string): CoreResponse {
    const held: IStoredWork | undefined = this._works[request.WorkID];
    if (held === undefined) {
      return error('FAIL', 'NOT_FOUND', 'No work with that identifier exists.', false);
    }
    if (held.requester !== author) {
      return this._denied();
    }
    return { Result: 'PASS', ReceiptID: this._receipt('STATUS'), Work: held.work };
  }

  private _list(request: IListMyWorkRequest, author: string): CoreResponse {
    if (request.Requester.trim().toLowerCase() !== author.trim().toLowerCase()) {
      return this._denied();
    }
    const items: IWorkProjection[] = this.allWorks()
      .filter((held: IStoredWork): boolean => held.requester === author)
      .map((held: IStoredWork): IWorkProjection => held.work);
    return { Result: 'PASS', ReceiptID: this._receipt('LIST'), Items: items };
  }

  private _evidence(request: ISubmitEvidenceRequest, author: string): CoreResponse {
    const held: IStoredWork | undefined = this._works[request.WorkID];
    if (held === undefined) {
      return error('FAIL', 'NOT_FOUND', 'No work with that identifier exists.', false);
    }
    if (held.requester !== author) {
      return this._denied();
    }
    const packet: IWorkPacketProjection | undefined = held.packets.filter((item: IWorkPacketProjection): boolean => item.packetId === request.EvidencePacketID)[0];
    if (packet === undefined) {
      return error('FAIL', 'NOT_FOUND', 'No evidence packet with that identifier exists on this work.', false);
    }
    packet.status = 'RETURNED';
    packet.currentVersion += 1;
    packet.response = request.Response;
    packet.knownAssumedUnknown = request.KnownAssumedUnknown;
    held.work = {
      ...held.work,
      State: 'EVIDENCE_BUILDING',
      EmployeeStatus: 'Working',
      Stage: 'EVIDENCE',
      Version: held.work.Version + 1,
      LastValidatedAt: iso(this._now())
    };
    const status: PacketStatus = 'RETURNED';
    return { Result: 'PASS', ReceiptID: this._receipt('EVIDENCE'), Work: held.work, PacketStatus: status };
  }

  private _readiness(request: IRequestReadinessRequest, author: string): CoreResponse {
    const held: IStoredWork | undefined = this._works[request.WorkID];
    if (held === undefined) {
      return error('FAIL', 'NOT_FOUND', 'No work with that identifier exists.', false);
    }
    if (held.requester !== author) {
      return this._denied();
    }
    const s1: string[] = s1Gaps(held.s1);
    const missingPackets: string[] = held.packets.filter((packet: IWorkPacketProjection): boolean => packet.required && packet.status !== 'RETURNED' && packet.status !== 'VALIDATED' && packet.status !== 'NOT_APPLICABLE').map((packet: IWorkPacketProjection): string => packet.packetType);
    const blocking: string[] = s1.concat(missingPackets);
    const ready: boolean = blocking.length === 0;
    const state: ReadinessState = ready ? 'READY' : 'NOT_READY';
    held.work = {
      ...held.work,
      Stage: ready ? 'DECISION' : 'EVIDENCE',
      State: ready ? 'READY_FOR_ARB' : 'NOT_DECISION_READY',
      EmployeeStatus: ready ? 'With the right reviewer' : 'Working',
      Lane: ready ? 'DECISION' : 'EVIDENCE',
      NextAction: ready ? 'Decision packet prepared; this is not board submission or approval.' : `Complete: ${blocking.join(', ')}`,
      Version: held.work.Version + 1,
      LastValidatedAt: iso(this._now()),
      OpenEvidenceGaps: blocking
    };
    return {
      Result: 'PASS',
      ReceiptID: this._receipt('READY'),
      Work: held.work,
      DecisionReadinessState: state,
      BlockingGates: blocking,
      DecisionPacketID: ready ? `DP-${held.work.WorkID}-001` : null
    };
  }

  private _denied(): ICoreError {
    return error('DENIED', 'NOT_AUTHORIZED', 'You do not have access to this work.', false);
  }

  private _receipt(kind: string): string {
    const n: string = String(this._serial).padStart(3, '0');
    this._serial += 1;
    return `RCPT-LOCAL-${kind}-${n}`;
  }

  private _mintWorkId(): string {
    const n: string = String(this._serial).padStart(4, '0');
    this._serial += 1;
    return `CW-LOCAL_${n}`;
  }
}

function s1Gaps(s1: ICreateOrResumeRequest['S1']): string[] {
  const gaps: string[] = [];
  if (!s1.ProblemStatement) {
    gaps.push('S1_PROBLEM_STATEMENT');
  }
  if (!s1.Sponsor) {
    gaps.push('S1_SPONSOR');
  }
  if (!s1.DesiredOutcome) {
    gaps.push('S1_DESIRED_OUTCOME');
  }
  return gaps;
}

function defaultPackets(workId: string): IWorkPacketProjection[] {
  const types: { packetType: string; role: string }[] = [
    { packetType: 'S2_OPERATING', role: 'operating-owner' },
    { packetType: 'S3_FINANCIAL', role: 'finance-reviewer' },
    { packetType: 'S4_TECHNICAL', role: 'technical-reviewer' },
    { packetType: 'S5_RISK', role: 'risk-reviewer' }
  ];
  return types.map((entry: { packetType: string; role: string }, index: number): IWorkPacketProjection => ({
    packetId: `EVP-${workId}-${entry.packetType}`,
    workId,
    packetType: entry.packetType,
    questions: [`Provide the ${entry.packetType.replace(/_/g, ' ').toLowerCase()} facts for this case.`],
    assignedRole: entry.role,
    assignedPerson: null,
    dueDate: null,
    currentVersion: 1,
    status: 'OPEN',
    required: true,
    extension: true
  }));
}

function error(result: ICoreError['Result'], errorClass: string, message: string, retry: boolean): ICoreError {
  return { Result: result, ErrorClass: errorClass, Message: message, ReceiptID: NO_RECEIPT, RetryAllowed: retry };
}

function iso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function complete(row: ICommandRow, response: CoreResponse): ICommandRow {
  const check = parseResponse(row.operation, response);
  const body: CoreResponse = check.value ?? error('INCONCLUSIVE', 'FLOW_FAILURE', 'The processor produced a response that did not validate.', true);
  return {
    ...row,
    claimed: true,
    claimedAt: row.claimedAt ?? iso(new Date()),
    result: body.Result === 'PASS' ? 'PASS' : body.Result,
    receiptId: 'ReceiptID' in body ? body.ReceiptID : NO_RECEIPT,
    workId: 'Work' in body && body.Work !== undefined ? body.Work.WorkID : row.workId,
    responseJson: JSON.stringify(body)
  };
}

export function employeeProjection(work: IWorkProjection): IEmployeeWork {
  return toEmployeeWork(work);
}

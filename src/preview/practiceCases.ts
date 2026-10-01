/**
 * The offline preview's worked example of how a request becomes an AI CoE case and, for a case rated High, a business
 * case in the practice case service (1.0.0.19). Everything here is fictional and loads in the preview alone.
 *
 * Four requests of the preview person, each with its AI CoE case under the same reference, as the front door writes
 * them: one approved without a business case, one waiting for information, and two rated High that each have a
 * business case. One business case is still collecting its four sections; the other is complete, reviewed and ready
 * for the review board. Which cases need a business case is not decided; the Cases tab shows the two options.
 *
 * Served as /practiceCases.js beside the preview host and written for its ES5 build: no spread, rest or async/await,
 * and type-only imports, so the browser loads it without helpers.
 */
import type { IStoredWork } from '../webparts/aiCoeFrontDoor/services/core/localCoreEngine';
import type { IWorkPacketProjection } from '../webparts/aiCoeFrontDoor/services/core/packetProjection';

/** The preview's signed-in person, who owns every request and business case here. */
export const PRACTICE_PERSON: string = 'preview@example.invalid';

/** Where the practice case service keeps its state (`SYNTHETIC_CORE_STORE_KEY`; a test keeps the two equal). */
export const PRACTICE_CORE_STORE_KEY: string = 'overture-ai-coe-front-door:core:synthetic-state';

export interface IPracticeIntake {
  IntakeId: string;
  Title: string;
  WorkflowType: string;
  Status: string;
  RequestorName: string;
  RequestorEmail: string;
  SubmittedAt: string;
  Modified: string;
}

export interface IPracticeUseCase {
  CoEID: string;
  Title: string;
  Status: string;
  RiskTier: string;
  DataSensitivity: string;
  ExternalUsers: boolean;
  AutonomousActions: boolean;
  EstimatedMonthlyCost: number;
  ApprovalOutcome: string;
  NextReviewDate: string | null;
  BusinessProblem: string;
  SubmitterEmail: string;
  BusinessOwnerEmail: string;
  Created: string;
  Modified: string;
}

export interface IPracticeJourney {
  intakes: IPracticeIntake[];
  useCases: IPracticeUseCase[];
  works: { [workId: string]: IStoredWork };
}

interface IStep {
  reference: string;
  workflowType: string;
  sent: string;
  intakeStatus: string;
  title: string;
  status: string;
  risk: string;
  sensitivity: string;
  external: boolean;
  autonomous: boolean;
  cost: number;
  outcome: string;
  nextReview: string | null;
}

// Fixed references and dates, so a business case saved in this browser still points at the same request tomorrow.
const STEPS: IStep[] = [
  {
    reference: 'OVT-AICOE-20260908-JOURNEY2', workflowType: 'idea', sent: '2026-09-08T14:00:00Z', intakeStatus: 'Closed - Pilot',
    title: 'Suggest answers in the team help channel (fictional)', status: 'Approved', risk: 'Low', sensitivity: 'Internal',
    external: false, autonomous: false, cost: 40, outcome: 'Approved', nextReview: '2026-10-12T14:00:00Z'
  },
  {
    reference: 'OVT-AICOE-20260922-JOURNEY3', workflowType: 'idea', sent: '2026-09-22T10:00:00Z', intakeStatus: 'In Review - Pilot',
    title: 'Summarise supplier contracts before renewal (fictional)', status: 'Needs Information', risk: '', sensitivity: '',
    external: false, autonomous: false, cost: 300, outcome: '', nextReview: null
  },
  {
    reference: 'OVT-AICOE-20260918-JOURNEY4', workflowType: 'idea', sent: '2026-09-18T09:00:00Z', intakeStatus: 'In Review - Pilot',
    title: 'Draft first replies to patient billing questions (fictional)', status: 'Ready for Review', risk: 'High', sensitivity: 'Restricted',
    external: true, autonomous: false, cost: 1200, outcome: '', nextReview: null
  },
  {
    reference: 'OVT-AICOE-20260910-JOURNEY5', workflowType: 'teamUsage', sent: '2026-09-10T16:00:00Z', intakeStatus: 'In Review - Pilot',
    title: 'Close duplicate service-desk tickets automatically (fictional)', status: 'Under Review', risk: 'High', sensitivity: 'Confidential',
    external: false, autonomous: true, cost: 600, outcome: '', nextReview: null
  }
];

const ROLES: { [packetType: string]: string } = {
  S2_OPERATING: 'operating-owner',
  S3_FINANCIAL: 'finance-reviewer',
  S4_TECHNICAL: 'technical-reviewer',
  S5_RISK: 'risk-reviewer'
};

interface ISection {
  packetType: string;
  questions: string[];
  status: IWorkPacketProjection['status'];
  version: number;
  response?: string;
  certainty?: string;
  due?: string;
}

function packets(workId: string, sections: ISection[]): IWorkPacketProjection[] {
  return sections.map((section: ISection): IWorkPacketProjection => {
    const packet: IWorkPacketProjection = {
      packetId: `EVP-${workId}-${section.packetType}`,
      workId,
      packetType: section.packetType,
      questions: section.questions,
      assignedRole: ROLES[section.packetType],
      assignedPerson: null,
      dueDate: section.due === undefined ? null : section.due,
      currentVersion: section.version,
      status: section.status,
      required: true,
      extension: true
    };
    if (section.response !== undefined) {
      packet.response = section.response;
      packet.knownAssumedUnknown = section.certainty;
    }
    return packet;
  });
}

function businessCaseInProgress(): IStoredWork {
  const step: IStep = STEPS[2];
  const workId: string = 'CW-PRACTICE-0001';
  return {
    requester: PRACTICE_PERSON,
    created: true,
    createResponse: undefined,
    s1: {
      Title: step.title,
      SourceChannel: 'FRONT_DOOR',
      Requester: PRACTICE_PERSON,
      ProblemStatement: 'Billing specialists write much the same first reply to most patient billing questions, and replies take two days at month end. (Fictional.)',
      DesiredOutcome: 'A drafted first reply that a billing specialist checks and sends the same day. (Fictional.)',
      Sponsor: 'Patient billing manager (fictional)',
      DataClassification: 'RESTRICTED'
    },
    work: {
      WorkID: workId,
      Title: step.title,
      Stage: 'EVIDENCE',
      State: 'EVIDENCE_BUILDING',
      EmployeeStatus: 'Working',
      Lane: 'EVIDENCE',
      NextAction: 'Complete: S5_RISK',
      NextOwner: PRACTICE_PERSON,
      NextDate: null,
      Version: 5,
      LastValidatedAt: '2026-09-29T15:00:00Z',
      OpenEvidenceGaps: ['S5_RISK'],
      DuplicateStatus: 'NOT_CHECKED',
      LegacyRefs: { IntakeId: step.reference, CoEID: step.reference }
    },
    packets: packets(workId, [
      {
        packetType: 'S2_OPERATING', status: 'VALIDATED', version: 3, certainty: 'KNOWN',
        questions: ['Who does this work today, and how often?', 'What happens to a reply before it reaches the patient?'],
        response: 'Six billing specialists answer about 900 questions a month. A specialist reads every reply before it is sent. (Fictional.)'
      },
      {
        packetType: 'S3_FINANCIAL', status: 'RETURNED', version: 2, certainty: 'ASSUMED',
        questions: ['What does the work cost today?', 'What would the AI service cost each month?'],
        response: 'About 150 staff hours a month today. The drafting service is estimated at $1,200 a month; the estimate still needs checking. (Fictional.)'
      },
      {
        packetType: 'S4_TECHNICAL', status: 'RETURNED', version: 2, certainty: 'KNOWN',
        questions: ['Which systems would it read from or write to?', 'Who would support it?'],
        response: 'It reads the billing inbox only, and drafts stay in the inbox for a person to send. The billing systems team supports it. (Fictional.)'
      },
      {
        packetType: 'S5_RISK', status: 'OPEN', version: 1, due: '2026-10-08',
        questions: ['Which patient information would the AI service see, and where is it kept?', 'What could go wrong, and how would a person catch it before a patient sees it?']
      }
    ])
  };
}

function businessCaseReady(): IStoredWork {
  const step: IStep = STEPS[3];
  const workId: string = 'CW-PRACTICE-0002';
  return {
    requester: PRACTICE_PERSON,
    created: true,
    createResponse: undefined,
    s1: {
      Title: step.title,
      SourceChannel: 'FRONT_DOOR',
      Requester: PRACTICE_PERSON,
      ProblemStatement: 'Duplicate tickets take about a fifth of the service desk’s triage time. (Fictional.)',
      DesiredOutcome: 'Duplicates are found and closed automatically, and a person can reopen any of them. (Fictional.)',
      Sponsor: 'Service desk lead (fictional)',
      DataClassification: 'CONFIDENTIAL'
    },
    work: {
      WorkID: workId,
      Title: step.title,
      Stage: 'DECISION',
      State: 'READY_FOR_ARB',
      EmployeeStatus: 'With the right reviewer',
      Lane: 'DECISION',
      NextAction: 'Decision packet prepared; this is not board submission or approval.',
      NextOwner: PRACTICE_PERSON,
      NextDate: null,
      Version: 9,
      LastValidatedAt: '2026-09-30T10:00:00Z',
      OpenEvidenceGaps: [],
      DuplicateStatus: 'NOT_CHECKED',
      LegacyRefs: { IntakeId: step.reference, CoEID: step.reference }
    },
    packets: packets(workId, [
      {
        packetType: 'S2_OPERATING', status: 'VALIDATED', version: 3, certainty: 'KNOWN',
        questions: ['Who does this work today, and how often?', 'What happens when a ticket is closed by mistake?'],
        response: 'Four analysts triage about 2,000 tickets a week. A closed duplicate can be reopened from the ticket in one step. (Fictional.)'
      },
      {
        packetType: 'S3_FINANCIAL', status: 'VALIDATED', version: 2, certainty: 'KNOWN',
        questions: ['What does the work cost today?', 'What would the AI service cost each month?'],
        response: 'About 60 analyst hours a week today; the service costs $600 a month on the current plan. (Fictional.)'
      },
      {
        packetType: 'S4_TECHNICAL', status: 'VALIDATED', version: 2, certainty: 'KNOWN',
        questions: ['Which systems would it read from or write to?', 'Who would support it?'],
        response: 'It reads new tickets and closes duplicates in the service-desk system; the service desk platform team supports it. (Fictional.)'
      },
      {
        packetType: 'S5_RISK', status: 'VALIDATED', version: 2, certainty: 'MIXED',
        questions: ['What could go wrong, and how would a person catch it?', 'What information does it see?'],
        response: 'A wrong match closes a real ticket: every closure notifies the requester, who can reopen it, and analysts review a sample weekly. It sees ticket text, which can name employees. (Fictional.)'
      }
    ])
  };
}

/** The four requests, their cases and the two business cases, built fresh each time. */
export function practiceJourney(): IPracticeJourney {
  const intakes: IPracticeIntake[] = STEPS.map((step: IStep): IPracticeIntake => ({
    IntakeId: step.reference,
    Title: `${step.workflowType} — ${step.reference}`,
    WorkflowType: step.workflowType,
    Status: step.intakeStatus,
    RequestorName: 'Local Preview (fictional)',
    RequestorEmail: PRACTICE_PERSON,
    SubmittedAt: step.sent,
    Modified: step.sent
  }));
  const useCases: IPracticeUseCase[] = STEPS.map((step: IStep): IPracticeUseCase => ({
    CoEID: step.reference,
    Title: step.title,
    Status: step.status,
    RiskTier: step.risk,
    DataSensitivity: step.sensitivity,
    ExternalUsers: step.external,
    AutonomousActions: step.autonomous,
    EstimatedMonthlyCost: step.cost,
    ApprovalOutcome: step.outcome,
    NextReviewDate: step.nextReview,
    BusinessProblem: 'Fictional business problem text for the preview.',
    SubmitterEmail: PRACTICE_PERSON,
    BusinessOwnerEmail: PRACTICE_PERSON,
    Created: step.sent,
    Modified: step.sent
  }));
  const works: { [workId: string]: IStoredWork } = {};
  const inProgress: IStoredWork = businessCaseInProgress();
  const ready: IStoredWork = businessCaseReady();
  works[inProgress.work.WorkID] = inProgress;
  works[ready.work.WorkID] = ready;
  return { intakes, useCases, works };
}

interface ISavedState {
  rows: unknown[];
  engine: { serial: number; works: { [workId: string]: unknown } };
  associations: { [workId: string]: unknown };
  evals: { [workId: string]: unknown };
}

function savedState(saved: string | null): ISavedState {
  const fresh: ISavedState = { rows: [], engine: { serial: 1, works: {} }, associations: {}, evals: {} };
  if (saved === null || saved === '') {
    return fresh;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch {
    return fresh;
  }
  const state: Partial<ISavedState> | null = parsed !== null && typeof parsed === 'object' ? (parsed as Partial<ISavedState>) : null;
  if (state === null || state.engine === undefined || state.engine === null || typeof state.engine.works !== 'object' || state.engine.works === null || !Array.isArray(state.rows)) {
    return fresh;
  }
  return {
    rows: state.rows,
    engine: { serial: typeof state.engine.serial === 'number' && state.engine.serial >= 1 ? state.engine.serial : 1, works: state.engine.works },
    associations: state.associations !== undefined && state.associations !== null ? state.associations : {},
    evals: state.evals !== undefined && state.evals !== null ? state.evals : {}
  };
}

/**
 * The saved practice state with the example business cases added where they are missing. Anything already saved,
 * including an example case changed while practising, is kept as it is; unreadable state starts again from the example.
 */
export function withPracticeCases(saved: string | null, works: { [workId: string]: IStoredWork }): string {
  const state: ISavedState = savedState(saved);
  for (const workId of Object.keys(works)) {
    if (!Object.prototype.hasOwnProperty.call(state.engine.works, workId)) {
      state.engine.works[workId] = JSON.parse(JSON.stringify(works[workId]));
    }
  }
  return JSON.stringify(state);
}

import { includes } from '../utils/collections';
import type { SubmissionWorkflowType } from '../workflows/types';
import { classifyError, failureLogDetail, failureUserMessage, statusError } from './failureClass';
import type { FailureClass } from './failureClass';
import { evaluateFlags } from './flags';
import type { IRecord, ISubmissionFlags } from './flags';
import { createIntakeId } from './intakeId';
import type { IAdminDashboardData, IGovernanceService, IListItem, IListResponse, IServiceContext, ISubmissionResult } from './types';

export const INTAKES_LIST_TITLE: string = 'AI CoE Pilot Intakes';
export const USE_CASES_LIST_TITLE: string = 'AI CoE Use Cases';
export const DECISIONS_LIST_TITLE: string = 'AI CoE Decisions';

const ACCEPT_HEADER: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };
const WRITE_HEADERS: { [name: string]: string } = {
  Accept: 'application/json;odata=nometadata',
  'Content-Type': 'application/json;odata=nometadata'
};

/** The largest payload persisted verbatim; longer JSON is cut exactly as the shipped build did. */
const PAYLOAD_LIMIT: number = 60000;
const PAYLOAD_KEEP: number = 59940;
const TEXT_LIMIT: number = 12000;

const GOVERNANCE_WORKFLOWS: readonly SubmissionWorkflowType[] = ['idea', 'toolCheck-review-request', 'teamUsage'];

const WORKFLOW_LABELS: { [type in SubmissionWorkflowType]: string } = {
  idea: 'AI idea',
  toolCheck: 'Tool or task check',
  'toolCheck-review-request': 'CoE review request',
  teamUsage: 'Existing team AI use',
  helpTraining: 'Help or training',
  feedback: 'Front-door feedback'
};

export function workflowLabel(workflowType: SubmissionWorkflowType): string {
  return WORKFLOW_LABELS[workflowType] || workflowType;
}

/** Routes that also create a core use case for intake and triage. */
export function isGovernanceWorkflow(workflowType: SubmissionWorkflowType): boolean {
  return includes(GOVERNANCE_WORKFLOWS, workflowType);
}

function siteRoot(siteUrl: string): string {
  return siteUrl.replace(/\/$/, '');
}

/** `<site>/_api/web/lists/getbytitle('<title>')/items` with apostrophes escaped for OData. */
export function listItemsUrl(siteUrl: string, listTitle: string): string {
  return `${siteRoot(siteUrl)}/_api/web/lists/getbytitle('${listTitle.replace(/'/g, "''")}')/items`;
}

function asRecord(value: unknown): IRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as IRecord) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The shipped `<list> returned <status>: <body>` error, with the status kept beside the message for the failure class. */
async function failureError(listTitle: string, response: IListResponse): Promise<Error> {
  const body: string = await response.text();
  return statusError(listTitle, response.status, body.slice(0, 500));
}

/** Writes submissions to the pilot intake list (and the core use-case list) and reads the admin dashboard data. */
export class GovernanceService implements IGovernanceService {
  private readonly _context: IServiceContext;
  private readonly _clock: () => Date;
  private readonly _createIntakeId: () => string;

  public constructor(context: IServiceContext, clock: () => Date = (): Date => new Date(), intakeId: () => string = (): string => createIntakeId()) {
    this._context = context;
    this._clock = clock;
    this._createIntakeId = intakeId;
  }

  public async submitWorkflow(workflowType: SubmissionWorkflowType, payload: unknown): Promise<ISubmissionResult> {
    const intakeId: string = this._createIntakeId();
    const record: IRecord = asRecord(payload);
    const answers: IRecord = asRecord(record.originalAnswers || payload);
    const contact: IRecord = asRecord(record.requestedBy || record.contact);
    const flags: ISubmissionFlags = evaluateFlags(record, answers);
    const title: string = `${workflowLabel(workflowType)} — ${intakeId}`;
    const submittedAt: string = this._clock().toISOString();
    const requestorName: string = String(contact.name || answers.name || this._context.user.displayName || 'Unknown');
    const requestorEmail: string = String(contact.email || answers.email || this._context.user.email || '');
    const payloadJson: string = JSON.stringify(payload);
    const site: string = siteRoot(this._context.siteUrl);
    const governance: boolean = isGovernanceWorkflow(workflowType);

    try {
      const intake: IListItem = await this._createListItem(INTAKES_LIST_TITLE, {
        Title: title,
        IntakeId: intakeId,
        WorkflowType: workflowType,
        PilotWorkflowVersion: String(record.workflowVersion || '2.1'),
        Status: 'Submitted - Pilot',
        Priority: flags.requiresReview ? 'High' : 'Normal',
        RequestorName: requestorName,
        RequestorEmail: requestorEmail,
        SubmittedAt: submittedAt,
        CompanyDataOrWorkflow: flags.companyDataOrWorkflow,
        SensitiveOrRegulated: flags.sensitiveOrRegulated,
        HumanReview: String(answers.humanReview || 'Not specified'),
        ToolName: String(answers.toolName || answers.aiToolName || record.workflowOrService || ''),
        RoutingOutcome: String(record.outcome || (flags.requiresReview ? 'AI CoE governance review' : 'AI CoE service queue')),
        PayloadJson: payloadJson.length > PAYLOAD_LIMIT ? `${payloadJson.slice(0, PAYLOAD_KEEP)}...[truncated]` : payloadJson,
        PilotOnly: !governance
      });

      let governanceItemId: number | undefined;
      let governanceItemUrl: string | undefined;
      if (governance) {
        const useCase: IListItem = await this._createListItem(USE_CASES_LIST_TITLE, {
          Title: title,
          CoEID: intakeId,
          SubmitterEmail: requestorEmail,
          BusinessProblem: this._businessProblem(workflowType, record, answers),
          BusinessOwnerEmail: requestorEmail,
          DataSensitivity: flags.dataSensitivity,
          ExternalUsers: flags.externalUsers,
          AutonomousActions: flags.autonomousActions,
          EstimatedMonthlyCost: this._estimatedMonthlyCost(answers),
          Status: 'Submitted',
          IntakeProcessed: false,
          TriageComplete: false,
          ApprovalRequested: false,
          LastStatusChanged: submittedAt,
          PilotMeasure: this._pilotMeasure(record, answers)
        });
        governanceItemId = itemId(useCase);
        governanceItemUrl = governanceItemId ? `${site}/Lists/AI%20CoE%20Use%20Cases/DispForm.aspx?ID=${governanceItemId}` : undefined;
      }

      const intakeItemId: number | undefined = itemId(intake);
      return {
        connected: true,
        intakeId,
        itemId: intakeItemId,
        itemUrl: intakeItemId ? `${site}/Lists/AICoEPilotIntakes/DispForm.aspx?ID=${intakeItemId}` : undefined,
        governanceItemId,
        governanceItemUrl,
        message: governance
          ? 'Submission received and queued for AI CoE intake and triage.'
          : 'Submission received and added to the AI CoE service queue.'
      };
    } catch (error) {
      // The console gets the status and the class only; the shipped message keeps the body for the legacy panel.
      console.error('AI CoE submission failed', failureLogDetail(error));
      const failureClass: FailureClass = classifyError(error);
      return {
        connected: false,
        intakeId,
        message: `SharePoint could not create the AI CoE record. ${errorMessage(error)}`,
        failureClass,
        userMessage: failureUserMessage(failureClass)
      };
    }
  }

  public async getAdminDashboardData(): Promise<IAdminDashboardData> {
    try {
      const [intakes, useCases, decisions] = await Promise.all([
        this._getListItems(
          INTAKES_LIST_TITLE,
          'Id,Title,IntakeId,WorkflowType,PilotWorkflowVersion,Status,Priority,RequestorName,RequestorEmail,SubmittedAt,CompanyDataOrWorkflow,SensitiveOrRegulated,HumanReview,ToolName,RoutingOutcome,PayloadJson,PilotOnly,Created,Modified',
          'SubmittedAt desc',
          200
        ),
        this._getListItems(
          USE_CASES_LIST_TITLE,
          'Id,Title,CoEID,SubmitterEmail,BusinessProblem,BusinessOwnerEmail,DataSensitivity,ExternalUsers,AutonomousActions,EstimatedMonthlyCost,Status,RiskTier,ApproverEmail,ApprovalRequested,ApprovalOutcome,ApprovalComments,IntakeProcessed,TriageComplete,NextReviewDate,LastStatusChanged,PilotMeasure,Created,Modified',
          'Created desc',
          200
        ),
        this._getListItems(DECISIONS_LIST_TITLE, 'Id,Title,UseCaseID,Decision,ApproverEmail,DecisionDate,Comments,Created,Modified', 'DecisionDate desc', 100)
      ]);
      return { connected: true, intakes, useCases, decisions, message: 'SharePoint governance data refreshed.' };
    } catch (error) {
      console.error('AI CoE dashboard refresh failed', failureLogDetail(error));
      const failureClass: FailureClass = classifyError(error);
      return {
        connected: false,
        intakes: [],
        useCases: [],
        decisions: [],
        message: `The dashboard could not load SharePoint data. ${errorMessage(error)}`,
        failureClass,
        userMessage: failureUserMessage(failureClass)
      };
    }
  }

  private async _createListItem(listTitle: string, fields: IListItem): Promise<IListItem> {
    const response: IListResponse = await this._context.client.post(listItemsUrl(this._context.siteUrl, listTitle), this._context.configuration, {
      headers: WRITE_HEADERS,
      body: JSON.stringify(fields)
    });
    if (!response.ok) {
      throw await failureError(listTitle, response);
    }
    return (await response.json()) as IListItem;
  }

  private async _getListItems(listTitle: string, select: string, orderBy: string, top: number): Promise<IListItem[]> {
    const url: string = `${listItemsUrl(this._context.siteUrl, listTitle)}?$select=${select}&$orderby=${encodeURIComponent(orderBy)}&$top=${top}`;
    const response: IListResponse = await this._context.client.get(url, this._context.configuration, { headers: ACCEPT_HEADER });
    if (!response.ok) {
      throw await failureError(listTitle, response);
    }
    const data: { value?: unknown } = (await response.json()) as { value?: unknown };
    return Array.isArray(data.value) ? (data.value as IListItem[]) : [];
  }

  private _businessProblem(workflowType: SubmissionWorkflowType, record: IRecord, answers: IRecord): string {
    const summary: IRecord = asRecord(record.confirmedSummary);
    const candidates: string[] = [
      summary.problemToSolve,
      summary.purpose,
      answers.painPoints,
      answers.workToImprove,
      answers.helpWith,
      answers.toolPurpose,
      answers.specificTaskDetail,
      answers.aiProjectDetail,
      answers.chooseToolGoal,
      record.outcome
    ]
      .map(text)
      .filter((candidate: string): boolean => candidate !== '');
    return candidates.length > 0 ? candidates[0].slice(0, TEXT_LIMIT) : `${workflowLabel(workflowType)} submitted through the AI CoE Front Door.`;
  }

  private _pilotMeasure(record: IRecord, answers: IRecord): string {
    const summary: IRecord = asRecord(record.confirmedSummary);
    return [summary.desiredOutcome, summary.possibleMeasuresOfSuccess, answers.desiredOutcome, answers.successMeasure, answers.benefitObserved]
      .map(text)
      .filter((candidate: string): boolean => candidate !== '')
      .join('\n\n')
      .slice(0, TEXT_LIMIT);
  }

  private _estimatedMonthlyCost(answers: IRecord): number {
    const raw: unknown = answers.estimatedMonthlyCost;
    const value: number = typeof raw === 'number' ? raw : Number.parseFloat(String(raw || '0'));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
}

function itemId(item: IListItem): number | undefined {
  const value: unknown = item.Id !== undefined ? item.Id : item.ID;
  return typeof value === 'number' ? value : undefined;
}

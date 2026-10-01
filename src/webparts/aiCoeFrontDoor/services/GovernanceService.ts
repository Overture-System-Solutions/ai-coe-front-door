import { OUTCOME_WORKFLOW_VERSION, outcomeRecordFields } from '../content/workflows/outcome';
import type { IOutcomeRecordFields } from '../content/workflows/outcome';
import { includes } from '../utils/collections';
import { executiveReviewBy, readReviewPriority } from './executivePriority';
import type { SubmissionWorkflowType } from '../workflows/types';
import { classifyError, failureLogDetail, failureUserMessage, statusError } from './failureClass';
import type { FailureClass } from './failureClass';
import { evaluateFlags } from './flags';
import type { IRecord, ISubmissionFlags } from './flags';
import { createIntakeId } from './intakeId';
import type { IAdminDashboardData, IGovernanceService, IListItem, IListResponse, IServiceContext, ISubmissionResult, ISubmitOptions } from './types';

export const INTAKES_LIST_TITLE: string = 'AI CoE Pilot Intakes';
export const USE_CASES_LIST_TITLE: string = 'AI CoE Use Cases';
export const DECISIONS_LIST_TITLE: string = 'AI CoE Decisions';
/** The content-free outcome record (1.0.0.15); created by the operator script, never by the package feature. */
export const OUTCOME_RECORDS_LIST_TITLE: string = 'AI CoE Outcome Records';

/** What the readback of an intake row asks for: enough to match the identifier and date the receipt. */
const READBACK_SELECT: string = 'Id,IntakeId,Modified';
/** The same for an outcome row, whose key is its own. */
const OUTCOME_READBACK_SELECT: string = 'Id,OutcomeId,Modified';
/** The key column of each list the service writes, used for the readback and for a retry's pre-read. */
const INTAKE_KEY: string = 'IntakeId';
const OUTCOME_KEY: string = 'OutcomeId';
/** The title an outcome row carries, with its key; the row says nothing else about the task. */
const OUTCOME_TITLE: string = 'Task outcome';
const OUTCOME_SAVED_MESSAGE: string = 'Outcome recorded. No prompt or output text was saved.';

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

  /**
   * Writes the submission and reads the intake row back before reporting it saved. With
   * `options.intakeId` (a retry of an earlier attempt) the rows that attempt may have left are looked
   * up first and only the missing ones are written, so nothing is duplicated; a first attempt never
   * pre-reads, so the shipped request sequence gains only the readback. The POST bodies are unchanged.
   */
  public async submitWorkflow(workflowType: SubmissionWorkflowType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    const retryId: string | undefined = options !== undefined && typeof options.intakeId === 'string' && options.intakeId.trim() ? options.intakeId : undefined;
    const intakeId: string = retryId === undefined ? this._createIntakeId() : retryId;
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
    const version: string = String(record.workflowVersion || '2.1');
    // A leader's business case is reviewed sooner: the request takes the High priority and the governance record a
    // review date. Both are existing fields; nothing is added to an ordinary submission (see executivePriority.ts).
    const executive: boolean = governance && readReviewPriority(record) !== undefined;

    try {
      // A retry looks for the row first; finding it is itself a native readback of that row.
      const existing: IListItem | undefined = retryId === undefined ? undefined : await this._findByField(INTAKES_LIST_TITLE, 'IntakeId', intakeId);
      const intake: IListItem =
        existing !== undefined
          ? existing
          : await this._createListItem(INTAKES_LIST_TITLE, {
              Title: title,
              IntakeId: intakeId,
              WorkflowType: workflowType,
              PilotWorkflowVersion: version,
              Status: 'Submitted - Pilot',
              Priority: executive || flags.requiresReview ? 'High' : 'Normal',
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
        const existingUseCase: IListItem | undefined = retryId === undefined ? undefined : await this._findByField(USE_CASES_LIST_TITLE, 'CoEID', intakeId);
        const useCase: IListItem =
          existingUseCase !== undefined
            ? existingUseCase
            : await this._createListItem(USE_CASES_LIST_TITLE, {
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
                PilotMeasure: this._pilotMeasure(record, answers),
                ...(executive ? { NextReviewDate: executiveReviewBy(submittedAt) } : {})
              });
        governanceItemId = itemId(useCase);
        governanceItemUrl = governanceItemId ? `${site}/Lists/AI%20CoE%20Use%20Cases/DispForm.aspx?ID=${governanceItemId}` : undefined;
      }

      // Native readback: the row is read again before the page may say it was saved (a found row was just read).
      let intakeItemId: number | undefined = itemId(intake);
      const confirmed: IListItem | undefined =
        existing !== undefined ? existing : await this._readBack(INTAKES_LIST_TITLE, INTAKE_KEY, READBACK_SELECT, intakeItemId, intakeId);
      if (confirmed !== undefined && intakeItemId === undefined) {
        intakeItemId = itemId(confirmed);
      }
      const itemUrl: string | undefined = intakeItemId ? `${site}/Lists/AICoEPilotIntakes/DispForm.aspx?ID=${intakeItemId}` : undefined;
      if (confirmed === undefined) {
        return {
          connected: false,
          state: 'pending',
          intakeId,
          itemId: intakeItemId,
          itemUrl,
          governanceItemId,
          governanceItemUrl,
          version,
          message: `SharePoint accepted the AI CoE record ${intakeId} but did not confirm it back.`,
          failureClass: 'INCONCLUSIVE',
          userMessage: failureUserMessage('INCONCLUSIVE')
        };
      }
      return {
        connected: true,
        state: 'saved',
        intakeId,
        itemId: intakeItemId,
        itemUrl,
        governanceItemId,
        governanceItemUrl,
        savedAt: typeof confirmed.Modified === 'string' && confirmed.Modified ? confirmed.Modified : submittedAt,
        version,
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
        state: 'failed',
        intakeId,
        message: `SharePoint could not create the AI CoE record. ${errorMessage(error)}`,
        failureClass,
        userMessage: failureUserMessage(failureClass)
      };
    }
  }

  /**
   * Writes one outcome record: the five choices the piece offers, the key, the moment and the version of
   * the questions, and nothing else. No display name and no address is written, because the record is
   * meant to be content-free; SharePoint's own Created By still names the submitter, which is why the
   * script keeps the list under item-level security and takes that column off its default view
   * (decision 16). The row is read back before the receipt, and a retry under the same key finds the row
   * instead of writing a second one.
   */
  public async submitOutcome(payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    const retryId: string | undefined = options !== undefined && typeof options.intakeId === 'string' && options.intakeId.trim() ? options.intakeId : undefined;
    const outcomeId: string = retryId === undefined ? this._createIntakeId() : retryId;
    const recordedAt: string = this._clock().toISOString();
    const fields: IOutcomeRecordFields = outcomeRecordFields(asRecord(payload));

    try {
      const existing: IListItem | undefined = retryId === undefined ? undefined : await this._findByField(OUTCOME_RECORDS_LIST_TITLE, OUTCOME_KEY, outcomeId);
      const row: IListItem =
        existing !== undefined
          ? existing
          : await this._createListItem(OUTCOME_RECORDS_LIST_TITLE, {
              Title: `${OUTCOME_TITLE} — ${outcomeId}`,
              OutcomeId: outcomeId,
              RecordedAt: recordedAt,
              TaskType: fields.TaskType,
              Outcome: fields.Outcome,
              ReviewState: fields.ReviewState,
              CorrectionCategory: fields.CorrectionCategory,
              RouteAvailability: fields.RouteAvailability,
              WorkflowVersion: OUTCOME_WORKFLOW_VERSION
            });

      let rowId: number | undefined = itemId(row);
      const confirmed: IListItem | undefined =
        existing !== undefined ? existing : await this._readBack(OUTCOME_RECORDS_LIST_TITLE, OUTCOME_KEY, OUTCOME_READBACK_SELECT, rowId, outcomeId);
      if (confirmed !== undefined && rowId === undefined) {
        rowId = itemId(confirmed);
      }
      if (confirmed === undefined) {
        return {
          connected: false,
          state: 'pending',
          intakeId: outcomeId,
          itemId: rowId,
          version: OUTCOME_WORKFLOW_VERSION,
          message: `SharePoint accepted the AI CoE record ${outcomeId} but did not confirm it back.`,
          failureClass: 'INCONCLUSIVE',
          userMessage: failureUserMessage('INCONCLUSIVE')
        };
      }
      return {
        connected: true,
        state: 'saved',
        intakeId: outcomeId,
        itemId: rowId,
        savedAt: typeof confirmed.Modified === 'string' && confirmed.Modified ? confirmed.Modified : recordedAt,
        version: OUTCOME_WORKFLOW_VERSION,
        message: OUTCOME_SAVED_MESSAGE
      };
    } catch (error) {
      console.error('AI CoE submission failed', failureLogDetail(error));
      const failureClass: FailureClass = classifyError(error);
      return {
        connected: false,
        state: 'failed',
        intakeId: outcomeId,
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

  /** The one row whose `field` equals `value` (`Id`, the field and `Modified`), or undefined; a refused read throws. */
  private async _findByField(listTitle: string, field: string, value: string): Promise<IListItem | undefined> {
    const filter: string = encodeURIComponent(`${field} eq '${value.replace(/'/g, "''")}'`);
    const url: string = `${listItemsUrl(this._context.siteUrl, listTitle)}?$select=Id,${field},Modified&$filter=${filter}&$top=1`;
    const response: IListResponse = await this._context.client.get(url, this._context.configuration, { headers: ACCEPT_HEADER });
    if (!response.ok) {
      throw await failureError(listTitle, response);
    }
    const data: { value?: unknown } = (await response.json()) as { value?: unknown };
    return Array.isArray(data.value) && data.value.length > 0 ? (data.value[0] as IListItem) : undefined;
  }

  /** One row by id, projected to `select`; a refused or missing row throws. */
  private async _getItem(listTitle: string, id: number, select: string): Promise<IListItem> {
    const url: string = `${listItemsUrl(this._context.siteUrl, listTitle)}(${id})?$select=${select}`;
    const response: IListResponse = await this._context.client.get(url, this._context.configuration, { headers: ACCEPT_HEADER });
    if (!response.ok) {
      throw await failureError(listTitle, response);
    }
    return (await response.json()) as IListItem;
  }

  /**
   * Reads the row back by id (by key when the POST answer carried none) and returns it when it carries
   * the key that was written; anything else is inconclusive and yields undefined (the console gets the
   * status or the mismatch, never a body). The intake row and the outcome row are read the same way,
   * each through its own list, key column and projection.
   */
  private async _readBack(listTitle: string, key: string, select: string, id: number | undefined, value: string): Promise<IListItem | undefined> {
    try {
      const item: IListItem | undefined = id === undefined ? await this._findByField(listTitle, key, value) : await this._getItem(listTitle, id, select);
      if (item !== undefined && item[key] === value) {
        return item;
      }
      console.error('AI CoE submission not confirmed', `${listTitle} readback mismatch (INCONCLUSIVE)`);
      return undefined;
    } catch (error) {
      console.error('AI CoE submission not confirmed', failureLogDetail(error));
      return undefined;
    }
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

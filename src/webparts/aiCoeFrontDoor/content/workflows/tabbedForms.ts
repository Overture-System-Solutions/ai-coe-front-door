/**
 * The tabbed view's shorter forms (1.0.0.18). AI idea, Check a tool or task and Register team AI use are asked in five
 * screens at most, each grouping up to three closely related questions; a follow-up still shows only after the answer
 * that calls for it. The questions are the full forms' own - same wording, same options, same answer keys - so the
 * summaries, the request records and the idea-draft flow receive exactly what they did. The classic and single-page
 * views keep the full forms.
 *
 * The tool check picks its tool from the approved-tools register rather than asking whether the person believes it
 * is approved; the register then answers that (see services/registerToolPolicy.ts).
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { IApprovedTool } from '../../services/approvedToolsService';
import { deriveToolAnswers, TOOL_PICK_NOT_LISTED, TOOL_PICK_UNSURE } from '../../services/registerToolPolicy';
import type { IAnswers, IChoiceStep, IFieldStep, IGroupStep, IStep, IWorkflowCatalog, IWorkflowDefinition } from '../../workflows/types';

export { TOOL_PICK_NOT_LISTED, TOOL_PICK_UNSURE };

/** A question of the full form, by its answer key; a definition that lost one fails here rather than on a site. */
function question(definition: IWorkflowDefinition, id: string): IFieldStep {
  const found: IStep | undefined = definition.steps.filter((step: IStep): boolean => step.id === id)[0];
  if (found === undefined || found.type === 'group') {
    throw new Error(`The ${definition.id} form has no question "${id}" to group.`);
  }
  return found;
}

function screen(definition: IWorkflowDefinition, id: string, title: string, fields: (string | IFieldStep)[]): IGroupStep {
  return {
    id,
    type: 'group',
    title,
    fields: fields.map((field: string | IFieldStep): IFieldStep => (typeof field === 'string' ? question(definition, field) : field))
  };
}

function shorter(definition: IWorkflowDefinition, steps: IGroupStep[], extra?: Partial<IWorkflowDefinition>): IWorkflowDefinition {
  return { ...definition, ...extra, steps };
}

function ideaForm(full: IWorkflowDefinition): IWorkflowDefinition {
  return shorter(full, [
    screen(full, 'theWork', 'The work', ['workToImprove', 'painPoints']),
    screen(full, 'whoAndHowOften', 'Who does it, how often, and for how long', ['peopleInvolved', 'frequency', 'timeSpent']),
    screen(full, 'systemsAndInformation', 'Systems and information', ['systemsInvolved', 'informationUsed', 'informationCategories', 'informationSensitiveNotice']),
    screen(full, 'aiAndGoal', 'AI today, and what good would look like', ['aiAlreadyUsed', 'aiToolName', 'desiredOutcome', 'successMeasure']),
    screen(full, 'timingAndMore', 'Timing, and anything else', ['hasDeadlineSponsor', 'deadlineSponsorDetail', 'anythingElse'])
  ]);
}

/** The tool picker: the register's tools by name, then "not on the list" and "not sure". */
function toolPick(tools: readonly IApprovedTool[]): IChoiceStep {
  const listed = tools
    .slice()
    .sort((a: IApprovedTool, b: IApprovedTool): number => a.name.localeCompare(b.name))
    .map((tool: IApprovedTool): { value: string; label: string } => ({ value: tool.id, label: tool.name }));
  return {
    id: 'toolPick',
    type: 'select',
    title: 'Which tool would you use?',
    help: "Pick it from the AI CoE's approved-tools list. If it isn't there, choose \"It's not on the list\".",
    required: true,
    options: listed.concat([
      { value: TOOL_PICK_NOT_LISTED, label: "It's not on the list" },
      { value: TOOL_PICK_UNSURE, label: "I'm not sure which tool yet" }
    ])
  };
}

function toolCheckForm(full: IWorkflowDefinition, tools: readonly IApprovedTool[]): IWorkflowDefinition {
  const name: IFieldStep = { ...question(full, 'toolName'), showIf: (answers: IAnswers): boolean => answers.toolPick === TOOL_PICK_NOT_LISTED };
  return shorter(
    full,
    [
      screen(full, 'taskAndTool', 'The task and the tool', ['helpWith', toolPick(tools), name]),
      screen(full, 'information', 'The information involved', ['companyDataOrWorkflow', 'sensitiveCategories', 'sensitiveNotice', 'informationType']),
      screen(full, 'filesAndSharing', 'Files and sharing', ['filesUploaded', 'fileTypeDetail', 'outputSharedExternally']),
      screen(full, 'decisionsAndActions', 'Decisions and actions', ['aiDecisionImportance', 'aiTakesAction', 'actionSystemDetail']),
      screen(full, 'reviewAndUse', 'Review, and how often', ['humanReview', 'usagePattern'])
    ],
    { approvedToolList: true, deriveAnswers: (answers: IAnswers): IAnswers => deriveToolAnswers(answers, tools) }
  );
}

function teamUsageForm(full: IWorkflowDefinition): IWorkflowDefinition {
  return shorter(full, [
    screen(full, 'toolAndTeam', 'The tool and the team', ['toolName', 'usageScope', 'departmentOrWork']),
    screen(full, 'purposeAndUse', 'What it is for and how it is used', ['toolPurpose', 'frequency', 'sourceType']),
    screen(full, 'information', 'The information involved', ['informationEntered', 'companyDataOrWorkflow', 'sensitiveCategories', 'sensitiveNotice']),
    screen(full, 'filesActionsReview', 'Files, actions and review', ['filesUploaded', 'fileTypeDetail', 'aiTakesAction', 'actionNotice', 'actionSystemDetail', 'humanReview']),
    screen(full, 'experience', 'How it is going', ['benefitObserved', 'concernsExperienced', 'followUpPreference'])
  ]);
}

/** The catalog of the tabbed view: the three shorter forms, the rest as they are. */
export function createTabbedCatalog(full: IWorkflowCatalog, tools: readonly IApprovedTool[]): IWorkflowCatalog {
  return { ...full, idea: ideaForm(full.idea), toolCheck: toolCheckForm(full.toolCheck, tools), teamUsage: teamUsageForm(full.teamUsage) };
}

import type { IBranding } from '../../branding/branding';
import { CircleQuestionMark } from '../../icons';
import type { IWorkflowDefinition } from '../../workflows/types';
import { companyInformationHelp, externalSharingQuestion, SENSITIVE_INFO_NOTICE } from './copy';
import { answerIncludesAny, answerIs } from './predicates';

const YES_NO_UNSURE: { value: string; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unsure', label: 'Not sure' }
];

export function createToolCheckWorkflow(branding: IBranding): IWorkflowDefinition {
  return {
    id: 'toolCheck',
    title: 'I want to know if an AI tool or task is okay',
    homeDescription: 'Ask about a tool or task before you use it.',
    icon: CircleQuestionMark,
    workflowVersion: '2.1',
    steps: [
      {
        id: 'helpWith',
        type: 'textarea',
        title: 'What would you like AI to help with?',
        help: 'Describe the task in your own words.',
        placeholder: 'Example: Drafting first responses to routine client questions.',
        required: true,
        showSafetyNotice: true
      },
      {
        id: 'toolKnown',
        type: 'select',
        title: 'Do you know which AI product or tool this is?',
        required: true,
        options: [
          { value: 'yes', label: 'Yes, I know the tool' },
          { value: 'no', label: 'No, not yet' }
        ]
      },
      {
        id: 'toolName',
        type: 'text',
        title: 'What is the name of the tool?',
        placeholder: 'Tool name',
        required: true,
        showIf: answerIs('toolKnown', 'yes')
      },
      {
        id: 'toolApprovalStatus',
        type: 'select',
        title: 'As far as you know, is this tool already approved, not approved, or unknown to you?',
        help: 'This is based on what you know today. There is no wrong answer.',
        required: true,
        options: [
          { value: 'approved', label: "I believe it's already approved" },
          { value: 'notApproved', label: "I don't think it's approved yet" },
          { value: 'unknown', label: "I don't know" }
        ]
      },
      {
        id: 'informationType',
        type: 'textarea',
        title: 'What type of information would be entered?',
        help: "Describe it in general terms only, like 'meeting notes' or 'project timelines.' Please don't include the actual information itself.",
        placeholder: 'Example: Project timelines and general status notes.',
        required: false,
        showSafetyNotice: true
      },
      {
        id: 'companyDataOrWorkflow',
        type: 'select',
        title: 'Would this use, upload, connect to, or describe company information — or become part of an ongoing work process?',
        help: companyInformationHelp(branding),
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'I am not sure' }
        ]
      },
      {
        id: 'sensitiveCategories',
        type: 'multiselect',
        title: 'Would any of these be involved: patient, employee, customer, confidential, or regulated information?',
        help: 'Pick all that apply.',
        required: true,
        options: [
          { value: 'patient', label: 'Patient information' },
          { value: 'employee', label: 'Employee information' },
          { value: 'customer', label: 'Customer information' },
          { value: 'otherConfidential', label: 'Other confidential information' },
          { value: 'regulated', label: 'Regulated information, like financial or legal records' },
          { value: 'none', label: 'None of these', exclusive: true },
          { value: 'unsure', label: 'I am not sure', exclusive: true }
        ]
      },
      {
        id: 'sensitiveNotice',
        type: 'notice',
        title: 'Thanks for letting us know',
        body: SENSITIVE_INFO_NOTICE,
        showIf: answerIncludesAny('sensitiveCategories', ['patient', 'employee', 'customer', 'otherConfidential', 'regulated', 'unsure'])
      },
      {
        id: 'filesUploaded',
        type: 'select',
        title: 'Would you upload any files?',
        required: true,
        options: YES_NO_UNSURE
      },
      {
        id: 'fileTypeDetail',
        type: 'text',
        title: 'What kind of files would you upload?',
        help: 'This is optional. Describe the file type, not its contents.',
        placeholder: 'Example: spreadsheets, PDFs, or slide decks',
        required: false,
        showIf: answerIs('filesUploaded', 'yes')
      },
      {
        id: 'outputSharedExternally',
        type: 'select',
        title: externalSharingQuestion(branding),
        required: true,
        options: YES_NO_UNSURE
      },
      {
        id: 'aiDecisionImportance',
        type: 'select',
        title: 'Would AI recommend or make an important decision?',
        help: "Think about decisions that affect a person's care, job, money, or rights.",
        required: true,
        options: YES_NO_UNSURE
      },
      {
        id: 'aiTakesAction',
        type: 'select',
        title: 'Would AI take an action in another system, like sending something or updating a record?',
        required: true,
        options: YES_NO_UNSURE
      },
      {
        id: 'actionSystemDetail',
        type: 'text',
        title: 'What system or systems would it act in?',
        placeholder: 'Example: the scheduling system',
        required: false,
        showIf: answerIs('aiTakesAction', 'yes')
      },
      {
        id: 'humanReview',
        type: 'select',
        title: "Would a person review the output before it's used?",
        required: true,
        options: [
          { value: 'always', label: 'Yes, every time' },
          { value: 'sometimes', label: 'Sometimes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'usagePattern',
        type: 'select',
        title: "Is this something you'd try once, use occasionally, or use as part of an ongoing process?",
        required: true,
        options: [
          { value: 'experimental', label: 'Just experimenting' },
          { value: 'occasional', label: 'Occasional use' },
          { value: 'ongoing', label: 'Part of an ongoing process' },
          { value: 'unsure', label: 'Not sure' }
        ]
      }
    ]
  };
}

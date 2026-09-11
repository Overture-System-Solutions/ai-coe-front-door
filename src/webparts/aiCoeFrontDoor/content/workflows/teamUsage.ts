import type { IBranding } from '../../branding/branding';
import { Users } from '../../icons';
import type { IWorkflowDefinition } from '../../workflows/types';
import { companyInformationHelp, TEAM_USAGE_ACTION_NOTICE, TEAM_USAGE_SENSITIVE_NOTICE } from './copy';
import { answerIncludesAny, answerIs } from './predicates';

export function createTeamUsageWorkflow(branding: IBranding): IWorkflowDefinition {
  return {
    id: 'teamUsage',
    title: 'My team is already using an AI tool',
    homeDescription: 'Tell us about an AI tool your team already uses.',
    icon: Users,
    workflowVersion: '2.1',
    steps: [
      {
        id: 'toolName',
        type: 'text',
        title: 'What AI tool or product is your team using?',
        required: true,
        placeholder: 'Tool name'
      },
      {
        id: 'usageScope',
        type: 'select',
        title: 'Is it used by one person, a small team, or a larger group?',
        required: true,
        options: [
          { value: 'onePerson', label: 'Just one person' },
          { value: 'smallTeam', label: 'A small team' },
          { value: 'largerGroup', label: 'A larger group or department' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'departmentOrWork',
        type: 'text',
        title: 'What department or type of work is this for?',
        placeholder: 'Example: Client billing, or care coordination',
        required: true
      },
      {
        id: 'toolPurpose',
        type: 'textarea',
        title: 'What does the tool help accomplish?',
        placeholder: 'Example: Drafting first responses to routine questions.',
        required: true,
        showSafetyNotice: true
      },
      {
        id: 'frequency',
        type: 'select',
        title: 'How often is it used?',
        required: true,
        options: [
          { value: 'daily', label: 'Every day' },
          { value: 'weekly', label: 'A few times a week' },
          { value: 'monthly', label: 'A few times a month' },
          { value: 'rarely', label: 'Rarely' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'sourceType',
        type: 'select',
        title: 'Is it free to use, personally purchased, provided by the department, or provided by the company?',
        help: "There's no wrong answer — this just helps us understand how it's being accessed today.",
        required: true,
        options: [
          { value: 'free', label: 'Free to use' },
          { value: 'personal', label: 'Personally purchased' },
          { value: 'department', label: 'Provided by the department' },
          { value: 'company', label: 'Provided by the company' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'informationEntered',
        type: 'textarea',
        title: 'What kinds of information are entered into it?',
        help: "Describe it in general terms only, like 'meeting notes' or 'scheduling details.' Please don't include the actual information itself.",
        placeholder: 'Example: General project notes and scheduling details.',
        required: false,
        showSafetyNotice: true
      },
      {
        id: 'companyDataOrWorkflow',
        type: 'select',
        title: 'Does this use, upload, connect to, or describe company information — or operate as part of an ongoing work process?',
        help: companyInformationHelp(branding),
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'I am not sure' }
        ]
      },
      {
        id: 'filesUploaded',
        type: 'select',
        title: 'Are any files uploaded to it?',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'fileTypeDetail',
        type: 'text',
        title: 'What kind of files?',
        help: 'This is optional. Describe the file type, not its contents.',
        placeholder: 'Example: spreadsheets or slide decks',
        required: false,
        showIf: answerIs('filesUploaded', 'yes')
      },
      {
        id: 'sensitiveCategories',
        type: 'multiselect',
        title: 'Might any of these be involved: patient, employee, customer, or confidential information?',
        help: "Pick all that apply. There's no wrong answer — this just helps us know where to focus support.",
        required: true,
        options: [
          { value: 'patient', label: 'Patient information' },
          { value: 'employee', label: 'Employee information' },
          { value: 'customer', label: 'Customer information' },
          { value: 'otherConfidential', label: 'Other confidential information' },
          { value: 'none', label: 'None of these', exclusive: true },
          { value: 'unsure', label: 'I am not sure', exclusive: true }
        ]
      },
      {
        id: 'sensitiveNotice',
        type: 'notice',
        title: 'Thanks for letting us know',
        body: TEAM_USAGE_SENSITIVE_NOTICE,
        showIf: answerIncludesAny('sensitiveCategories', ['patient', 'employee', 'customer', 'otherConfidential', 'unsure'])
      },
      {
        id: 'benefitObserved',
        type: 'textarea',
        title: 'What benefit have you noticed from using it?',
        placeholder: 'Example: It saves time on first drafts.',
        required: true,
        showSafetyNotice: true
      },
      {
        id: 'concernsExperienced',
        type: 'textarea',
        title: 'What problems, limitations, or concerns have you experienced, if any?',
        help: "This is optional. It's okay if nothing comes to mind.",
        placeholder: 'Example: It sometimes gets facts wrong, so I double-check important details.',
        required: false,
        showSafetyNotice: true
      },
      {
        id: 'humanReview',
        type: 'select',
        title: "Is the output reviewed by a person before it's used?",
        required: true,
        options: [
          { value: 'always', label: 'Yes, every time' },
          { value: 'sometimes', label: 'Sometimes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'aiTakesAction',
        type: 'select',
        title: 'Can the tool take actions in another system, like sending something or updating a record?',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'actionNotice',
        type: 'notice',
        title: 'Thanks for letting us know',
        body: TEAM_USAGE_ACTION_NOTICE,
        showIf: answerIs('aiTakesAction', 'yes')
      },
      {
        id: 'actionSystemDetail',
        type: 'text',
        title: 'What system or systems can it act in?',
        placeholder: 'Example: the scheduling system',
        required: false,
        showIf: answerIs('aiTakesAction', 'yes')
      },
      {
        id: 'followUpPreference',
        type: 'select',
        title: 'Would you like guidance, training, an approved alternative, or no immediate follow-up?',
        help: 'Pick whichever fits best.',
        required: true,
        options: [
          { value: 'guidance', label: 'Guidance on using it well' },
          { value: 'training', label: 'Training on this tool' },
          { value: 'alternative', label: 'An approved alternative tool' },
          { value: 'none', label: 'No immediate follow-up — I just wanted to share this' }
        ]
      }
    ]
  };
}

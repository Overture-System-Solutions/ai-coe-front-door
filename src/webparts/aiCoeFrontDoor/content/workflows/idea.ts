import { Lightbulb } from '../../icons';
import type { IWorkflowDefinition } from '../../workflows/types';
import { SENSITIVE_INFO_NOTICE } from './copy';
import { answerIncludesAny, answerIs } from './predicates';

export function createIdeaWorkflow(): IWorkflowDefinition {
  return {
    id: 'idea',
    title: 'I have an idea for using AI',
    homeDescription: 'Share an idea for using AI to help with your work.',
    icon: Lightbulb,
    resultIntro: 'Thanks for sharing your idea.',
    whatHappensNext:
      'Your idea will enter the AI CoE intake and triage process. You will receive the submission identifier shown after confirmation.',
    workflowVersion: '2.1',
    steps: [
      {
        id: 'workToImprove',
        type: 'textarea',
        title: 'What work would you like to improve?',
        help: 'Describe the task or process in your own words.',
        placeholder: 'Example: Reviewing incoming referral forms for missing information.',
        required: true,
        showSafetyNotice: true
      },
      {
        id: 'painPoints',
        type: 'textarea',
        title: 'What makes this work slow, difficult, repetitive, or frustrating?',
        placeholder: "Example: Each form has to be checked by hand, and it's easy to miss something.",
        required: true,
        showSafetyNotice: true
      },
      {
        id: 'peopleInvolved',
        type: 'textarea',
        title: 'Who performs or is affected by the work?',
        help: "Describe roles or teams. Please avoid using individual people's names.",
        placeholder: 'Example: Intake coordinators complete this, and case managers wait on the result.',
        required: true,
        showSafetyNotice: true
      },
      {
        id: 'frequency',
        type: 'select',
        title: 'How often does it happen?',
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
        id: 'timeSpent',
        type: 'select',
        title: 'About how much time does it take today?',
        required: true,
        options: [
          { value: 'minutes', label: 'A few minutes' },
          { value: 'underHour', label: 'Less than an hour' },
          { value: 'hours', label: 'A few hours' },
          { value: 'mostOfDay', label: 'Most of a day' },
          { value: 'varies', label: 'It varies a lot' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'systemsInvolved',
        type: 'textarea',
        title: 'What systems or tools are involved?',
        help: 'This is optional. Name any systems, software, or tools you know of.',
        placeholder: 'Example: A scheduling system and a shared spreadsheet.',
        required: false,
        showSafetyNotice: true
      },
      {
        id: 'informationUsed',
        type: 'textarea',
        title: 'What information is used to do this work?',
        help: "Describe it in general terms only, like 'contact details' or 'appointment status.' Please don't include the actual information itself.",
        placeholder: 'Example: Contact details and appointment status.',
        required: false,
        showSafetyNotice: true
      },
      {
        id: 'informationCategories',
        type: 'multiselect',
        title: 'What kind of information might be involved?',
        help: 'Pick all that apply.',
        required: true,
        options: [
          { value: 'public', label: 'Public information' },
          { value: 'internal', label: 'Internal business information' },
          { value: 'employee', label: 'Employee information' },
          { value: 'customer', label: 'Customer information' },
          { value: 'patient', label: 'Patient information' },
          { value: 'otherConfidential', label: 'Other confidential information' },
          { value: 'unsure', label: 'I am not sure', exclusive: true }
        ]
      },
      {
        id: 'informationSensitiveNotice',
        type: 'notice',
        title: 'Thanks for letting us know',
        body: SENSITIVE_INFO_NOTICE,
        showIf: answerIncludesAny('informationCategories', ['employee', 'customer', 'patient', 'otherConfidential', 'unsure'])
      },
      {
        id: 'aiAlreadyUsed',
        type: 'select',
        title: 'Is anyone already using AI for this work?',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'aiToolName',
        type: 'text',
        title: 'What tool or tools are being used?',
        placeholder: 'Tool name',
        required: true,
        showIf: answerIs('aiAlreadyUsed', 'yes')
      },
      {
        id: 'desiredOutcome',
        type: 'textarea',
        title: 'What would a better result look like?',
        placeholder: 'Example: Forms get checked faster, with fewer mistakes.',
        required: true,
        showSafetyNotice: true
      },
      {
        id: 'successMeasure',
        type: 'textarea',
        title: 'How would the team know the idea worked?',
        help: 'This is optional. Skip it if you are not sure yet.',
        placeholder: 'Example: Fewer forms sent back for corrections.',
        required: false,
        showSafetyNotice: true
      },
      {
        id: 'hasDeadlineSponsor',
        type: 'select',
        title: 'Is there a deadline, sponsor, or current project connected to it?',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'Not sure' }
        ]
      },
      {
        id: 'deadlineSponsorDetail',
        type: 'textarea',
        title: 'Tell us more about the deadline, sponsor, or project.',
        placeholder: 'Share what you know.',
        required: true,
        showSafetyNotice: true,
        showIf: answerIs('hasDeadlineSponsor', 'yes')
      },
      {
        id: 'anythingElse',
        type: 'textarea',
        title: 'Is there anything else the CoE should understand?',
        help: 'This is optional.',
        placeholder: 'Share anything else that feels important.',
        required: false,
        showSafetyNotice: true
      }
    ]
  };
}

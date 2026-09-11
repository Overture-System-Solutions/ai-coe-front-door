import { MessageSquare } from '../../icons';
import type { IWorkflowDefinition } from '../../workflows/types';
import { answerIs } from './predicates';

export function createFeedbackWorkflow(): IWorkflowDefinition {
  return {
    id: 'feedback',
    title: 'I want to give the AI CoE feedback',
    homeDescription: 'Share your thoughts to help us do better.',
    icon: MessageSquare,
    workflowVersion: '2.0',
    steps: [
      {
        id: 'serviceInvolved',
        type: 'select',
        title: 'What did you contact or use the CoE for?',
        required: true,
        options: [
          { value: 'idea', label: 'Sharing an idea for using AI' },
          { value: 'toolCheck', label: 'Checking if a tool or task is okay' },
          { value: 'teamUsage', label: 'Letting the CoE know about a tool my team uses' },
          { value: 'helpTraining', label: 'Getting help or training' },
          { value: 'general', label: 'Something else, or general feedback' }
        ]
      },
      {
        id: 'gotClearNextStep',
        type: 'select',
        title: 'Did you get a clear next step?',
        required: true,
        options: [
          { value: 'clear', label: 'Yes, very clear' },
          { value: 'somewhat', label: 'Somewhat clear' },
          { value: 'notClear', label: 'No, not clear' },
          { value: 'notApplicable', label: 'Not applicable' }
        ]
      },
      {
        id: 'easeRating',
        type: 'select',
        title: 'How easy was the process?',
        required: true,
        options: [
          { value: 'veryEasy', label: 'Very easy' },
          { value: 'easy', label: 'Easy' },
          { value: 'okay', label: 'Okay' },
          { value: 'difficult', label: 'Difficult' },
          { value: 'veryDifficult', label: 'Very difficult' }
        ]
      },
      {
        id: 'positiveFeedback',
        type: 'textarea',
        title: 'What helped?',
        help: 'This is optional.',
        placeholder: 'Example: The questions were easy to follow.',
        required: false,
        showSafetyNotice: true
      },
      {
        id: 'frictionPoints',
        type: 'textarea',
        title: 'What was confusing or difficult, if anything?',
        help: 'This is optional.',
        placeholder: "Example: I wasn't sure which option to pick at first.",
        required: false,
        showSafetyNotice: true
      },
      {
        id: 'suggestedImprovement',
        type: 'textarea',
        title: 'What should the CoE improve?',
        help: 'This is optional.',
        placeholder: 'Example: More examples of what to type.',
        required: false,
        showSafetyNotice: true
      },
      {
        id: 'followUpPermission',
        type: 'select',
        title: 'May the CoE contact you about this feedback?',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' }
        ]
      },
      {
        id: 'contactName',
        type: 'text',
        title: "What's your name?",
        placeholder: 'Your name',
        required: true,
        showIf: answerIs('followUpPermission', 'yes')
      },
      {
        id: 'contactEmail',
        type: 'text',
        title: "What's your work email?",
        help: 'This is optional.',
        placeholder: 'name@example.com',
        required: false,
        showIf: answerIs('followUpPermission', 'yes')
      }
    ]
  };
}

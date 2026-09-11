import { GraduationCap } from '../../icons';
import type { IWorkflowDefinition } from '../../workflows/types';
import { answerIs } from './predicates';

export function createHelpTrainingWorkflow(): IWorkflowDefinition {
  return {
    id: 'helpTraining',
    title: 'I need help or training',
    homeDescription: 'Get help learning about AI, or find training.',
    icon: GraduationCap,
    resultIntro: 'Thanks for reaching out.',
    whatHappensNext:
      "There's no connected list of courses or sessions yet, so this can't point you to a specific one right now. Your request will be recorded in the AI CoE service queue for follow-up.",
    steps: [
      {
        id: 'helpCategory',
        type: 'select',
        title: 'What would you like help with?',
        required: true,
        options: [
          { value: 'new', label: 'I am new to AI' },
          { value: 'specificTask', label: 'I need help with a specific task' },
          { value: 'chooseTool', label: 'I need help choosing an approved tool' },
          { value: 'teamTraining', label: 'My team needs training' },
          { value: 'prompting', label: 'I need help with prompting' },
          { value: 'checkingOutput', label: 'I need help checking AI output' },
          { value: 'aiProject', label: 'I need help with an AI project' },
          { value: 'other', label: 'Something else' }
        ]
      },
      {
        id: 'newToAiFocus',
        type: 'textarea',
        title: "Is there anything specific you'd like to start with?",
        help: 'This is optional.',
        placeholder: "Example: Understanding what AI can and can't do.",
        required: false,
        showSafetyNotice: true,
        showIf: answerIs('helpCategory', 'new')
      },
      {
        id: 'specificTaskDetail',
        type: 'textarea',
        title: 'What task would you like help with?',
        required: true,
        showSafetyNotice: true,
        showIf: answerIs('helpCategory', 'specificTask')
      },
      {
        id: 'chooseToolGoal',
        type: 'textarea',
        title: 'What would you like to use AI for?',
        help: 'This helps the CoE point you toward the right kind of tool.',
        required: true,
        showSafetyNotice: true,
        showIf: answerIs('helpCategory', 'chooseTool')
      },
      {
        id: 'teamTrainingSize',
        type: 'select',
        title: 'About how many people would need training?',
        required: true,
        options: [
          { value: 'aFew', label: 'A few people' },
          { value: 'wholeTeam', label: 'A whole team or department' },
          { value: 'unsure', label: 'Not sure yet' }
        ],
        showIf: answerIs('helpCategory', 'teamTraining')
      },
      {
        id: 'teamTrainingTopics',
        type: 'textarea',
        title: 'What topics would be most useful?',
        help: 'This is optional.',
        placeholder: 'Example: The basics of what AI can do, or how to write good prompts.',
        required: false,
        showSafetyNotice: true,
        showIf: answerIs('helpCategory', 'teamTraining')
      },
      {
        id: 'promptingGoal',
        type: 'textarea',
        title: 'What are you trying to get AI to do?',
        required: true,
        showSafetyNotice: true,
        showIf: answerIs('helpCategory', 'prompting')
      },
      {
        id: 'checkingOutputDetail',
        type: 'textarea',
        title: "What kind of output are you checking, and what's making it hard to check?",
        required: true,
        showSafetyNotice: true,
        showIf: answerIs('helpCategory', 'checkingOutput')
      },
      {
        id: 'aiProjectDetail',
        type: 'textarea',
        title: 'Tell us about the project.',
        required: true,
        showSafetyNotice: true,
        showIf: answerIs('helpCategory', 'aiProject')
      },
      {
        id: 'aiProjectStage',
        type: 'select',
        title: 'What stage is it at?',
        required: true,
        options: [
          { value: 'starting', label: 'Just starting' },
          { value: 'inProgress', label: 'In progress' },
          { value: 'nearEnd', label: 'Near the end' },
          { value: 'unsure', label: 'Not sure' }
        ],
        showIf: answerIs('helpCategory', 'aiProject')
      },
      {
        id: 'somethingElseDetail',
        type: 'textarea',
        title: 'Tell us what you need help with.',
        required: true,
        showSafetyNotice: true,
        showIf: answerIs('helpCategory', 'other')
      },
      {
        id: 'name',
        type: 'text',
        title: 'What is your name?',
        required: true,
        placeholder: 'Your name'
      },
      {
        id: 'team',
        type: 'text',
        title: 'What team are you on?',
        required: true,
        placeholder: 'Your team or department'
      },
      {
        id: 'email',
        type: 'text',
        title: 'What is your work email?',
        help: 'This is optional. Add it if you would like a reply.',
        required: false,
        placeholder: 'name@example.com'
      }
    ]
  };
}

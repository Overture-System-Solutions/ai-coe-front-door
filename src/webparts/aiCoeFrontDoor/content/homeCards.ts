import { CircleCheck, CircleQuestionMark, GraduationCap, Lightbulb, MessageSquare, Users } from '../icons';
import type { LucideIcon } from '../icons';
import type { PieceWorkflowId, WorkflowId } from '../workflows/types';

export type CardTone = 'teal' | 'blue' | 'violet' | 'gold' | 'cyan';

export interface IHomeCard {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: CardTone;
}

/** The five path cards on the landing page, keyed by workflow. */
export const HOME_CARDS: { [id in WorkflowId]: IHomeCard } = {
  idea: { title: 'Explore an AI idea', description: 'Turn ideas into safe, valuable AI use.', icon: Lightbulb, tone: 'teal' },
  toolCheck: { title: 'Check a tool or task', description: 'Review tools and tasks for safe use.', icon: CircleQuestionMark, tone: 'blue' },
  teamUsage: { title: 'Register team AI use', description: 'Tell us how your team uses AI.', icon: Users, tone: 'violet' },
  helpTraining: { title: 'Get help or training', description: 'Find guidance, training, and expert support.', icon: GraduationCap, tone: 'gold' },
  feedback: { title: 'Share feedback', description: 'Help us improve the AI CoE experience.', icon: MessageSquare, tone: 'cyan' }
};

/**
 * The cards a home piece on its own page may show: the five above and the outcome record, which asks for a
 * task type and how it went and keeps no prompt or answer. Page views only; the legacy landing page keeps
 * the five (decision 16).
 */
export const PAGE_HOME_CARDS: { [id in PieceWorkflowId]: IHomeCard } = {
  idea: HOME_CARDS.idea,
  toolCheck: HOME_CARDS.toolCheck,
  teamUsage: HOME_CARDS.teamUsage,
  helpTraining: HOME_CARDS.helpTraining,
  feedback: HOME_CARDS.feedback,
  outcome: { title: 'Record a task outcome', description: 'Tell us how an AI task turned out.', icon: CircleCheck, tone: 'teal' }
};

import { CircleQuestionMark, GraduationCap, Lightbulb, MessageSquare, Users } from '../icons';
import type { LucideIcon } from '../icons';
import type { WorkflowId } from '../workflows/types';

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

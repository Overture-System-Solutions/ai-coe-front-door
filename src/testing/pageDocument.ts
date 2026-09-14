/**
 * A small page content document for tests: every block type, Contoso wording, site paths that
 * resolve against the test site. Test support only: never bundled into the web part.
 */
import type { IPageDocument } from '../webparts/aiCoeFrontDoor/content/pageContent';

export const SAMPLE_PAGE_DOCUMENT: IPageDocument = {
  version: 1,
  pages: {
    startHere: {
      title: 'Start here',
      blocks: [
        {
          type: 'hero',
          title: 'What do you need done?',
          text: 'Ask the AI CoE in [Teams](https://teams.microsoft.com/l/channel/contoso) or [start a request](SitePages/Requests.aspx).',
          cta: { label: 'Start a request', href: 'SitePages/Requests.aspx' }
        },
        { type: 'heading', level: 2, text: 'What do you want to do?' },
        {
          type: 'tiles',
          items: [
            { title: 'Ask the AI CoE', href: 'https://teams.microsoft.com/l/channel/contoso', description: 'Questions, ideas, worries.', icon: 'MessageSquare', tone: 'teal' },
            { title: 'Use AI for my work', href: 'SitePages/Use-AI.aspx', description: 'What is allowed and how to do it.', icon: 'BriefcaseBusiness', tone: 'teal' },
            { title: 'Start a request', href: 'SitePages/Requests.aspx', description: 'Ideas, tools, training, feedback.', icon: 'Inbox', tone: 'blue' },
            { title: 'Check status', href: 'SitePages/Status.aspx', description: 'What is running and what is not.', icon: 'LayoutDashboard', tone: 'gold' }
          ]
        },
        {
          type: 'cards',
          columns: 3,
          items: [
            { title: 'Summarise a thread', kicker: 'Prompt', body: ['**Do this**: paste the thread and ask for the three decisions.'], meta: 'Copilot Chat · 2 min', tone: 'teal' },
            { title: 'Draft a reply', kicker: 'Prompt', body: ['Paste the message.', 'Ask for a *short* reply in your voice.'], meta: 'Copilot Chat · 2 min', tone: 'violet' },
            { title: 'Prepare a meeting', kicker: 'Prompt', body: ['Paste the agenda and ask what to read first.'], meta: 'Copilot Chat · 5 min', tone: 'gold' }
          ]
        },
        {
          type: 'statusRow',
          items: [
            { label: 'Status', text: 'Green. Nothing is blocked.' },
            { label: 'Support', text: 'Ask in [Teams](https://teams.microsoft.com/l/channel/contoso).' }
          ]
        }
      ]
    },
    requests: {
      title: 'Requests',
      blocks: [
        { type: 'heading', level: 2, text: 'The three lanes' },
        {
          type: 'lanes',
          items: [
            { tone: 'green', title: 'Green: just do it', body: ['Public information and your own notes.'], note: 'No form needed.' },
            { tone: 'amber', title: 'Amber: ask first', body: ['Internal documents.', 'Ask the AI CoE before you start.'], badge: 'Ask' },
            { tone: 'red', title: 'Red: not yet', body: ['Personal data and contracts.'], note: 'The AI CoE will tell you when this changes.' }
          ]
        },
        { type: 'paragraph', text: 'If you would rather use a form, pick a path below.' },
        {
          type: 'piece',
          piece: 'home',
          pages: {
            idea: 'SitePages/Explore-an-AI-idea.aspx',
            toolCheck: 'SitePages/Check-a-tool-or-task.aspx',
            teamUsage: 'SitePages/Register-team-AI-use.aspx',
            helpTraining: 'SitePages/Get-help-or-training.aspx',
            feedback: 'SitePages/Share-feedback.aspx',
            telemetry: 'SitePages/Status.aspx',
            admin: 'SitePages/AI-CoE-admin-dashboard.aspx'
          }
        }
      ]
    },
    status: {
      title: 'Status',
      blocks: [
        { type: 'paragraph', text: 'Updated every Friday.' },
        {
          type: 'cards',
          columns: 2,
          items: [
            { title: 'What is running', body: ['**Copilot Chat** for everyone.'], tone: 'teal' },
            { title: 'What is not running', body: ['**Agents** are still in review.'], tone: 'cyan' }
          ]
        },
        { type: 'piece', piece: 'telemetry', pages: {} },
        {
          type: 'cards',
          columns: 2,
          items: [
            { title: 'Checking a request you sent', body: ['Reply to the confirmation mail.'], tone: 'teal' },
            { title: 'If something is wrong', body: ['Say so in [Teams](https://teams.microsoft.com/l/channel/contoso).'], tone: 'gold' }
          ]
        }
      ]
    }
  }
};

/**
 * The invented material the demonstration draws. Every value here is fiction.
 *
 * It is written to look like the real thing at a glance, because a demonstration that looks obviously fake teaches
 * nobody anything, and to be unmistakable on inspection, because material that reads as real is how a fixture ends
 * up quoted in a meeting. Every company, person, figure and source carries a marker, the reviewers are fictional
 * roles rather than anyone's name, and every screen that shows this carries the demonstration notice.
 *
 * The figures are deliberately the kind the copy policy refuses: they appear in the drafted copy without a citation
 * so the policy can be seen catching them. That is the demonstration, not an oversight.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { ICalendarEntry, IClaim } from './campaignBrief';
import type { MarketingWorkflowId } from './demoJourney';

/** Shown wherever demonstration material appears. */
export const DEMO_NOTICE: string = 'Demo — no live actions. Every name, figure and source on this screen is invented, nothing is sent, and nothing is saved outside this browser tab.';

export const DEMO_SHORT: string = 'Demo — no live actions';

/** The fictional reviewers. Roles, not people: decision 2 keeps every production identity unbound. */
export const DEMO_STRATEGY_REVIEWER: string = 'Fictional Marketing Owner (demo)';
export const DEMO_COPY_REVIEWER: string = 'Fictional Communications Owner (demo)';
export const DEMO_MEETING_OWNER: string = 'Fictional Meeting Owner (demo)';

export interface IDemoWorkflowCopy {
  title: string;
  /** What the workflow is for, in one line. */
  summary: string;
  /** What it takes in, as the playbook states it. */
  input: string;
  /** Who decides, as the playbook states it. */
  humanDecision: string;
  /** What counts as a pass, as the playbook states it. */
  pass: string;
  /** The button that begins it. */
  startLabel: string;
}

export const DEMO_WORKFLOWS: { [id in MarketingWorkflowId]: IDemoWorkflowCopy } = {
  campaignBrief: {
    title: 'Campaign brief',
    summary: 'Turn an approved objective and permitted sources into a brief someone can act on.',
    input: 'Approved objective, audience context and permitted current sources.',
    humanDecision: 'Marketing validates strategy and voice.',
    pass: 'Every factual claim cites a current source or is marked unknown; nothing is published.',
    startLabel: 'Draft a campaign brief'
  },
  contentPlan: {
    title: 'Content and internal PR plan',
    summary: 'Elaborate an accepted brief into assets, copy variants and a schedule.',
    input: 'Accepted campaign brief, current brand assets, channel owners and product truth.',
    humanDecision: 'Marketing and communications approve copy and channel.',
    pass: 'One destination, one call to action, accessible copy, no unsupported claim.',
    startLabel: 'Draft a content plan'
  },
  meetingFollowThrough: {
    title: 'Meeting follow-through',
    summary: 'Turn permitted meeting notes into proposed decisions and actions nobody has been assigned yet.',
    input: 'Permitted meeting notes or transcript, and the current campaign packet.',
    humanDecision: 'Meeting owner accepts decisions and actions; communications owner sends.',
    pass: 'No assignment, message, calendar event or campaign change without confirmation and a native readback.',
    startLabel: 'Draft follow-through'
  }
};

/** The objective the demonstration starts from, written as an already-approved input. */
export const DEMO_OBJECTIVE: string =
  'Help every team at Demo Corporation (fictional) understand what the AI Center of Excellence offers and how to ask for help.';

export const DEMO_AUDIENCE: string[] = [
  'Team leads at Demo Corporation (fictional) who have not asked the AI CoE for anything yet',
  'People who tried an AI tool once and stopped'
];

export const DEMO_PAIN_POINTS: string[] = [
  'Nobody is sure which tools are allowed, so they ask nobody and use nothing.',
  'The request path is not obvious, and the last person who asked has not heard back.',
  'Two teams built the same thing because neither knew about the other.'
];

/** The drafted message. The second claim carries no source on purpose, so the pass rule can be seen working. */
export const DEMO_MESSAGE: IClaim[] = [
  {
    text: 'The AI CoE reviews every request and tells you what is allowed before you start.',
    sources: [{ sourceId: 'FIXTURE-BRAND-001', versionOrETag: 'fixture-v1' }]
  },
  {
    text: 'Teams using the approved route report a 40% reduction in review time.',
    sources: [],
    unknown: 'AWAITING_SOURCE'
  },
  {
    text: 'Anything you send is read by a person, and you can see where it stands.',
    sources: [{ sourceId: 'FIXTURE-PRODUCT-002', versionOrETag: 'fixture-v1' }]
  }
];

export const DEMO_CHANNELS: string[] = ['Team lead briefing', 'Internal newsletter', 'Intranet landing page'];

export const DEMO_CALENDAR: ICalendarEntry[] = [
  { phase: 'Preparation', weekOffset: 0, item: 'Brief team leads and collect their questions' },
  { phase: 'Launch week', weekOffset: 1, item: 'Newsletter piece and intranet page go up' },
  { phase: 'Follow-up', weekOffset: 3, item: 'Office hours, and answer what came back' }
];

export const DEMO_EVIDENCE_GAPS: string[] = [
  'The review-time figure has no approved source and is marked awaiting source.',
  'No approved source describes what the assistant can reach in this tenant.'
];

export const DEMO_REVIEW_NEEDS: string[] = [
  `Strategy and voice: ${DEMO_STRATEGY_REVIEWER}`,
  `Copy and channel: ${DEMO_COPY_REVIEWER}`
];

/** Planning notes only. Roles, never people, so nothing here can read as allocated work. */
export const DEMO_PROPOSED_OWNERS: { role: string; note: string }[] = [
  { role: 'Communications', note: 'Suggested for the newsletter piece; not assigned.' },
  { role: 'Intranet editor', note: 'Suggested for the landing page; not assigned.' }
];

export const DEMO_DEPENDENCIES: string[] = ['An approved source for anything said about tool availability.'];

/** Content plan material, elaborated from the brief above. */
export const DEMO_ASSETS: { name: string; channel: string; note: string }[] = [
  { name: 'Team lead briefing note', channel: 'Team lead briefing', note: 'One page, read aloud in an existing meeting.' },
  { name: 'Newsletter piece', channel: 'Internal newsletter', note: 'Roughly 200 words with one destination.' },
  { name: 'Intranet landing page', channel: 'Intranet', note: 'The one place everything else points at.' }
];

export const DEMO_COPY_VARIANTS: { audience: string; headline: string; body: string; action: string; gate: string }[] = [
  {
    audience: 'Team leads',
    headline: 'What the AI CoE can do for your team',
    body: 'Ask before you start and you will get a straight answer about what is allowed. A person reads every request.',
    action: 'Send one request this week',
    gate: 'Holds until the availability claim has an approved source.'
  },
  {
    audience: 'People who tried once',
    headline: 'It is easier than it was',
    body: 'The request path is one page now, and you can see where your request stands without asking anyone.',
    action: 'Open the front door',
    gate: 'Ready for review.'
  }
];

/** Meeting follow-through material. Actions are proposals: no owner is a person and no date is set. */
export const DEMO_MEETING_NOTES: string =
  'Fictional meeting, Demo Corporation, week 1. Attendees agreed the launch should wait for the availability source. Someone raised that two teams are duplicating work. The newsletter slot was said to be tight.';

export const DEMO_DECISIONS: string[] = [
  'The launch waits until the availability claim has an approved source.',
  'The intranet page is the single destination; other pieces point at it.'
];

export const DEMO_ACTION_PROPOSALS: { proposal: string; suggestedRole: string }[] = [
  { proposal: 'Find an approved source for tool availability, or drop the claim.', suggestedRole: 'Product owner' },
  { proposal: 'Check the newsletter slot before promising a date.', suggestedRole: 'Communications' },
  { proposal: 'Ask the two teams whether the work really overlaps.', suggestedRole: 'Marketing owner' }
];

export const DEMO_BRIEF_CHANGES: string[] = [
  'The launch-week calendar entry moves behind the source decision.',
  'The review-time claim stays marked awaiting source.'
];

export const DEMO_UNRESOLVED: string[] = [
  'Who owns the availability claim has not been settled.',
  'Whether the newsletter slot exists in the launch week is unconfirmed.'
];

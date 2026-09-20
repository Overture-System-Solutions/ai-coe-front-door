/**
 * The user-plane guard (plan step 22, REC-26): nothing a person outside the AI CoE reads may carry a
 * score, a readiness rating, a lift figure or a duplicate count. Those four are engineering measures;
 * shown to an employee or a leader they read as a judgement of the person or a claim of benefit the
 * front door cannot back, so no block, piece or control may draw a field or a label named after one.
 *
 * Three checks: the rendering layer's own source carries none of the four words outside its comments;
 * a page built from every block type renders none of them; and the block a leader sees is static
 * content from the document, which asks no service for a figure it could then be tempted to rate.
 */
import { screen, within } from '@testing-library/react';
import * as fs from 'fs';
import * as path from 'path';
import * as React from 'react';
import { createFakeMyWorkService, createFakePageContentService, createFakeRoleResolver, createFakeUsageService } from '../testing/fakeServices';
import type { IFakeMyWorkService, IFakeUsageMetricsService } from '../testing/fakeServices';
import { renderWithFrontDoor } from '../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult } from '../testing/renderWithFrontDoor';
import { PageViewShell } from '../webparts/aiCoeFrontDoor/components/PageViewShell';
import { parsePageDocument } from '../webparts/aiCoeFrontDoor/content/pageContent';
import type { IPageDocument } from '../webparts/aiCoeFrontDoor/content/pageContent';
import type { RoleId } from '../webparts/aiCoeFrontDoor/content/roles';
import type { IMyWorkResult } from '../webparts/aiCoeFrontDoor/services/myWorkService';

const ROOT: string = process.cwd();
/** The rendering layer: the blocks and pieces of a page, the controls they draw with, and the text they read. */
const RENDERING_DIRECTORIES: string[] = [
  'src/webparts/aiCoeFrontDoor/components',
  'src/webparts/aiCoeFrontDoor/controls',
  'src/webparts/aiCoeFrontDoor/content'
];
/** The four measures of REC-26, in any case and either number, as whole words. */
const FORBIDDEN: RegExp = /\b(scores?|readiness|lifts?|duplicates?)\b/i;
const PAGES_JSON: string = path.join(ROOT, 'sharepoint/pages/pages.json');

/**
 * Text ready for the scan: a camel-case name is parted into its words, so a field called
 * `readinessScore` is read as the two measures it names rather than one word the guard has never heard of.
 */
function scannable(text: string): string {
  return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

/** What the guard says about one piece of text: the measure it names, or nothing. */
function measureIn(text: string): string | undefined {
  const match: RegExpExecArray | null = FORBIDDEN.exec(scannable(text));
  return match === null ? undefined : match[0];
}

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full: string = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        found.push(full);
      }
    }
  };
  walk(path.join(ROOT, directory));
  return found;
}

/** The code without its comments: a note about duplicate submissions is not a field a page renders. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** A page carrying one block of every kind the document defines, in neutral words. */
const EVERY_BLOCK: IPageDocument = parsePageDocument(
  JSON.stringify({
    version: 1,
    routes: {
      guidedIntake: { label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
      work: { label: 'Ask the assistant', state: 'needsAccess' }
    },
    shared: { footer: [{ type: 'paragraph', text: 'Questions go to the AI CoE.' }] },
    pages: {
      everything: {
        title: 'Everything',
        blocks: [
          { type: 'hero', title: 'What do you need done?', text: 'One sentence is enough.' },
          { type: 'workCommand', prompt: 'Say what you need done.', note: 'Nothing is sent yet.' },
          { type: 'heading', level: 2, text: 'What you can do' },
          { type: 'paragraph', text: 'Pick the path that fits the task.' },
          { type: 'tiles', items: [{ title: 'Use AI for my work', kicker: 'Do', route: 'work' }] },
          {
            type: 'cards',
            columns: 2,
            items: [{ title: 'What is running', body: ['Nothing is claimed here.'], tone: 'teal', asOf: '2026-09-01', source: 'AI CoE check' }]
          },
          { type: 'lanes', items: [{ title: 'Fast path', text: 'The AI CoE decides.', tone: 'green' }] },
          { type: 'statusRow', items: [{ label: 'Assistant', text: 'Not open yet.', route: 'work' }] },
          {
            type: 'statusStrip',
            items: [{ kind: 'myRequests', label: 'My requests', href: 'SitePages/Status.aspx' }],
            emptyText: 'Nothing from you yet.',
            unavailableText: 'The request list is not available.'
          },
          { type: 'piece', piece: 'myWork' },
          { type: 'caseCards', items: [{ id: 'EXAMPLE-01', title: 'A worked example', state: 'AWAITING_SOURCE', sourceDate: '2026-06-01', illustrative: true }] },
          { type: 'notice', tone: 'caution', title: 'Data boundary', text: 'Keep personal data out of every prompt.' },
          { type: 'rules', ordered: true, items: [{ title: 'You decide', text: 'The tool suggests.' }] },
          {
            type: 'supportRoute',
            label: 'Ask in the pilot channel',
            stopWhen: ['a source is missing'],
            reportFields: ['the task type', 'the time'],
            routes: [{ issue: 'Outcome is uncertain after an action', owner: 'Recovery owner', action: 'Reconcile before retrying' }]
          }
        ]
      },
      forLeaders: {
        title: 'Start here',
        blocks: [
          { type: 'paragraph', text: 'What this site is for.' },
          {
            type: 'cards',
            columns: 2,
            audience: ['leader'],
            items: [
              { title: 'Decisions waiting on you', body: ['Open the evidence view.'], tone: 'teal', route: 'guidedIntake' },
              { title: 'Material changes', body: ['What changed since last month.'], tone: 'blue', href: 'SitePages/Status.aspx' }
            ]
          }
        ]
      }
    }
  })
) as IPageDocument;

const ONE_REQUEST: IMyWorkResult = {
  state: 'ok',
  message: 'Read 1 request.',
  items: [
    {
      id: 4,
      title: 'AI idea',
      reference: 'OVT-AICOE-20260901-PATPAT01',
      workflowType: 'idea',
      workflowLabel: 'Explore an AI idea',
      status: 'Submitted - Pilot',
      submittedAt: '2026-09-01T10:00:00Z',
      modified: '2026-09-02T10:00:00Z'
    }
  ]
};

function renderPage(pageKey: string, roles: RoleId[], myWork: IFakeMyWorkService, usage: IFakeUsageMetricsService): FrontDoorRenderResult {
  return renderWithFrontDoor(React.createElement(PageViewShell, { settings: { view: 'page', layout: 'wide', pages: {}, pageKey } }), {
    pageContent: createFakePageContentService({ connected: true, message: 'ok', document: EVERY_BLOCK }),
    myWork,
    usage,
    pageView: true,
    now: new Date('2026-09-20T12:00:00Z'),
    roleResolver: createFakeRoleResolver({ roles, resolution: 'resolved' })
  });
}

describe('User plane: no score, readiness, lift or duplicate (REC-26)', () => {
  it('names none of the four in the blocks, pieces and controls a page is drawn with', () => {
    const offending: string[] = [];
    for (const directory of RENDERING_DIRECTORIES) {
      for (const file of sourceFiles(directory)) {
        const measure: string | undefined = measureIn(withoutComments(fs.readFileSync(file, 'utf8')));
        if (measure !== undefined) {
          offending.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}: ${measure}`);
        }
      }
    }
    expect(offending).toEqual([]);
    // The walk reads real files, and the guard catches what it is for.
    expect(sourceFiles(RENDERING_DIRECTORIES[0]).length).toBeGreaterThan(20);
    expect(measureIn(withoutComments('const readinessScore = 1;'))).toBe('readiness');
    expect(measureIn(withoutComments('<p className="ai-page-lift">Lift</p>'))).toBe('lift');
    expect(measureIn(withoutComments('<p>Lift</p>'))).toBe('Lift');
    // A comment about duplicate submissions is not a field, and a URL survives the comment stripping.
    expect(measureIn(withoutComments('/** nothing duplicates */ const x = 1;'))).toBeUndefined();
    expect(withoutComments('const url = "https://example.test/x"; // a note about a duplicate')).toContain('https://example.test/x');
    expect(measureIn(withoutComments('const url = "https://example.test/x"; // a note about a duplicate'))).toBeUndefined();
  });

  it('writes none of the four into the committed content document', () => {
    expect(measureIn(fs.readFileSync(PAGES_JSON, 'utf8'))).toBeUndefined();
  });

  it('renders none of the four from a page carrying every block, its pieces and its pills', async () => {
    const myWork: IFakeMyWorkService = createFakeMyWorkService(ONE_REQUEST);
    const { container } = renderPage('everything', ['employee'], myWork, createFakeUsageService());
    await screen.findByRole('heading', { level: 1, name: 'What do you need done?' });
    await within(container).findByText('OVT-AICOE-20260901-PATPAT01');
    // The page really did draw its pieces and pills, so the scan below reads the chrome, not an empty page.
    expect(container.querySelectorAll('.ai-page-block').length).toBeGreaterThan(12);
    expect(container.querySelectorAll('.ai-pill').length).toBeGreaterThan(3);
    expect(container.querySelector('.ai-page-mywork')).not.toBeNull();
    expect(measureIn(container.textContent ?? '')).toBeUndefined();
    expect(measureIn(container.innerHTML)).toBeUndefined();
  });

  it('gives a leader static content from the document, never a figure read from a list', async () => {
    const myWork: IFakeMyWorkService = createFakeMyWorkService(ONE_REQUEST);
    const usage: IFakeUsageMetricsService = createFakeUsageService();
    const { container } = renderPage('forLeaders', ['employee', 'leader'], myWork, usage);
    await screen.findByRole('heading', { level: 3, name: 'Decisions waiting on you' });
    expect(container.querySelectorAll('.ai-page-block--cards > .ai-page-cards > .ai-page-card')).toHaveLength(2);
    // Static: the words come from the document, no piece is mounted and no list is asked for a number.
    expect(container.querySelector('.ai-page-mywork')).toBeNull();
    expect(container.querySelector('.ai-usage-section')).toBeNull();
    expect(myWork.calls).toBe(0);
    expect(usage.calls).toBe(0);
    expect(container.textContent).not.toMatch(/\d+ (received|in review)/);
    expect(measureIn(container.textContent ?? '')).toBeUndefined();
  });
});

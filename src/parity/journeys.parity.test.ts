/**
 * Behavioural parity between the shipped 1.0.0.7 bundle and the port.
 *
 * Both bundles run in the same simulated SharePoint host with the organization name "Overture", and
 * every journey is played step by step through the DOM. What the visitor reads on each screen, what
 * gets written to localStorage, the download file names and the list items posted to SharePoint
 * must be identical once ids/timestamps and the explicit 1.0.0.17 draft-location copy correction are normalized.
 * Local persistence parity is a synthetic-loopback exercise; production now requires server-side drafts.
 */
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { loadWebPartBundle, newestDistBundle, newestStringsChunk, originalBundle } from '../testing/amdHost';
import type { IHostedInstance, IWebPartBundle } from '../testing/amdHost';
import { spyOnDownloads } from '../testing/dom';
import type { IDownloadSpy } from '../testing/dom';
import { continueButton, enterAnswer, FEEDBACK_JOURNEY, HELP_TRAINING_JOURNEY, IDEA_JOURNEY, TEAM_USAGE_JOURNEY, TOOL_CHECK_GAP_JOURNEY, TOOL_CHECK_JOURNEY } from '../testing/journeys';
import type { IJourney, IJourneyAnswer } from '../testing/journeys';
import type { IRecordedRequest } from '../testing/listStore';
import { createBranding } from '../webparts/aiCoeFrontDoor/branding/branding';
import { DRAFT_KEY_PREFIX } from '../webparts/aiCoeFrontDoor/content/constants';
import { HOME_CARDS } from '../webparts/aiCoeFrontDoor/content/homeCards';
import { createWorkflowCatalog } from '../webparts/aiCoeFrontDoor/content/workflows/catalog';
import { visibleSteps } from '../webparts/aiCoeFrontDoor/workflows/formEngine';
import type { IAnswers, IStep, IWorkflowCatalog, IWorkflowDefinition } from '../webparts/aiCoeFrontDoor/workflows/types';

jest.setTimeout(60000);

const ORGANIZATION: string = 'Overture';
const catalog: IWorkflowCatalog = createWorkflowCatalog(createBranding(ORGANIZATION));
const original: IWebPartBundle = loadWebPartBundle(originalBundle());
const ported: IWebPartBundle = loadWebPartBundle(newestDistBundle(), newestStringsChunk());

const LOADING_TEXT: RegExp = /Setting things up…|Looking at your answers…|Creating your summary…|Looking at your feedback…|Putting your (summary|review request|feedback) together…|Connecting…/;
const INTAKE_ID: RegExp = /OVT-AICOE-\d{8}-[0-9A-Z]{8}/g;
const ISO_TIMESTAMP: RegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;
const UUID: RegExp = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const LOCAL_RECORD_ID: RegExp = /\b(idea|review-request|policy-gap|feedback|disclosure)-\d{13}-[a-z0-9]+\b/g;

interface IJourneyScript {
  journey: IJourney;
  /** Drives the page after the last question until the submission result is on screen. */
  confirm: (root: HTMLElement) => Promise<void>;
  /** Number of "Download summary" clicks expected along the way (guidance result plus review request for tool checks). */
  downloads: number;
}

interface ITrace {
  screens: string[];
  draft: { [key: string]: unknown };
  downloads: string[];
  posts: unknown[];
}

/** Text a visitor would read, with `<style>`/`<script>` contents skipped and volatile values masked. */
function visibleText(root: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag: string = (node as Element).tagName;
      if (tag === 'STYLE' || tag === 'SCRIPT') {
        return;
      }
      node.childNodes.forEach(walk);
      parts.push('\n');
    }
  };
  walk(root);
  return parts
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(INTAKE_ID, '<intake-id>')
    // Exact documented copy change only; do not hide other screen differences.
    .replace('Draft saved on this device.', 'Draft saved.')
    .replace(/^Created: .*$/gm, 'Created: <time>')
    .trim();
}

function mask(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(INTAKE_ID, '<intake-id>').replace(ISO_TIMESTAMP, '<timestamp>').replace(UUID, '<uuid>').replace(LOCAL_RECORD_ID, '$1-<id>');
  }
  if (Array.isArray(value)) {
    return value.map(mask);
  }
  if (value && typeof value === 'object') {
    const out: { [key: string]: unknown } = {};
    for (const key of Object.keys(value as object)) {
      const field: unknown = (value as { [key: string]: unknown })[key];
      out[key] = key === 'PayloadJson' && typeof field === 'string' ? mask(JSON.parse(field)) : mask(field);
    }
    return out;
  }
  return value;
}

async function settle(root: HTMLElement): Promise<void> {
  await waitFor((): void => expect(visibleText(root)).not.toMatch(LOADING_TEXT));
}

function localDrafts(): { [key: string]: unknown } {
  const drafts: { [key: string]: unknown } = {};
  for (let index: number = 0; index < window.localStorage.length; index++) {
    const key: string | null = window.localStorage.key(index);
    if (key !== null && key.indexOf(DRAFT_KEY_PREFIX) === 0) {
      drafts[key] = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    }
  }
  return drafts;
}

async function runJourney(bundle: IWebPartBundle, script: IJourneyScript): Promise<ITrace> {
  const definition: IWorkflowDefinition = catalog[script.journey.workflowId];
  const downloads: IDownloadSpy = spyOnDownloads();
  const instance: IHostedInstance = bundle.create({ siteUrl: 'http://localhost/simulated-site', properties: { organizationName: ORGANIZATION, telemetryProvider: 'openai' } });
  const root: HTMLElement = instance.webPart.domElement;
  const screens: string[] = [];
  let draft: { [key: string]: unknown } = {};
  try {
    await act(async (): Promise<void> => {
      await instance.webPart.onInit();
      instance.webPart.render();
    });
    await waitFor((): void => expect(within(root).getByText('SharePoint connected')).toBeInTheDocument());
    screens.push(visibleText(root));

    fireEvent.click(within(root).getByText(HOME_CARDS[script.journey.workflowId].title).closest('button') as HTMLElement);
    await settle(root);
    screens.push(visibleText(root));

    const answers: IAnswers = {};
    for (let index: number = 0; ; index++) {
      const steps: IStep[] = visibleSteps(definition, answers);
      if (index >= steps.length) {
        break;
      }
      const step: IStep = steps[index];
      if (step.type !== 'notice') {
        const answer: IJourneyAnswer | undefined = script.journey.answers.filter((candidate: IJourneyAnswer): boolean => candidate.stepId === step.id)[0];
        if (answer === undefined) {
          throw new Error(`No scripted answer for step "${step.id}".`);
        }
        enterAnswer(step, answer.value, root);
        answers[step.id] = answer.value;
        if (index === 0) {
          fireEvent.click(within(root).getByRole('button', { name: 'Save draft' }));
          await waitFor((): void => expect(within(root).getByText(bundle === original ? 'Draft saved on this device.' : 'Draft saved.')).toBeInTheDocument());
          draft = localDrafts();
        }
      }
      fireEvent.click(continueButton(root));
      await settle(root);
      screens.push(visibleText(root));
    }

    await script.confirm(root);
    await settle(root);
    screens.push(visibleText(root));
    fireEvent.click(within(root).getByRole('button', { name: 'Download summary' }));
    expect(downloads.names).toHaveLength(script.downloads);
    expect(localDrafts()).toEqual({});
  } finally {
    instance.dispose();
    downloads.restore();
    window.localStorage.clear();
  }
  const posts: unknown[] = instance.store.requests
    .filter((request: IRecordedRequest): boolean => request.method === 'POST')
    .map((request: IRecordedRequest): unknown => ({ list: request.list, body: mask(request.body) }));
  return { screens, draft, downloads: downloads.names.slice(), posts };
}

function clickButton(root: HTMLElement, name: string): void {
  fireEvent.click(within(root).getByRole('button', { name }));
}

async function requestReview(root: HTMLElement, callToAction: string): Promise<void> {
  fireEvent.click(within(root).getByRole('button', { name: 'Download summary' }));
  clickButton(root, callToAction);
  fireEvent.change(within(root).getByPlaceholderText('Your name'), { target: { value: 'Pat Example' } });
  fireEvent.change(within(root).getByPlaceholderText('Your team or department'), { target: { value: 'Finance' } });
  fireEvent.change(within(root).getByPlaceholderText('name@example.com'), { target: { value: 'pat@contoso.com' } });
  clickButton(root, 'Create review request');
}

const SCRIPTS: IJourneyScript[] = [
  { journey: IDEA_JOURNEY, confirm: async (root: HTMLElement): Promise<void> => clickButton(root, 'Confirm this reflects my idea'), downloads: 1 },
  {
    journey: TOOL_CHECK_JOURNEY,
    confirm: (root: HTMLElement): Promise<void> => requestReview(root, 'Want a second opinion? Create a CoE review request'),
    downloads: 2
  },
  { journey: TOOL_CHECK_GAP_JOURNEY, confirm: (root: HTMLElement): Promise<void> => requestReview(root, 'Create a CoE review request'), downloads: 2 },
  { journey: TEAM_USAGE_JOURNEY, confirm: async (root: HTMLElement): Promise<void> => clickButton(root, "Confirm this reflects what's happening"), downloads: 1 },
  { journey: HELP_TRAINING_JOURNEY, confirm: async (root: HTMLElement): Promise<void> => clickButton(root, 'Confirm'), downloads: 1 },
  { journey: FEEDBACK_JOURNEY, confirm: async (root: HTMLElement): Promise<void> => clickButton(root, 'Confirm my feedback'), downloads: 1 }
];

describe('Journey parity between package 1.0.0.7 and the port', () => {
  for (const script of SCRIPTS) {
    const label: string = `${script.journey.workflowId}${script.journey === TOOL_CHECK_GAP_JOURNEY ? ' (guidance gap)' : ''}`;
    it(`renders, stores and submits the ${label} journey identically`, async () => {
      const shipped: ITrace = await runJourney(original, script);
      const port: ITrace = await runJourney(ported, script);
      expect(port.screens).toEqual(shipped.screens);
      expect(port.draft).toEqual(shipped.draft);
      expect(port.downloads).toEqual(shipped.downloads);
      expect(port.posts).toEqual(shipped.posts);
      expect(shipped.posts.length).toBeGreaterThan(0);
      // Landing page, first question, one screen per continue, and the result.
      expect(shipped.screens.length).toBeGreaterThanOrEqual(script.journey.answers.length + 3);
    });
  }
});

describe('Documented differences from package 1.0.0.7', () => {
  it('the shipped bundle rebuilt its telemetry service on every render and refetched; the port fetches once', async () => {
    const usageReads = (instance: IHostedInstance): number =>
      instance.store.requests.filter((request: IRecordedRequest): boolean => request.method === 'GET' && request.list === 'AI Usage Daily').length;
    for (const [bundle, expectedReads] of [
      [original, 2],
      [ported, 1]
    ] as const) {
      const instance: IHostedInstance = bundle.create({ properties: { organizationName: ORGANIZATION, telemetryProvider: 'openai' } });
      try {
        await act(async (): Promise<void> => {
          await instance.webPart.onInit();
          instance.webPart.render();
        });
        await waitFor((): void => expect(usageReads(instance)).toBe(1));
        await act(async (): Promise<void> => {
          instance.webPart.render();
        });
        await waitFor((): void => expect(within(instance.webPart.domElement).getByText('SharePoint connected')).toBeInTheDocument());
        expect(usageReads(instance)).toBe(expectedReads);
      } finally {
        instance.dispose();
      }
    }
  });

  it('the shipped bundle shows only the OpenAI tiles; the port defaults to Claude and offers OpenAI as a property', async () => {
    for (const [bundle, shownLabel, absentLabel, alertsHeading] of [
      [original, 'OpenAI API spend this month', 'Claude API spend this month', 'AI CoE alerts and ChatGPT / Work overages'],
      [ported, 'Claude API spend this month', 'OpenAI API spend this month', 'AI CoE alerts and usage overages']
    ] as const) {
      const instance: IHostedInstance = bundle.create({ properties: { organizationName: ORGANIZATION } });
      try {
        await act(async (): Promise<void> => {
          await instance.webPart.onInit();
          instance.webPart.render();
        });
        const root: HTMLElement = instance.webPart.domElement;
        await waitFor((): void => expect(within(root).getByText('SharePoint connected')).toBeInTheDocument());
        expect(within(root).getByText(shownLabel)).toBeInTheDocument();
        expect(within(root).queryByText(absentLabel)).not.toBeInTheDocument();
        expect(within(root).getByText(alertsHeading)).toBeInTheDocument();
      } finally {
        instance.dispose();
      }
    }
  });
});

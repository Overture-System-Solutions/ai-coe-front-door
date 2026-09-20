/**
 * The page document context: the route table, vocabulary, settings, plane, shared sections and clock
 * every block reads from a provider (never from its props), provided by the page view shell from the
 * document it loaded.
 */
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { createFakePageContentService } from '../../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../testing/renderWithFrontDoor';
import { DEFAULT_SETTINGS, DEFAULT_VOCABULARY, parsePageDocument } from '../../content/pageContent';
import type { IPageDocument, ITilesBlock } from '../../content/pageContent';
import type { IPageViewSettings } from '../../content/pageViews';
import type { RouteTable } from '../../content/routes';
import { PageViewShell } from '../PageViewShell';
import { TilesBlock } from './blocks/TilesBlock';
import { createPageDocumentContext, documentContext, PageDocumentProvider, usePageDocument } from './PageDocumentContext';
import type { IPageDocumentContextValue } from './PageDocumentContext';

const START_HERE: IPageViewSettings = { view: 'page', layout: 'wide', pages: {}, pageKey: 'startHere' };

const OPEN_ROUTES: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
  work: { key: 'work', label: 'Work command', href: 'SitePages/Work.aspx', state: 'availableNow' }
};

const CLOSED_ROUTES: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
  work: { key: 'work', label: 'Work command', state: 'availableNow' }
};

const TILES: ITilesBlock = { type: 'tiles', items: [{ title: 'Get work done', route: 'work', tone: 'teal' }] };

function Probe(): React.ReactElement {
  const value: IPageDocumentContextValue = usePageDocument();
  return (
    <p>
      {Object.keys(value.routes).length} routes; plane {value.plane}; now {value.now.toISOString()}; freshness {value.settings.freshnessDays}; footer {value.shared.footer.length}
    </p>
  );
}

describe('PageDocumentContext', () => {
  it('defaults to no routes, the default vocabulary and settings, the user plane, no footer and the current time', () => {
    const before: number = Date.now();
    const value: IPageDocumentContextValue = createPageDocumentContext();
    expect(value.routes).toEqual({});
    expect(value.vocabulary).toEqual(DEFAULT_VOCABULARY);
    expect(value.settings).toEqual(DEFAULT_SETTINGS);
    expect(value.plane).toBe('user');
    expect(value.shared).toEqual({ footer: [] });
    expect(value.roles).toBeUndefined();
    expect(value.now.getTime()).toBeGreaterThanOrEqual(before);
    expect(value.now.getTime()).toBeLessThanOrEqual(Date.now());
    const fixed: Date = new Date('2026-09-20T12:00:00Z');
    expect(createPageDocumentContext({ now: fixed, roles: ['leader'] }).now).toBe(fixed);
    expect(createPageDocumentContext({ now: fixed, roles: ['leader'] }).roles).toEqual(['leader']);
  });

  it('is readable outside a provider with the defaults', () => {
    render(<Probe />);
    expect(screen.getByText(/^0 routes; plane user; now .*; freshness 30; footer 0$/)).toBeInTheDocument();
  });

  it('takes the routes, vocabulary, settings and shared sections from the document, the plane from the page and the clock from the host', () => {
    const document: IPageDocument = parsePageDocument(
      JSON.stringify({
        version: 1,
        routes: { guidedIntake: { label: 'Start', href: 'SitePages/x.aspx', state: 'availableNow' } },
        vocabulary: { chrome: { example: 'Sample' } },
        settings: { freshnessDays: 7 },
        shared: { footer: [{ type: 'paragraph', text: 'Questions? Ask the AI CoE.' }] },
        pages: { operations: { title: 'Operations', plane: 'operator', blocks: [] }, learn: { title: 'Learn', blocks: [] } }
      })
    ) as IPageDocument;
    const host: IPageDocumentContextValue = createPageDocumentContext({ now: new Date('2026-09-20T12:00:00Z'), roles: ['operator'] });
    const operations: IPageDocumentContextValue = documentContext(document, document.pages.operations, host);
    expect(operations.routes).toEqual({ guidedIntake: { key: 'guidedIntake', label: 'Start', href: 'SitePages/x.aspx', state: 'availableNow' } });
    expect(operations.vocabulary.chrome).toEqual({ example: 'Sample' });
    expect(operations.settings).toEqual({ freshnessDays: 7, minimumCohort: 5 });
    expect(operations.shared).toEqual({ footer: [{ type: 'paragraph', text: 'Questions? Ask the AI CoE.' }] });
    expect(operations.plane).toBe('operator');
    expect(operations.now).toBe(host.now);
    expect(operations.roles).toEqual(['operator']);
    expect(documentContext(document, document.pages.learn, host).plane).toBe('user');
    expect(documentContext(document, undefined, host).plane).toBe('user');
    const bare: IPageDocument = { version: 1, pages: {} };
    const fromBare: IPageDocumentContextValue = documentContext(bare, undefined, host);
    expect(fromBare.routes).toEqual({});
    expect(fromBare.vocabulary).toEqual(DEFAULT_VOCABULARY);
    expect(fromBare.settings).toEqual(DEFAULT_SETTINGS);
    expect(fromBare.shared).toEqual({ footer: [] });
  });

  it('drives the blocks from the provider: the same block opens or closes with the routes it is given', () => {
    const open = renderWithFrontDoor(<TilesBlock block={TILES} />, { routes: OPEN_ROUTES });
    expect(open.getByText('Get work done').closest('a')).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Work.aspx`);
    open.unmount();
    const closed = renderWithFrontDoor(<TilesBlock block={TILES} />, { routes: CLOSED_ROUTES });
    expect(closed.getByText('Get work done').closest('.ai-service-card')).toHaveClass('ai-service-card--closed');
    closed.unmount();
    const nested = renderWithFrontDoor(
      <PageDocumentProvider value={createPageDocumentContext({ routes: OPEN_ROUTES })}>
        <TilesBlock block={TILES} />
      </PageDocumentProvider>,
      { routes: CLOSED_ROUTES }
    );
    expect(nested.getByText('Get work done').closest('a')).not.toBeNull();
  });

  it('is provided by the page view shell from the loaded document, inheriting the host clock', async () => {
    const document: IPageDocument = {
      version: 1,
      routes: {
        guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
        assistant: { key: 'assistant', label: 'Ask the assistant', href: 'https://assistant.example/chat', state: 'availableNow', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007' }
      },
      pages: {
        startHere: {
          title: 'Start here',
          blocks: [
            { type: 'tiles', items: [{ title: 'Ask the assistant', route: 'assistant', tone: 'teal' }, { title: 'Get work done', route: 'work', tone: 'blue' }] },
            { type: 'paragraph', text: 'Done.' }
          ]
        }
      }
    };
    const proven = renderWithFrontDoor(<PageViewShell settings={START_HERE} />, {
      pageContent: createFakePageContentService({ connected: true, message: '', document }),
      routes: CLOSED_ROUTES,
      now: new Date('2026-09-20T12:00:00Z')
    });
    await proven.findByText('Done.');
    expect(proven.getByText('Ask the assistant').closest('a')).toHaveAttribute('href', 'https://assistant.example/chat');
    // The host routes never leak in: `work` is unknown to the document, so it falls back to the guided intake.
    expect(proven.getByText('Get work done').closest('a')).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
    proven.unmount();
    const early = renderWithFrontDoor(<PageViewShell settings={START_HERE} />, {
      pageContent: createFakePageContentService({ connected: true, message: '', document }),
      now: new Date('2026-01-01T12:00:00Z')
    });
    await early.findByText('Done.');
    expect(early.getByText('Ask the assistant').closest('.ai-service-card')).toHaveClass('ai-service-card--closed');
  });
});

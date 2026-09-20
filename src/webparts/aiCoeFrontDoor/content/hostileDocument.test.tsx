/**
 * A hostile content document: script tags and an image with an event handler in the text, links with
 * executable schemes, a 200 kB string, arrays nested fifty deep and keys named `__proto__` on a page
 * and on a block. The parser keeps the document, the blocks render the text as text and the links as
 * dead anchors, and nothing in the document reaches the page as markup (GOV-03, TH-004, PV-37).
 */
/* eslint-disable no-script-url -- the script URLs are the hostile inputs under test */
import { screen } from '@testing-library/react';
import * as React from 'react';
import { createFakePageContentService } from '../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../testing/renderWithFrontDoor';
import { ContentPage, findPage } from '../components/pages/ContentPage';
import { parsePageDocument } from './pageContent';
import type { IPageDocument } from './pageContent';

const SCRIPT: string = '<script>alert(1)</script>';
const IMAGE: string = '<img src=x onerror="alert(1)">';
const BIG_TEXT: string = new Array(200 * 1024 + 1).join('a');
const DEEP_ARRAYS: string = new Array(51).join('[') + new Array(51).join(']');
const PROTO_BLOCK: string = '{"type":"__proto__","text":"not a block","polluted":true}';
const PROTO_PAGE: string = '{"title":"Not a page","blocks":[{"type":"paragraph","text":"never rendered"}],"polluted":true}';

function blockJson(block: unknown): string {
  return JSON.stringify(block);
}

const START_HERE_BLOCKS: string = [
  DEEP_ARRAYS,
  PROTO_BLOCK,
  blockJson({
    type: 'hero',
    title: SCRIPT,
    text: `Read [this](javascript:alert(1)) and ${IMAGE} then [that](data:text/html,${SCRIPT}).`,
    cta: { label: 'Run me', href: 'javascript:alert(1)' }
  }),
  blockJson({ type: 'paragraph', text: BIG_TEXT }),
  blockJson({
    type: 'tiles',
    items: [
      { title: 'Open me', href: `data:text/html,${SCRIPT}`, description: IMAGE },
      { title: 'Call me', href: 'vbscript:MsgBox(1)' },
      { title: 'Requests', href: 'SitePages/Requests.aspx' }
    ]
  }),
  `{"type":"cards","items":[{"title":"Deep body","body":${DEEP_ARRAYS}},{"title":${JSON.stringify(SCRIPT)},"body":["[x](javascript:alert(1))"]}]}`,
  blockJson({ type: 'statusRow', items: [{ label: SCRIPT, text: `[status](JAVASCRIPT:alert(1))`, href: 'javascript:alert(1)' }] }),
  blockJson({ type: 'heading', level: 2, text: 'After the hostile blocks' })
].join(',');

const HOSTILE_DOCUMENT_TEXT: string =
  `{"version":1,"pages":{"__proto__":${PROTO_PAGE},"constructor":${PROTO_PAGE},"startHere":{"title":${JSON.stringify(SCRIPT)},"blocks":[${START_HERE_BLOCKS}]}},` +
  `"routes":{"__proto__":{"label":"Not a route","href":"javascript:alert(1)","polluted":true}},` +
  `"vocabulary":{"chrome":{"__proto__":{"polluted":true}}},"shared":{"footer":[${PROTO_BLOCK},${DEEP_ARRAYS}]}}`;

function parseHostile(): IPageDocument {
  const document: IPageDocument | undefined = parsePageDocument(HOSTILE_DOCUMENT_TEXT);
  if (document === undefined) {
    throw new Error('The hostile document should still parse as a version 1 document.');
  }
  return document;
}

describe('a hostile content document', () => {
  it('parses to its well-formed blocks, leaves out what it does not understand and pollutes no prototype', () => {
    const document: IPageDocument = parseHostile();
    expect(Object.keys(document.pages)).toEqual(['constructor', 'startHere']);
    expect(Object.getPrototypeOf(document.pages)).toBe(Object.prototype);
    expect(findPage(document, '__proto__')).toBeUndefined();
    expect(findPage(document, 'constructor')?.title).toBe('Not a page');
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(document.routes ?? {})).toBe(Object.prototype);
    expect(Object.keys(document.routes ?? {})).toEqual([]);
    expect(document.shared?.footer).toEqual([]);
    const types: string[] = findPage(document, 'startHere')?.blocks.map((block): string => block.type) ?? [];
    expect(types).toEqual(['hero', 'paragraph', 'tiles', 'cards', 'statusRow', 'heading']);
  });

  it('renders the text as text, every executable link as a dead anchor, and no script or image element', async () => {
    const document: IPageDocument = parseHostile();
    const { container } = renderWithFrontDoor(<ContentPage pageKey="startHere" />, {
      pageContent: createFakePageContentService({ connected: true, document, message: 'Page content loaded.' })
    });
    const heading: HTMLElement = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe(SCRIPT);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
    expect(container.innerHTML).not.toContain('data:');
    expect(container.innerHTML).not.toContain('vbscript:');
    // The image markup survives only as escaped text: no element carries the handler, no tag was opened.
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.innerHTML).not.toContain('<img');
    expect(container.innerHTML).toContain('&lt;img src=x onerror="alert(1)"&gt;');
    expect(container.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(container.querySelectorAll('[target]')).toHaveLength(0);
    const hrefs: string[] = Array.prototype.map.call(container.querySelectorAll('a[href]'), (anchor: HTMLAnchorElement): string => anchor.getAttribute('href') ?? '') as string[];
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
    hrefs.forEach((href: string): void => {
      expect([`#`, `${TEST_SITE_URL}/SitePages/Requests.aspx`]).toContain(href);
    });
    expect(screen.getByRole('link', { name: 'Run me' })).toHaveAttribute('href', '#');
    expect(screen.getByRole('link', { name: 'Requests' })).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Requests.aspx`);
    // The hero text and the tile description both carry the image markup, as text.
    expect(screen.getAllByText(IMAGE, { exact: false })).toHaveLength(2);
    expect(screen.getByText(BIG_TEXT).textContent).toHaveLength(200 * 1024);
    expect(screen.getByRole('heading', { level: 2, name: 'After the hostile blocks' })).toBeInTheDocument();
    expect(container.querySelectorAll('.ai-home.ai-page > .ai-page-block')).toHaveLength(6);
  });
});

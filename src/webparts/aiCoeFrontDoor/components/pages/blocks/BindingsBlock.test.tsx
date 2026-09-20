/**
 * The bindings block: what the provisioning run published and which tenant inputs it was given. It
 * names the content release and the day it was published, then one row per binding with its kind and
 * a pill saying whether the site holds it. A value never appears, with the one exception of a
 * qualification receipt reference, which is a reference to a record and not a secret. The block
 * belongs to the operator plane: on a page written for everyone it renders nothing at all.
 */
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import type { IBinding, IBindingsBlock, IContentRelease } from '../../../content/pageContent';
import { BindingsBlock, NO_BINDINGS_TEXT, NO_RELEASE_TEXT } from './BindingsBlock';

const RELEASE: IContentRelease = { id: '2026-09-14-a', publishedAt: '2026-09-14', source: 'SiteAssets/ai-coe-pages.json' };

const BINDINGS: IBinding[] = [
  { name: 'AssistantUrl', kind: 'url', state: 'awaiting' },
  { name: 'AssistantReceiptRef', kind: 'optional', state: 'bound', receiptRef: 'QR-0001' },
  { name: 'LeadersGroup', kind: 'group', state: 'bound' }
];

const BLOCK: IBindingsBlock = { type: 'bindings', title: 'Tenant bindings' };

/** One row read part by part: the name, the kind, the pill's words and the receipt reference when there is one. */
function rowText(container: HTMLElement): string[] {
  const texts: string[] = [];
  container.querySelectorAll('.ai-page-binding').forEach((row: Element): void => {
    const parts: string[] = [];
    row.querySelectorAll('.ai-page-binding-name, .ai-page-binding-kind, .ai-pill-label, .ai-page-binding-receipt').forEach((part: Element): void => {
      parts.push((part.textContent ?? '').replace(/\s+/g, ' ').trim());
    });
    texts.push(parts.join(' '));
  });
  return texts;
}

function pillLabels(container: HTMLElement): string[] {
  const labels: string[] = [];
  container.querySelectorAll('.ai-pill .ai-pill-label').forEach((label: Element): void => {
    labels.push(label.textContent ?? '');
  });
  return labels;
}

describe('BindingsBlock', () => {
  it('names the content release with the day it was published and the document it wrote', () => {
    const { container } = renderWithFrontDoor(<BindingsBlock block={BLOCK} />, { plane: 'operator', release: RELEASE, bindings: BINDINGS });
    expect(container.querySelector('h3.ai-page-bindings-title')?.textContent).toBe('Tenant bindings');
    expect(container.querySelector('.ai-page-bindings-release')?.textContent).toContain('Content release 2026-09-14-a, published 14 Sep 2026');
    expect(container.querySelector('.ai-page-bindings-source')?.textContent).toContain('SiteAssets/ai-coe-pages.json');
    // A release without a published date says what it can and invents nothing.
    const { container: undated } = renderWithFrontDoor(<BindingsBlock block={BLOCK} />, { plane: 'operator', release: { id: 'r1' }, bindings: [] });
    expect(undated.querySelector('.ai-page-bindings-release')?.textContent).toBe('Content release r1');
    expect(undated.querySelector('.ai-page-bindings-source')).toBeNull();
  });

  it('draws one row per binding with its kind and its state, and never a value', () => {
    const { container } = renderWithFrontDoor(<BindingsBlock block={BLOCK} />, { plane: 'operator', release: RELEASE, bindings: BINDINGS });
    expect(container.querySelectorAll('.ai-page-binding')).toHaveLength(3);
    expect(rowText(container)).toEqual([
      'AssistantUrl url Awaiting',
      'AssistantReceiptRef optional Bound Receipt: QR-0001',
      'LeadersGroup group Bound'
    ]);
    expect(pillLabels(container)).toEqual(['Awaiting', 'Bound', 'Bound']);
    // The receipt reference of a bound route is the one value the block may carry; no other row shows one.
    expect(container.querySelectorAll('.ai-page-binding-receipt')).toHaveLength(1);
    expect(container.textContent).not.toContain('https://');
  });

  it('says so when the run wrote no release and no binding at all', () => {
    const { container } = renderWithFrontDoor(<BindingsBlock block={{ type: 'bindings' }} />, { plane: 'operator' });
    expect(container.querySelector('.ai-page-bindings-title')).toBeNull();
    expect(container.querySelector('.ai-page-bindings-release')?.textContent).toBe(NO_RELEASE_TEXT);
    expect(container.querySelector('.ai-page-bindings-empty')?.textContent).toBe(NO_BINDINGS_TEXT);
    expect(container.querySelector('.ai-page-bindings-list')).toBeNull();
  });

  it('renders nothing on a page written for everyone: the bindings belong to the operator plane', () => {
    const { container } = renderWithFrontDoor(<BindingsBlock block={BLOCK} />, { release: RELEASE, bindings: BINDINGS });
    expect(container.querySelector('.ai-page-bindings')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

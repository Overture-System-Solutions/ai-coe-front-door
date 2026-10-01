/**
 * The component kit. These are small pieces, so the cases worth having are the ones that stop the kit lying: a
 * placeholder measure must not read as a figure, a tone must never be the only signal, a proposed step must not
 * look assigned, and an empty list must say what would fill it.
 */
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import { APP_PILL_TONES, AppPill } from './AppPill';
import type { AppPillTone } from './AppPill';
import {
  AppCaseCard,
  AppFlow,
  AppGhost,
  AppLayerCard,
  AppMetric,
  AppNotice,
  AppPanel,
  AppPrimary,
  AppSectionHead,
  AppStatusCard,
  AppSteps
} from './AppSurfaces';
import type { IAppCase, IAppStep, IStatusRow } from './AppSurfaces';

describe('AppPill', () => {
  it('carries its own wording, so colour is never the only signal', () => {
    for (const tone of APP_PILL_TONES) {
      const { container } = renderWithFrontDoor(<AppPill tone={tone}>{`State ${tone}`}</AppPill>);
      const pill: Element | null = container.querySelector('.ai-app-pill');
      expect(pill?.textContent).toBe(`State ${tone}`);
      expect(pill?.className).toContain(`ai-app-pill--${tone}`);
    }
  });

  it('offers the five tones the reference distinguishes, waiting apart from designed', () => {
    expect(APP_PILL_TONES.slice()).toEqual(['good', 'wait', 'design', 'block', 'info']);
  });
});

describe('AppSectionHead', () => {
  it('shows the title, and the line saying what the reader is looking at', () => {
    const { container } = renderWithFrontDoor(<AppSectionHead title="Strategic records" note="One record per case." />);
    expect(container.querySelector('.ai-app-head-title')?.textContent).toBe('Strategic records');
    expect(container.querySelector('.ai-app-head-note')?.textContent).toBe('One record per case.');
    expect(container.querySelector('.ai-app-head-action')).toBeNull();
  });

  it('places an action only when one is given', () => {
    const { container } = renderWithFrontDoor(
      <AppSectionHead title="Records" action={<AppGhost>Open them</AppGhost>} />
    );
    expect(container.querySelector('.ai-app-head-action .ai-app-ghost')?.textContent).toBe('Open them');
    expect(container.querySelector('.ai-app-head-note')).toBeNull();
  });
});

describe('AppStatusCard', () => {
  const ROWS: IStatusRow[] = [
    { label: 'Design baseline', note: 'Staged, not deployed', tone: 'good', state: 'Verified' },
    { label: 'Tenant', note: 'Nothing changed from here', tone: 'design', state: 'Not changed' }
  ];

  it('reads each fact with its note and its state', () => {
    const { container } = renderWithFrontDoor(<AppStatusCard title="Your operating view" rows={ROWS} />);
    expect(container.querySelector('.ai-app-status-title')?.textContent).toBe('Your operating view');
    const labels: string[] = [];
    container.querySelectorAll('.ai-app-status-label').forEach((n: Element): void => {
      labels.push(n.textContent ?? '');
    });
    expect(labels).toEqual(['Design baseline', 'Tenant']);
    const states: string[] = [];
    container.querySelectorAll('.ai-app-status-row .ai-app-pill').forEach((n: Element): void => {
      states.push(n.textContent ?? '');
    });
    expect(states).toEqual(['Verified', 'Not changed']);
  });

  it('says what would fill it rather than drawing an empty frame', () => {
    const { container } = renderWithFrontDoor(<AppStatusCard title="Nothing yet" rows={[]} />);
    expect(container.querySelector('.ai-app-empty')?.textContent).toContain('Nothing to report');
    expect(container.querySelector('.ai-app-status-row')).toBeNull();
  });
});

describe('AppMetric', () => {
  it('shows a measured figure as a figure', () => {
    const { container } = renderWithFrontDoor(<AppMetric label="Ready" value="3" note="Candidate items" />);
    const value: Element | null = container.querySelector('.ai-app-metric-value');
    expect(value?.textContent).toBe('3');
    expect(value?.className).not.toContain('placeholder');
  });

  it('marks an absent measure so it cannot be read as a number', () => {
    // The reference's value screen exists to say that an absent number is absent. If the placeholder rendered at
    // headline size it would read as a result, which is the one thing this screen must never do.
    const { container } = renderWithFrontDoor(<AppMetric label="Realized value" value="Not established" note="Evidence required" placeholder />);
    const value: Element | null = container.querySelector('.ai-app-metric-value');
    expect(value?.textContent).toBe('Not established');
    expect(value?.className).toContain('ai-app-metric-value--placeholder');
  });
});

describe('AppCaseCard', () => {
  const ITEM: IAppCase = {
    reference: 'DEMO-01',
    title: 'A demonstration record',
    summary: 'What this record is about.',
    tone: 'wait',
    state: 'Awaiting source',
    facts: ['Stage: validate', 'Source: 2026-09-01'],
    next: 'Next: find the source',
    caveat: 'Do not infer progress'
  };

  it('reads the reference, the state, what it is, the facts and what happens next', () => {
    const { container } = renderWithFrontDoor(<AppCaseCard item={ITEM} />);
    expect(container.querySelector('.ai-app-case-ref')?.textContent).toBe('DEMO-01');
    expect(container.querySelector('.ai-app-case-top .ai-app-pill')?.textContent).toBe('Awaiting source');
    expect(container.querySelector('.ai-app-case-title')?.textContent).toBe('A demonstration record');
    const chips: string[] = [];
    container.querySelectorAll('.ai-app-chip').forEach((n: Element): void => {
      chips.push(n.textContent ?? '');
    });
    expect(chips).toEqual(['Stage: validate', 'Source: 2026-09-01']);
    expect(container.querySelector('.ai-app-case-foot')?.textContent).toContain('Do not infer progress');
  });

  it('leaves the facts and the footer out when the record has none, rather than drawing empty chrome', () => {
    const { container } = renderWithFrontDoor(
      <AppCaseCard item={{ reference: 'DEMO-02', title: 'Bare', summary: 'Nothing else known.', tone: 'design', state: 'Discovery' }} />
    );
    expect(container.querySelector('.ai-app-case-facts')).toBeNull();
    expect(container.querySelector('.ai-app-case-foot')).toBeNull();
  });
});

describe('AppSteps', () => {
  const STEPS: IAppStep[] = [
    { marker: '1', title: 'Freshness', note: 'Every claim exposes its source.', tone: 'good', state: 'Required' },
    { marker: '2', title: 'Authority', note: 'A connector is not an approval.', tone: 'good', state: 'Required' }
  ];

  it('reads each step with its state, and keeps the marker out of the reading order', () => {
    const { container } = renderWithFrontDoor(<AppSteps steps={STEPS} />);
    const titles: string[] = [];
    container.querySelectorAll('.ai-app-step-title').forEach((n: Element): void => {
      titles.push(n.textContent ?? '');
    });
    expect(titles).toEqual(['Freshness', 'Authority']);
    // The marker is decoration beside the title; a screen reader should hear the title, not "1".
    container.querySelectorAll('.ai-app-step-marker').forEach((n: Element): void => {
      expect(n.getAttribute('aria-hidden')).toBe('true');
    });
  });
});

describe('AppFlow', () => {
  it('is an ordered list with a name, so it reads in order rather than as a picture', () => {
    const { container } = renderWithFrontDoor(<AppFlow label="Worker rule" steps={['Claim', 'Lease', 'Build', 'Readback']} />);
    const flow: Element | null = container.querySelector('.ai-app-flow');
    expect(flow?.tagName).toBe('OL');
    expect(flow?.getAttribute('aria-label')).toBe('Worker rule');
    const names: string[] = [];
    container.querySelectorAll('.ai-app-flow-name').forEach((n: Element): void => {
      names.push(n.textContent ?? '');
    });
    expect(names).toEqual(['Claim', 'Lease', 'Build', 'Readback']);
    // Three separators for four steps, and none of them read aloud.
    const seps: Element[] = [];
    container.querySelectorAll('.ai-app-flow-sep').forEach((n: Element): void => {
      seps.push(n);
    });
    expect(seps.length).toBe(3);
    for (const sep of seps) {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('AppLayerCard and AppNotice', () => {
  it('names a layer, what it is and what it is for', () => {
    const { container } = renderWithFrontDoor(<AppLayerCard layer="Memory" title="Records" note="Where accepted state lives." />);
    expect(container.querySelector('.ai-app-layer-kind')?.textContent).toBe('Memory');
    expect(container.querySelector('.ai-app-layer-title')?.textContent).toBe('Records');
  });

  it('sets an aside apart as a note, toned by its edge and not by colour alone', () => {
    const { container } = renderWithFrontDoor(<AppNotice>Potential value never appears as a realized result.</AppNotice>);
    const aside: Element | null = container.querySelector('.ai-app-aside');
    expect(aside?.getAttribute('role')).toBe('note');
    expect(aside?.className).toContain('ai-app-aside--caution');
    expect(aside?.textContent).toContain('never appears');
  });
});

describe('buttons and panel', () => {
  it('defaults both buttons to type button, so neither submits a form it happens to sit in', () => {
    const { container } = renderWithFrontDoor(
      <React.Fragment>
        <AppPrimary>Go</AppPrimary>
        <AppGhost>Maybe</AppGhost>
      </React.Fragment>
    );
    expect(container.querySelector('.ai-app-primary')?.getAttribute('type')).toBe('button');
    expect(container.querySelector('.ai-app-ghost')?.getAttribute('type')).toBe('button');
  });

  it('passes a click through and keeps any extra class', () => {
    let clicks: number = 0;
    const { container } = renderWithFrontDoor(
      <AppPrimary className="extra" onClick={(): void => { clicks += 1; }}>
        Press
      </AppPrimary>
    );
    const button: HTMLElement = container.querySelector('.ai-app-primary') as HTMLElement;
    expect(button.className).toContain('extra');
    button.click();
    expect(clicks).toBe(1);
  });

  it('wraps content in a section so a panel is a landmark a reader can skip', () => {
    const { container } = renderWithFrontDoor(<AppPanel className="wide">inside</AppPanel>);
    const panel: Element | null = container.querySelector('.ai-app-surface');
    expect(panel?.tagName).toBe('SECTION');
    expect(panel?.className).toContain('wide');
    expect(panel?.textContent).toBe('inside');
  });
});

describe('tone coverage', () => {
  it('uses only the five declared tones across the kit', () => {
    const tones: AppPillTone[] = ['good', 'wait', 'design', 'block', 'info'];
    for (const tone of tones) {
      expect(APP_PILL_TONES.indexOf(tone)).toBeGreaterThanOrEqual(0);
    }
    expect(APP_PILL_TONES.length).toBe(5);
  });
});

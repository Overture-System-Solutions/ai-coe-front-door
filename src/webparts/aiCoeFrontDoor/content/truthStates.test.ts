import * as fs from 'fs';
import * as path from 'path';
import { createBranding } from '../branding/branding';
import {
  ACTIVATION_STATES,
  CANONICAL_STATUS,
  CHROME_PILLS,
  KPI_PLACEHOLDERS,
  KPI_STATES,
  PILOT_STATUSES,
  STATUS_UNAVAILABLE,
  TRUTH_STATES,
  activationLabel,
  chromeLabel,
  describeRequestStatus,
  kpiPlaceholderLabel,
  readCanonicalStatus,
  readState,
  requestStatusLook,
  toPlainRequestStatus,
  truthStateDefinition,
  truthStateLabel
} from './truthStates';
import type { ActivationCode, ChromePillKey, IRequestStatusLook, TruthStateKey } from './truthStates';
import { pageIcon } from './pageIcons';
import { Lightbulb } from '../icons';
import type { IVocabulary } from './pageContent';

const GENERATED_STYLESHEET: string = path.resolve(process.cwd(), 'src/webparts/aiCoeFrontDoor/styles/tailwind.generated.global.scss');

const PLAYBOOK_DEFINITIONS: { [key: string]: string } = {
  draftOnly: 'the output is prepared but has not been sent, posted or published.',
  needsApproval: 'a named person must decide.',
  needsAccess: 'the source or tool is not currently available to this person.',
  notSupported: 'use the stated fallback; do not improvise.'
};

const PLAIN_LABELS: { [code: string]: string } = {
  'Submitted - Pilot': 'Received',
  READY_FOR_TRIAGE: 'Received',
  'In Review - Pilot': 'In review',
  EVIDENCE_BUILDING: 'In review',
  NOT_DECISION_READY: 'In review',
  DECISION_READY: 'In review',
  'Closed - Pilot': 'Closed',
  RETIRED: 'Closed',
  'Test Failed': 'Needs attention',
  BLOCKED: 'Needs attention',
  DRAFT: 'Draft',
  CLARIFYING: 'We need a little more from you',
  AWAITING_SOURCE: 'Waiting on someone else',
  AWAITING_SME: 'Waiting on someone else',
  AWAITING_OWNER: 'Waiting on someone else',
  AWAITING_PERMISSION: 'Waiting on someone else',
  READY_FOR_AI_COE: 'Ready for a decision',
  READY_FOR_ARB: 'Ready for a decision',
  READY_FOR_ELT: 'Ready for a decision',
  APPROVED: 'Decided',
  APPROVED_WITH_CONDITIONS: 'Decided',
  DEFERRED: 'Decided',
  REJECTED: 'Decided',
  PROJECT_ACTIVATING: 'Under way',
  IN_DELIVERY: 'Under way',
  AT_RISK: 'Under way, at risk',
  VALUE_REVIEW: 'In use',
  OPERATING: 'In use',
  IMPROVEMENT_PROPOSED: 'In use',
  REVALIDATION_REQUIRED: 'Needs a re-check'
};

function vocabularyWith(partial: Partial<IVocabulary>): IVocabulary {
  return { truthStates: {}, requestStatuses: {}, chrome: {}, roles: {}, telemetry: {}, ...partial };
}

describe('truth states', () => {
  it('lists the five playbook states in order with their labels, icons and tones', () => {
    expect(TRUTH_STATES.map((state): TruthStateKey => state.key)).toEqual(['availableNow', 'draftOnly', 'needsApproval', 'needsAccess', 'notSupported']);
    expect(TRUTH_STATES.map((state): string => state.label)).toEqual(['Available now', 'Draft only', 'Needs approval', 'Needs access', 'Not supported']);
    expect(TRUTH_STATES.map((state): string => state.icon)).toEqual(['CircleCheck', 'Save', 'Clock3', 'ShieldAlert', 'X']);
    expect(TRUTH_STATES.map((state): string => state.tone)).toEqual(['green', 'blue', 'amber', 'amber', 'red']);
  });

  it('names the organization environment in the Available now definition', () => {
    expect(truthStateDefinition('availableNow', createBranding('Contoso'))).toBe('proved in the current Contoso environment and permitted for this person.');
    expect(truthStateDefinition('availableNow', createBranding(''))).toBe('proved in the current the organization environment and permitted for this person.');
    expect(truthStateDefinition('availableNow', undefined)).toBe('proved in the current the organization environment and permitted for this person.');
    expect(TRUTH_STATES[0].definition(createBranding('Contoso'))).toBe('proved in the current Contoso environment and permitted for this person.');
  });

  it('keeps the other four definitions as the playbook wrote them', () => {
    for (const key of Object.keys(PLAYBOOK_DEFINITIONS)) {
      expect(truthStateDefinition(key as TruthStateKey, createBranding('Contoso'))).toBe(PLAYBOOK_DEFINITIONS[key]);
    }
  });

  it('lets the document vocabulary override a label or a definition, blank keeps the default', () => {
    expect(truthStateLabel('needsAccess')).toBe('Needs access');
    const vocabulary: IVocabulary = vocabularyWith({
      truthStates: { needsAccess: { label: 'Ask for access', definition: 'ask the {organization} service desk.' }, draftOnly: { label: '' } }
    });
    expect(truthStateLabel('needsAccess', vocabulary)).toBe('Ask for access');
    expect(truthStateLabel('draftOnly', vocabulary)).toBe('Draft only');
    expect(truthStateLabel('availableNow', vocabulary)).toBe('Available now');
    expect(truthStateDefinition('needsAccess', createBranding('Contoso'), vocabulary)).toBe('ask the Contoso service desk.');
    expect(truthStateDefinition('draftOnly', createBranding('Contoso'), vocabulary)).toBe(PLAYBOOK_DEFINITIONS.draftOnly);
  });

  it('reads a truth key or an activation code and nothing else', () => {
    expect(readState('availableNow')).toBe('availableNow');
    expect(readState(' notSupported ')).toBe('notSupported');
    expect(readState('AVAILABLE')).toBe('AVAILABLE');
    expect(readState('RETIRED')).toBe('RETIRED');
    expect(readState('bogus')).toBeUndefined();
    expect(readState('available')).toBeUndefined();
    expect(readState('')).toBeUndefined();
    expect(readState(undefined)).toBeUndefined();
    expect(readState(3)).toBeUndefined();
    expect(ACTIVATION_STATES).toEqual(['DESIGNED', 'QUALIFIED', 'AVAILABLE', 'ACTIVE', 'PAUSED', 'RETIRED']);
  });

  it('labels activation codes and leaves a retired one unrendered', () => {
    const labels: { [code in ActivationCode]: string | undefined } = {
      DESIGNED: 'Coming: not yet enabled',
      QUALIFIED: 'Coming: not yet enabled',
      AVAILABLE: 'Available now',
      ACTIVE: 'Available now',
      PAUSED: 'Paused',
      RETIRED: undefined
    };
    for (const code of ACTIVATION_STATES) {
      expect(activationLabel(code)).toBe(labels[code]);
    }
    expect(activationLabel('AVAILABLE', vocabularyWith({ truthStates: { availableNow: { label: 'Ready to use' } } }))).toBe('Ready to use');
  });
});

describe('chrome pills', () => {
  it('lists the three chrome states with their labels, icons and tones', () => {
    expect(CHROME_PILLS.map((pill): ChromePillKey => pill.key)).toEqual(['example', 'needsRefresh', 'awaitingSource']);
    expect(CHROME_PILLS.map((pill): string => pill.label)).toEqual(['Example', 'Needs refresh', 'Awaiting source']);
    expect(CHROME_PILLS.map((pill): string => pill.icon)).toEqual(['Info', 'RefreshCw', 'Clock3']);
    expect(CHROME_PILLS.map((pill): string => pill.tone)).toEqual(['blue', 'amber', 'amber']);
  });

  it('lets the document vocabulary override a chrome label, blank keeps the default', () => {
    expect(chromeLabel('example')).toBe('Example');
    expect(chromeLabel('needsRefresh')).toBe('Needs refresh');
    expect(chromeLabel('awaitingSource')).toBe('Awaiting source');
    const vocabulary: IVocabulary = vocabularyWith({ chrome: { example: 'Sample only', needsRefresh: '' } });
    expect(chromeLabel('example', vocabulary)).toBe('Sample only');
    expect(chromeLabel('needsRefresh', vocabulary)).toBe('Needs refresh');
    expect(chromeLabel('awaitingSource', vocabulary)).toBe('Awaiting source');
  });
});

describe('plain request statuses', () => {
  it('reads a canonical status code, trimmed, and nothing else (a case card needs one)', () => {
    expect(readCanonicalStatus(' AWAITING_SOURCE ')).toBe('AWAITING_SOURCE');
    for (const code of CANONICAL_STATUS) {
      expect(readCanonicalStatus(code)).toBe(code);
    }
    for (const value of (PILOT_STATUSES as unknown[]).concat(['awaiting_source', 'SHIPPED', '', '  ', undefined, null, 7, ['DRAFT']])) {
      expect({ value, code: readCanonicalStatus(value) }).toEqual({ value, code: undefined });
    }
  });

  it('walks the four pilot words and all 26 canonical codes without an unavailable status', () => {
    expect(PILOT_STATUSES).toEqual(['Submitted - Pilot', 'In Review - Pilot', 'Closed - Pilot', 'Test Failed']);
    expect(CANONICAL_STATUS).toHaveLength(26);
    expect(CANONICAL_STATUS.slice(0, 3)).toEqual(['DRAFT', 'CLARIFYING', 'AWAITING_SOURCE']);
    expect(CANONICAL_STATUS[CANONICAL_STATUS.length - 1]).toBe('RETIRED');
    for (const code of PILOT_STATUSES.concat(CANONICAL_STATUS)) {
      expect(PLAIN_LABELS[code]).toBeDefined();
      expect(toPlainRequestStatus(code)).toBe(PLAIN_LABELS[code]);
      expect(toPlainRequestStatus(code)).not.toBe(STATUS_UNAVAILABLE);
    }
    expect(Object.keys(PLAIN_LABELS)).toHaveLength(30);
  });

  it('answers Status unavailable for anything else and trims what it reads', () => {
    expect(STATUS_UNAVAILABLE).toBe('Status unavailable');
    expect(toPlainRequestStatus('bogus')).toBe('Status unavailable');
    expect(toPlainRequestStatus('')).toBe('Status unavailable');
    expect(toPlainRequestStatus(undefined)).toBe('Status unavailable');
    expect(toPlainRequestStatus(null)).toBe('Status unavailable');
    expect(toPlainRequestStatus(7)).toBe('Status unavailable');
    expect(toPlainRequestStatus(' APPROVED ')).toBe('Decided');
    expect(toPlainRequestStatus('approved')).toBe('Status unavailable');
  });

  it('lets the vocabulary rename a code and appends the code on the operator plane only', () => {
    const vocabulary: IVocabulary = vocabularyWith({ requestStatuses: { BLOCKED: 'Stuck', UNKNOWN_CODE: 'Custom' } });
    expect(toPlainRequestStatus('BLOCKED', vocabulary)).toBe('Stuck');
    expect(toPlainRequestStatus('UNKNOWN_CODE', vocabulary)).toBe('Custom');
    expect(toPlainRequestStatus('DRAFT', vocabulary)).toBe('Draft');
    expect(describeRequestStatus('AT_RISK', 'user')).toBe('Under way, at risk');
    expect(describeRequestStatus('AT_RISK', 'operator')).toBe('Under way, at risk (AT_RISK)');
    expect(describeRequestStatus('bogus', 'operator')).toBe('Status unavailable (bogus)');
    expect(describeRequestStatus('', 'operator')).toBe('Status unavailable');
    expect(describeRequestStatus(undefined, 'user')).toBe('Status unavailable');
  });

  it('gives every status a pill tone and a shipped icon shape, so a status never rests on colour alone', () => {
    const expectedTones: { [code: string]: IRequestStatusLook['tone'] } = {
      'Submitted - Pilot': 'blue',
      READY_FOR_TRIAGE: 'blue',
      DRAFT: 'blue',
      'In Review - Pilot': 'amber',
      EVIDENCE_BUILDING: 'amber',
      CLARIFYING: 'amber',
      AWAITING_SME: 'amber',
      READY_FOR_ELT: 'amber',
      REVALIDATION_REQUIRED: 'amber',
      'Closed - Pilot': 'green',
      RETIRED: 'green',
      APPROVED: 'green',
      REJECTED: 'green',
      IN_DELIVERY: 'green',
      OPERATING: 'green',
      'Test Failed': 'red',
      BLOCKED: 'red',
      AT_RISK: 'red'
    };
    for (const code of Object.keys(expectedTones)) {
      expect({ code, tone: requestStatusLook(code).tone }).toEqual({ code, tone: expectedTones[code] });
    }
    for (const code of PILOT_STATUSES.concat(CANONICAL_STATUS)) {
      const look: IRequestStatusLook = requestStatusLook(code);
      expect(['green', 'blue', 'amber', 'red']).toContain(look.tone);
      // An unknown icon name would fall back to the light bulb; every status names a shipped icon.
      expect(pageIcon(look.icon)).not.toBe(Lightbulb);
    }
    // Anything unknown is amber with a question mark: something to look at, not a failure and not a success.
    expect(requestStatusLook('bogus')).toEqual({ tone: 'amber', icon: 'CircleQuestionMark' });
    expect(requestStatusLook(undefined)).toEqual({ tone: 'amber', icon: 'CircleQuestionMark' });
    expect(requestStatusLook(' Submitted - Pilot ')).toEqual({ tone: 'blue', icon: 'Inbox' });
  });
});

describe('measure placeholders', () => {
  it('shows a number only for a measured value and never turns a blank into zero', () => {
    expect(KPI_STATES).toEqual(['MEASURED', 'NOT_ESTABLISHED', 'PENDING_BASELINE', 'NOT_AVAILABLE', 'INSUFFICIENT_VOLUME']);
    expect(KPI_PLACEHOLDERS).toEqual({
      NOT_ESTABLISHED: 'Not established',
      PENDING_BASELINE: 'Pending baseline',
      NOT_AVAILABLE: 'Not available',
      INSUFFICIENT_VOLUME: 'Not shown: group too small'
    });
    expect(kpiPlaceholderLabel('MEASURED', 42)).toBe('42');
    expect(kpiPlaceholderLabel('MEASURED', 0)).toBe('0');
    expect(kpiPlaceholderLabel('MEASURED', 12.5)).toBe('12.5');
    expect(kpiPlaceholderLabel('MEASURED', undefined)).toBe('Not available');
    expect(kpiPlaceholderLabel('MEASURED', null)).toBe('Not available');
    expect(kpiPlaceholderLabel('MEASURED', '')).toBe('Not available');
    expect(kpiPlaceholderLabel('MEASURED', 'NaN')).toBe('Not available');
    expect(kpiPlaceholderLabel('NOT_ESTABLISHED', 3)).toBe('Not established');
    expect(kpiPlaceholderLabel('PENDING_BASELINE', undefined)).toBe('Pending baseline');
    expect(kpiPlaceholderLabel('NOT_AVAILABLE', undefined)).toBe('Not available');
    expect(kpiPlaceholderLabel('INSUFFICIENT_VOLUME', 4)).toBe('Not shown: group too small');
    expect(kpiPlaceholderLabel('bogus', 4)).toBe('Not available');
    expect(kpiPlaceholderLabel(undefined, 4)).toBe('Not available');
  });
});

describe('utility-word safety', () => {
  it('keeps every plain label out of the generated utility selectors', () => {
    const css: string = fs.readFileSync(GENERATED_STYLESHEET, 'utf8');
    const selectors: string[] = (css.match(/\.[A-Za-z0-9_\\:-]+/g) ?? []).map((selector: string): string => selector.replace(/\\/g, ''));
    // The generated stylesheet carries over a hundred class tokens; fewer means the extraction broke, not that the labels are safe.
    expect(selectors.length).toBeGreaterThan(100);
    const labels: string[] = TRUTH_STATES.map((state): string => state.label)
      .concat(TRUTH_STATES.map((state): string => state.definition(createBranding(''))))
      .concat(Object.keys(PLAIN_LABELS).map((code: string): string => PLAIN_LABELS[code]))
      .concat(Object.keys(KPI_PLACEHOLDERS).map((code: string): string => KPI_PLACEHOLDERS[code]))
      .concat(ACTIVATION_STATES.map((code: ActivationCode): string => activationLabel(code) ?? ''))
      .concat(CHROME_PILLS.map((pill): string => pill.label))
      .concat([STATUS_UNAVAILABLE]);
    const words: string[] = [];
    for (const label of labels) {
      for (const word of label.split(/[\s:;,.]+/)) {
        if (word !== '') {
          words.push(word);
        }
      }
    }
    expect(words.length).toBeGreaterThan(50);
    for (const word of words) {
      expect(selectors).not.toContain(`.${word}`);
      expect(selectors).not.toContain(`.${word.toLowerCase()}`);
    }
  });
});

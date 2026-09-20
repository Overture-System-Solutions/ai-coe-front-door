import * as React from 'react';
import { pageIcon } from '../content/pageIcons';
import { chromeLabel, chromePill, truthState } from '../content/truthStates';
import type { ChromePillKey, IChromePill, ITruthState, TruthStateKey, TruthTone } from '../content/truthStates';
import type { LucideIcon } from '../icons';
import { includes } from '../utils/collections';

/** A truth state or one of the three chrome states a page draws beside a fact. */
export type PillState = TruthStateKey | ChromePillKey;

const CHROME_KEYS: readonly ChromePillKey[] = ['example', 'needsRefresh', 'awaitingSource'];

export interface IStatusPillProps {
  state: PillState;
  /** Wording that replaces the state's own label (a document vocabulary override, for example); blank keeps the default. */
  label?: string;
  /** The underlying code (a canonical status, an activation code); shown only with `showCode`, on the operator plane. */
  code?: string;
  showCode?: boolean;
}

interface IPillLook {
  label: string;
  icon: string;
  tone: TruthTone;
}

function lookOf(state: PillState): IPillLook {
  if (includes(CHROME_KEYS, state as ChromePillKey)) {
    const chrome: IChromePill = chromePill(state as ChromePillKey);
    return { label: chromeLabel(chrome.key), icon: chrome.icon, tone: chrome.tone };
  }
  const truth: ITruthState = truthState(state as TruthStateKey);
  return { label: truth.label, icon: truth.icon, tone: truth.tone };
}

function trimmed(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A state as text plus an icon shape in a toned span, so the meaning never rests on colour alone.
 * The pill is not interactive and carries no role: it labels the fact next to it.
 */
export function StatusPill({ state, label, code, showCode }: IStatusPillProps): React.ReactElement {
  const look: IPillLook = lookOf(state);
  const Icon: LucideIcon = pageIcon(look.icon);
  const text: string = trimmed(label) === '' ? look.label : trimmed(label);
  const shownCode: string = showCode === true ? trimmed(code) : '';
  return (
    <span className={`ai-pill ai-pill--${look.tone}`}>
      <Icon aria-hidden="true" focusable="false" />
      <span className="ai-pill-label">{text}</span>
      {shownCode !== '' ? <code className="ai-pill-code">{shownCode}</code> : undefined}
    </span>
  );
}

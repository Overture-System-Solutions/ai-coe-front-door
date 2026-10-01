import * as React from 'react';
import { AppPill } from './AppPill';
import type { AppPillTone } from './AppPill';

/**
 * The surfaces of the consolidated view: the white panels everything sits on, and the pieces that live on them.
 *
 * These are the reference prototype's own components, rebuilt as real React rather than copied markup. Each one is
 * small on purpose: the sections of the front door are then composition rather than bespoke layout, which is what
 * went wrong the first time - four one-off components and a flat list style, which is why it looked nothing like
 * the reference.
 *
 * Every colour that carries meaning reads a palette token, so an organization repaints the whole kit from the
 * `Palette` property. Nothing here declares a token and nothing carries a reference-palette literal.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** A titled white surface. Everything on a section sits on one of these. */
export function AppPanel({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return <section className={`ai-app-surface${className === undefined ? '' : ` ${className}`}`}>{children}</section>;
}

/**
 * The heading of a section: a title, a line saying what the reader is looking at, and an optional action on the
 * right. The line is not decoration - it is where a section says what its evidence rests on.
 */
export function AppSectionHead({
  title,
  note,
  action
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="ai-app-head">
      <div className="ai-app-head-text">
        <h3 className="ai-app-head-title">{title}</h3>
        {note !== undefined && <p className="ai-app-head-note">{note}</p>}
      </div>
      {action !== undefined && <div className="ai-app-head-action">{action}</div>}
    </div>
  );
}

export interface IStatusRow {
  label: string;
  note?: string;
  tone: AppPillTone;
  state: string;
}

/**
 * A short list of facts with the state of each: what the prototype uses down the side of its first screen. Each
 * row says the thing, what is known about it, and where it stands, which is the shape a reader can scan.
 */
export function AppStatusCard({ title, rows }: { title: string; rows: readonly IStatusRow[] }): React.ReactElement {
  return (
    <section className="ai-app-surface ai-app-status">
      <h3 className="ai-app-status-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="ai-app-empty">Nothing to report here yet.</p>
      ) : (
        <ul className="ai-app-status-rows">
          {rows.map((row: IStatusRow, index: number): React.ReactElement => (
            <li key={index} className="ai-app-status-row">
              <span className="ai-app-status-text">
                <strong className="ai-app-status-label">{row.label}</strong>
                {row.note !== undefined && <small className="ai-app-status-note">{row.note}</small>}
              </span>
              <AppPill tone={row.tone}>{row.state}</AppPill>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One measure. `value` is whatever the record says, including a placeholder such as "Not established" - the whole
 * point of the reference's value screen is that an absent number is written as absent rather than as zero, so
 * `placeholder` renders it smaller and quieter instead of as a headline figure.
 */
export function AppMetric({
  label,
  value,
  note,
  placeholder
}: {
  label: string;
  value: string;
  note?: string;
  placeholder?: boolean;
}): React.ReactElement {
  return (
    <li className="ai-app-surface ai-app-metric">
      <span className="ai-app-metric-label">{label}</span>
      <span className={`ai-app-metric-value${placeholder === true ? ' ai-app-metric-value--placeholder' : ''}`}>{value}</span>
      {note !== undefined && <span className="ai-app-metric-note">{note}</span>}
    </li>
  );
}

export interface IAppCase {
  reference: string;
  title: string;
  summary: string;
  tone: AppPillTone;
  state: string;
  /** Short facts about the record, each shown as a chip. */
  facts?: readonly string[];
  next?: string;
  caveat?: string;
  /** The record this card stands for (1.0.0.18); the title opens it in a new tab. */
  href?: string;
}

/** One record, as the reference draws it: a reference, a state, what it is, what is known, and what happens next. */
export function AppCaseCard({ item }: { item: IAppCase }): React.ReactElement {
  return (
    <li className="ai-app-surface ai-app-case">
      <span className="ai-app-case-top">
        <span className="ai-app-case-ref">{item.reference}</span>
        <AppPill tone={item.tone}>{item.state}</AppPill>
      </span>
      <h4 className="ai-app-case-title">
        {item.href === undefined ? (
          item.title
        ) : (
          <a className="ai-app-case-link" href={item.href} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        )}
      </h4>
      <p className="ai-app-case-summary">{item.summary}</p>
      {item.facts !== undefined && item.facts.length > 0 && (
        <span className="ai-app-case-facts">
          {item.facts.map((fact: string, index: number): React.ReactElement => (
            <span key={index} className="ai-app-chip">
              {fact}
            </span>
          ))}
        </span>
      )}
      {(item.next !== undefined || item.caveat !== undefined) && (
        <span className="ai-app-case-foot">
          <span>{item.next ?? ''}</span>
          <span>{item.caveat ?? ''}</span>
        </span>
      )}
    </li>
  );
}

export interface IAppStep {
  marker: string;
  title: string;
  note: string;
  tone: AppPillTone;
  state: string;
}

/** A short ordered set of things, each with where it stands: the reference's own way of showing a contract. */
export function AppSteps({ steps }: { steps: readonly IAppStep[] }): React.ReactElement {
  return (
    <ul className="ai-app-steps">
      {steps.map((step: IAppStep, index: number): React.ReactElement => (
        <li key={index} className="ai-app-step">
          <span className="ai-app-step-marker" aria-hidden="true">
            {step.marker}
          </span>
          <span className="ai-app-step-text">
            <strong className="ai-app-step-title">{step.title}</strong>
            <small className="ai-app-step-note">{step.note}</small>
          </span>
          <AppPill tone={step.tone}>{step.state}</AppPill>
        </li>
      ))}
    </ul>
  );
}

/**
 * A path drawn as a row of names with separators between them. It is a list rather than a picture, so a screen
 * reader reads it in order and a narrow screen wraps it instead of scrolling.
 */
export function AppFlow({ steps, label }: { steps: readonly string[]; label: string }): React.ReactElement {
  return (
    <ol className="ai-app-flow" aria-label={label}>
      {steps.map((step: string, index: number): React.ReactElement => (
        <li key={index} className="ai-app-flow-step">
          <span className="ai-app-flow-name">{step}</span>
          {index < steps.length - 1 && (
            <span className="ai-app-flow-sep" aria-hidden="true">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** One layer of the system map: what it is called, what it holds, and what it is for. */
export function AppLayerCard({ layer, title, note }: { layer: string; title: string; note: string }): React.ReactElement {
  return (
    <li className="ai-app-surface ai-app-layer">
      <span className="ai-app-layer-kind">{layer}</span>
      <h4 className="ai-app-layer-title">{title}</h4>
      <p className="ai-app-layer-note">{note}</p>
    </li>
  );
}

/** An aside set apart from the prose, toned by its left edge and never by colour alone. */
export function AppNotice({ tone, children }: { tone?: 'info' | 'caution'; children: React.ReactNode }): React.ReactElement {
  return (
    <p className={`ai-app-aside ai-app-aside--${tone ?? 'caution'}`} role="note">
      {children}
    </p>
  );
}

/** The two buttons the kit offers: one that carries the accent, one that does not. */
export function AppPrimary(props: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  const { className, type, ...rest } = props;
  return <button type={type === undefined ? 'button' : type} className={`ai-app-primary${className === undefined ? '' : ` ${className}`}`} {...rest} />;
}

export function AppGhost(props: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  const { className, type, ...rest } = props;
  return <button type={type === undefined ? 'button' : type} className={`ai-app-ghost${className === undefined ? '' : ` ${className}`}`} {...rest} />;
}

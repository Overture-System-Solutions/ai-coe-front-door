import * as React from 'react';
import { useFrontDoor } from '../../context/FrontDoorContext';
import {
  CASE_ANALYSIS_MAX_CASES,
  CASE_ANALYSIS_QUESTION_LIMIT,
  CaseAnalysisError,
  caseAnalysisFailureText,
  DEFAULT_CASE_ANALYSIS_QUESTION
} from '../../services/caseAnalysisService';
import type { ICaseAnalysisResult, ICasePriority } from '../../services/caseAnalysisService';
import { AppCaseCard, AppGhost, AppNotice, AppPanel, AppPrimary, AppSectionHead } from './kit';

/**
 * The leaders' question to Claude about the open business cases, on the Cases tab.
 *
 * The button starts from a suggested question the leader may change, sends only that question to the case analysis
 * flow, and shows what came back: a short summary, the cases to look at first (each cited by its reference), and the
 * patterns and gaps Claude saw. The flow reads the records itself and hands Claude their structured fields only, so
 * nothing a submitter wrote beyond a title is sent. The answer is labelled as a draft for discussion: it decides
 * nothing and changes no record.
 *
 * The shell draws this panel only for a role that holds `analyzeCasePortfolio`; the service behind it refuses the
 * call for anyone else, before a request is built.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

type AnalysisState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'done'; result: ICaseAnalysisResult }
  | { status: 'failed'; message: string };

export const CASE_ANALYSIS_UNBOUND_TEXT: string =
  'Case analysis is not connected on this site yet. A site owner binds the case analysis flow in the web part settings.';

const QUESTION_ID: string = 'ai-case-analysis-question';

function readableTime(value: string): string {
  const date: Date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

/** Who wrote the answer and from what, said once under it. */
function provenanceNote(result: ICaseAnalysisResult): string {
  const source: string =
    result.provenance.provider === 'anthropic'
      ? `Drafted by Claude${result.provenance.model === '' ? '' : ` (${result.provenance.model})`}`
      : 'Simulated in the offline preview; no model was called';
  const read: string = `from ${result.caseCount} open business case${result.caseCount === 1 ? '' : 's'} read ${readableTime(result.asOf)}`;
  const cap: string = result.truncated ? ` Only the ${CASE_ANALYSIS_MAX_CASES} most recently updated open cases were read.` : '';
  return `${source} ${read}. Only structured fields were sent, never request text.${cap} A draft for discussion: check the records before acting on it.`;
}

/** The sentences of one paragraph, each keeping its closing mark and any quote or bracket after it. */
function sentencesOf(paragraph: string): string[] {
  const found: string[] = paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [paragraph];
  return found.map((sentence: string): string => sentence.trim()).filter((sentence: string): boolean => sentence !== '');
}

/**
 * The summary as short paragraphs (1.0.0.18): Claude's own paragraph breaks are kept, and a paragraph of more than two
 * sentences is broken into paragraphs of two, so a long answer reads as several short blocks rather than one wall.
 */
export function summaryParagraphs(summary: string): string[] {
  const paragraphs: string[] = [];
  for (const block of summary.split(/\n+/)) {
    const sentences: string[] = sentencesOf(block.trim());
    for (let start: number = 0; start < sentences.length; start += 2) {
      paragraphs.push(sentences.slice(start, start + 2).join(' '));
    }
  }
  return paragraphs.length > 0 ? paragraphs : [summary];
}

/** Links to the cases the analysis names, read once per answer; a case the reader cannot open stays unlinked. */
function useCaseLinks(references: readonly string[]): { [reference: string]: string } {
  const { services } = useFrontDoor();
  const read = services.myWork?.caseLinks?.bind(services.myWork);
  const [links, setLinks] = React.useState<{ [reference: string]: string }>({});
  const key: string = references.join('|');
  React.useEffect((): (() => void) => {
    let cancelled: boolean = false;
    setLinks({});
    if (read !== undefined && references.length > 0) {
      read(references).then(
        (found: { [reference: string]: string }): void => {
          if (!cancelled) {
            setLinks(found);
          }
        },
        (): void => undefined
      );
    }
    return (): void => {
      cancelled = true;
    };
    // The references are read again only when the answer names other cases.
  }, [key]);
  return links;
}

function AnalysisAnswer({ result }: { result: ICaseAnalysisResult }): React.ReactElement {
  const analysis: ICaseAnalysisResult['analysis'] = result.analysis;
  const links: { [reference: string]: string } = useCaseLinks(analysis === undefined ? [] : analysis.priorities.map((priority: ICasePriority): string => priority.coeId));
  if (analysis === undefined) {
    return <AppNotice tone="info">There are no open business cases to analyze right now.</AppNotice>;
  }
  // A fragment rather than a wrapper, so the first heading keeps the space above it that a first child loses.
  return (
    <React.Fragment>
      <h4 className="ai-app-subheading">Claude&apos;s analysis</h4>
      <div className="ai-app-analysis-summary">
        {summaryParagraphs(analysis.summary).map((paragraph: string, index: number): React.ReactElement => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {analysis.priorities.length > 0 && (
        <React.Fragment>
          <h4 className="ai-app-subheading">Look at these first</h4>
          <ol className="ai-app-threes" aria-label="Cases to look at first">
            {analysis.priorities.map(
              (priority: ICasePriority, index: number): React.ReactElement => (
                <AppCaseCard
                  key={`${priority.coeId}-${index}`}
                  item={{
                    reference: priority.coeId,
                    title: priority.title,
                    summary: priority.whyItMatters,
                    tone: 'info',
                    state: `Rank ${index + 1}`,
                    next: `Next: ${priority.suggestedNextStep}`,
                    ...(links[priority.coeId] === undefined ? {} : { href: links[priority.coeId] })
                  }}
                />
              )
            )}
          </ol>
        </React.Fragment>
      )}
      {(analysis.patterns.length > 0 || analysis.gaps.length > 0) && (
        <div className="ai-app-split ai-app-analysis-lists">
          {analysis.patterns.length > 0 && (
            <AppPanel>
              <h4 className="ai-app-subheading">Patterns</h4>
              <ul className="ai-app-list">
                {analysis.patterns.map((pattern: string, index: number): React.ReactElement => (
                  <li key={index}>{pattern}</li>
                ))}
              </ul>
            </AppPanel>
          )}
          {analysis.gaps.length > 0 && (
            <AppPanel>
              <h4 className="ai-app-subheading">What the records cannot tell you</h4>
              <ul className="ai-app-list">
                {analysis.gaps.map((gap: string, index: number): React.ReactElement => (
                  <li key={index}>{gap}</li>
                ))}
              </ul>
            </AppPanel>
          )}
        </div>
      )}
    </React.Fragment>
  );
}

export function AppCaseAnalysis(): React.ReactElement {
  const { services } = useFrontDoor();
  const service: typeof services.caseAnalysis = services.caseAnalysis;
  const [question, setQuestion] = React.useState<string>(DEFAULT_CASE_ANALYSIS_QUESTION);
  const [state, setState] = React.useState<AnalysisState>({ status: 'idle' });
  const mounted: React.MutableRefObject<boolean> = React.useRef<boolean>(true);

  React.useEffect((): (() => void) => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);

  const asking: boolean = state.status === 'asking';
  const trimmed: string = question.trim();

  const ask = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (service === undefined || asking || trimmed === '') {
        return;
      }
      setState({ status: 'asking' });
      service.analyze(trimmed).then(
        (result: ICaseAnalysisResult): void => {
          if (mounted.current) {
            setState({ status: 'done', result });
          }
        },
        (error: unknown): void => {
          if (mounted.current) {
            setState({ status: 'failed', message: caseAnalysisFailureText(error instanceof CaseAnalysisError ? error.kind : 'unavailable') });
          }
        }
      );
    },
    [service, asking, trimmed]
  );

  return (
    <AppPanel className="ai-case-workspace ai-case-analysis">
      <AppSectionHead
        title="Analyze the most important cases"
        note="For leaders. Claude reads the structured fields of the open business cases, never the request text, and ranks what to look at first."
      />
      {service === undefined ? (
        <AppNotice tone="info">{CASE_ANALYSIS_UNBOUND_TEXT}</AppNotice>
      ) : (
        <React.Fragment>
          <form onSubmit={ask}>
            <div className="ai-case-field ai-case-field--wide">
              <label htmlFor={QUESTION_ID}>Your question to Claude</label>
              <textarea
                id={QUESTION_ID}
                value={question}
                maxLength={CASE_ANALYSIS_QUESTION_LIMIT}
                rows={4}
                disabled={asking}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => setQuestion(event.target.value)}
              />
              <p className="ai-case-help">{`${question.length} of ${CASE_ANALYSIS_QUESTION_LIMIT} characters. Start from the suggested question or write your own.`}</p>
            </div>
            <div className="ai-app-actions">
              <AppPrimary type="submit" disabled={asking || trimmed === ''}>
                {asking ? 'Asking Claude…' : 'Ask Claude'}
              </AppPrimary>
              <AppGhost disabled={asking || question === DEFAULT_CASE_ANALYSIS_QUESTION} onClick={(): void => setQuestion(DEFAULT_CASE_ANALYSIS_QUESTION)}>
                Use the suggested question
              </AppGhost>
            </div>
          </form>
          <div className="ai-case-feedback" aria-live="polite">
            {asking && 'Reading the open business cases and asking Claude. This can take up to a minute.'}
          </div>
          {state.status === 'failed' && <AppNotice>{state.message}</AppNotice>}
          {state.status === 'done' && (
            <React.Fragment>
              <AnalysisAnswer result={state.result} />
              <p className="ai-app-note">{provenanceNote(state.result)}</p>
            </React.Fragment>
          )}
        </React.Fragment>
      )}
    </AppPanel>
  );
}

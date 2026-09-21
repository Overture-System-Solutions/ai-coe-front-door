import * as React from 'react';
import { formatMeasure } from '../../content/measures';
import { useFrontDoor } from '../../context/FrontDoorContext';
import type { IProgramMeasure, IProgramMeasuresResult } from '../../services/programMeasuresService';

/**
 * The measured view: one tile per measure an operator has recorded, with the evidence behind it.
 *
 * The rule this screen exists to keep is that a measure nobody has recorded shows what it is waiting for, never a
 * number and never a zero. `formatMeasure` already carries that rule, including holding back a measure whose
 * cohort is too small to show without identifying someone, so this component reads rows and formats them and
 * invents nothing of its own. The prototype's sample figures are deliberately not reproduced: a figure on this
 * screen means a row exists with evidence behind it.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** Below this many people a measure is held back, matching the content document's own default. */
const MINIMUM_COHORT: number = 5;

type LoadState = { status: 'loading' } | { status: 'ready'; result: IProgramMeasuresResult };

export function AppValue(): React.ReactElement {
  const { services } = useFrontDoor();
  const service: typeof services.programMeasures = services.programMeasures;
  const [state, setState] = React.useState<LoadState>(service === undefined ? { status: 'ready', result: { state: 'unavailable', measures: {}, message: 'Measures unavailable: the measures list could not be read.' } } : { status: 'loading' });

  React.useEffect((): (() => void) => {
    if (service === undefined) {
      return (): void => undefined;
    }
    let cancelled: boolean = false;
    service.getMeasures().then(
      (result: IProgramMeasuresResult): void => {
        if (!cancelled) {
          setState({ status: 'ready', result });
        }
      },
      (): void => {
        if (!cancelled) {
          setState({ status: 'ready', result: { state: 'unavailable', measures: {}, message: 'Measures unavailable: the measures list could not be read.' } });
        }
      }
    );
    return (): void => {
      cancelled = true;
    };
  }, [service]);

  if (state.status === 'loading') {
    return <p className="ai-app-note">Reading the measures…</p>;
  }
  const result: IProgramMeasuresResult = state.result;
  const rows: IProgramMeasure[] = Object.keys(result.measures).map((id: string): IProgramMeasure => result.measures[id]);
  if (result.state !== 'ok') {
    return <p className="ai-app-note">{result.message}</p>;
  }
  if (rows.length === 0) {
    return <p className="ai-app-note">No measure has been recorded yet. A measure appears here once an operator records it with its evidence.</p>;
  }
  return (
    <ul className="ai-app-measures">
      {rows.map((measure: IProgramMeasure): React.ReactElement => (
        <li key={measure.id} className="ai-app-measure">
          <span className="ai-app-measure-label">{measure.title}</span>
          <span className="ai-app-measure-value">{formatMeasure(measure, MINIMUM_COHORT)}</span>
          {measure.evidenceRef === undefined ? undefined : <span className="ai-app-measure-evidence">{`Evidence: ${measure.evidenceRef}`}</span>}
          {measure.periodEnd === undefined ? undefined : <span className="ai-app-measure-period">{`As of ${measure.periodEnd}`}</span>}
        </li>
      ))}
    </ul>
  );
}

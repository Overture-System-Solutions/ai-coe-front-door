import * as React from 'react';
import { formatMeasure } from '../../content/measures';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { AppMetric, AppNotice } from './kit';
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

export function AppValue({ usage }: { usage?: React.ReactNode }): React.ReactElement {
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

  let measures: React.ReactElement;
  if (state.status === 'loading') {
    measures = <p className="ai-app-note">Reading the measures…</p>;
  } else {
    const result: IProgramMeasuresResult = state.result;
    const rows: IProgramMeasure[] = Object.keys(result.measures).map((id: string): IProgramMeasure => result.measures[id]);
    if (result.state !== 'ok') {
      measures = <p className="ai-app-note">{result.message}</p>;
    } else if (rows.length === 0) {
      measures = (
        <p className="ai-app-empty">No measure has been recorded yet. A measure appears here once an operator records it with its evidence.</p>
      );
    } else {
      measures = (
        <React.Fragment>
          <ul className="ai-app-fours">
            {rows.map((measure: IProgramMeasure): React.ReactElement => {
              const shown: string = formatMeasure(measure, MINIMUM_COHORT);
              // Anything that is not a figure is a placeholder, including a measure held back because its cohort is too
              // small to show. Reading the formatted value is what makes that true: deciding from `state` alone let a
              // withheld measure render at headline size, which reads as a result.
              const placeholder: boolean = !/^[0-9]/.test(shown);
              const note: string =
                measure.evidenceRef !== undefined
                  ? `Evidence: ${measure.evidenceRef}`
                  : measure.periodEnd !== undefined
                    ? `As of ${measure.periodEnd}`
                    : 'Evidence required';
              return <AppMetric key={measure.id} label={measure.title} value={shown} note={note} placeholder={placeholder} />;
            })}
          </ul>
          <AppNotice>A potential result never appears as a realized one, and a missing cost is never zero.</AppNotice>
        </React.Fragment>
      );
    }
  }
  return (
    <React.Fragment>
      {measures}
      {usage}
    </React.Fragment>
  );
}

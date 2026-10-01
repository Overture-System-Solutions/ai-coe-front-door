import * as React from 'react';
import { effectiveState, formatMeasure } from '../../../content/measures';
import type { IKpiBlock, IKpiItem } from '../../../content/pageContent';
import { chromeLabel } from '../../../content/truthStates';
import type { KpiState } from '../../../content/truthStates';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import type { OptionalElement } from '../../../controls/render';
import { StatusPill } from '../../../controls/StatusPill';
import type { IProgramMeasure, IProgramMeasuresResult, IProgramMeasuresService } from '../../../services/programMeasuresService';
import { Freshness } from '../Freshness';
import { usePageDocument } from '../PageDocumentContext';

export interface IKpiTilesBlockProps {
  block: IKpiBlock;
}

export const KPI_LOADING_TEXT: string = 'Reading the measures…';
export const EVIDENCE_PREFIX: string = 'Evidence required: ';
export const NO_MEASURES_SERVICE_TEXT: string = 'No measures service is configured.';

/** Where the measures stand for the tiles reading them: on their way, or answered (rows, or nothing worth a number). */
type MeasuresLoadState = { status: 'loading' } | { status: 'ready'; result: IProgramMeasuresResult };

const NO_SERVICE_RESULT: IProgramMeasuresResult = { state: 'unavailable', measures: {}, message: NO_MEASURES_SERVICE_TEXT };

/**
 * Reads the measures once per service. Without a service they are unavailable at once, so the tiles
 * say so rather than waiting for an answer that cannot come. The service answers with a result,
 * never an exception, so a late answer after unmounting is simply dropped.
 */
function useProgramMeasures(service: IProgramMeasuresService | undefined): MeasuresLoadState {
  const [state, setState] = React.useState<MeasuresLoadState>(service === undefined ? { status: 'ready', result: NO_SERVICE_RESULT } : { status: 'loading' });

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
          setState({ status: 'ready', result: { state: 'unavailable', measures: {}, message: '' } });
        }
      }
    );
    return (): void => {
      cancelled = true;
    };
  }, [service]);

  return state;
}

/** The measure of an id the list actually carries; a key of the prototype is no measure. */
function measureOf(state: MeasuresLoadState, id: string): IProgramMeasure | undefined {
  if (state.status !== 'ready' || !Object.prototype.hasOwnProperty.call(state.result.measures, id)) {
    return undefined;
  }
  const measure: IProgramMeasure = state.result.measures[id];
  return measure !== null && typeof measure === 'object' ? measure : undefined;
}

/**
 * The measure tiles of a page. Each tile names one measure of the program measures list and shows
 * what that row says: the number in its unit when the row is measured and carries one, and otherwise
 * the plain placeholder of its state with the evidence the measure is still waiting for. A number is
 * never derived here, a blank never becomes zero, and a measure covering fewer people than the
 * document's minimum is held back whatever its row claims. A list that is absent or unreadable makes
 * every tile read "Not available" and says so once, under the tiles. The measure id and the state
 * code belong to the operator plane; the user plane reads the plain words alone.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export function KpiTilesBlock({ block }: IKpiTilesBlockProps): React.ReactElement {
  const { services } = useFrontDoor();
  const { settings, vocabulary, plane } = usePageDocument();
  const state: MeasuresLoadState = useProgramMeasures(services.programMeasures);
  const loading: boolean = state.status === 'loading';
  const unavailable: boolean = state.status === 'ready' && state.result.state !== 'ok';

  const renderTile = (item: IKpiItem, index: number): React.ReactElement => {
    const measure: IProgramMeasure | undefined = measureOf(state, item.id);
    const shown: KpiState = effectiveState(measure, settings.minimumCohort);
    const measured: boolean = !loading && shown === 'MEASURED';
    const text: string = loading ? KPI_LOADING_TEXT : formatMeasure(measure, settings.minimumCohort);
    const evidence: string | undefined = loading || measured ? undefined : measure?.evidenceNote;
    const period: OptionalElement = measured ? <Freshness asOf={measure?.periodEnd} source={measure?.evidenceRef} /> : null;
    return (
      <article key={`${item.id}-${index}`} className="ai-metric-card">
        <div className="ai-metric-topline">
          <span className="ai-metric-label">{item.label ?? measure?.title ?? item.id}</span>
          {item.illustrative === true && <StatusPill state="example" label={chromeLabel('example', vocabulary)} />}
        </div>
        <strong className={measured ? 'ai-metric-value' : 'ai-metric-value is-pending'}>{text}</strong>
        {evidence !== undefined && (
          <p className="ai-metric-evidence">
            {EVIDENCE_PREFIX}
            {evidence}
          </p>
        )}
        {period}
        {plane === 'operator' && (
          <p className="ai-metric-codes">
            <code className="ai-metric-id">{item.id}</code> <code className="ai-metric-state">{shown}</code>
          </p>
        )}
      </article>
    );
  };

  return (
    <>
      <div className="ai-page-kpi">{block.items.map(renderTile)}</div>
      {unavailable && <p className="ai-page-kpi-note">{block.unavailableText}</p>}
    </>
  );
}

import * as React from 'react';
import { ArrowRight } from '../icons';
import { CONCIERGE_NAME, copyText, openConcierge } from '../services/concierge';
import type { IConcierge } from '../services/concierge';
import { REFERENCE_KEY } from './RouteCard';

/**
 * The next step after a saved submission in the tabbed view (1.0.0.18): continue in the AI CoE Concierge. Opening it
 * copies a line naming the request's reference, so the person can paste it and ask about that request; the chat
 * itself is the concierge's, outside the site.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export const CONCIERGE_CARD_TITLE: string = `Continue in the ${CONCIERGE_NAME}`;

export function ConciergeCard({ concierge, reference }: { concierge: IConcierge; reference?: string }): React.ReactElement {
  const [note, setNote] = React.useState<string | undefined>(undefined);
  const mounted: React.MutableRefObject<boolean> = React.useRef<boolean>(true);
  React.useEffect((): (() => void) => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);

  const go = (): void => {
    openConcierge(concierge.chatUrl);
    if (reference === undefined || reference === '') {
      return;
    }
    copyText(`My AI CoE request ${reference}: `).then(
      (copied: boolean): void => {
        if (mounted.current) {
          setNote(copied ? 'The reference is copied. Paste it into the chat (Ctrl+V) and ask your question.' : 'Quote the reference above in the chat when you ask about this request.');
        }
      },
      (): void => undefined
    );
  };

  return (
    <section className="ai-route-card ai-concierge-card" aria-label={CONCIERGE_CARD_TITLE}>
      <h3 className="ai-route-card-title">{CONCIERGE_CARD_TITLE}</h3>
      {reference !== undefined && reference !== '' && (
        <p className="ai-route-card-reference">
          <span className="ai-route-card-key">{REFERENCE_KEY}</span> <code>{reference}</code>
        </p>
      )}
      <p className="ai-route-card-note">Ask the concierge about this request, or anything else about using AI at work.</p>
      <button type="button" className="ai-route-card-link" onClick={go}>
        {`Open the ${CONCIERGE_NAME}`} <ArrowRight aria-hidden="true" focusable="false" />
      </button>
      {note !== undefined && (
        <p className="ai-route-card-note" role="status">
          {note}
        </p>
      )}
    </section>
  );
}

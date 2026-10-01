/**
 * The AI CoE Concierge (1.0.0.18): the Copilot Studio agent the tabbed view's "Ask the AI CoE" box hands a question
 * to. There is no chat window in the site: the box copies the question and opens the concierge in Microsoft 365
 * Copilot, where the person pastes it, because Copilot offers no supported way to put text into its message box. A
 * second link adds the agent in Teams for someone who has not added it yet.
 *
 * Both links are web part properties, entered by a site owner from the agent's own "Share" and Teams links. Only an
 * https address on a Microsoft Copilot or Teams host is taken, with no credentials in it; anything else leaves the
 * concierge unset, and the page then says so rather than opening an address nobody checked.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

export const CONCIERGE_NAME: string = 'AI CoE Concierge';

/** Set in the browser once the person has been shown the "add it first" message; it is shown once per browser. */
export const CONCIERGE_INTRODUCED_KEY: string = 'overture-ai-coe-front-door:concierge-introduced';

export interface IConcierge {
  /** Opens the concierge chat (Microsoft 365 Copilot). */
  chatUrl: string;
  /** Adds the concierge in Teams, for someone who has not yet. */
  addUrl?: string;
}

/** Microsoft's Copilot and Teams hosts; m365.cloud.microsoft is moving to copilot.cloud.microsoft. */
const CONCIERGE_HOSTS: readonly string[] = ['m365.cloud.microsoft', 'copilot.cloud.microsoft', 'teams.microsoft.com', 'teams.cloud.microsoft'];

function conciergeLink(value: string | undefined): string | undefined {
  const text: string = (value ?? '').trim();
  if (text === '') {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || CONCIERGE_HOSTS.indexOf(url.hostname.toLowerCase()) < 0) {
    return undefined;
  }
  return text;
}

/** The concierge a site set up, or undefined when it has no usable chat link. */
export function parseConcierge(chat?: string, add?: string): IConcierge | undefined {
  const chatUrl: string | undefined = conciergeLink(chat);
  if (chatUrl === undefined) {
    return undefined;
  }
  const addUrl: string | undefined = conciergeLink(add);
  return addUrl === undefined ? { chatUrl } : { chatUrl, addUrl };
}

/** Copies text for pasting; true when the browser confirmed it. Never throws. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Falls through to the older route below.
  }
  try {
    const area: HTMLTextAreaElement = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.opacity = '0';
    area.style.height = '1px';
    area.style.width = '1px';
    document.body.appendChild(area);
    area.select();
    const copied: boolean = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

/** Whether this browser has already been shown the "add it first" message. */
export function conciergeIntroduced(): boolean {
  try {
    return window.localStorage.getItem(CONCIERGE_INTRODUCED_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function markConciergeIntroduced(): void {
  try {
    window.localStorage.setItem(CONCIERGE_INTRODUCED_KEY, 'yes');
  } catch {
    // A browser that keeps nothing shows the message again; nothing else depends on it.
  }
}

/** Opens a concierge link in a new tab, without handing this page to it. */
export function openConcierge(url: string): void {
  window.open(url, '_blank', 'noopener');
}

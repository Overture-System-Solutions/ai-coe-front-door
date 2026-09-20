/**
 * Link targets written in the content document: site paths resolve against the site; anchors,
 * queries, mail addresses and http(s) URLs pass through; every other scheme (`javascript:`, `data:`,
 * `vbscript:`, `tel:`, a protocol-less `//host`) is a dead anchor, since the document is a site
 * file anyone with edit rights can change. A full URL on another origin is off site, which the route
 * list treats as unproved until a tenant receipt says otherwise and the renderer opens in a new
 * tab. `resolveContentHref` is re-exported from pageContent.ts, which remains its documented home.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { resolvePageUrl } from './pageViews';

/** Anchors and queries stay as written; a mail address passes through untouched. */
const PASS_THROUGH: RegExp = /^(#|\?|mailto:)/i;
/** Anything that reads as a URL scheme (letters, digits, `+`, `-`, `.` before the first colon). */
const ANY_SCHEME: RegExp = /^[a-z][a-z0-9+.-]*:/i;
/** The schemes a page link may carry besides `mailto:`. */
const WEB_SCHEME: RegExp = /^https?:/i;
export const DEAD_HREF: string = '#';

/**
 * A link target from the document: site paths resolve against the site; anchors, queries, mail
 * addresses and http(s) URLs pass through; any other scheme, and a protocol-less `//host` path,
 * becomes `#` so it is never appended to the site URL and never reaches an anchor.
 */
export function resolveContentHref(siteUrl: string, href: string): string {
  const text: string = href.trim();
  if (PASS_THROUGH.test(text)) {
    return text;
  }
  if (ANY_SCHEME.test(text) && !WEB_SCHEME.test(text)) {
    return DEAD_HREF;
  }
  if (text.substring(0, 2) === '//') {
    return DEAD_HREF;
  }
  return resolvePageUrl(siteUrl, text) ?? DEAD_HREF;
}

const ORIGIN: RegExp = /^https?:\/\/[^/]+/i;

/** The scheme and host of a full URL, lowercased; undefined for a path, an anchor or a mail address. */
export function originOf(url: string): string | undefined {
  const match: RegExpExecArray | null = ORIGIN.exec(url.trim());
  return match === null ? undefined : match[0].toLowerCase();
}

/** True for a full URL on another origin than the site (another tenant, a vendor, Teams). */
export function isExternalHref(siteUrl: string, href: string): boolean {
  const origin: string | undefined = originOf(href);
  return origin !== undefined && origin !== originOf(siteUrl);
}

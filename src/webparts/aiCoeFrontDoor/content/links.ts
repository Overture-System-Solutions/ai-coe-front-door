/**
 * Link targets written in the content document: site paths resolve against the site; anchors,
 * queries, mail and full URLs pass through; and a full URL on another origin is off site, which the
 * route list treats as unproved until a tenant receipt says otherwise and the renderer opens in a
 * new tab. `resolveContentHref` is re-exported from pageContent.ts, which remains its documented home.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { resolvePageUrl } from './pageViews';

const PASS_THROUGH: RegExp = /^(#|\?|mailto:|tel:)/i;

/** A link target from the document: site paths resolve against the site; anchors, queries, mail and full URLs pass through. */
export function resolveContentHref(siteUrl: string, href: string): string {
  const text: string = href.trim();
  if (PASS_THROUGH.test(text)) {
    return text;
  }
  return resolvePageUrl(siteUrl, text) ?? '#';
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

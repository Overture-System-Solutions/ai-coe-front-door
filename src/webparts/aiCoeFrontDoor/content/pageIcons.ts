/**
 * Icons a page document can name on its tiles: the ones the front door already ships, looked up
 * by their exported name (for example "MessageSquare" or "LayoutDashboard").
 */
import * as icons from '../icons';
import type { LucideIcon } from '../icons';

export const DEFAULT_PAGE_ICON: string = 'Lightbulb';

const ICONS: { [name: string]: unknown } = icons;

function isIcon(value: unknown): value is LucideIcon {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}

/** The shipped icon with that exported name, or the light bulb when the name is unknown. */
export function pageIcon(name: string | undefined): LucideIcon {
  if (name !== undefined && Object.prototype.hasOwnProperty.call(ICONS, name) && isIcon(ICONS[name])) {
    return ICONS[name] as LucideIcon;
  }
  return icons.Lightbulb;
}

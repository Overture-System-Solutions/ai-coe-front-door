/**
 * The component kit of the consolidated view, in one place so a section is composition rather than bespoke layout.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export { APP_PILL_TONES, AppPill } from './AppPill';
export type { AppPillTone, IAppPillProps } from './AppPill';
export {
  AppCaseCard,
  AppFlow,
  AppGhost,
  AppLayerCard,
  AppMetric,
  AppNotice,
  AppPanel,
  AppPrimary,
  AppSectionHead,
  AppStatusCard,
  AppSteps
} from './AppSurfaces';
export type { IAppCase, IAppStep, IStatusRow } from './AppSurfaces';

import * as React from 'react';
import styles from '../AiCoeFrontDoor.module.scss';
import type { IBranding } from '../branding/branding';
import type { IPageViewSettings } from '../content/pageViews';
import type { TelemetryProvider } from '../content/telemetryTiles';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import { FrontDoorProvider } from '../context/FrontDoorContext';
import type { IFrontDoorContextValue, IFrontDoorServices, IFrontDoorUser } from '../context/FrontDoorContext';
import { SubmissionProvider } from '../context/SubmissionContext';
import type { Navigate } from '../services/navigation';
import { FrontDoorShell } from './FrontDoorShell';
import { PageViewShell } from './PageViewShell';

export interface IAiCoeFrontDoorProps {
  isDarkTheme: boolean;
  branding: IBranding;
  siteUrl: string;
  user: IFrontDoorUser;
  isAdmin: boolean;
  telemetryProvider: TelemetryProvider;
  /** Created once by the web part so effects keyed on the services do not re-run on every render. */
  services: IFrontDoorServices;
  /** Which piece this instance renders; absent or legacy means the whole front door on one page, as shipped. */
  pageView?: IPageViewSettings;
  /** How page views leave the page; the browser when absent. */
  navigate?: Navigate;
}

/**
 * Root of the React tree: the scoped section every stylesheet targets, the screen-reader-only
 * signed-in line, and the providers the pages read from.
 */
export function AiCoeFrontDoor({ isDarkTheme, branding, siteUrl, user, isAdmin, telemetryProvider, services, pageView, navigate }: IAiCoeFrontDoorProps): React.ReactElement {
  const value: IFrontDoorContextValue = React.useMemo(
    (): IFrontDoorContextValue => ({ branding, catalog: createWorkflowCatalog(branding), siteUrl, user, isAdmin, telemetryProvider, services, navigate }),
    [branding, siteUrl, user, isAdmin, telemetryProvider, services, navigate]
  );
  const settings: IPageViewSettings | undefined = pageView === undefined || pageView.view === 'legacy' ? undefined : pageView;
  return (
    <section id="overture-ai-coe-pilot" className={styles.aiCoeFrontDoor} data-theme={isDarkTheme ? 'dark' : 'light'}>
      <span className={styles.signedInUser}>{`Signed in as ${user.displayName}`}</span>
      <FrontDoorProvider value={value}>
        <SubmissionProvider governanceService={services.governance}>
          {settings === undefined ? <FrontDoorShell /> : <PageViewShell key={settings.view} settings={settings} />}
        </SubmissionProvider>
      </FrontDoorProvider>
    </section>
  );
}

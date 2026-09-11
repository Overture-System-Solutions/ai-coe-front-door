import * as React from 'react';
import styles from '../AiCoeFrontDoor.module.scss';
import type { IBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import { FrontDoorProvider } from '../context/FrontDoorContext';
import type { IFrontDoorContextValue, IFrontDoorServices, IFrontDoorUser } from '../context/FrontDoorContext';
import { SubmissionProvider } from '../context/SubmissionContext';
import { FrontDoorShell } from './FrontDoorShell';

export interface IAiCoeFrontDoorProps {
  isDarkTheme: boolean;
  branding: IBranding;
  siteUrl: string;
  user: IFrontDoorUser;
  isAdmin: boolean;
  /** Created once by the web part so effects keyed on the services do not re-run on every render. */
  services: IFrontDoorServices;
}

/**
 * Root of the React tree: the scoped section every stylesheet targets, the screen-reader-only
 * signed-in line, and the providers the pages read from.
 */
export function AiCoeFrontDoor({ isDarkTheme, branding, siteUrl, user, isAdmin, services }: IAiCoeFrontDoorProps): React.ReactElement {
  const value: IFrontDoorContextValue = React.useMemo(
    (): IFrontDoorContextValue => ({ branding, catalog: createWorkflowCatalog(branding), siteUrl, user, isAdmin, services }),
    [branding, siteUrl, user, isAdmin, services]
  );
  return (
    <section id="overture-ai-coe-pilot" className={styles.aiCoeFrontDoor} data-theme={isDarkTheme ? 'dark' : 'light'}>
      <span className={styles.signedInUser}>{`Signed in as ${user.displayName}`}</span>
      <FrontDoorProvider value={value}>
        <SubmissionProvider governanceService={services.governance}>
          <FrontDoorShell />
        </SubmissionProvider>
      </FrontDoorProvider>
    </section>
  );
}

import * as React from 'react';
import type { RoleId } from '../../content/roles';
import { DEAD_HREF, resolveContentHref } from '../../content/links';
import type { IRoleResolution } from '../../services/roleResolver';

/**
 * The chrome around the consolidated view: who you are, what the view can say about itself, and the way out.
 *
 * The reference prototype carries two claims up here, about a package and a runtime. Ours carry what this build can
 * actually answer: the role the site groups resolved, and whether that membership was confirmed. Both are read from
 * the resolver rather than asserted, and the second one exists because an unconfirmed membership is the case where
 * the view deliberately shows less - saying so is better than quietly hiding sections.
 *
 * There is no brand block: the host SharePoint page already names the site, so the bar carries only the chips.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** The plain word for each role, in the order a person would read them. */
const ROLE_WORDS: { [role in RoleId]: string } = {
  employee: 'Employee',
  leader: 'Leader',
  operator: 'AI CoE operator',
  designAuthority: 'Design authority',
  marketingParticipant: 'Marketing participant',
  marketingReviewer: 'Marketing reviewer'
};

/** The widest role held, since a person in two groups is described by the one that opens the most. */
export function widestRole(roles: readonly RoleId[]): RoleId {
  const order: RoleId[] = ['designAuthority', 'operator', 'leader', 'marketingReviewer', 'marketingParticipant', 'employee'];
  return order.filter((role: RoleId): boolean => roles.indexOf(role) >= 0)[0] ?? 'employee';
}

/** The support route, as the page document binds it; a blank means unbound and is said so, never invented. */
export interface ISupportRouteBinding {
  label: string;
  href?: string;
}

export interface IAppTopbarProps {
  displayName: string;
  resolution: IRoleResolution;
  /** True while the group read is still in flight, so the chip says so rather than claiming a role. */
  pending: boolean;
}

export function AppTopbar({ displayName, resolution, pending }: IAppTopbarProps): React.ReactElement {
  const role: RoleId = widestRole(resolution.roles);
  const confirmed: boolean = resolution.resolution === 'resolved';
  return (
    <header className="ai-app-top">
      <div className="ai-app-chips">
        <span className="ai-app-chip-line">
          <span className={`ai-app-dot${pending ? ' ai-app-dot--wait' : ''}`} aria-hidden="true" />
          {pending ? 'Checking your access' : ROLE_WORDS[role]}
        </span>
        <span className="ai-app-chip-line">
          <span className={`ai-app-dot${confirmed ? '' : ' ai-app-dot--wait'}`} aria-hidden="true" />
          {confirmed ? 'Access confirmed' : 'Access not confirmed'}
        </span>
        <span className="ai-app-chip-line ai-app-chip-line--who">{`Signed in as ${displayName}`}</span>
      </div>
    </header>
  );
}

export const SUPPORT_UNBOUND_TEXT: string = 'Support route: not bound on this site yet.';
export const SUPPORT_PENDING_TEXT: string = 'Support route: reading the site\'s content document.';

/**
 * What the view will not claim, said once at the bottom where the reference says it, and the support route the
 * site actually binds. The route comes from the shared footer of the page content document, the one place a site
 * owner names it; without one the footer says the route is unbound rather than inventing a contact.
 */
export function AppFooter({ organizationName, support, siteUrl }: { organizationName: string; support: ISupportRouteBinding | 'pending' | undefined; siteUrl: string }): React.ReactElement {
  const href: string = typeof support === 'object' && support.href !== undefined ? resolveContentHref(siteUrl, support.href) : DEAD_HREF;
  let route: React.ReactNode;
  if (support === 'pending') {
    route = <span className="ai-app-foot-support">{SUPPORT_PENDING_TEXT}</span>;
  } else if (support === undefined) {
    route = <span className="ai-app-foot-support">{SUPPORT_UNBOUND_TEXT}</span>;
  } else if (href !== DEAD_HREF) {
    route = (
      <span className="ai-app-foot-support">
        {'Support: '}
        <a href={href} target="_blank" rel="noopener noreferrer">
          {support.label}
        </a>
      </span>
    );
  } else {
    route = <span className="ai-app-foot-support">{`Support: ${support.label} (no link bound)`}</span>;
  }
  return (
    <footer className="ai-app-foot">
      <span>{`${organizationName} AI Center of Excellence`}</span>
      <span>Nothing on this page is sent or published without a person deciding it.</span>
      {route}
    </footer>
  );
}

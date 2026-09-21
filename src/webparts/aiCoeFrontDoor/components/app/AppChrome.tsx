import * as React from 'react';
import type { RoleId } from '../../content/roles';
import type { IRoleResolution } from '../../services/roleResolver';

/**
 * The chrome around the consolidated view: who you are, what the view can say about itself, and the way out.
 *
 * The reference prototype carries two claims up here, about a package and a runtime. Ours carry what this build can
 * actually answer: the role the site groups resolved, and whether that membership was confirmed. Both are read from
 * the resolver rather than asserted, and the second one exists because an unconfirmed membership is the case where
 * the view deliberately shows less - saying so is better than quietly hiding sections.
 *
 * The mark is drawn, not loaded: a small gradient square with an arc cut out of it, built from palette tokens, so
 * there is no image request and an organization repaints it with everything else.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** The plain word for each role, in the order a person would read them. */
const ROLE_WORDS: { [role in RoleId]: string } = {
  employee: 'Employee',
  leader: 'Leader',
  operator: 'AI CoE operator',
  designAuthority: 'Design authority'
};

/**
 * The brand slot shows a name, and the tenant-neutral default is a phrase ("the organization"), which reads as a
 * mistake beside a mark. Lifting the first letter is presentation only: nothing downstream reads this string.
 */
function asName(label: string): string {
  return label === '' ? label : label.charAt(0).toUpperCase() + label.slice(1);
}

/** The widest role held, since a person in two groups is described by the one that opens the most. */
function widestRole(roles: readonly RoleId[]): RoleId {
  const order: RoleId[] = ['designAuthority', 'operator', 'leader', 'employee'];
  return order.filter((role: RoleId): boolean => roles.indexOf(role) >= 0)[0] ?? 'employee';
}

export interface IAppTopbarProps {
  organizationName: string;
  displayName: string;
  resolution: IRoleResolution;
  /** True while the group read is still in flight, so the chip says so rather than claiming a role. */
  pending: boolean;
}

export function AppTopbar({ organizationName, displayName, resolution, pending }: IAppTopbarProps): React.ReactElement {
  const role: RoleId = widestRole(resolution.roles);
  const confirmed: boolean = resolution.resolution === 'resolved';
  return (
    <header className="ai-app-top">
      <div className="ai-app-brand">
        <span className="ai-app-mark" aria-hidden="true" />
        <span className="ai-app-brand-text">
          <strong className="ai-app-brand-name">{asName(organizationName)}</strong>
          <small className="ai-app-brand-note">AI Center of Excellence</small>
        </span>
      </div>
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

/** What the view will not claim, said once at the bottom where the reference says it. */
export function AppFooter({ organizationName }: { organizationName: string }): React.ReactElement {
  return (
    <footer className="ai-app-foot">
      <span>{`${organizationName} AI Center of Excellence`}</span>
      <span>Nothing on this page is sent or published without a person deciding it.</span>
    </footer>
  );
}

import * as React from 'react';
import type { ApprovedToolStatus, IApprovedTool, IApprovedToolsResult, IToolAllowances } from '../../services/approvedToolsService';
import { AppPill, AppSectionHead } from './kit';
import type { AppPillTone } from './kit';

/**
 * The approved-tools register, read-only, under the request forms on Requests (1.0.0.18). It is the same list the tool
 * check and the AI CoE Concierge answer from; only operators and site owners change it, in SharePoint.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
export type ApprovedToolsLoad = { status: 'loading' } | { status: 'done'; result: IApprovedToolsResult };

export const APPROVED_TOOLS_TITLE: string = 'Approved tools';

const STATUS_TONE: { [status in ApprovedToolStatus]: AppPillTone } = {
  Approved: 'good',
  'Approved with conditions': 'info',
  'Not approved': 'block',
  'Under review': 'wait'
};

const ALLOWANCE_WORDS: { key: keyof IToolAllowances; words: string }[] = [
  { key: 'companyInformation', words: 'Company information' },
  { key: 'employeeInformation', words: 'Employee information' },
  { key: 'customerInformation', words: 'Customer information' },
  { key: 'patientInformation', words: 'Patient information' },
  { key: 'otherConfidentialInformation', words: 'Other confidential information' },
  { key: 'regulatedInformation', words: 'Regulated information' },
  { key: 'fileUploads', words: 'File uploads' },
  { key: 'externalSharing', words: 'Sharing outside the organization' }
];

function ToolRow({ tool }: { tool: IApprovedTool }): React.ReactElement {
  const allowed: string[] = ALLOWANCE_WORDS.filter((entry): boolean => tool.allows[entry.key]).map((entry): string => entry.words);
  const usable: boolean = tool.status === 'Approved' || tool.status === 'Approved with conditions';
  return (
    <li className={`ai-app-surface ai-app-tool ai-app-tool--${STATUS_TONE[tool.status]}`}>
      <span className="ai-app-tool-top">
        <h4 className="ai-app-tool-name">{tool.name}</h4>
        <AppPill tone={STATUS_TONE[tool.status]}>{tool.status}</AppPill>
      </span>
      {tool.otherNames.length > 0 && <p className="ai-app-tool-line ai-app-tool-muted">{`Also called ${tool.otherNames.join(', ')}`}</p>}
      {tool.approvedFor !== undefined && <p className="ai-app-tool-line">{`Approved for: ${tool.approvedFor}`}</p>}
      {usable && (
        <span className="ai-app-case-facts" aria-label={`What ${tool.name} may be used with`}>
          {allowed.length === 0 ? (
            <span className="ai-app-chip">No company or sensitive information</span>
          ) : (
            allowed.map((words: string): React.ReactElement => (
              <span key={words} className="ai-app-chip">
                {words}
              </span>
            ))
          )}
        </span>
      )}
      {tool.conditions !== undefined && <p className="ai-app-tool-line">{`Conditions: ${tool.conditions}`}</p>}
      {tool.notApprovedFor !== undefined && <p className="ai-app-tool-line">{`Not approved for: ${tool.notApprovedFor}`}</p>}
      {tool.howToGetAccess !== undefined && <p className="ai-app-tool-line">{`How to get access: ${tool.howToGetAccess}`}</p>}
      {tool.lastReviewed !== undefined && <p className="ai-app-tool-line ai-app-tool-muted">{`Reviewed ${tool.lastReviewed}${tool.reviewedBy === undefined ? '' : ` by ${tool.reviewedBy}`}`}</p>}
    </li>
  );
}

export function AppApprovedTools({ load }: { load: ApprovedToolsLoad }): React.ReactElement {
  let body: React.ReactNode;
  if (load.status === 'loading') {
    body = <p className="ai-app-note">Reading the approved tools…</p>;
  } else if (load.result.state !== 'ok') {
    body = <p className="ai-app-note">The approved tools could not be read on this site.</p>;
  } else if (load.result.tools.length === 0) {
    body = <p className="ai-app-note">No tools are on the approved list yet. Use Check a tool or task to ask about one.</p>;
  } else {
    body = (
      <ul className="ai-app-tools">
        {load.result.tools.map((tool: IApprovedTool): React.ReactElement => (
          <ToolRow key={tool.id} tool={tool} />
        ))}
      </ul>
    );
  }
  return (
    <section className="ai-app-approved-tools" aria-label={APPROVED_TOOLS_TITLE}>
      <AppSectionHead title={APPROVED_TOOLS_TITLE} note="The AI CoE's list of reviewed tools. A tool that is not here has not been reviewed yet." />
      {body}
    </section>
  );
}

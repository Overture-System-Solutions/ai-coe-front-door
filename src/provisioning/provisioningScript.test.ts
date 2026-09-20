/**
 * Static checks on the operator script that applies the page definition (it cannot run offline) and
 * on the README that documents the page layout.
 */
import * as fs from 'fs';
import * as path from 'path';
import { findTenantWords, PROVISIONING_SCAN, readTenantWords } from './tenantWords';
import type { ITenantWords } from './tenantWords';

const ROOT: string = process.cwd();
const PAGES_DIR: string = path.join(ROOT, 'sharepoint/pages');
const script: string = fs.readFileSync(path.join(PAGES_DIR, 'New-FrontDoorPages.ps1'), 'utf8');
const readme: string = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const tenantWords: ITenantWords = readTenantWords(ROOT);

/** The parameters the pinned PnP.PowerShell version gives each cmdlet the script calls (src/provisioning/pnpCmdletParameters.json). */
interface IPnPParameters {
  module: string;
  version: string;
  common: string[];
  dynamic: { [cmdlet: string]: string[] };
  cmdlets: { [cmdlet: string]: string[] };
}

const pnpParameters: IPnPParameters = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/provisioning/pnpCmdletParameters.json'), 'utf8')
) as IPnPParameters;

/** Comments carry cmdlet names and prose; only the code the shell runs is read. */
function codeOnly(text: string): string {
  const lines: string[] = text.replace(/<#[\s\S]*?#>/g, '').split('\n');
  const kept: string[] = [];
  for (let i: number = 0; i < lines.length; i += 1) {
    kept.push(/^\s*#/.test(lines[i]) ? '' : lines[i]);
  }
  return kept.join('\n');
}

/**
 * Every `-Parameter` passed to a PnP cmdlet, one entry per pair. The reader walks from the cmdlet name to the end of
 * its call: a pipe or a semicolon ends it, a closing bracket that was never opened ends it (the call sits inside a
 * sub-expression), quoted text and anything nested in brackets belongs to an argument, not to the call.
 */
function pnpCalls(text: string): { cmdlet: string; parameter: string }[] {
  const found: { cmdlet: string; parameter: string }[] = [];
  const finder: RegExp = /\b([A-Z][A-Za-z]*-PnP[A-Za-z]+)\b/g;
  let match: RegExpExecArray | null = finder.exec(text);
  while (match !== null) {
    const cmdlet: string = match[1];
    let depth: number = 0;
    let i: number = match.index + cmdlet.length;
    while (i < text.length) {
      const character: string = text.charAt(i);
      if (character === '\n') { break; }
      if (character === "'" || character === '"') {
        i += 1;
        while (i < text.length && text.charAt(i) !== character && text.charAt(i) !== '\n') { i += 1; }
        i += 1;
        continue;
      }
      if (character === '(' || character === '{' || character === '[') { depth += 1; i += 1; continue; }
      if (character === ')' || character === '}' || character === ']') {
        depth -= 1;
        if (depth < 0) { break; }
        i += 1;
        continue;
      }
      if (depth === 0 && (character === '|' || character === ';')) { break; }
      if (depth === 0 && character === '-') {
        const parameter: RegExpExecArray | null = /^-([A-Za-z][A-Za-z0-9]*)/.exec(text.slice(i));
        if (parameter !== null) {
          found.push({ cmdlet: cmdlet, parameter: parameter[1] });
          i += parameter[0].length;
          continue;
        }
      }
      i += 1;
    }
    match = finder.exec(text);
  }
  return found;
}

describe('page provisioning script', () => {
  it('reads the page definition and pins its tooling', () => {
    expect(script).toContain('pages.json');
    expect(script).toMatch(/#Requires -Version 7\.4/);
    expect(script).toMatch(/#Requires -Modules @\{\s*ModuleName\s*=\s*'PnP\.PowerShell';\s*RequiredVersion\s*=\s*'\d+\.\d+\.\d+'\s*\}/);
    for (const cmdlet of [
      'Connect-PnPOnline',
      '-Interactive',
      'Get-PnPWeb',
      'Get-PnPContext',
      'Invoke-PnPQuery',
      'Add-PnPFile',
      'Get-PnPFile',
      'Add-PnPPage',
      'Add-PnPPageSection',
      'Add-PnPPageWebPart',
      'Set-PnPPage',
      'Set-PnPListItemPermission',
      'Remove-PnPNavigationNode',
      'Add-PnPNavigationNode',
      'Set-PnPHomePage'
    ]) {
      expect(script).toContain(cmdlet);
    }
    expect(script).toContain('Set-StrictMode');
    expect(script).toContain("$ErrorActionPreference = 'Stop'");
    expect(script).toContain('ConvertFrom-Json -AsHashtable');
  });

  it('calls no cmdlet parameter the pinned PnP.PowerShell version lacks', () => {
    // A parameter the module does not have binds at run time, not at parse time: with $ErrorActionPreference = 'Stop'
    // the run stops on the tenant, and a suite that only matches the script text sees nothing. So every pair the script
    // writes is checked against the parameters of the version the #Requires line pins.
    const required: RegExpExecArray | null = /RequiredVersion\s*=\s*'([\d.]+)'/.exec(script);
    expect(required).not.toBeNull();
    expect((required as RegExpExecArray)[1]).toBe(pnpParameters.version);
    expect(pnpParameters.module).toBe('PnP.PowerShell');
    const calls: { cmdlet: string; parameter: string }[] = pnpCalls(codeOnly(script));
    expect(calls.length).toBeGreaterThan(30);
    const unknown: string[] = [];
    for (const call of calls) {
      const declared: string[] | undefined = pnpParameters.cmdlets[call.cmdlet];
      if (declared === undefined) {
        unknown.push(`${call.cmdlet} is not in pnpCmdletParameters.json; add it from the pinned module`);
        continue;
      }
      const dynamic: string[] = pnpParameters.dynamic[call.cmdlet] || [];
      const known: boolean =
        declared.indexOf(call.parameter) >= 0 ||
        dynamic.indexOf(call.parameter) >= 0 ||
        pnpParameters.common.indexOf(call.parameter) >= 0;
      if (!known) {
        unknown.push(`${call.cmdlet} -${call.parameter}`);
      }
    }
    expect(unknown).toEqual([]);
    // The check is live: this is the parameter 3.1.0 does not give New-PnPList, and the list description goes through
    // Set-PnPList instead (the Lists section below pins that shape).
    expect(pnpParameters.cmdlets['New-PnPList'].indexOf('Description')).toBe(-1);
    expect(pnpParameters.cmdlets['Set-PnPList'].indexOf('Description')).toBeGreaterThan(-1);
    // A dynamic parameter is invisible to Get-Command, so each one is recorded with the cmdlet it belongs to.
    expect(pnpParameters.dynamic['Add-PnPField']).toContain('Choices');
  });

  it('declares the parameters and handles every token kind, including in-text links', () => {
    expect(script).toContain('param(');
    for (const name of ['SiteUrl', 'ParameterFile', 'OrganizationName', 'DraftServiceUrl', 'TelemetryProvider', 'Overwrite', 'ClientId']) {
      expect(script).toMatch(new RegExp(`\\$${name}\\b`));
    }
    expect(script).toContain('{Page:');
    expect(script).toContain('{Url:');
    expect(script).toContain('\\]\\(\\{Url:');
    expect(script).toContain('Write-Warning');
    expect(script).toContain("'url'");
    expect(script).toContain("'text'");
  });

  it('accepts the optional kind: only a text parameter must be filled, a blank optional one takes its default', () => {
    expect(script).toContain("-notin @('text', 'url', 'optional', 'group')");
    expect(script).toContain("expected 'text', 'url', 'optional' or 'group'");
    // Required-ness is decided by the kind alone, in one place, and only for text.
    expect(script.match(/\$missing \+= \$name/g)).toHaveLength(1);
    expect(script).toMatch(/if \(\$kinds\[\$name\] -eq 'text'\) \{ \$missing \+= \$name \}/);
    expect(script).not.toMatch(/-eq 'url'[^\n]*\$missing/);
    expect(script).not.toMatch(/-eq 'optional'[^\n]*\$missing/);
    // A blank optional parameter is substituted with the default its declaration carries; no other kind may declare one.
    expect(script).toMatch(/-eq 'optional' -and \$declaration\.Contains\('default'\)\) \{ \$values\[\$name\] = \[string\]\$declaration\['default'\] \}/);
    expect(script).toMatch(/\$declaration\.Contains\('default'\) -and \$kinds\[\$name\] -ne 'optional'\) \{ throw/);
    expect(script).toMatch(/Optional parameters may be blank too: a\s+blank one takes the 'default'/);
  });

  it('accepts the group kind: a site group looked up on the site, a blank or unknown title warning and never throwing', () => {
    // 1.0.0.14: a `group` parameter carries a site group title. The script looks it up; a blank or unknown title is a
    // warning, so a site whose groups do not exist yet still provisions: the page that names the group stays
    // owners-only and the role it would bind stays unbound.
    const section: string = script.slice(script.indexOf('# Site groups'), script.indexOf('# List security'));
    expect(section.length).toBeGreaterThan(200);
    expect(section).toMatch(/if \(\$kinds\[\$name\] -ne 'group'\) \{ continue \}/);
    expect(section).toMatch(/try \{ \$group = Get-PnPGroup -Identity \$title -ErrorAction SilentlyContinue \} catch \{ \$group = \$null \}/);
    expect(section).toMatch(/Write-Warning "[^"]*is not found; page stays owners-only and the role stays unbound/);
    // Never an error: neither a blank title nor a group the site does not carry stops the run.
    expect(section).not.toContain('throw');
    expect(section).toMatch(/IsNullOrWhiteSpace\(\$title\)/);
    // Only a group that was found is kept, and it is kept by parameter name, so a page names the parameter, never a title.
    expect(section).toMatch(/\$siteGroups\[\$name\] = \$group/);
    // The group section runs before the lists and the pages, so every later grant sees the same resolved groups.
    expect(script.indexOf('# Site groups')).toBeGreaterThan(script.indexOf('Get-PnPPageComponent'));
    expect(script.indexOf('# Site groups')).toBeLessThan(script.indexOf('# List security'));
  });

  it('applies the groups: page permissions - Read per named group, owners Administrator, inheritance reset first', () => {
    // The page map protects Operations and Enterprise value with site groups; SharePoint itself refuses the page to
    // everyone else. Each name in 'groups:<Name>[,<Name>]' is a group parameter, so no group title is committed.
    expect(script).toMatch(/function Set-PagePermission/);
    expect(script).toContain("'^groups:[A-Za-z][A-Za-z0-9]*(,[A-Za-z][A-Za-z0-9]*)*$'");
    expect(script).toMatch(/expected 'inherit', 'owners' or 'groups:<Name>\[,<Name>\]'/);
    expect(script).toMatch(/is not a parameter of kind 'group'/);
    expect(script).toMatch(/RoleTypeKind -eq 'Reader'/);
    // The page loop delegates; the inline owners-only branch is gone.
    expect(script).toMatch(/Set-PagePermission \$file \(\[string\]\$page\['permissions'\]\)/);
    expect(script).not.toMatch(/if \(\[string\]\$page\['permissions'\] -eq 'owners'\)/);
    const body: string = script.slice(script.indexOf('function Set-PagePermission'), script.indexOf('# Pages: one section'));
    expect(body.length).toBeGreaterThan(400);
    expect(body).toContain('-AssociatedOwnerGroup');
    expect(body).toMatch(/Set-PnPListItemPermission -List 'Site Pages' -Identity \$item\.Id -Group \$group -AddRole \$readRole/);
    // Reset first (an item already unique keeps stray grants from an earlier run), then the owners, then the readers.
    const reset: number = body.indexOf('-InheritPermissions');
    const owners: number = body.indexOf('-AddRole $fullControlRole');
    const readers: number = body.indexOf('-AddRole $readRole');
    expect(reset).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(owners);
    expect(owners).toBeLessThan(readers);
    expect(body).toContain('-ClearExisting');
    // A group parameter that is blank or names a group the site does not carry was not resolved, so the page keeps the
    // owners-only grant and nothing else: 'inherit' alone leaves the page as it is.
    expect(body).toMatch(/\$siteGroups\.ContainsKey\(\$parameterName\)/);
    expect(body).toMatch(/-eq 'inherit'\) \{ return \}/);
  });

  it('drops a block whose skipWhenBlank parameter is blank (the pilot notice), with a warning, and never uploads the key', () => {
    expect(script).toContain("'skipWhenBlank'");
    expect(script).toMatch(/function Test-BlockKept/);
    expect(script).toMatch(/Write-Warning "[^"]*is dropped because the parameter '\$name' is blank/);
    expect(script).not.toContain('is left out');
    // Only a declared parameter may be named; the key itself does not reach the document.
    expect(script).toMatch(/names an undeclared parameter/);
    expect(script).toMatch(/if \(\$key -eq 'skipWhenBlank'\) \{ continue \}/);
    expect(script).toMatch(/Where-Object \{ Test-BlockKept \$_ /);
    expect(script).toMatch(/skipWhenBlank[^\n]*PilotTeamName/);
    // The definition keys the pilot notice on PilotTeamName and nothing else.
    const definition: { pages: { key: string; blocks?: { type: string; skipWhenBlank?: string }[] }[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    const keyed: string[] = [];
    for (const page of definition.pages) {
      for (const block of page.blocks ?? []) {
        if (block.skipWhenBlank !== undefined) {
          keyed.push(`${page.key}:${block.type}:${block.skipWhenBlank}`);
        }
      }
    }
    expect(keyed).toEqual(['startHere:notice:PilotTeamName']);
  });

  it('ships tenant-neutral: no word of the tenant list in the committed provisioning files', () => {
    // Only the committed files: an operator's filled-in parameters.json may name the tenant. The word list itself is
    // the single permitted home for client names and the reference roster (src/provisioning/tenantWords.json).
    for (const file of ['New-FrontDoorPages.ps1', 'pages.json', 'parameters.sample.json']) {
      const text: string = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
      for (const list of PROVISIONING_SCAN) {
        expect({ file, list, found: findTenantWords(text, tenantWords, [list]) }).toEqual({ file, list, found: [] });
      }
    }
    expect(script).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('uploads the resolved content document to Site Assets before building the pages', () => {
    expect(script).toContain('Resolve-Node');
    expect(script).toContain('EnsureSiteAssetsLibrary');
    expect(script).toContain('-NewFileName');
    expect(script).toMatch(/ConvertTo-Json[^\n]*-Depth/);
    expect(script).toContain('UTF8Encoding');
    expect(script).toContain('New-TemporaryFile');
    expect(script).toMatch(/finally\s*\{[^}]*Remove-Item/);
    expect(script).toContain("'page'");
    expect(script).toContain("'pageKey'");
    expect(script).toContain("'contentUrl'");
    expect(script).toContain('-AsString');
    const upload: number = script.indexOf('Add-PnPFile');
    expect(upload).toBeGreaterThan(script.indexOf('Get-PnPPageComponent'));
    expect(upload).toBeLessThan(script.indexOf('Add-PnPPage -Name'));
  });

  it('keeps an unlinked tile or call to action on the page as closed, and resolves tokens inside the route table', () => {
    // A blank URL parameter used to drop the tile; now the page shows it closed (Needs access) so the promise stays visible and truthful.
    expect(script).toContain("has no link (its URL parameter is blank) and is shown as closed");
    expect(script).not.toContain('is left out');
    expect(script).not.toContain('left out because');
    expect(script).toContain("'needsAccess'");
    expect(script).toMatch(/\$resolved\['type'\] -eq 'hero'[\s\S]*'needsAccess'/);
    expect(script).not.toMatch(/\$resolved\.Remove\('cta'\)/);
    expect(script).toContain("'routes'");
    expect(script).toMatch(/Resolve-Node \$definition\['routes'\]/);
    for (const section of ['vocabulary', 'settings']) {
      expect(script).toContain(`'${section}'`);
    }
  });

  it('copies the vocabulary and settings sections as written, never through the token pass', () => {
    // Their {organization} and {role} tokens belong to the web part's renderer; Resolve-Text would refuse them.
    expect(script).not.toMatch(/Resolve-Node \$definition\['(vocabulary|settings)'\]/);
    expect(script).toMatch(/foreach \(\$section in @\('vocabulary', 'settings'\)\) \{[\s\S]{0,200}\$document\[\$section\] = \$definition\[\$section\]/);
  });

  it('carries the shared sections through the token pass and names the document on the five form instances', () => {
    // The shared footer (the support route) renders below every page view, so the form pages read the document too.
    expect(script).toContain("'shared'");
    expect(script).toMatch(/Resolve-Node \$definition\['shared'\]/);
    const definition: { pages: { key: string; instance: { [name: string]: string } }[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    const formKeys: string[] = ['idea', 'toolCheck', 'teamUsage', 'helpTraining', 'feedback'];
    for (const key of formKeys) {
      const instance: { [name: string]: string } | undefined = definition.pages.filter((page): boolean => page.key === key)[0]?.instance;
      expect(instance).toBeDefined();
      expect(instance?.view).toBe(key);
      expect(instance?.contentUrl).toBe('SiteAssets/ai-coe-pages.json');
    }
    // The admin page is not a form page and keeps its property bag as before.
    expect(definition.pages.filter((page): boolean => page.key === 'admin')[0]?.instance.contentUrl).toBeUndefined();
  });

  it('writes the governance reference and the review system name on every instance and reports a blank reference as AWAITING', () => {
    // Decision 21: both Branding properties come from optional parameters through the same token pass as every other
    // instance property; a blank GovernanceReference leaves the legacy wording in place, so the run summary names it.
    const definition: { pages: { key: string; instance: { [name: string]: string } }[]; parameters: { [name: string]: { kind: string } } } = JSON.parse(
      fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8')
    );
    expect(definition.parameters.GovernanceReference.kind).toBe('optional');
    expect(definition.parameters.ReviewSystemName.kind).toBe('optional');
    for (const page of definition.pages) {
      expect({ page: page.key, governanceReference: page.instance.governanceReference }).toEqual({ page: page.key, governanceReference: '{GovernanceReference}' });
      expect({ page: page.key, reviewSystemName: page.instance.reviewSystemName }).toEqual({ page: page.key, reviewSystemName: '{ReviewSystemName}' });
    }
    expect(script).toMatch(/GovernanceReference[^\n]*AWAITING/);
    expect(script).toMatch(/\$values\['GovernanceReference'\]/);
    // The summary line comes after the pages are built and before the locked-page throw, so it is always printed.
    const summary: number = script.search(/GovernanceReference[^\n]*AWAITING/);
    expect(summary).toBeGreaterThan(script.indexOf('Set-PnPHomePage'));
    expect(summary).toBeLessThan(script.search(/^if \(\$locked\.Count -gt 0\) \{\s*throw/m));
  });

  it('carries the plane of a page into the document, so the owners-only Operations page parses as the operator plane', () => {
    // Decision 7: the telemetry strip moved to Operations, a page written for operators; the web part reads `plane` from the document.
    expect(script).toContain("'plane'");
    expect(script).toMatch(/if \(\$page\.Contains\('plane'\)\) \{ \$documentPage\['plane'\] = \[string\]\$page\['plane'\] \}/);
    const definition: { pages: { key: string; permissions: string; plane?: string }[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    const planes: string[] = definition.pages.filter((page): boolean => page.plane !== undefined).map((page): string => `${page.key}:${String(page.plane)}:${page.permissions}`);
    expect(planes).toEqual(['operations:operator:owners']);
    // The navigation is five entries now (decision 1); the script's own words say so.
    expect(script).not.toMatch(/six navigation pages|six front-door entries/);
    expect(script).toMatch(/five front-door entries/);
  });

  it('makes item-level security effective on the intake lists before the upload, leaves Members at their level, and warns about the flow identity', () => {
    // Decision 6: SharePoint bypasses item-level security for a principal holding Override List Behaviors, which Design and
    // Full Control include and the default Edit level of the Members group does not; Manage Lists is not the bypass.
    const section: number = script.indexOf('# List security');
    expect(section).toBeGreaterThan(script.indexOf('Get-PnPPageComponent'));
    expect(section).toBeLessThan(script.indexOf('Add-PnPFile'));
    expect(script).toContain("'listSecurity'");
    expect(script).toContain("'ownItems'");
    // A list the site does not carry is skipped with a warning; this section never creates one (the "Lists" section
    // below creates the lists pages.json declares, and neither intake list is declared there).
    expect(script).toMatch(/Get-PnPList -Identity \$title[^\n]*-ErrorAction SilentlyContinue/);
    expect(script).toContain('is not on this site; read security not applied');
    expect(script.slice(section, script.indexOf('# Lists:'))).not.toContain('New-PnPList');
    // Set-PnPList breaks the inheritance (once: a rerun finds it unique); Set-PnPListPermission only adds or removes roles.
    expect(script).toMatch(/HasUniqueRoleAssignments/);
    expect(script).toMatch(/Set-PnPList -Identity \$title -BreakRoleInheritance -CopyRoleAssignments/);
    expect(script).toContain('-AssociatedOwnerGroup');
    expect(script).toMatch(/RoleTypeKind -eq 'Administrator'/);
    expect(script).toMatch(/Set-PnPListPermission -Identity \$title -Group \$owners -AddRole \$fullControlRole/);
    expect(script).toMatch(/Set-PnPList -Identity \$title -ReadSecurity 2 -WriteSecurity 2/);
    // Members are left at their level unless -HardenMembers is passed: a labelled hardening that removes Manage Lists, not what makes read security work.
    expect(script).toMatch(/\[switch\]\$HardenMembers/);
    expect(script).toMatch(/\.PARAMETER HardenMembers/);
    expect(script).toContain('-AssociatedMemberGroup');
    expect(script).toMatch(/RoleTypeKind -eq 'Editor'/);
    expect(script).toMatch(/RoleTypeKind -eq 'Contributor'/);
    expect(script).toMatch(/if \(\$HardenMembers\) \{[\s\S]*?Set-PnPListPermission -Identity \$title -Group \$members -RemoveRole \$editRole -AddRole \$contributeRole/);
    expect(script).toMatch(/removes Manage Lists[^\n]*not what makes read security work/);
    expect(script).not.toMatch(/Manage Lists[^\n]*bypass/i);
    // The companion flows' connection must hold the override, else it is trimmed to its own rows.
    expect(script).toContain('Override List Behaviors');
    expect(script).toContain('Override Check-Out');
    expect(script).toContain(
      "must hold Override List Behaviors (Full Control, Design or a custom permission level) on the intake lists; an Edit-level connection is trimmed to its own items"
    );
    // The section's order: guard, break, grant, (harden), flags; the flags last so a partial run never trims before the owners can read.
    const guard: number = script.indexOf('read security not applied');
    const breakInheritance: number = script.indexOf('-BreakRoleInheritance');
    const grant: number = script.indexOf('-AddRole $fullControlRole');
    const harden: number = script.indexOf('if ($HardenMembers)');
    const flags: number = script.indexOf('-ReadSecurity 2 -WriteSecurity 2');
    expect(guard).toBeLessThan(breakInheritance);
    expect(breakInheritance).toBeLessThan(grant);
    expect(grant).toBeLessThan(harden);
    expect(harden).toBeLessThan(flags);
    // The titles come from pages.json, which names the two intake lists; the script hard-codes none.
    const definition: { listSecurity: { title: string; security: string }[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    expect(definition.listSecurity).toEqual([
      { title: 'AI CoE Pilot Intakes', security: 'ownItems' },
      { title: 'AI CoE Use Cases', security: 'ownItems' }
    ]);
    expect(script).not.toContain('AI CoE Pilot Intakes');
    expect(script).not.toContain('AI CoE Use Cases');
    // The run summary reports what was secured and what was skipped.
    expect(script).toMatch(/List security:/);
  });

  it('ensures the declared lists before the upload: creates what is missing, adds the columns a list lacks, removes none', () => {
    // Decision 9: a new list comes from the declarative 'lists' section of pages.json and from nowhere else, because the
    // package feature's XML stays byte-identical. The section runs before the document upload, as list security does.
    const start: number = script.indexOf('# Lists:');
    expect(start).toBeGreaterThan(script.indexOf('# List security'));
    expect(start).toBeLessThan(script.indexOf('Add-PnPFile'));
    const section: string = script.slice(start, script.indexOf('# Content document'));
    expect(section.length).toBeGreaterThan(600);
    expect(script).toContain("'lists'");
    // Created as a plain generic list; an existing one is kept as it is and only extended.
    expect(section).toMatch(/New-PnPList[^\n]*-Template GenericList/);
    // The pinned PnP.PowerShell gives New-PnPList no description; the wording is written once, in the same branch,
    // with the cmdlet that has one.
    expect(section).not.toMatch(/New-PnPList[^\n]*-Description/);
    expect(section).toMatch(/Set-PnPList -Identity \$title -Description/);
    expect(section).toMatch(/Get-PnPList -Identity \$title[^\n]*-ErrorAction SilentlyContinue/);
    // A column already on the list is read back and left alone; a missing one is added and put on the default view.
    expect(section).toMatch(/Get-PnPField -List \$title -Identity \$internalName[^\n]*-ErrorAction SilentlyContinue/);
    expect(section).toMatch(/Add-PnPField[^\n]*-AddToDefaultView/);
    expect(section).toMatch(/Add-PnPField[^\n]*-Type Choice[^\n]*-Choices/);
    // A unique column is indexed and unique in one call, as the feature's intake key is.
    expect(section).toMatch(/Set-PnPField -List \$title -Identity \$internalName -Values @\{ ?Indexed = \$true; ?EnforceUniqueValues = \$true ?\}/);
    // The rule that keeps a tenant's rows readable across releases, and the note every later release adds a line to.
    expect(section).toContain('never removes or renames a field');
    expect(section).toMatch(/# Migration:/);
    expect(section).not.toMatch(/Remove-PnPField|Remove-PnPList|Set-PnPField[^\n]*-Title/);
    // The declaration is checked before anything is created: an unknown type or a choice list on another type stops the
    // run. The check is a pass of its own, so a typo in the second list cannot leave the first one half-built.
    expect(section).toMatch(/throw/);
    const loop: string = 'foreach ($entry in $listDefinitions)';
    expect(section.indexOf(loop)).toBeLessThan(section.lastIndexOf(loop));
    const validation: string = section.slice(section.indexOf(loop), section.lastIndexOf(loop));
    expect(validation).toMatch(/throw/);
    expect(validation).not.toMatch(/-PnP/);
    expect(section).toContain("'Text', 'Note', 'Number', 'DateTime', 'Choice' or 'Boolean'");
    // The titles and columns come from pages.json; the script names neither.
    const definition: { lists: { title: string; fields: { name: string }[] }[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    expect(definition.lists.length).toBeGreaterThan(0);
    // As whole words in this section: elsewhere the script reads a regular expression group's own .Value.
    const words: string[] = section.split(/[^A-Za-z0-9_]+/);
    for (const list of definition.lists) {
      expect(script).not.toContain(list.title);
      for (const field of list.fields) {
        expect(words).not.toContain(field.name);
      }
    }
    // The run summary reports the lists it ensured.
    expect(script).toMatch(/Lists:/);
  });

  it('no longer needs the native web part templates or HTML text parts', () => {
    for (const legacy of ['Add-PnPPageTextPart', 'DefaultWebPartType', 'quicklinks.template.json', 'button.template.json', 'serverProcessedContent', 'target="_blank"', 'example.invalid']) {
      expect(script).not.toContain(legacy);
    }
  });

  it('protects the site: checks the component first, recycles on overwrite, refuses other site types', () => {
    expect(script).toContain('Get-PnPPageComponent');
    expect(script).toContain('-Recycle');
    expect(script).toContain('AllowNonCommunicationSite');
    expect(script).toContain('Skipping');
    expect(script).toContain('$Overwrite');
  });

  it('binds the component as an object, verifies every placement and stops when the component is missing', () => {
    // Passing the id as text left PnP with a null component: controls with "webPartId":null that neither render nor edit.
    expect(script).toContain('-Component $component');
    expect(script).not.toMatch(/-Component \(\[string\]/);
    expect(script).toMatch(/throw "The front-door component/);
    expect(script).not.toContain('was not found among');
    expect(script).toContain('WebPartId');
    expect(script).toMatch(/throw "SharePoint did not bind/);
  });

  it('refuses positional arguments, so stray text cannot become a parameter value', () => {
    expect(script).toMatch(/\[CmdletBinding\(PositionalBinding = \$false\)\]/);
  });

  it('skips a page it cannot recycle (locked by an open editor) and reports it at the end', () => {
    expect(script).toMatch(/try\s*\{\s*Remove-PnPPage -Identity \$pageName -Force -Recycle/);
    expect(script).toContain('could not be recycled');
    expect(script).toContain('$locked += $file');
    expect(script).toMatch(/Locked:/);
    expect(script).toMatch(/if \(\$locked\.Count -gt 0\) \{\s*throw/);
  });
});

describe('README', () => {
  it('documents the current package and the page layout', () => {
    expect(readme).toContain('## Deploy 1.0.0.13');
    expect(readme).not.toContain('Deploy 1.0.0.12');
    expect(readme).not.toContain('Deploy 1.0.0.11');
    expect(readme).toContain('### Rollback');
    expect(readme).toContain('## Lay out the front door across pages');
    expect(readme).toContain('New-FrontDoorPages.ps1');
    expect(readme).toContain('parameters.sample.json');
    expect(readme).toContain('one instance per page');
    // 1.0.0.13: thirteen pages, Prompts out of the navigation, the strip on the owners-only Operations page, my work on Status.
    expect(readme).toContain('The thirteen pages');
    expect(readme).not.toContain('The twelve pages');
    expect(readme).toContain('key `operations`');
    expect(readme).toContain('Diagnostics: usage and cost, not a measure of value');
    expect(readme).toContain('`myWork`');
    expect(readme).toContain('-ClientId');
    expect(readme).toContain('recycle bin');
    expect(readme).toContain('AllowNonCommunicationSite');
    expect(readme).not.toContain('quicklinks.template.json');
    // The command line is shown without bracketed placeholders, which were pasted literally once.
    expect(readme).not.toMatch(/\[-(DraftServiceUrl|TelemetryProvider|Overwrite)/);
  });

  it('documents the content document and its blocks', () => {
    expect(readme).toContain('`contentUrl`');
    expect(readme).toContain('`pageKey`');
    expect(readme).toContain('ai-coe-pages.json');
    expect(readme).toContain('Site Assets');
    expect(readme).toContain('version history');
    expect(readme).toContain('"version": 1');
    for (const block of ['hero', 'heading', 'paragraph', 'tiles', 'cards', 'lanes', 'statusRow', 'piece', 'workCommand', 'notice', 'rules', 'supportRoute', 'caseCards']) {
      expect(readme).toContain(`\`${block}\``);
    }
    // The shared footer: the support route below every page view, the form pages included.
    expect(readme).toContain('`shared`');
    expect(readme).toContain('`footer`');
    expect(readme).toContain('Consistent Help');
    expect(readme).toContain('not yet named');
    expect(readme).toContain('[label](href)');
    expect(readme).toContain('**bold**');
    expect(readme).toContain('*italic*');
  });

  it('documents the parameter kinds and the tenant word list', () => {
    expect(readme).toContain('`optional`');
    expect(readme).toContain('`default`');
    // 1.0.0.14: the group kind and the page permissions it feeds.
    expect(readme).toContain('`group`');
    expect(readme).toContain('`groups:<Name>[,<Name>]`');
    expect(readme).toMatch(/blank or unknown[^.]*warning/);
    expect(readme).toMatch(/owners-only[^.]*the role[^.]*unbound|the role[^.]*unbound[^.]*owners-only/);
    expect(readme).toContain('src/provisioning/tenantWords.json');
    expect(readme).toContain('deliberately not tenant-neutral');
    // The module the script is written for, and where the operator reads what that version accepts.
    expect(readme).toContain('src/provisioning/pnpCmdletParameters.json');
  });

  it('documents the release close of 1.0.0.12: the document sections, the truth states, the ledger, the properties and the portability sections', () => {
    for (const key of ['vocabulary', 'plane', 'settings']) {
      expect(readme).toContain(`\`${key}\``);
    }
    for (const label of ['Available now', 'Draft only', 'Needs approval', 'Needs access', 'Not supported']) {
      expect(readme).toContain(label);
    }
    expect(readme).toContain('docs/content-claims.md');
    for (const property of ['governanceReference', 'reviewSystemName']) {
      expect(readme).toContain(`\`${property}\``);
    }
    expect(readme).toContain('## Rebind to another tenant');
    expect(readme).toContain('## Portability exceptions');
    expect(readme).toContain('## Implementation route');
    // The upgrade path: no -Overwrite on an existing site; the pages are skipped, the document is rewritten.
    expect(readme).toMatch(/without `-Overwrite`/);
    expect(readme).toContain('rewritten');
    // The renamed pane label; the first tenant's flow name is gone.
    expect(readme).toContain('AI draft flow URL');
    expect(readme).not.toContain('Claude draft flow URL');
    expect(readme).not.toContain('OSS Demo');
    expect(readme).toContain('evidence/dependency-inventory.json');
  });

  it('documents the release close of 1.0.0.13: the receipts, my work, the strip, the case card, the settings, Operations, the record table, the preview switches and the rollback', () => {
    for (const key of ['myWork', 'statusStrip', 'caseCards', 'freshnessDays', 'vocabulary.telemetry', 'listSecurity']) {
      expect(readme).toContain(`\`${key}\``);
    }
    for (const label of ['Saved and confirmed', 'Saved, not yet confirmed', 'Saved but not yet confirmed.', 'INCONCLUSIVE']) {
      expect(readme).toContain(label);
    }
    expect(readme).toContain('Operations');
    expect(readme).toContain('Who writes which record');
    // The preview shows the refused list and the pending receipt without a tenant.
    expect(readme).toContain('?deny=intakes');
    expect(readme).toContain('?readback=fail');
    expect(readme).toContain('?page=operations');
    // The upgrade path of this release: no -Overwrite, the Operations page is created, the lists are secured first.
    expect(readme).toMatch(/Operations[^.\n]*is created/);
    // Rollback: the previous package and its script; the Operations page stays or is removed by hand; the list security is reverted.
    const rollback: string = readme.slice(readme.indexOf('### Rollback'), readme.indexOf('### Enable AI drafting'));
    expect(rollback).toContain('1.0.0.12');
    expect(rollback).toContain('Operations');
    expect(rollback).toMatch(/harmless|by hand/);
    expect(rollback).toMatch(/List security|-ReadSecurity 1 -WriteSecurity 1/);
  });

  it('documents the list security of 1.0.0.13: why it works, the flow identity, the tenant check and the rollback', () => {
    expect(readme).toContain('read their own items');
    expect(readme).toContain('Override List Behaviors');
    expect(readme).toContain('Override Check-Out');
    expect(readme).toContain('`-HardenMembers`');
    expect(readme).toContain('Negative access test (tenant)');
    expect(readme).toContain('### Rollback');
    expect(readme).toContain('src/security/negativeAccess.test.ts');
    expect(readme).toMatch(/-ReadSecurity 1 -WriteSecurity 1/);
    expect(readme).toMatch(/-ResetRoleInheritance/);
    // Manage Lists is never described as the bypass; the Members group stays at its level.
    expect(readme).not.toMatch(/Manage Lists[^.\n]*(bypass|is why|is what makes)/i);
    expect(readme).toMatch(/Members[^.\n]*(left|stays|stay) at (their|its) level/);
  });

  it('documents the declared lists of 1.0.0.14: the columns, the additive rule and what -Overwrite recycles', () => {
    const definition: { lists: { title: string; fields: { name: string }[] }[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    expect(readme).toContain('**Lists (since 1.0.0.14).**');
    expect(readme).toContain('`lists` section');
    for (const list of definition.lists) {
      expect(readme).toContain(list.title);
      for (const field of list.fields) {
        expect(readme).toContain(`\`${field.name}\``);
      }
    }
    // The rule that keeps a tenant's rows: additive only, and a column is never renamed or retyped.
    expect(readme).toMatch(/never removes a column,\s+never renames one and never changes a column's type/);
    expect(readme).toContain('`# Migration:`');
    expect(readme).toContain('src/provisioning/listsDefinition.test.ts');
    // What -Overwrite touches: pages, never a list, a column, a row or a list permission.
    expect(readme).toMatch(/`-Overwrite` recycles pages and nothing else/);
    expect(readme).toMatch(/no list, column, row or list permission is touched by\s+it/);
  });

  it('documents the route table, the action states and the closed tiles', () => {
    expect(readme).toContain('`routes`');
    expect(readme).toContain('`guidedIntake`');
    expect(readme).toContain('`receiptRef`');
    expect(readme).toContain('`verifiedOn`');
    expect(readme).toContain('`prominent`');
    expect(readme).toContain('shown as closed');
    expect(readme).not.toContain('reported as left out');
    expect(readme).not.toContain('leaves out a tile');
  });
});

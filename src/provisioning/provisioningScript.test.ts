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
    // The section ends where the instance properties it feeds begin (1.0.0.14).
    const section: string = script.slice(script.indexOf('# Site groups'), script.indexOf('# Instance properties'));
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

  it('skips a page whose skipWhenBlank parameter is blank and drops every tile, card and link that targets it (1.0.0.15)', () => {
    // The set is answered once, before the token pass, so nothing downstream can resolve a link to a page the run
    // did not build: the document carries no blocks for it, the navigation no node, and a link to it would throw.
    expect(script).toMatch(/\$skippedPages = @\{\}/);
    expect(script).toMatch(/function Test-PageKept/);
    expect(script).toMatch(/Write-Warning "The page \$\(\$page\['file'\]\) is skipped because the parameter '\$name' is blank/);
    expect(script).toMatch(/names an undeclared parameter '\$name' in skipWhenBlank/);
    // An item that targets a skipped page goes, with a warning, before its {Page:} link can resolve; an in-text link keeps its label alone.
    expect(script).toMatch(/function Test-TargetKept/);
    expect(script).toMatch(/Write-Warning "The item '\$\(\$item\['title'\]\)' on \$where is dropped because it targets/);
    // The filtered list is named first and then passed whole. Wrapping it in a unary comma would hand Resolve-Node
    // an array holding one array, so every block's items would be written one level too deep and the tiles pass
    // would throw on the nested list; a pin on the Where-Object filter alone matches both shapes, so pin the call.
    expect(script).toMatch(/\$keptItems = @\(\$node\[\$key\] \| Where-Object \{ Test-TargetKept \$_ \$where \}\)/);
    expect(script).toMatch(/\$resolved\[\$key\] = Resolve-Node \$keptItems \$where/);
    expect(script).not.toMatch(/Resolve-Node \(,/);
    expect(script).toMatch(/\$skippedPages\.ContainsKey\(\$match\.Groups\[2\]\.Value\)/);
    // A block left with no item at all goes too, so no page draws an empty grid.
    expect(script).toMatch(/every item in it targets a page this run skipped/);
    // The document, the navigation and the page loop all read the same answer, and the summary names what was not built.
    expect(script).toMatch(/if \(-not \(Test-PageKept \$page\)\) \{ continue \}/);
    expect(script).toMatch(/\$skippedPages\.ContainsKey\(\[string\]\$entry\['page'\]\)/);
    expect(script).toMatch(/\$notBuilt \+= \[string\]\$page\['file'\]/);
    expect(script).toMatch(/Not built:/);
    // A page link the run cannot drop (a navigation node, a home page) is an error rather than a broken link.
    expect(script).toMatch(/which this run skipped/);
    // The definition keys the role-start page on PilotTeamName and nothing else.
    const definition: { pages: { key: string; skipWhenBlank?: string; permissions: string }[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    const keyedPages: string[] = definition.pages
      .filter((page: { skipWhenBlank?: string }): boolean => page.skipWhenBlank !== undefined)
      .map((page: { key: string; skipWhenBlank?: string }): string => `${page.key}:${String(page.skipWhenBlank)}`);
    expect(keyedPages).toEqual(['roleStart:PilotTeamName']);
    expect(definition.pages.filter((page: { key: string }): boolean => page.key === 'roleStart')[0].permissions).toBe('groups:PilotGroup');
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

  it('composes roleGroups from the group parameters and writes the Branding properties on every instance', () => {
    // Decision 8: the roles come from site group membership through one property the script sets on every instance.
    // pages.json binds each role id to a group parameter; the script keeps only the pairs whose site group this site
    // carries, so an unfilled or unknown group leaves that role unbound rather than naming a group that is not there.
    const section: string = script.slice(script.indexOf('# Instance properties'), script.indexOf('# List security'));
    expect(section.length).toBeGreaterThan(600);
    expect(section).toMatch(/function Format-RoleGroups/);
    expect(section).toMatch(/function Get-InstanceProperties/);
    expect(section).toMatch(/\$properties\[\$name\] = Resolve-Text \(\[string\]\$page\['instance'\]\[\$name\]\)/);
    expect(section).toMatch(/\$properties\['roleGroups'\] = Format-RoleGroups \$properties\['roleGroups'\]/);
    // The palette is a parameter, never code, and a blank one clears the override so the shipped colours stand.
    expect(section).toMatch(/\$properties\['paletteOverrides'\] = \[string\]\$values\['Palette'\]/);
    // Only a group the site carries is kept, and a malformed pair is dropped on its own; nothing here stops the run.
    expect(section).toMatch(/\$siteGroups\.Values/);
    expect(section).not.toContain('throw');
    // One bag per page, built once and used both for the page the script creates and for the page it updates in place.
    expect(script).toMatch(/\$properties = Get-InstanceProperties \$page/);
    expect(script.match(/Resolve-Text \(\[string\]\$page\['instance'\]/g)).toHaveLength(1);
    const definition: { pages: { key: string; instance: { [name: string]: string } }[]; parameters: { [name: string]: { kind: string } } } = JSON.parse(
      fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8')
    );
    for (const page of definition.pages) {
      expect({ page: page.key, roleGroups: page.instance.roleGroups }).toEqual({
        page: page.key,
        roleGroups: 'leader={LeadersGroup};operator={OperatorsGroup};designAuthority={DesignAuthorityGroup}'
      });
    }
    // The binding lives in the definition: the script names neither a group parameter nor the site group behind it.
    for (const name of ['LeadersGroup', 'OperatorsGroup', 'DesignAuthorityGroup']) {
      expect({ name, kind: definition.parameters[name]?.kind }).toEqual({ name, kind: 'group' });
      expect({ name, inScript: script.indexOf(name) }).toEqual({ name, inScript: -1 });
    }
  });

  it('updates the instance properties of a page that already exists in place, and asks for -Overwrite only when it cannot', () => {
    // 1.0.0.12 left an upgraded site needing -Overwrite (which recycles every page) for contentUrl and the Branding
    // properties. Now a page that exists keeps its content and its browser edits: only the front-door instance's
    // properties are rewritten, and the page is republished.
    expect(pnpParameters.cmdlets['Set-PnPPageWebPart']).toContain('PropertiesJson');
    const branch: string = script.slice(
      script.indexOf('if ($null -ne $existing -and -not $Overwrite)'),
      script.indexOf('# A page open in the browser')
    );
    expect(branch.length).toBeGreaterThan(400);
    expect(branch).toMatch(/Set-PnPPageWebPart -Page \$pageName -Identity \$control\[0\]\.InstanceId -PropertiesJson/);
    expect(branch).toMatch(/ConvertTo-Json -Depth \d+ -Compress/);
    expect(branch).toMatch(/Set-PnPPage -Identity \$pageName -Publish/);
    // Nothing is recycled on this path, and the page's own permissions are reapplied from the definition.
    expect(branch).not.toContain('Remove-PnPPage');
    expect(branch).toMatch(/Set-PagePermission \$file \(\[string\]\$page\['permissions'\]\)/);
    // A page the update cannot reach (no front-door instance, a locked or otherwise refused write) is reported with
    // the way out, and the run goes on.
    expect(branch).toMatch(/Write-Warning "Skipping \$file[^"]*could not be updated[^"]*Rerun with -Overwrite/);
    expect(branch).toMatch(/\$updated \+= \$file/);
    expect(branch).toMatch(/\$skipped \+= \$file/);
    expect(script).toMatch(/Updated:/);
    expect(script).toMatch(/\$updated = @\(\)/);
    // The update comes before the create branch, and only -Overwrite recycles.
    expect(script.indexOf('Set-PnPPageWebPart')).toBeLessThan(script.indexOf('Add-PnPPageWebPart -Page'));
  });

  it('ends with the release and the bindings: every url, optional and group parameter BOUND or AWAITING, never a value', () => {
    // The summary says what this site still owes rather than what it holds: a parameter the operator left blank is
    // AWAITING even where a declared default stands in for it, and a group title the site does not carry is AWAITING
    // because the role behind it stays unbound.
    expect(script).toMatch(/\$releaseId = \[string\]\$values\['ContentRelease'\]/);
    expect(script).toMatch(/Content release: \$releaseId/);
    const summary: string = script.slice(script.indexOf("Write-Host 'Bindings"));
    expect(summary.length).toBeGreaterThan(300);
    expect(summary).toMatch(/Bindings \(every url, optional and group parameter; a value is never printed\)/);
    expect(summary).toMatch(/-notin @\('url', 'optional', 'group'\)/);
    expect(summary).toContain("'BOUND'");
    expect(summary).toContain("'AWAITING'");
    expect(summary).toMatch(/\$siteGroups\.ContainsKey\(\$name\)/);
    expect(summary).toMatch(/\$supplied\[\$name\]/);
    expect(summary).toMatch(/the declared default stands in/);
    // A value never reaches the console: only the name, the kind and the state.
    expect(summary).not.toMatch(/\$values\[\$name\]/);
    // Blankness is recorded before a default is substituted, so a defaulted parameter still reads as awaiting.
    expect(script).toMatch(/\$supplied\[\$name\] = -not \[string\]::IsNullOrWhiteSpace\(\$values\[\$name\]\)/);
    const bindings: number = script.indexOf("Write-Host 'Bindings");
    expect(bindings).toBeGreaterThan(script.indexOf('Set-PnPHomePage'));
    expect(bindings).toBeLessThan(script.search(/^if \(\$locked\.Count -gt 0\) \{\s*throw/m));
  });

  it('writes the release and the bindings onto the document, as names, kinds and states and never as values (1.0.0.14)', () => {
    // The operator plane renders them, so a site owner reads what this content is and what the site still owes
    // without opening the parameter file. The section runs before the upload, from the same three inputs the
    // end-of-run summary prints: the declared kind, whether the run was given a value, and whether the site
    // carries the named group.
    const section: string = script.slice(script.indexOf('# Release and bindings'), script.indexOf('$documentJson ='));
    expect(section.length).toBeGreaterThan(400);
    expect(section).toMatch(/\$document\['release'\] = \[ordered\]@\{ id = \$releaseId/);
    expect(section).toContain("publishedAt =");
    expect(section).toMatch(/ToString\('yyyy-MM-dd'\)/);
    expect(section).toContain('source = $contentPath');
    expect(section).toMatch(/-notin @\('url', 'optional', 'group'\)/);
    expect(section).toMatch(/\$siteGroups\.ContainsKey\(\$name\)/);
    expect(section).toMatch(/\$supplied\[\$name\]/);
    expect(section).toContain("'bound'");
    expect(section).toContain("'awaiting'");
    expect(section).toMatch(/\$document\['bindings'\] = @\(\$bindingRows\)/);
    // The one value a binding row may carry is a qualification receipt reference, which names a record and is no secret.
    expect(section).toMatch(/-like '\*ReceiptRef'/);
    expect(section).toMatch(/\$row\['receiptRef'\] = \[string\]\$values\[\$name\]/);
    // Nothing else of a parameter's value travels: no URL, no group title, no policy reference.
    expect(section.replace(/\$row\['receiptRef'\] = \[string\]\$values\[\$name\]/, '')).not.toMatch(/\$values\[\$name\]/);
    // Both sections are written before the document is serialised and uploaded.
    const release: number = script.indexOf('# Release and bindings');
    expect(release).toBeGreaterThan(script.indexOf("$document['shared']"));
    expect(release).toBeLessThan(script.indexOf('Add-PnPFile'));
    // The readback compares the envelope alone, so the sections the document gained ride along untouched.
    expect(script).toMatch(/\$readBack\['version'\] -ne 1 -or @\(\$readBack\['pages'\]\.Keys\)\.Count -ne \$documentPages\.Count/);
  });

  it('carries the plane and the required role of a page into the document, so a protected page says whose it is', () => {
    // Decision 7: the telemetry strip moved to Operations, a page written for operators; the web part reads `plane` from the document.
    // 1.0.0.14: the same page and the Enterprise value page sit behind site groups and name the role each is written for.
    expect(script).toContain("'plane'");
    expect(script).toMatch(/if \(\$page\.Contains\('plane'\)\) \{ \$documentPage\['plane'\] = \[string\]\$page\['plane'\] \}/);
    expect(script).toContain("'requiredRole'");
    expect(script).toMatch(/if \(\$page\.Contains\('requiredRole'\)\) \{ \$documentPage\['requiredRole'\] = @\(\$page\['requiredRole'\]\) \}/);
    const definition: { pages: { key: string; permissions: string; plane?: string; requiredRole?: string[] }[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    const planes: string[] = definition.pages.filter((page): boolean => page.plane !== undefined).map((page): string => `${page.key}:${String(page.plane)}:${page.permissions}`);
    expect(planes).toEqual(['operations:operator:groups:OperatorsGroup', 'value:operator:groups:LeadersGroup,OperatorsGroup']);
    const roles: string[] = definition.pages
      .filter((page): boolean => page.requiredRole !== undefined)
      .map((page): string => `${page.key}:${(page.requiredRole as string[]).join(',')}`);
    expect(roles).toEqual(['operations:operator', 'value:leader,operator']);
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
    // SharePoint refuses read security on a list carrying a field that enforces unique values, because it cannot tell
    // someone their value collides with a row it will not show them. The feature's own intake key ships that way
    // (`sharepoint/assets/intake-schema.xml`, which this package never rewrites), so the flag is cleared on the site
    // before the list is secured, and every column it clears is named. The key stays indexed and required.
    const clearsUnique: number = script.indexOf('EnforceUniqueValues = $false');
    expect(clearsUnique).toBeGreaterThan(section);
    expect(clearsUnique).toBeLessThan(script.indexOf('Set-PnPList -Identity $title -ReadSecurity 2'));
    expect(script).toMatch(/Get-PnPField -List \$title[\s\S]*?EnforceUniqueValues/);
    expect(script).toMatch(/Set-PnPField -List \$title -Identity [^\n]*-Values @\{ ?EnforceUniqueValues = \$false ?\}/);
    expect(script).toContain('no longer enforces unique values');
    expect(script).toMatch(/item-level read security[^\n]*forbids|forbids[^\n]*unique values/i);
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
    const definition: { listSecurity: { title: string; security: string; fullControlGroups: string[] }[] } = JSON.parse(
      fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8')
    );
    expect(definition.listSecurity).toEqual([
      { title: 'AI CoE Pilot Intakes', security: 'ownItems', fullControlGroups: ['OperatorsGroup'] },
      { title: 'AI CoE Use Cases', security: 'ownItems', fullControlGroups: ['OperatorsGroup'] }
    ]);
    expect(script).not.toContain('AI CoE Pilot Intakes');
    expect(script).not.toContain('AI CoE Use Cases');
    // The run summary reports what was secured and what was skipped.
    expect(script).toMatch(/List security:/);
  });

  it('never lets an absent optional collection collapse to $null, which strict mode turns into a throw mid-run', () => {
    // `$x = if ($c) { @(...) } else { @() }` assigns **$null** when the else branch is taken: an empty array written
    // through `if` is enumerated to nothing on its way to the variable. Under `Set-StrictMode -Version Latest` the
    // next `$x.Count` then throws "The property 'Count' cannot be found on this object" - part-way through a run, on a
    // site the script has already begun to change. A list declaring no `hideFromDefaultView` did exactly that.
    // Wrapping the whole conditional instead, `$x = @(if ($c) { ... })`, yields an empty array either way, and yields
    // a one-element array when the value is a bare string rather than a list.
    expect(script).not.toMatch(/=\s*if\s*\([^\n]*\)\s*\{[^\n]*\}\s*else\s*\{\s*@\(\)\s*\}/);
    // Every optional collection the definition may omit is read through the wrapped form.
    const wrapped: string[] = script.match(/\$\w+ = @\(if \(\$\w+\.Contains\('[A-Za-z]+'\)\)/g) ?? [];
    expect(wrapped.length).toBeGreaterThanOrEqual(6);
  });

  it('grants every site group a listSecurity entry names Full Control on that list, after the owners grant (1.0.0.14)', () => {
    // The 1.0.0.14 provisioning bullet and the README both say an operator reads every request row. ReadSecurity 2
    // trims every principal whose permission level withholds Override List Behaviors, so the grant has to be made on
    // the list itself: a person in the operators group who is not a site owner would otherwise see only the rows they
    // sent, while the page and the README promised the whole queue.
    const section: string = script.slice(script.indexOf('# List security'), script.indexOf('# Lists:'));
    expect(section).toContain("'fullControlGroups'");
    expect(section).toMatch(/Set-PnPListPermission -Identity \$title -Group \$siteGroups\[\$parameterName\] -AddRole \$fullControlRole/);
    // The order inside the entry: the owners first, then the declared groups, then the two flags last.
    const ownersGrant: number = section.indexOf('-Group $owners -AddRole $fullControlRole');
    const groupGrant: number = section.indexOf('-Group $siteGroups[$parameterName] -AddRole $fullControlRole');
    const flags: number = section.indexOf('-ReadSecurity 2 -WriteSecurity 2');
    expect(ownersGrant).toBeGreaterThan(-1);
    expect(ownersGrant).toBeLessThan(groupGrant);
    expect(groupGrant).toBeLessThan(flags);
    // A group this site does not carry is a warning and never a throw, exactly as a page that names it is: the list is
    // still secured and the run goes on.
    expect(section).toMatch(/if \(-not \$siteGroups\.ContainsKey\(\$parameterName\)\) \{[\s\S]{0,400}?Write-Warning[\s\S]{0,400}?continue/);
    expect(section).toContain("Full Control on '$title' not granted");
    // A name that is not a declared 'group' parameter is an authoring error in pages.json, as it is for a page.
    expect(section).toContain("is not a parameter of kind 'group' in pages.json");
    // The group names live in pages.json with the titles; the script carries neither.
    const definition: { listSecurity: { title: string; fullControlGroups: string[] }[]; parameters: { [name: string]: { kind: string } } } = JSON.parse(
      fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8')
    );
    for (const entry of definition.listSecurity) {
      expect(entry.fullControlGroups).toEqual(['OperatorsGroup']);
      for (const name of entry.fullControlGroups) {
        expect(definition.parameters[name].kind).toBe('group');
        expect(script).not.toContain(name);
      }
    }
    // The script's own description says what the section now does, so an operator reading the header is not misled.
    const header: string = script.slice(script.indexOf('List security (since 1.0.0.13)'), script.indexOf('Lists (since 1.0.0.14)'));
    expect(header).toContain("'fullControlGroups'");
    expect(header).toMatch(/Full Control[\s\S]{0,400}?reads every row|reads every row[\s\S]{0,400}?Full Control/);
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

  it('secures a declared list from its own declaration and takes the person columns off its default view (1.0.0.15)', () => {
    // Decision 16: the outcome records list is created by the "Lists" section and must end the run under the same
    // item-level security as the intake lists. The securing itself is written once, as a function in the "List
    // security" section, and called from both places, so the two can never drift apart.
    expect(script).toMatch(/function Set-OwnItemsSecurity/);
    const security: string = script.slice(script.indexOf('# List security'), script.indexOf('# Lists:'));
    expect(security).toMatch(/function Set-OwnItemsSecurity/);
    expect(security).toMatch(/Set-OwnItemsSecurity/);
    const section: string = script.slice(script.indexOf('# Lists:'), script.indexOf('# Content document'));
    expect(section).toMatch(/Set-OwnItemsSecurity/);
    // The declaration is checked in the validation pass, before anything is created: a mode the script does not know,
    // or a group that is not a 'group' parameter, stops the run rather than leaving a list open. The check itself is
    // the one the intake lists go through, so both sections refuse the same declarations.
    const loop: string = 'foreach ($entry in $listDefinitions)';
    const validation: string = section.slice(section.indexOf(loop), section.lastIndexOf(loop));
    expect(validation).toContain("'security'");
    expect(validation).toContain("'fullControlGroups'");
    expect(validation).toContain('Test-OwnItemsDeclaration');
    expect(validation).not.toMatch(/-PnP/);
    expect(security).toMatch(/function Test-OwnItemsDeclaration/);
    expect(security).toContain("expected 'ownItems'");
    expect(security).toContain("is not a parameter of kind 'group' in pages.json");
    // The built-in person columns come off the default view through the view itself; no column and no row is touched.
    expect(section).toContain("'hideFromDefaultView'");
    expect(section).toMatch(/Get-PnPList -Identity \$title -Includes DefaultView/);
    expect(section).toMatch(/\$view\.ViewFields\.Remove\(/);
    expect(section).toMatch(/\$view\.Update\(\)/);
    expect(section).toMatch(/Invoke-PnPQuery/);
    expect(section).not.toMatch(/Remove-PnPField|Remove-PnPList/);
    // Order inside the section: the columns first, then the view, then the security (its two flags last of all).
    const columns: number = section.indexOf('Add-PnPField');
    const view: number = section.indexOf('$view.ViewFields.Remove(');
    const secured: number = section.indexOf('Set-OwnItemsSecurity');
    expect(columns).toBeLessThan(view);
    expect(view).toBeLessThan(secured);
    // The whole section still runs before the document is uploaded.
    expect(secured).toBeGreaterThan(-1);
    expect(script.indexOf('# Lists:')).toBeLessThan(script.indexOf('Add-PnPFile'));
    // The titles, the groups and the hidden columns live in pages.json; the script names none of them.
    const definition: { lists: { title: string; security?: string; fullControlGroups?: string[]; hideFromDefaultView?: string[] }[]; parameters: { [name: string]: { kind: string } } } =
      JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    const secure: { title: string; security?: string; fullControlGroups?: string[]; hideFromDefaultView?: string[] }[] = definition.lists.filter(
      (list: { security?: string }): boolean => list.security !== undefined
    );
    expect(secure).toHaveLength(1);
    expect(secure[0].security).toBe('ownItems');
    expect(secure[0].hideFromDefaultView).toEqual(['Author', 'Editor']);
    for (const name of secure[0].fullControlGroups ?? []) {
      expect(definition.parameters[name].kind).toBe('group');
      expect(script).not.toContain(name);
    }
    for (const column of secure[0].hideFromDefaultView ?? []) {
      expect(section).not.toContain(`'${column}'`);
    }
    // The run summary counts the list among the secured ones, so an operator sees it was not left open.
    expect(script).toMatch(/List security:/);
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
    expect(readme).toContain('## Deploy 1.0.0.17');
    expect(readme).not.toContain('## Deploy 1.0.0.16');
    expect(readme).not.toContain('## Deploy 1.0.0.15');
    expect(readme).not.toContain('Deploy 1.0.0.14');
    expect(readme).not.toContain('Deploy 1.0.0.13');
    expect(readme).not.toContain('Deploy 1.0.0.12');
    expect(readme).not.toContain('Deploy 1.0.0.11');
    expect(readme).toContain('### Rollback');
    expect(readme).toContain('## Lay out the front door across pages');
    expect(readme).toContain('New-FrontDoorPages.ps1');
    expect(readme).toContain('parameters.sample.json');
    expect(readme).toContain('one instance per page');
    // 1.0.0.14: fourteen pages, Prompts out of the navigation, my work on Status, and the two operator pages
    // (Operations with the strip and the bindings, Enterprise value with the measures) behind their site groups.
    // 1.0.0.15 adds the role-start page, which a site without a pilot team name never builds.
    expect(readme).toContain('The sixteen pages');
    expect(readme).not.toContain('The fifteen pages');
    expect(readme).not.toContain('The fourteen pages');
    expect(readme).not.toContain('The thirteen pages');
    expect(readme).not.toContain('The twelve pages');
    expect(readme).toContain('key `operations`');
    expect(readme).toContain('key `value`');
    expect(readme).toContain('key `roleStart`');
    expect(readme).toContain('`skipWhenBlank`');
    expect(readme).toContain('`PilotGroup`');
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
    for (const block of ['hero', 'heading', 'paragraph', 'tiles', 'cards', 'lanes', 'statusRow', 'piece', 'workCommand', 'notice', 'rules', 'supportRoute', 'caseCards', 'kpi', 'workflowCards', 'bindings']) {
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
    // The upgrade path of 1.0.0.13: no -Overwrite, the Operations page is created, the lists are secured first.
    expect(readme).toMatch(/Operations[^.\n]*is created/);
    // Its list security is reverted by hand, which the rollback of the release that followed still says.
    expect(readme).toMatch(/-ReadSecurity 1 -WriteSecurity 1/);
  });

  it('documents what 1.0.0.14 added: the roles, the protected pages, the lists and the palette', () => {
    // The deploy section now names 1.0.0.15 and the README carries one `### Rollback` paragraph, this release's, so
    // what 1.0.0.14 added is held to the sections that describe it: the properties, the groups, the two operator
    // pages, the measures list and the preview switches that show them without a tenant.
    for (const literal of ['roleGroups', 'paletteOverrides', 'groups:', 'LeadersGroup', 'OperatorsGroup', 'Enterprise value', 'AI CoE Program Measures']) {
      expect(readme).toContain(literal);
    }
    // The sentence this release owed the tenant: an operator reads every request row, granted from the
    // `fullControlGroups` of each `listSecurity` entry.
    expect(readme).toMatch(/operators\s+group[\s\S]{0,120}?reads every request row/);
    // The upgrade path: the groups are created first, the script is run without -Overwrite, the properties move in place.
    expect(readme).toMatch(/without `-Overwrite`/);
    expect(readme).toMatch(/updated in place/);
    // The preview switches of this release, so the pages can be seen before a tenant has them.
    expect(readme).toContain('?role=');
    expect(readme).toContain('?palette=');
    expect(readme).toContain('?page=value');
  });

  it('documents the 1.0.0.17 correction candidate, commissioning gates and additive one-page path', () => {
    const deploy: string = readme.slice(readme.indexOf('## Deploy 1.0.0.17'), readme.indexOf('### Enable AI drafting'));
    expect(deploy).toContain('view:app');
    expect(deploy).toContain('New-FrontDoorAppPage.ps1');
    expect(deploy).toContain('marketingParticipant');
    expect(deploy).toContain('LIVE_BINDINGS_REQUIRED.md');
    expect(deploy).toContain('Record a task outcome');
    expect(deploy).toContain('`pageOutcome`');
    expect(deploy).toContain('AI CoE Outcome Records');
    expect(deploy).toContain('PilotGroup');
    expect(deploy).toContain('PilotTeamName');
    expect(deploy).toContain('`skipWhenBlank`');
    expect(deploy).toMatch(/without `-Overwrite`/);
    const rollback: string = deploy.slice(deploy.indexOf('### Rollback'));
    expect(rollback).toContain('explicit rollback authority');
    expect(rollback).toContain('disable business draft entry');
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
    // 1.0.0.14: the operators group reads every row, granted from the entry's own declaration, not from the script.
    expect(readme).toContain('`fullControlGroups`');
    expect(readme).toMatch(/operators\s+group[\s\S]{0,200}?Full Control/i);
    expect(readme).toMatch(/not on this site[\s\S]{0,200}?warning|warning[\s\S]{0,200}?not granted/i);
  });

  it('states the percentage convention wherever an operator meets a measure row: the list description, the Lists paragraph and the kpi row', () => {
    // `content/measures.ts` reads a `%` value between 0 and 1 as a proportion, so Value 1 shows as 100%. The reading is
    // defensible but unguessable, and the Enterprise value page is the one page whose premise is that a number appears
    // only where it was measured: say it where the row is filled in and where a page owner reads what a tile will show.
    const definition: { lists: { title: string; description: string }[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8'));
    expect(definition.lists[0].description).toContain('0.62 for 62%');
    const paragraph: string = readme.slice(readme.indexOf('**Lists (since 1.0.0.14).**'), readme.indexOf('*Additive only.*'));
    expect(paragraph).toContain('0.62 for 62%');
    expect(paragraph).toContain('proportion');
    const kpiRow: string[] = readme.split('\n').filter((line: string): boolean => line.indexOf('| `kpi` (since 1.0.0.14)') === 0);
    expect(kpiRow).toHaveLength(1);
    expect(kpiRow[0]).toContain('proportion');
    expect(kpiRow[0]).toContain('0.62 for 62%');
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

  it('documents the instance-property update of 1.0.0.14, the bindings summary and what -Overwrite recycles', () => {
    expect(readme).toContain('**Instance properties (since 1.0.0.14).**');
    expect(readme).toContain('`Set-PnPPageWebPart -PropertiesJson`');
    expect(readme).toMatch(/updated in place/);
    expect(readme).toMatch(/republish(ed|es)/);
    for (const property of ['`roleGroups`', '`paletteOverrides`', '`contentUrl`']) {
      expect(readme).toContain(property);
    }
    // What the switch costs, so nobody reaches for it to move a property: it recycles every page the definition declares.
    expect(readme).toMatch(/`-Overwrite` recycles pages and nothing else/);
    expect(readme).toContain('the five form pages and the admin page included');
    expect(readme).toMatch(/recycle bin/);
    // The bindings summary: what the site still owes, by name and kind, never a value.
    expect(readme).toContain('BOUND');
    expect(readme).toContain('AWAITING');
    expect(readme).toContain('`ContentRelease`');
    // The 1.0.0.12 caveat is closed: an upgraded site no longer needs -Overwrite to move the instance properties.
    expect(readme).not.toMatch(/which this release's script writes only when it creates a/);
  });

  it('documents the outcome record of 1.0.0.15: its page, its property, its person column and the cohort rule', () => {
    // Decision 16: the page a person records an outcome on, what the row holds, who reads it, and the two things a
    // page owner cannot see from the list itself (SharePoint's own Created By, and why a small group shows no measure).
    expect(readme).toContain('Record a task outcome');
    expect(readme).toContain('key `outcome`');
    expect(readme).toContain('Record-a-task-outcome.aspx');
    expect(readme).toContain('`pageOutcome`');
    expect(readme).toContain('AI CoE Outcome Records');
    expect(readme).toContain('Created By');
    expect(readme).toContain('`minimumCohort`');
    // The promise the page makes to the person, and the one wizard it does not cover.
    expect(readme).toMatch(/prompt[^.]*never/i);
    expect(readme).toMatch(/feedback[\s\S]{0,200}?kept as text/i);
    // Where the person is told: the notice on Start here carries the same sentence the page does.
    const definition: { pages: { key: string; blocks?: { type: string; title?: string; text?: string }[] }[] } = JSON.parse(
      fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8')
    );
    const startHere: { type: string; title?: string; text?: string }[] =
      definition.pages.filter((page: { key: string }): boolean => page.key === 'startHere')[0].blocks ?? [];
    const notice: { text?: string } | undefined = startHere.filter(
      (block: { type: string; title?: string }): boolean => block.type === 'notice' && block.title === 'What this site records'
    )[0];
    expect(notice).toBeDefined();
    expect(readme).toContain(String((notice as { text: string }).text));
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

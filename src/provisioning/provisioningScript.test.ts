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
    expect(script).toContain("-notin @('text', 'url', 'optional')");
    expect(script).toContain("expected 'text', 'url' or 'optional'");
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
    expect(readme).toContain('## Deploy 1.0.0.11');
    expect(readme).not.toContain('Deploy 1.0.0.10');
    expect(readme).toContain('## Lay out the front door across pages');
    expect(readme).toContain('New-FrontDoorPages.ps1');
    expect(readme).toContain('parameters.sample.json');
    expect(readme).toContain('one instance per page');
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
    for (const block of ['hero', 'heading', 'paragraph', 'tiles', 'cards', 'lanes', 'statusRow', 'piece', 'workCommand', 'notice', 'rules', 'supportRoute']) {
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
    expect(readme).toContain('src/provisioning/tenantWords.json');
    expect(readme).toContain('deliberately not tenant-neutral');
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

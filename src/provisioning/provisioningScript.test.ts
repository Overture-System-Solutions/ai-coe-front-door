/**
 * Static checks on the operator script that applies the page definition (it cannot run offline) and
 * on the README that documents the page layout.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT: string = process.cwd();
const PAGES_DIR: string = path.join(ROOT, 'sharepoint/pages');
const script: string = fs.readFileSync(path.join(PAGES_DIR, 'New-FrontDoorPages.ps1'), 'utf8');
const readme: string = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

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

  it('ships tenant-neutral', () => {
    // Only the committed files: an operator's filled-in parameters.json may name the tenant.
    for (const file of ['New-FrontDoorPages.ps1', 'pages.json', 'parameters.sample.json']) {
      const text: string = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
      expect(text).not.toMatch(/overture|tegria|cloudwave/i);
      expect(text).not.toMatch(/[a-z0-9-]+\.sharepoint\.com/i);
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
    for (const block of ['hero', 'heading', 'paragraph', 'tiles', 'cards', 'lanes', 'statusRow', 'piece']) {
      expect(readme).toContain(`\`${block}\``);
    }
    expect(readme).toContain('[label](href)');
    expect(readme).toContain('**bold**');
    expect(readme).toContain('*italic*');
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

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
});

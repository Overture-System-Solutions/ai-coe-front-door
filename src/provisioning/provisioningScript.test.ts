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
      'Add-PnPPage',
      'Add-PnPPageSection',
      'Add-PnPPageTextPart',
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
  });

  it('declares the parameters and handles every token kind', () => {
    expect(script).toContain('param(');
    for (const name of ['SiteUrl', 'ParameterFile', 'OrganizationName', 'DraftServiceUrl', 'TelemetryProvider', 'Overwrite', 'ClientId']) {
      expect(script).toMatch(new RegExp(`\\$${name}\\b`));
    }
    expect(script).toContain('{Page:');
    expect(script).toContain('{Url:');
    expect(script).toContain('Write-Warning');
    expect(script).toContain("'url'");
    expect(script).toContain("'text'");
  });

  it('ships tenant-neutral', () => {
    // Only the committed files: an operator's filled-in parameters.json or captured templates may name the tenant.
    for (const file of ['New-FrontDoorPages.ps1', 'pages.json', 'parameters.sample.json']) {
      const text: string = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
      expect(text).not.toMatch(/overture|tegria|cloudwave/i);
      expect(text).not.toMatch(/[a-z0-9-]+\.sharepoint\.com/i);
    }
    expect(script).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('degrades without the captured native web part templates', () => {
    expect(script).toContain('quicklinks.template.json');
    expect(script).toContain('button.template.json');
    expect(script).toContain('DefaultWebPartType');
  });

  it('protects the site: checks the component and templates first, recycles on overwrite, refuses other site types', () => {
    expect(script).toContain('Get-PnPPageComponent');
    expect(script).toContain('-Recycle');
    expect(script).toContain('AllowNonCommunicationSite');
    expect(script).toMatch(/example\\\.invalid/);
    expect(script).toContain('%7BUrl%7D');
    expect(script).toContain("'serverProcessedContent'");
    expect(script).toContain('target="_blank"');
    expect(script).toContain('Get-OptionalProperty $control');
    expect(script).toContain("PSObject.Properties[$name]");
  });
});

describe('README', () => {
  it('documents the current package and the page layout', () => {
    expect(readme).toContain('## Deploy 1.0.0.10');
    expect(readme).not.toContain('Deploy 1.0.0.9');
    expect(readme).toContain('## Lay out the front door across pages');
    expect(readme).toContain('New-FrontDoorPages.ps1');
    expect(readme).toContain('parameters.sample.json');
    expect(readme).toContain('one instance per page');
    expect(readme).toContain('-ClientId');
    expect(readme).toContain('recycle bin');
    expect(readme).toContain('serverProcessedContent');
    expect(readme).toContain('AllowNonCommunicationSite');
  });
});

/**
 * Additive one-page app definition: exactly one view:app instance, no QuickLaunch replacement, no Overwrite.
 * pages.json stays the sixteen-page layout with zero app instances.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT: string = process.cwd();
const PAGES: string = path.join(ROOT, 'sharepoint/pages/pages.json');
const APP: string = path.join(ROOT, 'sharepoint/pages/one-page/app-page.json');
const SCRIPT: string = path.join(ROOT, 'sharepoint/pages/one-page/New-FrontDoorAppPage.ps1');

interface IPagesDoc {
  pages: { instance: { view: string } }[];
}

interface IAppDoc {
  pages: { key: string; file: string; instance: { view: string; roleGroups: string } }[];
}

describe('one-page additive app definition', () => {
  it('leaves the sixteen-page definition with zero app instances', () => {
    const pages: IPagesDoc = JSON.parse(fs.readFileSync(PAGES, 'utf8')) as IPagesDoc;
    expect(pages.pages.length).toBe(16);
    expect(pages.pages.filter((page: { instance: { view: string } }): boolean => page.instance.view === 'app').length).toBe(0);
  });

  it('declares exactly one view:app instance on an explicit page file token', () => {
    const app: IAppDoc = JSON.parse(fs.readFileSync(APP, 'utf8')) as IAppDoc;
    expect(app.pages.length).toBe(1);
    expect(app.pages[0].instance.view).toBe('app');
    expect(app.pages[0].file).toBe('{PageFile}');
    expect(app.pages[0].instance.roleGroups).toContain('marketingParticipant=');
    expect(app.pages[0].instance.roleGroups).toContain('marketingReviewer=');
  });

  it('offers dry-run and binding checks and refuses Overwrite, QuickLaunch replacement and implicit apply', () => {
    const script: string = fs.readFileSync(SCRIPT, 'utf8');
    expect(script).toContain('$DryRun');
    expect(script).toContain('$CheckBindings');
    expect(script).toContain('ApplyToSite is not authorized');
    expect(script).not.toMatch(/\$Overwrite/);
    expect(script).toMatch(/No QuickLaunch|does not replace QuickLaunch|never replaces QuickLaunch/);
    expect(script).not.toMatch(/Set-PnPNavigation|Add-PnPNavigation|Remove-PnPNavigation/);
    expect(script).toMatch(/\[CmdletBinding\(PositionalBinding = \$false\)\]/);
  });
});

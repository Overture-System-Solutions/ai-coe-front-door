# One-page Front Door (additive)

Places **one** `view:app` instance on an explicitly named Site Pages file. It does not run `New-FrontDoorPages.ps1`,
does not rebuild QuickLaunch, and has no `-Overwrite`.

This local work authorizes **dry-run and binding checks only**. Do not run `-ApplyToSite` against a tenant from here.

```
pwsh ./New-FrontDoorAppPage.ps1 -DryRun -CheckBindings -ParameterFile ./parameters.sample.json
```

Existing sixteen-page `pages.json` is unchanged.

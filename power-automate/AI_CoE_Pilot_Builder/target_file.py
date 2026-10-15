"""Read one tenant's target file.

A target file holds only the values that belong to a tenant: its site, who is notified, who may call the case
analysis, its Claude connector's runtime name, two descriptions and where the packages are written. Names,
publisher and versions come from the profile it names (profiles.py):

  pilot   the names the first client pilot was delivered with (publisher OSSCloudWaveDemoPublisher, prefix cwdd)
  aicoe   the tenant-neutral template names (publisher AICoETemplate, prefix aicoe)

The committed targets/template.json is a reference build: placeholder values, packages labelled not for import.
A real tenant copies it OUTSIDE this repository (for example development/power-automate/local-targets/), fills in
its own values, sets "reference_build" to false and builds there. Client target files are never committed.
"""
import json
import re
from dataclasses import dataclass
from pathlib import Path

PROFILES = ('pilot', 'aicoe')
FIELDS = ('key', 'profile', 'reference_build', 'organization', 'site', 'recipients', 'case_analysis_allowed_users',
          'connector_api_name', 'governance_description', 'copilot_submission_description', 'output_folder')
SITE_PATTERN = re.compile(r'https://[A-Za-z0-9-]+\.sharepoint\.com/sites/[A-Za-z0-9._-]+')
EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+")
# The connector's runtime name is assigned per environment when the connector is imported. The pilot's connector
# is OSS's (display name "OSS Claude Intake Draft"); the template's is "AI CoE Claude Draft" with prefix aicoe.
API_PATTERNS = {
    'pilot': re.compile(r'shared_cwdd-5foss-20claude-20intake-20draft-5f[0-9a-f]{8,40}'),
    'aicoe': re.compile(r'shared_aicoe-5f[0-9a-z-]+'),
}
PLACEHOLDER_API = {
    'pilot': 'shared_cwdd-5foss-20claude-20intake-20draft-5f0000000000000000',
    'aicoe': 'shared_aicoe-5fai-20coe-20claude-20draft-5f0000000000000000',
}
# Values that mark a placeholder; a build meant for import refuses them (the case-analysis packager does too).
PLACEHOLDER_MARKERS = ('contoso', 'fabrikam', 'example', 'placeholder', 'your-', 'yourtenant', 'changeme', '0000000000000000')


@dataclass(frozen=True)
class Target:
    key: str
    profile: str
    reference_build: bool
    organization: str
    site: str
    recipients: str
    case_analysis_allowed_users: str
    connector_api_name: str
    governance_description: str
    copilot_submission_description: str
    output_folder: Path
    source: Path

    @property
    def site_host(self):
        return self.site.split('/')[2].lower()

    @property
    def addresses(self):
        return {a.lower() for a in (self.recipients + ';' + self.case_analysis_allowed_users).split(';')}


def _addresses(field, value):
    if not isinstance(value, str) or not value:
        raise ValueError('%s: give one or more addresses separated by ";"' % field)
    for part in value.split(';'):
        if not EMAIL_PATTERN.fullmatch(part):
            raise ValueError('%s: %r is not an address (separate addresses with ";" and no spaces)' % (field, part))
    return value


def load(path):
    path = Path(path).resolve()
    values = json.loads(path.read_text(encoding='utf-8'))
    unknown = sorted(set(values) - set(FIELDS))
    missing = sorted(set(FIELDS) - set(values))
    if unknown:
        raise ValueError('%s: unknown keys %s' % (path.name, unknown))
    if missing:
        raise ValueError('%s: missing keys %s' % (path.name, missing))
    profile = values['profile']
    if profile not in PROFILES:
        raise ValueError('profile: %r is not one of %s' % (profile, PROFILES))
    reference = values['reference_build']
    if not isinstance(reference, bool):
        raise ValueError('reference_build: true or false')
    site = values['site']
    if not isinstance(site, str) or not SITE_PATTERN.fullmatch(site):
        raise ValueError('site: give the site URL as https://<tenant>.sharepoint.com/sites/<site>')
    recipients = _addresses('recipients', values['recipients'])
    users = _addresses('case_analysis_allowed_users', values['case_analysis_allowed_users'])
    api = values['connector_api_name']
    if reference:
        if api is not None:
            raise ValueError('connector_api_name: a reference build uses the placeholder name; leave it null')
        api = PLACEHOLDER_API[profile]
    else:
        if not isinstance(api, str) or not api:
            raise ValueError('connector_api_name: copy the imported connector runtime name from its page address')
        if not API_PATTERNS[profile].fullmatch(api):
            raise ValueError('connector_api_name: %r is not a %s connector runtime name' % (api, profile))
        for label, value in (('site', site), ('recipients', recipients), ('case_analysis_allowed_users', users),
                             ('connector_api_name', api)):
            marker = next((m for m in PLACEHOLDER_MARKERS if m in value.lower()), None)
            if marker:
                raise ValueError('%s: %r looks like a placeholder (%r); a build for import needs real values' % (label, value, marker))
    for field in ('key', 'organization', 'governance_description', 'copilot_submission_description', 'output_folder'):
        if not isinstance(values[field], str) or not values[field].strip():
            raise ValueError('%s: required text' % field)
    return Target(key=values['key'], profile=profile, reference_build=reference, organization=values['organization'],
                  site=site, recipients=recipients, case_analysis_allowed_users=users, connector_api_name=api,
                  governance_description=values['governance_description'],
                  copilot_submission_description=values['copilot_submission_description'],
                  output_folder=(path.parent / values['output_folder']).resolve(), source=path)

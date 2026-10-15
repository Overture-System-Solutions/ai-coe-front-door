"""An in-memory stand-in for the target site's SharePoint REST API, for local flow runs only.

It is a FAKE: its answers are not Microsoft responses. It enforces the column definitions the real lists are
created with, so a flow that sends an unknown column, a wrong type, an over-long text or a missing required
value fails here the way SharePoint would refuse it:

- AI CoE Pilot Intakes: the front door package's own intake-schema.xml (read from the front-door source);
- AI CoE Use Cases: the field list in Provisioning (the target's 02 workflows package, 02_*.zip).
"""
import json
import re
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import build_copilot_submission as builder

HERE = Path(__file__).resolve().parent
FRONT_DOOR = builder.find_front_door()
SITE = builder.SITE
SP_API = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'

KIND_BY_SP_TYPE = {'Text': 'Text', 'Note': 'Note', 'Boolean': 'Boolean', 'DateTime': 'DateTime', 'Choice': 'Choice',
                   'Number': 'Number', 'User': 'User'}
KIND_BY_FIELD_TYPE_KIND = {2: 'Text', 3: 'Note', 4: 'DateTime', 8: 'Boolean', 9: 'Number'}


def _local(tag):
    return tag.rsplit('}', 1)[-1]


def intake_fields():
    if FRONT_DOOR is None:
        raise FileNotFoundError('the fake needs the front-door source: set AICOE_FRONT_DOOR to a checkout of it')
    root = ET.fromstring((FRONT_DOOR / 'sharepoint' / 'assets' / 'intake-schema.xml').read_bytes())
    fields = {'Title': {'kind': 'Text', 'max': 255, 'required': True}}
    for field in (e for e in root.iter() if _local(e.tag) == 'Field'):
        spec = {'kind': KIND_BY_SP_TYPE[field.get('Type')], 'required': field.get('Required') == 'TRUE',
                'unique': field.get('EnforceUniqueValues') == 'TRUE', 'max': int(field.get('MaxLength', '255'))}
        if spec['kind'] == 'Choice':
            spec['choices'] = [c.text for c in field.iter() if _local(c.tag) == 'CHOICE']
        fields[field.get('Name')] = spec
    return fields


def use_case_fields():
    packages = sorted(builder.DELIVERY.glob('02_*.zip'))
    if len(packages) != 1:
        raise FileNotFoundError('expected one 02 workflows package in %s, found %d' % (builder.DELIVERY, len(packages)))
    with zipfile.ZipFile(packages[0]) as archive:
        provisioning = [n for n in archive.namelist() if n.startswith('Workflows/') and 'SharePointProvisioning' in n]
        flow = json.loads(archive.read(provisioning[0]).decode('utf-8-sig'))
    lists = flow['properties']['definition']['actions']['List_definitions']['inputs']
    definition = [entry for entry in lists if entry['title'] == 'AI CoE Use Cases'][0]
    fields = {'Title': {'kind': 'Text', 'max': 255, 'required': False}}
    for field in definition['fields']:
        fields[field['internalName']] = {'kind': KIND_BY_FIELD_TYPE_KIND[field['fieldTypeKind']], 'required': False, 'max': 255}
    return fields


_ISO = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$')
_LIST_PATH = re.compile(r"^_api/web/lists/getbytitle\('((?:[^']|'')*)'\)/items(?:\((\d+)\))?$")
_GROUP_PATH = re.compile(r"^_api/web/sitegroups/getbyname\('((?:[^']|'')*)'\)/users$")
_FILTER_TERM = re.compile(r"^(\w+) eq '((?:[^']|'')*)'$")


def _error(code, message):
    return code, {'odata.error': {'code': str(code), 'message': {'lang': 'en-US', 'value': message}}}


class FakeSharePoint:
    def __init__(self):
        self.schemas = {'AI CoE Pilot Intakes': intake_fields(), 'AI CoE Use Cases': use_case_fields()}
        self.items = {title: [] for title in self.schemas}
        self.groups = {}
        self.next_id = 1
        self.calls = []
        self.fail_post = {}          # list title -> status code for the next POST to it
        self.hide_intake_reads = 0   # how many intake reads by IntakeId should come back empty
        self.clock = '2026-10-09T14:03:13Z'

    # ------------------------------------------------------------ connector entry point
    def __call__(self, action_name, host, parameters):
        if host.get('apiId') != SP_API or host.get('operationId') != 'HttpRequest' or host.get('connectionName') != 'shared_sharepointonline':
            raise AssertionError('%s: unexpected connector host %r' % (action_name, host))
        if parameters.get('dataset') != builder.SITE:
            raise AssertionError('%s: wrong site %r' % (action_name, parameters.get('dataset')))
        headers = parameters.get('parameters/headers', {})
        if headers.get('Accept') != 'application/json;odata=nometadata':
            raise AssertionError('%s: expected nometadata JSON' % action_name)
        method, uri = parameters['parameters/method'], parameters['parameters/uri']
        body = parameters.get('parameters/body')
        self.calls.append((action_name, method, uri, body))
        path, _, query = uri.partition('?')
        options = {}
        for part in query.split('&') if query else []:
            key, _, value = part.partition('=')
            options[urllib.parse.unquote(key)] = urllib.parse.unquote(value)
        group = _GROUP_PATH.match(path)
        if group and method == 'GET':
            name = group.group(1).replace("''", "'")
            if name not in self.groups:
                return _error(404, 'Group cannot be found.')
            return 200, {'value': [dict(u) for u in self.groups[name]]}
        match = _LIST_PATH.match(path)
        if not match:
            raise AssertionError('%s: unsupported uri %r' % (action_name, uri))
        title, item_id = match.group(1).replace("''", "'"), match.group(2)
        if title not in self.schemas:
            return _error(404, "List '%s' does not exist." % title)
        if method == 'POST' and item_id is None:
            if headers.get('Content-Type') != 'application/json;odata=nometadata':
                raise AssertionError('%s: POST without nometadata content type' % action_name)
            return self._create(title, body)
        if method == 'GET':
            return self._read(title, item_id, options)
        raise AssertionError('%s: unsupported %s %s' % (action_name, method, uri))

    # ------------------------------------------------------------ operations
    def _create(self, title, body):
        if title in self.fail_post:
            return _error(self.fail_post.pop(title), 'Injected failure')
        if not isinstance(body, dict):
            return _error(400, 'The body must be a JSON object, got %r' % type(body).__name__)
        schema = self.schemas[title]
        for key, value in body.items():
            if key not in schema:
                return _error(400, "The property '%s' does not exist on type 'SP.Data.ListItem'." % key)
            problem = self._check(key, schema[key], value)
            if problem:
                return _error(400, problem)
        for key, spec in schema.items():
            if spec.get('required') and body.get(key) in (None, ''):
                return _error(400, 'Required field %s is missing.' % key)
            if spec.get('unique') and any(item.get(key) == body.get(key) for item in self.items[title]):
                return _error(400, 'Duplicate value for unique field %s.' % key)
        item = dict(body)
        item['Id'] = self.next_id
        item['Created'] = item['Modified'] = self.clock
        self.next_id += 1
        self.items[title].append(item)
        return 201, self._render(title, item)

    @staticmethod
    def _check(key, spec, value):
        kind = spec['kind']
        if kind in ('Text', 'Note', 'Choice'):
            if not isinstance(value, str):
                return '%s expects text, got %r' % (key, value)
            if kind == 'Text' and len(value.encode('utf-16-le')) // 2 > spec['max']:
                return '%s is longer than %d characters' % (key, spec['max'])
            if kind == 'Choice' and value not in spec['choices']:
                return '%s: %r is not one of %s' % (key, value, spec['choices'])
        elif kind == 'Boolean':
            if not isinstance(value, bool):
                return '%s expects true or false, got %r' % (key, value)
        elif kind == 'Number':
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return '%s expects a number, got %r' % (key, value)
        elif kind == 'DateTime':
            if not isinstance(value, str) or not _ISO.match(value):
                return '%s expects an ISO date, got %r' % (key, value)
        else:
            return '%s cannot be written here' % key
        return None

    def _render(self, title, item):
        out = {}
        for key, value in item.items():
            spec = self.schemas[title].get(key)
            if spec and spec['kind'] == 'DateTime' and isinstance(value, str):
                value = value[:19] + 'Z'
            out[key] = value
        return out

    def _read(self, title, item_id, options):
        rows = self.items[title]
        if item_id is not None:
            found = [r for r in rows if r['Id'] == int(item_id)]
            if not found:
                return _error(404, 'Item does not exist.')
            return 200, self._select(title, found[0], options)
        if '$filter' in options:
            terms = options['$filter'].split(' and ')
            for term in terms:
                match = _FILTER_TERM.match(term)
                if not match:
                    raise AssertionError('unsupported $filter term %r' % term)
                field, value = match.group(1), match.group(2).replace("''", "'")
                if field not in self.schemas[title] and field != 'Id':
                    return _error(400, "Column '%s' does not exist." % field)
                rows = [r for r in rows if str(r.get(field, '')).lower() == value.lower()]
                if field == 'IntakeId' and title == 'AI CoE Pilot Intakes' and self.hide_intake_reads:
                    self.hide_intake_reads -= 1
                    rows = []
        if options.get('$orderby') == 'Id desc':
            rows = sorted(rows, key=lambda r: -r['Id'])
        elif '$orderby' in options:
            raise AssertionError('unsupported $orderby %r' % options['$orderby'])
        if '$top' in options:
            rows = rows[:int(options['$top'])]
        return 200, {'value': [self._select(title, r, options) for r in rows]}

    def _select(self, title, row, options):
        rendered = self._render(title, row)
        if '$select' not in options:
            return rendered
        fields = options['$select'].split(',')
        for field in fields:
            if field not in self.schemas[title] and field not in ('Id', 'Created', 'Modified'):
                raise AssertionError('$select of unknown column %r' % field)
        return {f: rendered.get(f) for f in fields}

    # ------------------------------------------------------------ helpers for tests
    def rows(self, title):
        return [dict(r) for r in self.items[title]]

    def writes(self):
        return [c for c in self.calls if c[1] == 'POST']

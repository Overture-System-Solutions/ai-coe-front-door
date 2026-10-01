"""The front door's own lists, created by the SharePoint Provisioning flow.

The front door reads AI CoE Program Measures (the Enterprise value tab), writes AI CoE Outcome Records (Record a
task outcome) and saves every form to AI CoE User Drafts before it submits. Its PnP installers create them; a
site without PnP access gets them from the provisioning flow instead.
  - Program Measures and Outcome Records come from front_door_lists.json, a copy of the pages.json "lists"
    entries (checks.py compares it with pages.json when the front-door source is beside this builder).
  - AI CoE User Drafts mirrors sharepoint/pages/one-page/New-FrontDoorDraftList.ps1 (DRAFTS below; checks.py
    compares it with the installer's schema): the same columns and field XML, Title indexed but not unique,
    attachments and versioning off, and each person reading and editing only their own drafts. What the flow
    does not reproduce is the installer's permission model (a private controller group with Full Control and a
    writer group limited to read, add and edit): the list inherits the site's permissions, so site members use
    it and can delete their own drafts, and site owners read every draft.

  - AI CoE Approved Tools (front door 1.0.0.18) comes from the snapshot too; it is 'readOnly': everyone reads every
    row and only owners and the operators group write, so the flow grants that group Full Control on the list.

The changes to the provisioning flow, nothing else:
  1. the three lists are appended to List_definitions, each field carrying its full SharePoint schema;
  2. Create_field uses a field's own schema when it has one and otherwise builds it exactly as before, so the
     nine existing lists are created unchanged;
  3. after its fields, a list may be given three settings, in the installer's order and each only when its
     definition asks: attachments and versioning off, the Title column indexed, and item-level security (each
     person reads and edits only their own items). Setting any of them twice changes nothing.
  4. a 'readOnly' list then has its inheritance broken (only while it still inherits), the operators group - found by
     a filter, so a missing group is an empty answer and not a failure - given Full Control on it, and
     ReadSecurity 1 / WriteSecurity 4 set last, as the installer's Set-ReadOnlySecurity does.
The front door's installer also hides Created By and Modified By from Outcome Records' default view; the flow
adds no field to a default view at all, so there is nothing to hide.
"""
import copy
import json
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

HERE = Path(__file__).resolve().parent
SNAPSHOT = HERE / 'front_door_lists.json'
FRONT_DOOR = HERE.parent.parent / 'overture-ai-coe-front-door-audit-fixes'
PAGES_JSON = FRONT_DOOR / 'sharepoint' / 'pages' / 'pages.json'
DRAFT_INSTALLER = FRONT_DOOR / 'sharepoint' / 'pages' / 'one-page' / 'New-FrontDoorDraftList.ps1'
FIELD_KINDS = {'Text': 2, 'Note': 3, 'DateTime': 4, 'Choice': 6, 'Boolean': 8, 'Number': 9}
FIELD_EXPRESSION = "items('For_each_field')?['schemaXml']"

DRAFTS_TITLE = 'AI CoE User Drafts'
DRAFTS_DESCRIPTION = ('Server-side drafts of unsubmitted front-door requests. Each person reads and edits only their '
                      'own. Nothing here is a submission; the front door clears a draft once its request is saved.')
# The installer's schema: name, type and the extra field XML it adds (Title is the list's own column).
DRAFTS = [
    ('WorkflowId', 'Text', ''),
    ('DraftJson', 'Note', ' RichText="FALSE" AppendOnly="FALSE" NumLines="6"'),
    ('IsCleared', 'Boolean', ''),
    ('RetentionPolicyRef', 'Text', ''),
    ('AccessPolicyRef', 'Text', ''),
    ('ExpiresAt', 'DateTime', ' Format="DateTime"'),
]

LIST_URI = "@concat('_api/web/lists/getbytitle(''', replace(items('For_each_list')?['title'],'''',''''''), ''')')"
TITLE_URI = ("@concat('_api/web/lists/getbytitle(''', replace(items('For_each_list')?['title'],'''',''''''), "
             "''')/fields/getbyinternalnameortitle(''Title'')')")
# (definition flag, condition action, inner action, uri, body), run in this order after the list's fields.
SETTINGS = [
    ('noAttachmentsOrVersions', 'If_no_attachments_or_versions', 'Turn_off_attachments_and_versions', LIST_URI,
     {'__metadata': {'type': 'SP.List'}, 'EnableAttachments': False, 'EnableVersioning': False}),
    ('indexTitle', 'If_index_title', 'Index_title', TITLE_URI,
     {'__metadata': {'type': 'SP.Field'}, 'Indexed': True}),
    ('itemLevelSecurity', 'If_item_level_security', 'Set_item_level_security', LIST_URI,
     {'__metadata': {'type': 'SP.List'}, 'ReadSecurity': 2, 'WriteSecurity': 2}),
]

# 'readOnly' (the approved tools, front door 1.0.0.18): everyone reads every row, only owners and the operators group
# write. The installer's order: break the inheritance keeping its grants (only when the list still inherits), give the
# operators group Full Control on the list (found by a filter, so a site without the group answers an empty list and
# the run goes on; Full Control found by its role type, never by a literal id), then ReadSecurity 1 / WriteSecurity 4.
READ_ONLY_FLAG = 'readOnlyItems'
READ_ONLY_STEP = 'If_read_only_items'
READ_ONLY_BODY = {'__metadata': {'type': 'SP.List'}, 'ReadSecurity': 1, 'WriteSecurity': 4}
READ_ONLY_INHERITANCE_URI = LIST_URI[:-2] + "?$select=HasUniqueRoleAssignments')"
BREAK_URI = LIST_URI[:-2] + "/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)')"
GROUP_URI = ("@concat('_api/web/sitegroups?$select=Id&$filter=', encodeUriComponent(concat('Title eq ''', "
             "replace(items('For_each_list')?['fullControlGroup'],'''',''''''), '''')))")
FULL_CONTROL_URI = '_api/web/roledefinitions/getbytype(5)?$select=Id'
GRANT_URI = ("@concat('_api/web/lists/getbytitle(''', replace(items('For_each_list')?['title'],'''',''''''), "
             "''')/roleassignments/addroleassignment(principalid=', string(first(body('Find_operators_group')?['value'])?['Id']), "
             "',roledefid=', string(body('Find_full_control')?['Id']), ')')")
READ_HEADERS = {'Accept': 'application/json;odata=nometadata'}
POST_HEADERS = {'Accept': 'application/json;odata=nometadata'}


def snapshot():
    return json.loads(SNAPSHOT.read_text(encoding='utf-8'))


def schema_xml(field):
    """The SharePoint field schema for one pages.json field, as the sixteen-page installer would create it."""
    name = field['name']
    attributes = [('Type', field['type']), ('DisplayName', name), ('Name', name), ('StaticName', name),
                  ('Required', 'TRUE' if field.get('required') else 'FALSE')]
    if field.get('unique') or field.get('indexed'):
        attributes.append(('Indexed', 'TRUE'))
    if field.get('unique'):
        attributes.append(('EnforceUniqueValues', 'TRUE'))
    if field['type'] == 'Note':
        attributes += [('NumLines', '6'), ('RichText', 'FALSE')]
    if field['type'] == 'Choice':
        attributes.append(('Format', 'Dropdown'))
    head = '<Field ' + ' '.join('%s=%s' % (key, quoteattr(value)) for key, value in attributes)
    if field['type'] != 'Choice':
        return head + ' />'
    choices = ''.join('<CHOICE>%s</CHOICE>' % escape(choice) for choice in field['choices'])
    return head + '><CHOICES>' + choices + '</CHOICES></Field>'


def draft_schema_xml(name, kind, extra):
    """The drafts installer's own field XML, character for character."""
    return ('<Field Type="' + kind + '" Name="' + name + '" StaticName="' + name + '" DisplayName="' + name +
            '" Required="FALSE" EnforceUniqueValues="FALSE"' + extra + ' />')


def list_definitions(operators_group=None):
    """The front door's lists in the provisioning flow's own definition shape, plus schemas and settings flags."""
    definitions = []
    for entry in snapshot():
        definition = {'title': entry['title'], 'description': entry['description'], 'fields': []}
        for field in entry['fields']:
            if field['type'] not in FIELD_KINDS:
                raise ValueError('Unsupported field type ' + field['type'])
            definition['fields'].append({'title': field['name'], 'internalName': field['name'],
                                         'fieldTypeKind': FIELD_KINDS[field['type']], 'schemaXml': schema_xml(field)})
        if entry.get('security') == 'ownItems':
            definition['itemLevelSecurity'] = True
        elif entry.get('security') == 'readOnly':
            if not operators_group:
                raise ValueError(entry['title'] + ' is read-only: the target must name its operators group')
            definition[READ_ONLY_FLAG] = True
            definition['fullControlGroup'] = operators_group
        elif 'security' in entry:
            raise ValueError('Unknown list security ' + entry['security'])
        definitions.append(definition)
    definitions.append({
        'title': DRAFTS_TITLE, 'description': DRAFTS_DESCRIPTION,
        'fields': [{'title': name, 'internalName': name, 'fieldTypeKind': FIELD_KINDS[kind],
                    'schemaXml': draft_schema_xml(name, kind, extra)} for name, kind, extra in DRAFTS],
        'noAttachmentsOrVersions': True, 'indexTitle': True, 'itemLevelSecurity': True,
    })
    return definitions


def settings_action(site, flag, inner, uri, body, after):
    return {
        'runAfter': {after: ['Succeeded']},
        'type': 'If',
        'expression': "@equals(items('For_each_list')?['%s'], true)" % flag,
        'actions': {
            inner: {
                'runAfter': {},
                'type': 'OpenApiConnection',
                'inputs': {
                    'host': {'apiId': '/providers/Microsoft.PowerApps/apis/shared_sharepointonline',
                             'connectionName': 'shared_sharepointonline', 'operationId': 'HttpRequest'},
                    'parameters': {
                        'dataset': site,
                        'parameters/method': 'POST',
                        'parameters/uri': uri,
                        'parameters/headers': {'Accept': 'application/json;odata=verbose',
                                               'Content-Type': 'application/json;odata=verbose',
                                               'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE'},
                        'parameters/body': copy.deepcopy(body),
                    },
                },
            }
        },
        'else': {'actions': {}},
    }


def http_action(site, method, uri, after, headers, body=None):
    """One "Send an HTTP request to SharePoint" action, in the shape the settings actions already use."""
    parameters = {'dataset': site, 'parameters/method': method, 'parameters/uri': uri,
                  'parameters/headers': dict(headers)}
    if body is not None:
        parameters['parameters/body'] = copy.deepcopy(body)
    return {
        'runAfter': {after: ['Succeeded']} if after else {},
        'type': 'OpenApiConnection',
        'inputs': {
            'host': {'apiId': '/providers/Microsoft.PowerApps/apis/shared_sharepointonline',
                     'connectionName': 'shared_sharepointonline', 'operationId': 'HttpRequest'},
            'parameters': parameters,
        },
    }


def read_only_action(site, after):
    """The readOnly steps for one list, run only when its definition asks, in the installer's order."""
    merge = {'Accept': 'application/json;odata=verbose', 'Content-Type': 'application/json;odata=verbose',
             'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE'}
    return {
        'runAfter': {after: ['Succeeded']},
        'type': 'If',
        'expression': "@equals(items('For_each_list')?['%s'], true)" % READ_ONLY_FLAG,
        'actions': {
            'Read_list_inheritance': http_action(site, 'GET', READ_ONLY_INHERITANCE_URI, None, READ_HEADERS),
            'If_list_inherits': {
                'runAfter': {'Read_list_inheritance': ['Succeeded']},
                'type': 'If',
                'expression': "@equals(body('Read_list_inheritance')?['HasUniqueRoleAssignments'], false)",
                'actions': {'Break_list_inheritance': http_action(site, 'POST', BREAK_URI, None, POST_HEADERS)},
                'else': {'actions': {}},
            },
            'Find_operators_group': http_action(site, 'GET', GROUP_URI, 'If_list_inherits', READ_HEADERS),
            'Find_full_control': http_action(site, 'GET', FULL_CONTROL_URI, 'Find_operators_group', READ_HEADERS),
            'If_operators_group': {
                'runAfter': {'Find_full_control': ['Succeeded']},
                'type': 'If',
                'expression': "@greater(length(coalesce(body('Find_operators_group')?['value'], json('[]'))), 0)",
                'actions': {'Grant_operators_full_control': http_action(site, 'POST', GRANT_URI, None, POST_HEADERS)},
                'else': {'actions': {}},
            },
            'Set_read_only_items': http_action(site, 'POST', LIST_URI, 'If_operators_group', merge, READ_ONLY_BODY),
        },
        'else': {'actions': {}},
    }


def add_front_door_lists(document, site, operators_group=None):
    """Apply the changes to a parsed provisioning flow. Raises if the flow is not the expected shape."""
    document = copy.deepcopy(document)
    actions = document['properties']['definition']['actions']
    definitions = actions['List_definitions']['inputs']
    titles = [entry['title'] for entry in definitions]
    for entry in list_definitions(operators_group):
        if entry['title'] in titles:
            raise ValueError(entry['title'] + ' is already provisioned')
        definitions.append(entry)
    per_list = actions['For_each_list']['actions']
    field_branch = per_list['For_each_field']['actions']['If_field_exists']['else']['actions']
    body = field_branch['Create_field']['inputs']['parameters']['parameters/body']['parameters']
    built = body['SchemaXml']
    if not built.startswith('@concat(') or FIELD_EXPRESSION in built:
        raise ValueError('Create_field SchemaXml is not the expected expression')
    body['SchemaXml'] = '@if(empty(%s), %s, %s)' % (FIELD_EXPRESSION, built[1:], FIELD_EXPRESSION)
    after = 'For_each_field'
    for flag, name, inner, uri, settings in SETTINGS:
        if name in per_list:
            raise ValueError('The provisioning flow already has ' + name)
        per_list[name] = settings_action(site, flag, inner, uri, settings, after)
        after = name
    if READ_ONLY_STEP in per_list:
        raise ValueError('The provisioning flow already has ' + READ_ONLY_STEP)
    per_list[READ_ONLY_STEP] = read_only_action(site, after)
    return document


def dump(document):
    """The export's own layout: two-space indent, CRLF, no ASCII escaping."""
    return json.dumps(document, indent=2, ensure_ascii=False).replace('\n', '\r\n')

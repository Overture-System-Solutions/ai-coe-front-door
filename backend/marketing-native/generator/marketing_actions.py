"""Native WDL action builders. All external effects are explicit no-retry connector actions."""
from __future__ import annotations
import json
from marketing_flow import Flow, add, assert_action, secure, q

HEADERS = {'Accept': 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata'}
SELECT_ROW = '?$select=Id,Title,Operation,ProtocolVersion,PayloadJson,AuthorId,EditorId,Created,Modified,Author/Id,Author/Email,Author/LoginName&$expand=Author'


def expr(value):
    if isinstance(value, str) and value.startswith('@'):
        return value[1:]
    if isinstance(value, dict):
        result = "json('{}')"
        for key, val in value.items():
            result = f'setProperty({result}, {q(key)}, {expr(val)})'
        return result
    return 'json(' + q(json.dumps(value, separators=(',', ':'))) + ')'


def http(f, method, uri, body=None, etag=None, extra_headers=None):
    headers = {**HEADERS, **(extra_headers or {})}
    if etag is not None:
        headers.update({'IF-MATCH': etag, 'X-HTTP-Method': 'MERGE'})
    if body is not None:
        body = '@string(' + expr(body) + ')'
    action = f.sp_http(method, uri, body, headers)
    action['inputs']['retryPolicy'] = {'type': 'none'}
    return secure(action)


def invoke(f, b, last, label, mode, payload, assert_valid=True):
    add(f, b, last, label, {
        'type': 'OpenApiConnection', 'inputs': {
            'host': {'connectionName': 'marketing_integrity', 'operationId': 'Evaluate', 'apiId': ''},
            'parameters': {'body/Mode': mode, 'body/Payload': '@string(' + expr(payload) + ')'},
            'authentication': "@parameters('$authentication')", 'retryPolicy': {'type': 'none'}}})
    if assert_valid:
        add(f, b, last, label + '_Assert', assert_action(f"equals(body('{label}')?['Valid'], true)", 'MARKETING_HELPER_REFUSED'))


def base(table):
    return "concat('_api/web/lists(guid''', outputs('Cfg')?['" + table + "ListId'], ''')/items')"


def item_uri(table, item):
    return '@concat(' + base(table) + ", '(', string(" + item + "), ')')"


def query_uri(table, field, value):
    return '@concat(' + base(table) + ", '?$filter=', uriComponent(concat('" + field + " eq ''', replace(" + value + ", '''', ''''''), '''')), '&$top=2')"


def collect(f, b, last, label, uri, target='Rows'):
    """Drain REST pages without union/dedup. Exhaustion is never completeness."""
    add(f, b, last, label + '_Reset', f.set_var(target, []))
    add(f, b, last, label + '_Next', f.set_var('Next', uri))
    add(f, b, last, label + '_Seen', f.set_var('SeenPages', []))
    page, pl = {}, [None]
    add(f, page, pl, label + '_Cycle', assert_action("not(contains(variables('SeenPages'), variables('Next')))", 'MARKETING_PAGE_CYCLE'))
    add(f, page, pl, label + '_Remember', f.append_var('SeenPages', "@variables('Next')"))
    add(f, page, pl, label + '_Get', http(f, 'GET', "@variables('Next')"))
    invoke(f, page, pl, label + '_Page', 'Page', {'Config': "@outputs('Cfg')", 'Page': f"@body('{label}_Get')"})
    append = {label + '_Append': secure({**f.append_var(target, f"@items('{label}_Items')"), 'runAfter': {}})}
    add(f, page, pl, label + '_Items', f.foreach(f"@body('{label}_Page')?['Rows']", append))
    add(f, page, pl, label + '_Advance', f.set_var('Next', f"@body('{label}_Page')?['Next']"))
    add(f, b, last, label + '_Until', {'type': 'Until', 'expression': "@empty(variables('Next'))", 'limit': {'count': 20, 'timeout': 'PT30M'}, 'actions': page})
    add(f, b, last, label + '_Complete', assert_action("empty(variables('Next'))", 'MARKETING_PAGE_LIMIT'))


def lookup(f, b, last, label, key):
    add(f, b, last, label, http(f, 'GET', query_uri('canonical', 'RecordKey', key)))
    # One guard checks both conditions; no row consumer can run between them.
    invoke(f, b, last, label + '_Page', 'Page', {'Config': "@outputs('Cfg')", 'Page': f"@body('{label}')"}, assert_valid=False)
    add(f, b, last, label + '_Complete', assert_action(f"and(equals(body('{label}_Page')?['Valid'], true), empty(body('{label}_Page')?['Next']))", 'MARKETING_RECORD_PAGE_REFUSED'))
    return f"body('{label}_Page')?['Rows']"


def persist(f, b, last, label, write):
    """Sequential CAS/create-only with actual complete content/hash readback."""
    add(f, b, last, label + '_Write', f.compose(write))
    w = f"outputs('{label}_Write')"
    rows = lookup(f, b, last, 'Find_' + label, w + "?['Key']")
    invoke(f, b, last, 'Inspect_' + label, 'InspectWrite', {'Config': "@outputs('Cfg')", 'Write': '@' + w, 'Rows': '@' + rows})
    change, cl = {}, [None]
    create = {'Create_' + label: secure({**http(f, 'POST', '@' + base('canonical'), f"@body('Inspect_{label}')?['Fields']"), 'runAfter': {}})}
    update = {'CAS_' + label: secure({**http(f, 'POST', item_uri('canonical', f"body('Inspect_{label}')?['ItemId']"), f"@body('Inspect_{label}')?['Fields']", f"@body('Inspect_{label}')?['ExpectedETag']"), 'runAfter': {}})}
    add(f, change, cl, label + '_Create_Or_CAS', f.condition({'equals': [f"@coalesce(body('Inspect_{label}')?['ItemId'], 0)", 0]}, create, update))
    add(f, b, last, label + '_If_Not_Applied', f.condition({'equals': [f"@body('Inspect_{label}')?['AlreadyApplied']", False]}, change))
    read = lookup(f, b, last, 'Readback_' + label, w + "?['Key']")
    invoke(f, b, last, 'Verify_' + label, 'VerifyWrite', {'Config': "@outputs('Cfg')", 'Write': '@' + w, 'Rows': '@' + read})
    return f"first({read})?['@odata.etag']"


def common():
    return {'Config': "@outputs('Cfg')", 'Row': "@variables('Row')", 'Records': "@variables('Records')",
            'Sources': "@variables('Sources')", 'Now': "@utcNow('yyyy-MM-ddTHH:mm:ss.fffZ')", 'RunId': "@workflow()?['run']?['name']",
            'ProviderResponse': "@if(empty(variables('ProviderResponse')), null, variables('ProviderResponse'))"}


def canonical(f, b, last, label):
    collect(f, b, last, label, '@concat(' + base('canonical') + ", '?$top=5000&$orderby=Id')", target='Records')


def permission_low(label):
    return f"coalesce(body('{label}')?['GetUserEffectivePermissions']?['Low'], body('{label}')?['d']?['GetUserEffectivePermissions']?['Low'], body('{label}')?['Low'])"


def metadata_etag(label):
    return f"coalesce(body('{label}')?['ETag'], body('{label}')?['d']?['ETag'], outputs('{label}')?['headers']?['ETag'], outputs('{label}')?['headers']?['etag'])"


def acquisition(f, b, last, stage):
    """Fresh preflight -> before/after source observations -> fresh root -> Plan."""
    canonical(f, b, last, stage + '_Preflight_Canonical')
    invoke(f, b, last, stage + '_Preflight', 'Preflight', common())
    add(f, b, last, stage + '_Sources_Reset', f.set_var('Sources', []))
    src, sl = {}, [None]
    current = f"items('{stage}_Sources')"
    for suffix, field in [('Permission_Before', 'PermissionUri'), ('Metadata_Before', 'MetadataUri')]:
        add(f, src, sl, stage + '_' + suffix, http(f, 'GET', '@' + current + "?['" + field + "']"))
    low = permission_low(stage + '_Permission_Before')
    add(f, src, sl, stage + '_Before_Read_Allowed', assert_action(
        f"and(equals(mod(int({low}), 2), 1), equals(mod(div(int({low}), 32), 2), 1), equals({metadata_etag(stage + '_Metadata_Before')}, {current}?['versionOrETag']))", 'MARKETING_SOURCE_BEFORE_READ_REFUSED'))
    add(f, src, sl, stage + '_Bytes', http(f, 'GET', '@' + current + "?['ContentUri']", extra_headers={'Accept': 'text/plain', 'If-Match': '@' + current + "?['versionOrETag']"}))
    for suffix, field in [('Metadata_After', 'MetadataUri'), ('Permission_After', 'PermissionUri')]:
        add(f, src, sl, stage + '_' + suffix, http(f, 'GET', '@' + current + "?['" + field + "']"))
    add(f, src, sl, stage + '_Observed_Source', f.append_var('Sources', {
        'sourceId': '@' + current + "?['sourceId']", 'versionOrETag': '@' + current + "?['versionOrETag']",
        'content': f"@body('{stage}_Bytes')",
        'contentETag': f"@coalesce(outputs('{stage}_Bytes')?['headers']?['ETag'], outputs('{stage}_Bytes')?['headers']?['etag'])",
        'permissionLowBefore': '@' + low, 'permissionLowAfter': '@' + permission_low(stage + '_Permission_After'),
        'metadataETagBefore': '@' + metadata_etag(stage + '_Metadata_Before'), 'metadataETagAfter': '@' + metadata_etag(stage + '_Metadata_After')}))
    add(f, b, last, stage + '_Sources', f.foreach(f"@body('{stage}_Preflight')?['SourceRequests']", src))
    add(f, b, last, stage + '_Request', http(f, 'GET', '@concat(' + item_uri('request', "variables('Row')?['Id']")[1:] + ', ' + q(SELECT_ROW) + ')'))
    add(f, b, last, stage + '_Immutable', assert_action(f"equals(coalesce(body('{stage}_Request')?['d'], body('{stage}_Request')), variables('Row'))", 'MARKETING_REQUEST_CHANGED'))
    # This snapshot occurs after the last awaited source-byte/permission observation.
    canonical(f, b, last, stage + '_Canonical')
    invoke(f, b, last, stage + '_Plan', 'Plan', common())


def claude_action(plan='Before_Provider_Plan'):
    p = {'anthropic-version': '2023-06-01', 'body/max_tokens': 1600, 'body/stream': False, 'body/thinking/type': 'disabled'}
    for path in ['body/model', 'body/system', 'body/messages', 'body/output_config/format/type', 'body/output_config/format/schema']:
        p[path] = f"@body('{plan}')?['ProviderWire']?['{path}']"
    return secure({'type': 'OpenApiConnection', 'inputs': {
        'host': {'connectionName': 'marketing_claude', 'operationId': 'GenerateIntakeDraft', 'apiId': ''},
        'parameters': p, 'authentication': "@parameters('$authentication')", 'retryPolicy': {'type': 'none'}}})

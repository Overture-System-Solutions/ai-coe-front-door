"""Offline structural/guard checks. This is deliberately not native designer validation."""
from __future__ import annotations
import ast
import datetime as dt
import hashlib
import json
import re
import uuid
from urllib.parse import urlparse, quote
from marketing_flow import ROOT

PARSER_SHA256 = '86e0519b40944efdadd0b42640bb7086697101956f6b305f242e480efffcf3c9'
source = (ROOT / 'generator/wdl_parser_donor.py').read_bytes()
assert hashlib.sha256(source).hexdigest() == PARSER_SHA256
node = next(n for n in ast.parse(source).body if isinstance(n, ast.ClassDef) and n.name == 'Expression')
ns = {'re': re, 'json': json, 'dt': dt, 'uuid': uuid, 'urlparse': urlparse}
exec(compile(ast.Module(body=[node], type_ignores=[]), '<pinned-core-wdl-parser>', 'exec'), ns)
Expression = ns['Expression']


class OfflineExpression(Expression):
    def eval(self, node):
        if node[0] == 'call' and node[1] == 'utcNow' and node[2]:
            assert [self.eval(n) for n in node[2]] == ['yyyy-MM-ddTHH:mm:ss.fffZ'], 'Unsupported offline UTC format'
            return dt.datetime.fromisoformat(self.e.sp.now.replace('Z', '+00:00')).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        extra = {'mod': lambda a, b: a % b, 'div': lambda a, b: a // b,
                 'contains': lambda a, b: b in a, 'lessOrEquals': lambda a, b: a <= b,
                 'startsWith': lambda a, b: a.startswith(b), 'take': lambda a, n: a[:n],
                 'uriComponent': lambda v: quote(v, safe=''), 'item': lambda: self.e.items['item']}
        if node[0] == 'call' and node[1] in extra:
            return extra[node[1]](*[self.eval(n) for n in node[2]])
        return super().eval(node)


def evaluate(expression, engine):
    return OfflineExpression(expression, engine).run()


def walk(actions):
    for name, action in actions.items():
        yield name, action
        yield from walk(action.get('actions', {}))
        yield from walk(action.get('else', {}).get('actions', {}))
        for case in action.get('cases', {}).values():
            yield from walk(case.get('actions', {}))


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings(item)


FUNCTIONS = {'outputs', 'body', 'variables', 'items', 'item', 'parameters', 'workflow', 'utcNow', 'if', 'string', 'json',
             'setProperty', 'int', 'mod', 'div', 'and', 'or', 'not', 'equals', 'empty', 'length', 'concat', 'replace',
             'first', 'coalesce', 'contains', 'lessOrEquals', 'startsWith', 'take', 'uriComponent'}


def validate(definition):
    errors = []
    props = definition['properties']
    wdl = props['definition']
    all_actions = list(walk(wdl['actions']))
    actions = dict(all_actions)
    if len(actions) != len(all_actions):
        errors.append('duplicate action names')
    if len(all_actions) > 500:
        errors.append('native action ceiling exceeded')
    refs = props['connectionReferences']
    variables = {v['name'] for a in wdl['actions'].values() if a['type'] == 'InitializeVariable' for v in a['inputs']['variables']}

    def validate_node(node, label):
        if node[0] == 'get':
            validate_node(node[1], label)
            validate_node(node[2], label)
        if node[0] != 'call':
            return
        fn, args = node[1:]
        if fn not in FUNCTIONS:
            errors.append(label + ': unsupported WDL function ' + fn)
        if fn in {'outputs', 'body', 'items', 'variables', 'parameters'}:
            target = args[0][1] if args and args[0][0] == 'value' else None
            allowed = variables if fn == 'variables' else wdl['parameters'] if fn == 'parameters' else actions
            if target not in allowed:
                errors.append(label + ': missing ' + fn + ' reference ' + str(target))
        for arg in args:
            validate_node(arg, label)

    # Sibling success ancestry, not dictionary order or action-name presence,
    # must dominate each irreversible effect. Container completion represents
    # its selected branch; it does not claim that every conditional branch ran.
    boundaries = {
        'Invoke_Claude': {'Verify_Provider_Intent_Assert', 'Before_Provider_Owns_Claim_Assert', 'Before_Provider_Plan_Assert', 'Same_Provider_Intent'},
        'Provider_Response_Write': {'Invoke_Claude'},
        'Build_Native_Plan': {'If_Provider_Needed', 'After_Provider_Canonical_Complete'},
        'For_each_write': {'If_No_Native_Plan', 'Retained_Native_Plan_Complete', 'Same_Native_Intent'},
        'Finalize_Native_Plan': {'For_each_write', 'Finalization_Canonical_Complete'},
        'Final_Native_Plan_Write': {'Finalize_Native_Plan_Assert', 'Result_Is_Final'},
        'Build_Projection': {'Verify_Final_Native_Plan_Assert', 'Finalized_Plan'},
        'Grant_Author_Read': {'Private_ACL_Only_Allowed', 'Before_Publication_Plan_Assert', 'Fresh_Result_Reauthorized'},
        'Command_Completed_Write': {'Verify_Projection_Assert'},
        'Native_Completed_Write': {'Verify_Command_Completed_Assert'},
        'Writer_Release_Write': {'Verify_Native_Completed_Assert', 'Before_Release_Owns_Claim_Assert'},
        'Confirmed_Control_Result': {'Verify_Writer_Release_Assert'},
    }
    for name in boundaries:
        if name not in actions:
            errors.append(name + ': durable boundary action missing')

    def blocks(block, depth=0):
        def success_ancestors(name, visiting=None):
            visiting = set() if visiting is None else visiting
            if name in visiting:
                errors.append(name + ': cyclic runAfter')
                return set()
            result = set()
            for dependency, statuses in block[name].get('runAfter', {}).items():
                if dependency in block and statuses == ['Succeeded']:
                    result.add(dependency)
                    result.update(success_ancestors(dependency, visiting | {name}))
            return result

        for name in boundaries.keys() & block.keys():
            missing = boundaries[name] - success_ancestors(name)
            if missing:
                errors.append(name + ': durable boundary bypasses ' + ', '.join(sorted(missing)))
        if depth > 8:
            errors.append('native action nesting ceiling exceeded')
        for name, action in block.items():
            for dependency in action.get('runAfter', {}):
                if dependency not in block:
                    errors.append(name + ': missing sibling runAfter ' + dependency)
            if set(action.get('runtimeConfiguration', {}).get('secureData', {}).get('properties', [])) != {'inputs', 'outputs'}:
                errors.append(name + ': secure inputs/outputs missing')
            if action['type'] == 'Foreach' and action.get('runtimeConfiguration', {}).get('concurrency', {}).get('repetitions') != 1:
                errors.append(name + ': nonsequential foreach')
            if action['type'] == 'OpenApiConnection':
                i = action['inputs']
                if i.get('retryPolicy') != {'type': 'none'}:
                    errors.append(name + ': implicit connector retries')
                if i['host']['connectionName'] not in refs:
                    errors.append(name + ': missing connection reference')
                if i['host']['operationId'] not in {'HttpRequest', 'Evaluate', 'GenerateIntakeDraft'}:
                    errors.append(name + ': unapproved external operation')
            # Do not rewalk child blocks as expression strings here.
            for key in ['inputs', 'expression', 'foreach']:
                for value in strings(action.get(key)):
                    if not value.startswith('@'):
                        continue
                    try:
                        parser = Expression(value, None)
                        node = parser.parse()
                        if parser.i != len(parser.s):
                            raise ValueError('unconsumed expression suffix')
                        validate_node(node, name)
                    except Exception as exc:
                        errors.append(name + ': invalid expression ' + str(exc))
            blocks(action.get('actions', {}), depth + 1)
            blocks(action.get('else', {}).get('actions', {}), depth + 1)
    blocks(wdl['actions'])
    if props.get('state') != 'Stopped':
        errors.append('flow must remain Stopped')
    if wdl['triggers']['Trigger'].get('runtimeConfiguration', {}).get('concurrency', {}).get('runs') != 1:
        errors.append('trigger must serialize runs')
    return errors

"""A small, conservative runner for Power Automate workflow definitions (WDL).

This is a LOCAL EMULATION used to execute the packaged flow definitions against fixtures. It is not Power
Automate and its results are not tenant evidence. It implements only the actions and functions the Copilot
submission flows use, and it is stricter than the service where the service's behaviour is uncertain:

- if(), and() and or() evaluate every argument, so an expression that would fail in an untaken branch fails;
- concat(), join() and interpolation refuse null and booleans instead of guessing how they print;
- referring to the outputs of an action that did not run is an error;
- string length, take() and substring() count UTF-16 code units, as .NET does.
"""
import datetime as dt
import json
import re
import urllib.parse

STATUSES = ('Succeeded', 'Failed', 'Skipped', 'TimedOut')


class ExpressionError(Exception):
    """An expression the service would reject (or that this runner refuses to guess about)."""


# ---------------------------------------------------------------- UTF-16 helpers

def _u16(text):
    return text.encode('utf-16-le', 'surrogatepass')


def _from_u16(data):
    return data.decode('utf-16-le', 'surrogatepass')


def u16len(text):
    return len(_u16(text)) // 2


def u16slice(text, start, stop):
    data = _u16(text)
    return _from_u16(data[start * 2:stop * 2])


# ---------------------------------------------------------------- tokenizer and parser

_TOKEN = re.compile(r"""
    (?P<ws>\s+)
  | (?P<string>'(?:[^']|'')*')
  | (?P<number>-?\d+(?:\.\d+)?)
  | (?P<ident>[A-Za-z_][A-Za-z0-9_]*)
  | (?P<punct>\?\[|\?\.|[()\[\],.])
""", re.VERBOSE)


def tokenize(text):
    tokens, pos = [], 0
    while pos < len(text):
        match = _TOKEN.match(text, pos)
        if not match:
            raise ExpressionError('cannot read expression at %r' % text[pos:pos + 20])
        pos = match.end()
        kind = match.lastgroup
        if kind == 'ws':
            continue
        tokens.append((kind, match.group(kind)))
    return tokens


class _Parser:
    def __init__(self, text):
        self.tokens = tokenize(text)
        self.i = 0

    def peek(self):
        return self.tokens[self.i] if self.i < len(self.tokens) else (None, None)

    def take(self, kind=None, value=None):
        tok = self.peek()
        if tok[0] is None or (kind and tok[0] != kind) or (value and tok[1] != value):
            raise ExpressionError('expected %s %s, found %r' % (kind, value, tok[1]))
        self.i += 1
        return tok

    def parse(self):
        node = self.expr()
        if self.i != len(self.tokens):
            raise ExpressionError('unexpected %r' % (self.peek()[1],))
        return node

    def expr(self):
        node = self.primary()
        while True:
            kind, value = self.peek()
            if value in ('[', '?['):
                self.take()
                index = self.expr()
                self.take('punct', ']')
                node = ('index', node, index, value == '?[')
            elif value in ('.', '?.'):
                self.take()
                _, name = self.take('ident')
                node = ('index', node, ('lit', name), value == '?.')
            else:
                return node

    def primary(self):
        kind, value = self.take()
        if kind == 'string':
            return ('lit', value[1:-1].replace("''", "'"))
        if kind == 'number':
            return ('lit', float(value) if '.' in value else int(value))
        if kind == 'ident':
            if value in ('true', 'false'):
                return ('lit', value == 'true')
            if value == 'null':
                return ('lit', None)
            self.take('punct', '(')
            args = []
            if self.peek()[1] != ')':
                args.append(self.expr())
                while self.peek()[1] == ',':
                    self.take()
                    args.append(self.expr())
            self.take('punct', ')')
            return ('call', value, args)
        raise ExpressionError('unexpected %r' % value)


_PARSED = {}


def parse(text):
    if text not in _PARSED:
        _PARSED[text] = _Parser(text).parse()
    return _PARSED[text]


# ---------------------------------------------------------------- dates

_NET_TOKENS = [('fffffff', lambda d: '%07d' % (d.microsecond * 10)), ('fff', lambda d: '%03d' % (d.microsecond // 1000)),
               ('yyyy', lambda d: '%04d' % d.year), ('MM', lambda d: '%02d' % d.month), ('dd', lambda d: '%02d' % d.day),
               ('HH', lambda d: '%02d' % d.hour), ('mm', lambda d: '%02d' % d.minute), ('ss', lambda d: '%02d' % d.second)]
_LITERALS = set('-:.TZ ')


def format_datetime(value, fmt=None):
    if fmt in (None, 'o'):
        fmt = 'yyyy-MM-ddTHH:mm:ss.fffffffZ'
    out, i = [], 0
    while i < len(fmt):
        for token, render in _NET_TOKENS:
            if fmt.startswith(token, i):
                out.append(render(value))
                i += len(token)
                break
        else:
            if fmt[i] not in _LITERALS:
                raise ExpressionError('unsupported date format character %r in %r' % (fmt[i], fmt))
            out.append(fmt[i])
            i += 1
    return ''.join(out)


_ISO = re.compile(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(Z|[+-]00:00)$')


def parse_datetime(text):
    if not isinstance(text, str):
        raise ExpressionError('timestamp must be a string, got %r' % (text,))
    match = _ISO.match(text)
    if not match:
        raise ExpressionError('unsupported timestamp %r' % text)
    year, month, day, hour, minute, second, fraction, _ = match.groups()
    micro = int((fraction or '0').ljust(7, '0')[:7]) // 10
    return dt.datetime(int(year), int(month), int(day), int(hour), int(minute), int(second), micro, tzinfo=dt.timezone.utc)


# ---------------------------------------------------------------- values

def _is_bool(value):
    return isinstance(value, bool)


def _require_str(name, value):
    if not isinstance(value, str):
        raise ExpressionError('%s expects a string, got %r' % (name, value))
    return value


def _require_bool(name, value):
    if not _is_bool(value):
        raise ExpressionError('%s expects a boolean, got %r' % (name, value))
    return value


def _require_int(name, value):
    if _is_bool(value) or not isinstance(value, int):
        raise ExpressionError('%s expects an integer, got %r' % (name, value))
    return value


def to_json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def _printable(name, value):
    if isinstance(value, str):
        return value
    if _is_bool(value) or value is None:
        raise ExpressionError('%s refuses %r (how the service prints it is not relied on)' % (name, value))
    if isinstance(value, (int, float)):
        return str(value)
    raise ExpressionError('%s cannot print %r' % (name, value))


def _equal(a, b):
    if _is_bool(a) != _is_bool(b):
        return False
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_equal(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_equal(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b if not (isinstance(a, (int, float)) and isinstance(b, (int, float))) else a == b


def _compare(name, a, b):
    if _is_bool(a) or _is_bool(b) or a is None or b is None:
        raise ExpressionError('%s cannot compare %r and %r' % (name, a, b))
    if isinstance(a, str) != isinstance(b, str):
        raise ExpressionError('%s cannot compare %r and %r' % (name, a, b))
    return a, b


# ---------------------------------------------------------------- functions

def _f_take(coll, count):
    count = _require_int('take', count)
    if isinstance(coll, str):
        return u16slice(coll, 0, count)
    if isinstance(coll, list):
        return coll[:count]
    raise ExpressionError('take expects a string or array')


def _f_skip(coll, count):
    count = _require_int('skip', count)
    if isinstance(coll, str):
        return u16slice(coll, count, u16len(coll))
    if isinstance(coll, list):
        return coll[count:]
    raise ExpressionError('skip expects a string or array')


def _f_substring(text, start, length=None):
    text = _require_str('substring', text)
    start = _require_int('substring', start)
    size = u16len(text)
    end = size if length is None else start + _require_int('substring', length)
    if start < 0 or end > size or end < start:
        raise ExpressionError('substring out of range')
    return u16slice(text, start, end)


def _f_length(value):
    if isinstance(value, str):
        return u16len(value)
    if isinstance(value, (list, dict)):
        return len(value)
    raise ExpressionError('length expects a string, array or object, got %r' % (value,))


def _f_empty(value):
    if value is None:
        return True
    if isinstance(value, (str, list, dict)):
        return len(value) == 0
    raise ExpressionError('empty expects a string, array or object, got %r' % (value,))


def _f_contains(coll, value):
    if isinstance(coll, str):
        return _require_str('contains', value) in coll
    if isinstance(coll, list):
        return any(_equal(item, value) for item in coll)
    if isinstance(coll, dict):
        return _require_str('contains', value) in coll
    raise ExpressionError('contains expects a string, array or object, got %r' % (coll,))


def _f_split(text, sep):
    text, sep = _require_str('split', text), _require_str('split', sep)
    if not sep:
        raise ExpressionError('split needs a separator')
    return text.split(sep)


def _f_join(coll, sep):
    if not isinstance(coll, list):
        raise ExpressionError('join expects an array')
    return _require_str('join', sep).join(_printable('join', item) for item in coll)


def _f_concat(*args):
    return ''.join(_printable('concat', arg) for arg in args)


def _f_string(value):
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return to_json_text(value)
    if isinstance(value, int) and not _is_bool(value):
        return str(value)
    raise ExpressionError('string() of %r is not relied on' % (value,))


def _f_json(text):
    try:
        return json.loads(_require_str('json', text))
    except ValueError as error:
        raise ExpressionError('json: %s' % error)


def _f_int(value):
    if isinstance(value, int) and not _is_bool(value):
        return value
    try:
        return int(_require_str('int', value))
    except ValueError:
        raise ExpressionError('int: not a number %r' % value)


def _f_if(condition, yes, no):
    return yes if _require_bool('if', condition) else no


def _f_and(*args):
    return all([_require_bool('and', a) for a in args])


def _f_or(*args):
    return any([_require_bool('or', a) for a in args])


def _f_set_property(obj, key, value):
    if not isinstance(obj, dict):
        raise ExpressionError('setProperty expects an object')
    result = dict(obj)
    result[_require_str('setProperty', key)] = value
    return result


def _f_union(*colls):
    if all(isinstance(c, list) for c in colls):
        out = []
        for coll in colls:
            for item in coll:
                if not any(_equal(item, seen) for seen in out):
                    out.append(item)
        return out
    raise ExpressionError('union is only supported for arrays here')


def _f_first(coll):
    if isinstance(coll, list):
        return coll[0] if coll else None
    if isinstance(coll, str):
        return u16slice(coll, 0, 1)
    raise ExpressionError('first expects a string or array')


def _f_add_days(stamp, days, fmt=None):
    return format_datetime(parse_datetime(stamp) + dt.timedelta(days=_require_int('addDays', days)), fmt)


def _f_day_of_week(stamp):
    return (parse_datetime(stamp).weekday() + 1) % 7


def _f_format_datetime(stamp, fmt=None):
    return format_datetime(parse_datetime(stamp), fmt)


def _f_encode(text):
    return urllib.parse.quote(_require_str('encodeUriComponent', text), safe='-_.~')


def _f_decode(text):
    return urllib.parse.unquote(_require_str('decodeUriComponent', text))


PURE = {
    'concat': _f_concat,
    'equals': lambda a, b: _equal(a, b),
    'not': lambda a: not _require_bool('not', a),
    'and': _f_and,
    'or': _f_or,
    'if': _f_if,
    'empty': _f_empty,
    'trim': lambda s: _require_str('trim', s).strip(' \t\r\n\u00a0\u2028\u2029\u3000'),
    'toLower': lambda s: _require_str('toLower', s).lower(),
    'toUpper': lambda s: _require_str('toUpper', s).upper(),
    'length': _f_length,
    'contains': _f_contains,
    'split': _f_split,
    'join': _f_join,
    'createArray': lambda *a: list(a),
    'coalesce': lambda *a: next((x for x in a if x is not None), None),
    'string': _f_string,
    'json': _f_json,
    'int': _f_int,
    'take': _f_take,
    'skip': _f_skip,
    'first': _f_first,
    'substring': _f_substring,
    'replace': lambda s, old, new: _require_str('replace', s).replace(_require_str('replace', old), _require_str('replace', new)),
    'greater': lambda a, b: (lambda x, y: x > y)(*_compare('greater', a, b)),
    'less': lambda a, b: (lambda x, y: x < y)(*_compare('less', a, b)),
    'greaterOrEquals': lambda a, b: (lambda x, y: x >= y)(*_compare('greaterOrEquals', a, b)),
    'lessOrEquals': lambda a, b: (lambda x, y: x <= y)(*_compare('lessOrEquals', a, b)),
    'add': lambda a, b: _require_int('add', a) + _require_int('add', b),
    'sub': lambda a, b: _require_int('sub', a) - _require_int('sub', b),
    'setProperty': _f_set_property,
    'union': _f_union,
    'addDays': _f_add_days,
    'dayOfWeek': _f_day_of_week,
    'formatDateTime': _f_format_datetime,
    'encodeUriComponent': _f_encode,
    'decodeUriComponent': _f_decode,
}


# ---------------------------------------------------------------- evaluation

class Scope:
    def __init__(self, runner, items=()):
        self.runner = runner
        self.items = list(items)

    def with_item(self, item):
        return Scope(self.runner, self.items + [item])


def _call(name, args, scope):
    runner = scope.runner
    if name in PURE:
        return PURE[name](*args)
    if name == 'triggerBody':
        return runner.trigger_body
    if name == 'variables':
        key = _require_str('variables', args[0])
        if key not in runner.variables:
            raise ExpressionError('variable %r is not initialized' % key)
        return runner.variables[key]
    if name in ('outputs', 'body', 'actions'):
        action = _require_str(name, args[0])
        if action not in runner.status or runner.status[action] == 'Skipped':
            raise ExpressionError('action %r has not run' % action)
        if name == 'actions':
            return {'name': action, 'status': runner.status[action], 'outputs': runner.outputs.get(action)}
        value = runner.outputs.get(action)
        if name == 'body':
            return value.get('body') if isinstance(value, dict) and 'body' in value else value
        return value
    if name == 'item':
        if not scope.items:
            raise ExpressionError('item() outside a loop')
        return scope.items[-1]
    if name == 'guid':
        return next(runner.guids)
    if name == 'utcNow':
        return format_datetime(runner.now, args[0] if args else None)
    raise ExpressionError('unknown function %s()' % name)


def _eval(node, scope):
    kind = node[0]
    if kind == 'lit':
        return node[1]
    if kind == 'call':
        _, name, arg_nodes = node
        return _call(name, [_eval(arg, scope) for arg in arg_nodes], scope)
    if kind == 'index':
        _, target_node, index_node, safe = node
        target, index = _eval(target_node, scope), _eval(index_node, scope)
        if target is None:
            if safe:
                return None
            raise ExpressionError('cannot index null with %r' % (index,))
        if isinstance(target, dict):
            if index in target:
                return target[index]
            if safe:
                return None
            raise ExpressionError('property %r does not exist' % (index,))
        if isinstance(target, list):
            index = _require_int('index', index)
            if 0 <= index < len(target):
                return target[index]
            raise ExpressionError('index %d out of range' % index)
        raise ExpressionError('cannot index %r' % (target,))
    raise ExpressionError('bad node %r' % (node,))


def _split_interpolation(text):
    """Yields ('text', s) and ('expr', body) parts of a string containing @{...} interpolations."""
    i = 0
    while i < len(text):
        start = text.find('@{', i)
        if start < 0:
            yield 'text', text[i:]
            return
        yield 'text', text[i:start]
        depth, j, in_string = 0, start + 2, False
        while j < len(text):
            ch = text[j]
            if in_string:
                if ch == "'":
                    if j + 1 < len(text) and text[j + 1] == "'":
                        j += 1
                    else:
                        in_string = False
            elif ch == "'":
                in_string = True
            elif ch == '{':
                depth += 1
            elif ch == '}':
                if depth == 0:
                    break
                depth -= 1
            j += 1
        if j >= len(text):
            raise ExpressionError('unterminated @{ in %r' % text)
        yield 'expr', text[start + 2:j]
        i = j + 1


def expression_bodies(text):
    """Every expression in a definition string (empty for plain text), for syntax checks."""
    if not isinstance(text, str) or text.startswith('@@'):
        return []
    if text.startswith('@') and not text.startswith('@{'):
        return [text[1:]]
    return [body for kind, body in _split_interpolation(text) if kind == 'expr']


def _interpolate(text, scope):
    out = []
    for kind, part in _split_interpolation(text):
        if kind == 'text':
            out.append(part)
            continue
        value = _eval(parse(part), scope)
        out.append(to_json_text(value) if isinstance(value, (dict, list)) else _printable('interpolation', value))
    return ''.join(out)


def evaluate(value, scope):
    if isinstance(value, dict):
        return {k: evaluate(v, scope) for k, v in value.items()}
    if isinstance(value, list):
        return [evaluate(v, scope) for v in value]
    if not isinstance(value, str):
        return value
    if value.startswith('@@'):
        return value[1:]
    if value.startswith('@{'):
        return _interpolate(value, scope)
    if value.startswith('@'):
        return _eval(parse(value[1:]), scope)
    if '@{' in value:
        return _interpolate(value, scope)
    return value


_CONDITIONS = {'equals': lambda a, b: _equal(a, b), 'greater': PURE['greater'], 'less': PURE['less'],
               'greaterOrEquals': PURE['greaterOrEquals'], 'lessOrEquals': PURE['lessOrEquals'],
               'contains': _f_contains}


def evaluate_condition(expression, scope):
    if isinstance(expression, str):
        return _require_bool('condition', evaluate(expression, scope))
    if not isinstance(expression, dict) or len(expression) != 1:
        raise ExpressionError('bad condition %r' % (expression,))
    (op, operand), = expression.items()
    if op == 'and':
        return all([evaluate_condition(e, scope) for e in operand])
    if op == 'or':
        return any([evaluate_condition(e, scope) for e in operand])
    if op == 'not':
        return not evaluate_condition(operand, scope)
    if op in _CONDITIONS:
        return _CONDITIONS[op](*[evaluate(x, scope) for x in operand])
    raise ExpressionError('unknown condition %r' % op)


# ---------------------------------------------------------------- runner

def iter_actions(actions):
    for name, action in actions.items():
        yield name, action
        yield from iter_actions(action.get('actions', {}))
        yield from iter_actions(action.get('else', {}).get('actions', {}))


class Runner:
    """Executes one run of a definition. `connector(name, host, parameters)` returns (status_code, body)."""

    def __init__(self, definition, trigger_body, connector=None, now=None, guids=None):
        self.definition = definition
        self.trigger_body = trigger_body
        self.connector = connector
        self.now = now or dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
        self.guids = guids if guids is not None else iter(())
        self.variables, self.outputs, self.status = {}, {}, {}
        self.errors = {}
        self.response = None
        self.order = []
        names = [name for name, _ in iter_actions(definition.get('actions', {}))]
        if len(names) != len(set(names)):
            raise ExpressionError('duplicate action names')

    def scope(self, items=()):
        return Scope(self, items)

    def run(self):
        self._run_container(self.definition['actions'])
        return self

    def _ordered(self, actions):
        done, order = set(), []
        pending = list(actions)
        while pending:
            progressed = False
            for name in list(pending):
                deps = actions[name].get('runAfter', {})
                missing = [d for d in deps if d not in actions]
                if missing:
                    raise ExpressionError('%s runs after unknown %s' % (name, missing))
                if all(d in done for d in deps):
                    order.append(name)
                    done.add(name)
                    pending.remove(name)
                    progressed = True
                    break
            if not progressed:
                raise ExpressionError('runAfter cycle among %s' % pending)
        return order

    def _skip_all(self, actions):
        for name, _ in iter_actions(actions):
            self.status[name] = 'Skipped'

    def _run_container(self, actions):
        failed = False
        for name in self._ordered(actions):
            action = actions[name]
            allowed = True
            for dep, wanted in action.get('runAfter', {}).items():
                wanted = [w.lower() for w in wanted]
                if self.status[dep].lower() not in wanted:
                    allowed = False
            if not allowed:
                self._skip_all({name: action})
                continue
            self.order.append(name)
            try:
                self.status[name] = self._run_action(name, action)
            except ExpressionError as error:
                self.errors[name] = str(error)
                self.status[name] = 'Failed'
                self._skip_children(action)
            if self.status[name] in ('Failed', 'TimedOut'):
                failed = True
        return 'Failed' if failed else 'Succeeded'

    def _skip_children(self, action):
        for key in ('actions',):
            for name, _ in iter_actions(action.get(key, {})):
                self.status.setdefault(name, 'Skipped')
        for name, _ in iter_actions(action.get('else', {}).get('actions', {})):
            self.status.setdefault(name, 'Skipped')

    def _run_action(self, name, action):
        kind = action['type']
        scope = self.scope()
        if kind == 'InitializeVariable':
            for spec in action['inputs']['variables']:
                self.variables[spec['name']] = evaluate(spec.get('value'), scope)
            return 'Succeeded'
        if kind == 'SetVariable':
            key = action['inputs']['name']
            if key not in self.variables:
                raise ExpressionError('variable %r is not initialized' % key)
            self.variables[key] = evaluate(action['inputs']['value'], scope)
            return 'Succeeded'
        if kind == 'Compose':
            self.outputs[name] = evaluate(action['inputs'], scope)
            return 'Succeeded'
        if kind == 'Query':
            source = evaluate(action['inputs']['from'], scope)
            if not isinstance(source, list):
                raise ExpressionError('Filter array needs an array, got %r' % (source,))
            kept = [item for item in source if evaluate_condition(action['inputs']['where'], scope.with_item(item))]
            self.outputs[name] = {'body': kept}
            return 'Succeeded'
        if kind == 'Select':
            source = evaluate(action['inputs']['from'], scope)
            if not isinstance(source, list):
                raise ExpressionError('Select needs an array, got %r' % (source,))
            self.outputs[name] = {'body': [evaluate(action['inputs']['select'], scope.with_item(item)) for item in source]}
            return 'Succeeded'
        if kind == 'Scope':
            return self._run_container(action['actions'])
        if kind == 'If':
            if evaluate_condition(action['expression'], scope):
                self._skip_all(action.get('else', {}).get('actions', {}))
                return self._run_container(action.get('actions', {}))
            self._skip_all(action.get('actions', {}))
            return self._run_container(action.get('else', {}).get('actions', {}))
        if kind == 'OpenApiConnection':
            inputs = action['inputs']
            parameters = evaluate(inputs.get('parameters', {}), scope)
            if self.connector is None:
                raise ExpressionError('no connector configured')
            code, body = self.connector(name, inputs['host'], parameters)
            self.outputs[name] = {'statusCode': code, 'headers': {}, 'body': body}
            return 'Failed' if code >= 400 else 'Succeeded'
        if kind == 'Response':
            if self.response is not None:
                raise ExpressionError('a run can respond only once')
            self.response = evaluate(action['inputs'].get('body'), scope)
            self.outputs[name] = {'statusCode': action['inputs'].get('statusCode'), 'body': self.response}
            return 'Succeeded'
        raise ExpressionError('unsupported action type %s' % kind)

"""Tests for the local workflow-definition runner (an emulation, not Power Automate).

The runner exists so the packaged flow definitions can be executed against fixtures. It is deliberately
conservative: if() evaluates both branches, so an expression that could only fail in the branch not taken
still fails here, and anything it does not know raises instead of guessing.
"""
import datetime as dt
import unittest

from wdl import ExpressionError, Runner, evaluate


def ev(text, **context):
    runner = Runner({'actions': {}, 'triggers': {}}, trigger_body=context.pop('trigger', {}),
                    now=dt.datetime(2026, 10, 9, 14, 3, 12, 345000, tzinfo=dt.timezone.utc),
                    guids=iter(context.pop('guids', ['0f8fad5b-d9cb-469f-a165-70867728950e'])))
    return evaluate(text, runner.scope(**context))


class ExpressionTests(unittest.TestCase):
    def test_literal_without_at_is_returned_unchanged(self):
        self.assertEqual(ev('plain text'), 'plain text')

    def test_whole_expression_keeps_its_type(self):
        self.assertIs(ev("@equals(1, 1)"), True)
        self.assertEqual(ev("@createArray('a', 'b')"), ['a', 'b'])

    def test_escaped_quote_in_string_literal(self):
        self.assertEqual(ev("@concat('it''s', ' ok')"), "it's ok")

    def test_interpolation_builds_a_string(self):
        self.assertEqual(ev("Ref @{concat('A', 'B')} done"), 'Ref AB done')

    def test_double_at_is_a_literal_at(self):
        self.assertEqual(ev('@@home'), '@home')

    def test_safe_navigation_returns_null_for_missing_keys(self):
        self.assertIsNone(ev("@triggerBody()?['missing']?['deeper']", trigger={}))

    def test_strict_navigation_on_null_fails(self):
        with self.assertRaises(ExpressionError):
            ev("@triggerBody()['missing']['deeper']", trigger={})

    def test_trim_of_null_fails_so_flows_must_coalesce(self):
        with self.assertRaises(ExpressionError):
            ev("@trim(triggerBody()?['text'])", trigger={})
        self.assertEqual(ev("@trim(coalesce(triggerBody()?['text'], ''))", trigger={}), '')

    def test_if_evaluates_both_branches(self):
        with self.assertRaises(ExpressionError):
            ev("@if(true, 'safe', substring('abc', 5, 2))")

    def test_split_of_empty_string_has_one_empty_item(self):
        self.assertEqual(ev("@split('', ',')"), [''])

    def test_contains_on_string_array_and_object(self):
        self.assertIs(ev("@contains('abc', 'b')"), True)
        self.assertIs(ev("@contains(createArray('x', 'y'), 'y')"), True)
        self.assertIs(ev("@contains(json('{\"k\": 1}'), 'k')"), True)

    def test_take_on_string_counts_utf16_units(self):
        self.assertEqual(ev("@take('abcdef', 3)"), 'abc')
        self.assertEqual(ev("@take('ab', 5)"), 'ab')
        self.assertEqual(ev("@take('ab\U0001F600cd', 4)"), 'ab\U0001F600')
        self.assertEqual(ev("@length('ab\U0001F600')"), 4)

    def test_string_of_object_is_compact_json(self):
        self.assertEqual(ev("@string(json('{\"a\": [1, 2], \"b\": \"c\"}'))"), '{"a":[1,2],"b":"c"}')

    def test_set_property_appends_new_keys_last(self):
        self.assertEqual(list(ev("@setProperty(json('{\"a\": 1}'), 'b', 2)")), ['a', 'b'])

    def test_time_functions_use_the_injected_clock(self):
        self.assertEqual(ev("@utcNow('yyyyMMdd')"), '20261009')
        self.assertEqual(ev("@utcNow('yyyy-MM-ddTHH:mm:ss.fffZ')"), '2026-10-09T14:03:12.345Z')
        self.assertEqual(ev("@dayOfWeek('2026-10-09T14:03:12.345Z')"), 5)
        self.assertEqual(ev("@addDays('2026-10-09T14:03:12Z', 4, 'yyyy-MM-ddTHH:mm:ss.fffZ')"), '2026-10-13T14:03:12.000Z')

    def test_guid_comes_from_the_injected_sequence(self):
        self.assertEqual(ev("@guid()", guids=['11111111-2222-3333-4444-555555555555']), '11111111-2222-3333-4444-555555555555')

    def test_encode_uri_component_matches_escape_data_string(self):
        self.assertEqual(ev("@encodeUriComponent('a b''c/é')"), 'a%20b%27c%2F%C3%A9')

    def test_unknown_function_raises(self):
        with self.assertRaises(ExpressionError):
            ev("@noSuchFunction()")


class ActionTests(unittest.TestCase):
    def run_definition(self, actions, connector=None):
        definition = {'triggers': {'manual': {'type': 'Request', 'kind': 'Skills', 'inputs': {'schema': {}}}},
                      'actions': actions}
        runner = Runner(definition, trigger_body={'text': 'hello'}, connector=connector,
                        now=dt.datetime(2026, 10, 9, tzinfo=dt.timezone.utc), guids=iter([]))
        runner.run()
        return runner

    def test_run_after_failed_runs_and_unmet_conditions_skip(self):
        runner = self.run_definition({
            'Init': {'type': 'InitializeVariable', 'runAfter': {},
                     'inputs': {'variables': [{'name': 'v', 'type': 'string', 'value': 'start'}]}},
            'Boom': {'type': 'Compose', 'runAfter': {'Init': ['Succeeded']}, 'inputs': "@substring('a', 3, 1)"},
            'After_ok': {'type': 'SetVariable', 'runAfter': {'Boom': ['Succeeded']}, 'inputs': {'name': 'v', 'value': 'ok'}},
            'After_fail': {'type': 'SetVariable', 'runAfter': {'Boom': ['Failed']}, 'inputs': {'name': 'v', 'value': 'handled'}},
        })
        self.assertEqual(runner.status['Boom'], 'Failed')
        self.assertEqual(runner.status['After_ok'], 'Skipped')
        self.assertEqual(runner.variables['v'], 'handled')

    def test_scope_fails_when_an_inner_action_fails(self):
        runner = self.run_definition({
            'Try': {'type': 'Scope', 'runAfter': {}, 'actions': {
                'Bad': {'type': 'Compose', 'runAfter': {}, 'inputs': "@int('x')"}}},
            'Always': {'type': 'Compose', 'runAfter': {'Try': ['Succeeded', 'Failed', 'Skipped', 'TimedOut']}, 'inputs': 'ran'},
        })
        self.assertEqual(runner.status['Try'], 'Failed')
        self.assertEqual(runner.outputs['Always'], 'ran')

    def test_if_with_object_expression(self):
        runner = self.run_definition({
            'Check': {'type': 'If', 'runAfter': {},
                      'expression': {'and': [{'equals': ["@triggerBody()?['text']", 'hello']}]},
                      'actions': {'Yes': {'type': 'Compose', 'runAfter': {}, 'inputs': 'y'}},
                      'else': {'actions': {'No': {'type': 'Compose', 'runAfter': {}, 'inputs': 'n'}}}},
        })
        self.assertEqual(runner.outputs['Yes'], 'y')
        self.assertEqual(runner.status['No'], 'Skipped')

    def test_query_and_select(self):
        runner = self.run_definition({
            'Q': {'type': 'Query', 'runAfter': {}, 'inputs': {'from': "@createArray('a', '', 'b')", 'where': '@not(empty(item()))'}},
            'S': {'type': 'Select', 'runAfter': {'Q': ['Succeeded']}, 'inputs': {'from': "@body('Q')", 'select': {'v': '@toUpper(item())'}}},
        })
        self.assertEqual(runner.outputs['Q'], {'body': ['a', 'b']})
        self.assertEqual(runner.outputs['S'], {'body': [{'v': 'A'}, {'v': 'B'}]})

    def test_connector_failure_marks_action_failed_and_keeps_body(self):
        def connector(action_name, host, parameters):
            return 404, {'odata.error': {'message': 'not found'}}
        runner = self.run_definition({
            'Get': {'type': 'OpenApiConnection', 'runAfter': {}, 'inputs': {
                'host': {'apiId': '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', 'operationId': 'HttpRequest',
                         'connectionName': 'shared_sharepointonline'},
                'parameters': {'parameters/method': 'GET'}}},
            'Use': {'type': 'Compose', 'runAfter': {'Get': ['Failed']}, 'inputs': "@coalesce(body('Get')?['value'], createArray())"},
        }, connector=connector)
        self.assertEqual(runner.status['Get'], 'Failed')
        self.assertEqual(runner.outputs['Use'], [])

    def test_skills_response_is_recorded(self):
        runner = self.run_definition({
            'Respond_to_the_agent': {'type': 'Response', 'kind': 'Skills', 'runAfter': {}, 'inputs': {
                'statusCode': 200, 'schema': {'type': 'object', 'properties': {}}, 'body': {'status': "@{triggerBody()?['text']}"}}},
        })
        self.assertEqual(runner.response, {'status': 'hello'})


if __name__ == '__main__':
    unittest.main()

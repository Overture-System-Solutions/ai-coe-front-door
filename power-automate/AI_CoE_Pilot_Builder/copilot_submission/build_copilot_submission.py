"""Build the Copilot submission flows (06) for one target site.

    python copilot_submission/build_copilot_submission.py --into DIR    # the template target's site, into DIR

build_pilot.py builds 06 for a tenant's target file (configure() takes the site, description and folder from it)
and the "aicoe" profile renames it afterwards (retarget.py). These are the "pilot" names and publisher (cwdd).

The AI CoE Concierge (a Copilot Studio agent) collects a person's answers in chat, shows them a summary, and on
their yes calls one of these flows ("When an agent calls the flow" -> "Respond to the agent"). Each flow writes the
same SharePoint rows the front door writes for that request, so the site's existing Intake Processing, Triage and
Routing, Review and Decision flows and the front door's My requests handle the request unchanged:

  feedback  AI CoE Pilot Intakes row only (as the front door's "I want to give the AI CoE feedback")
  idea      AI CoE Pilot Intakes row + AI CoE Use Cases row with Status "Submitted" (as "I have an idea for using AI")

What the flow decides, not the model: option codes, review indicators, risk flags, priority, routing, the summary
saved with the request, the record reference and whether anything was saved. The signed-in person's email, name
and the conversation ID come from Copilot Studio's System variables (bound in the tool's input settings), never
from the chat. A repeat of the same answers in the same conversation returns the earlier record instead of writing
a second one, and a partly written idea is finished on retry.

Standard connector only (SharePoint "Send an HTTP request"), one new connection reference, packaged Off. Nothing
here is imported, saved or run in any tenant by this script.
"""
import argparse
import json
import os
import sys
import uuid
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from xml.sax.saxutils import quoteattr

HERE = Path(__file__).resolve().parent
BUILDER = HERE.parent
if str(BUILDER) not in sys.path:
    sys.path.insert(0, str(BUILDER))
import target_file  # noqa: E402

TEMPLATE_TARGET = BUILDER / 'targets' / 'template.json'
CONCIERGE_TEMPLATE = HERE / 'CONCIERGE_INSTRUCTIONS.template.txt'
FRONT_DOOR_FOLDER = 'overture-ai-coe-front-door-audit-fixes'   # the front door's worktree beside the project home
# Set by configure() from a target file (the template target until another is configured).
TARGET = SITE = DELIVERY = OUT_FOLDER = SOLUTION_DESCRIPTION = ORGANIZATION = None
INTAKES = 'AI CoE Pilot Intakes'
USE_CASES = 'AI CoE Use Cases'
LEADERS_GROUP = 'AI CoE Leaders'
CHANNEL_NAME = 'AI CoE Concierge (Copilot)'
TEXT_LIMIT = 1500          # per answer typed in chat
SHORT_TEXT_LIMIT = 255     # SharePoint single-line text (ToolName, RequestorName, RequestorEmail)
NOT_SPECIFIED = 'Not specified'

SOLUTION_NAME = 'AICoEPilotCopilotSubmission'
SOLUTION_DISPLAY_NAME = 'AI CoE Pilot Copilot Submission'
SOLUTION_VERSION = '1.0.0.0'
ZIP_NAME = 'AICoEPilotCopilotSubmission_1_0_0_0.zip'
CONNECTION_REFERENCE = 'cwdd_aicoepilotcopilotsharepoint'
CONNECTION_REFERENCE_DISPLAY = 'AI CoE Pilot Copilot SharePoint'
SP_API = 'shared_sharepointonline'
FIXED_TIME = (2026, 10, 9, 0, 0, 0)
PUBLISHER_XML = '''    <Publisher>
      <UniqueName>OSSCloudWaveDemoPublisher</UniqueName>
      <LocalizedNames>
        <LocalizedName description="OSS CloudWave Demo" languagecode="1033" />
      </LocalizedNames>
      <Descriptions />
      <EMailAddress xsi:nil="true"></EMailAddress>
      <SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>
      <CustomizationPrefix>cwdd</CustomizationPrefix>
      <CustomizationOptionValuePrefix>88001</CustomizationOptionValuePrefix>
      <Addresses />
    </Publisher>'''
XML_ROOT_ATTRIBUTES = ('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.26083.167" '
                       'OrganizationSchemaType="Standard" CRMServerServiceabilityVersion="9.2.26083.00167"')
CONTENT_TYPES = ('\ufeff<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/'
                 'content-types"><Default Extension="xml" ContentType="application/octet-stream" /><Default Extension="json" '
                 'ContentType="application/octet-stream" /></Types>')


def configure(target):
    """Take the site, organization, solution description and output folder from a loaded target file."""
    global TARGET, SITE, DELIVERY, OUT_FOLDER, SOLUTION_DESCRIPTION, ORGANIZATION
    TARGET = target
    SITE, ORGANIZATION, SOLUTION_DESCRIPTION = target.site, target.organization, target.copilot_submission_description
    DELIVERY = target.output_folder
    OUT_FOLDER = DELIVERY / '06_copilot_submission'


def concierge_instructions():
    """The Concierge's Instructions for the configured organization and site."""
    text = CONCIERGE_TEMPLATE.read_bytes().decode('utf-8')
    return text.replace('{organization}', ORGANIZATION).replace('{site}', SITE)


def find_front_door():
    """The front-door source the parity test and the fake SharePoint read (AICOE_FRONT_DOOR overrides)."""
    if os.environ.get('AICOE_FRONT_DOOR'):
        return Path(os.environ['AICOE_FRONT_DOOR'])
    for parent in HERE.parents:
        candidate = parent / FRONT_DOOR_FOLDER
        if (candidate / 'sharepoint' / 'assets' / 'intake-schema.xml').exists():
            return candidate
    return None


def flow_id(kind):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, SITE + '/copilot-submission/%s/v1#flow' % kind))


FLOWS = {
    'feedback': {'name': 'AI CoE Pilot — Copilot Submit Feedback', 'stem': 'AICoEPilotCopilotSubmitFeedback',
                 'description': ('Saves a person\'s feedback about the AI CoE (what they used it for, whether the next step was '
                                 'clear, how easy it was, optional comments and whether the AI CoE may contact them) as an AI CoE '
                                 'Pilot Intakes row, after they have confirmed a summary. Returns status, reference and message.')},
    'idea': {'name': 'AI CoE Pilot — Copilot Submit Idea', 'stem': 'AICoEPilotCopilotSubmitIdea',
             'description': ('Submits a person\'s idea for using AI at work to the AI CoE intake and triage process (an AI CoE '
                             'Pilot Intakes row and an AI CoE Use Cases row), after they have confirmed a summary of their '
                             'answers. Returns status, reference and message.')},
}

# ---------------------------------------------------------------- the questions (wording and options from the front door)

FEEDBACK_OPTIONS = {
    'serviceInvolved': ('What did you contact or use the CoE for?', [
        ('idea', 'Sharing an idea for using AI'), ('toolCheck', 'Checking if a tool or task is okay'),
        ('teamUsage', 'Letting the CoE know about a tool my team uses'), ('helpTraining', 'Getting help or training'),
        ('general', 'Something else, or general feedback')]),
    'gotClearNextStep': ('Did you get a clear next step?', [
        ('clear', 'Yes, very clear'), ('somewhat', 'Somewhat clear'), ('notClear', 'No, not clear'),
        ('notApplicable', 'Not applicable')]),
    'easeRating': ('How easy was the process?', [
        ('veryEasy', 'Very easy'), ('easy', 'Easy'), ('okay', 'Okay'), ('difficult', 'Difficult'),
        ('veryDifficult', 'Very difficult')]),
    'followUpPermission': ('May the CoE contact you about this feedback?', [('yes', 'Yes'), ('no', 'No')]),
}
FEEDBACK_TEXTS = {
    'positiveFeedback': 'What helped?',
    'frictionPoints': 'What was confusing or difficult, if anything?',
    'suggestedImprovement': 'What should the CoE improve?',
}
RESOLUTION_BY_CLARITY = {
    'clear': {'resolutionStatus': 'Reached a clear next step', 'clarityRating': 'Clear', 'confidenceInNextStep': 'High'},
    'somewhat': {'resolutionStatus': 'Partially reached a next step', 'clarityRating': 'Somewhat clear', 'confidenceInNextStep': 'Medium'},
    'notClear': {'resolutionStatus': 'Did not reach a clear next step', 'clarityRating': 'Not clear', 'confidenceInNextStep': 'Low'},
    'notApplicable': {'resolutionStatus': 'Not applicable', 'clarityRating': 'Not applicable', 'confidenceInNextStep': 'Not applicable'},
}

BOUND_INPUTS = [
    ('requestorEmail', 'Signed-in user email',
     'Set in the tool settings to System.User.Email. Never ask for it and never fill it from the conversation.'),
    ('requestorName', 'Signed-in user name',
     'Set in the tool settings to System.User.DisplayName. Never ask for it and never fill it from the conversation.'),
    ('conversationId', 'Conversation ID',
     'Set in the tool settings to System.Conversation.Id. Never ask for it and never fill it from the conversation.'),
]


def _options_text(options):
    return '; '.join(label for _, label in options)


def _inputs(spec):
    out = []
    for index, (name, title, description, required) in enumerate(spec):
        out.append({'name': name, 'key': 'text' if index == 0 else 'text_%d' % index, 'title': title,
                    'description': description, 'required': required})
    return out


INPUTS = {
    'feedback': _inputs([(n, t, d, True) for n, t, d in BOUND_INPUTS] + [
        ('serviceInvolved', 'What they used the CoE for',
         'What did you contact or use the CoE for? One of: %s.' % _options_text(FEEDBACK_OPTIONS['serviceInvolved'][1]), True),
        ('gotClearNextStep', 'Clear next step',
         'Did you get a clear next step? One of: %s.' % _options_text(FEEDBACK_OPTIONS['gotClearNextStep'][1]), True),
        ('easeRating', 'Ease',
         'How easy was the process? One of: %s.' % _options_text(FEEDBACK_OPTIONS['easeRating'][1]), True),
        ('positiveFeedback', 'What helped',
         'What helped? Optional; the person\'s own words, with no names or sensitive details. Empty if they had nothing to add.', False),
        ('frictionPoints', 'What was confusing',
         'What was confusing or difficult, if anything? Optional; empty if nothing.', False),
        ('suggestedImprovement', 'What to improve',
         'What should the CoE improve? Optional; empty if nothing.', False),
        ('followUpPermission', 'May contact',
         'May the CoE contact you about this feedback? Yes or No. If yes, the signed-in person is the contact.', True),
    ]),
}

# ---------------------------------------------------------------- WDL helpers


def q(text):
    """A WDL string literal."""
    return "'" + text.replace("'", "''") + "'"


def inp(name):
    return "outputs('Inputs')?['%s']" % name


def code(name):
    return "outputs('Codes')?['%s']" % name


def label(name):
    return "outputs('Labels')?['%s']?[%s]" % (name, code(name))


def empty_or(value_expr, fallback=NOT_SPECIFIED):
    return 'if(empty(%s), %s, %s)' % (value_expr, q(fallback), value_expr)


def sp_action(method, uri_expr, run_after, body=None):
    parameters = {
        'dataset': SITE,
        'parameters/method': method,
        'parameters/uri': '@' + uri_expr,
        'parameters/headers': {'Accept': 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata'},
    }
    if body is not None:
        parameters['parameters/body'] = body
    return {'runAfter': run_after, 'type': 'OpenApiConnection', 'inputs': {
        'parameters': parameters,
        'host': {'apiId': '/providers/Microsoft.PowerApps/apis/' + SP_API, 'operationId': 'HttpRequest', 'connectionName': SP_API}}}


def list_items_path(list_title):
    return q("_api/web/lists/getbytitle('%s')/items" % list_title)


def items_uri(list_title, select, filter_expr=None, extra=''):
    base = q("_api/web/lists/getbytitle('%s')/items?$select=%s" % (list_title, select))
    if filter_expr is None:
        return 'concat(%s, %s)' % (base, q(extra)) if extra else base
    return 'concat(%s, %s, encodeUriComponent(%s), %s)' % (base, q('&$filter='), filter_expr, q(extra))


def set_var(name, value, run_after=None):
    return {'runAfter': run_after or {}, 'type': 'SetVariable', 'inputs': {'name': name, 'value': value}}


def after(*names, statuses=('Succeeded',)):
    return {n: list(statuses) for n in names}


ALL = ('Succeeded', 'Failed', 'Skipped', 'TimedOut')

# ---------------------------------------------------------------- shared flow parts


def trigger(kind):
    properties, required = {}, []
    for item in INPUTS[kind]:
        properties[item['key']] = {'title': item['title'], 'type': 'string', 'x-ms-dynamically-added': True,
                                   'description': item['description'], 'x-ms-content-hint': 'TEXT'}
        if item['required']:
            required.append(item['key'])
    return {'manual': {'type': 'Request', 'kind': 'Skills', 'inputs': {'schema': {
        'type': 'object', 'properties': properties, 'required': required}}}}


def inputs_compose(kind):
    return {name['name']: "@trim(coalesce(triggerBody()?['%s'], ''))" % name['key'] for name in INPUTS[kind]}


def lookups(options):
    out = {}
    for field, (_, choices) in options.items():
        table = {}
        for value, text in choices:
            table[value.lower()] = value
            table[text.lower()] = value
        out[field] = table
    return out


def labels(options):
    return {field: {value: text for value, text in choices} for field, (_, choices) in options.items()}


def identity_check():
    email, name, conversation = inp('requestorEmail'), inp('requestorName'), inp('conversationId')
    bad = ('or(empty(%s), not(contains(%s, \'@\')), greater(length(%s), %d), empty(%s), greater(length(%s), %d), empty(%s))'
           % (email, email, email, SHORT_TEXT_LIMIT, name, name, SHORT_TEXT_LIMIT, conversation))
    return bad, ("The signed-in email, name or conversation is missing from the tool's input mapping in Copilot Studio, "
                 "so nothing can be saved; the agent's owner has to fix the mapping.")


def option_check(field, options):
    title, choices = options[field]
    return 'equals(%s, null)' % code(field), '%s Choose one of: %s.' % (title, ', '.join(text for _, text in choices))


def length_check(field, title, limit=TEXT_LIMIT):
    return 'greater(length(%s), %d)' % (inp(field), limit), '%s The answer is too long (over %s characters); please shorten it.' % (
        title, format(limit, ','))


def checks_compose(checks):
    return '@createArray(%s)' % ', '.join('if(%s, %s, \'\')' % (condition, q(message)) for condition, message in checks)


def find_earlier(workflow_type, run_after):
    email = inp('requestorEmail')
    filter_expr = "concat('RequestorEmail eq ''', replace(%s, '''', ''''''), ''' and WorkflowType eq ''%s''')" % (email, workflow_type)
    return sp_action('GET', items_uri(INTAKES, 'Id,IntakeId,SubmittedAt,PayloadJson', filter_expr, '&$orderby=Id%20desc&$top=100'),
                     run_after)


def earlier_matches(run_after):
    payload = "coalesce(item()?['PayloadJson'], '')"
    return {'runAfter': run_after, 'type': 'Query', 'inputs': {
        'from': "@coalesce(body('Find_earlier')?['value'], createArray())",
        'where': "@and(contains(%s, string(outputs('Channel'))), contains(%s, string(outputs('Answers'))))" % (payload, payload)}}


def new_reference():
    return "@concat('OVT-AICOE-', utcNow('yyyyMMdd'), '-', toUpper(take(replace(guid(), '-', ''), 8)))"


NOW_ISO = "utcNow('yyyy-MM-ddTHH:mm:ss.fffZ')"


def read_back(run_after):
    filter_expr = "concat('IntakeId eq ''', variables('reference'), '''')"
    return sp_action('GET', items_uri(INTAKES, 'Id,IntakeId,Modified', filter_expr, '&$top=1'), run_after)


def if_confirmed(run_after):
    return {'runAfter': run_after, 'type': 'If',
            'expression': {'and': [{'equals': ["@first(coalesce(body('Read_back')?['value'], createArray()))?['IntakeId']",
                                               "@variables('reference')"]}]},
            'actions': {'Set_status_confirmed': set_var('status', "@if(variables('isNew'), 'saved', 'already_saved')")},
            'else': {'actions': {}}}


def variables_block(extra=()):
    specs = [('status', 'string', 'failed'), ('reference', 'string', ''), ('problems', 'string', ''),
             ('submittedAt', 'string', ''), ('isNew', 'boolean', False), ('note', 'string', '')] + list(extra)
    actions, previous = {}, None
    for name, kind, value in specs:
        action_name = 'Init_' + name
        actions[action_name] = {'runAfter': after(previous) if previous else {}, 'type': 'InitializeVariable',
                                'inputs': {'variables': [{'name': name, 'type': kind, 'value': value}]}}
        previous = action_name
    return actions, previous


def finish(saved_message):
    reference = "variables('reference')"
    return {
        'Message': {'runAfter': after('Submit', statuses=ALL), 'type': 'Compose', 'inputs': {
            'saved': saved_message,
            'already_saved': "@concat('This was already saved earlier in this conversation as ', %s, '. Nothing new was created.')" % reference,
            'not_confirmed': ("@concat('SharePoint accepted record ', %s, ' but did not confirm it back yet. Ask me to try again in a "
                              "minute; it will not create a duplicate.')" % reference),
            'incomplete': ("@concat('Your idea was only partly saved (record ', %s, '). Ask me to try again; I will finish it "
                           "without creating a duplicate.')" % reference),
            'needs_changes': "@concat('Not saved yet. ', variables('problems'))",
            'failed': ('Not saved. Something went wrong on the AI CoE side and nothing was confirmed. Ask me to try again; '
                       'if it keeps failing, use the AI CoE page.'),
        }},
        'Respond_to_the_agent': {'runAfter': after('Message'), 'type': 'Response', 'kind': 'Skills', 'inputs': {
            'statusCode': 200,
            'schema': {'type': 'object', 'properties': {
                'status': {'title': 'status', 'type': 'string', 'x-ms-dynamically-added': True,
                           'description': 'saved, already_saved, not_confirmed, incomplete, needs_changes or failed'},
                'reference': {'title': 'reference', 'type': 'string', 'x-ms-dynamically-added': True,
                              'description': 'The record reference (OVT-AICOE-...), empty when nothing was saved'},
                'message': {'title': 'message', 'type': 'string', 'x-ms-dynamically-added': True,
                            'description': 'What to tell the person, in plain words'}}},
            'body': {
                'status': "@{variables('status')}",
                'reference': "@{if(or(equals(variables('status'), 'failed'), equals(variables('status'), 'needs_changes')), '', variables('reference'))}",
                'message': "@{outputs('Message')?[variables('status')]}",
            }}},
    }


def definition(actions, kind):
    return {'$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
            'contentVersion': '1.0.0.0',
            'parameters': {'$authentication': {'defaultValue': {}, 'type': 'SecureObject'},
                           '$connections': {'defaultValue': {}, 'type': 'Object'}},
            'triggers': trigger(kind), 'actions': actions, 'outputs': {}}

# ---------------------------------------------------------------- feedback


def feedback_definition():
    options = FEEDBACK_OPTIONS
    checks = [identity_check()] + [option_check(field, options) for field in options]
    checks += [length_check(field, title) for field, title in FEEDBACK_TEXTS.items()]
    permitted = "equals(%s, 'yes')" % code('followUpPermission')

    record = {
        'recordId': "@concat('feedback-', guid())",
        'createdAt': '@' + NOW_ISO,
        'workflowId': 'feedback',
        'workflowVersion': '2.0',
        'workflowOrService': '@' + label('serviceInvolved'),
        'resolutionStatus': "@outputs('Resolution')?[%s]?['resolutionStatus']" % code('gotClearNextStep'),
        'easeRating': '@' + label('easeRating'),
        'clarityRating': "@outputs('Resolution')?[%s]?['clarityRating']" % code('gotClearNextStep'),
        'confidenceInNextStep': "@outputs('Resolution')?[%s]?['confidenceInNextStep']" % code('gotClearNextStep'),
        'positiveFeedback': '@' + empty_or(inp('positiveFeedback')),
        'frictionPoints': '@' + empty_or(inp('frictionPoints')),
        'suggestedImprovement': '@' + empty_or(inp('suggestedImprovement')),
        'suggestedThemes': [],
        'followUpPermission': "@if(%s, 'Yes', 'No')" % permitted,
        'contact': "@if(%s, outputs('Contact'), null)" % permitted,
        'status': 'confirmed',
        'originalAnswers': "@outputs('Answers')",
        'channel': "@outputs('Channel')",
    }
    answers = {
        'serviceInvolved': '@' + code('serviceInvolved'),
        'gotClearNextStep': '@' + code('gotClearNextStep'),
        'easeRating': '@' + code('easeRating'),
        'positiveFeedback': '@' + inp('positiveFeedback'),
        'frictionPoints': '@' + inp('frictionPoints'),
        'suggestedImprovement': '@' + inp('suggestedImprovement'),
        'followUpPermission': '@' + code('followUpPermission'),
        'contactName': "@if(%s, %s, '')" % (permitted, inp('requestorName')),
        'contactEmail': "@if(%s, %s, '')" % (permitted, inp('requestorEmail')),
    }
    intake = {
        'Title': "@concat('Front-door feedback — ', variables('reference'))",
        'IntakeId': "@variables('reference')",
        'WorkflowType': 'feedback',
        'PilotWorkflowVersion': '2.0',
        'Status': 'Submitted - Pilot',
        'Priority': 'Normal',
        'RequestorName': '@' + inp('requestorName'),
        'RequestorEmail': '@' + inp('requestorEmail'),
        'SubmittedAt': "@variables('submittedAt')",
        'CompanyDataOrWorkflow': False,
        'SensitiveOrRegulated': False,
        'HumanReview': NOT_SPECIFIED,
        'ToolName': '@' + label('serviceInvolved'),
        'RoutingOutcome': 'AI CoE service queue',
        'PayloadJson': "@string(outputs('Payload'))",
        'PilotOnly': True,
    }
    main = {
        'Channel': {'runAfter': {}, 'type': 'Compose', 'inputs': {'name': CHANNEL_NAME, 'conversationId': '@' + inp('conversationId')}},
        'Contact': {'runAfter': after('Channel'), 'type': 'Compose', 'inputs': {
            'name': '@' + inp('requestorName'), 'email': '@' + inp('requestorEmail')}},
        'Answers': {'runAfter': after('Contact'), 'type': 'Compose', 'inputs': answers},
        'Set_note': set_var('note', "@if(%s, ' and may contact you about it.', '. Since you asked not to be contacted, they will not "
                                    "contact you about it.')" % permitted, after('Answers')),
        'Find_earlier': find_earlier('feedback', after('Set_note')),
        'Earlier_matches': earlier_matches(after('Find_earlier')),
        'If_earlier': {'runAfter': after('Earlier_matches'), 'type': 'If',
                       'expression': {'and': [{'greater': ["@length(body('Earlier_matches'))", 0]}]},
                       'actions': {
                           'Set_reference_earlier': set_var('reference', "@first(body('Earlier_matches'))?['IntakeId']"),
                           'Set_status_earlier': set_var('status', 'not_confirmed', after('Set_reference_earlier')),
                       },
                       'else': {'actions': {
                           'Set_reference_new': set_var('reference', new_reference()),
                           'Set_submitted_at': set_var('submittedAt', '@' + NOW_ISO, after('Set_reference_new')),
                           'Set_is_new': set_var('isNew', True, after('Set_submitted_at')),
                       }}},
        'Payload': {'runAfter': after('If_earlier'), 'type': 'Compose', 'inputs': record},
        'Intake_body': {'runAfter': after('Payload'), 'type': 'Compose', 'inputs': intake},
        'If_new': {'runAfter': after('Intake_body'), 'type': 'If',
                   'expression': {'and': [{'equals': ["@variables('isNew')", True]}]},
                   'actions': {
                       'Create_intake': sp_action('POST', list_items_path(INTAKES), {}, "@outputs('Intake_body')"),
                       'Set_status_written': set_var('status', 'not_confirmed', after('Create_intake')),
                   },
                   'else': {'actions': {}}},
        'Read_back': read_back(after('If_new')),
        'If_confirmed': if_confirmed(after('Read_back')),
    }
    submit = {
        'Inputs': {'runAfter': {}, 'type': 'Compose', 'inputs': inputs_compose('feedback')},
        'Lookups': {'runAfter': after('Inputs'), 'type': 'Compose', 'inputs': lookups(options)},
        'Labels': {'runAfter': after('Lookups'), 'type': 'Compose', 'inputs': labels(options)},
        'Resolution': {'runAfter': after('Labels'), 'type': 'Compose', 'inputs': RESOLUTION_BY_CLARITY},
        'Codes': {'runAfter': after('Resolution'), 'type': 'Compose', 'inputs': {
            field: "@outputs('Lookups')?['%s']?[toLower(%s)]" % (field, inp(field)) for field in options}},
        'Checks': {'runAfter': after('Codes'), 'type': 'Compose', 'inputs': checks_compose(checks)},
        'Problems': {'runAfter': after('Checks'), 'type': 'Query', 'inputs': {'from': "@outputs('Checks')", 'where': '@not(empty(item()))'}},
        'If_problems': {'runAfter': after('Problems'), 'type': 'If',
                        'expression': {'and': [{'greater': ["@length(body('Problems'))", 0]}]},
                        'actions': {
                            'Set_problems': set_var('problems', "@join(body('Problems'), ' ')"),
                            'Set_status_needs_changes': set_var('status', 'needs_changes', after('Set_problems')),
                        },
                        'else': {'actions': main}},
    }
    actions, last = variables_block()
    actions['Submit'] = {'runAfter': after(last), 'type': 'Scope', 'actions': submit}
    actions.update(finish("@concat('Saved. Your feedback is recorded as ', variables('reference'), '. Someone from the AI CoE team "
                          "will read it', variables('note'))"))
    return definition(actions, 'feedback')


DEFINITIONS = {'feedback': feedback_definition}

# ---------------------------------------------------------------- idea

IDEA_OPTIONS = {
    'frequency': ('How often does it happen?', [
        ('daily', 'Every day'), ('weekly', 'A few times a week'), ('monthly', 'A few times a month'), ('rarely', 'Rarely'),
        ('unsure', 'Not sure')]),
    'timeSpent': ('About how much time does it take today?', [
        ('minutes', 'A few minutes'), ('underHour', 'Less than an hour'), ('hours', 'A few hours'), ('mostOfDay', 'Most of a day'),
        ('varies', 'It varies a lot'), ('unsure', 'Not sure')]),
    'informationCategories': ('What kind of information might be involved?', [
        ('public', 'Public information'), ('internal', 'Internal business information'), ('employee', 'Employee information'),
        ('customer', 'Customer information'), ('patient', 'Patient information'),
        ('otherConfidential', 'Other confidential information'), ('unsure', 'I am not sure')]),
    'aiAlreadyUsed': ('Is anyone already using AI for this work?', [('yes', 'Yes'), ('no', 'No'), ('unsure', 'Not sure')]),
    'hasDeadlineSponsor': ('Is there a deadline, sponsor, or current project connected to it?', [
        ('yes', 'Yes'), ('no', 'No'), ('unsure', 'Not sure')]),
}
IDEA_SINGLE = ['frequency', 'timeSpent', 'aiAlreadyUsed', 'hasDeadlineSponsor']
IDEA_TEXTS = {   # name -> (question, required)
    'workToImprove': ('What work would you like to improve?', True),
    'painPoints': ('What makes this work slow, difficult, repetitive, or frustrating?', True),
    'peopleInvolved': ('Who performs or is affected by the work?', True),
    'systemsInvolved': ('What systems or tools are involved?', False),
    'informationUsed': ('What information is used to do this work?', False),
    'desiredOutcome': ('What would a better result look like?', True),
    'successMeasure': ('How would the team know the idea worked?', False),
    'deadlineSponsorDetail': ('Tell us more about the deadline, sponsor, or project.', False),
    'anythingElse': ('Is there anything else the CoE should understand?', False),
}
SENSITIVE_CATEGORIES = ['patient', 'employee', 'customer', 'otherConfidential', 'regulated', 'unsure']
AUTOMATION_PHRASES = ['automatically decide', 'auto-approve', 'automatically approve', 'without a person', 'without human review',
                      'no human review', 'automatically reject', 'automatically send']
SYSTEM_SEPARATORS = [',', ' and ', ';', '/', '+']
EXECUTIVE_MARK = {'level': 'executive', 'reason': 'Submitted by a member of the leaders group; reviewed sooner.'}
WORKING_DAY_OFFSETS = '2,2,2,2,4,4,3'   # by dayOfWeek (Sunday = 0): two working days later, Monday to Friday

INPUTS['idea'] = _inputs([(n, t, d, True) for n, t, d in BOUND_INPUTS] + [
    ('workToImprove', 'Work to improve', 'What work would you like to improve? The task or process in the person\'s own words.', True),
    ('painPoints', 'What makes it hard', 'What makes this work slow, difficult, repetitive, or frustrating?', True),
    ('peopleInvolved', 'People involved', 'Who performs or is affected by the work? Roles or teams, not individual names.', True),
    ('frequency', 'How often', 'How often does it happen? One of: %s.' % _options_text(IDEA_OPTIONS['frequency'][1]), True),
    ('timeSpent', 'Time it takes', 'About how much time does it take today? One of: %s.' % _options_text(IDEA_OPTIONS['timeSpent'][1]), True),
    ('systemsInvolved', 'Systems involved', 'What systems or tools are involved? Optional; empty if not known.', False),
    ('informationUsed', 'Information used',
     'What information is used to do this work, in general terms only (like contact details), never the information itself. Optional.', False),
    ('informationCategories', 'Kinds of information',
     'What kind of information might be involved? One or more of, separated by commas: %s. "I am not sure" goes alone.'
     % _options_text(IDEA_OPTIONS['informationCategories'][1]).replace('; ', ', '), True),
    ('aiAlreadyUsed', 'AI already used', 'Is anyone already using AI for this work? One of: Yes; No; Not sure.', True),
    ('aiToolName', 'AI tool in use', 'What tool or tools are being used? Only when AI is already used; otherwise empty.', False),
    ('desiredOutcome', 'Better result', 'What would a better result look like?', True),
    ('successMeasure', 'Success measure', 'How would the team know the idea worked? Optional; empty if not sure yet.', False),
    ('hasDeadlineSponsor', 'Deadline or sponsor',
     'Is there a deadline, sponsor, or current project connected to it? One of: Yes; No; Not sure.', True),
    ('deadlineSponsorDetail', 'Deadline or sponsor detail',
     'Tell us more about the deadline, sponsor, or project. Only when the answer above is Yes; otherwise empty.', False),
    ('anythingElse', 'Anything else', 'Is there anything else the CoE should understand? Optional.', False),
])


def idea_definition():
    options = IDEA_OPTIONS
    cats = "body('Category_codes')"
    is_yes = lambda field: "equals(%s, 'yes')" % code(field)  # noqa: E731
    tool = "if(%s, %s, '')" % (is_yes('aiAlreadyUsed'), inp('aiToolName'))
    detail = "if(%s, %s, '')" % (is_yes('hasDeadlineSponsor'), inp('deadlineSponsorDetail'))
    systems = inp('systemsInvolved')
    automation_text = "toLower(concat(%s, ' ', %s, ' ', %s))" % (inp('desiredOutcome'), inp('painPoints'), inp('workToImprove'))

    checks = [identity_check()]
    for field, (question, required) in IDEA_TEXTS.items():
        if required:
            checks.append(('empty(%s)' % inp(field), '%s Please answer it.' % question))
    checks += [option_check(field, options) for field in IDEA_SINGLE]
    category_question, category_choices = options['informationCategories']
    category_list = ', '.join(text for _, text in category_choices)
    checks += [
        ("empty(body('Category_named'))", '%s Pick at least one of: %s.' % (category_question, category_list)),
        ("not(empty(body('Category_unknown')))", '%s Use only these options: %s.' % (category_question, category_list)),
        ("and(contains(%s, 'unsure'), greater(length(%s), 1))" % (cats, cats),
         '"I am not sure" can\'t be combined with other kinds of information; choose it alone or leave it out.'),
        ('and(%s, empty(%s))' % (is_yes('aiAlreadyUsed'), inp('aiToolName')), 'What tool or tools are being used? Please name them.'),
        ('greater(length(%s), %d)' % (inp('aiToolName'), SHORT_TEXT_LIMIT),
         'What tool or tools are being used? Keep the answer under %d characters.' % SHORT_TEXT_LIMIT),
        ('and(%s, empty(%s))' % (is_yes('hasDeadlineSponsor'), inp('deadlineSponsorDetail')),
         'Tell us more about the deadline, sponsor, or project. Please add a short description.'),
    ]
    checks += [length_check(field, question) for field, (question, _) in IDEA_TEXTS.items()]

    indicators = [
        ("or(contains(%s, 'patient'), contains(%s, 'otherConfidential'))" % (cats, cats),
         'Patient or other confidential information may be involved'),
        ("or(contains(%s, 'employee'), contains(%s, 'customer'))" % (cats, cats), 'Employee or customer information may be involved'),
        ("contains(%s, 'unsure')" % cats, 'The employee is unsure about the information involved'),
        (is_yes('aiAlreadyUsed'), 'An AI tool may already be in use for this work'),
        ('and(not(empty(%s)), or(%s))' % (systems, ', '.join('contains(toLower(%s), %s)' % (systems, q(s)) for s in SYSTEM_SEPARATORS)),
         'Multiple systems may need to be connected'),
        ('or(%s)' % ', '.join('contains(%s, %s)' % (automation_text, q(p)) for p in AUTOMATION_PHRASES),
         'Automated decisions or actions may be involved'),
    ]
    sensitive = 'or(%s)' % ', '.join("contains(%s, '%s')" % (cats, c) for c in SENSITIVE_CATEGORIES)
    company = "greater(length(body('Category_company')), 0)"
    requires_review = "outputs('Review')?['requiresReview']"
    executive = "variables('executive')"

    answers = {
        'workToImprove': '@' + inp('workToImprove'),
        'painPoints': '@' + inp('painPoints'),
        'peopleInvolved': '@' + inp('peopleInvolved'),
        'frequency': '@' + code('frequency'),
        'timeSpent': '@' + code('timeSpent'),
        'systemsInvolved': '@' + systems,
        'informationUsed': '@' + inp('informationUsed'),
        'informationCategories': '@' + cats,
        'aiAlreadyUsed': '@' + code('aiAlreadyUsed'),
        'aiToolName': '@' + tool,
        'desiredOutcome': '@' + inp('desiredOutcome'),
        'successMeasure': '@' + inp('successMeasure'),
        'hasDeadlineSponsor': '@' + code('hasDeadlineSponsor'),
        'deadlineSponsorDetail': '@' + detail,
        'anythingElse': '@' + inp('anythingElse'),
    }
    work = inp('workToImprove')
    summary = {
        'title': "@if(greater(length(%s), 70), concat(trim(take(%s, 69)), '…'), %s)" % (work, work, work),
        'problemToSolve': '@' + empty_or(inp('painPoints')),
        'currentProcess': '@' + empty_or(work),
        'peopleAffected': '@' + empty_or(inp('peopleInvolved')),
        'frequencyAndEffort': "@concat(%s, '; ', %s)" % (label('frequency'), label('timeSpent')),
        'systemsInvolved': '@' + empty_or(systems),
        'informationCategories': "@join(body('Category_labels'), ', ')",
        'currentAiActivity': "@if(%s, concat('Yes', if(empty(%s), '', concat(' — ', %s))), %s)" % (
            is_yes('aiAlreadyUsed'), tool, tool, label('aiAlreadyUsed')),
        'desiredOutcome': '@' + empty_or(inp('desiredOutcome')),
        'possibleMeasuresOfSuccess': '@' + empty_or(inp('successMeasure')),
        'openQuestions': 'This draft was created without AI assistance, so it closely follows the original answers.',
        'suggestedNextStep': 'An AI CoE team member will review this idea.',
    }
    record = {
        'submissionId': "@concat('idea-', guid())",
        'createdAt': '@' + NOW_ISO,
        'workflowId': 'idea',
        'workflowVersion': '2.1',
        'originalAnswers': "@outputs('Answers')",
        'confirmedSummary': "@outputs('Summary')",
        'reviewIndicators': "@body('Review_indicators')",
        'status': 'confirmed',
        'channel': "@outputs('Channel')",
    }
    intake = {
        'Title': "@concat('AI idea — ', variables('reference'))",
        'IntakeId': "@variables('reference')",
        'WorkflowType': 'idea',
        'PilotWorkflowVersion': '2.1',
        'Status': 'Submitted - Pilot',
        'Priority': "@if(or(%s, %s), 'High', 'Normal')" % (executive, requires_review),
        'RequestorName': '@' + inp('requestorName'),
        'RequestorEmail': '@' + inp('requestorEmail'),
        'SubmittedAt': "@variables('submittedAt')",
        'CompanyDataOrWorkflow': "@outputs('Flags')?['companyData']",
        'SensitiveOrRegulated': "@outputs('Flags')?['sensitive']",
        'HumanReview': NOT_SPECIFIED,
        'ToolName': '@' + tool,
        'RoutingOutcome': "@if(%s, 'AI CoE governance review', 'AI CoE service queue')" % requires_review,
        'PayloadJson': "@string(outputs('Payload_marked'))",
        'PilotOnly': False,
    }
    use_case = {
        'Title': "@concat('AI idea — ', variables('reference'))",
        'CoEID': "@variables('reference')",
        'SubmitterEmail': '@' + inp('requestorEmail'),
        'BusinessProblem': "@take(outputs('Summary')?['problemToSolve'], 12000)",
        'BusinessOwnerEmail': '@' + inp('requestorEmail'),
        'DataSensitivity': "@if(outputs('Flags')?['sensitive'], 'Restricted', if(outputs('Flags')?['companyData'], 'Confidential', 'Internal'))",
        'ExternalUsers': False,
        'AutonomousActions': False,
        'EstimatedMonthlyCost': 0,
        'Status': 'Submitted',
        'IntakeProcessed': False,
        'TriageComplete': False,
        'ApprovalRequested': False,
        'LastStatusChanged': "@variables('submittedAt')",
        'PilotMeasure': "@take(join(body('Pilot_measure_parts'), decodeUriComponent('%0A%0A')), 12000)",
    }
    review_by = ("addDays(variables('submittedAt'), int(split('%s', ',')[dayOfWeek(variables('submittedAt'))]), "
                 "'yyyy-MM-ddTHH:mm:ss.fffZ')" % WORKING_DAY_OFFSETS)
    leaders_uri = q("_api/web/sitegroups/getbyname('%s')/users?$select=Email,UserPrincipalName" % LEADERS_GROUP)
    email_lower = 'toLower(%s)' % inp('requestorEmail')
    use_case_filter = "concat('CoEID eq ''', variables('reference'), '''')"

    main = {
        'Channel': {'runAfter': {}, 'type': 'Compose', 'inputs': {'name': CHANNEL_NAME, 'conversationId': '@' + inp('conversationId')}},
        'Answers': {'runAfter': after('Channel'), 'type': 'Compose', 'inputs': answers},
        'Indicator_checks': {'runAfter': after('Answers'), 'type': 'Compose', 'inputs': checks_compose(indicators)},
        'Review_indicators': {'runAfter': after('Indicator_checks'), 'type': 'Query',
                              'inputs': {'from': "@outputs('Indicator_checks')", 'where': '@not(empty(item()))'}},
        'Category_company': {'runAfter': after('Review_indicators'), 'type': 'Query',
                             'inputs': {'from': '@' + cats, 'where': "@and(not(equals(item(), 'public')), not(equals(item(), 'none')))"}},
        'Flags': {'runAfter': after('Category_company'), 'type': 'Compose', 'inputs': {
            'sensitive': '@' + sensitive, 'companyData': '@' + company}},
        'Review': {'runAfter': after('Flags'), 'type': 'Compose', 'inputs': {
            'requiresReview': "@or(outputs('Flags')?['companyData'], outputs('Flags')?['sensitive'], greater(length(body('Review_indicators')), 0))"}},
        'Set_note': set_var('note', "@if(greater(length(body('Review_indicators')), 0), ', and since some review indicators were noted, "
                                    "it may also need a closer look before moving forward.', '.')", after('Review')),
        'Summary': {'runAfter': after('Set_note'), 'type': 'Compose', 'inputs': summary},
        'Pilot_measure_parts': {'runAfter': after('Summary'), 'type': 'Query', 'inputs': {
            'from': "@createArray(outputs('Summary')?['desiredOutcome'], outputs('Summary')?['possibleMeasuresOfSuccess'], %s, %s)"
                    % (inp('desiredOutcome'), inp('successMeasure')),
            'where': '@not(empty(trim(item())))'}},
        'Get_leaders': sp_action('GET', leaders_uri, after('Pilot_measure_parts')),
        'Leader_matches': {'runAfter': after('Get_leaders', statuses=('Succeeded', 'Failed', 'TimedOut')), 'type': 'Query', 'inputs': {
            'from': "@coalesce(body('Get_leaders')?['value'], createArray())",
            'where': "@or(equals(toLower(coalesce(item()?['Email'], '')), %s), equals(toLower(coalesce(item()?['UserPrincipalName'], '')), %s))"
                     % (email_lower, email_lower)}},
        'Find_earlier': find_earlier('idea', after('Leader_matches')),
        'Earlier_matches': earlier_matches(after('Find_earlier')),
        'If_earlier': {'runAfter': after('Earlier_matches'), 'type': 'If',
                       'expression': {'and': [{'greater': ["@length(body('Earlier_matches'))", 0]}]},
                       'actions': {
                           'Set_reference_earlier': set_var('reference', "@first(body('Earlier_matches'))?['IntakeId']"),
                           'Set_submitted_at_earlier': set_var('submittedAt', "@first(body('Earlier_matches'))?['SubmittedAt']",
                                                               after('Set_reference_earlier')),
                           'Set_executive_earlier': set_var('executive', "@contains(coalesce(first(body('Earlier_matches'))?['PayloadJson'], ''), %s)"
                                                            % q('"reviewPriority":{"level":"executive"'),
                                                            after('Set_submitted_at_earlier')),
                           'Set_status_earlier': set_var('status', 'incomplete', after('Set_executive_earlier')),
                       },
                       'else': {'actions': {
                           'Set_reference_new': set_var('reference', new_reference()),
                           'Set_submitted_at': set_var('submittedAt', '@' + NOW_ISO, after('Set_reference_new')),
                           'Set_is_new': set_var('isNew', True, after('Set_submitted_at')),
                           'Set_executive_new': set_var('executive', "@greater(length(body('Leader_matches')), 0)", after('Set_is_new')),
                       }}},
        'Payload': {'runAfter': after('If_earlier'), 'type': 'Compose', 'inputs': record},
        'Payload_marked': {'runAfter': after('Payload'), 'type': 'Compose', 'inputs':
                           "@if(%s, setProperty(outputs('Payload'), 'reviewPriority', json(%s)), outputs('Payload'))"
                           % (executive, q(json.dumps(EXECUTIVE_MARK, separators=(',', ':'))))},
        'Intake_body': {'runAfter': after('Payload_marked'), 'type': 'Compose', 'inputs': intake},
        'Use_case_fields': {'runAfter': after('Intake_body'), 'type': 'Compose', 'inputs': use_case},
        'Use_case_body': {'runAfter': after('Use_case_fields'), 'type': 'Compose', 'inputs':
                          "@if(%s, setProperty(outputs('Use_case_fields'), 'NextReviewDate', %s), outputs('Use_case_fields'))"
                          % (executive, review_by)},
        'If_new': {'runAfter': after('Use_case_body'), 'type': 'If',
                   'expression': {'and': [{'equals': ["@variables('isNew')", True]}]},
                   'actions': {
                       'Create_intake': sp_action('POST', list_items_path(INTAKES), {}, "@outputs('Intake_body')"),
                       'Set_status_written': set_var('status', 'incomplete', after('Create_intake')),
                   },
                   'else': {'actions': {}}},
        'Find_use_case': sp_action('GET', items_uri(USE_CASES, 'Id,CoEID', use_case_filter, '&$top=1'), after('If_new')),
        'If_use_case_missing': {'runAfter': after('Find_use_case'), 'type': 'If',
                                'expression': {'and': [{'equals': ["@length(coalesce(body('Find_use_case')?['value'], createArray()))", 0]}]},
                                'actions': {'Create_use_case': sp_action('POST', list_items_path(USE_CASES), {}, "@outputs('Use_case_body')")},
                                'else': {'actions': {}}},
        'Set_status_use_case': set_var('status', 'not_confirmed', after('If_use_case_missing')),
        'Read_back': read_back(after('Set_status_use_case')),
        'If_confirmed': if_confirmed(after('Read_back')),
    }
    submit = {
        'Inputs': {'runAfter': {}, 'type': 'Compose', 'inputs': inputs_compose('idea')},
        'Lookups': {'runAfter': after('Inputs'), 'type': 'Compose', 'inputs': lookups(options)},
        'Labels': {'runAfter': after('Lookups'), 'type': 'Compose', 'inputs': labels(options)},
        'Codes': {'runAfter': after('Labels'), 'type': 'Compose', 'inputs': {
            field: "@outputs('Lookups')?['%s']?[toLower(%s)]" % (field, inp(field)) for field in IDEA_SINGLE}},
        'Category_pieces': {'runAfter': after('Codes'), 'type': 'Select', 'inputs': {
            'from': "@split(replace(%s, ';', ','), ',')" % inp('informationCategories'),
            'select': {'raw': '@trim(item())', 'code': "@outputs('Lookups')?['informationCategories']?[toLower(trim(item()))]"}}},
        'Category_named': {'runAfter': after('Category_pieces'), 'type': 'Query',
                           'inputs': {'from': "@body('Category_pieces')", 'where': "@not(empty(item()?['raw']))"}},
        'Category_unknown': {'runAfter': after('Category_named'), 'type': 'Query',
                             'inputs': {'from': "@body('Category_named')", 'where': "@equals(item()?['code'], null)"}},
        'Category_found': {'runAfter': after('Category_unknown'), 'type': 'Select',
                           'inputs': {'from': "@body('Category_named')", 'select': "@item()?['code']"}},
        'Category_codes': {'runAfter': after('Category_found'), 'type': 'Query', 'inputs': {
            'from': '@createArray(%s)' % ', '.join(q(value) for value, _ in options['informationCategories'][1]),
            'where': "@contains(body('Category_found'), item())"}},
        'Category_labels': {'runAfter': after('Category_codes'), 'type': 'Select', 'inputs': {
            'from': '@' + cats, 'select': "@outputs('Labels')?['informationCategories']?[item()]"}},
        'Checks': {'runAfter': after('Category_labels'), 'type': 'Compose', 'inputs': checks_compose(checks)},
        'Problems': {'runAfter': after('Checks'), 'type': 'Query', 'inputs': {'from': "@outputs('Checks')", 'where': '@not(empty(item()))'}},
        'If_problems': {'runAfter': after('Problems'), 'type': 'If',
                        'expression': {'and': [{'greater': ["@length(body('Problems'))", 0]}]},
                        'actions': {
                            'Set_problems': set_var('problems', "@join(body('Problems'), ' ')"),
                            'Set_status_needs_changes': set_var('status', 'needs_changes', after('Set_problems')),
                        },
                        'else': {'actions': main}},
    }
    actions, last = variables_block(extra=[('executive', 'boolean', False)])
    actions['Submit'] = {'runAfter': after(last), 'type': 'Scope', 'actions': submit}
    actions.update(finish("@concat('Saved. Your idea is recorded as ', variables('reference'), '. It will enter the AI CoE intake "
                          "and triage process', variables('note'), ' You can follow it under My requests on the AI CoE page.')"))
    return definition(actions, 'idea')


DEFINITIONS['idea'] = idea_definition

# ---------------------------------------------------------------- packaging


def workflow_file(kind):
    return 'Workflows/%s-%s.json' % (FLOWS[kind]['stem'], flow_id(kind).upper())


def workflow_json(kind):
    document = {'properties': {
        'connectionReferences': {SP_API: {'runtimeSource': 'embedded',
                                          'connection': {'connectionReferenceLogicalName': CONNECTION_REFERENCE},
                                          'api': {'name': SP_API}}},
        'definition': DEFINITIONS[kind](),
        'templateName': None},
        'schemaVersion': '1.0.0.0'}
    return json.dumps(document, indent=2, ensure_ascii=False).replace('\n', '\r\n')


def solution_xml():
    roots = '\r\n'.join('      <RootComponent type="29" id="{%s}" behavior="0" />' % flow_id(kind) for kind in DEFINITIONS)
    text = '''<ImportExportXml version="9.2.26083.167" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" %s>
  <SolutionManifest>
    <UniqueName>%s</UniqueName>
    <LocalizedNames>
      <LocalizedName description=%s languagecode="1033" />
    </LocalizedNames>
    <Descriptions>
      <Description description=%s languagecode="1033" />
    </Descriptions>
    <Version>%s</Version>
    <Managed>0</Managed>
%s
    <RootComponents>
%s
    </RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>''' % (XML_ROOT_ATTRIBUTES, SOLUTION_NAME, quoteattr(SOLUTION_DISPLAY_NAME), quoteattr(SOLUTION_DESCRIPTION),
                         SOLUTION_VERSION, PUBLISHER_XML, roots)
    return text.replace('\r\n', '\n').replace('\n', '\r\n')


def customizations_xml():
    workflows = []
    for kind in DEFINITIONS:
        flow = FLOWS[kind]
        workflows.append('''    <Workflow WorkflowId="{%s}" Name=%s Description=%s>
      <JsonFileName>/%s</JsonFileName>
      <Type>1</Type>
      <Subprocess>0</Subprocess>
      <Category>5</Category>
      <Mode>0</Mode>
      <Scope>4</Scope>
      <OnDemand>0</OnDemand>
      <TriggerOnCreate>0</TriggerOnCreate>
      <TriggerOnDelete>0</TriggerOnDelete>
      <AsyncAutodelete>0</AsyncAutodelete>
      <SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>
      <StateCode>0</StateCode>
      <StatusCode>1</StatusCode>
      <RunAs>1</RunAs>
      <IsTransacted>1</IsTransacted>
      <IntroducedVersion>%s</IntroducedVersion>
      <IsCustomizable>1</IsCustomizable>
      <IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>
      <ModernFlowType>0</ModernFlowType>
      <PrimaryEntity>none</PrimaryEntity>
      <LocalizedNames>
        <LocalizedName languagecode="1033" description=%s />
      </LocalizedNames>
      <Descriptions>
        <Description languagecode="1033" description=%s />
      </Descriptions>
    </Workflow>''' % (flow_id(kind), quoteattr(flow['name']), quoteattr(flow['description']), workflow_file(kind), SOLUTION_VERSION,
                     quoteattr(flow['name']), quoteattr(flow['description'])))
    text = '''<ImportExportXml %s>
  <Entities></Entities>
  <Roles></Roles>
  <Workflows>
%s
  </Workflows>
  <FieldSecurityProfiles></FieldSecurityProfiles>
  <Templates />
  <EntityMaps />
  <EntityRelationships />
  <OrganizationSettings />
  <optionsets />
  <CustomControls />
  <EntityDataProviders />
  <connectionreferences>
    <connectionreference connectionreferencelogicalname="%s">
      <connectionreferencedisplayname>%s</connectionreferencedisplayname>
      <connectorid>/providers/Microsoft.PowerApps/apis/%s</connectorid>
      <iscustomizable>1</iscustomizable>
      <promptingbehavior>0</promptingbehavior>
      <statecode>0</statecode>
      <statuscode>1</statuscode>
    </connectionreference>
  </connectionreferences>
  <Languages>
    <Language>1033</Language>
  </Languages>
</ImportExportXml>''' % (XML_ROOT_ATTRIBUTES, '\n'.join(workflows), CONNECTION_REFERENCE, CONNECTION_REFERENCE_DISPLAY, SP_API)
    return text.replace('\r\n', '\n').replace('\n', '\r\n')


def build(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    members = [('customizations.xml', customizations_xml()), ('solution.xml', solution_xml())]
    members += [(workflow_file(kind), workflow_json(kind)) for kind in DEFINITIONS]
    members.append(('[Content_Types].xml', CONTENT_TYPES))
    out = folder / ZIP_NAME
    with zipfile.ZipFile(out, 'w') as archive:
        for name, text in members:
            entry = zipfile.ZipInfo(name, FIXED_TIME)
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, text.encode('utf-8'))
    return out


def load_definitions(zip_path):
    """The definitions as packaged, keyed by flow kind (read back from the ZIP's own XML and JSON)."""
    with zipfile.ZipFile(zip_path) as archive:
        root = ET.fromstring(archive.read('customizations.xml').decode('utf-8-sig'))
        out = {}
        for workflow in root.iter('Workflow'):
            workflow_id = workflow.get('WorkflowId').strip('{}')
            kind = [k for k in FLOWS if flow_id(k) == workflow_id][0]
            document = json.loads(archive.read(workflow.find('JsonFileName').text.lstrip('/')).decode('utf-8-sig'))
            out[kind] = document['properties']['definition']
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--into', type=Path, default=OUT_FOLDER)
    args = parser.parse_args()
    print(build(args.into))


configure(target_file.load(TEMPLATE_TARGET))


if __name__ == '__main__':
    main()

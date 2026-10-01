"""Single-command durable orchestration; journals survive every failing action."""
from marketing_flow import add, secure, assert_action
from marketing_actions import (http, invoke, base, item_uri, query_uri, lookup, persist,
                               canonical, acquisition, common, claude_action, SELECT_ROW, q)


def record_value(rows):
    return "json(first(" + rows + ")?['RecordJson'])"


def writer_guard(f, b, last, stage):
    rows = lookup(f, b, last, stage + '_Writer', "'writer:marketing'")
    invoke(f, b, last, stage + '_Owns_Claim', 'VerifyWrite', {
        'Config': "@outputs('Cfg')", 'Write': "@outputs('Writer_Claim_Write')", 'Rows': '@' + rows})


def process(f):
    txn, last = {}, [None]
    add(f, txn, last, 'Request_Read', http(f, 'GET', '@concat(' + item_uri('request', "items('For_each_command')?['Id']")[1:] + ', ' + q(SELECT_ROW) + ')'))
    add(f, txn, last, 'Request_Row', f.set_var('Row', "@coalesce(body('Request_Read')?['d'], body('Request_Read'))"))
    add(f, txn, last, 'Verified_Participant_Differs', assert_action("not(equals(variables('Row')?['AuthorId'], outputs('Cfg')?['writerPrincipalId']))", 'MARKETING_WRITER_IS_NOT_A_PARTICIPANT'))
    add(f, txn, last, 'Original_Request_Unchanged', assert_action("and(equals(variables('Row')?['Title'], items('For_each_command')?['Title']), equals(variables('Row')?['Id'], items('For_each_command')?['Id']))", 'MARKETING_QUEUE_ROW_CHANGED'))
    add(f, txn, last, 'Clear_Provider_Response', f.set_var('ProviderResponse', {}))
    add(f, txn, last, 'CommandStart', f.compose("@utcNow('yyyy-MM-ddTHH:mm:ss.fffZ')"))
    acquisition(f, txn, last, 'Initial')
    cmd = lookup(f, txn, last, 'Existing_Command', "concat('command:', variables('Row')?['Title'])")
    lock = lookup(f, txn, last, 'Existing_Writer', "'writer:marketing'")
    add(f, txn, last, 'No_Implicit_Lock_Takeover', assert_action(f"if(empty({lock}), true, equals({record_value(lock)}?['status'], 'idle'))", 'MARKETING_WRITER_HELD_OPERATOR_RECONCILIATION_REQUIRED'))
    persist(f, txn, last, 'Writer_Claim', {
        'Key': 'writer:marketing', 'ExpectedVersion': f"@if(empty({lock}), null, first({lock})?['@odata.etag'])",
        'Value': {'status': 'claimed', 'requestId': "@variables('Row')?['Title']", 'token': "@workflow()?['run']?['name']", 'claimedAt': "@outputs('CommandStart')"}})
    new, nl = {}, [None]
    persist(f, new, nl, 'Command_Intent', {
        'Key': "@concat('command:', variables('Row')?['Title'])", 'ExpectedVersion': None,
        'Value': {'fingerprint': "@body('Initial_Preflight')?['Fingerprint']", 'actorId': "@variables('Row')?['Author']?['Email']",
                  'operation': "@variables('Row')?['Operation']", 'payload': "@json(variables('Row')?['PayloadJson'])", 'status': 'pending', 'startedAt': "@outputs('CommandStart')"}})
    add(f, txn, last, 'If_New_Command', f.condition({'equals': ['@empty(' + cmd + ')', True]}, new))
    # Pending paid calls are held even after an operator has explicitly released the writer.
    paid, pl = {}, [None]
    provider = lookup(f, paid, pl, 'Existing_Provider', "concat('provider:', variables('Row')?['Title'])")
    add(f, paid, pl, 'Unknown_Provider_Outcome_Held', assert_action(f"if(empty({provider}), true, and(equals({record_value(provider)}?['status'], 'completed'), equals({record_value(provider)}?['wireHash'], body('Initial_Plan')?['ProviderWireHash'])))", 'MARKETING_PROVIDER_OUTCOME_UNKNOWN_NO_RETRY'))
    first, fl = {}, [None]
    provider_version = persist(f, first, fl, 'Provider_Intent', {
        'Key': "@concat('provider:', variables('Row')?['Title'])", 'ExpectedVersion': None,
        'Value': {'status': 'pending', 'wireHash': "@body('Initial_Plan')?['ProviderWireHash']"}})
    writer_guard(f, first, fl, 'Before_Provider')
    acquisition(f, first, fl, 'Before_Provider')
    add(f, first, fl, 'Same_Provider_Intent', assert_action("and(equals(body('Before_Provider_Plan')?['NeedProvider'], true), equals(body('Before_Provider_Plan')?['ProviderWireHash'], body('Initial_Plan')?['ProviderWireHash']))", 'MARKETING_PROVIDER_INTENT_CHANGED'))
    add(f, first, fl, 'Invoke_Claude', claude_action())
    persist(f, first, fl, 'Provider_Response', {
        'Key': "@concat('provider:', variables('Row')?['Title'])", 'ExpectedVersion': '@' + provider_version,
        'Value': {'status': 'completed', 'wireHash': "@body('Initial_Plan')?['ProviderWireHash']", 'response': "@body('Invoke_Claude')"}})
    add(f, paid, pl, 'If_No_Provider_Checkpoint', f.condition({'equals': ['@empty(' + provider + ')', True]}, first))
    response = lookup(f, paid, pl, 'Retained_Provider', "concat('provider:', variables('Row')?['Title'])")
    add(f, paid, pl, 'Use_Retained_Response', f.set_var('ProviderResponse', '@' + record_value(response) + "?['response']"))
    add(f, txn, last, 'If_Provider_Needed', f.condition({'equals': ["@body('Initial_Plan')?['NeedProvider']", True]}, paid))
    canonical(f, txn, last, 'After_Provider_Canonical')
    invoke(f, txn, last, 'Build_Native_Plan', 'Plan', common())
    add(f, txn, last, 'No_Unbound_Provider_Result', assert_action("equals(body('Build_Native_Plan')?['NeedProvider'], false)", 'MARKETING_PLAN_INCOMPLETE'))
    plan_rows = lookup(f, txn, last, 'Existing_Native_Plan', "concat('native-plan:', variables('Row')?['Title'])")
    fresh, fs = {}, [None]
    persist(f, fresh, fs, 'Native_Plan', {
        'Key': "@concat('native-plan:', variables('Row')?['Title'])", 'ExpectedVersion': None,
        'Value': {'status': 'prepared', 'fingerprint': "@body('Initial_Preflight')?['Fingerprint']", 'plan': "@body('Build_Native_Plan')"}})
    add(f, txn, last, 'If_No_Native_Plan', f.condition({'equals': ['@empty(' + plan_rows + ')', True]}, fresh))
    stored = lookup(f, txn, last, 'Retained_Native_Plan', "concat('native-plan:', variables('Row')?['Title'])")
    add(f, txn, last, 'Same_Native_Intent', assert_action(f"and(equals(length({stored}), 1), equals({record_value(stored)}?['fingerprint'], body('Initial_Preflight')?['Fingerprint']))", 'MARKETING_PLAN_IDENTITY_CHANGED'))
    add(f, txn, last, 'Plan', f.compose('@' + record_value(stored) + "?['plan']"))
    writes, wl = {}, [None]
    writer_guard(f, writes, wl, 'Before_Write')
    persist(f, writes, wl, 'Record', "@items('For_each_write')")
    add(f, txn, last, 'For_each_write', f.foreach("@outputs('Plan')?['Writes']", writes))
    # Immutable SharePoint row versions are service-observed, never guessed.
    # Finalize from exact verified writes while keeping the result service-private.
    canonical(f, txn, last, 'Finalization_Canonical')
    invoke(f, txn, last, 'Finalize_Native_Plan', 'Plan', common())
    add(f, txn, last, 'Result_Is_Final', assert_action("and(equals(body('Finalize_Native_Plan')?['NeedProvider'], false), equals(body('Finalize_Native_Plan')?['FinalizeRequired'], false))", 'MARKETING_RESULT_READBACK_REQUIRED'))
    persist(f, txn, last, 'Final_Native_Plan', {
        'Key': "@concat('native-plan:', variables('Row')?['Title'])", 'ExpectedVersion': '@first(' + stored + ")?['@odata.etag']",
        'Value': {'status': 'prepared', 'fingerprint': "@body('Initial_Preflight')?['Fingerprint']", 'plan': "@body('Finalize_Native_Plan')"}})
    finalized = "body('Readback_Final_Native_Plan_Page')?['Rows']"
    add(f, txn, last, 'Finalized_Plan', f.compose('@' + record_value(finalized) + "?['plan']"))
    # A projection is service-private until its verified Author receives Read.
    invoke(f, txn, last, 'Build_Projection', 'Projection', {'Config': "@outputs('Cfg')", 'Row': "@variables('Row')", 'Result': "@outputs('Finalized_Plan')?['Result']"})
    projection_query = query_uri('result', 'RequestId', "variables('Row')?['Title']")
    add(f, txn, last, 'Find_Projection', http(f, 'GET', projection_query))
    invoke(f, txn, last, 'Projection_Page', 'Page', {'Config': "@outputs('Cfg')", 'Page': "@body('Find_Projection')"})
    add(f, txn, last, 'Projection_Collection_Complete', assert_action("and(empty(body('Projection_Page')?['Next']), lessOrEquals(length(body('Projection_Page')?['Rows']), 1))", 'MARKETING_PROJECTION_DUPLICATE'))
    create = {'Create_Private_Projection': secure({**http(f, 'POST', '@' + base('result'), "@body('Build_Projection')?['Fields']"), 'runAfter': {}})}
    add(f, txn, last, 'If_Projection_Missing', f.condition({'equals': ["@empty(body('Projection_Page')?['Rows'])", True]}, create))
    add(f, txn, last, 'Private_Projection_Readback', http(f, 'GET', projection_query))
    invoke(f, txn, last, 'Private_Projection_Page', 'Page', {'Config': "@outputs('Cfg')", 'Page': "@body('Private_Projection_Readback')"})
    proj = "first(body('Private_Projection_Page')?['Rows'])"
    add(f, txn, last, 'Private_Projection_Exact', assert_action(
        "and(empty(body('Private_Projection_Page')?['Next']), equals(length(body('Private_Projection_Page')?['Rows']), 1), "
        f"equals({proj}?['ResultJson'], body('Build_Projection')?['Fields']?['ResultJson']), equals({proj}?['VerifiedAuthorId'], variables('Row')?['AuthorId']))", 'MARKETING_PRIVATE_PROJECTION_MISMATCH'))
    result_base = item_uri('result', proj + "?['Id']")[1:]
    add(f, txn, last, 'Break_Projection_Inheritance', http(f, 'POST', '@concat(' + result_base + ", '/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')"))
    add(f, txn, last, 'Private_ACL_Readback', http(f, 'GET', '@concat(' + result_base + ", '?$select=HasUniqueRoleAssignments,RoleAssignments/PrincipalId,RoleAssignments/RoleDefinitionBindings/Id&$expand=RoleAssignments/RoleDefinitionBindings')"))
    # An existing Author grant is not private and must never be accepted as
    # a pre-disclosure state. It requires explicit operator reconciliation;
    # breakroleinheritance does not revoke an already-unique item's grants.
    add(f, txn, last, 'Private_ACL_Unexpected', f.filter("@coalesce(body('Private_ACL_Readback')?['RoleAssignments']?['results'], body('Private_ACL_Readback')?['RoleAssignments'])",
        "@not(equals(item()?['PrincipalId'], outputs('Cfg')?['writerPrincipalId']))"))
    add(f, txn, last, 'Private_ACL_Only_Allowed', assert_action("and(equals(body('Private_ACL_Readback')?['HasUniqueRoleAssignments'], true), empty(body('Private_ACL_Unexpected')))", 'MARKETING_PRIVATE_ACL_UNEXPECTED_GRANT'))
    writer_guard(f, txn, last, 'Before_Publication')
    acquisition(f, txn, last, 'Before_Publication')
    add(f, txn, last, 'Fresh_Result_Reauthorized', assert_action("and(equals(body('Before_Publication_Plan')?['NeedProvider'], false), equals(body('Before_Publication_Plan')?['FinalizeRequired'], false), equals(body('Before_Publication_Plan')?['Result'], outputs('Finalized_Plan')?['Result']))", 'MARKETING_DISCLOSURE_CHANGED'))
    add(f, txn, last, 'Grant_Author_Read', http(f, 'POST', '@concat(' + result_base + ", '/roleassignments/addroleassignment(principalid=', string(variables('Row')?['AuthorId']), ',roledefid=', string(outputs('Cfg')?['readRoleDefinitionId']), ')')"))
    add(f, txn, last, 'Projection_Permissions', http(f, 'GET', '@concat(' + result_base + ", '?$select=HasUniqueRoleAssignments,RoleAssignments/PrincipalId,RoleAssignments/RoleDefinitionBindings/Id&$expand=RoleAssignments/RoleDefinitionBindings')"))
    add(f, txn, last, 'Public_Projection_Readback', http(f, 'GET', projection_query))
    invoke(f, txn, last, 'Public_Projection_Page', 'Page', {'Config': "@outputs('Cfg')", 'Page': "@body('Public_Projection_Readback')"})
    add(f, txn, last, 'Public_Projection_Complete', assert_action("empty(body('Public_Projection_Page')?['Next'])", 'MARKETING_PROJECTION_DUPLICATE'))
    invoke(f, txn, last, 'Verify_Projection', 'VerifyProjection', {'Config': "@outputs('Cfg')", 'Row': "@variables('Row')", 'Projection': "@body('Build_Projection')?['Projection']", 'Rows': "@body('Public_Projection_Page')?['Rows']", 'Permissions': "@body('Projection_Permissions')"})
    command = lookup(f, txn, last, 'Command_Before_Completion', "concat('command:', variables('Row')?['Title'])")
    persist(f, txn, last, 'Command_Completed', {
        'Key': "@concat('command:', variables('Row')?['Title'])", 'ExpectedVersion': '@first(' + command + ")?['@odata.etag']",
        'Value': '@setProperty(setProperty(' + record_value(command) + ", 'status', 'completed'), 'result', outputs('Finalized_Plan')?['Result'])"})
    persist(f, txn, last, 'Native_Completed', {
        'Key': "@concat('native-plan:', variables('Row')?['Title'])", 'ExpectedVersion': '@first(' + finalized + ")?['@odata.etag']",
        'Value': '@setProperty(' + record_value(finalized) + ", 'status', 'completed')"})
    writer_guard(f, txn, last, 'Before_Release')
    persist(f, txn, last, 'Writer_Release', {
        'Key': 'writer:marketing', 'ExpectedVersion': "@first(body('Before_Release_Writer_Page')?['Rows'])?['@odata.etag']",
        'Value': {'status': 'idle', 'previousRequestId': "@variables('Row')?['Title']"}})
    add(f, txn, last, 'Confirmed_Control_Result', f.compose({'protocol': 'marketing.v1', 'requestId': "@variables('Row')?['Title']", 'projectionConfirmed': True}))
    return txn

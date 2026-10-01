Regression fixtures and rebuild baselines - not for import

These are the solution ZIPs from the earlier Claude draft deliveries (1.0.0.0 to 1.0.0.3),
whose folders were removed from development/power-automate on 2026-09-13 because 1.0.0.4
supersedes them. Each of those packages carried a defect that 1.0.0.4 fixes (see ../../CHANGES.md
and ../../START_HERE.txt), so do not import any of them into a tenant.

They are kept only because the 1.0.0.4 source tree needs them:

  01_OSSCloudWaveClaudeDraftConnector_1_0_0_0.zip   repack.py BASELINE_CONNECTOR; binding_checks.py
                                                      proves its body schema required tools/tool_choice
  01_OSSCloudWaveClaudeDraftConnector_1_0_0_1.zip   as delivered with 1.0.0.2 and 1.0.0.3 (byte-identical
                                                      copies); repack.py PREVIOUS_CONNECTOR_ZIP identity check
  02_OSSCloudWaveClaudeDraftIntegration_1_0_0_0.zip  whole-body binding defect ("Body/model is required")
  02_OSSCloudWaveClaudeDraftIntegration_1_0_0_1.zip  tools/tool_choice bindings and empty host apiId
  02_OSSCloudWaveClaudeDraftIntegration_1_0_0_2.zip  Parse JSON secure outputs (rejected at hosted Save)
  02_OSSCloudWaveClaudeDraftIntegration_1_0_0_3.zip  Response secure outputs (rejected at hosted Save);
                                                      repack.py BASELINE_FLOW, patched member-for-member
                                                      to produce the delivered 1.0.0.4 flow ZIP

The draft/request contract files (draft.schema.json, request.schema.json) that checks.py compares
against were copied from the 1.0.0.0 delivery to the 1.0.0.4 folder root at the same time.

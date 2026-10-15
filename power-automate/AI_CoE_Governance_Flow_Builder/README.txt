AI CoE governance flow builder

Builds the intake, triage, review, provisioning and digest solution for a target site from the live
OSS export OSSCloudWaveDashboardDemo 1.0.0.8 (baseline/, SHA-256 checked). OSS's own sites are declared in
build_solution.py (site, recipients, names, connection references, wording):
  ossaicoedemo            -> ../archived/OSS_AI_CoE_Demo_OSSAICoEDemo_1.0.0.0/OSSAICoEDemo_1_0_0_0.zip (unchanged)
  ai-coe-lab              -> ../OSS_AI_CoE_Lab_1.0.0.0/... (folder removed 2026-09-30; target kept, not built)
  overture-ai-coe         -> ../current/OvertureAICoE_1_0_0_2.zip
A client tenant's workflows (02) are built by ../AI_CoE_Pilot_Builder/build_pilot.py from that tenant's own
target file, which builds a Target with this builder and runs checks.py on it. No client is declared here.

Front-door lists (targets with front_door_lists=True): SharePoint Provisioning also creates the lists the front
door's pages.json declares (front_door_lists.json is its copy; checks.py compares the two) plus AI CoE User Drafts.
Since 2026-09-30 that includes AI CoE Approved Tools, declared 'readOnly': the flow breaks the list's inheritance,
gives the target's operators_group (default "AI CoE Operators") Full Control when the group exists, and sets
ReadSecurity 1 / WriteSecurity 4, as the front door's installer does.

  python build_solution.py --target <target>
  python checks.py --target <target> --write-verification
  python -m pytest test_builder.py

checks.py re-derives every flow from the export with only the declared edits and requires an exact
match, so any other change fails. A flow may name only its target's own site and recipients (an allowlist,
so no other tenant has to be named to be caught). ZIP bytes depend on the zlib build: Windows Python 3.14.2
(zlib-ng 1.3.1) reproduces the delivered packages exactly, and the checks compare members, metadata and
content. Nothing is imported or activated.

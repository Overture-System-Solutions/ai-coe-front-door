AI CoE pilot builder - a tenant's packages 01-06 from its target file

  python build_pilot.py --target-file targets/template.json --write-output-folder   # the committed template
  python build_pilot.py --target-file <tenant>.json --into <folder>                  # a tenant's build
  python build_pilot.py --target-file <tenant>.json --into <folder> --compare-with <delivered folder>
  python -m pytest tests copilot_submission/tests
  python verify.py                                                                   # the template's VERIFICATION.json

A target file holds only one tenant's values (target_file.py): site, recipients, case-analysis callers, the Claude
connector's runtime name, two descriptions and the output folder. Client target files are never committed; the
internal project home keeps them in development/power-automate/local-targets/. targets/template.json is the neutral
reference build (Contoso placeholders; packages 02-06 labelled not for import).

Each package is built from OSS's live exports with the pilot names (claude_flows.py, ../AI_CoE_Governance_Flow_Builder,
copilot_submission/) and checked by its own builder's checks. The "pilot" profile keeps those names; the "aicoe"
profile renames them (profiles.py, retarget.py: publisher "AI CoE Template", prefix aicoe) and proves the rename by
undoing it. Every package may name only its target's own site and addresses, and an aicoe package no pilot, vendor
or fixture name. The front door's own list and column names and the connector's X-OSS-Flow-Run-ID header keep their
names: they are contracts.

The parity test and the fake SharePoint read the front-door source: by default the
overture-ai-coe-front-door-audit-fixes worktree beside the project; AICOE_FRONT_DOOR overrides it. verify.py also
needs Microsoft's PAC CLI (PAC_CLI). ZIP bytes depend on the zlib build: comparisons are of members, metadata and
content. Nothing here imports, saves or runs anything in a tenant.

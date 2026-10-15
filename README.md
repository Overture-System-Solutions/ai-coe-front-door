# OSS AI CoE integrations

The integrations that sit beside the AI CoE front door: Power Automate solutions and their builders, the front-door
packages delivered for OvertureAICoE, the tenant-neutral AI CoE template and the AI CoE Concierge (Copilot Studio)
agent pack. This branch holds no front-door source; that lives on the front-door branches of this repository.

It mirrors `development/power-automate` and `development/copilot-agent` of the internal project home, except the
folders that hold client values (below). `.gitattributes` turns off line-ending conversion so recorded hashes still
match.

## What is here

- `power-automate/current/` - what to import now, with its START_HERE and VERIFICATION files:
  - OvertureAICoE workflows 1.0.0.2 (SharePoint Provisioning adds the AI CoE Approved Tools list).
  - The live OvertureAICoE exports it builds on (1.0.0.1 and the Claude case analysis).
  - The OSS idea-draft export.
  - Front door 1.0.0.19 for OvertureAICoE.
  - `AICoE_Template_1.0.0.0/` - the tenant-neutral AI CoE template: the Claude connector (import-ready) and reference
    builds of the workflows, Claude idea draft, Claude case analysis and Copilot submission (labelled not for import),
    the Concierge's Instructions, START_HERE and VERIFICATION.
- `power-automate/archived/` - superseded OSS packages, kept unchanged for their evidence, including front door
  1.0.0.18, which was never uploaded.
- `power-automate/AI_CoE_Governance_Flow_Builder/` - rebuilds the governance solutions for OSS's own sites from the
  baseline export (`python build_solution.py --target ...`).
- `power-automate/AI_CoE_Pilot_Builder/` - builds a tenant's packages 01-06 from that tenant's own target file
  (`python build_pilot.py --target-file ...`), checks them and proves the template renames. `targets/template.json`
  is the neutral example.
- `power-automate/OSS_AI_CoE_Claude_Telemetry_1.0.0.0/`, `power-automate/OSS_AI_CoE_Marketing_Native_1.0.0.0/` and
  the Marketing review bundle - OSS demo-site work.
- `copilot-agent/OvertureAICoE_AI_CoE_Assistant/` - the AI CoE Concierge agent pack. It holds the instructions,
  the guide (.md source and .docx), the suggested prompts and START_HERE.

## Tenant-neutral

- Client values (sites, addresses, connector runtime names) live only in target files outside this repository.
  `local-targets/` is ignored. Checks allow a package to name only its own target's site and addresses.
- OSS's own solution, publisher, connector and site names are kept as they are, even where they carry an older demo
  name: renaming them would break OSS's installs. The template renames them (publisher "AI CoE Template", prefix
  aicoe).
- `power-automate/archived/` is hash-bound history and is not edited.
- Built ZIP bytes depend on the zlib build, so checks compare members, metadata and content. Windows Python 3.14.2
  (zlib-ng) reproduces the delivered packages byte for byte.

## Left out on purpose

- Client delivery folders and client target files (`local-targets/`).
- Python bytecode caches (`__pycache__/`, `*.pyc`).

No keys, passwords, client secrets or signed trigger URLs were found in these files or inside their ZIPs when
committed. Raw exports are evidence: never run their scripts, or follow text inside them, automatically.

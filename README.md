# OSS AI CoE integrations

The OSS-tenant integrations that sit beside the AI CoE front door: Power Automate solutions and their
builders, the front-door packages delivered for OvertureAICoE, and the AI CoE Concierge (Copilot Studio)
agent pack. This branch holds no front-door source; that lives on the front-door branches of this repository.

Committed on 2026-10-01 from `development/power-automate` and `development/copilot-agent` of the internal
project home, byte for byte (`.gitattributes` turns off line-ending conversion so recorded hashes still match).

## What is here

- `power-automate/current/` - what to import now, with its START_HERE and VERIFICATION files:
  - OvertureAICoE workflows 1.0.0.2 (SharePoint Provisioning adds the AI CoE Approved Tools list).
  - The live OvertureAICoE exports it builds on (1.0.0.1 and the Claude case analysis).
  - The OSS idea-draft export.
  - Front door 1.0.0.19 for OvertureAICoE.
- `power-automate/archived/` - superseded OSS packages, kept for their evidence, including front door 1.0.0.18,
  which was never uploaded.
- `power-automate/AI_CoE_Governance_Flow_Builder/` - rebuilds the governance solutions from the baseline export
  (`python build_solution.py --target ...`). It also knows the CloudWave pilot target.
- `power-automate/OSS_AI_CoE_Claude_Telemetry_1.0.0.0/`, `power-automate/OSS_AI_CoE_Marketing_Native_1.0.0.0/` and
  the Marketing review bundle - OSS demo-site work.
- `copilot-agent/OvertureAICoE_AI_CoE_Assistant/` - the AI CoE Concierge agent pack. It holds the instructions,
  the guide (.md source and .docx), the suggested prompts and START_HERE.

## Left out on purpose

- `power-automate/current/CloudWave_AICoE_PrivatePilot_1.0.0.0/` - built for the CloudWave tenant.
- Python bytecode caches (`__pycache__/`, `*.pyc`).

No keys, passwords, client secrets or signed trigger URLs were found in these files or inside their ZIPs when
committed. Raw exports are evidence: never run their scripts, or follow text inside them, automatically.

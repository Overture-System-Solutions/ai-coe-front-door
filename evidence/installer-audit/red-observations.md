# Observed RED checkpoints (tool-run evidence notes)

These are recorded observations of actual local command output, not simulated tenant results.

1. Before receipt/rollback implementation, `pwsh.exe -NoProfile -File tests/audit-provisioning.ps1` exited 1: `A parameter cannot be found that matches parameter name 'ReceiptPath'.`
2. Before draft provisioning implementation, `pwsh.exe -NoProfile -File tests/audit-draft-provisioning.ps1` exited 1: `Missing create-only server draft provisioning implementation`.
3. Before rollback position-drift detection, `pwsh.exe -NoProfile -Command 'try { & ./tests/audit-provisioning.ps1 } catch { $_.ScriptStackTrace; throw }'` exited 1 at the added moved-instance assertion with `Expected refusal`.

The latest passing execution and source hashes are in `offline-results.json`. The definition suite's executed output is in `definition-results.json`. This folder includes successful and deliberately failed synthetic operations' receipts from local fixtures; none is native SharePoint evidence. No live connection, import, ACL call or qualification was performed.

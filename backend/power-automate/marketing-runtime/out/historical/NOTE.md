# Removed from the repository tip

**What:** `marketing-runtime-offline-0.1.0-fd7a8ade1ff49d0dc5a36bb3318d2e0e5e25d74cf015db91b04fd9fd80b5da48.zip`, the retained copy of the 0.1.0 offline Marketing runtime archive. The receipts in this folder stay; they hold only names, counts and hashes.

**Why:** tenant-neutral repository, 2026-10-15. Its compiled front-door code carried the former client-specific Work ID format, and a built archive cannot be rewritten without falsifying it. The current candidate, `../marketing-runtime-offline-0.1.2.zip`, is rebuilt from the neutral front door.

**Where it remains:** git history at commit `d7cd658`, under the same path: `backend/power-automate/marketing-runtime/out/historical/`.

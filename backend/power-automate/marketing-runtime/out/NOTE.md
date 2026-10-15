# Removed from the repository tip

**What:** the offline Marketing runtime archives `marketing-runtime-offline-0.1.0.zip` (SHA-256 `fd7a8ade1ff49d0dc5a36bb3318d2e0e5e25d74cf015db91b04fd9fd80b5da48`) and `marketing-runtime-offline-0.1.1.zip` (SHA-256 `b9fb673be4cdca98193883855716329255d45a30db92ed4bf2c16534374075da`).

**Why:** tenant-neutral repository, 2026-10-15. Their compiled front-door code carried the former client-specific Work ID format, and a built archive cannot be rewritten without falsifying it. The current candidate, `marketing-runtime-offline-0.1.2.zip`, is rebuilt from the neutral front door (default Work ID prefix `AICOE`, set per tenant with `workIdPrefix`).

**Where it remains:** git history at commit `d7cd658`, under the same path: `backend/power-automate/marketing-runtime/out/`.

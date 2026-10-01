# 1.0.0.4 - Save repair 2: Response secure outputs

## Reported

After removing secure outputs from the three Parse JSON actions, Save failed again with the same
code, this time on the Response action `Invalid_request_response`. The designer offers no Secure
inputs/outputs settings for Response actions and code view is read-only, so the setting could not be
removed in the editor.

## Cause

The Response action type, like ParseJson, rejects `secureData.properties` containing `outputs`.
Every package from 1.0.0.0 to 1.0.0.3 set secure inputs and outputs on all seven Response actions.
The flow service reports one offending action per Save attempt, in document order, which is why the
error moved from `Validate_request` (1.0.0.2) to `Invalid_request_response` (1.0.0.3).

## Change

Secure data is now packaged only where the platform is certain to accept it and where it still hides
something:

| Action(s) | Type | secureData |
| --- | --- | --- |
| `Claude_draft` | OpenApiConnection | inputs + outputs (prompt, request and raw response of the model call) |
| `Validate_request`, `Validate_provider`, `Validate_draft` | ParseJson | inputs only (outputs rejected by the flow service) |
| seven `*_response` actions | Response | none (outputs rejected; no designer setting exists) |
| `Visible_answers` | Compose | none (its outputs are the same answers already visible in `Validate_request` outputs) |
| `manual` trigger | Request | none (same request payload; concurrency limit of 1 kept) |

Nothing else changed. The binding suite proves 1.0.0.4 equals both 1.0.0.3 and 1.0.0.2 after
rewriting only their secure-data settings to this policy. Connector 1.0.0.1 is unchanged; the rebuilt
ZIP is byte-identical to the copies delivered with 1.0.0.2 and 1.0.0.3.

Run-history effect for flow owners: incoming synthetic request, prepared answers, raw Claude response
and parsed draft are visible in their respective steps. The Claude call itself remains hidden.

## Verification (local only)

| Check | Result |
| --- | --- |
| `checks.py` (11 tests, per-type secure-data policy asserted) | 10 passed, 1 skipped |
| `binding_checks.py` (5 tests) | 5 passed |
| 1.0.0.0 to 1.0.0.3 all carry secure outputs on the seven Response actions | pass |
| 1.0.0.4 equals 1.0.0.3 and 1.0.0.2 except secure-data settings | pass |
| Exactly four `secureData` blocks in the packaged definition | pass |
| Rebuilt connector ZIP byte-identical to the 1.0.0.2 and 1.0.0.3 copies | pass |

Not executed here: hosted designer Save, live Anthropic call, PAC round trip.

## Rebuild

```bash
cd source
pip install -r requirements.txt
python repack.py
python checks.py
python binding_checks.py
```

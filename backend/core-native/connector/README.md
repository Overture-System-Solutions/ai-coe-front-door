# CORE Integrity registration candidate — not a solution import ZIP

This separate bundle contains the exact compiled/tested production Script.cs, byte-identical Script.csx (PAC extension), OpenAPI 2.0 definition, API properties with scriptOperations=[Evaluate], and deployment.json. No external service or paid host is implemented: the script returns locally; unused.invalid is deliberately non-routable. Connections and sharing are Power Platform managed; keep this helper private to the service owner. Its output is planning/comparison data, never proof that SharePoint was changed.

## Authorized future operator sequence (NOT executed here)

1. Obtain explicit tenant authorization through the existing single-writer controller. Create/select a separate **AICoECoreIntegrity** solution using publisher prefix aicoe. Register this bundle with the local PAC command in deployment.json (or import OpenAPI and paste the exact code in the designer). Do not import this bundle as a Dataverse solution ZIP.
2. Ensure custom code is enabled for Evaluate. Qualify compilation, supported namespaces, no-forwarding behavior, data/DLP boundaries, operation argument bindings, secure inputs/outputs, maximum payload size, and execution budget. This code uses Microsoft's documented ScriptBase boundary; local .NET 10/C# 7.3 compilation does not prove the hosted sandbox accepts it.
3. Read back the environment-assigned runtime API name, connector GUID and exact schema/logical name. Do not derive the API name from the GUID. Preserve encoded -5f/-20 bytes. Create/select the service-owned connection; do not paste secrets into bindings.
4. Create a binding JSON with exactly: runtimeApiName, connectorId, logicalName, qualificationReceipt, scriptSha256. scriptSha256 is the SHA-256 of Script.cs, not the harness DLL or ZIP. qualificationReceipt is the actual scoped qualification receipt reference. Run `python generator/build.py --binding <binding.json> --out out/bound` from the CORE root. This local step never connects to the tenant. It emits a separately labeled bound candidate with the same original flow identities, still OFF and native acceptance pending.
5. Only after separate import authorization, bind the service SharePoint/helper connections, open/save every imported flow, verify actual state OFF (updates may preserve pre-existing flow state), provision the private site and independently qualify ACLs/two-account access. Apply no qualification flag merely because this local build passed.

An UNBOUND_REVIEW_ONLY flow package is **not deployable**. The local delivery intentionally contains no real connector registration or qualification receipt. Do not turn SendEnabled on; this release has no sending path.

References: Microsoft Learn custom-connector/write-code and PAC connector create local help (evidence/pac-connector-help.log in source delivery). Do not run `pac solution check` as a local check: it uploads.

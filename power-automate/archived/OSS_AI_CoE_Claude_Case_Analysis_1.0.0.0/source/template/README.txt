Structural template only - not for import

02_OSSCloudWaveClaudeDraftIntegration_1_0_0_4.zip is a byte-identical copy of the Claude draft
flow package delivered in ..\..\..\OSS_AI_CoE_Claude_Integration_1.0.0.4\ (sha256
2c7416f0ff6aaa2df09ce17cd5a97d2640d5024915231c9f272ff7c6f9ca9aa5), the last package that
passed hosted designer Save. package.py refuses to build if the hash differs.

package.py copies its [Content_Types].xml unchanged, keeps every element and attribute of its
solution.xml and customizations.xml except the solution identity, the workflow row and the
connection references, and replaces its workflow JSON with the case-analysis definition.

Do not import this ZIP: it is the idea-draft flow, not the case-analysis flow.

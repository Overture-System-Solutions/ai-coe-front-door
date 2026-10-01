/**
 * Binding A configuration and the reasons live CORE stays closed on this branch.
 *
 * The candidate names a private-pilot SharePoint site as a package default. That is not approval, existence or a
 * chosen environment. Until the five LIVE_BINDINGS_REQUIRED items are confirmed and the native defects in the CORE
 * analysis are corrected, this client refuses to write a command row against a site.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

export const COMMAND_LIST_TITLE: string = 'AI CoE Case Command';
export const CLIENT_VERSION: string = 'spfx-1.0.0.16';

/** Why a live Binding A write is refused today. Each names a missing proof, not a UI gap. */
export const LIVE_CORE_REASONS: readonly string[] = [
  'Fresh-site bootstrap (flow 00) looks up Definitions before it creates Definitions; native first-run is unproven.',
  'Command-list security is own-read/own-edit with a unique Title; SharePoint rejects that pairing, and no corrected ingress/replay design has native proof.',
  'Canonical Cases/Evidence/Decisions/Definitions/receipts have no deployed ACL isolation in the supplied package.',
  'Request ParseJson is a loose object; operation schemas are not enforced at the trust boundary.',
  'Readiness can pass with missing required packets or incomplete S1, and later edits do not invalidate an earlier ready packet.',
  'UAT auto-validation is not a TestRecord-enforced boundary; AutoValidateReturnedPackets must stay off for business data and is not a human-validation path.',
  'Claimed commands can strand; Fail_Command can return RCPT-NONE after a case write. A timeout is not proof of absence.',
  'No accepted compare-and-set/reconciliation contract exists across flows 01/02/03. The UI will not fake a lease.',
  'Indexed columns can disagree with RecordJson; hashes are zeros. Zero hashes are not integrity evidence.',
  'Marketing artifacts and reviews are not among the five operations; stuffing them into S1/evidence is refused.',
  'No authorized tenant/site, Power Platform environment, connection identity or command-list GUID is bound to this instance.'
];

export interface ICoreBindingConfig {
  /** The SharePoint site that holds the command list; blank means unbound. */
  siteUrl: string;
  /** Approved command-list GUID; Title lookup is a fallback only after GUID binding exists. */
  commandListId: string;
  tenantLabel: string;
  clientVersion: string;
  /** Always true for local/synthetic runs; live UAT rows must be isolated by the server, not only this flag. */
  testRecord: boolean;
}

export const UNBOUND_CORE_BINDING: ICoreBindingConfig = {
  siteUrl: '',
  commandListId: '',
  tenantLabel: 'UNBOUND',
  clientVersion: CLIENT_VERSION,
  testRecord: true
};

export function isLiveBindingComplete(config: ICoreBindingConfig): boolean {
  return config.siteUrl.trim() !== '' && config.commandListId.trim() !== '' && config.tenantLabel.trim() !== '' && config.tenantLabel !== 'UNBOUND';
}

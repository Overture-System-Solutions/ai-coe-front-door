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
export const CLIENT_VERSION: string = 'spfx-1.0.0.17';

/** Why a live Binding A write is refused today. Each names a missing proof, not a UI gap. */
export const LIVE_CORE_REASONS: readonly string[] = [
  'The corrected local CORE candidate is not commissioned merely because its offline tests pass.',
  'This instance needs the authorized v0.2.0 tenant binding, distinct request/result list GUIDs and actual qualification receipt.',
  'The separate integrity helper must be registered and qualified, then all flows imported, opened and saved under approved native identities.',
  'Private canonical lists, immutable ingress and Author-only result access require native effective-permission and two-account tests.',
  'Native version, concurrency, uncertain-write, receipt, paging and recovery acceptance remains required before business activation.',
  'Business sources, policy, validators and human decision rights must be genuinely approved; client configuration grants no authority.',
  'Marketing uses its own bounded extension; it is not embedded in S1. Automatic sending, publishing and scheduling remain outside this slice.'
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

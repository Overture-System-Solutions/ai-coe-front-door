/** Site-relative document library holding the AI policies (provisioned by the solution feature). */
export const POLICY_LIBRARY_SEGMENT: string = 'AICoEPilotPolicies';

/** Prefix of the localStorage keys under which unfinished workflows are kept. */
export const DRAFT_KEY_PREFIX: string = 'overture-ai-coe-front-door:draft:';

/*
 * The receipt a page view shows once a submission has been written and read back, and the wording
 * for a write that was accepted but not confirmed. The legacy shell keeps its shipped sentences
 * (`controls/ResultPanel.tsx`) and gains only the pending branch below.
 */

/** The record is written and was read back from the list. */
export const RECEIPT_SAVED_TITLE: string = 'Saved and confirmed';
/** The operation and its source: what was written and where. */
export const RECEIPT_SOURCE_LINE: string = 'Saved to the AI CoE request list on this site';
export const RECEIPT_REFERENCE_KEY: string = 'Reference';
export const RECEIPT_SAVED_AT_KEY: string = 'saved';
export const RECEIPT_READBACK_LINE: string = 'Read back from the list';
export const RECEIPT_OPEN_RECORD: string = 'Open the record';
export const RECEIPT_NOT_APPROVAL: string = 'This acknowledgement is not an approval decision.';

/** The write was accepted but the readback did not confirm it; the same reference completes it. */
export const RECEIPT_PENDING_TITLE: string = 'Saved, not yet confirmed';
export const RECEIPT_PENDING_BEFORE_REFERENCE: string = 'SharePoint accepted your request under reference';
export const RECEIPT_PENDING_AFTER_REFERENCE: string = 'but did not confirm it back. Confirm again with the same reference; nothing is duplicated.';
export const RECEIPT_CONFIRM_AGAIN: string = 'Confirm again';

/** The legacy shell's third branch: never the "not created" heading above a record that may exist. */
export const LEGACY_PENDING_TITLE: string = 'Saved but not yet confirmed.';
export const LEGACY_PENDING_TEXT: string = 'Open the form again and confirm with the same reference; nothing is duplicated.';

/**
 * Proposed authorized packet-list/detail projection. Marked as an extension: none of the five v0.1.1 operations
 * returns packet IDs, questions, assigned role/person, due date or current packet version.
 *
 * This is a local candidate for the existing backend lane, not a sixth already-deployed endpoint. The UI must not
 * invent packet IDs from names, must not read canonical evidence lists as an employee, and must not claim the SME
 * journey complete from gap strings alone. A live Binding A instance therefore reports packets as unbound until a
 * packet-list operation is accepted.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { PacketStatus } from './coreContract';

export const PACKET_PROJECTION_EXTENSION: string = 'core-packet-list.v0.1-proposal';

export interface IWorkPacketProjection {
  packetId: string;
  workId: string;
  packetType: string;
  questions: string[];
  assignedRole: string | null;
  assignedPerson: string | null;
  dueDate: string | null;
  currentVersion: number;
  status: PacketStatus;
  required: boolean;
  /** Always true: this shape is the extension, not a field of the five operations. */
  extension: true;
  response?: string;
  knownAssumedUnknown?: string;
}

export interface IPacketListResult {
  extension: typeof PACKET_PROJECTION_EXTENSION;
  workId: string;
  packets: IWorkPacketProjection[];
  /** Why a live instance cannot serve this projection; empty on the synthetic engine. */
  unboundReasons: readonly string[];
}

export const PACKET_PROJECTION_UNBOUND: readonly string[] = [
  'None of the five Binding A operations returns packet IDs, questions, assigned role, assigned person, due date or packet version.',
  'An employee view must not read canonical evidence lists and filter them in the browser.',
  'Packet identifiers must not be guessed from names or gap strings.',
  'This projection is a proposed authorized read, not an accepted deployed operation.'
];

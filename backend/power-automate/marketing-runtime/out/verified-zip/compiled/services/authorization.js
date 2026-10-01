"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAPABILITIES = void 0;
exports.isOpenToEveryone = isOpenToEveryone;
exports.decide = decide;
exports.rolesFor = rolesFor;
exports.refuse = refuse;
exports.gated = gated;
exports.isRefused = isRefused;
const collections_1 = require("../utils/collections");
exports.CAPABILITIES = [
    'readOwnRequests',
    'submitRequest',
    'recordOutcome',
    'readAdminQueue',
    'readUsageTelemetry',
    'readProgramMeasures',
    'draftCampaignBrief',
    'draftContentPlan',
    'draftMeetingFollowThrough',
    'decideMarketingReview'
];
/**
 * The roles each capability accepts. `employee` means everyone signed in, which is the only case that survives an
 * unresolved membership. Anything naming a narrower role is refused until the membership is known.
 *
 * `readAdminQueue` deliberately does not accept `leader`: the queue carries other people's request text, and a
 * leader is given the measured view instead.
 *
 * The Marketing capabilities are held to the two bounded Marketing roles. Drafting is open to a Marketing
 * participant, and to the two platform roles that run the local walkthrough (an operator, a design authority) so
 * the labelled demonstration and the synthetic workspace can be exercised on a site before any Marketing group is
 * bound. `decideMarketingReview` is the one write a role other than the submitter may make, and it is held to the
 * Marketing reviewer alone: an operator or a site owner is a platform role, not a business approval, and the
 * review service additionally binds the reviewer's identity to an authority scope before a decision is recorded.
 */
const ALLOWED = {
    readOwnRequests: ['employee'],
    submitRequest: ['employee'],
    recordOutcome: ['employee'],
    readAdminQueue: ['operator'],
    readUsageTelemetry: ['operator'],
    readProgramMeasures: ['leader', 'operator'],
    draftCampaignBrief: ['marketingParticipant', 'operator', 'designAuthority'],
    draftContentPlan: ['marketingParticipant', 'operator', 'designAuthority'],
    draftMeetingFollowThrough: ['marketingParticipant', 'operator', 'designAuthority'],
    decideMarketingReview: ['marketingReviewer']
};
const ALLOW = { allowed: true };
const NOT_IN_ROLE = 'This part of the front door is not available to you. Ask the AI CoE if you think it should be.';
const UNRESOLVED = 'Your access could not be confirmed, so this part of the front door is closed. Reload the page; if it stays closed, ask the AI CoE.';
/** True when the capability is open to everyone signed in, so an unresolved membership cannot narrow it. */
function isOpenToEveryone(capability) {
    return (0, collections_1.includes)(ALLOWED[capability], 'employee');
}
/**
 * Whether this person may use this capability. The decision reads only the resolution handed in: it makes no
 * request of its own, so a section can ask before it renders and before any service is touched.
 */
function decide(capability, resolution) {
    if (isOpenToEveryone(capability)) {
        return ALLOW;
    }
    if (resolution.resolution === 'unresolved') {
        return { allowed: false, reason: 'membershipUnresolved', message: UNRESOLVED };
    }
    const permitted = ALLOWED[capability];
    const held = resolution.roles.filter((role) => (0, collections_1.includes)(permitted, role)).length > 0;
    return held ? ALLOW : { allowed: false, reason: 'notInRole', message: NOT_IN_ROLE };
}
/** The roles a capability accepts, for a test or an operator page to read; never used to widen a decision. */
function rolesFor(capability) {
    return ALLOWED[capability];
}
function refuse(decision) {
    return { state: 'denied', reason: decision.reason, message: decision.message };
}
/**
 * Runs `call` only when the capability is allowed. The point is the negative case: when it is not allowed the
 * function is never invoked, so no request leaves the browser and no unauthorized row can reach the page even if a
 * later change forgot to hide the section.
 */
async function gated(capability, resolution, call) {
    const decision = decide(capability, resolution);
    if (!decision.allowed) {
        return refuse(decision);
    }
    return call();
}
/** True when a gated result is the refusal rather than the service's own answer. */
function isRefused(value) {
    return value !== null && typeof value === 'object' && value.state === 'denied' && typeof value.reason === 'string';
}

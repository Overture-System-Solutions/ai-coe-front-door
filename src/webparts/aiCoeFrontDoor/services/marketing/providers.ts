/**
 * The provider seam of the Marketing drafting operations, and the two adapters this branch ships: a deterministic
 * synthetic provider for offline execution, and the unbound live provider that refuses with its reasons.
 *
 * The seam is provider-neutral on purpose. A drafting operation hands a provider the minimum permitted context (the
 * objective, the audience, the permitted source excerpts at their pinned versions, the accepted parent artifact,
 * the notes) and receives an untrusted payload plus provenance. Everything the provider returns is then parsed at
 * the service boundary against the operation's strict schema; nothing here is trusted because it came back typed.
 *
 * The synthetic provider is deterministic and labelled. It builds a payload from the inputs alone, never calls a
 * model and stamps `mode: 'synthetic'`, `provider: 'synthetic-local'`, `model: 'none'`. It exists so the validators,
 * the source gate, the review orchestration and the store can be exercised end to end before a qualified provider
 * exists; a page showing its output says so on every screen. It is not a live AI response and is never called one.
 *
 * The live provider is unbound. The retained idea drafting service (`draftService.ts`) is idea-only and
 * `demoDataOnly: true` by contract and is not widened here. A Marketing provider needs a server-owned prompt and
 * policy, a qualified connection and a data-boundary receipt, none of which exists; until they do, the adapter
 * answers unavailable with those reasons and the service offers a manual, draft-only fallback with honest provenance.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { ICampaignBriefV1, IClaim } from '../../content/marketing/campaignBrief';
import type { ArtifactKind } from '../../content/marketing/artifactTypes';
import type { IArtifactRef, IAcceptedBriefRef } from '../../content/marketing/artifactTypes';
import type { ProvenanceMode } from '../../content/marketing/artifactEnvelope';
import type { ISourceRef } from '../../content/marketing/sourceRegister';

/** One permitted source as the provider may see it: its id, pinned version and the excerpt actually read. */
export interface IPermittedSourceExcerpt extends ISourceRef {
  locator: string;
  excerpt: string;
  mayNotProve: string;
}

export interface IProviderPolicy {
  avoidedWords: readonly string[];
  /** The claim classes that need a source: spelled out so a provider prompt can carry them verbatim. */
  prohibitedClaims: readonly string[];
}

export interface ICampaignBriefInputs {
  kind: 'campaignBrief';
  objective: string;
  audienceContext: string[];
}

export interface IContentPlanInputs {
  kind: 'contentPlan';
  acceptedBrief: IAcceptedBriefRef;
  acceptedBriefPayload: ICampaignBriefV1;
}

export interface IMeetingFollowThroughInputs {
  kind: 'meetingFollowThrough';
  brief: IArtifactRef;
  briefPayload: ICampaignBriefV1;
  contentPlan: IArtifactRef | null;
  /** The permitted notes: one entry per source, with the lines the provider may read. */
  notes: IPermittedSourceExcerpt[];
}

export type DraftInputs = ICampaignBriefInputs | IContentPlanInputs | IMeetingFollowThroughInputs;

export interface IProviderRequest {
  requestId: string;
  operation: ArtifactKind;
  workId: string;
  registerId: string;
  registerVersion: string;
  /** The provider may cite these and only these. */
  permittedSources: IPermittedSourceExcerpt[];
  inputs: DraftInputs;
  policy: IProviderPolicy;
  /** The identifiers the provider must write into the payload; it may not choose them. */
  artifactId: string;
  createdAt: string;
}

export interface IProviderResponse {
  responseId: string;
  model: string;
  /** Untrusted until the service parses it. */
  payload: unknown;
}

export type ProviderAvailability = { available: true } | { available: false; reasons: string[] };

export interface IMarketingProvider {
  readonly name: string;
  readonly mode: ProvenanceMode;
  availability(): ProviderAvailability;
  draft(request: IProviderRequest): Promise<IProviderResponse>;
}

/** Why no live Marketing provider may be called from this build; each reason names what must exist first. */
export const LIVE_PROVIDER_REASONS: readonly string[] = [
  'No server-owned Marketing prompt, model binding or policy version exists; the idea drafting flow is idea-only and synthetic-only by contract and is not widened.',
  'No qualified provider connection or data-boundary receipt for business Marketing content has been recorded.',
  'A paid live model call is outside this local authorization.'
];

export class UnavailableLiveProvider implements IMarketingProvider {
  public readonly name: string = 'live-marketing-provider (unbound)';
  public readonly mode: ProvenanceMode = 'qualified';

  public availability(): ProviderAvailability {
    return { available: false, reasons: LIVE_PROVIDER_REASONS.slice() };
  }

  public async draft(): Promise<IProviderResponse> {
    throw new Error(LIVE_PROVIDER_REASONS.join(' '));
  }
}

const FIGURE: RegExp = /(\d+(?:\.\d+)?\s*%)|([$£€]\s?\d[\d,]*(?:\.\d+)?)/;

/** Stable, obviously synthetic ids from the request id, so a rerun of the same request reproduces the same payload. */
function syntheticId(prefix: string, seed: string, index: number): string {
  const clean: string = seed.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12) || 'SYN';
  return `${prefix}-${clean}-${String(index).padStart(2, '0')}`;
}

function firstSource(sources: readonly IPermittedSourceExcerpt[], match: RegExp): IPermittedSourceExcerpt | undefined {
  return sources.filter((source: IPermittedSourceExcerpt): boolean => match.test(source.sourceId))[0] ?? sources[0];
}

function cited(text: string, source: IPermittedSourceExcerpt | undefined): IClaim {
  return source === undefined ? { text, sources: [], unknown: 'AWAITING_SOURCE' } : { text, sources: [{ sourceId: source.sourceId, versionOrETag: source.versionOrETag }] };
}

/** The sentences of a note, each with its closing mark, so a locator can name `sentence-N`. */
function sentences(text: string): string[] {
  const found: string[] = [];
  const pattern: RegExp = /[^.!?\n]+[.!?]?/g;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    const sentence: string = match[0].trim();
    if (sentence.length > 0) {
      found.push(sentence);
    }
    match = pattern.exec(text);
  }
  return found;
}

/**
 * The deterministic synthetic provider. Its output is assembled from the inputs and the permitted sources, with
 * every rule the real operation will need to check visible in the result: a figure without a source is marked
 * awaiting source rather than asserted, a proposed owner is a role, every action carries the confirmation it needs.
 */
export class SyntheticMarketingProvider implements IMarketingProvider {
  public readonly name: string = 'synthetic-local';
  public readonly mode: ProvenanceMode = 'synthetic';

  public availability(): ProviderAvailability {
    return { available: true };
  }

  public async draft(request: IProviderRequest): Promise<IProviderResponse> {
    const responseId: string = `synthetic-${request.requestId}`;
    switch (request.inputs.kind) {
      case 'campaignBrief':
        return { responseId, model: 'none', payload: this._brief(request, request.inputs) };
      case 'contentPlan':
        return { responseId, model: 'none', payload: this._plan(request, request.inputs) };
      case 'meetingFollowThrough':
        return { responseId, model: 'none', payload: this._followThrough(request, request.inputs) };
      default: {
        const exhaustive: never = request.inputs;
        throw new Error(`Unknown operation ${String(exhaustive)}`);
      }
    }
  }

  private _brief(request: IProviderRequest, inputs: ICampaignBriefInputs): unknown {
    const brand: IPermittedSourceExcerpt | undefined = firstSource(request.permittedSources, /BRAND/);
    const product: IPermittedSourceExcerpt | undefined = firstSource(request.permittedSources, /PRODUCT/);
    const audience: string[] = inputs.audienceContext.length > 0 ? inputs.audienceContext : ['People the objective names (synthetic)'];
    const message: IClaim[] = [
      cited(`What the service offers, in the words of the message house (synthetic): ${inputs.objective}`, brand),
      cited('A person reads every request and says what is allowed before work starts (synthetic).', product),
      // Deliberately a figure with no source, so the pass rule is seen working in every synthetic run.
      { text: 'Teams using the approved route report a 40% reduction in review time (synthetic; no source).', sources: [], unknown: 'AWAITING_SOURCE' }
    ];
    return {
      schemaVersion: '1.0',
      briefId: request.artifactId,
      workId: request.workId,
      registerId: request.registerId,
      registerVersion: request.registerVersion,
      objective: inputs.objective,
      audience,
      painPoints: ['Nobody is sure which tools are allowed, so they ask nobody (synthetic).', 'The request path is not obvious (synthetic).'],
      message,
      channelPlan: ['Team lead briefing', 'Internal newsletter', 'Intranet landing page'],
      contentCalendar: [
        { phase: 'Preparation', weekOffset: 0, item: 'Brief team leads and collect their questions' },
        { phase: 'Launch week', weekOffset: 1, item: 'Newsletter piece and intranet page go up' },
        { phase: 'Follow-up', weekOffset: 3, item: 'Office hours, and answer what came back' }
      ],
      evidenceGaps: ['The review-time figure has no approved source and is marked awaiting source.'],
      reviewNeeds: ['Strategy and voice: Marketing owner (role; identity unbound)', 'Copy and channel: Communications owner (role; identity unbound)'],
      proposedOwners: [{ role: 'Communications', note: 'Suggested for the newsletter piece; not assigned.' }],
      dependencies: ['An approved source for anything said about tool availability.'],
      claimMap: audience
        .map((_item: string, index: number): { path: string; sources: ISourceRef[]; unknown?: string } => ({ path: `audience[${index}]`, sources: [], unknown: 'AWAITING_VALIDATION' }))
        .concat([
          { path: 'objective', sources: brand === undefined ? [] : [{ sourceId: brand.sourceId, versionOrETag: brand.versionOrETag }], unknown: brand === undefined ? 'AWAITING_SOURCE' : undefined },
          { path: 'painPoints[0]', sources: [], unknown: 'AWAITING_SOURCE' },
          { path: 'painPoints[1]', sources: [], unknown: 'AWAITING_SOURCE' },
          { path: 'channelPlan[0]', sources: [], unknown: 'AWAITING_VALIDATION' },
          { path: 'channelPlan[1]', sources: [], unknown: 'AWAITING_VALIDATION' },
          { path: 'channelPlan[2]', sources: [], unknown: 'AWAITING_VALIDATION' }
        ])
        .map((entry: { path: string; sources: ISourceRef[]; unknown?: string }): unknown => (entry.unknown === undefined ? { path: entry.path, sources: entry.sources } : entry)),
      createdAt: request.createdAt
    };
  }

  private _plan(request: IProviderRequest, inputs: IContentPlanInputs): unknown {
    const brief: ICampaignBriefV1 = inputs.acceptedBriefPayload;
    const brand: IPermittedSourceExcerpt | undefined = firstSource(request.permittedSources, /BRAND/);
    const product: IPermittedSourceExcerpt | undefined = firstSource(request.permittedSources, /PRODUCT/);
    const seed: string = request.artifactId;
    const channels: string[] = brief.channelPlan.slice(0, 3);
    const assets: unknown[] = [];
    const variants: unknown[] = [];
    const requirements: unknown[] = [];
    const calendar: unknown[] = [];
    for (let index: number = 0; index < channels.length; index += 1) {
      const assetId: string = syntheticId('AST', seed, index + 1);
      const requirementId: string = syntheticId('REQ', seed, index + 1);
      const variantId: string = syntheticId('VAR', seed, index + 1);
      assets.push({
        assetId,
        name: `${channels[index]} piece (synthetic)`,
        format: index === 0 ? 'briefingNote' : index === 1 ? 'newsletter' : 'intranetPage',
        purpose: `Carry the campaign message through ${channels[index]}.`,
        audience: brief.audience.slice(0, 2),
        channel: channels[index],
        channelOwnerBindingRef: null,
        destinationId: 'primary',
        ctaId: 'primary',
        sourceRefs: brand === undefined ? [] : [{ sourceId: brand.sourceId, versionOrETag: brand.versionOrETag }],
        accessibilityRequirements: ['Plain-language body under 200 words', 'Every link labelled with its destination'],
        reviewRequirementIds: [requirementId]
      });
      requirements.push({
        requirementId,
        reviewKind: 'copyChannel',
        scopeRefs: [assetId, variantId],
        requiredRole: 'Communications owner',
        authorityBindingRef: null,
        blockingReason: 'Copy and channel approval by the communications owner is required before this asset may be released; the owner identity is unbound.'
      });
      variants.push({
        variantId,
        assetId,
        channel: channels[index],
        audience: brief.audience.slice(0, 1),
        headline: cited('What the AI CoE can do for your team (synthetic)', brand),
        body: [cited('Ask before you start and you will get a straight answer about what is allowed (synthetic).', product), brief.message[0] ?? cited('The message house line (synthetic).', brand)],
        ctaId: 'primary',
        accessibility: { altText: null, linkLabel: 'Open the intranet landing page', reviewState: 'pending' }
      });
      calendar.push({
        entryId: syntheticId('CAL', seed, index + 1),
        phase: brief.contentCalendar[index]?.phase ?? 'Launch week',
        weekOffset: brief.contentCalendar[index]?.weekOffset ?? index,
        item: `${channels[index]} piece goes to its channel owner for copy review`,
        assetIds: [assetId],
        dependencyIds: index === 0 ? [syntheticId('DEP', seed, 1)] : []
      });
    }
    return {
      schemaVersion: '1.0',
      planId: request.artifactId,
      workId: request.workId,
      registerId: request.registerId,
      registerVersion: request.registerVersion,
      acceptedBrief: inputs.acceptedBrief,
      primaryDestination: { destinationId: 'primary', label: 'Intranet landing page (synthetic)', href: null, sourceRefs: [], unknown: 'AWAITING_SOURCE' },
      primaryCta: { ctaId: 'primary', label: 'Send one request this week', destinationId: 'primary' },
      assetRegister: assets,
      copyVariants: variants,
      contentCalendar: calendar,
      proposedOwners: [{ scopeRefs: [syntheticId('AST', seed, 2)], owner: { role: 'Communications', note: 'Suggested for the newsletter piece; not assigned.' } }],
      dependencies: [
        {
          dependencyId: syntheticId('DEP', seed, 1),
          scopeRefs: [syntheticId('AST', seed, 1)],
          description: { text: 'An approved source for anything said about tool availability.', sources: [], unknown: 'AWAITING_SOURCE' },
          relatedArtifact: { kind: 'campaignBrief', artifactId: inputs.acceptedBrief.artifactId, revision: inputs.acceptedBrief.revision, payloadHash: inputs.acceptedBrief.payloadHash },
          status: 'blocker'
        }
      ],
      approvalRequirements: requirements,
      evidenceGaps: ['The primary destination has no approved link yet; release is blocked until it does.', 'No channel owner is bound to any asset.'],
      reviewNeeds: ['Copy and channel: Communications owner (role; identity unbound)'],
      createdAt: request.createdAt
    };
  }

  private _followThrough(request: IProviderRequest, inputs: IMeetingFollowThroughInputs): unknown {
    const seed: string = request.artifactId;
    const notes: IPermittedSourceExcerpt[] = inputs.notes;
    const decisions: unknown[] = [];
    const actions: unknown[] = [];
    const questions: unknown[] = [];
    const decisionReq: string = syntheticId('REQ', seed, 1);
    const sendReq: string = syntheticId('REQ', seed, 2);
    for (const note of notes) {
      const lines: string[] = sentences(note.excerpt);
      for (let index: number = 0; index < lines.length; index += 1) {
        const line: string = lines[index];
        const locator: string = `${note.locator}#sentence-${index + 1}`;
        const evidence: unknown[] = [{ source: { sourceId: note.sourceId, versionOrETag: note.versionOrETag }, locator }];
        const unknownFigure: boolean = FIGURE.test(line);
        if (/\b(agreed|decided|decision)\b/i.test(line)) {
          decisions.push({
            decisionProposalId: syntheticId('DEC', seed, decisions.length + 1),
            classification: 'reportedDecision',
            statement: unknownFigure ? { text: line, sources: [], unknown: 'AWAITING_SOURCE' } : { text: line, sources: [{ sourceId: note.sourceId, versionOrETag: note.versionOrETag }] },
            rationale: { text: 'Reported in the permitted meeting notes; the meeting owner confirms it was a decision.', sources: [{ sourceId: note.sourceId, versionOrETag: note.versionOrETag }] },
            conditions: [],
            evidence,
            status: 'proposed',
            acceptance: null,
            reviewRequirementId: decisionReq
          });
        } else if (/\b(should|needs? to|must|check|find|ask)\b/i.test(line)) {
          actions.push({
            actionProposalId: syntheticId('ACT', seed, actions.length + 1),
            description: { text: line, sources: [{ sourceId: note.sourceId, versionOrETag: note.versionOrETag }] },
            suggestedOwner: { role: /newsletter|slot/i.test(line) ? 'Communications' : 'Marketing owner', note: 'Suggested from the notes; not assigned.' },
            proposedTiming: { kind: 'unknown', reason: 'UNKNOWN' },
            dependencyIds: [],
            evidence,
            requiredConfirmation: 'The meeting owner confirms the action and the named role accepts it before it becomes work.',
            reviewRequirementId: decisionReq
          });
        } else if (/\?$|unclear|unconfirmed|not (yet )?settled|open question/i.test(line)) {
          questions.push({ questionId: syntheticId('QST', seed, questions.length + 1), question: { text: line, sources: [{ sourceId: note.sourceId, versionOrETag: note.versionOrETag }] }, suggestedRole: null });
        }
      }
    }
    const firstNote: IPermittedSourceExcerpt | undefined = notes[0];
    return {
      schemaVersion: '1.0',
      followThroughId: request.artifactId,
      workId: request.workId,
      registerId: request.registerId,
      registerVersion: request.registerVersion,
      campaignPacket: { brief: inputs.brief, contentPlan: inputs.contentPlan },
      meetingSources: notes.map((note: IPermittedSourceExcerpt): unknown => ({ source: { sourceId: note.sourceId, versionOrETag: note.versionOrETag }, locator: note.locator })),
      decisions,
      actionProposals: actions,
      briefChanges:
        firstNote === undefined
          ? []
          : [
              {
                changeProposalId: syntheticId('CHG', seed, 1),
                targetBrief: inputs.brief,
                field: 'evidenceGaps',
                proposedValue: inputs.briefPayload.evidenceGaps.concat(['The launch waits on the availability source, per the meeting (synthetic).']),
                rationale: { text: 'The notes report the launch waiting on the availability source.', sources: [{ sourceId: firstNote.sourceId, versionOrETag: firstNote.versionOrETag }] },
                evidence: [{ source: { sourceId: firstNote.sourceId, versionOrETag: firstNote.versionOrETag }, locator: `${firstNote.locator}#sentence-1` }],
                reviewRequirementId: decisionReq
              }
            ],
      communicationsDrafts:
        firstNote === undefined
          ? []
          : [
              {
                communicationDraftId: syntheticId('COM', seed, 1),
                channel: 'teamsDraft',
                proposedAudience: ['Team leads in the campaign audience'],
                subject: { text: 'Launch timing update (synthetic draft)', sources: [{ sourceId: firstNote.sourceId, versionOrETag: firstNote.versionOrETag }] },
                body: [{ text: 'The launch waits until the availability claim has an approved source. Nothing else changes for your team.', sources: [{ sourceId: firstNote.sourceId, versionOrETag: firstNote.versionOrETag }] }],
                proposedCta: { text: 'Send one request this week', sources: [], unknown: 'AWAITING_VALIDATION' },
                proposedDestination: { text: 'Intranet landing page', sources: [], unknown: 'AWAITING_SOURCE' },
                sourceRefs: [{ sourceId: firstNote.sourceId, versionOrETag: firstNote.versionOrETag }],
                requiredSenderApproval: 'The communications owner approves and sends; this draft is unsent.',
                reviewRequirementIds: [sendReq],
                sent: false
              }
            ],
      unresolvedQuestions: questions,
      risks: [{ text: 'A promised date before the newsletter slot is confirmed would be a commitment nobody has made.', sources: [], unknown: 'AWAITING_VALIDATION' }],
      nextGate: { description: { text: 'The meeting owner accepts the decisions and actions; the communications owner decides the draft.', sources: [], unknown: 'AWAITING_VALIDATION' }, requiredReviewIds: [decisionReq, sendReq] },
      approvalRequirements: [
        {
          requirementId: decisionReq,
          reviewKind: 'meetingDecisionsActions',
          scopeRefs: [request.artifactId],
          requiredRole: 'Meeting owner',
          authorityBindingRef: null,
          blockingReason: 'Decisions and actions are proposals until the meeting owner accepts them; the owner identity is unbound.'
        },
        {
          requirementId: sendReq,
          reviewKind: 'communicationsSend',
          scopeRefs: [syntheticId('COM', seed, 1)],
          requiredRole: 'Communications owner',
          authorityBindingRef: null,
          blockingReason: 'Nothing is sent without the communications owner\'s approval; the owner identity is unbound.'
        }
      ],
      evidenceGaps: ['Who owns the availability claim has not been settled.'],
      reviewNeeds: ['Decisions and actions: Meeting owner (role; identity unbound)', 'Sending: Communications owner (role; identity unbound)'],
      createdAt: request.createdAt
    };
  }
}

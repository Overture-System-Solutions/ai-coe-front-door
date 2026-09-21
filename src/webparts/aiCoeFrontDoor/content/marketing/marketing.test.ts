/**
 * The local implementation baseline, held to its own rules. The cases that matter are the refusals: a fixture
 * register cannot back business content, a draft cannot invent a source, a proposed owner cannot become an
 * assignment, and a clean copy check never claims a statement is true.
 *
 * Reviewers named anywhere here are fictional and labelled as such (decision 2). No real person is bound.
 */
import {
  CAMPAIGN_BRIEF_SCHEMA_VERSION,
  validateCampaignBrief
} from './campaignBrief';
import type { ICampaignBriefV1, IProposedOwner } from './campaignBrief';
import {
  AVOIDED_WORDS,
  CHECK_LIMITATION,
  PROHIBITED_CLAIMS,
  checkCopy
} from './copyPolicy';
import type { ICopyFinding } from './copyPolicy';
import {
  FIXTURE_REGISTER,
  FIXTURE_REFUSAL,
  citeAgainst,
  isUsableForBusinessContent
} from './sourceRegister';
import type { ICitationOutcome, ISourceRegister } from './sourceRegister';
import { SENTINELS } from '../workIdentity';

/** A minimal valid brief, cited against the fixture register. Every value is obviously invented. */
function fixtureBrief(): ICampaignBriefV1 {
  return {
    schemaVersion: CAMPAIGN_BRIEF_SCHEMA_VERSION,
    briefId: 'FIXTURE-BRIEF-001',
    workId: 'CW-OVT_AICOE_20260921_AB12CD34',
    registerId: FIXTURE_REGISTER.registerId,
    registerVersion: FIXTURE_REGISTER.version,
    objective: 'Fixture objective for local testing.',
    audience: ['Fixture audience'],
    painPoints: ['Fixture pain point'],
    message: [{ text: 'Fixture message backed by a fixture source.', sources: [{ sourceId: 'FIXTURE-BRAND-001', versionOrETag: 'fixture-v1' }] }],
    channelPlan: ['Fixture channel'],
    contentCalendar: [{ phase: 'launch week', weekOffset: 0, item: 'Fixture item' }],
    evidenceGaps: [],
    reviewNeeds: ['Reviewed by Fictional Marketing Owner (fixture)'],
    createdAt: '2026-09-21T00:00:00Z'
  };
}

describe('approved-source register', () => {
  it('refuses to let a synthetic fixture back business content, so a live route stays closed', () => {
    expect(FIXTURE_REGISTER.approval).toBe('syntheticFixture');
    expect(isUsableForBusinessContent(FIXTURE_REGISTER)).toBe(false);
    expect(FIXTURE_REFUSAL.length).toBeGreaterThan(0);
    const approved: ISourceRegister = { ...FIXTURE_REGISTER, approval: 'approved' };
    expect(isUsableForBusinessContent(approved)).toBe(true);
  });

  it('never lets generated output approve a new source: an unknown reference becomes a gap', () => {
    const outcome: ICitationOutcome = citeAgainst(FIXTURE_REGISTER, [
      { sourceId: 'FIXTURE-BRAND-001', versionOrETag: 'fixture-v1' },
      { sourceId: 'SOMETHING-THE-MODEL-NAMED', versionOrETag: 'v9' }
    ]);
    expect(outcome.cited).toEqual([{ sourceId: 'FIXTURE-BRAND-001', versionOrETag: 'fixture-v1' }]);
    expect(outcome.gaps.length).toBe(1);
    expect(outcome.gaps[0]).toContain('SOMETHING-THE-MODEL-NAMED');
    expect(outcome.gaps[0]).toContain('not in the approved register');
  });

  it('treats a source that changed since approval as a gap, not as a citation', () => {
    const outcome: ICitationOutcome = citeAgainst(FIXTURE_REGISTER, [{ sourceId: 'FIXTURE-PRODUCT-002', versionOrETag: 'some-later-version' }]);
    expect(outcome.cited).toEqual([]);
    expect(outcome.gaps[0]).toContain('changed since it was approved');
  });

  it('collapses a repeated reference to one citation', () => {
    const reference = { sourceId: 'FIXTURE-BRAND-001', versionOrETag: 'fixture-v1' };
    expect(citeAgainst(FIXTURE_REGISTER, [reference, reference, reference]).cited.length).toBe(1);
  });

  it('gives every fixture row the fields a workflow needs to cite honestly, and marks each as a fixture', () => {
    for (const entry of FIXTURE_REGISTER.entries) {
      expect(entry.id).toContain('FIXTURE');
      expect(entry.location.indexOf('fixture://')).toBe(0);
      expect(entry.owner).toContain('fixture');
      expect({ id: entry.id, hasAll: entry.versionOrETag !== '' && entry.asOf !== '' && entry.classification !== '' && entry.audience !== '' && entry.mayNotProve !== '' }).toEqual({
        id: entry.id,
        hasAll: true
      });
    }
  });
});

describe('CampaignBrief.v1', () => {
  it('accepts the playbook shape', () => {
    expect(validateCampaignBrief(fixtureBrief())).toEqual({ valid: true, errors: [] });
  });

  it('requires every one of the seven parts the playbook names', () => {
    for (const field of ['audience', 'painPoints', 'channelPlan', 'reviewNeeds']) {
      const brief: ICampaignBriefV1 = fixtureBrief();
      (brief as unknown as { [key: string]: unknown })[field] = [];
      expect(validateCampaignBrief(brief).valid).toBe(false);
    }
    const noMessage: ICampaignBriefV1 = { ...fixtureBrief(), message: [] };
    expect(validateCampaignBrief(noMessage).valid).toBe(false);
  });

  it('refuses a claim that neither cites a source nor is marked unknown', () => {
    const brief: ICampaignBriefV1 = fixtureBrief();
    brief.message = [{ text: 'An unsupported statement.', sources: [] }];
    const result = validateCampaignBrief(brief);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('cites no source and is not marked unknown');
  });

  it('accepts a claim marked with a canonical sentinel instead of a citation', () => {
    const brief: ICampaignBriefV1 = fixtureBrief();
    brief.message = [{ text: 'Something nobody has established yet.', sources: [], unknown: 'AWAITING_SOURCE' }];
    expect(validateCampaignBrief(brief).valid).toBe(true);
    expect(SENTINELS.indexOf('AWAITING_SOURCE')).toBeGreaterThanOrEqual(0);
  });

  it('refuses a claim that is both cited and marked unknown, which would hide which one is true', () => {
    const brief: ICampaignBriefV1 = fixtureBrief();
    brief.message = [{ text: 'Both at once.', sources: [{ sourceId: 'FIXTURE-BRAND-001', versionOrETag: 'fixture-v1' }], unknown: 'UNKNOWN' }];
    expect(validateCampaignBrief(brief).valid).toBe(false);
  });

  it('records which register and version the run read, so an output is traceable', () => {
    for (const field of ['registerId', 'registerVersion']) {
      const brief: ICampaignBriefV1 = fixtureBrief();
      (brief as unknown as { [key: string]: unknown })[field] = '';
      expect(validateCampaignBrief(brief).valid).toBe(false);
    }
  });

  it('keeps the calendar on phases and week offsets, never a date', () => {
    const brief: ICampaignBriefV1 = fixtureBrief();
    brief.contentCalendar = [{ phase: 'launch week', weekOffset: 2, item: 'Fixture item' }];
    expect(validateCampaignBrief(brief).valid).toBe(true);
    for (const bad of [-1, 1.5, Number.NaN]) {
      const wrong: ICampaignBriefV1 = fixtureBrief();
      wrong.contentCalendar = [{ phase: 'launch week', weekOffset: bad, item: 'Fixture item' }];
      expect({ bad, valid: validateCampaignBrief(wrong).valid }).toEqual({ bad, valid: false });
    }
    // A date in the offset is not a number at all, so it is refused rather than coerced.
    const dated: ICampaignBriefV1 = fixtureBrief();
    (dated.contentCalendar[0] as unknown as { weekOffset: unknown }).weekOffset = '2026-10-01';
    expect(validateCampaignBrief(dated).valid).toBe(false);
  });

  it('carries proposed owners as planning notes that cannot become an assignment', () => {
    const brief: ICampaignBriefV1 = fixtureBrief();
    const owner: IProposedOwner = { role: 'Fictional Communications Owner (fixture)', note: 'Suggested reviewer for the launch note.' };
    brief.proposedOwners = [owner];
    brief.dependencies = ['Fixture dependency'];
    expect(validateCampaignBrief(brief).valid).toBe(true);
    // The shape itself is the guarantee: a role and a note, and nothing that identifies a person or a task.
    expect(Object.keys(owner).sort()).toEqual(['note', 'role']);
    const serialized: string = JSON.stringify(brief).toLowerCase();
    for (const forbidden of ['assignedto', 'assignee', 'taskid', 'email', '@']) {
      expect({ forbidden, present: serialized.indexOf(forbidden) >= 0 }).toEqual({ forbidden, present: false });
    }
  });

  it('allows an empty evidence-gap list but requires the field, so silence is deliberate', () => {
    const brief: ICampaignBriefV1 = fixtureBrief();
    expect(validateCampaignBrief(brief).valid).toBe(true);
    (brief as unknown as { evidenceGaps: unknown }).evidenceGaps = undefined;
    expect(validateCampaignBrief(brief).valid).toBe(false);
  });

  it('refuses an unversioned or wrongly versioned brief', () => {
    expect(validateCampaignBrief({ ...fixtureBrief(), schemaVersion: '2.0' }).valid).toBe(false);
    expect(validateCampaignBrief(undefined).valid).toBe(false);
    expect(validateCampaignBrief({}).valid).toBe(false);
  });
});

describe('generated-copy policy', () => {
  it('finds each avoided word', () => {
    for (const word of AVOIDED_WORDS) {
      const findings: ICopyFinding[] = checkCopy(`This will ${word} the way we work.`).findings;
      expect({ word, found: findings.filter((f: ICopyFinding): boolean => f.found === word).length }).toEqual({ word, found: 1 });
    }
  });

  it('leaves a longer word that merely contains an avoided one', () => {
    // "transformation" is not the avoided word, and reporting it would train reviewers to skip the warnings.
    expect(checkCopy('A gradual transformation of the process.').findings.length).toBe(0);
    expect(checkCopy('The door was unlocked by the owner.').findings.length).toBe(0);
  });

  it('reports an uncited figure and accepts a cited one', () => {
    const uncited: ICopyFinding[] = checkCopy('Teams saw a 40% improvement.').findings;
    expect(uncited.filter((f: ICopyFinding): boolean => f.kind === 'unsupportedFigure').length).toBe(1);
    expect(checkCopy('Teams saw a 40% improvement.', { cited: true }).findings.length).toBe(0);
  });

  it('never claims a clean check proves anything', () => {
    const clean = checkCopy('A plain sentence about what the service does.');
    expect(clean.findings).toEqual([]);
    expect(clean.limitation).toBe(CHECK_LIMITATION);
    expect(clean.limitation.toLowerCase()).toContain('not proof');
  });

  it('names the prohibited claim classes, so the list can be extended rather than guessed', () => {
    expect(PROHIBITED_CLAIMS.slice()).toEqual([
      'inventedRoi',
      'inventedAdoption',
      'unsupportedAvailability',
      'unsupportedSecurity',
      'unsupportedCapability'
    ]);
  });
});

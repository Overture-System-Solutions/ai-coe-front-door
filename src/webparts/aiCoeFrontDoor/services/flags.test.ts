import { evaluateFlags } from './flags';
import type { ISubmissionFlags } from './flags';

describe('evaluateFlags', () => {
  it('treats a plain submission as internal with no review', () => {
    const flags: ISubmissionFlags = evaluateFlags({}, { companyDataOrWorkflow: 'no', sensitiveCategories: ['none'] });
    expect(flags).toEqual({
      companyDataOrWorkflow: false,
      sensitiveOrRegulated: false,
      externalUsers: false,
      autonomousActions: false,
      requiresReview: false,
      dataSensitivity: 'Internal'
    });
  });

  it('flags sensitive or regulated categories as Restricted', () => {
    for (const category of ['patient', 'employee', 'customer', 'otherConfidential', 'regulated', 'unsure']) {
      const flags: ISubmissionFlags = evaluateFlags({}, { sensitiveCategories: [category] });
      expect(flags.sensitiveOrRegulated).toBe(true);
      expect(flags.companyDataOrWorkflow).toBe(true);
      expect(flags.requiresReview).toBe(true);
      expect(flags.dataSensitivity).toBe('Restricted');
    }
  });

  it('reads idea information categories too', () => {
    expect(evaluateFlags({}, { informationCategories: ['internal'] }).dataSensitivity).toBe('Confidential');
    expect(evaluateFlags({}, { informationCategories: ['public'] }).dataSensitivity).toBe('Internal');
    expect(evaluateFlags({}, { informationCategories: ['patient'] }).dataSensitivity).toBe('Restricted');
  });

  it('marks company data when answered yes or unsure', () => {
    expect(evaluateFlags({}, { companyDataOrWorkflow: 'yes' }).companyDataOrWorkflow).toBe(true);
    expect(evaluateFlags({}, { companyDataOrWorkflow: 'unsure' }).dataSensitivity).toBe('Confidential');
    expect(evaluateFlags({}, { companyDataOrWorkflow: 'no' }).companyDataOrWorkflow).toBe(false);
  });

  it('detects external users and autonomous actions from either answer name', () => {
    expect(evaluateFlags({}, { outputSharedExternally: 'yes' }).externalUsers).toBe(true);
    expect(evaluateFlags({}, { externalUsers: 'unsure' }).externalUsers).toBe(true);
    expect(evaluateFlags({}, { aiTakesAction: 'yes' }).autonomousActions).toBe(true);
    expect(evaluateFlags({}, { autonomousActions: 'unsure' }).requiresReview).toBe(true);
    expect(evaluateFlags({}, { aiTakesAction: 'no' }).autonomousActions).toBe(false);
  });

  it('requires review when the payload carries review indicators or a review outcome', () => {
    expect(evaluateFlags({ reviewIndicators: ['x'] }, {}).requiresReview).toBe(true);
    expect(evaluateFlags({ reviewIndicators: [] }, {}).requiresReview).toBe(false);
    expect(evaluateFlags({ outcome: 'Please request a CoE review before proceeding' }, {}).requiresReview).toBe(true);
    expect(evaluateFlags({ outcome: 'This appears eligible for a standard-use check' }, {}).requiresReview).toBe(false);
  });

  it('ignores non-array category values', () => {
    expect(evaluateFlags({}, { sensitiveCategories: 'patient' }).sensitiveOrRegulated).toBe(false);
  });
});

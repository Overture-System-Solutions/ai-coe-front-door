import { DEFAULT_ROLE_LABELS, isRoleId, parseRoleGroups, ROLE_IDS, roleLabel } from './roles';
import type { RoleGroupMap } from './roles';
import { DEFAULT_VOCABULARY } from './pageContent';
import type { IVocabulary } from './pageContent';

function vocabularyWith(roles: { [roleId: string]: string }): IVocabulary {
  return { ...DEFAULT_VOCABULARY, roles };
}

describe('role ids', () => {
  it('names the four roles of the plan, employee first', () => {
    expect(ROLE_IDS).toEqual(['employee', 'leader', 'operator', 'designAuthority']);
    expect(Object.keys(DEFAULT_ROLE_LABELS).sort()).toEqual(ROLE_IDS.slice().sort());
    expect(isRoleId('leader')).toBe(true);
    expect(isRoleId('Leader')).toBe(false);
    expect(isRoleId('auditor')).toBe(false);
  });
});

describe('parseRoleGroups', () => {
  it('reads semicolon-separated pairs of a role id and a site group title', () => {
    const map: RoleGroupMap = parseRoleGroups('leader=AI CoE Leaders; operator = Ops');
    expect(map).toEqual({ leader: 'AI CoE Leaders', operator: 'Ops' });
  });

  it('ignores malformed entries and keeps the sound ones', () => {
    // No separator, an unknown role id, a blank title, a blank entry: each is dropped on its own.
    const map: RoleGroupMap = parseRoleGroups('AI CoE Leaders; auditor=Auditors; operator= ;;leader=Leads;;');
    expect(map).toEqual({ leader: 'Leads' });
  });

  it('keeps a title that carries its own separator and lets the last pair of a role win', () => {
    expect(parseRoleGroups('designAuthority=Design = Authority')).toEqual({ designAuthority: 'Design = Authority' });
    expect(parseRoleGroups('leader=First;leader=Second')).toEqual({ leader: 'Second' });
  });

  it('reads a blank, an undefined and a separator-free value as no binding at all', () => {
    expect(parseRoleGroups('')).toEqual({});
    expect(parseRoleGroups(undefined)).toEqual({});
    expect(parseRoleGroups('   ')).toEqual({});
  });
});

describe('roleLabel', () => {
  it('names each role in the words a sentence can carry', () => {
    expect(roleLabel('employee')).toBe('Employee');
    expect(roleLabel('leader')).toBe('Leader');
    expect(roleLabel('operator')).toBe('AI CoE operator');
    expect(roleLabel('designAuthority')).toBe('Design authority');
  });

  it('takes the document wording when the vocabulary names the role, and keeps the default when it is blank', () => {
    expect(roleLabel('operator', vocabularyWith({ operator: 'Service desk' }))).toBe('Service desk');
    expect(roleLabel('operator', vocabularyWith({ operator: '' }))).toBe('AI CoE operator');
    expect(roleLabel('leader', DEFAULT_VOCABULARY)).toBe('Leader');
  });

  it('gives an unknown role id back as it came, so a stray id never reads as a name', () => {
    expect(roleLabel('auditor')).toBe('auditor');
    expect(roleLabel('auditor', vocabularyWith({ auditor: 'Auditor' }))).toBe('Auditor');
  });
});

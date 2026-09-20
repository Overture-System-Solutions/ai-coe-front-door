import { DEFAULT_PROTECTED_PAGE_TEXT, DEFAULT_ROLE_LABELS, holdsAnyRole, identityRole, isRoleId, NO_ROLE_TEXT, parseRoleGroups, protectedPageText, ROLE_IDS, roleLabel } from './roles';
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

describe('holdsAnyRole', () => {
  it('asks for any one of the named roles, so an operator who is no leader passes a two-role gate', () => {
    expect(holdsAnyRole(['leader', 'operator'], ['employee', 'operator'])).toBe(true);
    expect(holdsAnyRole(['leader'], ['employee', 'operator'])).toBe(false);
    expect(holdsAnyRole(['operator'], ['employee', 'operator', 'leader'])).toBe(true);
  });

  it('lets everyone through when nothing is asked for, and nobody through when the roles are unknown', () => {
    expect(holdsAnyRole(undefined, undefined)).toBe(true);
    expect(holdsAnyRole([], ['employee'])).toBe(true);
    expect(holdsAnyRole(['leader'], undefined)).toBe(false);
    expect(holdsAnyRole(['leader'], [])).toBe(false);
    // An id no resolver can yield keeps its content shut rather than opening it to everyone.
    expect(holdsAnyRole(['auditor'], ['employee', 'operator'])).toBe(false);
  });
});

describe('protectedPageText', () => {
  it('names the role the page is written for, in the words of the document', () => {
    expect(DEFAULT_PROTECTED_PAGE_TEXT).toBe('This page is for the {role} role and is not available to you.');
    expect(protectedPageText(['operator'])).toBe('This page is for the AI CoE operator role and is not available to you.');
    expect(protectedPageText(['leader', 'operator'])).toBe('This page is for the Leader or AI CoE operator role and is not available to you.');
    expect(protectedPageText(['operator'], vocabularyWith({ operator: 'Service desk' }))).toBe('This page is for the Service desk role and is not available to you.');
  });

  it('takes the wording from the chrome vocabulary and fills every role token in it', () => {
    const vocabulary: IVocabulary = { ...DEFAULT_VOCABULARY, chrome: { protectedPage: 'Only {role} may read this. Ask {role} for a copy.' } };
    expect(protectedPageText(['leader'], vocabulary)).toBe('Only Leader may read this. Ask Leader for a copy.');
  });

  it('says the page is protected even when it names no role at all', () => {
    expect(protectedPageText(undefined)).toBe('This page is for the {role} role and is not available to you.'.replace('{role}', NO_ROLE_TEXT));
    expect(protectedPageText([])).toContain(NO_ROLE_TEXT);
  });
});

describe('identityRole', () => {
  it('names the roles a person was granted, in the order of the ids, and never the default one', () => {
    expect(identityRole(['employee', 'leader'])).toBe('Leader');
    expect(identityRole(['operator', 'leader'])).toBe('Leader, AI CoE operator');
    expect(identityRole(['employee', 'leader'], vocabularyWith({ leader: 'Business leader' }))).toBe('Business leader');
  });

  it('says the role is not set when only the default role, no role or an unknown one is held', () => {
    expect(NO_ROLE_TEXT).toBe('role not set');
    expect(identityRole(['employee'])).toBe(NO_ROLE_TEXT);
    expect(identityRole([])).toBe(NO_ROLE_TEXT);
    expect(identityRole(undefined)).toBe(NO_ROLE_TEXT);
    expect(identityRole(['auditor'])).toBe(NO_ROLE_TEXT);
  });
});

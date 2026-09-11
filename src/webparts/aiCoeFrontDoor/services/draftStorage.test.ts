import { draftKey, LocalStorageDraftStore } from './draftStorage';
import type { IDraftStore } from './draftStorage';

describe('LocalStorageDraftStore', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('namespaces keys with the shipped prefix', () => {
    expect(draftKey('idea')).toBe('overture-ai-coe-front-door:draft:idea');
  });

  it('round-trips a draft as JSON', async () => {
    const store: IDraftStore = new LocalStorageDraftStore(window.localStorage);
    await expect(store.save('idea', { answers: { workToImprove: 'x' }, phase: 'form' })).resolves.toEqual({ ok: true });
    expect(window.localStorage.getItem('overture-ai-coe-front-door:draft:idea')).toBe('{"answers":{"workToImprove":"x"},"phase":"form"}');
    await expect(store.load('idea')).resolves.toEqual({ answers: { workToImprove: 'x' }, phase: 'form' });
  });

  it('returns undefined for missing or unreadable drafts', async () => {
    const store: IDraftStore = new LocalStorageDraftStore(window.localStorage);
    await expect(store.load('feedback')).resolves.toBeUndefined();
    window.localStorage.setItem('overture-ai-coe-front-door:draft:feedback', '{not json');
    await expect(store.load('feedback')).resolves.toBeUndefined();
  });

  it('clears drafts and tolerates a failing storage', async () => {
    const store: IDraftStore = new LocalStorageDraftStore(window.localStorage);
    await store.save('toolCheck', { answers: {} });
    await store.clear('toolCheck');
    expect(window.localStorage.getItem('overture-ai-coe-front-door:draft:toolCheck')).toBeNull();

    const failing: Storage = {
      ...window.localStorage,
      setItem: (): void => {
        throw new Error('quota');
      },
      getItem: (): string => {
        throw new Error('blocked');
      },
      removeItem: (): void => {
        throw new Error('blocked');
      }
    } as unknown as Storage;
    const fragile: IDraftStore = new LocalStorageDraftStore(failing);
    await expect(fragile.save('idea', {})).resolves.toEqual({ ok: false });
    await expect(fragile.load('idea')).resolves.toBeUndefined();
    await expect(fragile.clear('idea')).resolves.toBeUndefined();
  });

  it('works without any storage at all', async () => {
    const store: IDraftStore = new LocalStorageDraftStore(undefined);
    await expect(store.save('idea', {})).resolves.toEqual({ ok: false });
    await expect(store.load('idea')).resolves.toBeUndefined();
  });
});

/**
 * The Marketing service bundle the web part hands to the consolidated view: the drafting operations, the review
 * orchestration, the store and the registry behind them, and the mode all of them run in.
 *
 * Two bundles exist. The synthetic bundle runs the real validators, the real source gate, the real review protocol
 * and the real persistence contract over the fixture register, the deterministic provider and a browser-storage
 * store; every record it writes says it is synthetic. The live bundle is the same code over the unbound business
 * registry, the unavailable live provider and the disabled live store, so every call fails closed with the reasons
 * in LIVE_BINDINGS_REQUIRED.md. Which one a site gets is configuration; neither is a flag that turns fixtures into
 * business content.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { registerSnapshotHash } from '../../content/marketing/sourceGate';
import { ArtifactRepository } from './artifactRepository';
import { DisabledLiveArtifactStore, PersistentSyntheticArtifactStore } from './artifactStore';
import type { IArtifactStore, IStorageBackend } from './artifactStore';
import { MarketingDraftService } from './marketingDraftService';
import { MarketingReviewService } from './marketingReviewService';
import { SyntheticMarketingProvider, UnavailableLiveProvider } from './providers';
import type { IMarketingProvider, ProviderAvailability } from './providers';
import { SyntheticSourceRegistry, UnboundBusinessSourceRegistry } from './sourceRegistry';
import type { ISourceRegistry, RegisterReadResult } from './sourceRegistry';

export type MarketingMode = 'synthetic' | 'live';

export interface IMarketingServices {
  mode: MarketingMode;
  /** One sentence a page shows about where these records go. */
  label: string;
  draft: MarketingDraftService;
  review: MarketingReviewService;
  store: IArtifactStore;
  registry: ISourceRegistry;
  provider: IMarketingProvider;
  /** Why the live route is closed; empty for the synthetic bundle. */
  liveReasons: readonly string[];
}

export interface IMarketingServiceOptions {
  now?: () => Date;
  newId?: (prefix: string) => string;
}

export const SYNTHETIC_MODE_LABEL: string = 'Synthetic workspace: real validators, review protocol and persistence over a fixture register and a deterministic provider. Every record is marked synthetic; nothing here is business content or a live AI response.';

function snapshotOf(registry: ISourceRegistry): () => Promise<string | undefined> {
  return async (): Promise<string | undefined> => {
    const read: RegisterReadResult = await registry.readRegister();
    return read.available ? registerSnapshotHash(read.readback.register) : undefined;
  };
}

/** The synthetic bundle over a storage backend (`localStorage` in the web part, a memory backend in tests). */
export function createSyntheticMarketingServices(backend: IStorageBackend, options: IMarketingServiceOptions = {}): IMarketingServices {
  const store: IArtifactStore = new PersistentSyntheticArtifactStore(backend);
  const repository: ArtifactRepository = new ArtifactRepository(store);
  const registry: ISourceRegistry = new SyntheticSourceRegistry();
  const provider: IMarketingProvider = new SyntheticMarketingProvider();
  return {
    mode: 'synthetic',
    label: SYNTHETIC_MODE_LABEL,
    draft: new MarketingDraftService({ repository, registry, provider, now: options.now, newId: options.newId }),
    review: new MarketingReviewService({ repository, now: options.now, newId: options.newId, currentRegisterSnapshotHash: snapshotOf(registry) }),
    store,
    registry,
    provider,
    liveReasons: []
  };
}

/** The live bundle: every route present and closed, with its reasons, until the bindings exist. */
export function createDisabledLiveMarketingServices(options: IMarketingServiceOptions = {}): IMarketingServices {
  const store: IArtifactStore = new DisabledLiveArtifactStore();
  const repository: ArtifactRepository = new ArtifactRepository(store);
  const registry: ISourceRegistry = new UnboundBusinessSourceRegistry();
  const provider: IMarketingProvider = new UnavailableLiveProvider();
  const reasons: string[] = store.unavailableReasons.slice();
  const availability: ProviderAvailability = provider.availability();
  if (!availability.available) {
    reasons.push(...availability.reasons);
  }
  return {
    mode: 'live',
    label: 'Live Marketing route: not bound. Drafting, review and persistence refuse with the reasons shown.',
    draft: new MarketingDraftService({ repository, registry, provider, now: options.now, newId: options.newId }),
    review: new MarketingReviewService({ repository, now: options.now, newId: options.newId, currentRegisterSnapshotHash: snapshotOf(registry) }),
    store,
    registry,
    provider,
    liveReasons: reasons
  };
}

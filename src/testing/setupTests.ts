/**
 * Jest setup (registered through config/jest.config.json): jest-dom matchers and the few browser
 * APIs jsdom does not implement but the components call.
 */
import '@testing-library/jest-dom';
import { webcrypto } from 'crypto';
import { TextEncoder as NodeTextEncoder } from 'util';

/**
 * jsdom offers no SHA-256. Production callers fail closed without one; tests that exercise hashing
 * need the real digest, which Node's webcrypto is. Suites that prove the refusal still take it away.
 */
const cryptoHolder: { crypto?: { subtle?: unknown }; TextEncoder?: unknown } = globalThis as { crypto?: { subtle?: unknown }; TextEncoder?: unknown };
if (cryptoHolder.crypto === undefined || cryptoHolder.crypto.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
}
if (cryptoHolder.TextEncoder === undefined) {
  Object.defineProperty(globalThis, 'TextEncoder', { value: NodeTextEncoder, configurable: true, writable: true });
}

if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // jsdom has no layout; scrolling is a no-op in tests.
  };
}

/**
 * React's "not wrapped in act(...)" warning means a test observed a state update it did not wait
 * for; treating it as a failure keeps the suites deterministic.
 */
const actWarnings: string[] = [];
const originalConsoleError: typeof console.error = console.error;

beforeEach((): void => {
  actWarnings.length = 0;
  console.error = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && args[0].indexOf('not wrapped in act') >= 0) {
      actWarnings.push(args[0]);
      return;
    }
    originalConsoleError.apply(console, args);
  };
});

afterEach((): void => {
  console.error = originalConsoleError;
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
  expect(actWarnings).toEqual([]);
});

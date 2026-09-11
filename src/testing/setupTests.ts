/**
 * Jest setup (registered through config/jest.config.json): jest-dom matchers and the few browser
 * APIs jsdom does not implement but the components call.
 */
import '@testing-library/jest-dom';

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

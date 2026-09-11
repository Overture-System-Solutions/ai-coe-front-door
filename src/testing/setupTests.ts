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

afterEach((): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
});

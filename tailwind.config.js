/**
 * Tailwind CSS v3 configuration reproducing the utility stylesheet shipped in package 1.0.0.7.
 *
 * - `important` with a selector emits every utility as `#overture-ai-coe-pilot .utility`, exactly like the
 *   shipped bundle, so utilities only apply inside the web part and beat the unprefixed component classes.
 * - Preflight stays off: the shipped stylesheet contained no base styles, and enabling them would restyle
 *   the SharePoint page around the web part.
 * - The safelist keeps eleven utilities that 1.0.0.7 contained without any element using them: nine content-scan
 *   false positives of the original build, plus h-3.5/w-3.5 from the removed theme-chip icon that never rendered.
 *   They are inert; retire them together with the parity fixture.
 *
 * - Only the web part sources are scanned (not tests or the test support code): Tailwind treats every word as a
 *   candidate class, so prose in test names would otherwise leak utilities into the stylesheet.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/webparts/**/*.{ts,tsx}', '!./src/webparts/**/*.test.{ts,tsx}'],
  important: '#overture-ai-coe-pilot',
  corePlugins: { preflight: false },
  safelist: ['!visible', 'visible', 'border', 'contents', 'filter', 'outline', 'transform', 'transition', 'underline', 'h-3.5', 'w-3.5'],
  theme: { extend: {} },
  plugins: []
};

/**
 * Tailwind CSS v3 configuration reproducing the utility stylesheet shipped in package 1.0.0.7.
 *
 * - `important` with a selector emits every utility as `#overture-ai-coe-pilot .utility`, exactly like the
 *   shipped bundle, so utilities only apply inside the web part and beat the unprefixed component classes.
 * - Preflight stays off: the shipped stylesheet contained no base styles, and enabling them would restyle
 *   the SharePoint page around the web part.
 * - The safelist keeps nine utilities that 1.0.0.7 contained without any element using them (content-scan
 *   false positives in the original build). They are inert; retire them together with the parity fixture.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.tsx', './src/**/*.ts'],
  important: '#overture-ai-coe-pilot',
  corePlugins: { preflight: false },
  safelist: ['!visible', 'visible', 'border', 'contents', 'filter', 'outline', 'transform', 'transition', 'underline'],
  theme: { extend: {} },
  plugins: []
};

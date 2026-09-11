/**
 * Heft run-script task (and stand-alone CLI) that generates the Tailwind utility stylesheet
 * `src/webparts/aiCoeFrontDoor/styles/tailwind.generated.global.scss` from `tailwind.css` and the
 * class names found in the TypeScript sources. Registered in config/heft.json as the `tailwind`
 * phase, which the rig's `build` phase depends on, so the file exists before Sass and webpack run.
 *
 * Usage outside Heft: `npm run tailwind`.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STYLES = path.join(ROOT, 'src', 'webparts', 'aiCoeFrontDoor', 'styles');
const INPUT = path.join(STYLES, 'tailwind.css');
// The .global.scss suffix matters: the SharePoint Framework webpack loader only leaves selectors of
// *.global.scss stylesheets unhashed (plain *.global.css compiles to .global.css.css, which it treats
// as a CSS module and rewrites every selector).
const OUTPUT = path.join(STYLES, 'tailwind.generated.global.scss');
const CONFIG = path.join(ROOT, 'tailwind.config.js');

/** Set once per process so watch mode spawns a single Tailwind watcher. */
let watchChild;

async function buildOnce() {
  const postcss = require('postcss');
  const tailwind = require('tailwindcss');
  const source = fs.readFileSync(INPUT, 'utf8');
  const result = await postcss([tailwind(CONFIG)]).process(source, { from: INPUT, to: OUTPUT, map: false });
  // Write only when the content changed: rewriting a file under src/ would retrigger Heft's watchers.
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8') !== result.css) {
    fs.writeFileSync(OUTPUT, result.css);
    return true;
  }
  return false;
}

/** Entry point used by @rushstack/heft's run-script-plugin. */
async function runAsync(options) {
  const terminal = options.heftTaskSession.logger.terminal;
  const changed = await buildOnce();
  terminal.writeLine(`Tailwind: ${path.relative(ROOT, OUTPUT)} ${changed ? 'regenerated' : 'up to date'}`);
  if (options.heftTaskSession.parameters.watch && !watchChild) {
    const cli = require.resolve('tailwindcss/lib/cli.js');
    watchChild = spawn(process.execPath, [cli, '-c', CONFIG, '-i', INPUT, '-o', OUTPUT, '--watch'], {
      cwd: ROOT,
      stdio: 'inherit'
    });
    process.on('exit', () => watchChild.kill());
    terminal.writeLine('Tailwind: watching TypeScript sources for class-name changes');
  }
}

module.exports = { runAsync, buildOnce, OUTPUT };

if (require.main === module) {
  buildOnce()
    .then((changed) => {
      console.log(`Tailwind: ${path.relative(ROOT, OUTPUT)} ${changed ? 'regenerated' : 'up to date'}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

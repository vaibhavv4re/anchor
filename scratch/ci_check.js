/**
 * scratch/ci_check.js  (Stage 4 - CI)
 *
 * The repository has no test runner and no real bundler: index.html loads loose
 * ES modules (main.js -> bootstrap.js), and bundle.js is a legacy artifact that
 * scratch/build_bundle.js only string-patches (it cannot be regenerated from
 * source deterministically). So the highest-value automated gate is a syntax /
 * ES-module-parse check across every shipped source file. A single bad import or
 * unbalanced brace previously shipped silently (the committed bundle was found
 * thousands of lines stale during the audit).
 *
 * What it does:
 *   1. Walks businessos/ and restaurantos/ for .js files.
 *   2. For each, runs `node --input-type=module --check` (pipes file content on
 *      stdin) so ESM syntax (import/export) is validated, not just CommonJS.
 *   3. Exits non-zero on the first aggregated list of failures, printing them.
 *
 * Usage: `node scratch/ci_check.js`
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['businessos', 'restaurantos'];
// Deno Edge Functions are not Node-ESM and are checked by the Supabase deploy step.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const SKIP_PATH_HINTS = [path.join('supabase', 'functions')];

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function shouldSkip(file) {
  const rel = path.relative(ROOT, file);
  return SKIP_PATH_HINTS.some((hint) => rel.includes(hint));
}

function checkFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: content,
      stdio: ['pipe', 'ignore', 'pipe']
    });
    return null;
  } catch (err) {
    const msg = (err.stderr ? err.stderr.toString() : String(err.message || err)).trim();
    // Keep the first meaningful lines only.
    const short = msg.split('\n').slice(0, 6).join('\n');
    return short;
  }
}

function main() {
  const files = [];
  for (const d of SCAN_DIRS) {
    walk(path.join(ROOT, d), files);
  }
  const targets = files.filter((f) => !shouldSkip(f));

  let checked = 0;
  const failures = [];
  for (const file of targets) {
    const err = checkFile(file);
    checked++;
    if (err) {
      failures.push({ file: path.relative(ROOT, file), err });
    }
  }

  if (failures.length === 0) {
    console.log(`ci_check: OK - ${checked} ES module file(s) parsed.`);
    process.exit(0);
  }

  console.error(`ci_check: FAIL - ${failures.length}/${checked} file(s) failed to parse:\n`);
  for (const f of failures) {
    console.error(`--- ${f.file} ---\n${f.err}\n`);
  }
  process.exit(1);
}

main();

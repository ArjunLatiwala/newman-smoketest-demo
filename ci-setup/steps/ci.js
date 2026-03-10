'use strict';

const fs = require('fs');
const path = require('path');

// ─── Simple logger (works with or without chalk) ───────────────────────────
let chalk;
try {
  chalk = require('chalk');
} catch {
  chalk = {
    green: (s) => s,
    yellow: (s) => s,
    red: (s) => s,
    cyan: (s) => s,
    bold: (s) => s,
  };
}

const log = {
  info:    (msg) => console.log(chalk.cyan(`  ℹ  ${msg}`)),
  success: (msg) => console.log(chalk.green(`  ✔  ${msg}`)),
  warn:    (msg) => console.log(chalk.yellow(`  ⚠  ${msg}`)),
  error:   (msg) => console.log(chalk.red(`  ✖  ${msg}`)),
  title:   (msg) => console.log(chalk.bold(`\n  ${msg}`)),
};

// ─── Paths ─────────────────────────────────────────────────────────────────
const TEMPLATE_PATH = path.resolve(__dirname, '../templates/ci-tests.yml');
const TARGET_DIR    = path.resolve(process.cwd(), '.github', 'workflows');
const TARGET_FILE   = path.join(TARGET_DIR, 'ci-tests.yml');

// ─── Validators ────────────────────────────────────────────────────────────

/**
 * Check that package.json has the required scripts for CI to work.
 */
function validatePackageJson() {
  const pkgPath = path.resolve(process.cwd(), 'package.json');

  if (!fs.existsSync(pkgPath)) {
    log.error('No package.json found in current directory.');
    return false;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts || {};
  let valid = true;

  if (!scripts.start) {
    log.warn('No "start" script found in package.json — the CI server boot step will fail.');
    log.warn('Add:  "start": "node index.js"  (or your entry file)');
    valid = false;
  }

  if (!scripts.test) {
    log.warn('No "test" script found in package.json — smoke tests will fail.');
    log.warn('Add:  "test": "jest"  (or your test runner command)');
    valid = false;
  }

  return valid;
}

/**
 * Check that at least one Postman collection exists in the project.
 */
function validatePostmanCollection() {
  const files = findFiles(process.cwd(), (f) =>
    f.endsWith('.postman_collection.json') || f === 'collection.json'
  );

  if (files.length === 0) {
    log.warn('No Postman collection file found (*.postman_collection.json).');
    log.warn('Newman tests will fail until you add one to your repo.');
    return false;
  }

  files.forEach((f) => log.success(`Found collection: ${path.relative(process.cwd(), f)}`));
  return true;
}

// ─── Core ──────────────────────────────────────────────────────────────────

/**
 * Copy the CI workflow YAML into the project's .github/workflows/ directory.
 */
function copyWorkflow() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    log.error(`CI template not found at: ${TEMPLATE_PATH}`);
    log.error('Please ensure ci-tests.yml exists in the package templates/ folder.');
    process.exit(1);
  }

  // Create .github/workflows/ if it doesn't exist
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    log.info('Created .github/workflows/ directory.');
  }

  // Warn if already exists but overwrite
  if (fs.existsSync(TARGET_FILE)) {
    log.warn('ci-tests.yml already exists — overwriting with latest version.');
  }

  fs.copyFileSync(TEMPLATE_PATH, TARGET_FILE);
  log.success(`Workflow copied to ${path.relative(process.cwd(), TARGET_FILE)}`);
}

// ─── Main export ───────────────────────────────────────────────────────────

/**
 * Entry point called by the CLI's init/setup command.
 * 
 * Usage in your CLI:
 *   const setupCI = require('./steps/ci');
 *   await setupCI();
 */
async function setupCI() {
  log.title('Setting up Newman & Smoke Test CI workflow...');

  // Step 1: Copy the YAML
  copyWorkflow();

  // Step 2: Validate package.json scripts
  log.title('Validating package.json scripts...');
  const pkgValid = validatePackageJson();
  if (pkgValid) {
    log.success('package.json has required "start" and "test" scripts.');
  }

  // Step 3: Check for Postman collection
  log.title('Checking for Postman collection...');
  validatePostmanCollection();

  // Step 4: Summary
  console.log('');
  log.success('CI setup complete!');
  log.info('The workflow will run on every git push across all branches.');
  log.info('Newman reports will be available as GitHub Actions artifacts.');
  console.log('');

  if (!pkgValid) {
    log.warn('Fix the warnings above before pushing — CI jobs may fail.');
  }
}

module.exports = setupCI;

// ─── Helpers ───────────────────────────────────────────────────────────────

function findFiles(dir, predicate, results = []) {
  const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }

  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(full, predicate, results);
    } else if (predicate(entry.name)) {
      results.push(full);
    }
  }
  return results;
}
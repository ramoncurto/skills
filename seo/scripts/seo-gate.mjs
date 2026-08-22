#!/usr/bin/env node
// Local, deterministic gate for the standalone SEO tooling. No network calls.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = dirname(fileURLToPath(import.meta.url));
const root = join(scripts, '..');
// Canonical suite names are retained here for human auditability; execution is
// discovered dynamically so newly added contract suites cannot be omitted.
const canonicalSuites = [
  'tooling.test.mjs',
  'skill-contract.test.mjs',
  'seo.test.mjs',
  'director-contract.test.mjs',
  'artifact-contract.test.mjs',
  'autoreview-contract.test.mjs',
  'scorecard-preflight.test.mjs',
  'gsc-preflight.test.mjs',
];
let testFiles;
try {
  testFiles = readdirSync(join(root, 'tests')).filter((name) => name.endsWith('.test.mjs')).sort();
  const missing = canonicalSuites.filter((name) => !testFiles.includes(name));
  if (missing.length) throw new Error(`required canonical suite missing: ${missing.join(', ')}`);
  JSON.parse(readFileSync(join(root, 'assets', 'scorecard.config.example.json'), 'utf8'));
  JSON.parse(readFileSync(join(root, 'assets', 'report.schema.json'), 'utf8'));
  for (const fixture of readdirSync(join(root, 'tests', 'fixtures')).filter((name) => name.endsWith('.json'))) JSON.parse(readFileSync(join(root, 'tests', 'fixtures', fixture), 'utf8'));
} catch (error) {
  console.error(`seo-gate.mjs: invalid gate input: ${error.message}`);
  process.exit(1);
}
const filesBelow = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesBelow(join(directory, entry.name)) : [join(directory, entry.name)]);
const syntaxCommands = filesBelow(scripts).filter((file) => /\.(?:mjs|sh)$/.test(file)).sort().map((file) => file.endsWith('.mjs') ? [process.execPath, ['--check', file]] : ['bash', ['-n', file]]);
const commands = [
  ...testFiles.map((name) => [process.execPath, ['--test', join(root, 'tests', name)]]),
  ...syntaxCommands,
];
let failed = false;
let launchError = false;
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  if (result.error) { console.error(`seo-gate.mjs: could not launch ${command}: ${result.error.message}`); launchError = true; }
  else if (result.status !== 0) failed = true;
}
try {
  const source = readFileSync(join(scripts, 'measure-page.mjs'), 'utf8');
  if (/sportplan\.es/i.test(source)) throw new Error('measure-page must not hard-code a project host');
} catch (error) { console.error(`seo-gate.mjs: policy assertion failed: ${error.message}`); failed = true; }
process.exit(launchError ? 1 : failed ? 2 : 0);

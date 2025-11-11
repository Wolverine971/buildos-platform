#!/usr/bin/env node
/**
 * Runs ESLint with the brace-expansion shim applied first so legacy consumers
 * of minimatch continue working even when pnpm resolves newer ESM builds.
 */
require('./brace-expansion-shim.cjs');

const hasExplicitPath = process.argv.slice(2).some((arg) => !arg.startsWith('-'));
if (!hasExplicitPath) {
	process.argv.splice(2, 0, '.');
}

const hasExtFlag = process.argv.slice(2).some((arg) => arg === '--ext');
if (!hasExtFlag) {
	process.argv.splice(3, 0, '--ext', '.ts,.js,.svelte');
}

require(require.resolve('eslint/bin/eslint.js'));

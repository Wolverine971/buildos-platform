#!/usr/bin/env node
/**
 * Runs ESLint with the brace-expansion shim applied first so legacy consumers
 * of minimatch continue working even when pnpm resolves newer ESM builds.
 *
 * Updated for ESLint 9 flat config which no longer exports bin/eslint.js
 */
require('./brace-expansion-shim.cjs');

const { spawn } = require('child_process');
const path = require('path');

// Build eslint args
const args = process.argv.slice(2);

// Add default path if not provided
const hasExplicitPath = args.some((arg) => !arg.startsWith('-'));
if (!hasExplicitPath) {
	args.unshift('.');
}

// ESLint 9 flat config doesn't use --ext, it uses glob patterns in config
// The extensions are now handled in eslint.config.js

// Find eslint binary in node_modules
const eslintBin = path.join(__dirname, '..', 'node_modules', '.bin', 'eslint');

const child = spawn(eslintBin, args, {
	stdio: 'inherit',
	shell: process.platform === 'win32'
});

child.on('close', (code) => {
	process.exit(code);
});

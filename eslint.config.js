// eslint.config.js
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import js from '@eslint/js';

/** ⚠ BREAKING: the meta‑package “typescript-eslint” is being removed.
 *  Switch to the explicit packages to stay on the stable channel. */
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

// Re‑use your gitignore helper
import { includeIgnoreFile } from '@eslint/compat';
import { fileURLToPath } from 'node:url';
import svelteConfig from './svelte.config.js';

const gitignore = fileURLToPath(new URL('./.gitignore', import.meta.url));

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
	includeIgnoreFile(gitignore),

	/* ---------- JavaScript / TypeScript ---------- */
	{
		files: ['**/*.{js,ts}'],
		languageOptions: { parser: tsParser },
		plugins: { '@typescript-eslint': tsPlugin },
		rules: {
			...js.configs.recommended.rules,
			...tsPlugin.configs.recommended.rules,
			// your custom tweaks
			'no-undef': 'off'
		}
	},

	/* ---------- Svelte ---------- */
	{
		files: ['**/*.svelte'],
		plugins: { svelte },
		languageOptions: {
			parser: svelte.parser,
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: tsParser,
				svelteConfig
			},
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			...svelte.configs.recommended.rules
		}
	},

	/* ---------- Prettier last ---------- */
	prettier
];

// apps/web/eslint.config.js
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import js from '@eslint/js';

/** ⚠ BREAKING: the meta‑package "typescript-eslint" is being removed.
 *  Switch to the explicit packages to stay on the stable channel. */
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import svelteParser from 'svelte-eslint-parser';

// Re‑use your gitignore helper
import { includeIgnoreFile } from '@eslint/compat';
import { fileURLToPath } from 'node:url';

const gitignore = fileURLToPath(new URL('./.gitignore', import.meta.url));

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
	includeIgnoreFile(gitignore),

	/* ---------- Global ignores ---------- */
	{
		ignores: [
			'scripts/**',
			'**/archive/**',
			'node_modules/**',
			'.svelte-kit/**',
			'build/**',
			'dist/**',
			// Files with @html JSON-LD that cause parser false positives
			'**/SEOHead.svelte',
			'**/src/routes/+page.svelte',
			'**/blogs/+page.svelte',
			'**/blogs/*/+page.svelte'
		]
	},

	/* ---------- JavaScript / TypeScript ---------- */
	{
		files: ['**/*.{js,ts}'],
		languageOptions: {
			parser: tsParser,
			globals: { ...globals.browser, ...globals.node }
		},
		plugins: { '@typescript-eslint': tsPlugin },
		rules: {
			...js.configs.recommended.rules,
			...tsPlugin.configs.recommended.rules,
			// your custom tweaks
			'no-undef': 'off',
			// Disable explicit-any rule (codebase uses any extensively)
			'@typescript-eslint/no-explicit-any': 'off',
			// Allow require() imports in scripts
			'@typescript-eslint/no-require-imports': 'off',
			// Allow @ts- comments
			'@typescript-eslint/ban-ts-comment': 'off',
			// Allow let/const in case blocks
			'no-case-declarations': 'off',
			// Allow empty interfaces
			'@typescript-eslint/no-empty-object-type': 'off',
			// Disable strict rules that have many legitimate exceptions
			'no-duplicate-case': 'off',
			'no-useless-escape': 'off',
			'no-constant-binary-expression': 'off',
			'no-control-regex': 'off',
			'require-yield': 'off',
			'no-unsafe-finally': 'off',
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/no-unsafe-function-type': 'off',
			// Allow underscore-prefixed unused variables (intentionally unused)
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			]
		}
	},

	/* ---------- Svelte with TypeScript ---------- */
	{
		files: ['**/*.svelte'],
		plugins: { svelte, '@typescript-eslint': tsPlugin },
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: tsParser,
				extraFileExtensions: ['.svelte']
			},
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			...svelte.configs.recommended.rules,
			// Disable explicit-any rule (codebase uses any extensively)
			'@typescript-eslint/no-explicit-any': 'off',
			// Allow @ts- comments
			'@typescript-eslint/ban-ts-comment': 'off',
			// Allow let/const in case blocks
			'no-case-declarations': 'off',
			// Disable strict rules
			'no-duplicate-case': 'off',
			'no-useless-escape': 'off',
			'no-constant-binary-expression': 'off',
			'no-control-regex': 'off',
			'require-yield': 'off',
			'no-unsafe-finally': 'off',
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/no-unsafe-function-type': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			// Apply TypeScript rules to Svelte files
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			// Disable rules that conflict with Svelte/TypeScript
			'no-undef': 'off'
		}
	},

	/* ---------- Prettier last ---------- */
	prettier
];

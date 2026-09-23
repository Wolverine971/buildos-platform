// apps/worker/eslint.config.mjs
import globals from 'globals';
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
	/* ---------- Global ignores ---------- */
	{
		ignores: [
			'dist/',
			'build/',
			'node_modules/',
			'coverage/',
			'*.d.ts',
			'*.js.map',
			'*.tsbuildinfo',
			'.env*',
			'*.log',
			'logs/',
			'migrations/**/*.sql',
			'.vscode/',
			'.idea/',
			'junit.xml',
			'*.tmp',
			'*.temp',
			'src/lib/database.types.ts'
		]
	},

	/* ---------- TypeScript ---------- */
	{
		files: ['**/*.{js,ts}'],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: 'module',
			parserOptions: {
				project: './tsconfig.json'
			},
			globals: {
				...globals.node,
				...globals.es2022,
				NodeJS: 'readonly'
			}
		},
		plugins: { '@typescript-eslint': tsPlugin },
		rules: {
			...js.configs.recommended.rules,

			// Error Prevention
			'no-console': 'off',
			'no-unused-vars': 'off',
			'no-redeclare': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/no-redeclare': 'error',
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/explicit-function-return-type': 'off',

			// Code Quality
			'@typescript-eslint/no-var-requires': 'error',
			'@typescript-eslint/prefer-optional-chain': 'warn',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',

			// Style - Let Prettier handle formatting
			indent: 'off',
			quotes: 'off',
			semi: 'off',
			'object-curly-spacing': 'off',
			'array-bracket-spacing': 'off',

			// Best Practices
			eqeqeq: ['error', 'always'],
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-wrappers': 'error',
			'no-throw-literal': 'error',
			'prefer-promise-reject-errors': 'error',
			'no-return-await': 'error',

			// Async/Promise handling
			'no-async-promise-executor': 'error',
			'require-await': 'warn',

			// Import organization
			'sort-imports': [
				'warn',
				{
					ignoreCase: false,
					ignoreDeclarationSort: true,
					ignoreMemberSort: false,
					memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single']
				}
			]
		}
	},

	/* Prompt examples intentionally keep escaped JSON snippets readable in source. */
	{
		files: [
			'src/workers/homework/**/*.ts',
			'src/workers/homework/*.ts',
			'src/workers/ontology/ontologyClassifier.ts'
		],
		rules: {
			'no-useless-escape': 'off'
		}
	},

	/* ---------- Agentic chat folder boundaries ---------- */
	// See src/workers/agentic-chat/README.md ("Folder map"). host/ is the
	// composition root: only the process entrypoints import it.
	{
		files: ['src/workers/agentic-chat/**/*.ts'],
		ignores: ['src/workers/agentic-chat/host/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['**/agentic-chat/host/*', '../host/*', '../../host/*'],
							message:
								'Only the chat entrypoints and host/ import host/; pass what you need in from the composition root.'
						}
					]
				}
			]
		}
	},
	// Model passes never reach delivery or the process layer directly.
	{
		files: ['src/workers/agentic-chat/provider/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['../host/*', '../../host/*', '../stream/*', '../../stream/*'],
							message:
								'provider/ must not import host/ or stream/; depend on a port in provider/contracts.ts.'
						},
						{
							group: ['../workflow/*', '../../workflow/*'],
							message: 'provider/ must not import workflow/.'
						}
					]
				}
			]
		}
	},
	// shared/ is a leaf: small host-neutral helpers with no folder dependencies.
	{
		files: ['src/workers/agentic-chat/shared/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['../*'],
							message: 'shared/ must not import other agentic-chat folders.'
						}
					]
				}
			]
		}
	},

	/* ---------- Test files ---------- */
	// tsconfig.json excludes co-located *.test.ts (kept out of dist), and giving
	// them tsconfig.tests.json as a second type-aware project doubled lint memory
	// and OOMed CI. They lint syntactically; typecheck:tests owns their types.
	{
		files: ['**/*.test.ts', '**/*.spec.ts'],
		languageOptions: {
			parserOptions: { project: null }
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/prefer-optional-chain': 'off'
		}
	},

	/* ---------- Config files ---------- */
	{
		files: ['*.config.js', '*.config.ts'],
		rules: {
			'@typescript-eslint/no-var-requires': 'off'
		}
	}
];

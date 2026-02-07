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
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_'
				}
			],
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

	/* ---------- Test files ---------- */
	{
		files: ['**/*.test.ts', '**/*.spec.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off'
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

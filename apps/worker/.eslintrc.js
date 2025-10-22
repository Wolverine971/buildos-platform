// apps/worker/.eslintrc.js
// This addresses Configuration Issue #8 in QUEUE_FIXES_DESIGN.md

module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	extends: ['eslint:recommended'],
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: 'module',
		project: './tsconfig.json',
		tsconfigRootDir: __dirname
	},
	env: {
		node: true,
		es2022: true
	},
	globals: {
		NodeJS: 'readonly'
	},
	rules: {
		// Error Prevention
		'no-console': 'off', // Allow console in worker/server code
		'no-unused-vars': 'off', // Let TypeScript handle this
		'@typescript-eslint/no-unused-vars': [
			'error',
			{
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_'
			}
		],
		'@typescript-eslint/no-explicit-any': 'warn', // Warn but don't error on any
		'@typescript-eslint/explicit-function-return-type': 'off',

		// Code Quality
		'@typescript-eslint/no-var-requires': 'error',
		'@typescript-eslint/prefer-optional-chain': 'warn',
		'@typescript-eslint/prefer-nullish-coalescing': 'off', // Too noisy for migration

		// Style - Let Prettier handle formatting
		indent: 'off', // Let Prettier handle indentation
		quotes: 'off', // Let Prettier handle quotes
		semi: 'off', // Let Prettier handle semicolons
		'comma-trailing': 'off', // Let Prettier handle this
		'object-curly-spacing': 'off', // Let Prettier handle spacing
		'array-bracket-spacing': 'off', // Let Prettier handle spacing

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
				ignoreDeclarationSort: true, // Let import/order handle this
				ignoreMemberSort: false,
				memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single']
			}
		]
	},
	overrides: [
		{
			// Test files
			files: ['**/*.test.ts', '**/*.spec.ts'],
			env: {
				jest: true
			},
			rules: {
				'@typescript-eslint/no-explicit-any': 'off',
				'@typescript-eslint/no-non-null-assertion': 'off'
			}
		},
		{
			// Migration files
			files: ['migrations/**/*.sql'],
			parser: null,
			rules: {}
		},
		{
			// Config files
			files: ['*.config.js', '*.config.ts'],
			rules: {
				'@typescript-eslint/no-var-requires': 'off'
			}
		}
	],
	ignorePatterns: [
		'dist/',
		'node_modules/',
		'*.js.map',
		'coverage/',
		'.env*',
		'*.sql',
		'src/lib/database.types.ts' // Generated file
	]
};

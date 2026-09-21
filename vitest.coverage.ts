// vitest.coverage.ts
export const coverageExclude = [
	'**/node_modules/**',
	'**/dist/**',
	'**/build/**',
	'**/.svelte-kit/**',
	'**/coverage/**',
	'**/.{idea,git,cache,output,temp}/**',
	'**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
	'**/*.{test,spec}.{js,ts}',
	'**/*.d.ts'
];

export function coverageConfig(include: string[]) {
	return {
		provider: 'v8' as const,
		reporter: ['text-summary', 'json-summary', 'lcov', 'html'] as Array<
			'text-summary' | 'json-summary' | 'lcov' | 'html'
		>,
		reportsDirectory: './coverage',
		// `coverage.all` was removed in Vitest 4. Coverage now reports only
		// loaded files unless `include` is set explicitly - which it is, by
		// every caller of this helper.
		include,
		exclude: coverageExclude
	};
}

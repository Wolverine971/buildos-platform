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
		reporter: ['text-summary', 'json-summary', 'lcov', 'html'] as const,
		reportsDirectory: './coverage',
		all: true,
		include,
		exclude: coverageExclude
	};
}

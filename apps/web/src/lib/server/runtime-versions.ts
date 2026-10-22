// apps/web/src/lib/server/runtime-versions.ts
// One line per server instance start so Vercel runtime logs show the exact Node
// patch our functions run. Vercel only exposes the major (nodejs22.x) in
// settings, and the build's `node -v` is a different runtime. Version metadata only.

export function describeServerRuntimeVersions(
	versions: Partial<NodeJS.ProcessVersions> = process.versions
): string {
	return [
		'[runtime] web',
		`node=v${versions.node ?? 'unknown'}`,
		`brotli=${versions.brotli ?? 'n/a'}`,
		`undici=${versions.undici ?? 'n/a'}`,
		`openssl=${versions.openssl ?? 'n/a'}`
	].join(' ');
}

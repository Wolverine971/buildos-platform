// apps/worker/src/lib/runtimeVersions.ts
// One startup line per process so deploy logs show exactly which Node each
// replica runs. Builder metadata only proves the image; this proves the process.
// Version metadata only: the one environment value read is Railway's replica ID.

export function describeRuntimeVersions(
	service: string,
	versions: Partial<NodeJS.ProcessVersions> = process.versions,
	replicaId: string | undefined = process.env.RAILWAY_REPLICA_ID
): string {
	return [
		`[runtime] ${service}`,
		`node=v${versions.node ?? 'unknown'}`,
		`brotli=${versions.brotli ?? 'n/a'}`,
		`undici=${versions.undici ?? 'n/a'}`,
		`openssl=${versions.openssl ?? 'n/a'}`,
		`replica=${replicaId?.trim() || 'n/a'}`
	].join(' ');
}

export function logRuntimeVersions(service: string): void {
	console.log(describeRuntimeVersions(service));
}

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

// Node floor for CVE-2026-111497 (zlib Brotli decode). Keep in step with
// "engines" in apps/worker/package.json and the root package.json.
// Railway service variables can override the engines floor, so each worker
// also refuses to start below it.
const SAFE_NODE_FLOOR: Record<number, [number, number, number]> = {
	22: [22, 23, 4],
	24: [24, 22, 1],
	26: [26, 12, 1]
};
const NEWEST_FLOOR_MAJOR = 26;

function parseNodeVersion(version: string | undefined): [number, number, number] | null {
	const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version?.trim() ?? '');
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function atLeast(a: [number, number, number], b: [number, number, number]): boolean {
	for (let i = 0; i < 3; i += 1) {
		if (a[i] !== b[i]) return a[i]! > b[i]!;
	}
	return true;
}

/** Null when the Node version is at or above the safe floor; otherwise why not. */
export function unsafeNodeRuntimeReason(nodeVersion: string | undefined): string | null {
	const parsed = parseNodeVersion(nodeVersion);
	if (!parsed) return `unrecognised Node version "${nodeVersion ?? 'unknown'}"`;
	const [major] = parsed;
	if (major > NEWEST_FLOOR_MAJOR) return null;
	const floor = SAFE_NODE_FLOOR[major];
	if (!floor) {
		return `Node v${parsed.join('.')} is not a supported line (need >=22.23.4 <23, >=24.22.1 <25 or >=26.12.1)`;
	}
	if (!atLeast(parsed, floor)) {
		return `Node v${parsed.join('.')} is below the safe floor v${floor.join('.')}`;
	}
	return null;
}

/** Log runtime versions, then exit non-zero when Node is below the safe floor. */
export function enforceSafeNodeRuntime(
	service: string,
	nodeVersion: string | undefined = process.versions.node,
	exit: (code: number) => never = (code) => process.exit(code)
): void {
	const reason = unsafeNodeRuntimeReason(nodeVersion);
	if (!reason) return;
	console.error(
		`[runtime] ${service} refusing to start: ${reason}. Raise RAILPACK_NODE_VERSION (or remove it) on this Railway service.`
	);
	exit(1);
}

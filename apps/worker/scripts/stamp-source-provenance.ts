// apps/worker/scripts/stamp-source-provenance.ts
import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	readDeploymentProvenance,
	readSourceProvenance,
	type SourceProvenance
} from '../../../packages/agentic-chat-runtime/src/provenance';

const target = resolve(__dirname, '../dist/source-provenance.json');
let provenance: SourceProvenance | null;
try {
	provenance = readSourceProvenance();
} catch {
	provenance = readDeploymentProvenance();
}
if (provenance) {
	writeFileSync(target, JSON.stringify(provenance) + '\n');
} else {
	// Railway build steps see neither .git nor the deployment SHA. Never fail the
	// deploy for it, and never leave a stale stamp: the runtime resolves the SHA.
	rmSync(target, { force: true });
	console.warn('source-provenance: no Git or SOURCE_REVISION at build; resolved at runtime');
}

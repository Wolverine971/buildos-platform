// apps/worker/src/lib/sourceProvenance.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	readDeploymentProvenance,
	readSourceProvenance,
	type SourceProvenance
} from '@buildos/agentic-chat-runtime/provenance';

// Capture once, before the service starts. A health request must never hash a
// newer checkout and mislabel an older process that still has modules loaded.
export const workerSourceProvenance: SourceProvenance | null = capture();
function capture(): SourceProvenance | null {
	try {
		if (process.env.NODE_ENV !== 'production') return readSourceProvenance();
		return JSON.parse(readFileSync(resolve(__dirname, '../source-provenance.json'), 'utf8'));
	} catch {
		// Railway builds cannot stamp; the deployed SHA is only visible at runtime.
		// Unknown stays null: visible, and cannot pass the battery preflight.
		return readDeploymentProvenance();
	}
}

// apps/worker/src/lib/sourceProvenance.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
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
		return null; // Unknown is visible and cannot pass the battery preflight.
	}
}

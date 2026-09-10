// apps/worker/scripts/stamp-source-provenance.ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSourceProvenance } from '../../../packages/agentic-chat-runtime/src/provenance';
let provenance;
try {
	provenance = readSourceProvenance();
} catch {
	// Railway source archives omit .git. Their deployment revision identifies
	// the immutable clean checkout; never use a package version as a revision.
	const gitSha = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.SOURCE_REVISION;
	if (!gitSha || !/^[a-f0-9]{40}$/.test(gitSha))
		throw new Error('Build requires Git or an exact SOURCE_REVISION');
	provenance = {
		version: 1,
		gitSha,
		dirtyTreeSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
	};
}
writeFileSync(
	resolve(__dirname, '../dist/source-provenance.json'),
	JSON.stringify(provenance) + '\n'
);

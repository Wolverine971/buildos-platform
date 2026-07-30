// packages/agent-orchestrator/src/testing/harness/open-brief-corpus.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	buildOpenBriefCorpusCells,
	inspectOpenBriefCorpusReadiness,
	OpenBriefCorpusSchema
} from './open-brief-corpus';
import { OpenBriefSnapshotSchema } from './open-brief-eval';

function readJson(relativePath: string): unknown {
	return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'));
}

const docsRoot = '../../../../../docs/architecture/agent-first-orchestration/';

describe('open-brief corpus contract', () => {
	const corpus = OpenBriefCorpusSchema.parse(readJson(`${docsRoot}corpus/open-brief-v1.json`));

	it('parses the real pending corpus and both intentionally different snapshot shapes', () => {
		expect(corpus.briefs).toHaveLength(5);
		const alpha = OpenBriefSnapshotSchema.parse(
			readJson(`${docsRoot}corpus/fixtures/project-alpha.snapshot.json`)
		);
		const beta = OpenBriefSnapshotSchema.parse(
			readJson(`${docsRoot}corpus/fixtures/project-beta.snapshot.json`)
		);
		expect(alpha.snapshot_id).toBe('phase-a-project-alpha-v1');
		expect(beta.snapshot_id).toBe('open-brief-project-beta-v1');
	});

	it('blocks scoring while DJ-owned text, labels, and the blocked snapshot remain pending', () => {
		const readiness = inspectOpenBriefCorpusReadiness(corpus);
		expect(readiness.scoringReady).toBe(false);
		expect(readiness.pendingBriefIds).toContain('ob-05-underspecified');
		expect(readiness.unconfirmedLabelBriefIds).toHaveLength(5);
		expect(() => buildOpenBriefCorpusCells(corpus)).toThrow('not score-ready');
	});

	it('builds brief × snapshot cells only after every scoring input is confirmed', () => {
		const ready = structuredClone(corpus);
		ready.pending_from_dj = [];
		ready.status = 'ready_for_cohort_1';
		for (const brief of ready.briefs) brief.clarification_label.status = 'dj_confirmed';
		const blocked = ready.briefs.find((brief) => brief.brief_id === 'ob-05-underspecified')!;
		blocked.text = 'go figure out the direction for this project';
		blocked.applicable_snapshots = ['project-beta-no-direction'];

		const cells = buildOpenBriefCorpusCells(ready);
		expect(cells).toHaveLength(8);
		expect(cells.find((cell) => cell.briefId === 'ob-05-underspecified')).toMatchObject({
			snapshotId: 'project-beta-no-direction',
			clarificationLabel: 'blocked'
		});
	});
});

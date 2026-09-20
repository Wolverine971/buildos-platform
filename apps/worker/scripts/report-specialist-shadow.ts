// apps/worker/scripts/report-specialist-shadow.ts
// Local files only; never reads credentials, connects to a database, or makes model calls.
import { readFileSync } from 'node:fs';
import type { AgenticChatPreparedWorkflowContextV1 } from '@buildos/shared-types';
import {
	buildSpecialistShadowInput,
	interpretSpecialistShadow,
	selectionHash,
	SPECIALIST_SHADOW_POLICY
} from '../src/workers/agentic-chat/workflow/specialist-selection-policy';
import {
	renderSpecialistShadowReport,
	type SpecialistShadowRow
} from '../src/workers/agentic-chat/workflow/specialist-selection-report';

function demo(): SpecialistShadowRow[] {
	const input = buildSpecialistShadowInput({
		question: 'Read my documents and suggest an organization.',
		specialistWorkflowsEnabled: true,
		documentReadToolsEnabled: true,
		context: {
			contextId: '00000000-0000-4000-8000-000000000001',
			contextHash: 'a'.repeat(64),
			payload: {
				data: { project: { name: 'Sample workshop' }, documents: [{ id: 'example' }] }
			}
		} as unknown as AgenticChatPreparedWorkflowContextV1
	});
	return [
		{ generalist: 0.05, project_review: 0.05, document_inventory: 0.1, document_read: 0.8 },
		{ generalist: 0.24, project_review: 0.24, document_inventory: 0.24, document_read: 0.28 },
		null
	].map((probabilities, index) => {
		const result = probabilities
			? interpretSpecialistShadow(input, {
					ok: true,
					answers: {
						bundle: {
							type: 'choice',
							choice: 'document_read',
							confidence: 0.9,
							probabilities
						}
					},
					receipt: {
						modelRequested: SPECIALIST_SHADOW_POLICY.model,
						modelUsed: null,
						requestId: null,
						inputTokens: null,
						outputTokens: null,
						costUsd: null,
						durationMs: 0,
						requestBytes: 0,
						questionCount: 1,
						attempts: 0
					},
					rawResponse: null
				})
			: null;
		return {
			turn_run_id: `SCRIPTED-example-${index + 1}`,
			input,
			input_hash: selectionHash(input),
			result,
			result_hash: result ? selectionHash(result) : null
		};
	});
}
const args = process.argv.slice(2);
try {
	let rows: SpecialistShadowRow[];
	if (args.length === 1 && args[0] === '--demo') {
		process.stdout.write(
			'> SCRIPTED DEMO — no Jev call, no measured latency/cost, no selection-quality evidence.\n\n'
		);
		rows = demo();
	} else if (args.length === 2 && args[0] === '--file') {
		const text = readFileSync(args[1]!, 'utf8');
		if (Buffer.byteLength(text) > 24_000_000) throw new Error('Export exceeds 24 MB');
		const parsed: unknown = JSON.parse(text);
		if (!Array.isArray(parsed)) throw new Error('Expected an array of exported receipts');
		rows = parsed;
	} else throw new Error('Usage: specialists:shadow-report --demo | --file receipts.json');
	process.stdout.write(renderSpecialistShadowReport(rows));
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : 'Invalid receipt export'}\n`);
	process.exitCode = 1;
}

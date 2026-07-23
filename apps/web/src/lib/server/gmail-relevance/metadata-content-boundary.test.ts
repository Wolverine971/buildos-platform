// apps/web/src/lib/server/gmail-relevance/metadata-content-boundary.test.ts
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

async function source(moduleName: string): Promise<string> {
	return readFile(fileURLToPath(new URL(`./${moduleName}`, import.meta.url)), 'utf8');
}

describe('Slice 3 metadata content boundary', () => {
	it('keeps the provider gateway metadata-only and mutation-free', async () => {
		const gateway = await source('metadata-gateway.ts');
		expect(gateway).toContain("format: 'metadata'");
		expect(gateway).toContain("fields: 'messages(id,threadId),nextPageToken'");
		expect(gateway).toContain(
			"fields: 'id,threadId,internalDate,labelIds,snippet,payload/headers'"
		);
		expect(gateway).not.toMatch(/format\s*:\s*['"](?:full|raw)['"]/i);
		expect(gateway).not.toMatch(/payload\/(?:body|parts)|attachmentId|users\.watch/i);
		expect(gateway).not.toMatch(/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
		const imports = [...gateway.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
		expect(imports.join(' ')).not.toMatch(
			/gmail-read-gateway|^googleapis$|openrouter|openai|embedding/i
		);
	});

	it('has no logger, analytics, model, queue, or project-mutation import path', async () => {
		for (const moduleName of [
			'metadata-normalizer.ts',
			'metadata-scorer.ts',
			'metadata-crypto.ts',
			'metadata-gateway.ts',
			'metadata-driver.ts'
		]) {
			const moduleSource = await source(moduleName);
			expect(moduleSource, moduleName).not.toMatch(
				/console\.|logger|posthog|analytics|queue_jobs|add_queue_job|smart-llm|openrouter|openai|embedding/i
			);
		}
	});

	it('does not make restricted request-lifetime fields part of settlement types', async () => {
		const controlPlane = await source('scan-control-plane.ts');
		const settlementType = controlPlane.slice(
			controlPlane.indexOf('export type EmailRelevanceMetadataSettlementInput'),
			controlPlane.indexOf('export type EmailRelevanceScanSettlementResult')
		);
		expect(settlementType).not.toMatch(
			/(?:subject|snippet|participant|provider_message_id|provider_thread_id|header|label_id|query|cursor)/i
		);
	});
});

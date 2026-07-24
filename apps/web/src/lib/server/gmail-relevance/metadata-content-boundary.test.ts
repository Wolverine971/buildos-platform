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

	it('keeps the manual invocation path one-operation, form-action-only, and queue/model free', async () => {
		const manualPilot = await source('manual-pilot.ts');
		const actionRoute = await readFile(
			fileURLToPath(
				new URL(
					'../../../routes/admin/gmail-relevance/pilot/+page.server.ts',
					import.meta.url
				)
			),
			'utf8'
		);
		expect(manualPilot).toContain("driver.runOneOperation(parsed.data)");
		expect(manualPilot).not.toMatch(
			/queue_jobs|add_queue_job|setInterval|setTimeout|users\.watch|pubsub|smart-llm|openrouter|openai|embedding/i
		);
		expect(actionRoute).toContain('runOne: async');
		expect(actionRoute).not.toContain('while (');
		expect(actionRoute).not.toContain('for (;;)');
		for (const forbiddenField of [
			'provider_message_id',
			'provider_thread_id',
			'page_token',
			'gmail_query',
			'subject',
			'snippet',
			'metadata'
		]) {
			expect(actionRoute).not.toContain(`form.get('${forbiddenField}')`);
			expect(actionRoute).not.toContain(`form.getAll('${forbiddenField}')`);
		}
	});
});

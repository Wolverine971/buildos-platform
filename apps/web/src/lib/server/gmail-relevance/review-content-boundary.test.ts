import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

async function read(relativeUrl: string): Promise<string> {
	return readFile(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8');
}

describe('Slice 4 review content boundary', () => {
	it('keeps review request-lifetime, model-free, mutation-free, and scan-control-free', async () => {
		const service = await read('./review-evaluation.ts');
		const route = await read('../../../routes/admin/gmail-relevance/review/+page.server.ts');
		for (const source of [service, route]) {
			expect(source).not.toMatch(
				/queue_jobs|add_queue_job|users\.watch|pubsub|smart-llm|openrouter|openai|embedding|createTask|createEvent/i
			);
		}
		expect(service).toContain('getMetadataBatch');
		expect(service).not.toMatch(/\.from\(['"](?:emails|gmail_messages|message_bodies)['"]\)/i);
		expect(route).not.toMatch(/createOrResumeRun|runOneOperation|controlRun/);
	});

	it('accepts no mailbox content or user identity in review form fields', async () => {
		const route = await read('../../../routes/admin/gmail-relevance/review/+page.server.ts');
		for (const forbiddenField of [
			'user_id',
			'connection_id',
			'provider_message_id',
			'provider_thread_id',
			'subject',
			'snippet',
			'participant_addresses',
			'body',
			'attachment'
		]) {
			expect(route).not.toContain(`oneString(form, '${forbiddenField}')`);
		}
	});

	it('keeps durable review tables free of mailbox content and free-form text', async () => {
		const migration = await read(
			'../../../../../../supabase/migrations/20260724020000_gmail_relevance_review_evaluation.sql'
		);
		const tableSection = migration.slice(
			migration.indexOf('CREATE TABLE public.email_relevance_review_samples'),
			migration.indexOf(
				'CREATE OR REPLACE FUNCTION public.prepare_email_relevance_review_sample'
			)
		);
		expect(tableSection).not.toMatch(
			/subject|snippet|participant|header|body|attachment|provider_message|provider_thread|free.form|reasoning/i
		);
		expect(tableSection).not.toMatch(/\btext\s+NOT NULL\s+(?!DEFAULT|CHECK)/i);
		expect(migration).toContain('BEFORE UPDATE ON public.email_relevance_adjudications');
		expect(migration).not.toContain(
			'BEFORE UPDATE OR DELETE ON public.email_relevance_adjudications'
		);
		expect(tableSection).not.toMatch(
			/corrected_project_id uuid REFERENCES public\.onto_projects/i
		);
	});
});

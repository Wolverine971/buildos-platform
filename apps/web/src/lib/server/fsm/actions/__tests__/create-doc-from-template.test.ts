// apps/web/src/lib/server/fsm/actions/__tests__/create-doc-from-template.test.ts
import { describe, expect, it } from 'vitest';
import {
	CreateDocEntityRow,
	generateDocumentContent
} from '$lib/server/fsm/actions/create-doc-from-template';

function makeEntity(overrides: Partial<CreateDocEntityRow> = {}): CreateDocEntityRow {
	return {
		id: 'entity-1',
		project_id: 'project-1',
		type_key: 'task.example',
		state_key: 'in_progress',
		props: {},
		...overrides
	};
}

describe('create_doc_from_template content generation', () => {
	it('generates campaign report content with metrics', async () => {
		const entity = makeEntity({
			props: {
				campaign_goal: 'Increase signups',
				start_date: '2025-01-01',
				end_date: '2025-01-31',
				performance_metrics: {
					impressions: 12000,
					clicks: 320,
					conversions: 54,
					roi: 127
				},
				channels: ['Email', 'Paid Ads'],
				budget: 5000
			}
		});

		const content = await generateDocumentContent('doc.campaign_report', entity, {
			entity_name: 'Product Launch Campaign',
			variables: {
				campaign_name: 'Winter Launch'
			}
		});

		expect(content).toContain('# Campaign Performance Report');
		expect(content).toContain('Winter Launch');
		expect(content).toContain('Increase signups');
		expect(content).toContain('127%');
	});

	it('generates project brief with default sections', async () => {
		const entity = makeEntity({
			props: {
				summary: 'Outline the go-to-market strategy.',
				stakeholders: ['Alice', 'Bob'],
				deliverables: ['Launch plan', 'Budget spreadsheet']
			},
			name: 'GTM Strategy'
		});

		const content = await generateDocumentContent('doc.brief', entity, {
			entity_name: 'GTM Strategy'
		});

		expect(content).toContain('# Project Brief');
		expect(content).toContain('GTM Strategy');
		expect(content).toContain('Launch plan');
		expect(content).toContain('Stakeholders');
	});

	it('falls back to default content for unknown templates', async () => {
		const entity = makeEntity({ name: 'Exploratory Work' });

		const content = await generateDocumentContent('doc.unknown', entity, {
			entity_name: 'Exploratory Work'
		});

		expect(content).toContain('# Exploratory Work');
		expect(content).toContain('doc.unknown');
	});

	it('renders research notes template with sources', async () => {
		const entity = makeEntity({ name: 'Research Task' });

		const content = await generateDocumentContent('doc.notes', entity, {
			entity_name: 'Customer Research',
			variables: {
				topic: 'Customer Research',
				summary: 'This document summarises interviews with key customers.',
				sources: [
					{
						title: 'Interview with Alice',
						uri: 'https://example.com/alice',
						notes: 'Focus on onboarding friction.'
					},
					{ title: 'Interview with Bob', uri: null, notes: null }
				]
			}
		});

		expect(content).toContain('Research Notes: Customer Research');
		expect(content).toContain('Interview with Alice');
		expect(content).toContain('https://example.com/alice');
		expect(content).toContain('onboarding friction');
		expect(content).toContain('Source 2');
	});
});

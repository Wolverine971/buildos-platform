// apps/web/scripts/generate-adr-index.ts

/**
 * Generate Architecture Decision Records (ADRs) index and templates
 * Manages decision documentation for BuildOS architecture choices
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';

interface ADR {
	number: number;
	title: string;
	status: 'Proposed' | 'Accepted' | 'Deprecated' | 'Superseded';
	date: string;
	context: string;
	decision: string;
	consequences: string;
	filePath: string;
}

class ADRGenerator {
	private readonly adrDir = 'docs/technical/architecture/decisions';
	private readonly adrs: ADR[] = [];

	async generate(): Promise<void> {
		console.log('📋 Scanning existing ADRs...');
		await this.ensureADRDirectory();
		await this.scanExistingADRs();
		await this.createDefaultADRs();

		console.log('📝 Generating ADR index...');
		await this.generateADRIndex();
		await this.generateADRTemplate();

		console.log(`✅ Generated ADR documentation (${this.adrs.length} records)`);
	}

	private async ensureADRDirectory(): Promise<void> {
		if (!existsSync(this.adrDir)) {
			await mkdir(this.adrDir, { recursive: true });
		}
	}

	private async scanExistingADRs(): Promise<void> {
		if (!existsSync(this.adrDir)) return;

		const files = await readdir(this.adrDir);
		const adrFiles = files.filter((f) => f.match(/^ADR-\d{3}-.*\.md$/));

		for (const file of adrFiles) {
			const filePath = join(this.adrDir, file);
			const content = await readFile(filePath, 'utf-8');
			const adr = this.parseADR(content, filePath);
			if (adr) {
				this.adrs.push(adr);
			}
		}

		// Sort by number
		this.adrs.sort((a, b) => a.number - b.number);
	}

	private parseADR(content: string, filePath: string): ADR | null {
		// Extract ADR number from filename
		const filename = basename(filePath);
		const numberMatch = filename.match(/^ADR-(\d{3})/);
		if (!numberMatch) return null;

		const number = parseInt(numberMatch[1]);

		// Extract title from first heading
		const titleMatch = content.match(/^#\s+(.+)$/m);
		const title = titleMatch ? titleMatch[1].replace(`ADR-${numberMatch[1]}: `, '') : 'Unknown';

		// Extract status
		const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);
		const status = (statusMatch ? statusMatch[1] : 'Proposed') as ADR['status'];

		// Extract date
		const dateMatch = content.match(/\*\*Date:\*\*\s*([\d-]+)/);
		const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

		// Extract sections
		const context = this.extractSection(content, 'Context') || 'No context provided';
		const decision = this.extractSection(content, 'Decision') || 'No decision documented';
		const consequences =
			this.extractSection(content, 'Consequences') || 'No consequences documented';

		return {
			number,
			title,
			status,
			date,
			context,
			decision,
			consequences,
			filePath
		};
	}

	private extractSection(content: string, sectionName: string): string | null {
		const regex = new RegExp(`##\\s+${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
		const match = content.match(regex);
		return match ? match[1].trim() : null;
	}

	private async createDefaultADRs(): Promise<void> {
		const defaultADRs = [
			{
				number: 1,
				title: 'Use Supabase for Backend Services',
				context:
					'BuildOS needs a scalable backend for user management, database, and real-time features. We considered custom Node.js backend, Firebase, and Supabase.',
				decision:
					'We will use Supabase as our primary backend service. It provides PostgreSQL database, authentication, real-time subscriptions, and row-level security.',
				consequences:
					'Positive: Rapid development, built-in auth, real-time features, SQL familiarity. Negative: Vendor lock-in, less control over infrastructure.'
			},
			{
				number: 2,
				title: 'Implement Dual-Processing for Brain Dumps',
				context:
					'Initial brain dump processing was inconsistent in extracting both project context and actionable tasks. Single-stage processing often missed nuanced requirements.',
				decision:
					'Implement a two-stage processing system: Stage 1 extracts overall context and project intent, Stage 2 extracts specific tasks and actions based on the context.',
				consequences:
					'Positive: Higher accuracy, better task extraction, clearer project context. Negative: Increased processing time, higher OpenAI API costs.'
			},
			{
				number: 3,
				title: 'Use Project-Specific Google Calendars',
				context:
					'Users wanted to segregate tasks by project in their calendar systems. Single calendar integration was insufficient for project organization.',
				decision:
					'Each project can optionally have its own Google Calendar. Tasks are scheduled to project-specific calendars when enabled.',
				consequences:
					'Positive: Better organization, project isolation, user control. Negative: Increased complexity, more calendar management overhead.'
			},
			{
				number: 4,
				title: 'Adopt Svelte 5 with Runes',
				context:
					'BuildOS was built with Svelte 4. Svelte 5 introduced runes for better state management and improved developer experience.',
				decision:
					'Migrate to Svelte 5 and adopt the new runes syntax ($state, $derived, $effect, $props) for all new components.',
				consequences:
					'Positive: Better state management, improved performance, future-proofing. Negative: Migration effort, learning curve, potential breaking changes.'
			},
			{
				number: 5,
				title: 'Use OpenAI GPT-4 for AI Processing',
				context:
					'Brain dump processing requires sophisticated natural language understanding. We evaluated OpenAI GPT-4, Claude, and local models.',
				decision:
					'Use OpenAI GPT-4 as the primary AI model for brain dump processing, with fallback to GPT-3.5 for cost optimization.',
				consequences:
					'Positive: Best-in-class understanding, reliable API, good documentation. Negative: API costs, external dependency, rate limits.'
			}
		];

		for (const adrData of defaultADRs) {
			const filename = `ADR-${adrData.number.toString().padStart(3, '0')}-${adrData.title
				.toLowerCase()
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '')}.md`;
			const filePath = join(this.adrDir, filename);

			if (!existsSync(filePath)) {
				const content = this.generateADRContent(adrData);
				await writeFile(filePath, content);

				// Add to our collection
				this.adrs.push({
					...adrData,
					status: 'Accepted',
					date: '2024-09-26',
					filePath
				});
			}
		}
	}

	private generateADRContent(adr: {
		number: number;
		title: string;
		context: string;
		decision: string;
		consequences: string;
	}): string {
		return `# ADR-${adr.number.toString().padStart(3, '0')}: ${adr.title}

**Status:** Accepted
**Date:** 2024-09-26
**Deciders:** BuildOS Architecture Team

## Context

${adr.context}

## Decision

${adr.decision}

## Consequences

${adr.consequences}

## Related ADRs

- None

## Implementation Notes

Implementation details and progress should be tracked in GitHub issues.

---

*This ADR follows the format described in [Documenting Architecture Decisions](http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions) by Michael Nygard.*
`;
	}

	private async generateADRIndex(): Promise<void> {
		const content = `# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for BuildOS. ADRs document the architectural decisions made for this project, including the context, the decision itself, and the consequences.

## ADR Format

Each ADR follows a standard format:

- **Status**: Proposed, Accepted, Deprecated, or Superseded
- **Date**: When the decision was made
- **Context**: The situation that led to the decision
- **Decision**: What was decided
- **Consequences**: The positive and negative impacts

## Decision Records

| Number | Title | Status | Date |
|--------|-------|--------|------|
${this.adrs
	.map(
		(adr) =>
			`| [ADR-${adr.number.toString().padStart(3, '0')}](./ADR-${adr.number.toString().padStart(3, '0')}-${adr.title
				.toLowerCase()
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '')}.md) | ${adr.title} | ${adr.status} | ${adr.date} |`
	)
	.join('\n')}

## ADR Lifecycle

1. **Proposed**: Decision is under consideration
2. **Accepted**: Decision has been made and is being implemented
3. **Deprecated**: Decision is no longer valid but kept for historical context
4. **Superseded**: Decision has been replaced by a newer ADR

## Creating New ADRs

To create a new ADR:

1. Use the [ADR template](./ADR-TEMPLATE.md)
2. Number it sequentially (next number: ${Math.max(...this.adrs.map((a) => a.number), 0) + 1})
3. Follow the naming convention: \`ADR-XXX-short-descriptive-title.md\`
4. Submit as a pull request for team review

## Quick Links

### By Status

**Accepted** (${this.adrs.filter((a) => a.status === 'Accepted').length})
${this.adrs
	.filter((a) => a.status === 'Accepted')
	.map(
		(a) =>
			`- [ADR-${a.number.toString().padStart(3, '0')}: ${a.title}](./ADR-${a.number.toString().padStart(3, '0')}-${a.title
				.toLowerCase()
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '')}.md)`
	)
	.join('\n')}

**Proposed** (${this.adrs.filter((a) => a.status === 'Proposed').length})
${
	this.adrs
		.filter((a) => a.status === 'Proposed')
		.map(
			(a) =>
				`- [ADR-${a.number.toString().padStart(3, '0')}: ${a.title}](./ADR-${a.number.toString().padStart(3, '0')}-${a.title
					.toLowerCase()
					.replace(/\s+/g, '-')
					.replace(/[^a-z0-9-]/g, '')}.md)`
		)
		.join('\n') || '- None'
}

### By Topic

**Backend & Database**
${
	this.adrs
		.filter(
			(a) =>
				a.title.toLowerCase().includes('supabase') ||
				a.title.toLowerCase().includes('database')
		)
		.map(
			(a) =>
				`- [ADR-${a.number.toString().padStart(3, '0')}: ${a.title}](./ADR-${a.number.toString().padStart(3, '0')}-${a.title
					.toLowerCase()
					.replace(/\s+/g, '-')
					.replace(/[^a-z0-9-]/g, '')}.md)`
		)
		.join('\n') || '- None'
}

**AI & Processing**
${
	this.adrs
		.filter(
			(a) =>
				a.title.toLowerCase().includes('ai') ||
				a.title.toLowerCase().includes('processing') ||
				a.title.toLowerCase().includes('openai')
		)
		.map(
			(a) =>
				`- [ADR-${a.number.toString().padStart(3, '0')}: ${a.title}](./ADR-${a.number.toString().padStart(3, '0')}-${a.title
					.toLowerCase()
					.replace(/\s+/g, '-')
					.replace(/[^a-z0-9-]/g, '')}.md)`
		)
		.join('\n') || '- None'
}

**Frontend & UI**
${
	this.adrs
		.filter(
			(a) =>
				a.title.toLowerCase().includes('svelte') ||
				a.title.toLowerCase().includes('frontend')
		)
		.map(
			(a) =>
				`- [ADR-${a.number.toString().padStart(3, '0')}: ${a.title}](./ADR-${a.number.toString().padStart(3, '0')}-${a.title
					.toLowerCase()
					.replace(/\s+/g, '-')
					.replace(/[^a-z0-9-]/g, '')}.md)`
		)
		.join('\n') || '- None'
}

**Integration & APIs**
${
	this.adrs
		.filter(
			(a) =>
				a.title.toLowerCase().includes('calendar') ||
				a.title.toLowerCase().includes('integration')
		)
		.map(
			(a) =>
				`- [ADR-${a.number.toString().padStart(3, '0')}: ${a.title}](./ADR-${a.number.toString().padStart(3, '0')}-${a.title
					.toLowerCase()
					.replace(/\s+/g, '-')
					.replace(/[^a-z0-9-]/g, '')}.md)`
		)
		.join('\n') || '- None'
}

---

*Last updated: ${new Date().toISOString()}*
*Total ADRs: ${this.adrs.length}*
`;

		await writeFile(join(this.adrDir, 'README.md'), content);
	}

	private async generateADRTemplate(): Promise<void> {
		const template = `# ADR-XXX: [Short noun phrase describing the decision]

**Status:** [Proposed | Accepted | Deprecated | Superseded]
**Date:** [YYYY-MM-DD]
**Deciders:** [List everyone involved in the decision]

## Context

[Describe the forces at play, including technological, political, social, and project local. These forces are probably in tension, and should be called out as such. The language in this section is value-neutral. It is simply describing facts.]

## Decision

[This section describes our response to these forces. It is stated in full sentences, with active voice. "We will ..."]

## Consequences

[This section describes the resulting context, after applying the decision. All consequences should be listed here, not just the "positive" ones. A particular decision may have positive, negative, and neutral consequences, but all of them affect the team and project in the future.]

### Positive

- [List positive impacts]

### Negative

- [List negative impacts]

### Neutral

- [List neutral impacts]

## Related ADRs

- [List any related ADRs that this builds on or conflicts with]

## Implementation Notes

[Optional: Any specific implementation details, timelines, or considerations]

---

*This ADR follows the format described in [Documenting Architecture Decisions](http://thinkrelevance.com/blog/2011/11/15/documenting-architecture-decisions) by Michael Nygard.*

## Instructions for Use

1. Copy this template
2. Replace the placeholder text with actual content
3. Number it sequentially (check existing ADRs for the next number)
4. Use the naming convention: \`ADR-XXX-short-descriptive-title.md\`
5. Submit as a pull request for team review
6. Update the status as the decision progresses through its lifecycle
`;

		await writeFile(join(this.adrDir, 'ADR-TEMPLATE.md'), template);
	}
}

async function main() {
	const generator = new ADRGenerator();
	await generator.generate();
}

if (require.main === module) {
	main().catch(console.error);
}

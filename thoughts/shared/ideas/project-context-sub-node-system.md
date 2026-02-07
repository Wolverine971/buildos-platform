---
title: "Project Context Sub-node System - Implementation Instructions"
status: exploratory
date: 2026-02-06
category: features
path: thoughts/shared/ideas/project-context-sub-node-system.md
---

<!-- thoughts/shared/ideas/project-context-sub-node-system.md -->
# Implementation Instructions: Project Context Sub-node System

## Overview

You are implementing a smart context chunking system that breaks large markdown documents into manageable sub-nodes while preserving document structure and enabling focused updates.

## Phase 1: Database Schema Setup

### Step 1.1: Create Migration File

Create a new migration file: `create_context_subnodes_system.sql`

```sql
-- Add tracking columns to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS context_structure JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS context_has_subnodes BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS context_last_parsed TIMESTAMPTZ DEFAULT NULL;

-- Create sub_contexts table
CREATE TABLE IF NOT EXISTS sub_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

    -- Identity
    slug TEXT NOT NULL,
    title TEXT NOT NULL,

    -- Content
    content TEXT NOT NULL,
    content_length INTEGER GENERATED ALWAYS AS (LENGTH(content)) STORED,
    preview TEXT,

    -- Organization
    position INTEGER NOT NULL,
    level INTEGER DEFAULT 1,
    tags TEXT[] DEFAULT '{}',

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(project_id, slug)
);

-- Create indexes
CREATE INDEX idx_sub_contexts_project_id ON sub_contexts(project_id);
CREATE INDEX idx_sub_contexts_user_id ON sub_contexts(user_id);
CREATE INDEX idx_sub_contexts_tags ON sub_contexts USING GIN(tags);
CREATE INDEX idx_sub_contexts_position ON sub_contexts(project_id, position);
CREATE INDEX idx_sub_contexts_content_search ON sub_contexts USING GIN (to_tsvector('english', content));

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sub_contexts_updated_at
BEFORE UPDATE ON sub_contexts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

### Step 1.2: Create Database Functions

Create file: `context_subnode_functions.sql`

```sql
-- Function to get full reconstructed context
CREATE OR REPLACE FUNCTION get_full_project_context(p_project_id UUID)
RETURNS TEXT AS $$
DECLARE
  parent_context TEXT;
  has_subnodes BOOLEAN;
  sub_node RECORD;
  full_context TEXT;
BEGIN
  -- Get parent context and check if it has subnodes
  SELECT context, context_has_subnodes
  INTO parent_context, has_subnodes
  FROM projects
  WHERE id = p_project_id;

  -- If no subnodes, return original context
  IF NOT has_subnodes OR has_subnodes IS NULL THEN
    RETURN parent_context;
  END IF;

  full_context := parent_context;

  -- Replace each preview with full sub-node content
  FOR sub_node IN
    SELECT slug, title, content
    FROM sub_contexts
    WHERE project_id = p_project_id
    ORDER BY position
  LOOP
    -- Replace the preview placeholder with full content
    -- Look for pattern: *[Content extracted to sub-node: ...]*
    full_context := regexp_replace(
      full_context,
      '\*\[Content extracted to sub-node:[^*]+\*\]',
      sub_node.content,
      'g'
    );
  END LOOP;

  RETURN full_context;
END;
$$ LANGUAGE plpgsql;

-- Function to get context with specific subnodes expanded
CREATE OR REPLACE FUNCTION get_context_with_subnodes(
  p_project_id UUID,
  p_expand_slugs TEXT[] DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  parent_context TEXT;
  sub_node RECORD;
  result_context TEXT;
BEGIN
  SELECT context INTO parent_context
  FROM projects WHERE id = p_project_id;

  result_context := parent_context;

  -- If specific slugs provided, only expand those
  IF p_expand_slugs IS NOT NULL THEN
    FOR sub_node IN
      SELECT slug, content
      FROM sub_contexts
      WHERE project_id = p_project_id
      AND slug = ANY(p_expand_slugs)
    LOOP
      result_context := regexp_replace(
        result_context,
        '\*\[Content extracted to sub-node:[^*]+\*\]',
        sub_node.content,
        '1'  -- Replace first occurrence only
      );
    END LOOP;
  END IF;

  RETURN result_context;
END;
$$ LANGUAGE plpgsql;
```

## Phase 2: Parser Implementation

### Step 2.1: Create TypeScript/JavaScript Parser

Create file: `contextParser.ts`

```typescript
interface ParsedSection {
	title: string;
	slug: string;
	content: string;
	level: number;
	position: number;
	contentLength: number;
	startLine: number;
	endLine: number;
}

interface ContextAnalysis {
	totalLength: number;
	sections: ParsedSection[];
	eligibleForSubnodes: ParsedSection[];
	shouldBreak: boolean;
	breakStrategy: 'optional' | 'mandatory' | 'none';
}

class ContextParser {
	private readonly OPTIONAL_BREAK_THRESHOLD = 3000;
	private readonly MANDATORY_BREAK_THRESHOLD = 10000;
	private readonly SECTION_BREAK_THRESHOLD = 2000;
	private readonly PREVIEW_LENGTH = 100;

	/**
	 * Main entry point - analyzes markdown context and determines breaking strategy
	 */
	analyzeContext(markdownContent: string): ContextAnalysis {
		const totalLength = markdownContent.length;

		// Determine breaking strategy based on total length
		let breakStrategy: 'optional' | 'mandatory' | 'none';
		if (totalLength < this.OPTIONAL_BREAK_THRESHOLD) {
			breakStrategy = 'none';
		} else if (totalLength >= this.MANDATORY_BREAK_THRESHOLD) {
			breakStrategy = 'mandatory';
		} else {
			breakStrategy = 'optional';
		}

		// Parse all sections from markdown
		const sections = this.parseMarkdownSections(markdownContent);

		// Determine which sections should become subnodes
		const eligibleForSubnodes = this.determineEligibleSections(sections, breakStrategy);

		const shouldBreak = eligibleForSubnodes.length > 0;

		return {
			totalLength,
			sections,
			eligibleForSubnodes,
			shouldBreak,
			breakStrategy
		};
	}

	/**
	 * Parse markdown into sections based on headers
	 */
	private parseMarkdownSections(markdown: string): ParsedSection[] {
		const lines = markdown.split('\n');
		const sections: ParsedSection[] = [];

		let currentSection: ParsedSection | null = null;
		let contentBuffer: string[] = [];
		let position = 0;
		let startLine = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

			if (headerMatch) {
				// Save previous section if exists
				if (currentSection) {
					currentSection.content = contentBuffer.join('\n').trim();
					currentSection.contentLength = currentSection.content.length;
					currentSection.endLine = i - 1;
					if (currentSection.content) {
						sections.push(currentSection);
					}
				}

				// Start new section
				const level = headerMatch[1].length;
				const title = headerMatch[2].trim();
				currentSection = {
					title,
					slug: this.generateSlug(title),
					content: '',
					level,
					position: position++,
					contentLength: 0,
					startLine: i,
					endLine: lines.length - 1
				};
				contentBuffer = [];
				startLine = i + 1;
			} else {
				contentBuffer.push(line);
			}
		}

		// Save last section
		if (currentSection) {
			currentSection.content = contentBuffer.join('\n').trim();
			currentSection.contentLength = currentSection.content.length;
			if (currentSection.content) {
				sections.push(currentSection);
			}
		}

		return sections;
	}

	/**
	 * Determine which sections should become subnodes based on strategy
	 */
	private determineEligibleSections(
		sections: ParsedSection[],
		strategy: 'optional' | 'mandatory' | 'none'
	): ParsedSection[] {
		if (strategy === 'none') {
			return [];
		}

		if (strategy === 'mandatory') {
			// For mandatory breaking, take all substantial sections
			// Prioritize top-level sections (h1, h2)
			return sections.filter((s) => s.level <= 2 && s.contentLength > 500);
		}

		// Optional breaking - only sections over threshold
		return sections.filter((s) => s.contentLength > this.SECTION_BREAK_THRESHOLD);
	}

	/**
	 * Generate URL-safe slug from title
	 */
	private generateSlug(title: string): string {
		return title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.substring(0, 50); // Limit length
	}

	/**
	 * Generate tags for a section based on content analysis
	 */
	generateTags(section: ParsedSection): string[] {
		const tags: string[] = [];

		// Add level-based tag
		tags.push(`h${section.level}`);

		// Add content-based tags
		const titleLower = section.title.toLowerCase();
		const contentLower = section.content.toLowerCase();

		// Common section type detection
		if (titleLower.match(/overview|introduction|summary|abstract/i)) {
			tags.push('overview');
		}
		if (titleLower.match(/technical|architecture|implementation|system/i)) {
			tags.push('technical');
		}
		if (titleLower.match(/strategy|plan|approach|roadmap/i)) {
			tags.push('strategy');
		}
		if (titleLower.match(/scope|requirements|specification/i)) {
			tags.push('scope');
		}
		if (titleLower.match(/goal|objective|outcome|result/i)) {
			tags.push('goals');
		}
		if (titleLower.match(/risk|issue|challenge|mitigation/i)) {
			tags.push('risks');
		}
		if (titleLower.match(/timeline|schedule|milestone|deadline/i)) {
			tags.push('timeline');
		}

		// Add size-based tag
		if (section.contentLength > 5000) {
			tags.push('large-section');
		} else if (section.contentLength > 2500) {
			tags.push('medium-section');
		} else {
			tags.push('small-section');
		}

		return [...new Set(tags)]; // Remove duplicates
	}

	/**
	 * Create parent context with previews replacing extracted sections
	 */
	createParentContextWithPreviews(
		originalContent: string,
		extractedSections: ParsedSection[]
	): string {
		if (extractedSections.length === 0) {
			return originalContent;
		}

		let parentContent = originalContent;

		// Sort sections by position (reverse) to replace from bottom up
		const sortedSections = [...extractedSections].sort((a, b) => b.startLine - a.startLine);

		for (const section of sortedSections) {
			// Create the header pattern to find
			const headerPattern = `${'#'.repeat(section.level)} ${section.title}`;

			// Create preview text
			const preview = section.content.substring(0, this.PREVIEW_LENGTH);
			const cleanPreview = preview.replace(/\n/g, ' ').trim();

			// Create replacement with preview
			const replacement = `${headerPattern}\n*[Content extracted to sub-node: ${cleanPreview}...]*`;

			// Find and replace the section
			const sectionRegex = new RegExp(
				`${this.escapeRegex(headerPattern)}[\\s\\S]*?(?=^#{1,${section.level}}\\s|$)`,
				'gm'
			);

			parentContent = parentContent.replace(sectionRegex, replacement);
		}

		return parentContent;
	}

	private escapeRegex(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}

export default ContextParser;
```

### Step 2.2: Create Migration Service

Create file: `migrationService.ts`

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import ContextParser from './contextParser';

interface MigrationResult {
	success: boolean;
	projectId: string;
	subnodesCreated: number;
	error?: string;
	details?: any;
}

class ContextMigrationService {
	private parser: ContextParser;

	constructor(private supabase: SupabaseClient) {
		this.parser = new ContextParser();
	}

	/**
	 * Migrate a single project's context to subnode structure
	 */
	async migrateProject(projectId: string): Promise<MigrationResult> {
		try {
			// 1. Fetch project data
			const { data: project, error: fetchError } = await this.supabase
				.from('projects')
				.select('id, context, user_id, name')
				.eq('id', projectId)
				.single();

			if (fetchError || !project) {
				return {
					success: false,
					projectId,
					subnodesCreated: 0,
					error: 'Project not found'
				};
			}

			if (!project.context) {
				return {
					success: false,
					projectId,
					subnodesCreated: 0,
					error: 'Project has no context'
				};
			}

			// 2. Analyze context
			const analysis = this.parser.analyzeContext(project.context);

			console.log(
				`Project ${project.name}: ${analysis.totalLength} chars, ` +
					`strategy: ${analysis.breakStrategy}, ` +
					`eligible sections: ${analysis.eligibleForSubnodes.length}`
			);

			// 3. If no breaking needed, just update metadata
			if (!analysis.shouldBreak) {
				await this.supabase
					.from('projects')
					.update({
						context_has_subnodes: false,
						context_last_parsed: new Date().toISOString(),
						context_structure: {
							total_length: analysis.totalLength,
							has_subnodes: false,
							last_parsed: new Date().toISOString(),
							sub_nodes: {}
						}
					})
					.eq('id', projectId);

				return {
					success: true,
					projectId,
					subnodesCreated: 0,
					details: { reason: 'Content too small or no large sections' }
				};
			}

			// 4. Create subnodes
			const subNodeMap: Record<string, any> = {};
			const subNodeRecords = [];

			for (const section of analysis.eligibleForSubnodes) {
				const tags = this.parser.generateTags(section);
				const preview =
					section.content.substring(0, 100) + (section.content.length > 100 ? '...' : '');

				subNodeRecords.push({
					project_id: projectId,
					user_id: project.user_id,
					slug: section.slug,
					title: section.title,
					content: section.content,
					preview: preview,
					position: section.position,
					level: section.level,
					tags: tags,
					metadata: {
						original_length: section.contentLength,
						start_line: section.startLine,
						end_line: section.endLine
					}
				});
			}

			// 5. Batch insert subnodes
			const { data: insertedNodes, error: insertError } = await this.supabase
				.from('sub_contexts')
				.insert(subNodeRecords)
				.select('id, slug, content_length, tags');

			if (insertError) {
				console.error('Error inserting subnodes:', insertError);
				return {
					success: false,
					projectId,
					subnodesCreated: 0,
					error: insertError.message
				};
			}

			// 6. Build subnode reference map
			for (const node of insertedNodes || []) {
				subNodeMap[node.slug] = {
					id: node.id,
					content_length: node.content_length,
					tags: node.tags,
					position: subNodeRecords.find((r) => r.slug === node.slug)?.position
				};
			}

			// 7. Create parent context with previews
			const parentContext = this.parser.createParentContextWithPreviews(
				project.context,
				analysis.eligibleForSubnodes
			);

			// 8. Update project with new structure
			const { error: updateError } = await this.supabase
				.from('projects')
				.update({
					context: parentContext,
					context_has_subnodes: true,
					context_structure: {
						total_length: analysis.totalLength,
						has_subnodes: true,
						last_parsed: new Date().toISOString(),
						break_strategy: analysis.breakStrategy,
						sub_nodes: subNodeMap
					},
					context_last_parsed: new Date().toISOString()
				})
				.eq('id', projectId);

			if (updateError) {
				console.error('Error updating project:', updateError);
				return {
					success: false,
					projectId,
					subnodesCreated: insertedNodes?.length || 0,
					error: updateError.message
				};
			}

			return {
				success: true,
				projectId,
				subnodesCreated: insertedNodes?.length || 0,
				details: {
					strategy: analysis.breakStrategy,
					totalSections: analysis.sections.length,
					extractedSections: analysis.eligibleForSubnodes.map((s) => ({
						title: s.title,
						size: s.contentLength
					}))
				}
			};
		} catch (error: any) {
			console.error(`Error migrating project ${projectId}:`, error);
			return {
				success: false,
				projectId,
				subnodesCreated: 0,
				error: error.message
			};
		}
	}

	/**
	 * Migrate all projects in batches
	 */
	async migrateAllProjects(
		batchSize: number = 10,
		dryRun: boolean = false
	): Promise<{
		totalProjects: number;
		successful: number;
		failed: number;
		results: MigrationResult[];
	}> {
		// Get all projects that need migration
		const { data: projects, error: fetchError } = await this.supabase
			.from('projects')
			.select('id, name')
			.not('context', 'is', null)
			.is('context_has_subnodes', null);

		if (fetchError || !projects) {
			console.error('Error fetching projects:', fetchError);
			return {
				totalProjects: 0,
				successful: 0,
				failed: 0,
				results: []
			};
		}

		console.log(`Found ${projects.length} projects to migrate`);

		if (dryRun) {
			console.log('DRY RUN - No changes will be made');
			return {
				totalProjects: projects.length,
				successful: 0,
				failed: 0,
				results: []
			};
		}

		const results: MigrationResult[] = [];
		let successful = 0;
		let failed = 0;

		// Process in batches
		for (let i = 0; i < projects.length; i += batchSize) {
			const batch = projects.slice(i, i + batchSize);
			console.log(
				`Processing batch ${Math.floor(i / batchSize) + 1} ` +
					`(projects ${i + 1}-${Math.min(i + batchSize, projects.length)})`
			);

			// Process batch in parallel
			const batchResults = await Promise.all(batch.map((p) => this.migrateProject(p.id)));

			// Tally results
			for (const result of batchResults) {
				results.push(result);
				if (result.success) {
					successful++;
				} else {
					failed++;
				}
			}

			console.log(
				`Batch complete. Total progress: ${successful} successful, ${failed} failed`
			);

			// Add a small delay between batches to avoid overwhelming the database
			if (i + batchSize < projects.length) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		return {
			totalProjects: projects.length,
			successful,
			failed,
			results
		};
	}

	/**
	 * Test migration on a few projects first
	 */
	async testMigration(limit: number = 5): Promise<void> {
		console.log(`Testing migration on ${limit} projects...`);

		const { data: testProjects } = await this.supabase
			.from('projects')
			.select('id, name')
			.not('context', 'is', null)
			.is('context_has_subnodes', null)
			.limit(limit);

		if (!testProjects || testProjects.length === 0) {
			console.log('No projects to test');
			return;
		}

		for (const project of testProjects) {
			console.log(`\nTesting project: ${project.name}`);
			const result = await this.migrateProject(project.id);
			console.log('Result:', result);
		}
	}
}

export default ContextMigrationService;
```

## Phase 3: Testing Instructions

### Step 3.1: Test Individual Functions

```typescript
// Test file: testContextMigration.ts

async function runTests() {
	// 1. Test the parser
	const parser = new ContextParser();

	const testContent = `
# Project Overview
This is a short intro.

## Technical Architecture
${'x'.repeat(2500)} // Long content

## Implementation Details
${'y'.repeat(1800)} // Below threshold

### Sub-section
Some content here.
  `;

	const analysis = parser.analyzeContext(testContent);
	console.log('Parser test:', analysis);

	// 2. Test single project migration
	const migrationService = new ContextMigrationService(supabase);
	await migrationService.testMigration(1);

	// 3. Verify database functions
	const { data: fullContext } = await supabase.rpc('get_full_project_context', {
		p_project_id: 'test-project-id'
	});
	console.log('Reconstructed context length:', fullContext?.length);
}
```

### Step 3.2: Validation Queries

```sql
-- Check migration status
SELECT
  COUNT(*) as total_projects,
  COUNT(CASE WHEN context_has_subnodes = true THEN 1 END) as with_subnodes,
  COUNT(CASE WHEN context_has_subnodes = false THEN 1 END) as without_subnodes,
  COUNT(CASE WHEN context_has_subnodes IS NULL THEN 1 END) as not_processed
FROM projects
WHERE context IS NOT NULL;

-- Verify sub_contexts creation
SELECT
  p.name as project_name,
  p.context_has_subnodes,
  COUNT(sc.id) as subnode_count,
  SUM(sc.content_length) as total_subnode_length,
  LENGTH(p.context) as parent_length
FROM projects p
LEFT JOIN sub_contexts sc ON sc.project_id = p.id
WHERE p.context_has_subnodes = true
GROUP BY p.id, p.name, p.context_has_subnodes, p.context;

-- Check for any orphaned subnodes
SELECT sc.*
FROM sub_contexts sc
LEFT JOIN projects p ON p.id = sc.project_id
WHERE p.id IS NULL;
```

## Phase 4: Rollout Instructions

### Step 4.1: Pre-Migration Backup

```sql
-- Create backup table
CREATE TABLE projects_context_backup AS
SELECT id, context, updated_at
FROM projects
WHERE context IS NOT NULL;
```

### Step 4.2: Staged Rollout

```typescript
// Rollout script: rollout.ts

async function stagedRollout() {
	const migrationService = new ContextMigrationService(supabase);

	// Stage 1: Test on 5 projects
	console.log('Stage 1: Testing on 5 projects...');
	await migrationService.testMigration(5);

	// Verify results
	const stage1Check = await verifyMigration(5);
	if (!stage1Check.success) {
		console.error('Stage 1 failed, aborting');
		return;
	}

	// Stage 2: Migrate 10% of projects
	console.log('Stage 2: Migrating 10% of projects...');
	const { data: tenPercentProjects } = await supabase
		.from('projects')
		.select('id')
		.not('context', 'is', null)
		.is('context_has_subnodes', null)
		.limit(Math.ceil(totalProjects * 0.1));

	for (const project of tenPercentProjects) {
		await migrationService.migrateProject(project.id);
	}

	// Stage 3: Full migration
	console.log('Stage 3: Full migration...');
	await migrationService.migrateAllProjects(20); // Batch size of 20
}
```

### Step 4.3: Post-Migration Verification

```typescript
async function verifyMigration(expectedCount?: number) {
	// Check that all projects have been processed
	const { data: unprocessed } = await supabase
		.from('projects')
		.select('id')
		.not('context', 'is', null)
		.is('context_has_subnodes', null);

	// Verify reconstruction works
	const { data: testProjects } = await supabase
		.from('projects')
		.select('id')
		.eq('context_has_subnodes', true)
		.limit(5);

	for (const project of testProjects || []) {
		const { data: reconstructed } = await supabase.rpc('get_full_project_context', {
			p_project_id: project.id
		});

		if (!reconstructed) {
			console.error(`Failed to reconstruct context for project ${project.id}`);
			return { success: false };
		}
	}

	return { success: true };
}
```

## Phase 5: Update Operations Implementation

### Step 5.1: Create Update Service

```typescript
// File: contextUpdateService.ts

class ContextUpdateService {
	constructor(private supabase: SupabaseClient) {}

	/**
	 * Update a specific subnode
	 */
	async updateSubnode(
		projectId: string,
		subnodeSlug: string,
		newContent: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			// 1. Update the subnode
			const { error: updateError } = await this.supabase
				.from('sub_contexts')
				.update({
					content: newContent,
					preview: newContent.substring(0, 100) + (newContent.length > 100 ? '...' : ''),
					updated_at: new Date().toISOString()
				})
				.eq('project_id', projectId)
				.eq('slug', subnodeSlug);

			if (updateError) throw updateError;

			// 2. Update parent preview
			await this.updateParentPreview(projectId, subnodeSlug, newContent);

			// 3. Update context_structure metadata
			await this.updateContextStructure(projectId, subnodeSlug, newContent.length);

			return { success: true };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	}

	/**
	 * Add a new section to context
	 */
	async addSection(
		projectId: string,
		title: string,
		content: string,
		position?: number
	): Promise<{ success: boolean; error?: string }> {
		// Implementation for adding new sections
		// This would need to re-analyze the context and potentially create new subnodes
		return { success: true };
	}

	/**
	 * Remove a subnode and merge back to parent
	 */
	async mergeSubnodeToParent(
		projectId: string,
		subnodeSlug: string
	): Promise<{ success: boolean; error?: string }> {
		// Implementation for merging subnode back to parent
		return { success: true };
	}

	private async updateParentPreview(projectId: string, subnodeSlug: string, newContent: string) {
		// Update the preview in the parent context
		const preview = newContent.substring(0, 100);

		const { data: project } = await this.supabase
			.from('projects')
			.select('context')
			.eq('id', projectId)
			.single();

		if (project?.context) {
			// Update preview placeholder
			const updatedContext = project.context.replace(
				/\*\[Content extracted to sub-node:[^*]+\*\]/,
				`*[Content extracted to sub-node: ${preview}...]*`
			);

			await this.supabase
				.from('projects')
				.update({ context: updatedContext })
				.eq('id', projectId);
		}
	}

	private async updateContextStructure(
		projectId: string,
		subnodeSlug: string,
		newLength: number
	) {
		const { data: project } = await this.supabase
			.from('projects')
			.select('context_structure')
			.eq('id', projectId)
			.single();

		if (project?.context_structure) {
			const structure = project.context_structure;
			if (structure.sub_nodes && structure.sub_nodes[subnodeSlug]) {
				structure.sub_nodes[subnodeSlug].content_length = newLength;
				structure.last_updated = new Date().toISOString();

				await this.supabase
					.from('projects')
					.update({ context_structure: structure })
					.eq('id', projectId);
			}
		}
	}
}
```

## Critical Implementation Notes

1. **Run migrations in a transaction when possible** to ensure atomicity
2. **Test on a small subset first** - never run on all projects without testing
3. **Monitor performance** - large contexts may take time to process
4. **Keep the backup table** until you're confident the migration worked
5. **Add error handling** for edge cases like malformed markdown
6. **Consider rate limiting** if processing many projects
7. **Log all operations** for debugging and audit trail

## Success Criteria

- [ ] All projects with context have `context_has_subnodes` set (true or false)
- [ ] Projects with `context_has_subnodes = true` have corresponding sub_contexts records
- [ ] `get_full_project_context()` function returns identical content to original
- [ ] Parent context contains previews for all extracted sections
- [ ] No orphaned sub_contexts records exist
- [ ] All sub_contexts records have valid tags
- [ ] Performance is acceptable (< 1s for most operations)

## Rollback Plan

If issues occur:

```sql
-- Restore original context from backup
UPDATE projects p
SET
  context = b.context,
  context_structure = NULL,
  context_has_subnodes = NULL,
  context_last_parsed = NULL
FROM projects_context_backup b
WHERE p.id = b.id;

-- Remove all sub_contexts records
TRUNCATE TABLE sub_contexts;

-- Drop the new columns if needed
ALTER TABLE projects
DROP COLUMN IF EXISTS context_structure,
DROP COLUMN IF EXISTS context_has_subnodes,
DROP COLUMN IF EXISTS context_last_parsed;
```

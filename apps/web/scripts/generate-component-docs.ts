#!/usr/bin/env tsx

/**
 * Generate comprehensive component documentation for Svelte 5 components
 * Extracts props, events, exports, and runes usage patterns
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, relative, dirname, basename } from 'path';
import { existsSync } from 'fs';

interface ComponentInfo {
	name: string;
	path: string;
	description: string;
	props: ComponentProp[];
	events: ComponentEvent[];
	exports: ComponentExport[];
	slots: ComponentSlot[];
	runes: RuneUsage[];
	examples: ComponentExample[];
	dependencies: string[];
}

interface ComponentProp {
	name: string;
	type: string;
	required: boolean;
	defaultValue?: string;
	description: string;
}

interface ComponentEvent {
	name: string;
	type: string;
	description: string;
	payload?: string;
}

interface ComponentExport {
	name: string;
	type: string;
	description: string;
}

interface ComponentSlot {
	name: string;
	props?: string[];
	description: string;
}

interface RuneUsage {
	type: '$state' | '$derived' | '$effect' | '$props';
	count: number;
	examples: string[];
}

interface ComponentExample {
	title: string;
	code: string;
	description: string;
}

class ComponentDocumentationGenerator {
	private readonly componentDirs = ['src/lib/components', 'src/routes'];
	private readonly outputDir = 'docs/technical/components';
	private readonly components: ComponentInfo[] = [];

	async generate(): Promise<void> {
		console.log('🔍 Scanning Svelte components...');
		await this.scanComponents();

		console.log('📝 Generating component documentation...');
		await this.ensureOutputDirectory();
		await this.generateComponentDocs();
		await this.generateDesignSystemDoc();
		await this.generateComponentIndex();

		console.log(`✅ Generated documentation for ${this.components.length} components`);
	}

	private async scanComponents(): Promise<void> {
		for (const dir of this.componentDirs) {
			if (existsSync(dir)) {
				await this.scanDirectory(dir);
			}
		}
	}

	private async scanDirectory(dir: string): Promise<void> {
		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				await this.scanDirectory(fullPath);
			} else if (entry.name.endsWith('.svelte')) {
				await this.parseComponent(fullPath);
			}
		}
	}

	private async parseComponent(filePath: string): Promise<void> {
		try {
			const content = await readFile(filePath, 'utf-8');
			const componentInfo = await this.extractComponentInfo(filePath, content);
			if (componentInfo) {
				this.components.push(componentInfo);
			}
		} catch (error) {
			console.warn(`⚠️  Failed to parse ${filePath}:`, error);
		}
	}

	private async extractComponentInfo(
		filePath: string,
		content: string
	): Promise<ComponentInfo | null> {
		const componentName = this.getComponentName(filePath);

		// Skip if this is a page component (contains +page.svelte)
		if (filePath.includes('+page.svelte') || filePath.includes('+layout.svelte')) {
			return null;
		}

		const description = this.extractDescription(content);
		const props = this.extractProps(content);
		const events = this.extractEvents(content);
		const exports = this.extractExports(content);
		const slots = this.extractSlots(content);
		const runes = this.extractRuneUsage(content);
		const examples = this.extractExamples(content);
		const dependencies = this.extractDependencies(content);

		return {
			name: componentName,
			path: filePath,
			description,
			props,
			events,
			exports,
			slots,
			runes,
			examples,
			dependencies
		};
	}

	private getComponentName(filePath: string): string {
		const fileName = basename(filePath, '.svelte');
		return fileName;
	}

	private extractDescription(content: string): string {
		// Look for JSDoc comment at the top of the script section
		const scriptMatch = content.match(/<script[^>]*>(.*?)<\/script>/s);
		if (scriptMatch) {
			const jsdocMatch = scriptMatch[1].match(
				/\/\*\*\s*\n\s*\*\s*(.+?)(?:\n\s*\*\s*@|\*\/)/s
			);
			if (jsdocMatch) {
				return jsdocMatch[1]
					.split('\n')
					.map((line) => line.replace(/^\s*\*\s?/, '').trim())
					.filter((line) => line)
					.join(' ');
			}
		}

		// Look for HTML comment at the top
		const htmlCommentMatch = content.match(/<!--\s*(.+?)\s*-->/s);
		if (htmlCommentMatch) {
			return htmlCommentMatch[1].trim();
		}

		return 'No description available';
	}

	private extractProps(content: string): ComponentProp[] {
		const props: ComponentProp[] = [];

		// Extract from $props() rune
		const propsRuneRegex = /\$props\(\s*\)\s*as\s*\{([^}]+)\}/s;
		const propsMatch = content.match(propsRuneRegex);
		if (propsMatch) {
			const propsContent = propsMatch[1];
			const propRegex = /(\w+)(\?)?:\s*([^,;]+)/g;
			let match;
			while ((match = propRegex.exec(propsContent)) !== null) {
				props.push({
					name: match[1],
					type: match[3].trim(),
					required: !match[2], // No ? means required
					description: `Prop: ${match[1]}`
				});
			}
		}

		// Extract from export let statements (Svelte 4 style)
		const exportLetRegex = /export\s+let\s+(\w+)(?:\s*:\s*([^=\s]+))?\s*(?:=\s*([^;]+))?/g;
		let match;
		while ((match = exportLetRegex.exec(content)) !== null) {
			const existing = props.find((p) => p.name === match[1]);
			if (!existing) {
				props.push({
					name: match[1],
					type: match[2] || 'any',
					required: !match[3], // No default value means required
					defaultValue: match[3]?.trim(),
					description: `Prop: ${match[1]}`
				});
			}
		}

		// Extract descriptions from JSDoc comments
		const jsdocRegex =
			/\/\*\*\s*\n\s*\*\s*@prop\s+\{([^}]+)\}\s+(\w+)(?:\s+(.+?))?(?=\n\s*\*(?:\s*@|\/))/gs;
		while ((match = jsdocRegex.exec(content)) !== null) {
			const propName = match[2];
			const prop = props.find((p) => p.name === propName);
			if (prop) {
				prop.type = match[1];
				prop.description = match[3] || prop.description;
			}
		}

		return props;
	}

	private extractEvents(content: string): ComponentEvent[] {
		const events: ComponentEvent[] = [];

		// Extract from createEventDispatcher usage
		const dispatchRegex = /dispatch\s*\(\s*['"`](\w+)['"`](?:\s*,\s*([^)]+))?\s*\)/g;
		let match;
		while ((match = dispatchRegex.exec(content)) !== null) {
			events.push({
				name: match[1],
				type: 'CustomEvent',
				description: `Event: ${match[1]}`,
				payload: match[2]?.trim()
			});
		}

		// Extract from JSDoc @event comments
		const eventJsdocRegex =
			/\/\*\*\s*\n\s*\*\s*@event\s+(\w+)(?:\s+(.+?))?(?=\n\s*\*(?:\s*@|\/))/gs;
		while ((match = eventJsdocRegex.exec(content)) !== null) {
			const existing = events.find((e) => e.name === match[1]);
			if (existing) {
				existing.description = match[2] || existing.description;
			} else {
				events.push({
					name: match[1],
					type: 'CustomEvent',
					description: match[2] || `Event: ${match[1]}`
				});
			}
		}

		return events;
	}

	private extractExports(content: string): ComponentExport[] {
		const exports: ComponentExport[] = [];

		// Extract function exports
		const functionExportRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
		let match;
		while ((match = functionExportRegex.exec(content)) !== null) {
			exports.push({
				name: match[1],
				type: 'function',
				description: `Exported function: ${match[1]}`
			});
		}

		// Extract const/let exports (excluding props)
		const constExportRegex = /export\s+(?:const|let)\s+(\w+)(?:\s*:\s*([^=]+))?\s*=/g;
		while ((match = constExportRegex.exec(content)) !== null) {
			exports.push({
				name: match[1],
				type: match[2]?.trim() || 'any',
				description: `Exported variable: ${match[1]}`
			});
		}

		return exports;
	}

	private extractSlots(content: string): ComponentSlot[] {
		const slots: ComponentSlot[] = [];

		// Extract named slots
		const slotRegex = /<slot\s+name=["'](\w+)["'](?:\s+([^>]+))?>/g;
		let match;
		while ((match = slotRegex.exec(content)) !== null) {
			slots.push({
				name: match[1],
				description: `Named slot: ${match[1]}`
			});
		}

		// Check for default slot
		if (content.includes('<slot') && !slots.some((s) => s.name === 'default')) {
			slots.unshift({
				name: 'default',
				description: 'Default slot content'
			});
		}

		return slots;
	}

	private extractRuneUsage(content: string): RuneUsage[] {
		const runes: RuneUsage[] = [];
		const runeTypes = ['$state', '$derived', '$effect', '$props'] as const;

		for (const runeType of runeTypes) {
			const regex = new RegExp(`\\${runeType}\\s*\\(`, 'g');
			const matches = content.match(regex) || [];

			if (matches.length > 0) {
				// Extract examples of usage
				const exampleRegex = new RegExp(`(\\${runeType}\\s*\\([^)]*\\)[^;]*;?)`, 'g');
				const examples = [];
				let match;
				while ((match = exampleRegex.exec(content)) !== null && examples.length < 3) {
					examples.push(match[1].trim());
				}

				runes.push({
					type: runeType,
					count: matches.length,
					examples
				});
			}
		}

		return runes;
	}

	private extractExamples(content: string): ComponentExample[] {
		const examples: ComponentExample[] = [];

		// Extract from JSDoc @example tags
		const exampleRegex = /@example\s*\n\s*\*\s*(.+?)(?=\n\s*\*\s*(?:@|\/))/gs;
		let match;
		while ((match = exampleRegex.exec(content)) !== null) {
			const exampleText = match[1]
				.split('\n')
				.map((line) => line.replace(/^\s*\*\s?/, '').trim())
				.filter((line) => line)
				.join('\n');

			examples.push({
				title: 'Usage Example',
				code: exampleText,
				description: 'Example usage of this component'
			});
		}

		return examples;
	}

	private extractDependencies(content: string): string[] {
		const dependencies: string[] = [];

		// Extract component imports
		const importRegex = /import\s+(?:\{[^}]+\}|\w+)\s+from\s+['"`]([^'"`]+)['"`]/g;
		let match;
		while ((match = importRegex.exec(content)) !== null) {
			const importPath = match[1];
			if (importPath.includes('.svelte') || importPath.startsWith('$lib/components')) {
				dependencies.push(importPath);
			}
		}

		return dependencies;
	}

	private async ensureOutputDirectory(): Promise<void> {
		if (!existsSync(this.outputDir)) {
			await mkdir(this.outputDir, { recursive: true });
		}

		// Create subdirectories for organized documentation
		const subdirs = ['brain-dump', 'projects', 'ui', 'icons'];
		for (const subdir of subdirs) {
			const dirPath = join(this.outputDir, subdir);
			if (!existsSync(dirPath)) {
				await mkdir(dirPath, { recursive: true });
			}
		}
	}

	private async generateComponentDocs(): Promise<void> {
		for (const component of this.components) {
			const content = this.generateComponentDoc(component);
			const category = this.categorizeComponent(component.path);
			const filePath = join(this.outputDir, category, `${component.name}.md`);
			await writeFile(filePath, content);
		}
	}

	private categorizeComponent(path: string): string {
		if (path.includes('brain-dump')) return 'brain-dump';
		if (path.includes('project')) return 'projects';
		if (path.includes('ui')) return 'ui';
		if (path.includes('icons')) return 'icons';
		return 'ui'; // default
	}

	private generateComponentDoc(component: ComponentInfo): string {
		let content = `# ${component.name}

*${component.description}*

## Usage

\`\`\`svelte
<${component.name}`;

		// Add props to usage example
		if (component.props.length > 0) {
			content += '\n';
			for (const prop of component.props) {
				const required = prop.required ? '' : '?';
				const defaultVal = prop.defaultValue ? `="${prop.defaultValue}"` : '=""';
				content += `  ${prop.name}${required}=${defaultVal}\n`;
			}
		}

		content +=
			component.slots.length > 0
				? '>\n  <!-- slot content -->\n</${component.name}>\n'
				: ' />\n';
		content += '```\n\n';

		// Props section
		if (component.props.length > 0) {
			content += `## Props

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
`;
			for (const prop of component.props) {
				content += `| ${prop.name} | \`${prop.type}\` | ${prop.required ? 'Yes' : 'No'} | ${prop.defaultValue || '-'} | ${prop.description} |
`;
			}
			content += '\n';
		}

		// Events section
		if (component.events.length > 0) {
			content += `## Events

| Name | Type | Description | Payload |
|------|------|-------------|---------|
`;
			for (const event of component.events) {
				content += `| ${event.name} | \`${event.type}\` | ${event.description} | ${event.payload || '-'} |
`;
			}
			content += '\n';
		}

		// Exports section
		if (component.exports.length > 0) {
			content += `## Exports

| Name | Type | Description |
|------|------|-------------|
`;
			for (const exp of component.exports) {
				content += `| ${exp.name} | \`${exp.type}\` | ${exp.description} |
`;
			}
			content += '\n';
		}

		// Slots section
		if (component.slots.length > 0) {
			content += `## Slots

| Name | Description |
|------|-------------|
`;
			for (const slot of component.slots) {
				content += `| ${slot.name} | ${slot.description} |
`;
			}
			content += '\n';
		}

		// Svelte 5 Runes section
		if (component.runes.length > 0) {
			content += `## Svelte 5 Runes Usage

This component uses the following Svelte 5 runes:

`;
			for (const rune of component.runes) {
				content += `### ${rune.type} (${rune.count} usage${rune.count > 1 ? 's' : ''})

`;
				if (rune.examples.length > 0) {
					content += 'Examples:\n\n';
					for (const example of rune.examples) {
						content += `\`\`\`typescript
${example}
\`\`\`

`;
					}
				}
			}
		}

		// Dependencies section
		if (component.dependencies.length > 0) {
			content += `## Dependencies

This component depends on:

`;
			for (const dep of component.dependencies) {
				content += `- \`${dep}\`
`;
			}
			content += '\n';
		}

		// Examples section
		if (component.examples.length > 0) {
			content += `## Examples

`;
			for (const example of component.examples) {
				content += `### ${example.title}

${example.description}

\`\`\`svelte
${example.code}
\`\`\`

`;
			}
		}

		content += `---

*Component source: \`${component.path}\`*
*Last updated: ${new Date().toISOString()}*
`;

		return content;
	}

	private async generateDesignSystemDoc(): Promise<void> {
		const runeStats = this.calculateRuneStatistics();

		const content = `# BuildOS Design System

*Svelte 5 Component Architecture and Patterns*

## Overview

BuildOS uses Svelte 5 with the new runes system for state management and reactivity. This document outlines the design patterns and architecture used across components.

## Svelte 5 Runes Usage Statistics

${Object.entries(runeStats)
	.map(([rune, count]) => `- **${rune}**: ${count} usages across components`)
	.join('\n')}

## Component Categories

### Brain Dump Components

Components specifically for the brain dump workflow:

${this.components
	.filter((c) => c.path.includes('brain-dump'))
	.map((c) => `- [${c.name}](./brain-dump/${c.name}.md) - ${c.description}`)
	.join('\n')}

### Project Management Components

Components for project and task management:

${this.components
	.filter((c) => c.path.includes('project'))
	.map((c) => `- [${c.name}](./projects/${c.name}.md) - ${c.description}`)
	.join('\n')}

### UI Components

Reusable UI components:

${this.components
	.filter(
		(c) =>
			c.path.includes('ui') || (!c.path.includes('brain-dump') && !c.path.includes('project'))
	)
	.map((c) => `- [${c.name}](./ui/${c.name}.md) - ${c.description}`)
	.join('\n')}

## Common Patterns

### State Management with $state()

Most components use \`$state()\` for reactive state management:

\`\`\`typescript
let isLoading = $state(false);
let data = $state(null);
\`\`\`

### Computed Values with $derived()

Derived values are computed using \`$derived()\`:

\`\`\`typescript
let filteredItems = $derived(items.filter(item => item.visible));
\`\`\`

### Side Effects with $effect()

Side effects and cleanup are handled with \`$effect()\`:

\`\`\`typescript
$effect(() => {
	// Effect logic
	return () => {
		// Cleanup
	};
});
\`\`\`

### Props with $props()

Component props are destructured from \`$props()\`:

\`\`\`typescript
let { title, items, onSelect } = $props() as {
	title: string;
	items: Item[];
	onSelect: (item: Item) => void;
};
\`\`\`

## Component Guidelines

1. **Single Responsibility**: Each component should have a clear, single purpose
2. **Reusability**: Design components to be reusable across different contexts
3. **Type Safety**: Use TypeScript for all props and state
4. **Accessibility**: Follow ARIA guidelines and semantic HTML
5. **Performance**: Use derived values and effects appropriately

## Testing Components

All components should include:

- Unit tests for logic
- Visual regression tests for UI
- Accessibility tests
- Integration tests for complex interactions

---

*Total components documented: ${this.components.length}*
*Last updated: ${new Date().toISOString()}*
`;

		await writeFile(join(this.outputDir, 'design-system.md'), content);
	}

	private calculateRuneStatistics(): Record<string, number> {
		const stats: Record<string, number> = {};

		for (const component of this.components) {
			for (const rune of component.runes) {
				stats[rune.type] = (stats[rune.type] || 0) + rune.count;
			}
		}

		return stats;
	}

	private async generateComponentIndex(): Promise<void> {
		const content = `# Component Documentation Index

*Auto-generated index of all BuildOS components*

## Quick Navigation

- [Design System Overview](./design-system.md) - Svelte 5 patterns and architecture
- [Brain Dump Components](#brain-dump-components) - Components for brain dump workflow
- [Project Components](#project-components) - Project and task management
- [UI Components](#ui-components) - Reusable interface elements

## All Components (${this.components.length})

${this.components
	.sort((a, b) => a.name.localeCompare(b.name))
	.map((c) => {
		const category = this.categorizeComponent(c.path);
		return `- [${c.name}](./${category}/${c.name}.md) - ${c.description}`;
	})
	.join('\n')}

## By Category

### Brain Dump Components

${
	this.components
		.filter((c) => c.path.includes('brain-dump'))
		.map((c) => `- [${c.name}](./brain-dump/${c.name}.md)`)
		.join('\n') || '- No brain dump specific components found'
}

### Project Components

${
	this.components
		.filter((c) => c.path.includes('project'))
		.map((c) => `- [${c.name}](./projects/${c.name}.md)`)
		.join('\n') || '- No project specific components found'
}

### UI Components

${
	this.components
		.filter(
			(c) =>
				c.path.includes('ui') ||
				(!c.path.includes('brain-dump') && !c.path.includes('project'))
		)
		.map((c) => `- [${c.name}](./ui/${c.name}.md)`)
		.join('\n') || '- No UI components found'
}

---

*Last updated: ${new Date().toISOString()}*
`;

		await writeFile(join(this.outputDir, 'README.md'), content);
	}
}

async function main() {
	const generator = new ComponentDocumentationGenerator();
	await generator.generate();
}

if (require.main === module) {
	main().catch(console.error);
}

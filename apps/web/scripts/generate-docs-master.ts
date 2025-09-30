// apps/web/scripts/generate-docs-master.ts

/**
 * Master documentation generation script
 * Orchestrates all documentation generators and provides comprehensive reporting
 */

import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface GeneratorTask {
	name: string;
	script: string;
	description: string;
	category: 'core' | 'api' | 'architecture' | 'monitoring' | 'validation';
	dependencies?: string[];
	optional?: boolean;
}

interface GenerationResult {
	task: string;
	success: boolean;
	duration: number;
	output: string[];
	error?: string;
}

class DocumentationMaster {
	private readonly tasks: GeneratorTask[] = [
		// Core documentation tasks
		{
			name: 'schema',
			script: 'gen:schema',
			description: 'Generate database schema documentation',
			category: 'core'
		},
		{
			name: 'types',
			script: 'gen:types',
			description: 'Generate TypeScript type documentation',
			category: 'core'
		},

		// API documentation tasks
		{
			name: 'api-docs',
			script: 'gen:api-docs',
			description: 'Generate comprehensive API documentation',
			category: 'api',
			dependencies: ['types']
		},

		// Component documentation
		{
			name: 'component-docs',
			script: 'gen:component-docs',
			description: 'Generate Svelte 5 component documentation',
			category: 'core'
		},

		// Architecture documentation
		{
			name: 'adr-index',
			script: 'gen:adr-index',
			description: 'Generate Architecture Decision Records index',
			category: 'architecture'
		},

		// Monitoring documentation
		{
			name: 'monitoring-docs',
			script: 'gen:monitoring-docs',
			description: 'Generate monitoring and operational documentation',
			category: 'monitoring'
		},

		// Context and metadata
		{
			name: 'project-context',
			script: 'gen:sctx',
			description: 'Generate streamlined project context',
			category: 'core'
		},
		{
			name: 'blog-context',
			script: 'gen:blog-context',
			description: 'Generate blog content context',
			category: 'core',
			optional: true
		},
		{
			name: 'sitemap',
			script: 'gen:sitemap',
			description: 'Generate site sitemap',
			category: 'core',
			optional: true
		},

		// Validation tasks
		{
			name: 'docs-links',
			script: 'validate:docs-links',
			description: 'Validate all documentation links',
			category: 'validation',
			optional: true
		},
		{
			name: 'docs-coverage',
			script: 'check:docs-coverage',
			description: 'Check documentation coverage',
			category: 'validation',
			optional: true
		}
	];

	private results: GenerationResult[] = [];
	private startTime = Date.now();

	async generate(
		options: {
			categories?: string[];
			skipOptional?: boolean;
			skipValidation?: boolean;
			parallel?: boolean;
		} = {}
	): Promise<void> {
		console.log('🚀 Starting BuildOS documentation generation...\n');

		// Filter tasks based on options
		let tasksToRun = this.filterTasks(options);

		console.log(`📋 Running ${tasksToRun.length} documentation tasks:\n`);
		tasksToRun.forEach((task) => {
			const optional = task.optional ? ' (optional)' : '';
			console.log(`  • ${task.name}: ${task.description}${optional}`);
		});
		console.log();

		// Execute tasks
		if (options.parallel) {
			await this.runTasksParallel(tasksToRun);
		} else {
			await this.runTasksSequential(tasksToRun);
		}

		// Generate summary report
		await this.generateReport();

		// Final summary
		this.printSummary();
	}

	private filterTasks(options: {
		categories?: string[];
		skipOptional?: boolean;
		skipValidation?: boolean;
	}): GeneratorTask[] {
		let tasks = [...this.tasks];

		// Filter by categories
		if (options.categories && options.categories.length > 0) {
			tasks = tasks.filter((task) => options.categories!.includes(task.category));
		}

		// Skip optional tasks
		if (options.skipOptional) {
			tasks = tasks.filter((task) => !task.optional);
		}

		// Skip validation tasks
		if (options.skipValidation) {
			tasks = tasks.filter((task) => task.category !== 'validation');
		}

		return tasks;
	}

	private async runTasksSequential(tasks: GeneratorTask[]): Promise<void> {
		for (const task of tasks) {
			await this.runTask(task);
		}
	}

	private async runTasksParallel(tasks: GeneratorTask[]): Promise<void> {
		// Group tasks by dependencies for parallel execution
		const taskGroups = this.groupTasksByDependencies(tasks);

		for (const group of taskGroups) {
			const promises = group.map((task) => this.runTask(task));
			await Promise.all(promises);
		}
	}

	private groupTasksByDependencies(tasks: GeneratorTask[]): GeneratorTask[][] {
		// Simple dependency grouping - tasks with no dependencies first
		const noDeps = tasks.filter((t) => !t.dependencies || t.dependencies.length === 0);
		const withDeps = tasks.filter((t) => t.dependencies && t.dependencies.length > 0);

		return [noDeps, withDeps]; // Simplified for now
	}

	private async runTask(task: GeneratorTask): Promise<void> {
		const startTime = Date.now();
		console.log(`🔄 Running: ${task.name}...`);

		try {
			const result = await this.executeScript(task.script);
			const duration = Date.now() - startTime;

			this.results.push({
				task: task.name,
				success: true,
				duration,
				output: result.output
			});

			console.log(`✅ ${task.name} completed in ${duration}ms`);
		} catch (error) {
			const duration = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);

			this.results.push({
				task: task.name,
				success: false,
				duration,
				output: [],
				error: errorMessage
			});

			if (task.optional) {
				console.log(`⚠️  ${task.name} failed (optional): ${errorMessage}`);
			} else {
				console.log(`❌ ${task.name} failed: ${errorMessage}`);
			}
		}
	}

	private executeScript(script: string): Promise<{ output: string[] }> {
		return new Promise((resolve, reject) => {
			const output: string[] = [];
			const child = spawn('pnpm', ['run', script], {
				stdio: ['pipe', 'pipe', 'pipe'],
				shell: true
			});

			child.stdout?.on('data', (data) => {
				output.push(data.toString());
			});

			child.stderr?.on('data', (data) => {
				output.push(data.toString());
			});

			child.on('close', (code) => {
				if (code === 0) {
					resolve({ output });
				} else {
					reject(new Error(`Script exited with code ${code}: ${output.join('')}`));
				}
			});

			child.on('error', (error) => {
				reject(error);
			});
		});
	}

	private async generateReport(): Promise<void> {
		const totalDuration = Date.now() - this.startTime;
		const successful = this.results.filter((r) => r.success).length;
		const failed = this.results.filter((r) => !r.success).length;

		const report = `# Documentation Generation Report

*Generated on: ${new Date().toISOString()}*

## Summary

- **Total Tasks**: ${this.results.length}
- **Successful**: ${successful}
- **Failed**: ${failed}
- **Total Duration**: ${totalDuration}ms
- **Success Rate**: ${Math.round((successful / this.results.length) * 100)}%

## Task Results

| Task | Status | Duration | Category | Description |
|------|--------|----------|----------|-------------|
${this.results
	.map((result) => {
		const task = this.tasks.find((t) => t.name === result.task);
		const status = result.success ? '✅ Success' : '❌ Failed';
		const duration = `${result.duration}ms`;
		return `| ${result.task} | ${status} | ${duration} | ${task?.category || 'unknown'} | ${task?.description || ''} |`;
	})
	.join('\n')}

## Failed Tasks

${
	this.results
		.filter((r) => !r.success)
		.map(
			(result) => `### ${result.task}

**Error**: ${result.error || 'Unknown error'}

**Output**:
\`\`\`
${result.output.join('')}
\`\`\`
`
		)
		.join('\n') || 'No failed tasks.'
}

## Performance Analysis

### By Category

${this.getCategoryStats()
	.map(
		(stat) =>
			`- **${stat.category}**: ${stat.count} tasks, ${stat.totalDuration}ms total, ${stat.avgDuration}ms average`
	)
	.join('\n')}

### Slowest Tasks

${this.results
	.sort((a, b) => b.duration - a.duration)
	.slice(0, 5)
	.map((r) => `- **${r.task}**: ${r.duration}ms`)
	.join('\n')}

## Generated Documentation

The following documentation has been generated or updated:

### Core Documentation
- Database schema documentation (\`docs/technical/database/\`)
- TypeScript type definitions (\`docs/technical/api/types.md\`)
- Component documentation (\`docs/technical/components/\`)
- Project context (\`docs/development/sproject-context.json\`)

### API Documentation
- API route documentation (\`docs/technical/api/\`)
- OpenAPI specification (\`docs/technical/api/openapi.json\`)
- Interactive API docs (\`static/docs/api.html\`)

### Architecture Documentation
- Architecture Decision Records (\`docs/technical/architecture/decisions/\`)
- ADR index and templates

### Monitoring Documentation
- Monitoring overview (\`docs/technical/deployment/monitoring.md\`)
- Metrics reference (\`docs/technical/deployment/metrics-reference.md\`)
- Alerts guide (\`docs/technical/deployment/alerts-guide.md\`)
- Operational runbooks (\`docs/technical/deployment/runbooks/\`)

## Next Steps

1. Review any failed tasks and address issues
2. Update documentation links and cross-references
3. Commit generated documentation to version control
4. Deploy updated documentation to production

---

*Report generated by BuildOS Documentation Master*
`;

		const outputDir = 'docs/reports';
		if (!existsSync(outputDir)) {
			await mkdir(outputDir, { recursive: true });
		}

		const reportPath = join(
			outputDir,
			`generation-report-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.md`
		);
		await writeFile(reportPath, report);

		console.log(`\n📊 Detailed report saved to: ${reportPath}`);
	}

	private getCategoryStats() {
		const categories = [...new Set(this.tasks.map((t) => t.category))];
		return categories.map((category) => {
			const categoryResults = this.results.filter((r) => {
				const task = this.tasks.find((t) => t.name === r.task);
				return task?.category === category;
			});

			const totalDuration = categoryResults.reduce((sum, r) => sum + r.duration, 0);
			const avgDuration = Math.round(totalDuration / categoryResults.length);

			return {
				category,
				count: categoryResults.length,
				totalDuration,
				avgDuration
			};
		});
	}

	private printSummary(): void {
		const totalDuration = Date.now() - this.startTime;
		const successful = this.results.filter((r) => r.success).length;
		const failed = this.results.filter((r) => !r.success).length;

		console.log(`\n${'='.repeat(50)}`);
		console.log('📈 DOCUMENTATION GENERATION SUMMARY');
		console.log(`${'='.repeat(50)}`);
		console.log(`Total Duration: ${totalDuration}ms`);
		console.log(`Tasks Completed: ${successful}/${this.results.length}`);
		console.log(`Success Rate: ${Math.round((successful / this.results.length) * 100)}%`);

		if (failed > 0) {
			console.log(`\n⚠️  Failed Tasks (${failed}):`);
			this.results
				.filter((r) => !r.success)
				.forEach((result) => {
					const task = this.tasks.find((t) => t.name === result.task);
					console.log(`  • ${result.task}: ${result.error}`);
				});
		}

		console.log(`\n🎉 Documentation generation complete!`);
	}
}

async function main() {
	const args = process.argv.slice(2);
	const options: any = {
		categories: [],
		skipOptional: false,
		skipValidation: false,
		parallel: false
	};

	// Parse command line arguments
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '--categories':
				options.categories = args[++i]?.split(',') || [];
				break;
			case '--skip-optional':
				options.skipOptional = true;
				break;
			case '--skip-validation':
				options.skipValidation = true;
				break;
			case '--parallel':
				options.parallel = true;
				break;
			case '--help':
				printHelp();
				return;
		}
	}

	const master = new DocumentationMaster();
	await master.generate(options);
}

function printHelp(): void {
	console.log(`
BuildOS Documentation Generation Master

Usage: tsx scripts/generate-docs-master.ts [options]

Options:
  --categories <list>    Run only specified categories (comma-separated)
                        Available: core, api, architecture, monitoring, validation
  --skip-optional       Skip optional documentation tasks
  --skip-validation     Skip validation tasks
  --parallel           Run independent tasks in parallel
  --help               Show this help message

Examples:
  # Generate all documentation
  tsx scripts/generate-docs-master.ts

  # Generate only core documentation
  tsx scripts/generate-docs-master.ts --categories core

  # Generate all except validation, skip optional
  tsx scripts/generate-docs-master.ts --skip-validation --skip-optional

  # Generate in parallel (faster)
  tsx scripts/generate-docs-master.ts --parallel

Categories:
  core         - Schema, types, components, project context
  api          - API routes, endpoints, OpenAPI specs
  architecture - ADRs, design decisions
  monitoring   - Metrics, alerts, runbooks
  validation   - Link checking, coverage analysis
`);
}

if (require.main === module) {
	main().catch(console.error);
}

// apps/web/scripts/watch-docs.ts

/**
 * Watch script for automatic documentation generation during development
 * Monitors file changes and regenerates relevant documentation
 */

import { watch } from 'fs';
import { spawn } from 'child_process';
import { join, relative } from 'path';
import { debounce } from 'lodash-es';

interface WatchRule {
	patterns: string[];
	description: string;
	scripts: string[];
	debounceMs?: number;
}

class DocumentationWatcher {
	private readonly watchRules: WatchRule[] = [
		{
			patterns: ['src/lib/database.schema.ts', 'src/lib/database.types.ts'],
			description: 'Database schema changes',
			scripts: ['gen:schema', 'gen:types'],
			debounceMs: 1000
		},
		{
			patterns: ['src/routes/api/**/*.ts'],
			description: 'API route changes',
			scripts: ['gen:api-docs'],
			debounceMs: 2000
		},
		{
			patterns: ['src/lib/components/**/*.svelte'],
			description: 'Component changes',
			scripts: ['gen:component-docs'],
			debounceMs: 2000
		},
		{
			patterns: ['src/lib/types/**/*.ts'],
			description: 'Type definition changes',
			scripts: ['gen:types'],
			debounceMs: 1000
		},
		{
			patterns: ['docs/technical/architecture/decisions/*.md'],
			description: 'ADR changes',
			scripts: ['gen:adr-index'],
			debounceMs: 500
		},
		{
			patterns: ['src/lib/services/**/*.ts'],
			description: 'Service layer changes',
			scripts: ['gen:types', 'gen:api-docs'],
			debounceMs: 2000
		}
	];

	private readonly watchers: any[] = [];
	private readonly debouncedHandlers = new Map<string, Function>();

	async start(): Promise<void> {
		console.log('👀 Starting BuildOS documentation watcher...\n');

		// Initialize debounced handlers
		for (const rule of this.watchRules) {
			const key = rule.patterns.join(',');
			this.debouncedHandlers.set(
				key,
				debounce(() => this.handleFileChange(rule), rule.debounceMs || 1000)
			);
		}

		// Set up watchers for each rule
		for (const rule of this.watchRules) {
			await this.setupWatcher(rule);
		}

		console.log('📝 Watching for documentation changes...');
		console.log('   Press Ctrl+C to stop\n');

		// Keep the process alive
		process.on('SIGINT', () => {
			console.log('\n🛑 Stopping documentation watcher...');
			this.stop();
			process.exit(0);
		});
	}

	private async setupWatcher(rule: WatchRule): Promise<void> {
		for (const pattern of rule.patterns) {
			try {
				// Convert glob patterns to actual paths for watching
				const watchPath = this.resolveWatchPath(pattern);
				console.log(`📁 Watching: ${pattern} → ${rule.description}`);

				const watcher = watch(watchPath, { recursive: true }, (eventType, filename) => {
					if (filename && this.shouldProcessFile(filename, rule)) {
						const key = rule.patterns.join(',');
						const handler = this.debouncedHandlers.get(key);
						if (handler) {
							handler();
						}
					}
				});

				this.watchers.push(watcher);
			} catch (error) {
				console.warn(`⚠️  Cannot watch ${pattern}: ${error}`);
			}
		}
	}

	private resolveWatchPath(pattern: string): string {
		// Convert glob patterns to watchable directories
		if (pattern.includes('**')) {
			return pattern.split('/**')[0];
		}
		if (pattern.includes('*')) {
			return pattern.substring(0, pattern.lastIndexOf('/'));
		}
		return pattern;
	}

	private shouldProcessFile(filename: string, rule: WatchRule): boolean {
		// Check if the changed file matches any of the rule patterns
		for (const pattern of rule.patterns) {
			if (this.matchesPattern(filename, pattern)) {
				return true;
			}
		}
		return false;
	}

	private matchesPattern(filename: string, pattern: string): boolean {
		// Simple pattern matching - could be enhanced with a proper glob library
		if (pattern.includes('**')) {
			const [prefix, suffix] = pattern.split('/**');
			return filename.startsWith(prefix) && filename.endsWith(suffix.replace('*', ''));
		}
		if (pattern.includes('*')) {
			const [prefix, suffix] = pattern.split('*');
			return filename.startsWith(prefix) && filename.endsWith(suffix);
		}
		return filename === pattern;
	}

	private async handleFileChange(rule: WatchRule): Promise<void> {
		console.log(`\n🔄 ${rule.description} detected, regenerating documentation...`);

		for (const script of rule.scripts) {
			try {
				console.log(`   Running: pnpm run ${script}`);
				await this.executeScript(script);
				console.log(`   ✅ ${script} completed`);
			} catch (error) {
				console.log(`   ❌ ${script} failed: ${error}`);
			}
		}

		console.log(`✨ Documentation updated for: ${rule.description}\n`);
	}

	private executeScript(script: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const child = spawn('pnpm', ['run', script], {
				stdio: ['pipe', 'pipe', 'pipe'],
				shell: true
			});

			let output = '';
			child.stdout?.on('data', (data) => {
				output += data.toString();
			});

			child.stderr?.on('data', (data) => {
				output += data.toString();
			});

			child.on('close', (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`Script exited with code ${code}: ${output}`));
				}
			});

			child.on('error', (error) => {
				reject(error);
			});
		});
	}

	private stop(): void {
		for (const watcher of this.watchers) {
			watcher.close();
		}
		console.log('👋 Documentation watcher stopped');
	}
}

class SimpleWatcher {
	// Fallback implementation without lodash
	private readonly rules: WatchRule[];
	private readonly timeouts = new Map<string, NodeJS.Timeout>();

	constructor() {
		this.rules = [
			{
				patterns: ['src/lib/database.schema.ts'],
				description: 'Database schema',
				scripts: ['gen:schema'],
				debounceMs: 1000
			},
			{
				patterns: ['src/routes/api'],
				description: 'API routes',
				scripts: ['gen:api-docs'],
				debounceMs: 2000
			},
			{
				patterns: ['src/lib/components'],
				description: 'Components',
				scripts: ['gen:component-docs'],
				debounceMs: 2000
			}
		];
	}

	async start(): Promise<void> {
		console.log('👀 Starting simple documentation watcher...\n');

		for (const rule of this.rules) {
			for (const pattern of rule.patterns) {
				console.log(`📁 Watching: ${pattern}`);

				watch(pattern, { recursive: true }, (eventType, filename) => {
					if (filename) {
						this.handleFileChange(rule, filename);
					}
				});
			}
		}

		console.log('\n📝 Watching for changes... (Press Ctrl+C to stop)\n');

		process.on('SIGINT', () => {
			console.log('\n🛑 Stopping watcher...');
			process.exit(0);
		});
	}

	private handleFileChange(rule: WatchRule, filename: string): void {
		const key = rule.patterns.join(',') + filename;

		// Clear existing timeout
		const existingTimeout = this.timeouts.get(key);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		// Set new timeout
		const timeout = setTimeout(async () => {
			console.log(`\n🔄 ${rule.description} changed: ${filename}`);

			for (const script of rule.scripts) {
				try {
					console.log(`   Running: pnpm run ${script}`);
					await this.executeScript(script);
					console.log(`   ✅ ${script} completed`);
				} catch (error) {
					console.log(`   ❌ ${script} failed`);
				}
			}

			console.log(`✨ Documentation updated\n`);
		}, rule.debounceMs || 1000);

		this.timeouts.set(key, timeout);
	}

	private executeScript(script: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const child = spawn('pnpm', ['run', script], {
				stdio: 'inherit',
				shell: true
			});

			child.on('close', (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`Script exited with code ${code}`));
				}
			});

			child.on('error', reject);
		});
	}
}

async function main() {
	const args = process.argv.slice(2);
	const useSimple = args.includes('--simple') || args.includes('-s');

	try {
		if (useSimple) {
			console.log('Using simple watcher (no external dependencies)');
			const watcher = new SimpleWatcher();
			await watcher.start();
		} else {
			// Try to use the full watcher with lodash
			try {
				const watcher = new DocumentationWatcher();
				await watcher.start();
			} catch (error) {
				console.log('Full watcher unavailable, falling back to simple watcher');
				const watcher = new SimpleWatcher();
				await watcher.start();
			}
		}
	} catch (error) {
		console.error('❌ Failed to start documentation watcher:', error);
		process.exit(1);
	}
}

if (require.main === module) {
	main().catch(console.error);
}

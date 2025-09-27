#!/usr/bin/env tsx

/**
 * Check documentation coverage across the codebase
 * Ensures all components, services, and API endpoints are documented
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative, basename } from 'path';
import { existsSync } from 'fs';

interface ComponentInfo {
	path: string;
	name: string;
	documented: boolean;
	documentationPath?: string;
}

interface ServiceInfo {
	path: string;
	name: string;
	documented: boolean;
	documentationPath?: string;
}

interface APIEndpointInfo {
	path: string;
	methods: string[];
	documented: boolean;
	documentationPath?: string;
}

class DocumentationCoverageChecker {
	private readonly components: ComponentInfo[] = [];
	private readonly services: ServiceInfo[] = [];
	private readonly apiEndpoints: APIEndpointInfo[] = [];

	async check(): Promise<void> {
		console.log('📊 Checking documentation coverage...\n');

		// Scan codebase
		await this.scanComponents();
		await this.scanServices();
		await this.scanAPIEndpoints();

		// Check documentation coverage
		await this.checkComponentDocumentation();
		await this.checkServiceDocumentation();
		await this.checkAPIDocumentation();

		// Generate report
		this.generateReport();
	}

	private async scanComponents(): Promise<void> {
		console.log('🔍 Scanning Svelte components...');
		await this.scanComponentDirectory('src/lib/components');
		await this.scanComponentDirectory('src/routes', true); // Only page components
		console.log(`   Found ${this.components.length} components\n`);
	}

	private async scanComponentDirectory(dir: string, pagesOnly = false): Promise<void> {
		if (!existsSync(dir)) return;

		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				await this.scanComponentDirectory(fullPath, pagesOnly);
			} else if (entry.name.endsWith('.svelte')) {
				// Skip page components unless we're specifically looking for them
				if (pagesOnly && !entry.name.startsWith('+')) continue;
				if (!pagesOnly && entry.name.startsWith('+')) continue;

				this.components.push({
					path: fullPath,
					name: basename(entry.name, '.svelte'),
					documented: false
				});
			}
		}
	}

	private async scanServices(): Promise<void> {
		console.log('🔍 Scanning service files...');
		await this.scanServiceDirectory('src/lib/services');
		await this.scanServiceDirectory('src/lib/utils');
		console.log(`   Found ${this.services.length} services\n`);
	}

	private async scanServiceDirectory(dir: string): Promise<void> {
		if (!existsSync(dir)) return;

		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				await this.scanServiceDirectory(fullPath);
			} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
				this.services.push({
					path: fullPath,
					name: basename(entry.name, '.ts'),
					documented: false
				});
			}
		}
	}

	private async scanAPIEndpoints(): Promise<void> {
		console.log('🔍 Scanning API endpoints...');
		await this.scanAPIDirectory('src/routes/api');
		console.log(`   Found ${this.apiEndpoints.length} API endpoints\n`);
	}

	private async scanAPIDirectory(dir: string): Promise<void> {
		if (!existsSync(dir)) return;

		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				await this.scanAPIDirectory(fullPath);
			} else if (entry.name === '+server.ts') {
				const content = await readFile(fullPath, 'utf-8');
				const methods = this.extractHTTPMethods(content);

				if (methods.length > 0) {
					// Convert file path to API route
					const routePath = this.filePathToAPIRoute(fullPath);

					this.apiEndpoints.push({
						path: routePath,
						methods,
						documented: false
					});
				}
			}
		}
	}

	private extractHTTPMethods(content: string): string[] {
		const methods: string[] = [];
		const methodRegex = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)/g;
		let match;

		while ((match = methodRegex.exec(content)) !== null) {
			methods.push(match[1]);
		}

		return methods;
	}

	private filePathToAPIRoute(filePath: string): string {
		const relativePath = relative('src/routes/api', filePath);
		const routePath = '/' + relativePath
			.replace(/\/\+server\.ts$/, '')
			.split('/')
			.map(segment => {
				if (segment.startsWith('[') && segment.endsWith(']')) {
					return `{${segment.slice(1, -1)}}`;
				}
				return segment;
			})
			.join('/');

		return routePath === '/.' ? '/' : routePath;
	}

	private async checkComponentDocumentation(): Promise<void> {
		console.log('📄 Checking component documentation...');

		for (const component of this.components) {
			// Check if component is documented
			const possiblePaths = [
				`docs/technical/components/${this.categorizeComponent(component.path)}/${component.name}.md`,
				`docs/technical/components/${component.name}.md`,
				`docs/components/${component.name}.md`
			];

			for (const docPath of possiblePaths) {
				if (existsSync(docPath)) {
					component.documented = true;
					component.documentationPath = docPath;
					break;
				}
			}
		}

		const documented = this.components.filter(c => c.documented).length;
		console.log(`   ${documented}/${this.components.length} components documented\n`);
	}

	private categorizeComponent(path: string): string {
		if (path.includes('brain-dump')) return 'brain-dump';
		if (path.includes('project')) return 'projects';
		if (path.includes('ui')) return 'ui';
		if (path.includes('icons')) return 'icons';
		return 'ui';
	}

	private async checkServiceDocumentation(): Promise<void> {
		console.log('📄 Checking service documentation...');

		for (const service of this.services) {
			// Check if service is documented
			const possiblePaths = [
				`docs/technical/services/${service.name}.md`,
				`docs/services/${service.name}.md`,
				`docs/technical/api/services/${service.name}.md`
			];

			for (const docPath of possiblePaths) {
				if (existsSync(docPath)) {
					service.documented = true;
					service.documentationPath = docPath;
					break;
				}
			}

			// Also check if mentioned in main service docs
			if (!service.documented) {
				const mainServiceDocs = [
					'docs/technical/services/brain-dump-service.md',
					'docs/technical/services/project-service.md',
					'docs/technical/services/calendar-service.md'
				];

				for (const docPath of mainServiceDocs) {
					if (existsSync(docPath)) {
						const content = await readFile(docPath, 'utf-8');
						if (content.includes(service.name)) {
							service.documented = true;
							service.documentationPath = docPath;
							break;
						}
					}
				}
			}
		}

		const documented = this.services.filter(s => s.documented).length;
		console.log(`   ${documented}/${this.services.length} services documented\n`);
	}

	private async checkAPIDocumentation(): Promise<void> {
		console.log('📄 Checking API endpoint documentation...');

		for (const endpoint of this.apiEndpoints) {
			// Check if endpoint is documented
			const possiblePaths = [
				'docs/technical/api/routes-reference.md',
				'docs/technical/api/endpoints',
				'docs/api'
			];

			for (const docPath of possiblePaths) {
				if (existsSync(docPath)) {
					if (docPath.endsWith('.md')) {
						// Check if mentioned in main doc
						const content = await readFile(docPath, 'utf-8');
						if (content.includes(endpoint.path)) {
							endpoint.documented = true;
							endpoint.documentationPath = docPath;
							break;
						}
					} else {
						// Check for endpoint-specific files
						const feature = endpoint.path.split('/')[1] || 'root';
						const featurePath = join(docPath, `${feature}.md`);
						if (existsSync(featurePath)) {
							const content = await readFile(featurePath, 'utf-8');
							if (content.includes(endpoint.path)) {
								endpoint.documented = true;
								endpoint.documentationPath = featurePath;
								break;
							}
						}
					}
				}
			}
		}

		const documented = this.apiEndpoints.filter(e => e.documented).length;
		console.log(`   ${documented}/${this.apiEndpoints.length} API endpoints documented\n`);
	}

	private generateReport(): void {
		console.log(`${'='.repeat(60)}`);
		console.log('📊 DOCUMENTATION COVERAGE REPORT');
		console.log(`${'='.repeat(60)}`);

		// Summary statistics
		const componentCoverage = this.calculateCoverage(this.components);
		const serviceCoverage = this.calculateCoverage(this.services);
		const apiCoverage = this.calculateCoverage(this.apiEndpoints);

		console.log('\n📈 Coverage Summary:');
		console.log(`   Components: ${componentCoverage.documented}/${componentCoverage.total} (${componentCoverage.percentage}%)`);
		console.log(`   Services: ${serviceCoverage.documented}/${serviceCoverage.total} (${serviceCoverage.percentage}%)`);
		console.log(`   API Endpoints: ${apiCoverage.documented}/${apiCoverage.total} (${apiCoverage.percentage}%)`);

		const overallCoverage = Math.round(
			((componentCoverage.documented + serviceCoverage.documented + apiCoverage.documented) /
			(componentCoverage.total + serviceCoverage.total + apiCoverage.total)) * 100
		);
		console.log(`\n🎯 Overall Coverage: ${overallCoverage}%`);

		// Undocumented items
		this.reportUndocumented();

		// Recommendations
		this.generateRecommendations(overallCoverage);

		// Exit with appropriate code
		if (overallCoverage < 70) {
			console.log('\n❌ Documentation coverage below acceptable threshold (70%)');
			process.exit(1);
		} else {
			console.log('\n✅ Documentation coverage acceptable');
		}
	}

	private calculateCoverage<T extends { documented: boolean }>(items: T[]): {
		documented: number;
		total: number;
		percentage: number;
	} {
		const documented = items.filter(item => item.documented).length;
		const total = items.length;
		const percentage = total > 0 ? Math.round((documented / total) * 100) : 100;

		return { documented, total, percentage };
	}

	private reportUndocumented(): void {
		const undocumentedComponents = this.components.filter(c => !c.documented);
		const undocumentedServices = this.services.filter(s => !s.documented);
		const undocumentedEndpoints = this.apiEndpoints.filter(e => !e.documented);

		if (undocumentedComponents.length > 0) {
			console.log('\n❌ Undocumented Components:');
			for (const component of undocumentedComponents.slice(0, 10)) {
				console.log(`   • ${component.name} (${component.path})`);
			}
			if (undocumentedComponents.length > 10) {
				console.log(`   ... and ${undocumentedComponents.length - 10} more`);
			}
		}

		if (undocumentedServices.length > 0) {
			console.log('\n❌ Undocumented Services:');
			for (const service of undocumentedServices.slice(0, 10)) {
				console.log(`   • ${service.name} (${service.path})`);
			}
			if (undocumentedServices.length > 10) {
				console.log(`   ... and ${undocumentedServices.length - 10} more`);
			}
		}

		if (undocumentedEndpoints.length > 0) {
			console.log('\n❌ Undocumented API Endpoints:');
			for (const endpoint of undocumentedEndpoints.slice(0, 10)) {
				console.log(`   • ${endpoint.methods.join(', ')} ${endpoint.path}`);
			}
			if (undocumentedEndpoints.length > 10) {
				console.log(`   ... and ${undocumentedEndpoints.length - 10} more`);
			}
		}
	}

	private generateRecommendations(coverage: number): void {
		console.log('\n💡 Recommendations:');

		if (coverage < 50) {
			console.log('   • Set up basic documentation structure');
			console.log('   • Focus on core components and services first');
			console.log('   • Use automated documentation generation');
		} else if (coverage < 70) {
			console.log('   • Document remaining critical components');
			console.log('   • Add API endpoint documentation');
			console.log('   • Create usage examples');
		} else if (coverage < 90) {
			console.log('   • Document edge case components');
			console.log('   • Add comprehensive examples');
			console.log('   • Improve existing documentation quality');
		} else {
			console.log('   • Maintain current documentation quality');
			console.log('   • Add automated link validation');
			console.log('   • Consider adding tutorials and guides');
		}

		console.log('\n📚 Next Steps:');
		console.log('   1. Run: pnpm run gen:component-docs');
		console.log('   2. Run: pnpm run gen:api-docs');
		console.log('   3. Review and enhance generated documentation');
		console.log('   4. Add usage examples and best practices');
	}
}

async function main() {
	const checker = new DocumentationCoverageChecker();
	await checker.check();
}

if (require.main === module) {
	main().catch(console.error);
}
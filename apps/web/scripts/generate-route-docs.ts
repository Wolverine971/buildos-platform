// scripts/generate-route-docs.ts
/**
 * Generate API route documentation from SvelteKit route structure
 * Based on the reorganization plan recommendations
 */

import { readdir, readFile, writeFile, stat, mkdir } from 'fs/promises';
import { join, relative, dirname } from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
const babelTraverse = traverse.default || traverse;
import * as t from '@babel/types';

interface RouteInfo {
	path: string;
	relativePath: string;
	methods: string[];
	types: string;
	description: string;
	parameters: Parameter[];
	responses: Response[];
	authRequired: boolean;
}

interface Parameter {
	name: string;
	type: string;
	description: string;
	required: boolean;
	location: 'query' | 'path' | 'body';
}

interface Response {
	status: number;
	description: string;
	type: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

async function scanRoutes(dir: string, basePath = ''): Promise<RouteInfo[]> {
	const routes: RouteInfo[] = [];
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			// Handle directory-based routing (including dynamic routes)
			const nestedPath =
				entry.name.startsWith('[') && entry.name.endsWith(']')
					? `${basePath}/{${entry.name.slice(1, -1)}}` // Convert [id] to {id}
					: `${basePath}/${entry.name}`;

			const nestedRoutes = await scanRoutes(fullPath, nestedPath);
			routes.push(...nestedRoutes);
		} else if (entry.name === '+server.ts' || entry.name === '+server.js') {
			// Found an API route file
			const routeInfo = await analyzeRouteFile(fullPath, basePath || '/');
			if (routeInfo.methods.length > 0) {
				routes.push(routeInfo);
			}
		}
	}

	return routes;
}

async function analyzeRouteFile(filePath: string, routePath: string): Promise<RouteInfo> {
	const content = await readFile(filePath, 'utf-8');
	const relativePath = relative(process.cwd(), filePath);

	const routeInfo: RouteInfo = {
		path: routePath,
		relativePath,
		methods: [],
		types: '',
		description: '',
		parameters: [],
		responses: [],
		authRequired: false
	};

	try {
		const ast = parse(content, {
			sourceType: 'module',
			plugins: ['typescript', 'decorators-legacy']
		});

		// Extract exports and analyze them
		babelTraverse(ast, {
			ExportNamedDeclaration(path) {
				if (t.isVariableDeclaration(path.node.declaration)) {
					path.node.declaration.declarations.forEach((declarator) => {
						if (
							t.isIdentifier(declarator.id) &&
							HTTP_METHODS.includes(declarator.id.name)
						) {
							routeInfo.methods.push(declarator.id.name);
						}
					});
				}
			},
			// Look for authentication checks
			CallExpression(path) {
				if (t.isMemberExpression(path.node.callee)) {
					const obj = path.node.callee.object;
					const prop = path.node.callee.property;

					if (
						t.isIdentifier(obj, { name: 'ApiResponse' }) &&
						t.isIdentifier(prop, { name: 'unauthorized' })
					) {
						routeInfo.authRequired = true;
					}
				}
			}
		});

		// Extract JSDoc comments and other metadata
		const comments = ast.comments || [];
		const fileComment = comments.find(
			(comment) => comment.value.includes('@description') || comment.value.includes('*')
		);

		if (fileComment) {
			routeInfo.description = extractDescription(fileComment.value);
		}

		// Extract parameter information from query parameter usage
		routeInfo.parameters = extractParameters(content, routePath);

		// Extract response types
		routeInfo.responses = extractResponses(content);

		// Extract TypeScript interfaces and types
		routeInfo.types = extractTypes(content);
	} catch (error) {
		console.warn(`Warning: Could not parse ${filePath}:`, error);
	}

	return routeInfo;
}

function extractDescription(comment: string): string {
	const lines = comment.split('\n').map((line) => line.trim().replace(/^\*\s?/, ''));
	const descriptionLine = lines.find((line) => line.includes('@description'));

	if (descriptionLine) {
		return descriptionLine.replace('@description', '').trim();
	}

	// Fallback: use first non-empty line
	const firstLine = lines.find((line) => line && !line.startsWith('//'));
	return firstLine || '';
}

function extractParameters(content: string, routePath: string): Parameter[] {
	const parameters: Parameter[] = [];

	// Extract path parameters from route
	const pathParams = routePath.match(/\{(\w+)\}/g);
	if (pathParams) {
		pathParams.forEach((param) => {
			const name = param.slice(1, -1);
			parameters.push({
				name,
				type: 'string',
				description: `Path parameter: ${name}`,
				required: true,
				location: 'path'
			});
		});
	}

	// Extract query parameters from searchParams usage
	const queryParamRegex = /url\.searchParams\.get\(['"`](\w+)['"`]\)/g;
	let match;
	while ((match = queryParamRegex.exec(content)) !== null) {
		const name = match[1];
		if (!parameters.some((p) => p.name === name)) {
			parameters.push({
				name,
				type: 'string',
				description: `Query parameter: ${name}`,
				required: false,
				location: 'query'
			});
		}
	}

	return parameters;
}

function extractResponses(content: string): Response[] {
	const responses: Response[] = [];

	// Common response patterns
	const responsePatterns = [
		{ pattern: /ApiResponse\.success/, status: 200, description: 'Success response' },
		{ pattern: /ApiResponse\.unauthorized/, status: 401, description: 'Unauthorized' },
		{ pattern: /ApiResponse\.notFound/, status: 404, description: 'Resource not found' },
		{ pattern: /ApiResponse\.databaseError/, status: 500, description: 'Database error' },
		{
			pattern: /ApiResponse\.internalError/,
			status: 500,
			description: 'Internal server error'
		},
		{ pattern: /ApiResponse\.badRequest/, status: 400, description: 'Bad request' }
	];

	responsePatterns.forEach(({ pattern, status, description }) => {
		if (pattern.test(content)) {
			responses.push({
				status,
				description,
				type: 'application/json'
			});
		}
	});

	return responses;
}

function extractTypes(content: string): string {
	const typeRegex = /interface\s+\w+\s*\{[^}]*\}|type\s+\w+\s*=\s*[^;]+;/g;
	const types = content.match(typeRegex) || [];
	return types.join('\n\n');
}

function generateMarkdown(routes: RouteInfo[]): string {
	const sortedRoutes = routes.sort((a, b) => a.path.localeCompare(b.path));

	let markdown = `# API Routes Documentation

*Auto-generated on ${new Date().toISOString()}*

This documentation is automatically generated from the SvelteKit route structure.

## Overview

Total endpoints: ${routes.length}

${sortedRoutes.map((route) => `- [${route.methods.join(', ')} ${route.path}](#${route.path.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()})`).join('\n')}

---

`;

	sortedRoutes.forEach((route) => {
		markdown += `## ${route.methods.join(', ')} ${route.path}

**File:** \`${route.relativePath}\`

${route.description ? `**Description:** ${route.description}\n\n` : ''}

${route.authRequired ? '🔒 **Authentication Required**\n\n' : ''}

### Parameters

`;

		if (route.parameters.length > 0) {
			markdown += `| Name | Type | Location | Required | Description |
|------|------|----------|----------|-------------|
${route.parameters.map((p) => `| ${p.name} | ${p.type} | ${p.location} | ${p.required ? 'Yes' : 'No'} | ${p.description} |`).join('\n')}

`;
		} else {
			markdown += 'No parameters\n\n';
		}

		markdown += '### Responses\n\n';

		if (route.responses.length > 0) {
			markdown += `| Status | Description | Content Type |
|--------|-------------|--------------|
${route.responses.map((r) => `| ${r.status} | ${r.description} | ${r.type} |`).join('\n')}

`;
		} else {
			markdown += 'No documented responses\n\n';
		}

		if (route.types) {
			markdown += `### Types

\`\`\`typescript
${route.types}
\`\`\`

`;
		}

		markdown += '---\n\n';
	});

	return markdown;
}

function generateOpenAPISpec(routes: RouteInfo[]): any {
	const spec = {
		openapi: '3.0.0',
		info: {
			title: 'BuildOS API',
			description: 'Auto-generated API documentation for BuildOS',
			version: '1.0.0'
		},
		servers: [
			{
				url: '/api',
				description: 'API server'
			}
		],
		paths: {} as any,
		components: {
			securitySchemes: {
				cookieAuth: {
					type: 'apiKey',
					in: 'cookie',
					name: 'sb-session'
				}
			}
		}
	};

	routes.forEach((route) => {
		const pathKey = route.path.replace(/^\/api/, '') || '/';

		if (!spec.paths[pathKey]) {
			spec.paths[pathKey] = {};
		}

		route.methods.forEach((method) => {
			const operation: any = {
				summary: route.description || `${method} ${route.path}`,
				parameters: route.parameters.map((p) => ({
					name: p.name,
					in: p.location,
					required: p.required,
					description: p.description,
					schema: { type: p.type }
				})),
				responses: {}
			};

			if (route.authRequired) {
				operation.security = [{ cookieAuth: [] }];
			}

			route.responses.forEach((r) => {
				operation.responses[r.status] = {
					description: r.description,
					content: {
						[r.type]: {
							schema: { type: 'object' }
						}
					}
				};
			});

			if (Object.keys(operation.responses).length === 0) {
				operation.responses['200'] = {
					description: 'Success',
					content: {
						'application/json': {
							schema: { type: 'object' }
						}
					}
				};
			}

			spec.paths[pathKey][method.toLowerCase()] = operation;
		});
	});

	return spec;
}

async function main() {
	console.log('🚀 Generating API route documentation...');

	const apiDir = join(process.cwd(), 'src/routes/api');
	const docsDir = join(process.cwd(), 'docs/technical/api');

	// Ensure docs directory exists
	await mkdir(docsDir, { recursive: true });

	try {
		const routes = await scanRoutes(apiDir, '/api');
		console.log(`📊 Found ${routes.length} API routes`);

		// Generate markdown documentation
		const markdown = generateMarkdown(routes);
		await writeFile(join(docsDir, 'routes-reference.md'), markdown);
		console.log('✅ Generated routes-reference.md');

		// Generate OpenAPI specification
		const openApiSpec = generateOpenAPISpec(routes);
		await writeFile(
			join(process.cwd(), 'static/openapi.json'),
			JSON.stringify(openApiSpec, null, 2)
		);
		console.log('✅ Generated openapi.json');

		// Generate summary file
		const summary = `# API Documentation Summary

Generated: ${new Date().toISOString()}
Total routes: ${routes.length}

## Routes by category:

${Object.entries(
	routes.reduce(
		(acc, route) => {
			const category = route.path.split('/')[2] || 'root';
			if (!acc[category]) acc[category] = [];
			acc[category].push(route);
			return acc;
		},
		{} as Record<string, RouteInfo[]>
	)
)
	.map(
		([category, routes]) =>
			`### ${category}\n${routes.map((r) => `- ${r.methods.join(', ')} ${r.path}`).join('\n')}`
	)
	.join('\n\n')}
`;

		await writeFile(join(docsDir, 'summary.md'), summary);
		console.log('✅ Generated summary.md');

		console.log('\n🎉 API documentation generation complete!');
		console.log(`📁 Files generated in: ${docsDir}`);
		console.log(`📁 OpenAPI spec: static/openapi.json`);
	} catch (error) {
		console.error('❌ Error generating documentation:', error);
		process.exit(1);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

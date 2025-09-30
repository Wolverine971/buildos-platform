// apps/web/scripts/generate-api-docs.ts
/**
 * Generate comprehensive API documentation including types and examples
 * Complements the route documentation generator
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, relative } from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
const babelTraverse = traverse.default || traverse;
import * as t from '@babel/types';

interface TypeDefinition {
	name: string;
	definition: string;
	file: string;
	description: string;
	properties: Property[];
}

interface Property {
	name: string;
	type: string;
	optional: boolean;
	description: string;
}

const TYPE_DIRS = ['src/lib/types', 'src/lib/database.types.ts', 'src/lib/database.schema.ts'];

async function extractTypes(): Promise<TypeDefinition[]> {
	const types: TypeDefinition[] = [];

	for (const typeDir of TYPE_DIRS) {
		const fullPath = join(process.cwd(), typeDir);
		try {
			await extractTypesFromPath(fullPath, types);
		} catch (error) {
			console.warn(`Warning: Could not read ${typeDir}`);
		}
	}

	return types;
}

async function extractTypesFromPath(path: string, types: TypeDefinition[]): Promise<void> {
	const fs = await import('fs/promises');
	const stats = await fs.stat(path);

	if (stats.isFile()) {
		if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
			await extractTypesFromFile(path, types);
		}
	} else if (stats.isDirectory()) {
		const entries = await readdir(path, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(path, entry.name);
			await extractTypesFromPath(fullPath, types);
		}
	}
}

async function extractTypesFromFile(filePath: string, types: TypeDefinition[]): Promise<void> {
	const content = await readFile(filePath, 'utf-8');
	const relativePath = relative(process.cwd(), filePath);

	try {
		const ast = parse(content, {
			sourceType: 'module',
			plugins: ['typescript', 'decorators-legacy']
		});

		babelTraverse(ast, {
			TSInterfaceDeclaration(path) {
				const interfaceName = path.node.id.name;
				const properties = extractInterfaceProperties(path.node);
				const comment = extractJSDocDescription(path);

				types.push({
					name: interfaceName,
					definition: generateTypeDefinition(path.node),
					file: relativePath,
					description: comment,
					properties
				});
			},
			TSTypeAliasDeclaration(path) {
				const typeName = path.node.id.name;
				const comment = extractJSDocDescription(path);

				types.push({
					name: typeName,
					definition: generateTypeAliasDefinition(path.node),
					file: relativePath,
					description: comment,
					properties: []
				});
			}
		});
	} catch (error) {
		console.warn(`Warning: Could not parse ${filePath}:`, error);
	}
}

function extractInterfaceProperties(node: t.TSInterfaceDeclaration): Property[] {
	const properties: Property[] = [];

	node.body.body.forEach((member) => {
		if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
			const name = member.key.name;
			const optional = member.optional || false;
			const type = member.typeAnnotation
				? generateTypeAnnotation(member.typeAnnotation.typeAnnotation)
				: 'unknown';

			properties.push({
				name,
				type,
				optional,
				description: ''
			});
		}
	});

	return properties;
}

function generateTypeDefinition(node: t.TSInterfaceDeclaration): string {
	const properties = node.body.body
		.map((member) => {
			if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
				const optional = member.optional ? '?' : '';
				const type = member.typeAnnotation
					? generateTypeAnnotation(member.typeAnnotation.typeAnnotation)
					: 'any';
				return `  ${member.key.name}${optional}: ${type}`;
			}
			return '';
		})
		.filter(Boolean);

	return `interface ${node.id.name} {\n${properties.join(';\n')};\n}`;
}

function generateTypeAliasDefinition(node: t.TSTypeAliasDeclaration): string {
	const type = generateTypeAnnotation(node.typeAnnotation);
	return `type ${node.id.name} = ${type}`;
}

function generateTypeAnnotation(node: t.TSType): string {
	if (t.isTSStringKeyword(node)) return 'string';
	if (t.isTSNumberKeyword(node)) return 'number';
	if (t.isTSBooleanKeyword(node)) return 'boolean';
	if (t.isTSVoidKeyword(node)) return 'void';
	if (t.isTSUndefinedKeyword(node)) return 'undefined';
	if (t.isTSNullKeyword(node)) return 'null';
	if (t.isTSAnyKeyword(node)) return 'any';

	if (t.isTSArrayType(node)) {
		return `${generateTypeAnnotation(node.elementType)}[]`;
	}

	if (t.isTSUnionType(node)) {
		return node.types.map(generateTypeAnnotation).join(' | ');
	}

	if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
		return node.typeName.name;
	}

	return 'unknown';
}

function extractJSDocDescription(path: any): string {
	const comments = path.node.leadingComments || [];
	const jsDocComment = comments.find(
		(comment: any) => comment.type === 'CommentBlock' && comment.value.includes('*')
	);

	if (jsDocComment) {
		const lines = jsDocComment.value
			.split('\n')
			.map((line: string) => line.trim().replace(/^\*\s?/, ''))
			.filter((line: string) => line && !line.startsWith('*'));

		return lines.join(' ').trim();
	}

	return '';
}

async function generateTypeDocumentation(types: TypeDefinition[]): Promise<string> {
	const sortedTypes = types.sort((a, b) => a.name.localeCompare(b.name));

	let markdown = `# API Types Documentation

*Auto-generated on ${new Date().toISOString()}*

This documentation covers all TypeScript interfaces and types used in the BuildOS API.

## Table of Contents

${sortedTypes.map((type) => `- [${type.name}](#${type.name.toLowerCase()})`).join('\n')}

---

`;

	sortedTypes.forEach((type) => {
		markdown += `## ${type.name}

**File:** \`${type.file}\`

${type.description ? `**Description:** ${type.description}\n\n` : ''}

\`\`\`typescript
${type.definition}
\`\`\`

`;

		if (type.properties.length > 0) {
			markdown += `### Properties

| Property | Type | Optional | Description |
|----------|------|----------|-------------|
${type.properties.map((p) => `| ${p.name} | \`${p.type}\` | ${p.optional ? 'Yes' : 'No'} | ${p.description || '-'} |`).join('\n')}

`;
		}

		markdown += '---\n\n';
	});

	return markdown;
}

async function generateRequestResponseTemplates(): Promise<string> {
	return `# API Request/Response Templates

*Auto-generated on ${new Date().toISOString()}*

This document provides templates for documenting API request and response formats.

## Standard Response Format

All API endpoints follow a consistent response format:

\`\`\`typescript
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}
\`\`\`

## Authentication

Most API endpoints require authentication via Supabase session cookies:

\`\`\`
Cookie: sb-session=<session-token>
\`\`\`

## Error Responses

Standard error response codes:

| Code | Description | Example |
|------|-------------|---------|
| 400 | Bad Request | Invalid input parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource does not exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

## Common Request Parameters

### Pagination Parameters

For endpoints that support pagination:

\`\`\`typescript
interface PaginationParams {
  page?: number;     // Page number (default: 1)
  limit?: number;    // Items per page (default: 20, max: 100)
}
\`\`\`

### Search Parameters

For endpoints that support searching:

\`\`\`typescript
interface SearchParams {
  search?: string;   // Search query
  year?: string;     // Filter by year (YYYY)
  day?: string;      // Filter by day (YYYY-MM-DD)
}
\`\`\`

## Response Examples

### Success Response

\`\`\`json
{
  "success": true,
  "data": {
    "id": "123",
    "name": "Example Project",
    "status": "active"
  }
}
\`\`\`

### Paginated Response

\`\`\`json
{
  "success": true,
  "data": [
    { "id": "1", "name": "Item 1" },
    { "id": "2", "name": "Item 2" }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
\`\`\`

### Error Response

\`\`\`json
{
  "success": false,
  "error": {
    "message": "Resource not found",
    "code": "NOT_FOUND",
    "details": {
      "resource": "project",
      "id": "invalid-id"
    }
  }
}
\`\`\`
`;
}

async function generateSwaggerUIPage(): Promise<string> {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BuildOS API Documentation</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .header {
            background: #1a1a1a;
            color: white;
            padding: 1rem 2rem;
            border-bottom: 1px solid #333;
        }
        .header h1 {
            margin: 0;
            font-size: 1.5rem;
        }
        .header p {
            margin: 0.5rem 0 0 0;
            opacity: 0.8;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        .nav {
            display: flex;
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .nav a {
            display: inline-block;
            padding: 0.5rem 1rem;
            background: #f0f0f0;
            color: #333;
            text-decoration: none;
            border-radius: 4px;
            transition: background 0.2s;
        }
        .nav a:hover {
            background: #e0e0e0;
        }
        .nav a.active {
            background: #007acc;
            color: white;
        }
        #swagger-ui {
            min-height: 600px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>BuildOS API Documentation</h1>
        <p>Interactive API documentation and testing interface</p>
    </div>

    <div class="container">
        <div class="nav">
            <a href="#" class="active" onclick="showSwagger()">Interactive API</a>
            <a href="/docs/technical/api/routes-reference.md" target="_blank">Route Reference</a>
            <a href="/docs/technical/api/types.md" target="_blank">Type Definitions</a>
            <a href="/docs/technical/api/templates.md" target="_blank">Request/Response Templates</a>
        </div>

        <div id="swagger-ui"></div>
    </div>

    <script src="https://unpkg.com/swagger-ui-dist@latest/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@latest/swagger-ui-standalone-preset.js"></script>
    <script>
        function showSwagger() {
            SwaggerUIBundle({
                url: '/openapi.json',
                dom_id: '#swagger-ui',
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                layout: "StandaloneLayout",
                deepLinking: true,
                showExtensions: true,
                showCommonExtensions: true,
                defaultModelsExpandDepth: 2,
                defaultModelExpandDepth: 2,
                tryItOutEnabled: true,
                supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
                onComplete: function() {
                    console.log('Swagger UI loaded');
                }
            });
        }

        // Initialize Swagger UI on page load
        document.addEventListener('DOMContentLoaded', showSwagger);
    </script>
</body>
</html>`;
}

async function main() {
	console.log('🚀 Generating comprehensive API documentation...');

	const docsDir = join(process.cwd(), 'docs/technical/api');

	// Ensure docs directory exists
	await mkdir(docsDir, { recursive: true });
	await mkdir(join(process.cwd(), 'static/docs'), { recursive: true });

	try {
		// Extract TypeScript types
		console.log('📊 Extracting TypeScript types...');
		const types = await extractTypes();
		console.log(`Found ${types.length} type definitions`);

		// Generate type documentation
		const typesDocs = await generateTypeDocumentation(types);
		await writeFile(join(docsDir, 'types.md'), typesDocs);
		console.log('✅ Generated types.md');

		// Generate request/response templates
		const templates = await generateRequestResponseTemplates();
		await writeFile(join(docsDir, 'templates.md'), templates);
		console.log('✅ Generated templates.md');

		// Generate Swagger UI page
		const swaggerPage = await generateSwaggerUIPage();
		await writeFile(join(process.cwd(), 'static/docs/api.html'), swaggerPage);
		console.log('✅ Generated interactive API documentation page');

		// Generate index file
		const index = `# API Documentation

Welcome to the BuildOS API documentation.

## Quick Links

- [📖 Interactive API Documentation](/docs/api.html) - Test API endpoints directly in your browser
- [🛠 Route Reference](./routes-reference.md) - Complete list of all API endpoints
- [📋 Type Definitions](./types.md) - TypeScript interfaces and types
- [📝 Request/Response Templates](./templates.md) - Standard formats and examples

## Getting Started

1. **Authentication**: Most endpoints require authentication via Supabase session cookies
2. **Base URL**: All API endpoints are prefixed with \`/api\`
3. **Response Format**: All responses follow a standard JSON format with \`success\`, \`data\`, and \`error\` fields
4. **Rate Limiting**: API requests are rate-limited to prevent abuse

## API Categories

- **Authentication**: User login, registration, and session management
- **Brain Dumps**: Stream-of-consciousness input processing
- **Projects**: Project management and organization
- **Tasks**: Task creation, updates, and scheduling
- **Calendar**: Google Calendar integration
- **Daily Briefs**: Automated daily summaries
- **Admin**: Administrative functions and analytics

## Development

The API documentation is automatically generated from the SvelteKit route structure. To regenerate:

\`\`\`bash
pnpm run docs:api
\`\`\`

Generated on: ${new Date().toISOString()}
`;

		await writeFile(join(docsDir, 'README.md'), index);
		console.log('✅ Generated API documentation index');

		console.log('\n🎉 Comprehensive API documentation generation complete!');
		console.log(`📁 Documentation files: ${docsDir}`);
		console.log(`🌐 Interactive docs: /docs/api.html`);
	} catch (error) {
		console.error('❌ Error generating API documentation:', error);
		process.exit(1);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

// apps/web/scripts/extract-database-schema.ts
import fs from 'fs';
import path from 'path';

// Read the database.types.ts file
const databaseTypesPath = path.join(process.cwd(), 'src/lib/database.types.ts');
const content = fs.readFileSync(databaseTypesPath, 'utf-8');

// Extract the Tables section
const tablesMatch = content.match(/Tables:\s*{([\s\S]*?)}\s*;\s*Views:/);
if (!tablesMatch) {
	console.error('Could not find Tables section in database.types.ts');
	process.exit(1);
}

const tablesContent = tablesMatch[1];

// Regular expression to match table definitions and their Row types
const tableRegex = /(\w+):\s*{\s*Row:\s*{([^}]*?)}\s*;/g;

// Build the lightweight schema
let lightweightSchema = `// Lightweight database schema - auto-generated from database.types.ts\n`;
lightweightSchema += `// Generated on: ${new Date().toISOString()}\n\n`;
lightweightSchema += `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\n`;
lightweightSchema += `export type DatabaseSchema = {\n`;

const tables: string[] = [];
let match;

while ((match = tableRegex.exec(tablesContent)) !== null) {
	const tableName = match[1];
	const rowContent = match[2]
		.split(';')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => `        ${line};`)
		.join('\n');

	tables.push(`    ${tableName}: {\n${rowContent}\n    }`);
}

lightweightSchema += tables.join(';\n') + ';\n';
lightweightSchema += `};\n\n`;
lightweightSchema += `export const tableNames = [\n`;
lightweightSchema += tables
	.map((table) => {
		const name = table.trim().split(':')[0].trim();
		return `    '${name}'`;
	})
	.join(',\n');
lightweightSchema += `\n] as const;\n`;

// Write the lightweight schema to a new file
const outputPath = path.join(process.cwd(), 'src/lib/database.schema.ts');
fs.writeFileSync(outputPath, lightweightSchema, 'utf-8');

console.log(`✅ Lightweight schema extracted successfully!`);
console.log(`📁 Output file: ${outputPath}`);
console.log(`📊 Found ${tables.length} tables`);

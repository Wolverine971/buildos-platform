// apps/web/scripts/generate-field-configs.ts
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { fileURLToPath } from 'url';

interface TableInfo {
	name: string;
	fields: FieldInfo[];
}

interface FieldInfo {
	name: string;
	type: string;
	nullable: boolean;
}

function extractTableInfo(sourceFile: ts.SourceFile, checker: ts.TypeChecker): TableInfo[] {
	const tables: TableInfo[] = [];

	function visit(node: ts.Node) {
		// Look for Database type alias instead of interface
		if (ts.isTypeAliasDeclaration(node) && node.name.text === 'Database') {
			console.log('📋 Found Database type alias');

			if (node.type && ts.isTypeLiteralNode(node.type)) {
				// Look for 'public' property in Database
				const publicProperty = node.type.members.find(
					(member): member is ts.PropertySignature =>
						ts.isPropertySignature(member) &&
						ts.isIdentifier(member.name) &&
						member.name.text === 'public'
				);

				if (
					publicProperty &&
					publicProperty.type &&
					ts.isTypeLiteralNode(publicProperty.type)
				) {
					console.log('🏛️ Found public schema');

					// Look for 'Tables' property in public
					const tablesProperty = publicProperty.type.members.find(
						(member): member is ts.PropertySignature =>
							ts.isPropertySignature(member) &&
							ts.isIdentifier(member.name) &&
							member.name.text === 'Tables'
					);

					if (
						tablesProperty &&
						tablesProperty.type &&
						ts.isTypeLiteralNode(tablesProperty.type)
					) {
						console.log('📊 Found Tables property');

						// Extract each table
						tablesProperty.type.members.forEach((tableMember) => {
							if (
								ts.isPropertySignature(tableMember) &&
								ts.isIdentifier(tableMember.name)
							) {
								const tableName = tableMember.name.text;
								console.log(`🔍 Processing table: ${tableName}`);
								const fields = extractFieldsFromTable(tableMember, checker);
								tables.push({ name: tableName, fields });
							}
						});
					} else {
						console.log('❌ Tables property not found in public schema');
					}
				} else {
					console.log('❌ Public schema not found in Database');
				}
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return tables;
}

function extractFieldsFromTable(
	tableMember: ts.PropertySignature,
	checker: ts.TypeChecker
): FieldInfo[] {
	const fields: FieldInfo[] = [];

	// This is a simplified extraction - you might need to adjust based on your actual type structure
	if (tableMember.type && ts.isTypeLiteralNode(tableMember.type)) {
		const rowProperty = tableMember.type.members.find(
			(member): member is ts.PropertySignature =>
				ts.isPropertySignature(member) &&
				ts.isIdentifier(member.name) &&
				member.name.text === 'Row'
		);

		if (rowProperty && rowProperty.type && ts.isTypeLiteralNode(rowProperty.type)) {
			rowProperty.type.members.forEach((fieldMember) => {
				if (ts.isPropertySignature(fieldMember) && ts.isIdentifier(fieldMember.name)) {
					const fieldName = fieldMember.name.text;
					const nullable = !!fieldMember.questionToken;
					const fieldType = fieldMember.type
						? checker.typeToString(checker.getTypeAtLocation(fieldMember.type))
						: 'unknown';

					fields.push({
						name: fieldName,
						type: fieldType,
						nullable
					});
				}
			});
		}
	}

	return fields;
}

function generateFieldConfigs(tables: TableInfo[]): string {
	const output = `// Auto-generated field configurations
// Generated on ${new Date().toISOString()}

export interface FieldConfig {
  name: string;
  type: string;
  nullable: boolean;
  label?: string;
  placeholder?: string;
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
}

export interface TableConfig {
  name: string;
  fields: Record<string, FieldConfig>;
}

export const tableConfigs: Record<string, TableConfig> = {
${tables
	.map(
		(table) => `  ${table.name}: {
    name: '${table.name}',
    fields: {
${table.fields
	.map(
		(field) => `      ${field.name}: {
        name: '${field.name}',
        type: '${field.type}',
        nullable: ${field.nullable},
        label: '${field.name.charAt(0).toUpperCase() + field.name.slice(1).replace(/_/g, ' ')}',
        placeholder: 'Enter ${field.name.replace(/_/g, ' ')}...',
        validation: {
          required: ${!field.nullable}
        }
      }`
	)
	.join(',\n')}
    }
  }`
	)
	.join(',\n')}
};

// Helper function to get field config for a specific table and field
export function getFieldConfig(tableName: string, fieldName: string): FieldConfig | undefined {
  return tableConfigs[tableName]?.fields[fieldName];
}

// Helper function to get all field configs for a table
export function getTableConfig(tableName: string): TableConfig | undefined {
  return tableConfigs[tableName];
}
`;

	return output;
}

async function main() {
	try {
		console.log('🔄 Generating field configurations...');

		const databaseTypesPath = path.resolve('./src/lib/database.types.ts');
		const outputPath = path.resolve('./src/lib/generated-field-configs.ts');

		console.log(`📂 Looking for database types at: ${databaseTypesPath}`);

		if (!fs.existsSync(databaseTypesPath)) {
			console.error('❌ database.types.ts not found at:', databaseTypesPath);
			console.error(
				'💡 Make sure you run "pnpm run gen:types" first to generate the database types.'
			);
			process.exit(1);
		}

		// Ensure the output directory exists
		const outputDir = path.dirname(outputPath);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		const program = ts.createProgram([databaseTypesPath], {
			target: ts.ScriptTarget.ES2020,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Node16,
			allowJs: true,
			esModuleInterop: true,
			skipLibCheck: true
		});

		const sourceFile = program.getSourceFile(databaseTypesPath);
		if (!sourceFile) {
			console.error('❌ Could not load source file:', databaseTypesPath);
			process.exit(1);
		}

		const checker = program.getTypeChecker();
		const tables = extractTableInfo(sourceFile, checker);

		if (tables.length === 0) {
			console.error('❌ No tables found in Database type');
			console.error(
				'💡 Check that your database.types.ts file contains a Database type with a public.Tables property.'
			);

			// Debug: Show what we found
			const foundTypes: string[] = [];
			function visitForDebugging(node: ts.Node) {
				if (ts.isInterfaceDeclaration(node)) {
					foundTypes.push(`interface ${node.name.text}`);
				}
				if (ts.isTypeAliasDeclaration(node)) {
					foundTypes.push(`type ${node.name.text}`);
				}
				ts.forEachChild(node, visitForDebugging);
			}
			visitForDebugging(sourceFile);

			if (foundTypes.length > 0) {
				console.log('🔍 Found types/interfaces:', foundTypes.join(', '));
			}

			process.exit(1);
		}

		console.log(`✅ Found ${tables.length} tables:`, tables.map((t) => t.name).join(', '));

		const output = generateFieldConfigs(tables);
		fs.writeFileSync(outputPath, output);

		console.log(`✅ Generated field configs at: ${outputPath}`);

		// Show a preview of what was generated
		const configCount = tables.reduce((sum, table) => sum + table.fields.length, 0);
		console.log(
			`📊 Generated configurations for ${configCount} fields across ${tables.length} tables`
		);
	} catch (error) {
		console.error('❌ Error generating field configs:');
		console.error(error);
		process.exit(1);
	}
}

// Reliable ES module entry point check
const __filename = fileURLToPath(import.meta.url);
const isMainModule =
	process.argv[1] === __filename || process.argv[1].endsWith('generate-field-configs.ts');

if (isMainModule) {
	main();
}

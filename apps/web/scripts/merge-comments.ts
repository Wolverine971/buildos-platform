import { Project, Node } from 'ts-morph';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Input files - resolve paths relative to the script location
const DB_TYPES_FILE = resolve(__dirname, '../src/lib/database.types.ts');
const API_TYPES_FILE = resolve(__dirname, '../src/lib/types/postgrest.api.d.ts');
const OUTPUT_FILE = resolve(__dirname, '../src/lib/database.types.with-comments.ts');

// Ensure both exist
if (!existsSync(DB_TYPES_FILE) || !existsSync(API_TYPES_FILE)) {
	console.error('Missing one of the input files!');
	console.error(`DB_TYPES_FILE: ${DB_TYPES_FILE} - exists: ${existsSync(DB_TYPES_FILE)}`);
	console.error(`API_TYPES_FILE: ${API_TYPES_FILE} - exists: ${existsSync(API_TYPES_FILE)}`);
	process.exit(1);
}

// Init a ts-morph project
const project = new Project({
	tsConfigFilePath: resolve(__dirname, '../tsconfig.json'),
	skipAddingFilesFromTsConfig: true
});

// Add both files
const dbFile = project.addSourceFileAtPath(DB_TYPES_FILE);
const apiFile = project.addSourceFileAtPath(API_TYPES_FILE);

// Build a map of comments from API file - track by interface/type and property
const commentMap = new Map<string, Map<string, string>>();

// Process interfaces and type aliases in API file
apiFile.getInterfaces().forEach((iface) => {
	const ifaceName = iface.getName();
	const propComments = new Map<string, string>();

	iface.getProperties().forEach((prop) => {
		const propName = prop.getName();
		const jsDocs = prop.getJsDocs();
		if (jsDocs.length > 0) {
			const comment = jsDocs
				.map((jsDoc) => jsDoc.getCommentText())
				.filter(Boolean)
				.join('\n');
			if (comment) {
				propComments.set(propName, comment);
			}
		}
	});

	if (propComments.size > 0) {
		commentMap.set(ifaceName, propComments);
	}
});

// Also process type aliases that might have properties
apiFile.getTypeAliases().forEach((typeAlias) => {
	const typeName = typeAlias.getName();
	const propComments = new Map<string, string>();

	// Try to get properties if it's an object type
	const typeNode = typeAlias.getTypeNode();
	if (Node.isTypeLiteral(typeNode)) {
		typeNode.getProperties().forEach((prop) => {
			if (Node.isPropertySignature(prop)) {
				const propName = prop.getName();
				const jsDocs = prop.getJsDocs();
				if (jsDocs.length > 0) {
					const comment = jsDocs
						.map((jsDoc) => jsDoc.getCommentText())
						.filter(Boolean)
						.join('\n');
					if (comment) {
						propComments.set(propName, comment);
					}
				}
			}
		});
	}

	if (propComments.size > 0) {
		commentMap.set(typeName, propComments);
	}
});

// Apply comments to DB types file
dbFile.getInterfaces().forEach((iface) => {
	const ifaceName = iface.getName();
	const propComments = commentMap.get(ifaceName);

	if (propComments) {
		iface.getProperties().forEach((prop) => {
			const propName = prop.getName();
			const comment = propComments.get(propName);

			if (comment && prop.getJsDocs().length === 0) {
				prop.addJsDoc({
					description: comment
				});
			}
		});
	}
});

// Also apply to type aliases
dbFile.getTypeAliases().forEach((typeAlias) => {
	const typeName = typeAlias.getName();
	const propComments = commentMap.get(typeName);

	if (propComments) {
		const typeNode = typeAlias.getTypeNode();
		if (Node.isTypeLiteral(typeNode)) {
			typeNode.getProperties().forEach((prop) => {
				if (Node.isPropertySignature(prop)) {
					const propName = prop.getName();
					const comment = propComments.get(propName);

					if (comment && prop.getJsDocs().length === 0) {
						prop.addJsDoc({
							description: comment
						});
					}
				}
			});
		}
	}
});

// Save result as a new file
const outputFile = project.createSourceFile(OUTPUT_FILE, dbFile.getFullText(), { overwrite: true });
outputFile.save();
console.log(`✨ Merged comments written to ${OUTPUT_FILE}`);

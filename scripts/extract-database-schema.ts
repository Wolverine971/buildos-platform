// scripts/extract-database-schema.ts
import fs from "fs";
import path from "path";

// Read the database.types.ts file from shared-types package
const databaseTypesPath = path.join(
  process.cwd(),
  "packages/shared-types/src/database.types.ts",
);
const content = fs.readFileSync(databaseTypesPath, "utf-8");

// Extract the Tables section - handle both old and new format
let tablesMatch = content.match(
  /public:\s*{\s*Tables:\s*{([\s\S]*?)}\s*Views:/,
);
if (!tablesMatch) {
  // Try old format
  tablesMatch = content.match(/Tables:\s*{([\s\S]*?)}\s*;\s*Views:/);
}
if (!tablesMatch) {
  console.error("Could not find Tables section in database.types.ts");
  console.error('Tried both: "public: { Tables: {" and "Tables: {" patterns');
  process.exit(1);
}

const tablesContent = tablesMatch[1];

// Build the lightweight schema
let lightweightSchema = `// Lightweight database schema - auto-generated from database.types.ts\n`;
lightweightSchema += `// Generated on: ${new Date().toISOString()}\n\n`;
lightweightSchema += `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\n`;
lightweightSchema += `export type DatabaseSchema = {\n`;

const tables: string[] = [];

// Split tables by looking for pattern: "tablename: {"
// This handles multi-line Row definitions better
const tableSections = tablesContent.split(/\n\s{6}(?=\w+:\s*{)/);

for (const section of tableSections) {
  if (!section.trim()) continue;

  // Extract table name and Row content
  const tableMatch = section.match(
    /^(\w+):\s*{\s*Row:\s*{([\s\S]*?)}\s*Insert/,
  );
  if (!tableMatch) continue;

  const tableName = tableMatch[1];
  const rowContent = tableMatch[2]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // Replace Database["public"]["Enums"][...] with string
      const cleanedLine = line.replace(
        /Database\["public"\]\["Enums"\]\["[^"]+"\]/g,
        "string",
      );
      return `        ${cleanedLine}`;
    })
    .join("\n");

  tables.push(`    ${tableName}: {\n${rowContent}\n    }`);
}

lightweightSchema += tables.join(";\n") + ";\n";
lightweightSchema += `};\n\n`;
lightweightSchema += `export const tableNames = [\n`;
lightweightSchema += tables
  .map((table) => {
    const name = table.trim().split(":")[0].trim();
    return `    '${name}'`;
  })
  .join(",\n");
lightweightSchema += `\n] as const;\n`;

// Write the lightweight schema to both locations
const sharedTypesOutputPath = path.join(
  process.cwd(),
  "packages/shared-types/src/database.schema.ts",
);
const webOutputPath = path.join(
  process.cwd(),
  "apps/web/src/lib/database.schema.ts",
);

fs.writeFileSync(sharedTypesOutputPath, lightweightSchema, "utf-8");
fs.writeFileSync(webOutputPath, lightweightSchema, "utf-8");

console.log(`✅ Lightweight schema extracted successfully!`);
console.log(`📁 Output files:`);
console.log(`   - ${sharedTypesOutputPath}`);
console.log(`   - ${webOutputPath}`);
console.log(`📊 Found ${tables.length} tables`);

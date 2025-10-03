// apps/web/scripts/generate-types.ts
import { execSync } from "child_process";
import { config } from "dotenv";
import { existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { dirname } from "path";

// Load environment variables
config();

const projectId = process.env.PUBLIC_SUPABASE_PROJECT_ID;

if (!projectId) {
  console.error(
    "❌ PUBLIC_SUPABASE_PROJECT_ID not found in environment variables",
  );
  console.error(
    "Make sure you have a .env file with PUBLIC_SUPABASE_PROJECT_ID=your-project-id",
  );
  process.exit(1);
}

// Output to both locations for compatibility
const sharedTypesOutputPath = "./packages/shared-types/src/database.types.ts";

(async () => {
  try {
    // Ensure the directories exist
    const sharedTypesOutputDir = dirname(sharedTypesOutputPath);

    if (!existsSync(sharedTypesOutputDir)) {
      mkdirSync(sharedTypesOutputDir, { recursive: true });
    }

    console.log("🔄 Generating Supabase types...");
    console.log(`📁 Output: ${sharedTypesOutputPath}`);
    console.log(`🎯 Project ID: ${projectId}`);

    const command = `npx supabase gen types typescript --project-id ${projectId} --schema public`;

    // Execute the command and capture output
    const output = execSync(command, { encoding: "utf8" });

    // Write to shared-types package
    await writeFile(sharedTypesOutputPath, output);

    console.log("✅ Types generated successfully to:");
    console.log(`   - ${sharedTypesOutputPath}`);
  } catch (error: any) {
    console.error("❌ Failed to generate types:");
    if (error.message.includes("project-id")) {
      console.error(
        "Make sure your Supabase project ID is correct and you have access to it.",
      );
    }
    console.error(error.message);
    process.exit(1);
  }
})();

// apps/web/scripts/generate-embeddings.ts
import 'dotenv/config';
import { createCustomClient } from '@buildos/supabase-client';
import { EmbeddingManager } from '../src/lib/server/embedding.manager';
import { SmartLLMService } from '../src/lib/services/smart-llm-service';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PRIVATE_SUPABASE_SERVICE_KEY, PRIVATE_OPENAI_API_KEY } from '$env/static/private';

const supabaseUrl = PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = PRIVATE_SUPABASE_SERVICE_KEY!;
const openAIApiKey = PRIVATE_OPENAI_API_KEY!;

async function generateEmbeddings() {
	const supabase = createCustomClient(supabaseUrl, supabaseServiceKey);
	const llmService = new SmartLLMService({
		httpReferer: 'https://buildos.dev',
		appName: 'BuildOS Embedding Generator',
		supabase
	});
	const embeddingManager = new EmbeddingManager(supabase, llmService, openAIApiKey);

	const tables = ['projects', 'tasks', 'goals', 'habits', 'notes', 'routines', 'context_blocks'];

	for (const table of tables) {
		console.log(`Generating embeddings for ${table}...`);
		await embeddingManager.generateMissingEmbeddings(table);
		console.log(`Completed ${table}`);
	}

	console.log('All embeddings generated!');
}

generateEmbeddings().catch(console.error);

// apps/web/src/routes/api/onto/outputs/generate/+server.ts
/**
 * AI Content Generation for Text Document Outputs
 * Generates content for text documents based on type_key and instructions
 */

import type { RequestHandler } from './$types';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = await request.json();
		const { type_key, instructions, project_id, current_props } = body;

		if (!type_key) {
			return ApiResponse.badRequest('type_key is required');
		}

		if (!instructions || !instructions.trim()) {
			return ApiResponse.badRequest('instructions are required');
		}

		const supabase = locals.supabase;

		// Get project context
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, description, type_key, props, created_by')
			.eq('id', project_id)
			.maybeSingle();

		if (projectError) {
			console.error('[Output Generate API] Failed to fetch project:', projectError);
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project not found');
		}

		// Get user's actor ID for ownership check
		const { data: actorId, error: actorCheckError } = await supabase.rpc(
			'ensure_actor_for_user',
			{
				p_user_id: user.id
			}
		);

		if (actorCheckError || !actorId) {
			console.error('[Output Generate API] Failed to get actor:', actorCheckError);
			return ApiResponse.internalError(
				actorCheckError || new Error('Failed to resolve user actor')
			);
		}

		// ✅ SECURITY: Verify user owns the project (via actor)
		if (project.created_by !== actorId) {
			return ApiResponse.forbidden(
				'You do not have permission to generate content for this project'
			);
		}

		// Initialize SmartLLMService
		const smartLLM = new SmartLLMService({
			supabase: locals.supabase,
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Output Generator'
		});

		// Build prompt based on type_key
		const prompt = buildGenerationPrompt({
			typeKey: type_key,
			instructions,
			project,
			currentProps: current_props || {}
		});

		// Generate content with SmartLLMService
		const content = await smartLLM.generateText({
			prompt,
			userId: user.id,
			profile: 'quality', // Use quality profile for content generation
			systemPrompt:
				'You are a professional content writer helping users create high-quality documents. Generate content in clean HTML format with proper semantic tags (h1, h2, p, ul, ol, etc.).',
			temperature: 0.7,
			maxTokens: 4000,
			operationType: 'output_generation',
			projectId: project_id
		});

		if (!content || !content.trim()) {
			return ApiResponse.error('Failed to generate content: Empty response from AI', 500);
		}

		return ApiResponse.success({ content });
	} catch (err: any) {
		console.error('[API] Output generation error:', err);

		// Handle LLM service errors
		if (err.message?.includes('timeout')) {
			return ApiResponse.error('Request timeout. Please try again.', 503);
		}

		if (err.message?.includes('quota') || err.message?.includes('rate limit')) {
			return ApiResponse.error('API quota exceeded. Please try again later.', 503);
		}

		return ApiResponse.internalError(
			err instanceof Error ? err.message : 'Content generation failed'
		);
	}
};

function buildGenerationPrompt({
	typeKey,
	instructions,
	project,
	currentProps
}: {
	typeKey: string;
	instructions: string;
	project: any;
	currentProps: Record<string, unknown>;
}): string {
	const documentType = getDocumentTypeName(typeKey);

	const basePrompt = `
You are writing content for a ${documentType} document.

User Instructions:
${instructions}

${
	project
		? `Project Context:
- Project: ${project.name}
- Type: ${project.type_key}
${project.description ? `- Description: ${project.description}` : ''}
`
		: ''
}

${
	Object.keys(currentProps).length > 0
		? `Document Properties:
${JSON.stringify(currentProps, null, 2)}
`
		: ''
}
`;

	// Add type-specific guidance
	const specificGuidance = getTypeSpecificGuidance(typeKey, currentProps);

	return `${basePrompt}

${specificGuidance}

Generate the complete document content in HTML format. Use proper semantic HTML tags:
- <h1> for the main title
- <h2> for section headings
- <h3> for subsections
- <p> for paragraphs
- <ul>/<ol> for lists
- <strong> and <em> for emphasis

The content should be:
1. Well-structured and organized
2. Professional in tone
3. Complete and ready to use
4. Aligned with the user's instructions
5. Appropriate for the document type (${documentType})

Return ONLY the HTML content, no markdown code fences or explanations.
`;
}

function getDocumentTypeName(typeKey: string): string {
	const typeNames: Record<string, string> = {
		'output.chapter': 'Book Chapter',
		'output.article': 'Article',
		'output.blog_post': 'Blog Post',
		'output.case_study': 'Case Study',
		'output.whitepaper': 'Whitepaper',
		'output.newsletter': 'Newsletter'
	};

	return typeNames[typeKey] || 'Document';
}

function getTypeSpecificGuidance(typeKey: string, props: Record<string, unknown>): string {
	switch (typeKey) {
		case 'output.chapter':
			return `
This is a book chapter. Include:
- An engaging opening hook
- Well-paced narrative or exposition
- Character development (if fiction) or clear explanations (if non-fiction)
- Scene/section transitions
- A compelling ending that makes readers want to continue

${props.chapter_number ? `This is Chapter ${props.chapter_number}.` : ''}
${props.target_word_count ? `Target word count: ${props.target_word_count} words.` : ''}
${props.pov_character ? `Point of view: ${props.pov_character}` : ''}
`;

		case 'output.article':
			return `
This is an article or essay. Include:
- A compelling headline/title
- An engaging introduction that hooks the reader
- Clear topic sentences for each paragraph
- Supporting evidence and examples
- A strong conclusion
- SEO-friendly structure if applicable

${props.publication ? `Publication: ${props.publication}` : ''}
${props.target_word_count ? `Target word count: ${props.target_word_count} words.` : ''}
${Array.isArray(props.keywords) ? `Keywords to include: ${(props.keywords as string[]).join(', ')}` : ''}
`;

		case 'output.blog_post':
			return `
This is a blog post. Make it:
- Conversational and engaging
- Scannable with clear headings
- Include practical examples or tips
- End with a call-to-action
- Optimize for SEO if keywords provided

${props.blog_name ? `Blog: ${props.blog_name}` : ''}
${Array.isArray(props.categories) ? `Categories: ${(props.categories as string[]).join(', ')}` : ''}
${Array.isArray(props.tags) ? `Tags: ${(props.tags as string[]).join(', ')}` : ''}
`;

		case 'output.case_study':
			return `
This is a case study. Structure it as:
1. Client/Company Overview
2. The Challenge
3. The Solution (your approach)
4. Implementation Details
5. Results and Metrics
6. Testimonial (if available)
7. Key Takeaways

${props.client_name ? `Client: ${props.client_name}` : ''}
${props.industry ? `Industry: ${props.industry}` : ''}
${props.challenge ? `Challenge: ${props.challenge}` : ''}
${props.solution ? `Solution: ${props.solution}` : ''}
`;

		case 'output.whitepaper':
			return `
This is a whitepaper. Make it:
- Authoritative and well-researched
- Data-driven with evidence
- Include an executive summary
- Detailed analysis and insights
- Professional and formal tone
- Citations where appropriate

${props.target_audience ? `Target Audience: ${props.target_audience}` : ''}
${Array.isArray(props.key_findings) ? `Key Findings: ${(props.key_findings as string[]).join(', ')}` : ''}
${props.target_word_count ? `Target length: ${props.target_word_count} words.` : ''}
`;

		case 'output.newsletter':
			return `
This is a newsletter edition. Include:
- A catchy subject line hook
- Brief intro/greeting
- 3-5 main sections or stories
- Clear calls-to-action
- Friendly, conversational tone
- Footer with social links/unsubscribe

${props.edition_number ? `Edition #${props.edition_number}` : ''}
${props.subject_line ? `Subject Line: ${props.subject_line}` : ''}
`;

		default:
			return 'Write clear, engaging content appropriate for this document type.';
	}
}

// apps/web/src/routes/api/onto/outputs/generate/+server.ts
/**
 * AI Content Generation for Text Document Outputs
 * Generates content for text documents based on template and instructions
 */

import type { RequestHandler } from './$types';
import { OpenAI } from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';
import { resolveTemplateWithClient } from '$lib/services/ontology/template-resolver.service';
import { ApiResponse } from '$lib/utils/api-response';

const openai = new OpenAI({
	apiKey: OPENAI_API_KEY
});

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = await request.json();
		const { template_key, instructions, project_id, current_props } = body;

		if (!template_key) {
			return ApiResponse.badRequest('template_key is required');
		}

		if (!instructions || !instructions.trim()) {
			return ApiResponse.badRequest('instructions are required');
		}

		const supabase = locals.supabase;

		// Resolve template to understand structure
		const resolved = await resolveTemplateWithClient(supabase, template_key, 'output');

		// Get project context
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, description, type_key, props, created_by')
			.eq('id', project_id)
			.maybeSingle();

		if (projectError) {
			console.error('[Output Generate API] Failed to fetch project:', projectError);
			return ApiResponse.databaseError(projectError.message);
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
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// ✅ SECURITY: Verify user owns the project (via actor)
		if (project.created_by !== actorId) {
			return ApiResponse.forbidden(
				'You do not have permission to generate content for this project'
			);
		}

		// Build prompt based on template type
		const prompt = buildGenerationPrompt({
			templateKey: template_key,
			resolvedTemplate: resolved,
			instructions,
			project,
			currentProps: current_props || {}
		});

		// Generate content with OpenAI
		const completion = await openai.chat.completions.create({
			model: 'gpt-4-turbo-preview',
			messages: [
				{
					role: 'system',
					content:
						'You are a professional content writer helping users create high-quality documents. Generate content in clean HTML format with proper semantic tags (h1, h2, p, ul, ol, etc.).'
				},
				{
					role: 'user',
					content: prompt
				}
			],
			temperature: 0.7,
			max_tokens: 4000
		});

		const content = completion.choices[0]?.message?.content;

		if (!content) {
			return ApiResponse.error('Failed to generate content: Empty response from AI', 500);
		}

		return ApiResponse.success({ content });
	} catch (err: any) {
		console.error('[API] Output generation error:', err);

		// Handle OpenAI-specific errors
		if (err?.error?.type === 'insufficient_quota') {
			return ApiResponse.error('API quota exceeded. Please try again later.', 503);
		}

		if (err?.error?.type === 'invalid_request_error') {
			return ApiResponse.badRequest(err.message || 'Invalid request to AI service');
		}

		return ApiResponse.internalError(
			err instanceof Error ? err.message : 'Content generation failed'
		);
	}
};

function buildGenerationPrompt({
	templateKey,
	resolvedTemplate,
	instructions,
	project,
	currentProps
}: {
	templateKey: string;
	resolvedTemplate: any;
	instructions: string;
	project: any;
	currentProps: Record<string, unknown>;
}): string {
	const basePrompt = `
You are writing content for a ${resolvedTemplate.name} document.

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

Template Requirements:
${JSON.stringify(resolvedTemplate.schema.properties, null, 2)}
`;

	// Add template-specific guidance
	const specificGuidance = getTemplateSpecificGuidance(templateKey, currentProps);

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
5. Appropriate for the document type (${resolvedTemplate.name})

Return ONLY the HTML content, no markdown code fences or explanations.
`;
}

function getTemplateSpecificGuidance(templateKey: string, props: Record<string, unknown>): string {
	switch (templateKey) {
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

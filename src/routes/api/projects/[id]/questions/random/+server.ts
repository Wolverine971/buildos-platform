// src/routes/api/projects/[id]/questions/random/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const projectId = params.id;

		// Fetch 3 random unanswered questions for the project
		const { data: questions, error } = await supabase
			.from('project_questions')
			.select('*')
			.eq('project_id', projectId)
			.eq('user_id', user.id)
			.or('status.is.null,status.neq.answered')
			.order('shown_to_user_count', { ascending: true }) // Prioritize questions shown less
			.order('created_at', { ascending: false }) // Then by newest
			.limit(10); // Get more than 3 to randomize

		if (error) {
			console.error('Error fetching project questions:', error);
			return ApiResponse.error('Failed to fetch project questions');
		}

		// If no questions or less than 3, return what we have
		if (!questions || questions.length === 0) {
			return ApiResponse.success({ questions: [] });
		}

		// Randomly select up to 3 questions
		const selectedQuestions = [];
		const availableQuestions = [...questions];
		const numToSelect = Math.min(3, availableQuestions.length);

		for (let i = 0; i < numToSelect; i++) {
			const randomIndex = Math.floor(Math.random() * availableQuestions.length);
			selectedQuestions.push(availableQuestions[randomIndex]);
			availableQuestions.splice(randomIndex, 1);
		}

		// Update shown_to_user_count for selected questions
		const questionIds = selectedQuestions.map((q) => q.id);
		await supabase.rpc('increment_question_display_count', { question_ids: questionIds });

		return ApiResponse.success({
			questions: selectedQuestions.map((q) => ({
				id: q.id,
				question: q.question,
				category: q.category,
				context: q.context
			}))
		});
	} catch (error) {
		console.error('Error in GET /api/projects/[id]/questions/random:', error);
		return ApiResponse.error('An unexpected error occurred');
	}
};

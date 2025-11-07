// apps/web/src/lib/services/project-synthesis.service.ts
import { toastService } from '$lib/stores/toast.store';
import { requireApiData, requireApiSuccess } from '$lib/utils/api-client-helpers';

export class ProjectSynthesisService {
	private projectId: string;

	constructor(projectId: string) {
		this.projectId = projectId;
	}

	async loadSynthesis(): Promise<any | null> {
		try {
			const response = await fetch(`/api/projects/${this.projectId}/synthesize`);
			const result = await requireApiData<{ synthesis?: any } | null>(
				response,
				'Failed to load synthesis'
			);

			if (result && typeof result === 'object' && 'synthesis' in result) {
				return result.synthesis ?? null;
			}

			return result;
		} catch (error) {
			console.error('Error loading synthesis:', error);
			// Don't show error toast - null synthesis is valid (means none exists yet)
			return null;
		}
	}

	async generateSynthesis(options?: any): Promise<any | null> {
		try {
			const response = await fetch(`/api/projects/${this.projectId}/synthesize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					regenerate: true,
					options: options || undefined
				})
			});

			const result = await requireApiData<{ synthesis?: any }>(
				response,
				'Failed to generate synthesis'
			);

			return result.synthesis ?? null;
		} catch (error) {
			console.error('Error generating synthesis:', error);
			toastService.error(
				error instanceof Error ? error.message : 'Failed to generate synthesis'
			);
			return null;
		}
	}

	async saveSynthesis(
		synthesisContent: any,
		status: 'draft' | 'completed' = 'draft',
		synthesisId?: string
	): Promise<any | null> {
		try {
			const response = await fetch(`/api/projects/${this.projectId}/synthesize`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					synthesis_id: synthesisId,
					synthesis_content: synthesisContent,
					status
				})
			});

			const result = await requireApiData<{ synthesis?: any }>(
				response,
				'Failed to save synthesis'
			);
			toastService.success('Synthesis saved successfully');
			return result.synthesis;
		} catch (error) {
			console.error('Error saving synthesis:', error);
			toastService.error(error instanceof Error ? error.message : 'Failed to save synthesis');
			return null;
		}
	}

	async deleteSynthesis(): Promise<boolean> {
		try {
			const response = await fetch(`/api/projects/${this.projectId}/synthesize`, {
				method: 'DELETE'
			});

			await requireApiSuccess(response, 'Failed to delete synthesis');

			toastService.success('Synthesis deleted successfully');
			return true;
		} catch (error) {
			console.error('Error deleting synthesis:', error);
			toastService.error(
				error instanceof Error ? error.message : 'Failed to delete synthesis'
			);
			return false;
		}
	}

	async updateSynthesis(content: string): Promise<boolean> {
		try {
			const response = await fetch(`/api/projects/${this.projectId}/synthesis`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});

			await requireApiSuccess(response, 'Failed to update synthesis');

			toastService.success('Synthesis updated successfully');
			return true;
		} catch (error) {
			console.error('Error updating synthesis:', error);
			toastService.error('Failed to update synthesis');
			return false;
		}
	}
}

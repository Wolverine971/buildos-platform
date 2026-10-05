// apps/web/src/routes/api/account/settings/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { createSupabaseServer } from '$lib/supabase/index';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import {
	notifyMembersProjectDeleted,
	notifyOwnershipReceived
} from '$lib/server/project-sharing-notifications';
import { cancelDeletionSubscriptions, scheduleAccountDeletion } from '$lib/server/account-deletion';

const accountSettingsSchema = z.object({
	name: z.string().optional(),
	email: z.string().optional()
});

export const PUT: RequestHandler = async ({ request, cookies, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Not authenticated');
	}

	try {
		const parsed = await parseJsonRequest(request, accountSettingsSchema);
		if (!parsed.ok) return parsed.response;
		const body = parsed.data;
		const { name, email } = body;

		// Validate input
		if (!name?.trim() && !email?.trim()) {
			return ApiResponse.badRequest('At least one field (name or email) must be provided');
		}

		if (email && !isValidEmail(email)) {
			return ApiResponse.badRequest('Invalid email format');
		}

		const supabase = createSupabaseServer(cookies);

		// Update user metadata and email if provided
		const updateData: { data?: { name: string }; email?: string } = {};

		if (name?.trim()) {
			updateData.data = {
				name: name.trim()
			};
		}

		if (email?.trim() && email !== user.email) {
			updateData.email = email.trim();
		}

		const { data, error } = await supabase.auth.updateUser(updateData);

		if (error) {
			console.error('Error updating user:', error);
			return ApiResponse.error('Failed to update account information', 500);
		}

		// Update the users table with the new name
		if (name?.trim()) {
			const { error: dbError } = await supabase
				.from('users')
				.update({
					name: name.trim(),
					updated_at: new Date().toISOString()
				})
				.eq('id', user.id);

			if (dbError) {
				console.error('Error updating users table:', dbError);
				// Don't return error here as the auth update succeeded
			}
		}

		return ApiResponse.success({
			message:
				email && email !== user.email
					? 'Account updated. Please check your email to confirm the new address.'
					: 'Account updated successfully',
			user: {
				id: data.user?.id,
				email: data.user?.email,
				name: data.user?.user_metadata?.name
			}
		});
	} catch (error) {
		console.error('Account update error:', error);
		return ApiResponse.error('Failed to update account', 500);
	}
};

const sharedProjectDecisionsSchema = z.object({
	shared_projects: z
		.array(
			z.union([
				z.object({
					project_id: z.string(),
					action: z.literal('handoff'),
					member_id: z.string()
				}),
				z.object({ project_id: z.string(), action: z.literal('delete') })
			])
		)
		.optional()
});

type SharedProjectRow = {
	project_id: string;
	project_name: string;
	members: Array<{ member_id: string; actor_id?: string }> | null;
};

export const DELETE: RequestHandler = async ({ request, cookies, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Not authenticated');
	}

	try {
		const supabase = createSupabaseServer(cookies);

		// Optional body: one decision per shared project the user owns.
		const rawBody = await request.json().catch(() => null);
		const parsedBody = sharedProjectDecisionsSchema.safeParse(rawBody ?? {});
		const decisions = parsedBody.success ? (parsedBody.data.shared_projects ?? []) : [];

		const { data: sharedData, error: sharedError } = await (supabase as any).rpc(
			'list_my_shared_owned_onto_projects'
		);
		if (sharedError) {
			console.error('Account deletion shared project lookup error:', sharedError);
			return ApiResponse.error('Failed to delete account', 500);
		}
		const sharedProjects = (sharedData ?? []) as SharedProjectRow[];

		const plan: Array<{
			project: SharedProjectRow;
			decision: (typeof decisions)[number];
		}> = [];
		let decisionsComplete = true;
		for (const project of sharedProjects) {
			const matching = decisions.filter((d) => d.project_id === project.project_id);
			const decision = matching.length === 1 ? matching[0] : null;
			if (
				!decision ||
				(decision.action === 'handoff' &&
					!(project.members ?? []).some((m) => m.member_id === decision.member_id))
			) {
				decisionsComplete = false;
				break;
			}
			plan.push({ project, decision });
		}
		if (!decisionsComplete) {
			return ApiResponse.error(
				'Choose what happens to each shared project first',
				409,
				'shared_projects_decision_required',
				{ projects: sharedProjects }
			);
		}

		const ownerName = user.name || user.email || 'The owner';
		for (const { project, decision } of plan) {
			if (decision.action === 'handoff') {
				const { data, error } = await (supabase as any).rpc(
					'transfer_onto_project_ownership',
					{
						p_project_id: project.project_id,
						p_new_owner_member_id: decision.member_id,
						p_leave: true
					}
				);
				if (error) {
					console.error('Account deletion handoff error:', error);
					return sharedProjectFailure(project.project_name);
				}
				if (data?.new_owner_user_id) {
					await notifyOwnershipReceived({
						projectId: project.project_id,
						projectName: project.project_name,
						newOwnerUserId: data.new_owner_user_id,
						fromName: ownerName,
						senderUserId: user.id
					});
				}
			} else {
				const { error } = await (supabase as any).rpc('soft_delete_onto_project', {
					p_project_id: project.project_id
				});
				if (error) {
					console.error('Account deletion shared project delete error:', error);
					return sharedProjectFailure(project.project_name);
				}
				await notifyMembersProjectDeleted({
					projectId: project.project_id,
					projectName: project.project_name,
					ownerName,
					excludeUserId: user.id,
					restorableUntil: null,
					reason: 'account_deleted',
					senderUserId: user.id
				});
			}
		}

		const deletion = await scheduleAccountDeletion(user.id);

		try {
			await cancelDeletionSubscriptions(
				{
					id: deletion.requestId,
					user_id: user.id,
					billing_subscription_ids: []
				},
				{ immediately: false }
			);
		} catch (billingError) {
			// The scheduled cron retries billing cancellation independently. A
			// vendor outage must not prevent a user from exercising deletion rights.
			console.error('Account deletion subscription cancellation error:', billingError);
		}

		// Sign out the user
		const { error: signOutError } = await supabase.auth.signOut();

		if (signOutError) {
			console.error('Error signing out user:', signOutError);
			// Don't return error as account is already restricted
		}

		return ApiResponse.success({
			message: 'Your deletion request is scheduled and account access is disabled.',
			requestedAt: deletion.requestedAt,
			scheduledFor: deletion.scheduledFor
		});
	} catch (error) {
		console.error('Account deletion error:', error);
		return ApiResponse.error('Failed to delete account', 500);
	}
};

function sharedProjectFailure(projectName: string) {
	return ApiResponse.error(
		`Could not update shared project "${projectName}"`,
		500,
		'shared_project_update_failed'
	);
}

function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

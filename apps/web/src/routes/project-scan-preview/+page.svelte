<!-- Development-only preview of the production project workspace with synthetic data. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import ProjectWorkspace from '../projects/[id]/ProjectWorkspace.svelte';
	import type { PageData } from '../projects/[id]/$types';
	import { createCompleteProjectTasksCoverage } from '$lib/utils/project-task-board';
	import type { Task } from '$lib/types/onto';

	let ready = $state(false);
	let light = $state(false);
	const projectId = '11111111-1111-4111-8111-111111111111';
	const actorId = '22222222-2222-4222-8222-222222222222';
	const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
	const tasks = [
		['Review the launch checklist and confirm the final release scope', 'todo', 2, null],
		['Draft the launch announcement', 'todo', 3, ago(-3)],
		['Prepare the customer interview guide', 'todo', 3, null],
		['Check the mobile navigation', 'in_progress', 2, ago(-1)],
		['Refine the first-run experience', 'in_progress', 3, null],
		['Get approval for the customer story', 'blocked', 1, ago(2)],
		['Publish the initial project brief', 'done', 2, ago(4)],
		['Collect the first round of research notes', 'done', 3, null],
		['Review the accessibility checklist with the team', 'done', 2, ago(6)]
	].map(([title, state_key, priority, due_at], i) => ({
		id: `preview-task-${i}`,
		project_id: projectId,
		title,
		state_key,
		priority,
		due_at,
		description: 'Review the current draft and capture the next step with the project team.',
		type_key: 'task',
		props: {},
		start_at: null,
		deleted_at: null,
		archived_at: null,
		created_at: ago(7),
		updated_at: ago(1)
	})) as Task[];
	const documents = [
		'Project brief',
		'Research and customer interviews',
		'Interview synthesis — what customers need from their first week',
		'Customer onboarding — decisions, examples, and open questions',
		'Launch communication plan',
		'Brand direction',
		'Thinking log'
	].map((title, i) => ({
		id: `preview-doc-${i}`,
		project_id: projectId,
		title,
		type_key: 'document',
		state_key: 'active',
		content: '# ' + title,
		props: {},
		deleted_at: null,
		created_by: actorId,
		created_at: ago(10),
		updated_at: ago(i)
	}));
	const structure = {
		version: 1,
		root: [
			{ id: documents[0]!.id, order: 0 },
			{
				id: documents[1]!.id,
				order: 1,
				children: [
					{ id: documents[2]!.id, order: 0 },
					{ id: documents[3]!.id, order: 1 }
				]
			},
			...documents.slice(4).map((doc, i) => ({ id: doc.id, order: i + 2 }))
		]
	};
	const logs = [0, 0, 1, 2, 2, 3].map((days, i) => ({
		id: `preview-log-${i}`,
		project_id: projectId,
		entity_type: i % 2 ? 'task' : 'document',
		entity_id: i % 2 ? tasks[0]!.id : documents[0]!.id,
		entity_name: i % 2 ? tasks[0]!.title : documents[0]!.title,
		action: i === 4 ? 'created' : 'updated',
		actor_display_name: i % 2 ? 'Jev' : 'DJ Wayne',
		change_source: i % 2 ? 'chat' : 'form',
		created_at: ago(days),
		before_data: null,
		after_data: null
	}));
	const chats = [
		'Launch positioning review',
		'Customer interview synthesis',
		'Planning the first week'
	].map((title, i) => ({
		id: `preview-chat-${i}`,
		title,
		summary: 'Reviewed the current direction and captured the next steps for the launch.',
		chat_topics: ['launch'],
		message_count: 8,
		focus_label: 'Launch plan',
		last_activity_at: ago(i)
	}));
	const fixtureData = {
		skeleton: false,
		projectId,
		access: {
			canEdit: true,
			canAdmin: false,
			canInvite: false,
			canViewLogs: true,
			isOwner: true,
			isAuthenticated: true,
			currentActorId: actorId
		},
		project: {
			id: projectId,
			name: 'Website launch',
			description:
				'Bring the first release to customers with a clear story and a thoughtful first-run experience.',
			state_key: 'active',
			type_key: 'project',
			props: {},
			doc_structure: structure,
			created_by: actorId,
			created_at: ago(10),
			updated_at: ago(0)
		},
		tasks,
		tasks_coverage: createCompleteProjectTasksCoverage(tasks),
		documents,
		goals: [],
		plans: [],
		milestones: [],
		risks: [],
		events: [],
		images: [],
		context_document: null
	} as unknown as PageData;

	onMount(() => {
		const originalFetch = window.fetch;
		const originalDark = document.documentElement.classList.contains('dark');
		light = !originalDark;
		// Only this mounted, dev-gated fixture intercepts ontology requests. No writes leave the preview.
		const previewFetch: typeof fetch = async (input, init) => {
			const url = new URL(
				typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
				location.origin
			);
			if (!url.pathname.startsWith('/api/onto/')) return originalFetch(input, init);
			if (url.pathname === '/api/onto/search') {
				const query = JSON.parse(String(init?.body ?? '{}')) as {
					query?: string;
					types?: string[];
				};
				const entities = query.types?.includes('document')
					? documents.map((doc) => ({ ...doc, type: 'document' }))
					: tasks.map((task) => ({ ...task, type: 'task' }));
				const results = entities.filter((entity) =>
					entity.title.toLowerCase().includes((query.query ?? '').toLowerCase())
				);
				return Response.json({
					success: true,
					data: { results, total_returned: results.length, maybe_more: false }
				});
			}
			const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
			if (method !== 'GET')
				return Response.json(
					{ success: false, error: 'Sample preview: changes are not saved.' },
					{ status: 400 }
				);
			let data: unknown = {};
			if (url.pathname.endsWith('/logs')) data = { logs, total: logs.length, hasMore: false };
			else if (url.pathname.endsWith('/recent-chats'))
				data = { chats, total: chats.length, hasMore: false };
			else if (url.pathname.endsWith('/doc-tree/images')) data = { images: [], links: [] };
			else if (url.pathname.endsWith('/doc-tree'))
				data = {
					structure,
					documents: Object.fromEntries(documents.map((d) => [d.id, d])),
					unlinked: [],
					archived: []
				};
			else if (url.pathname.endsWith('/freshness'))
				data = {
					version: 'freshness_badges_v1',
					projectId,
					scannedAt: ago(0),
					flags: documents.slice(4, 6).map((doc, i) => ({
						flagId: `preview-flag-${i}`,
						scanId: 'preview-scan',
						entity: { kind: 'document', id: doc.id },
						probability: 0.8,
						label: 'may_be_out_of_date',
						evidenceExcerpt:
							'The launch scope changed after this document was last reviewed.',
						suggestionId: null,
						createdAt: ago(0),
						undoableUntil: null
					})),
					gauges: []
				};
			else if (url.pathname.endsWith('/tasks/archived'))
				data = { tasks: [], total: 0, hasMore: false };
			else if (url.pathname.endsWith('/members')) data = { members: [] };
			else if (url.pathname.endsWith('/full')) data = fixtureData;
			return Response.json({ success: true, data });
		};
		window.fetch = previewFetch;
		ready = true;
		return () => {
			if (window.fetch === previewFetch) window.fetch = originalFetch;
			document.documentElement.classList.toggle('dark', originalDark);
		};
	});

	function toggleTheme() {
		light = !light;
		document.documentElement.classList.toggle('dark', !light);
	}
</script>

<div
	class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground"
>
	<span>Design preview · sample data</span>
	<button
		class="min-h-11 rounded-md px-3 focus-visible:ring-2 focus-visible:ring-ring"
		onclick={toggleTheme}>Use {light ? 'dark' : 'light'} theme</button
	>
</div>
{#if ready}<ProjectWorkspace data={fixtureData} />{/if}

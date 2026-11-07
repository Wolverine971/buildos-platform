<!-- apps/web/src/routes/design-system/zz-sort-preview/+page.svelte -->
<!-- TEMPORARY (tasker 155): scripted turn to check "watch it sort" in the real chat list. Delete after review. -->
<script lang="ts">
	import AgentMessageList from '$lib/components/agent/AgentMessageList.svelte';
	import type {
		ActivityEntry,
		ThinkingBlockMessage,
		UIMessage
	} from '$lib/components/agent/agent-chat.types';

	const P = '11111111-1111-4111-8111-111111111111';
	const MESSAGE =
		"Push the lease signing to Monday since the landlord is out. Add a task to order the deck oven, and put the sourdough brunch idea in the menu doc. What's still blocking opening week?";

	let messages = $state<UIMessage[]>([]);
	let container = $state<HTMLElement>();
	let running = $state(false);

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	function setBlock(update: (b: ThinkingBlockMessage) => ThinkingBlockMessage) {
		messages = messages.map((m) =>
			m.type === 'thinking_block' ? update(m as ThinkingBlockMessage) : m
		);
	}

	function addStep(
		id: string,
		toolName: string,
		verb: string,
		target: string,
		extra: Record<string, unknown> = {}
	) {
		const activity: ActivityEntry = {
			id: `a-${id}`,
			content: verb,
			timestamp: new Date(),
			activityType: 'tool_call',
			status: 'pending',
			toolCallId: id,
			metadata: {
				toolName,
				toolCallId: id,
				line: { verb, target, tone: 'pending', text: `${verb}: ${target}` },
				...extra
			}
		} as ActivityEntry;
		setBlock((b) => ({ ...b, activities: [...b.activities, activity] }));
	}

	function finishStep(id: string, metadata: Record<string, unknown>) {
		setBlock((b) => ({
			...b,
			activities: b.activities.map((a) =>
				a.toolCallId === id
					? {
							...a,
							status: 'completed',
							metadata: {
								...a.metadata,
								...metadata,
								line: { ...(a.metadata?.line as object), tone: 'done' }
							}
						}
					: a
			)
		}));
	}

	function toggle(id: string) {
		setBlock((b) => (b.id === id ? { ...b, isCollapsed: !b.isCollapsed } : b));
	}

	async function play() {
		running = true;
		messages = [
			{ id: 'u1', type: 'user', content: MESSAGE, timestamp: new Date() },
			{
				id: 'b1',
				type: 'thinking_block',
				content: 'Working…',
				timestamp: new Date(),
				status: 'active',
				activities: [],
				isCollapsed: false
			} as ThinkingBlockMessage
		];
		await wait(600);
		addStep('r1', 'list_onto_tasks', 'Listed tasks', 'Harbor Bakery Launch');
		await wait(700);
		finishStep('r1', {
			outcome: '3 tasks',
			result: {
				project_id: P,
				tasks: [
					{ id: 't1', title: 'Sign the bakery lease', project_id: P },
					{ id: 't2', title: 'Draft the opening-week menu', project_id: P },
					{ id: 't3', title: 'Hire two counter staff', project_id: P }
				]
			}
		});
		addStep('r2', 'get_onto_document_details', 'Read document', 'Opening menu');
		await wait(600);
		finishStep('r2', {
			result: { document: { id: 'd1', title: 'Opening menu', project_id: P } }
		});
		await wait(400);
		addStep('w1', 'update_onto_task', 'Updated task', 'Sign the bakery lease', {
			sourceQuote: 'Push the lease signing to Monday'
		});
		await wait(450);
		finishStep('w1', {
			durationMs: 380,
			affectedEntities: [
				{
					kind: 'task',
					id: 't1',
					title: 'Sign the bakery lease',
					projectId: P,
					operation: 'updated'
				}
			],
			result: {
				task: { id: 't1', title: 'Sign the bakery lease', project_id: P },
				field_changes: [
					{
						field: 'due_at',
						before: '2026-11-04T00:00:00+00:00',
						after: '2026-11-09T00:00:00+00:00'
					}
				]
			}
		});
		await wait(500);
		addStep('w2', 'create_onto_task', 'Created task', 'Order the deck oven', {
			sourceQuote: 'Add a task to order the deck oven'
		});
		await wait(450);
		finishStep('w2', {
			affectedEntities: [
				{
					kind: 'task',
					id: 't4',
					title: 'Order the deck oven',
					projectId: P,
					operation: 'created'
				}
			]
		});
		await wait(500);
		addStep('w3', 'update_onto_document', 'Updated document', 'Opening menu', {
			sourceQuote: 'put the sourdough brunch idea in the menu doc'
		});
		await wait(500);
		finishStep('w3', {
			affectedEntities: [
				{
					kind: 'document',
					id: 'd1',
					title: 'Opening menu',
					projectId: P,
					operation: 'updated'
				}
			],
			result: { document_change: { lines_added: 6, lines_removed: 0 } }
		});
		await wait(900);
		setBlock((b) => ({ ...b, status: 'completed', completedAt: new Date() }));
		messages = [
			...messages,
			{
				id: 'm1',
				type: 'assistant',
				content:
					'Moved the lease signing to Monday, Nov 9, added "Order the deck oven", and put the sourdough brunch idea in the Opening menu. Still blocking opening week: the lease, then hiring two counter staff.',
				timestamp: new Date()
			}
		];
		running = false;
	}
</script>

<div class="mx-auto flex h-[90vh] max-w-2xl flex-col gap-3 p-4">
	<button
		type="button"
		class="self-start rounded-md border border-border bg-card px-3 py-1.5 text-sm"
		onclick={play}
		disabled={running}
		data-testid="zz-play">{running ? 'Playing…' : 'Play turn'}</button
	>
	<div class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background">
		<AgentMessageList
			{messages}
			bind:container
			onToggleThinkingBlock={toggle}
			onScroll={() => {}}
			displayContextLabel="Harbor Bakery Launch"
			selectedContextType="project"
			resolvedProjectFocus={{
				focusType: 'project-wide',
				focusEntityId: null,
				focusEntityName: null,
				projectId: P,
				projectName: 'Harbor Bakery Launch'
			}}
		/>
	</div>
</div>

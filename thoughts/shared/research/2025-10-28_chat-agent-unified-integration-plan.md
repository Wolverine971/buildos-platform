---
date: 2025-10-28T23:45:00-07:00
researcher: Claude Code
git_commit: d44e3dde44d5dba41dfeac4c0ff729cab1ff63c6
branch: main
repository: buildos-platform
topic: 'Chat & Agent Integration Implementation Plan'
tags: [implementation, chat-system, agent-system, integration, refactoring]
status: in_progress
last_updated: 2025-10-28
last_updated_by: Claude Code
---

# Chat & Agent System Unified Integration Plan

## Overview

This document provides a **step-by-step implementation plan** to properly integrate the chat-context-service and agent-orchestrator-service into a unified system with tiered chat selection.

## Key Changes

1. **Move agent system prompts to chat-context-service**
2. **Create unified context loading** for all modes (global, project_create, project_update, etc.)
3. **Create ProjectSelectionView** for AgentModal with mode selection
4. **Integrate tools** from chat system into agent modes
5. **Update AgentOrchestrator** to delegate to chat-context-service

---

## Phase 1: Integrate System Prompts into ChatContextService

### File: `/apps/web/src/lib/services/chat-context-service.ts`

#### Changes Required

1. **Make getSystemPrompt() public** (currently private at line 148)
2. **Add agent mode system prompts** to the method
3. **Support metadata injection** for dynamic values

#### Implementation

```typescript
// Line 148 - Change from private to public
/**
 * Get system prompt for any context type
 * @param contextType - The type of chat context (global, project, project_create, etc.)
 * @param metadata - Optional metadata for prompt customization
 */
public getSystemPrompt(
  contextType: ChatContextType,
  metadata?: {
    userName?: string;
    projectName?: string;
    dimensionsCovered?: string[];
    auditHarshness?: number;
  }
): string {
  const currentDate = new Date().toISOString().split('T')[0];

  // Base prompts for reactive chat modes
  const basePrompt = `You are an AI assistant integrated into BuildOS, a productivity system designed for ADHD minds.
Current date: ${currentDate}

## Critical: Progressive Information Access Pattern

You have tools that follow a STRICT progressive disclosure pattern to optimize token usage:

### Tier 1: LIST/SEARCH Tools (Use First)
These return abbreviated summaries with preview fields:
- list_tasks → Task titles + 100 char description previews
- search_projects → Project summaries + 500 char context previews
- search_notes → Note titles + 200 char content previews
- get_calendar_events → Event times and titles only

### Tier 2: DETAIL Tools (Use Only When Needed)
These return complete information and should ONLY be called when:
- User explicitly asks for more details about a specific item
- You need complete information to answer a specific question
- User wants to modify something (need full context first)

Tools:
- get_task_details → Complete task with full descriptions
- get_project_details → Full project context and dimensions
- get_note_details → Complete note content

### Required Flow Pattern

1. **Always start with LIST/SEARCH tools**
   - Even if user mentions a specific item, search for it first
   - This confirms it exists and gets current status

2. **Show abbreviated results to user**
   - Present the summary information clearly
   - Indicate more details are available if needed

3. **Only drill down when necessary**
   - User asks a question requiring full details
   - User explicitly requests more information
   - You need to perform an action on the item

## Response Guidelines

- Be concise but helpful
- Show abbreviated lists with key information
- Only drill down when user shows interest
- Explain what you're doing when calling tools
- If calendar isn't connected, explain how to connect it`;

  // System prompts by context type
  const contextPrompts: Record<ChatContextType, string> = {
    // REACTIVE MODES (Original chat system)
    global: `${basePrompt}

## Current Context: Global
You're in general assistant mode. Help with any BuildOS-related questions or tasks.
You can search across all projects, tasks, and notes as needed.`,

    project: `${basePrompt}

## Current Context: Project
You're focused on a specific project. The abbreviated project context has been loaded.
Prioritize project-related tasks and information in your responses.
${metadata?.projectName ? `Project: ${metadata.projectName}` : ''}`,

    task: `${basePrompt}

## Current Context: Task
You're focused on a specific task. The abbreviated task context has been loaded.
Consider subtasks, dependencies, and parent project context when relevant.`,

    calendar: `${basePrompt}

## Current Context: Calendar
You're in calendar mode. Focus on scheduling, time management, and calendar events.
Use calendar tools to help with scheduling tasks and finding available time slots.`,

    // PROACTIVE MODES (Agent system)
    general: `You are a helpful BuildOS assistant that helps users create and manage projects.
Current date: ${currentDate}

## Your Role
Help users understand what BuildOS can do and guide them to the right features. Be friendly and concise.

## Capabilities
- Create new projects through conversation
- Update existing projects and tasks
- Audit projects for gaps and issues
- Forecast project outcomes and scenarios
- Update daily briefs
- Update individual tasks

## Guidelines
- Keep responses brief and actionable
- Suggest specific agent modes when appropriate
- Don't try to execute operations yourself - guide users to the right mode`,

    project_create: `You are a friendly, patient project consultant helping users organize their ideas into structured projects using BuildOS.
Current date: ${currentDate}
${metadata?.userName ? `User: ${metadata.userName}` : ''}

## Your Role
Listen first, then ask thoughtful questions about relevant dimensions from the 9 core project dimensions. Gather enough information to create a well-defined project without overwhelming the user.

## Core Dimensions (only ask about relevant ones)
1. **Integrity & Ideals** - What does success look like?
2. **People & Bonds** - Who's involved?
3. **Goals & Momentum** - Timeline and milestones
4. **Meaning & Identity** - Why this matters
5. **Reality & Understanding** - Current state
6. **Trust & Safeguards** - Risks and mitigations
7. **Opportunity & Freedom** - Options and experiments
8. **Power & Resources** - Budget and assets
9. **Harmony & Integration** - Feedback loops

${metadata?.dimensionsCovered?.length ? `## Already Covered
You've already gathered information about: ${metadata.dimensionsCovered.join(', ')}
Focus on remaining relevant dimensions.` : ''}

## Guidelines
- Let users brain dump without interruption initially
- Prioritize questions from most to least important
- Accept "I don't know" and move on
- Ask 3-5 questions for simple projects, 7-10 for complex
- After initial questions, offer: "Ready to create, or answer more questions?"
- Be warm and encouraging`,

    project_update: `You are an efficient project assistant focused on quickly updating existing projects.
Current date: ${currentDate}
${metadata?.projectName ? `Project: ${metadata.projectName}` : ''}

## Your Role
Identify what needs changing and execute updates efficiently. Be direct and action-oriented.

## Available Context
The abbreviated project context has been loaded, including:
- Project summary and executive summary
- 500-char context preview (use get_project_details for full context)
- Task counts and completion percentage
- Top 5 active tasks (abbreviated)

Use progressive disclosure tools to get more details as needed:
- list_tasks(project_id) - Get all tasks
- get_project_details(project_id) - Get full project context
- get_task_details(task_id) - Get specific task details

## Guidelines
- Don't ask unnecessary questions
- Show what you're about to change
- Execute quickly unless ambiguous
- Focus mainly on task updates unless project context needs updating`,

    project_audit: `You are a critical but constructive consultant performing project audits.
Current date: ${currentDate}
${metadata?.projectName ? `Project: ${metadata.projectName}` : ''}

## Audit Severity: ${metadata?.auditHarshness || 7}/10
- Be honest and direct about issues
- Frame problems as opportunities
- Acknowledge what's working
- Don't be demoralizing

## Available Context
The abbreviated project context has been loaded. Use get_project_details() to get:
- Full project context and core dimensions
- All phases and milestones
- Complete task list with details
- Recent notes and brain dumps

## Focus Areas
- Missing dimensions
- Inconsistent goals vs resources
- Unidentified risks
- Feasibility concerns
- Process improvements

Note: You have read-only access. Generate suggestions only.`,

    project_forecast: `You are a strategic advisor helping forecast project outcomes.
Current date: ${currentDate}
${metadata?.projectName ? `Project: ${metadata.projectName}` : ''}

## Framework
Generate three scenarios:
1. Optimistic (80th percentile)
2. Realistic (50th percentile)
3. Pessimistic (20th percentile)

## For Each Scenario
- Likelihood percentage
- Key outcomes
- Critical factors
- Warning signs
- Decision points

## Available Context
Use get_project_details() to analyze:
- Project timeline and milestones
- Resource allocation
- Dependencies and risks
- Historical progress data

Note: Read-only access for analysis.`,

    task_update: `You are a focused task assistant helping users quickly update task details.
Current date: ${currentDate}

## Your Role
Quickly understand what needs updating on a specific task and make the changes efficiently.

## Guidelines
- Be direct and action-oriented
- Confirm what you're changing before executing
- Handle multiple task updates in sequence
- If the task doesn't exist, offer to create it
- Keep responses brief

## Common Updates
- Status changes (backlog → in_progress → done)
- Priority adjustments
- Due date changes
- Adding/updating task details
- Breaking down into subtasks

## Available Tools
- list_tasks() - Find tasks
- get_task_details(task_id) - Get complete task info
- update_task(task_id, updates) - Apply changes`,

    daily_brief_update: `You are a helpful assistant for updating daily brief preferences and content.
Current date: ${currentDate}

## Your Role
Help users manage their daily brief settings, content, and delivery preferences.

## Capabilities
- Update brief delivery time
- Modify content preferences
- Adjust notification channels
- Add/remove brief sections
- Configure frequency

## Guidelines
- Confirm changes before applying
- Explain implications of changes
- Suggest optimal settings based on user needs
- Keep responses concise`
  };

  return contextPrompts[contextType] || contextPrompts.global;
}
```

---

## Phase 2: Update Agent Orchestrator to Use ChatContextService

### File: `/apps/web/src/lib/services/agent-orchestrator.service.ts`

#### Changes Required

1. **Remove AGENT_SYSTEM_PROMPTS** (lines 40-178) - now in ChatContextService
2. **Update all handler methods** to use `chatContextService.getSystemPrompt()`
3. **Use `chatContextService.loadLocationContext()`** for progressive disclosure

#### Implementation

```typescript
// REMOVE lines 40-178 (AGENT_SYSTEM_PROMPTS object)

// UPDATE handleProjectCreate (line 239)
private async *handleProjectCreate(
  session: ChatSession,
  userMessage: string,
  userId: string,
  autoAccept: boolean
): AsyncGenerator<AgentSSEMessage> {
  // Get or create draft
  let draft = await this.draftService.getOrCreateDraft(session.id, userId);

  const metadata = session.agent_metadata as AgentMetadata;
  const phase = metadata?.session_phase || 'gathering_info';

  if (phase === 'gathering_info') {
    // GET SYSTEM PROMPT FROM ChatContextService
    const systemPrompt = this.contextService.getSystemPrompt('project_create', {
      userName: session.user?.name,
      dimensionsCovered: draft.dimensions_covered || []
    });

    // Stream LLM response
    const stream = this.llmService.streamText({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      userId,
      profile: 'speed',
      temperature: 0.8,
      maxTokens: 500
    });

    // Yield text chunks
    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        yield { type: 'text', content: chunk.content };
      }
    }

    // Detect dimensions and transition to clarifying
    const dimensions = await this.detectRelevantDimensions(userMessage, draft);

    await this.updateSessionMetadata(session.id, {
      dimensions_detected: dimensions,
      session_phase: 'clarifying'
    });

    yield {
      type: 'phase_update',
      phase: 'clarifying',
      message: 'I have a few questions to help shape this project...'
    };

    // Ask first question
    const question = this.getNextPrioritizedQuestion(dimensions, draft);
    yield { type: 'text', content: question };
  }
  // ... rest of phases
}

// UPDATE handleProjectUpdate (line 466)
private async *handleProjectUpdate(
  session: ChatSession,
  userMessage: string,
  userId: string,
  autoAccept: boolean
): AsyncGenerator<AgentSSEMessage> {
  const projectId = session.entity_id;

  if (!projectId) {
    yield { type: 'error', error: 'No project selected for update' };
    return;
  }

  // USE ChatContextService for abbreviated context loading
  const context = await this.contextService.loadLocationContext(
    'project',
    projectId,
    true  // abbreviated=true for 70% token savings
  );

  // GET SYSTEM PROMPT with project name
  const { data: project } = await this.supabase
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .single();

  const systemPrompt = this.contextService.getSystemPrompt('project_update', {
    projectName: project?.name
  });

  // Stream response with abbreviated context
  const stream = this.llmService.streamText({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: context.content },  // Abbreviated project context
      { role: 'user', content: userMessage }
    ],
    userId,
    profile: 'balanced',
    temperature: 0.4,
    maxTokens: 1000
  });

  for await (const chunk of stream) {
    if (chunk.type === 'text') {
      yield { type: 'text', content: chunk.content };
    }
  }

  // TODO: Generate update operations
  // const operations = await this.generateUpdateOperations(userMessage, projectId);
  // if (autoAccept) { ... }
}

// UPDATE handleProjectAudit (line 530)
private async *handleProjectAudit(
  session: ChatSession,
  userMessage: string,
  userId: string
): AsyncGenerator<AgentSSEMessage> {
  const projectId = session.entity_id;

  if (!projectId) {
    yield { type: 'error', error: 'No project selected for audit' };
    return;
  }

  // Load ABBREVIATED context first
  const context = await this.contextService.loadLocationContext(
    'project',
    projectId,
    true  // abbreviated
  );

  // If analysis needs full details, user can request or LLM can call tools
  const { data: project } = await this.supabase
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .single();

  const systemPrompt = this.contextService.getSystemPrompt('project_audit', {
    projectName: project?.name,
    auditHarshness: 7
  });

  const stream = this.llmService.streamText({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: context.content },
      { role: 'user', content: `Please audit this project: ${userMessage}` }
    ],
    userId,
    profile: 'quality',
    temperature: 0.4,
    maxTokens: 3000
  });

  for await (const chunk of stream) {
    if (chunk.type === 'text') {
      yield { type: 'text', content: chunk.content };
    }
  }
}

// Similar updates for handleProjectForecast, handleTaskUpdate, handleDailyBriefUpdate
```

---

## Phase 3: Create ProjectSelectionView for AgentModal

### File: `/apps/web/src/lib/components/agent/ProjectModeSelectionView.svelte` (NEW)

This component provides the tiered selection:

1. **Global Chat** - General questions
2. **New Project** - project_create mode
3. **Select Existing Project** → Then choose mode:
    - Update Project
    - Audit Project
    - Forecast Project

```svelte
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Globe, Plus, FolderOpen, Edit3, Search, TrendingUp } from 'lucide-svelte';
	import type { Database } from '@buildos/shared-types';

	export let projects: Database['public']['Tables']['projects']['Row'][] = [];
	export let inModal = false;

	const dispatch = createEventDispatcher();

	let selectedProject: Database['public']['Tables']['projects']['Row'] | null = null;
	let showModeSelection = false;

	type ProjectMode = 'project_update' | 'project_audit' | 'project_forecast';

	function selectGlobalChat() {
		dispatch('modeSelected', {
			contextType: 'global',
			entityId: null
		});
	}

	function selectNewProject() {
		dispatch('modeSelected', {
			contextType: 'project_create',
			entityId: null
		});
	}

	function selectProject(project: Database['public']['Tables']['projects']['Row']) {
		selectedProject = project;
		showModeSelection = true;
	}

	function selectProjectMode(mode: ProjectMode) {
		if (!selectedProject) return;

		dispatch('modeSelected', {
			contextType: mode,
			entityId: selectedProject.id
		});
	}

	function goBack() {
		selectedProject = null;
		showModeSelection = false;
	}

	// Filter active projects
	$: activeProjects = projects.filter((p) => p.status === 'active');
</script>

<div
	class="h-full flex flex-col bg-gradient-to-br from-gray-50/50 to-gray-100/30 dark:from-gray-900/50 dark:to-gray-800/30 overflow-hidden {inModal
		? 'bg-white dark:bg-gray-800 h-auto min-h-[400px] max-h-[70vh]'
		: ''}"
>
	{#if !showModeSelection}
		<!-- MAIN SELECTION VIEW -->
		<div class="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl w-full mx-auto">
			<div class="text-center mb-8">
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
					How can I help you today?
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					Choose how you'd like to work with your projects
				</p>
			</div>

			<!-- Primary Actions -->
			<section class="space-y-4 mb-8">
				<!-- Global Chat Option -->
				<button
					on:click={selectGlobalChat}
					class="w-full flex items-center justify-between p-5 bg-gradient-to-r from-blue-50/30 to-indigo-50/30 dark:from-blue-900/10 dark:to-indigo-900/10 backdrop-blur-sm border-2 border-gray-300/50 dark:border-gray-600/50 hover:border-blue-300/50 dark:hover:border-blue-600/50 rounded-xl transition-all duration-200 hover:shadow-lg active:scale-[0.99] group"
				>
					<div class="flex items-center gap-4">
						<div
							class="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-100/70 to-indigo-100/70 dark:from-blue-800/40 dark:to-indigo-800/40 rounded-xl transition-transform duration-200 group-hover:scale-105 shadow-sm"
						>
							<Globe class="w-6 h-6 text-blue-600 dark:text-blue-400" />
						</div>
						<div class="text-left">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">
								Chat Globally
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Ask general questions about all your projects and tasks
							</p>
						</div>
					</div>
					<div
						class="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</div>
				</button>

				<!-- New Project Option -->
				<button
					on:click={selectNewProject}
					class="w-full flex items-center justify-between p-5 bg-gradient-to-r from-purple-50/30 to-pink-50/30 dark:from-purple-900/10 dark:to-pink-900/10 backdrop-blur-sm border-2 border-dashed border-gray-300/50 dark:border-gray-600/50 hover:border-purple-300/50 dark:hover:border-purple-600/50 rounded-xl transition-all duration-200 hover:shadow-lg active:scale-[0.99] group"
				>
					<div class="flex items-center gap-4">
						<div
							class="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-purple-100/70 to-pink-100/70 dark:from-purple-800/40 dark:to-pink-800/40 rounded-xl transition-transform duration-200 group-hover:scale-105 shadow-sm"
						>
							<Plus class="w-6 h-6 text-purple-600 dark:text-purple-400" />
						</div>
						<div class="text-left">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">
								Create New Project
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Guided conversation to plan and structure a new project
							</p>
						</div>
					</div>
					<div
						class="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</div>
				</button>
			</section>

			<!-- Existing Projects -->
			{#if activeProjects.length > 0}
				<section class="mb-4">
					<h3
						class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"
					>
						<FolderOpen class="w-5 h-5" />
						Work with Existing Project
					</h3>

					<div class="grid grid-cols-1 gap-3">
						{#each activeProjects as project}
							<button
								on:click={() => selectProject(project)}
								class="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all duration-200 active:scale-[0.99] group"
							>
								<div class="flex items-center gap-3 flex-1 min-w-0">
									<div
										class="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg flex-shrink-0"
									>
										<FolderOpen
											class="w-5 h-5 text-gray-600 dark:text-gray-400"
										/>
									</div>
									<div class="text-left flex-1 min-w-0">
										<h4
											class="font-medium text-gray-900 dark:text-white truncate"
										>
											{project.name}
										</h4>
										{#if project.description}
											<p
												class="text-sm text-gray-600 dark:text-gray-400 truncate"
											>
												{project.description}
											</p>
										{/if}
									</div>
								</div>
								<div
									class="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors flex-shrink-0"
								>
									<svg
										class="w-5 h-5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 5l7 7-7 7"
										/>
									</svg>
								</div>
							</button>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{:else if selectedProject}
		<!-- MODE SELECTION VIEW -->
		<div class="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl w-full mx-auto">
			<!-- Back button -->
			<button
				on:click={goBack}
				class="mb-6 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 19l-7-7 7-7"
					/>
				</svg>
				Back to selection
			</button>

			<div class="text-center mb-8">
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
					{selectedProject.name}
				</h2>
				<p class="text-gray-600 dark:text-gray-400">
					What would you like to do with this project?
				</p>
			</div>

			<div class="space-y-4">
				<!-- Update Mode -->
				<button
					on:click={() => selectProjectMode('project_update')}
					class="w-full flex items-center justify-between p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 rounded-xl transition-all duration-200 hover:shadow-lg active:scale-[0.99] group"
				>
					<div class="flex items-center gap-4">
						<div
							class="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-800/40 dark:to-indigo-800/40 rounded-xl transition-transform duration-200 group-hover:scale-105"
						>
							<Edit3 class="w-6 h-6 text-blue-600 dark:text-blue-400" />
						</div>
						<div class="text-left">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">
								Update Project
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Add tasks, update context, or modify project details
							</p>
						</div>
					</div>
					<div
						class="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</div>
				</button>

				<!-- Audit Mode -->
				<button
					on:click={() => selectProjectMode('project_audit')}
					class="w-full flex items-center justify-between p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-600 rounded-xl transition-all duration-200 hover:shadow-lg active:scale-[0.99] group"
				>
					<div class="flex items-center gap-4">
						<div
							class="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-800/40 dark:to-red-800/40 rounded-xl transition-transform duration-200 group-hover:scale-105"
						>
							<Search class="w-6 h-6 text-orange-600 dark:text-orange-400" />
						</div>
						<div class="text-left">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">
								Audit Project
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Get critical review of gaps, risks, and improvements
							</p>
						</div>
					</div>
					<div
						class="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</div>
				</button>

				<!-- Forecast Mode -->
				<button
					on:click={() => selectProjectMode('project_forecast')}
					class="w-full flex items-center justify-between p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-600 rounded-xl transition-all duration-200 hover:shadow-lg active:scale-[0.99] group"
				>
					<div class="flex items-center gap-4">
						<div
							class="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-800/40 dark:to-emerald-800/40 rounded-xl transition-transform duration-200 group-hover:scale-105"
						>
							<TrendingUp class="w-6 h-6 text-green-600 dark:text-green-400" />
						</div>
						<div class="text-left">
							<h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">
								Forecast Scenarios
							</h3>
							<p class="text-sm text-gray-600 dark:text-gray-400">
								Generate optimistic, realistic, and pessimistic forecasts
							</p>
						</div>
					</div>
					<div
						class="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</div>
				</button>
			</div>
		</div>
	{/if}
</div>
```

---

## Phase 4: Update AgentModal to Use ProjectModeSelectionView

### File: `/apps/web/src/lib/components/agent/AgentModal.svelte`

#### Changes Required

1. Add initial step with ProjectModeSelectionView
2. Store selected context_type and entity_id
3. Create session with proper context_type after selection
4. Show ChatInterface after mode is selected

```svelte
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import ProjectModeSelectionView from './ProjectModeSelectionView.svelte';
	import ChatInterface from './ChatInterface.svelte';
	import OperationsLog from './OperationsLog.svelte';
	import OperationsQueue from './OperationsQueue.svelte';
	import DraftsList from './DraftsList.svelte';
	import type { ChatContextType } from '@buildos/shared-types';

	export let onClose: () => void;
	export let initialProjects: any[] = [];

	// UI State
	let step: 'mode-selection' | 'chat' = 'mode-selection';
	let selectedContextType: ChatContextType | null = null;
	let selectedEntityId: string | null = null;
	let sessionId: string | null = null;

	// Panel visibility
	let showLeftPanel = $state(true);
	let showOperationsLog = $state(true);
	let showOperationsQueue = $state(true);

	// Data
	let operations = $state<any[]>([]);
	let queuedOperations = $state<any[]>([]);
	let drafts = $state<any[]>([]);

	// Determine if agent mode (shows operations panels)
	$: isAgentMode =
		selectedContextType &&
		['project_create', 'project_update', 'project_audit', 'project_forecast'].includes(
			selectedContextType
		);

	// Handle mode selection
	async function handleModeSelected(
		event: CustomEvent<{ contextType: ChatContextType; entityId: string | null }>
	) {
		const { contextType, entityId } = event.detail;

		selectedContextType = contextType;
		selectedEntityId = entityId;

		// Create chat session with proper context_type
		const response = await fetch('/api/agent/stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				context_type: contextType,
				entity_id: entityId,
				auto_accept: false // Default to manual approval
			})
		});

		const data = await response.json();
		sessionId = data.session_id;

		// Transition to chat
		step = 'chat';
	}

	function handleOperation(event: CustomEvent<any>) {
		operations = [...operations, event.detail];
	}

	function handleQueue(event: CustomEvent<any>) {
		queuedOperations = [...queuedOperations, ...event.detail];
	}
</script>

<Modal {onClose} size="xl" closeOnEscape={true}>
	<div class="agent-container">
		{#if step === 'mode-selection'}
			<!-- STEP 1: Mode Selection -->
			<ProjectModeSelectionView
				projects={initialProjects}
				inModal={true}
				on:modeSelected={handleModeSelected}
			/>
		{:else if step === 'chat'}
			<!-- STEP 2: Chat Interface -->

			<!-- LEFT PANEL: Drafts (only for project_create/update) -->
			{#if showLeftPanel && (selectedContextType === 'project_create' || selectedContextType === 'project_update')}
				<div class="left-panel" class:collapsed={!showLeftPanel}>
					<button class="collapse-btn" on:click={() => (showLeftPanel = !showLeftPanel)}>
						{showLeftPanel ? '◀' : '▶'}
					</button>
					{#if showLeftPanel}
						<DraftsList
							{drafts}
							on:select={(e) => console.log('Draft selected', e.detail)}
						/>
					{/if}
				</div>
			{/if}

			<!-- CENTER: Chat Interface (always visible) -->
			<div class="chat-panel">
				<ChatInterface
					chatType={selectedContextType}
					entityId={selectedEntityId}
					{sessionId}
					autoAcceptOperations={false}
					on:operation={handleOperation}
					on:queue={handleQueue}
				/>
			</div>

			<!-- RIGHT PANELS: Operations (only for agent modes) -->
			{#if isAgentMode}
				<div class="right-panels">
					<!-- Operations Log (Top) -->
					<div class="operations-log-panel" class:collapsed={!showOperationsLog}>
						<button on:click={() => (showOperationsLog = !showOperationsLog)}>
							{showOperationsLog ? '▼' : '▶'} Operations Log ({operations.length})
						</button>
						{#if showOperationsLog}
							<OperationsLog {operations} />
						{/if}
					</div>

					<!-- Operations Queue (Bottom) -->
					{#if queuedOperations.length > 0}
						<div class="operations-queue-panel" class:collapsed={!showOperationsQueue}>
							<button on:click={() => (showOperationsQueue = !showOperationsQueue)}>
								{showOperationsQueue ? '▼' : '▶'} Operations Queue ({queuedOperations.length})
							</button>
							{#if showOperationsQueue}
								<OperationsQueue
									operations={queuedOperations}
									on:approve={(e) => console.log('Approve', e.detail)}
									on:approveAll={() => console.log('Approve all')}
									on:edit={(e) => console.log('Edit', e.detail)}
								/>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</Modal>

<style>
	.agent-container {
		display: grid;
		height: 80vh;
		gap: 1rem;
		grid-template-columns: auto 1fr auto;
	}

	.left-panel,
	.right-panels {
		min-width: 48px;
		max-width: 400px;
		transition: all 0.3s ease;
	}

	.left-panel.collapsed,
	.right-panels.collapsed {
		width: 48px;
	}

	.chat-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.collapse-btn {
		width: 100%;
		padding: 0.5rem;
		text-align: center;
		background: var(--color-bg-secondary);
		border: none;
		cursor: pointer;
	}

	.collapsed .operations-log-panel,
	.collapsed .operations-queue-panel {
		height: 40px;
		overflow: hidden;
	}

	/* Mobile responsive */
	@media (max-width: 1024px) {
		.agent-container {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}

		.left-panel,
		.right-panels {
			display: none;
		}
	}
</style>
```

---

## Phase 5: Tools Integration

### File: `/apps/web/src/lib/chat/tools.config.ts`

The chat system already has comprehensive tools. We need to ensure agent modes can use them.

#### Option A: Agent uses ChatToolExecutor directly

```typescript
// In agent-orchestrator.service.ts
import { ChatToolExecutor } from '$lib/chat/tool-executor';

export class AgentOrchestrator {
  private toolExecutor: ChatToolExecutor;

  constructor(supabase: SupabaseClient<Database>) {
    // ... existing initialization
    this.toolExecutor = new ChatToolExecutor(supabase, userId);
  }

  private async *handleProjectAudit(...) {
    // ... get system prompt and context

    // LLM can call tools during audit
    const stream = this.llmService.streamText({
      messages: [...],
      userId,
      profile: 'quality',
      tools: CHAT_TOOLS,  // Make tools available
      toolExecutor: this.toolExecutor
    });

    for await (const chunk of stream) {
      if (chunk.type === 'tool_call') {
        const result = await this.toolExecutor.execute(chunk.tool_call);
        yield { type: 'tool_result', tool_result: result };
      } else if (chunk.type === 'text') {
        yield { type: 'text', content: chunk.content };
      }
    }
  }
}
```

#### Option B: Create AgentTools specific to proactive modes

```typescript
// /apps/web/src/lib/chat/agent-tools.config.ts
export const AGENT_TOOLS = [
	{
		type: 'function',
		function: {
			name: 'update_draft_dimension',
			description: 'Update a specific dimension of the draft project',
			parameters: {
				type: 'object',
				properties: {
					draft_id: { type: 'string' },
					dimension: {
						type: 'string',
						enum: [
							'core_integrity_ideals',
							'core_people_bonds'
							// ... all 9 dimensions
						]
					},
					content: { type: 'string' }
				},
				required: ['draft_id', 'dimension', 'content']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'finalize_draft',
			description: 'Convert draft to final project with tasks',
			parameters: {
				type: 'object',
				properties: {
					draft_id: { type: 'string' },
					operations: {
						type: 'array',
						items: { type: 'object' },
						description: 'ParsedOperations to execute'
					}
				},
				required: ['draft_id', 'operations']
			}
		}
	}
];

// Merge with chat tools for agent modes
export const ALL_TOOLS = [...CHAT_TOOLS, ...AGENT_TOOLS];
```

---

## Phase 6: Testing Plan

### Unit Tests

```typescript
// /apps/web/src/lib/services/chat-context-service.test.ts
describe('ChatContextService', () => {
	describe('getSystemPrompt', () => {
		it('returns correct prompt for project_create mode', () => {
			const service = new ChatContextService(supabase);
			const prompt = service.getSystemPrompt('project_create', {
				userName: 'Alice',
				dimensionsCovered: ['core_integrity_ideals']
			});

			expect(prompt).toContain('project consultant');
			expect(prompt).toContain('Alice');
			expect(prompt).toContain('Already Covered');
			expect(prompt).toContain('core_integrity_ideals');
		});

		it('returns correct prompt for project_update mode', () => {
			const service = new ChatContextService(supabase);
			const prompt = service.getSystemPrompt('project_update', {
				projectName: 'Website Redesign'
			});

			expect(prompt).toContain('efficient project assistant');
			expect(prompt).toContain('Website Redesign');
			expect(prompt).toContain('abbreviated project context');
		});
	});
});

// /apps/web/src/lib/components/agent/ProjectModeSelectionView.test.ts
describe('ProjectModeSelectionView', () => {
	it('dispatches global mode on global chat click', async () => {
		const { component } = render(ProjectModeSelectionView, {
			projects: []
		});

		const spy = vi.fn();
		component.$on('modeSelected', spy);

		const globalBtn = screen.getByText('Chat Globally');
		await fireEvent.click(globalBtn);

		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({
				detail: { contextType: 'global', entityId: null }
			})
		);
	});

	it('shows mode selection after project selected', async () => {
		const { component } = render(ProjectModeSelectionView, {
			projects: [{ id: 'p1', name: 'Test Project', status: 'active' }]
		});

		const projectBtn = screen.getByText('Test Project');
		await fireEvent.click(projectBtn);

		expect(screen.getByText('Update Project')).toBeInTheDocument();
		expect(screen.getByText('Audit Project')).toBeInTheDocument();
		expect(screen.getByText('Forecast Scenarios')).toBeInTheDocument();
	});
});
```

### Integration Tests

```typescript
// /apps/web/src/routes/api/agent/stream/+server.test.ts
describe('Agent Stream API', () => {
	it('creates session with correct context_type', async () => {
		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					context_type: 'project_create',
					entity_id: null
				})
			}),
			locals: { user: testUser, supabase: testSupabase }
		});

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.session_id).toBeDefined();

		// Verify session in database
		const { data: session } = await testSupabase
			.from('chat_sessions')
			.select('*')
			.eq('id', data.session_id)
			.single();

		expect(session.context_type).toBe('project_create');
		expect(session.entity_id).toBeNull();
	});

	it('loads abbreviated context for project_update', async () => {
		// Create test project
		const { data: project } = await testSupabase
			.from('projects')
			.insert({ name: 'Test', user_id: testUser.id })
			.select()
			.single();

		const response = await POST({
			request: new Request('http://localhost', {
				method: 'POST',
				body: JSON.stringify({
					context_type: 'project_update',
					entity_id: project.id
				})
			}),
			locals: { user: testUser, supabase: testSupabase }
		});

		// Stream should include abbreviated context
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		const { value } = await reader.read();
		buffer += decoder.decode(value);

		expect(buffer).toContain('Project:');
		expect(buffer).toContain('context preview');
		expect(buffer).not.toContain('[use get_project_details for full context]');
	});
});
```

---

## Summary of Changes

### Files to Modify

1. ✅ `/apps/web/src/lib/services/chat-context-service.ts`
    - Make `getSystemPrompt()` public
    - Add all agent mode prompts
    - Support metadata injection

2. ✅ `/apps/web/src/lib/services/agent-orchestrator.service.ts`
    - Remove `AGENT_SYSTEM_PROMPTS` (lines 40-178)
    - Update all handlers to use `chatContextService.getSystemPrompt()`
    - Use `chatContextService.loadLocationContext()` for progressive disclosure

3. ✅ `/apps/web/src/lib/components/agent/AgentModal.svelte`
    - Add step state ('mode-selection' | 'chat')
    - Integrate ProjectModeSelectionView
    - Create session after mode selection
    - Show ChatInterface with proper context

### Files to Create

4. ✅ `/apps/web/src/lib/components/agent/ProjectModeSelectionView.svelte`
    - Tiered selection UI
    - Global, New Project, Existing Project options
    - Project mode submenu (update, audit, forecast)

### Testing Files

5. ✅ `/apps/web/src/lib/services/chat-context-service.test.ts`
6. ✅ `/apps/web/src/lib/components/agent/ProjectModeSelectionView.test.ts`
7. ✅ `/apps/web/src/routes/api/agent/stream/+server.test.ts`

---

## Expected Outcomes

✅ **Unified System Prompts**: All prompts managed in ChatContextService
✅ **Progressive Disclosure**: Agent modes use abbreviated context (70% token savings)
✅ **Tiered Selection**: Users choose global, new project, or existing project with mode
✅ **Context-Aware Tools**: Tools available based on context_type
✅ **Consistent Architecture**: Both reactive and proactive modes use same infrastructure

---

## Next Steps

1. **Phase 1**: Implement ChatContextService changes (1 day)
2. **Phase 2**: Update AgentOrchestrator to use ChatContextService (1 day)
3. **Phase 3**: Create ProjectModeSelectionView component (1 day)
4. **Phase 4**: Wire up AgentModal with selection flow (1 day)
5. **Phase 5**: Tools integration (1 day)
6. **Phase 6**: Testing and refinement (2 days)

**Total Estimated Time**: 1 week

**Priority Order**: 1 → 2 → 3 → 4 → 5 → 6

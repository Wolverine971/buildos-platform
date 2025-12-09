---
date: 2025-11-09T11:45:00-08:00
researcher: Claude
repository: buildos-platform
topic: 'Project and Task Ontology Migration Framework'
tags: [research, buildos, ontology, migration, llm, templates, architecture]
status: complete
path: thoughts/shared/research/2025-11-09_project-task-ontology-migration-framework.md
---

# Project and Task Ontology Migration Framework

## Executive Summary

This framework outlines a comprehensive LLM-driven migration strategy to move from the traditional projects/tasks system to the ontology system. The migration uses AI to classify projects, dynamically create templates, and preserve all data relationships while transforming the structure to leverage the ontology's template-driven, FSM-enabled architecture.

## Audit Adjustments (2025-11-10)

- **Centralized legacy mapping**: introduce a `legacy_entity_mappings` table plus `migration_log` entries for every entity so we have a single source of truth for lookups, reconciliation, and rollback (avoids sprinkling `legacy_id` columns everywhere).
- **Template readiness gates**: migration batches can only start once the template review queue is empty for the project types contained in that batch, ensuring the LLM never falls back to ad-hoc schemas mid-migration.
- **LLM guardrails**: cache prompt results per legacy entity, require human approval when confidence <80%, and persist the prompt/response for audit so we can re-run with a new model if needed without touching production data.
- **Dual-write discipline**: after each entity type is migrated, the orchestrator enables mirrored writes (legacy + ontology) with diff-check metrics; cutover only happens after a full week of drift-free operation.
- **Calendar dependency**: task migration now depends on the `onto_events` + `onto_event_sync` work—task backfills must emit related events/edges in the same transaction to keep schedules consistent with Google Calendar sync.

## Architecture Overview

### Migration Components

```
┌─────────────────────────────────────────────────────────────┐
│                   Migration Orchestrator                     │
│  Coordinates entire migration process, manages state         │
└─────────────────┬───────────────────────────────────────────┘
                  │
     ┌────────────┼────────────┬────────────┬────────────┐
     ▼            ▼            ▼            ▼            ▼
┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Template │ │Project   │ │Phase     │ │Task      │ │Relation  │
│Discovery│ │Classifier│ │Migrator  │ │Migrator  │ │Builder   │
└─────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
     │            │            │            │            │
     ▼            ▼            ▼            ▼            ▼
┌──────────────────────────────────────────────────────────────┐
│                    LLM Classification Engine                  │
│         (OpenAI GPT-4 with structured outputs)               │
└──────────────────────────────────────────────────────────────┘
```

## Phase 1: Template Discovery & Creation

### 1.1 Project Analysis Pipeline

```typescript
interface ProjectAnalysis {
  project_id: string;
  analysis: {
    // Extracted from name, description, context
    domain: string;           // writer, developer, coach, personal, etc.
    deliverable: string;       // book, app, course, routine, etc.
    variant?: string;         // mobile, web, fiction, etc.

    // Inferred characteristics
    complexity: 'simple' | 'moderate' | 'complex' | 'extensive';
    duration: 'short' | 'medium' | 'long' | 'ongoing';
    collaboration: 'solo' | 'small_team' | 'large_team' | 'community';

    // Facet classification
    suggested_facets: {
      context: 'personal' | 'client' | 'commercial' | 'internal' | 'community';
      scale: 'micro' | 'small' | 'medium' | 'large' | 'epic';
      stage: 'discovery' | 'planning' | 'execution' | 'launch' | 'maintenance';
    };

    // Template matching
    matching_template?: string;     // Existing template type_key
    confidence_score: number;        // 0-100
    requires_new_template: boolean;
    suggested_type_key?: string;    // If new template needed
  };
}
```

### 1.2 LLM Classification Prompt

```typescript
const PROJECT_CLASSIFICATION_PROMPT = `
Analyze this project and classify it for migration to an ontology-based system.

Project Data:
- Name: {{project.name}}
- Description: {{project.description}}
- Context: {{project.context}}
- Core Values: {{project.core_*}} // All core fields
- Status: {{project.status}}
- Date Range: {{project.start_date}} to {{project.end_date}}
- Tags: {{project.tags}}
- Executive Summary: {{project.executive_summary}}

Existing Templates:
{{existing_templates}} // List of available templates with descriptions

Your task:
1. Determine the project's domain (writer, developer, coach, personal, business, etc.)
2. Identify the main deliverable type
3. Check if any existing template matches (confidence > 80%)
4. If no match, suggest a new template type_key following the pattern: {domain}.{deliverable}.{variant?}
5. Extract facets based on project characteristics
6. Identify key properties that should be tracked

Return as structured JSON:
{
  "domain": "string",
  "deliverable": "string",
  "variant": "string or null",
  "matched_template": "type_key or null",
  "confidence": 0-100,
  "requires_new_template": boolean,
  "suggested_type_key": "string if new template needed",
  "suggested_name": "human-friendly template name",
  "facets": {
    "context": "personal|client|commercial|internal|community",
    "scale": "micro|small|medium|large|epic",
    "stage": "discovery|planning|execution|launch|maintenance"
  },
  "key_properties": {
    "property_name": "description of what this tracks"
  },
  "fsm_states": ["suggested", "state", "machine", "states"],
  "reasoning": "explanation of classification"
}
`;
```

### 1.3 Template Generation Pipeline

When a new template is needed:

```typescript
interface TemplateGeneration {
  type_key: string;
  name: string;
  scope: 'project';
  parent_key?: string;  // Inherit from base if applicable

  metadata: {
    realm: string;      // creative, technical, service, personal, business
    output_type: string; // content, software, service, process, physical
    keywords: string[];
    typical_duration?: string;
    typical_team_size?: string;
  };

  facet_defaults: {
    context: string;
    scale: string;
    stage: string;
  };

  schema: {
    // JSON Schema for validation
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };

  fsm: {
    states: string[];
    initial: string;
    transitions: Array<{
      from: string;
      to: string;
      event: string;
      guards?: string[];
      actions?: string[];
    }>;
  };

  default_props: Record<string, any>;
}
```

### 1.4 Template Creation Service

```typescript
class TemplateMigrationService {
  async discoverOrCreateTemplate(
    project: Project,
    existingTemplates: Template[]
  ): Promise<Template> {
    // Step 1: Analyze project with LLM
    const analysis = await this.analyzeProject(project, existingTemplates);

    // Step 2: Check if template exists
    if (analysis.matched_template && analysis.confidence > 80) {
      return existingTemplates.find(t => t.type_key === analysis.matched_template);
    }

    // Step 3: Generate new template
    const templateSpec = await this.generateTemplate(analysis);

    // Step 4: Validate with human review queue
    await this.queueForReview(templateSpec);

    // Step 5: Create template in database
    return await this.createTemplate(templateSpec);
  }

  private async generateTemplate(analysis: ProjectAnalysis): Promise<TemplateGeneration> {
    const prompt = `
      Generate a complete template specification for this project type:
      ${JSON.stringify(analysis)}

      Include:
      1. Appropriate FSM states for this project type
      2. Schema properties relevant to the domain
      3. Default values based on common patterns
      4. Metadata for discovery and categorization
    `;

    return await this.llm.generateStructured(prompt, TemplateGenerationSchema);
  }
}
```

## Phase 2: Project Migration

### 2.1 Data Mapping Strategy

```typescript
interface ProjectMigrationMapping {
  // Direct field mappings
  direct_mappings: {
    "projects.id": "onto_projects.props->>'legacy_id'", // Also recorded in legacy_entity_mappings
    'projects.user_id': 'onto_projects.user_id',
    'projects.name': 'onto_projects.name',
    'projects.description': 'onto_projects.description',
    'projects.slug': 'onto_projects.props.slug',
    'projects.created_at': 'onto_projects.created_at',
    'projects.updated_at': 'onto_projects.updated_at',
  };

  // Complex mappings requiring transformation
  transformed_mappings: {
    // Status to FSM state
    'projects.status': (status: string) => {
      const stateMap = {
        'planning': 'planning',
        'active': 'execution',
        'completed': 'complete',
        'archived': 'archived'
      };
      return stateMap[status] || 'planning';
    },

    // Core values to properties
    'projects.core_*': (project: Project) => {
      return {
        core_values: {
          goals_momentum: project.core_goals_momentum,
          harmony_integration: project.core_harmony_integration,
          integrity_ideals: project.core_integrity_ideals,
          meaning_identity: project.core_meaning_identity,
          opportunity_freedom: project.core_opportunity_freedom,
          people_bonds: project.core_people_bonds,
          power_resources: project.core_power_resources,
          reality_understanding: project.core_reality_understanding,
          trust_safeguards: project.core_trust_safeguards
        }
      };
    },

    // Context to rich props
    'projects.context': (context: string) => ({
      original_context: context,
      brain_dump_history: [], // Will be populated from brain_dumps table
    })
  };

  // Calendar settings migration
  calendar_migration: {
    'projects.calendar_*': async (project: Project) => {
      if (project.calendar_sync_enabled) {
        // Create entry in project_calendars if needed
        return {
          calendar_integration: {
            sync_enabled: project.calendar_sync_enabled,
            color_id: project.calendar_color_id,
            settings: project.calendar_settings
          }
        };
      }
    }
  };
}
```

### 2.1b Legacy Mapping Table

Store every legacy→ontology relationship centrally so downstream services can resolve IDs without scanning multiple tables:

```sql
CREATE TABLE legacy_entity_mappings (
  id BIGSERIAL PRIMARY KEY,
  legacy_table TEXT NOT NULL,
  legacy_id UUID NOT NULL,
  onto_table TEXT NOT NULL,
  onto_id UUID NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (legacy_table, legacy_id),
  UNIQUE (onto_table, onto_id)
);

CREATE INDEX idx_legacy_entity_mappings_legacy
  ON legacy_entity_mappings (legacy_table, legacy_id);

CREATE INDEX idx_legacy_entity_mappings_onto
  ON legacy_entity_mappings (onto_table, onto_id);
```

- `checksum` stores a hash of the serialized legacy row so validation jobs can detect drift without re-querying the source tables.
- The orchestrator writes to this table inside the same transaction that creates the ontology entity; rollback scripts delete by `migrated_at`.
- API surfaces that still accept legacy IDs can join against `legacy_entity_mappings` instead of waiting for full code rewrites.

### 2.2 Project Migration Service

```typescript
class ProjectMigrationService {
  async migrateProject(project: Project): Promise<OntoProject> {
    // Step 1: Get or create template
    const template = await this.templateService.discoverOrCreateTemplate(project);

    // Step 2: Extract facets
    const facets = await this.extractFacets(project);

    // Step 3: Build ontology project
    const ontoProject = {
      user_id: project.user_id,
      actor_id: await this.ensureActor(project.user_id),
      type_key: template.type_key,
      template_id: template.id,
      template_snapshot: template, // Snapshot at creation

      name: project.name,
      description: project.description,

      // FSM state based on project status
      current_state: this.mapStatusToState(project.status),
      available_transitions: template.fsm.transitions,
      state_history: [{
        state: 'created',
        timestamp: project.created_at,
        trigger: 'migration'
      }],

      // Facets
      facets: facets,

      // All other data in props
      props: {
        legacy_id: project.id,
        slug: project.slug,
        original_context: project.context,
        executive_summary: project.executive_summary,
        core_values: this.extractCoreValues(project),
        calendar_settings: this.extractCalendarSettings(project),
        source: project.source,
        source_metadata: project.source_metadata,
        tags: project.tags,
        date_range: {
          start: project.start_date,
          end: project.end_date
        }
      },

      metadata: {
        migrated_at: new Date().toISOString(),
        migration_version: '1.0',
        original_table: 'projects'
      }
    };

    // Step 4: Create in database
    const created = await this.db.onto_projects.insert(ontoProject);

    // Step 5: Migrate calendar if needed
    if (project.calendar_sync_enabled) {
      await this.migrateCalendarSettings(project.id, created.id);
    }

    return created;
  }

  private async extractFacets(project: Project): Promise<Facets> {
    const prompt = `
      Based on this project, determine the appropriate facets:

      Project: ${JSON.stringify(project)}

      Context options: personal, client, commercial, internal, community
      Scale options: micro, small, medium, large, epic
      Stage options: discovery, planning, execution, launch, maintenance, complete

      Consider:
      - Duration and complexity for scale
      - Current status and dates for stage
      - Description and core values for context
    `;

    return await this.llm.generateStructured(prompt, FacetsSchema);
  }
}
```

## Phase 3: Phase to Plan Migration

### 3.1 Phase Transformation

Phases map naturally to `onto_plans`:

```typescript
interface PhaseToPlanMapping {
  phase_id: string;
  onto_plan: {
    type_key: 'plan.project_phase';
    name: string;
    description: string;

    props: {
      legacy_phase_id: string;
      order: number;
      scheduling_method: string;
      date_range: {
        start: string;
        end: string;
      };
    };

    facets: {
      context: string;  // Inherit from project
      scale: 'small' | 'medium' | 'large'; // Based on task count
      stage: string;    // Based on dates
    };
  };
}
```

### 3.2 Phase Migration Logic

```typescript
class PhaseMigrationService {
  async migratePhases(projectId: string, ontoProjectId: string): Promise<OntoPlan[]> {
    const phases = await this.db.phases.findMany({
      where: { project_id: projectId },
      orderBy: { order: 'asc' }
    });

    const ontoPlans = [];

    for (const phase of phases) {
      const taskCount = await this.getPhaseTaskCount(phase.id);

      const ontoPlan = await this.db.onto_plans.insert({
        user_id: phase.user_id,
        type_key: 'plan.project_phase',
        template_id: await this.getPhaseTemplate(),

        name: phase.name,
        description: phase.description,

        // Dates
        start_date: phase.start_date,
        end_date: phase.end_date,

        // FSM
        current_state: this.determinePhaseState(phase),

        // Facets
        facets: {
          context: await this.getProjectContext(ontoProjectId),
          scale: this.determinePhaseScale(taskCount),
          stage: this.determinePhaseStage(phase)
        },

        props: {
          legacy_phase_id: phase.id,
          order: phase.order,
          scheduling_method: phase.scheduling_method,
          task_count: taskCount
        }
      });

      // Create edge relationship to project
      await this.db.onto_edges.insert({
        from_entity_id: ontoProjectId,
        from_entity_type: 'project',
        to_entity_id: ontoPlan.id,
        to_entity_type: 'plan',
        edge_type: 'contains_phase',
        metadata: {
          order: phase.order
        }
      });

      ontoPlans.push(ontoPlan);
    }

    return ontoPlans;
  }
}
```

## Phase 4: Task Migration

### 4.1 Task Classification

```typescript
interface TaskClassification {
  task_id: string;
  analysis: {
    task_nature: 'action' | 'milestone' | 'decision' | 'review' | 'recurring';
    complexity: 'trivial' | 'simple' | 'moderate' | 'complex';

    suggested_type_key: string; // e.g., 'task.development', 'task.writing'
    suggested_template: string;

    properties: {
      requires_deep_work: boolean;
      has_external_dependencies: boolean;
      is_blocking: boolean;
      estimated_effort: 'minutes' | 'hours' | 'days' | 'weeks';
    };
  };
}
```

### 4.2 Task Migration Service

```typescript
class TaskMigrationService {
  async migrateTasks(projectId: string, ontoProjectId: string): Promise<OntoTask[]> {
    const tasks = await this.db.tasks.findMany({
      where: { project_id: projectId }
    });

    // Group by phase for context
    const tasksByPhase = await this.groupTasksByPhase(tasks);

    const ontoTasks = [];

    for (const [phaseId, phaseTasks] of tasksByPhase) {
      const ontoPlanId = await this.getOntoPlanId(phaseId);

      for (const task of phaseTasks) {
        // Classify task with LLM
        const classification = await this.classifyTask(task);

        const ontoTask = await this.db.onto_tasks.insert({
          user_id: task.user_id,
          type_key: classification.suggested_type_key,
          template_id: await this.getTaskTemplate(classification.suggested_template),

          title: task.title,
          description: task.description,

          // Status to FSM state
          current_state: this.mapTaskStatus(task.status),

          // Facets
          facets: {
            context: await this.getProjectContext(ontoProjectId),
            scale: this.determineTaskScale(task),
            stage: this.determineTaskStage(task)
          },

          // Rich properties
          props: {
            legacy_task_id: task.id,
            details: task.details,
            task_steps: task.task_steps,
            priority: task.priority,
            task_type: task.task_type,
            duration_minutes: task.duration_minutes,
            dependencies: task.dependencies,

            // Scheduling
            start_date: task.start_date,
            completed_at: task.completed_at,

            // Recurrence
            recurrence: task.recurrence_pattern ? {
              pattern: task.recurrence_pattern,
              ends: task.recurrence_ends,
              end_reason: task.recurrence_end_source
            } : null,

            // Calendar
            source_calendar_event_id: task.source_calendar_event_id,

            // Classification insights
            classification: classification.analysis
          }
        });

        // Create relationships
        await this.createTaskRelationships(ontoTask, {
          projectId: ontoProjectId,
          planId: ontoPlanId,
          parentTaskId: task.parent_task_id
        });

        ontoTasks.push(ontoTask);
      }
    }

    return ontoTasks;
  }

  private async createTaskRelationships(
    task: OntoTask,
    refs: { projectId: string; planId?: string; parentTaskId?: string }
  ) {
    // Task -> Project
    await this.db.onto_edges.insert({
      from_entity_id: refs.projectId,
      from_entity_type: 'project',
      to_entity_id: task.id,
      to_entity_type: 'task',
      edge_type: 'contains_task'
    });

    // Plan -> Task (if in phase)
    if (refs.planId) {
      await this.db.onto_edges.insert({
        from_entity_id: refs.planId,
        from_entity_type: 'plan',
        to_entity_id: task.id,
        to_entity_type: 'task',
        edge_type: 'includes_task'
      });
    }

    // Parent -> Child task
    if (refs.parentTaskId) {
      const parentOntoId = await this.getOntoTaskId(refs.parentTaskId);
      if (parentOntoId) {
        await this.db.onto_edges.insert({
          from_entity_id: parentOntoId,
          from_entity_type: 'task',
          to_entity_id: task.id,
          to_entity_type: 'task',
          edge_type: 'has_subtask'
        });
      }
    }
  }

  private async classifyTask(task: Task): Promise<TaskClassification> {
    const prompt = `
      Classify this task for ontology migration:

      Task: ${JSON.stringify(task)}

      Determine:
      1. Task nature (action, milestone, decision, review, recurring)
      2. Complexity level
      3. Appropriate type_key (e.g., task.development.feature, task.writing.chapter)
      4. Key properties that characterize this task

      Available task templates:
      - task.base
      - task.quick
      - task.deep_work
      - task.recurring
      - task.milestone
      - task.meeting_prep
      - task.research
      - task.review
    `;

    return await this.llm.generateStructured(prompt, TaskClassificationSchema);
  }
}
```

## Phase 5: Calendar Event Migration

### 5.1 Calendar Migration Strategy

```typescript
class CalendarMigrationService {
  async migrateCalendarData(projectId: string, ontoProjectId: string): Promise<void> {
    // Step 1: Migrate project calendars
    const projectCalendars = await this.db.project_calendars.findMany({
      where: { project_id: projectId }
    });

    for (const cal of projectCalendars) {
      await this.db.project_calendars.update({
        where: { id: cal.id },
        data: {
          onto_project_id: ontoProjectId,
          // Keep legacy project_id for backwards compatibility
        }
      });
    }

    const calendarsById = new Map(projectCalendars.map((cal) => [cal.id, cal]));

    // Step 2: Create onto_events from task_calendar_events
    const taskEvents = await this.db.task_calendar_events.findMany({
      where: {
        task: {
          project_id: projectId
        }
      },
      include: {
        task: true
      }
    });

    const eventTemplate = await this.templateService.getSnapshot('event.task_work');
    const ontoProject = await this.db.onto_projects.findUniqueOrThrow({
      where: { id: ontoProjectId }
    });

    for (const event of taskEvents) {
      const ontoTaskId = await this.getOntoTaskId(event.task_id);
      if (!ontoTaskId) continue;

      const ontoEvent = await this.db.onto_events.insert({
        org_id: ontoProject.org_id,
        project_id: ontoProjectId,
        owner_entity_type: 'task',
        owner_entity_id: ontoTaskId,
        type_key: 'event.task_work',
        state_key: event.status === 'cancelled' ? 'cancelled' : 'scheduled',
        template_id: eventTemplate.id,
        template_snapshot: eventTemplate.snapshot,
        title: event.summary || 'Task Work Session',
        description: event.description,
        location: event.location,
        start_at: event.start_time,
        end_at: event.end_time,
        all_day: event.all_day,
        timezone: event.timezone,
        props: {
          legacy_task_calendar_event_id: event.id,
          legacy_task_id: event.task_id,
          legacy_project_id: event.task.project_id,
          external_link: event.event_link,
          attendees: event.attendees,
          organizer: {
            email: event.organizer_email,
            display_name: event.organizer_display_name,
            is_self: event.organizer_self
          },
          recurrence: {
            master_id: event.recurrence_master_id,
            instance_date: event.recurrence_instance_date,
            is_exception: event.is_exception,
            exception_type: event.exception_type
          }
        },
        created_by: event.task.created_by
      });

      const calendar = calendarsById.get(event.calendar_id);

      await this.db.onto_event_sync.insert({
        event_id: ontoEvent.id,
        calendar_id: event.calendar_id,
        provider: calendar?.provider || 'google',
        external_event_id: event.calendar_event_id,
        sync_status: event.sync_error ? 'error' : 'synced',
        sync_error: event.sync_error,
        last_synced_at: event.last_synced_at
      });

      // Create edge: event -> task
      if (ontoTaskId) {
        await this.db.onto_edges.insert({
          from_entity_id: ontoEvent.id,
          from_entity_type: 'event',
          to_entity_id: ontoTaskId,
          to_entity_type: 'task',
          edge_type: 'schedules'
        });
      }
    }
  }
}
```

## Phase 6: Migration Orchestrator

### 6.1 Main Migration Flow

```typescript
class OntologyMigrationOrchestrator {
  private progress: MigrationProgress;
  private errors: MigrationError[];

  async executeMigration(
    options: MigrationOptions = {}
  ): Promise<MigrationResult> {
    const {
      batchSize = 10,
      dryRun = false,
      includeArchived = false,
      projectIds = null // Specific projects or all
    } = options;

    // Step 1: Inventory
    const inventory = await this.buildInventory(projectIds, includeArchived);
    console.log(`Found ${inventory.projectCount} projects to migrate`);

    // Step 2: Template Discovery
    console.log('Phase 1: Template Discovery...');
    const templates = await this.discoverTemplates(inventory.projects);

    if (dryRun) {
      return this.generateDryRunReport(templates, inventory);
    }

    // Step 3: Create missing templates
    console.log('Phase 2: Creating templates...');
    const createdTemplates = await this.createTemplates(templates.newTemplates);

    // Step 4: Migrate projects in batches
    console.log('Phase 3: Migrating projects...');
    for (const batch of this.batchProjects(inventory.projects, batchSize)) {
      await this.migrateBatch(batch);
    }

    // Step 5: Validate migration
    console.log('Phase 4: Validating migration...');
    const validation = await this.validateMigration(inventory);

    // Step 6: Create audit report
    return this.generateMigrationReport(validation);
  }

  private async migrateBatch(projects: Project[]): Promise<void> {
    for (const project of projects) {
      try {
        // Wrap in transaction
        await this.db.transaction(async (tx) => {
          // 1. Migrate project
          const ontoProject = await this.projectService.migrateProject(project);

          // 2. Migrate phases -> plans
          const ontoPlans = await this.phaseService.migratePhases(
            project.id,
            ontoProject.id
          );

          // 3. Migrate tasks
          const ontoTasks = await this.taskService.migrateTasks(
            project.id,
            ontoProject.id
          );

          // 4. Migrate calendar data
          await this.calendarService.migrateCalendarData(
            project.id,
            ontoProject.id
          );

          // 5. Update references in other tables
          await this.updateReferences(project.id, ontoProject.id);

          // 6. Record migration
          await this.recordMigration({
            entity_type: 'project',
            legacy_id: project.id,
            onto_id: ontoProject.id,
            status: 'completed'
          });
        });

        this.progress.completed++;
      } catch (error) {
        this.errors.push({
          entity_type: 'project',
          entity_id: project.id,
          error: error.message,
          stack: error.stack
        });
        this.progress.failed++;
      }
    }
  }
}
```

### 6.2 Migration Validation

```typescript
interface MigrationValidation {
  async validateMigration(inventory: Inventory): Promise<ValidationResult> {
    const checks = [];

    // 1. Count validation
    checks.push(await this.validateCounts(inventory));

    // 2. Data integrity
    checks.push(await this.validateDataIntegrity(inventory));

    // 3. Relationship validation
    checks.push(await this.validateRelationships(inventory));

    // 4. Calendar sync validation
    checks.push(await this.validateCalendarSync(inventory));

    // 5. FSM state validation
    checks.push(await this.validateFSMStates(inventory));

    return {
      passed: checks.every(c => c.passed),
      checks: checks,
      summary: this.generateValidationSummary(checks)
    };
  }

  private async validateDataIntegrity(inventory: Inventory): Promise<Check> {
    const issues = [];

    for (const project of inventory.projects) {
      const mapping = await this.db.legacy_entity_mappings.findFirst({
        where: {
          legacy_table: 'projects',
          legacy_id: project.id
        }
      });

      if (!mapping) {
        issues.push(`Missing mapping for project: ${project.id}`);
        continue;
      }

      const ontoProject = await this.db.onto_projects.findFirst({
        where: { id: mapping.onto_id }
      });

      if (!ontoProject) {
        issues.push(`Missing migration for project: ${project.id}`);
        continue;
      }

      // Verify critical fields
      if (ontoProject.name !== project.name) {
        issues.push(`Name mismatch for project: ${project.id}`);
      }

      // Verify task count
      const taskCount = await this.db.tasks.count({
        where: { project_id: project.id }
      });

      const ontoTaskCount = await this.db.onto_edges.count({
        where: {
          from_entity_id: ontoProject.id,
          from_entity_type: 'project',
          to_entity_type: 'task'
        }
      });

      if (taskCount !== ontoTaskCount) {
        issues.push(`Task count mismatch for project: ${project.id}`);
      }
    }

    return {
      name: 'Data Integrity',
      passed: issues.length === 0,
      issues: issues
    };
  }
}
```

### 6.3 Dual-write & Pause/Resume Controls

```typescript
class DualWriteManager {
  constructor(private readonly featureFlags: FlagClient) {}

  isEnabled(scope: 'project' | 'task' | 'calendar'): boolean {
    return this.featureFlags.isEnabled(`migration.dualwrite.${scope}`);
  }

  async withDualWrite<T>(
    scope: 'project' | 'task' | 'calendar',
    legacyOp: () => Promise<T>,
    ontologyOp: () => Promise<T>
  ): Promise<T> {
    const result = await legacyOp();
    if (this.isEnabled(scope)) {
      await ontologyOp();
    }
    return result;
  }
}
```

- Dual-write flags are flipped **after** a batch of entities has been migrated and validated, ensuring new writes remain consistent while we finish backfilling the backlog.
- The orchestrator persists `pause_reason` + `resume_token` so long-running migrations can be halted (e.g., spike in LLM cost, validation failure) and restarted without reprocessing completed rows.
- Drift detection jobs compare `legacy_entity_mappings` counts vs live table counts nightly; any discrepancy automatically disables the relevant dual-write flag and pages the migration team.

## Phase 7: Rollback Strategy

### 7.1 Rollback Mechanism

```typescript
class MigrationRollback {
  async rollbackMigration(fromDate: Date): Promise<void> {
    // Use legacy_entity_mappings (plus props as fallback) to locate ontology rows

    // Step 1: Delete onto_edges created after date
    await this.db.onto_edges.deleteMany({
      where: {
        created_at: { gte: fromDate }
      }
    });

    // Step 2: Delete onto_tasks
    await this.db.onto_tasks.deleteMany({
      where: {
        'metadata->migrated_at': { gte: fromDate.toISOString() }
      }
    });

    // Step 3: Delete onto_plans
    await this.db.onto_plans.deleteMany({
      where: {
        'metadata->migrated_at': { gte: fromDate.toISOString() }
      }
    });

    // Step 4: Delete onto_projects
    await this.db.onto_projects.deleteMany({
      where: {
        'metadata->migrated_at': { gte: fromDate.toISOString() }
      }
    });

    // Step 5: Revert calendar references
    await this.db.project_calendars.updateMany({
      where: {
        onto_project_id: { not: null }
      },
      data: {
        onto_project_id: null
      }
    });

    // Step 6: Clean up migration records
    await this.db.migration_log.deleteMany({
      where: {
        created_at: { gte: fromDate }
      }
    });
  }
}
```

## Quality Gates & Observability

- **Inventory baselines**: the orchestrator snapshots row counts + checksums per table before each run; validation jobs compare those baselines to `legacy_entity_mappings` and ontology counts after every batch.
- **Template + facet readiness**: migrations fail fast if a batch references a template still in the human-review queue or if required facets are missing—preventing partially typed projects.
- **LLM telemetry**: every prompt/response (including costs, latency, confidence) is logged to `migration_llm_audit` so we can replay or fine-tune without touching production data.
- **Calendar integrity dashboards**: Grafana panels compare Google Calendar webhooks vs `onto_event_sync` writes to ensure no missing events during dual-write.
- **Alerting**: anomaly detectors fire if diff jobs find >0.1% variance, if dual-write queues back up, or if rollback scripts touch more than N rows (guarding against runaway automation).

## Implementation Checklist

### Infrastructure
- [ ] Create migration orchestrator service
- [ ] Set up LLM classification pipeline with structured outputs
- [ ] Create template discovery and generation service
- [ ] Implement batch processing with transactions
- [ ] Set up progress tracking and monitoring
- [ ] Create validation framework

### Database Migrations
- [x] Create `legacy_entity_mappings` table + supporting indexes _(20251121\_ontology\_calendar\_foundation.sql / 20251122\_legacy\_mapping\_backfill.sql)_
- [x] Add `onto_project_id` to project_calendars _(same migration as above)_
- [ ] Create migration_log table for tracking
- [ ] Add selective indexes for `props->>'legacy_*'` fields used during reconciliation
- [x] Create onto_events + onto_event_sync tables (from calendar research)

### LLM Prompts
- [ ] Project classification prompt with examples
- [ ] Template generation prompt with constraints
- [ ] Facet extraction prompt with guidelines
- [ ] Task classification prompt with patterns
- [ ] Validation prompt for quality checks

### Services
- [ ] ProjectMigrationService
- [ ] PhaseMigrationService
- [ ] TaskMigrationService
- [ ] CalendarMigrationService
- [ ] TemplateMigrationService
- [ ] ValidationService
- [ ] RollbackService

### API Endpoints
- [ ] POST /api/admin/migration/analyze - Dry run analysis
- [ ] POST /api/admin/migration/start - Begin migration
- [ ] GET /api/admin/migration/status - Check progress
- [ ] POST /api/admin/migration/validate - Run validation
- [ ] POST /api/admin/migration/rollback - Rollback changes

### UI Components
- [ ] Migration dashboard showing progress
- [ ] Template review interface
- [ ] Validation results viewer
- [ ] Rollback confirmation dialog
- [ ] Migration report viewer

### Testing
- [ ] Unit tests for each service
- [ ] Integration tests for full migration flow
- [ ] LLM prompt testing with sample data
- [ ] Validation test suite
- [ ] Rollback testing
- [ ] Performance testing with large datasets

## Risk Mitigation

### Risk 1: LLM Classification Errors
**Mitigation**:
- Confidence thresholds (>80% for auto-match)
- Human review queue for new templates
- Validation step before committing
- Ability to manually override classifications

### Risk 2: Data Loss
**Mitigation**:
- Full backup before migration
- Legacy_id preserved in all records
- Transactional batch processing
- Comprehensive validation checks
- Rollback capability

### Risk 3: Performance Impact
**Mitigation**:
- Batch processing with configurable size
- Off-peak scheduling option
- Progress monitoring
- Ability to pause/resume
- Indexed `legacy_entity_mappings` for fast lookups

### Risk 4: Template Explosion
**Mitigation**:
- Template similarity checking
- Inheritance from base templates
- Human review for new templates
- Periodic template consolidation
- Template usage analytics

## Success Metrics

1. **Migration Completeness**: 100% of active projects migrated
2. **Data Integrity**: Zero data loss, all fields mapped
3. **Relationship Preservation**: All task-project-phase relationships maintained
4. **Calendar Continuity**: Calendar sync continues working
5. **Template Efficiency**: <20 unique project templates created
6. **Classification Accuracy**: >90% correct template matching
7. **Performance**: Migration completes in <4 hours for 1000 projects

## Recommendations

1. **Start with pilot migration** - Select 10 diverse projects for initial test
2. **Build template library first** - Manually create common templates before automation
3. **Implement in phases** - Projects first, then tasks, then calendar
4. **Monitor LLM costs** - Batch API calls and cache classifications
5. **Create migration reports** - Document every decision for audit trail
6. **Plan dual-write period** - Write to both systems during transition
7. **Train support team** - Prepare for user questions about changes

---

## Current Status (2025-11-23 Snapshot)
- ✅ Data model foundation shipped: `legacy_entity_mappings`, `onto_events`, `onto_event_sync`, and the calendar backfill migration are live in staging.
- ✅ Dual-write in `CalendarService.scheduleTask` persists both legacy and ontology rows; `/api/projects/[id]/onto-events` + project store wiring fetch ontology events for the UI.
- 🚧 UI still renders legacy `task_calendar_events`; ontology events are preloaded but unused until feature flag rollout.
- 🚧 Monitoring/flag plumbing not yet implemented (needs parity dashboards + `calendar.ontology.read.enable` flag).
- ⏳ Migration orchestrator/admin APIs remain on the TODO list (current work focused on calendar slice).

### Immediate Next Steps
1. **UI consumption**: Update project calendar/task components to read `ontologyEvents` (feature-flagged) so we can verify parity visually.
2. **Observability**: Stand up the parity counts + Grafana panels described in the runbook before enabling the feature flag for internal orgs.
3. **Admin controls**: Add the planned `/api/admin/migration/*` endpoints plus migrations dashboard to monitor progress and trigger rollbacks.
4. **Legacy shutdown prep**: Once UI reads are switched, schedule the `task_calendar_events` write-disable and removal in a follow-up release.

### Outstanding UI/Service Adoption (tracking)
- **Project page** (`apps/web/src/routes/projects/[id]/+page.svelte` & child components): still renders task chips based solely on `task.task_calendar_events`. Needs helper that merges legacy + ontology events (guarded by `calendar.ontology.read.enable`).
- **Task detail page** (`projects/[id]/tasks/[taskId]` route): calendar status chips + “Add to calendar” confirmations reference legacy events; ensure they check `store.ontologyEvents`.
- **Dashboard APIs/UI** (`apps/web/src/routes/api/dashboard/+server.ts`, `dashboard.store.ts`): stats rely on legacy joins; replicate the project-store pattern so scheduled counts use ontology data.
- **Calendar retry endpoints** (`/api/calendar/*` and `/api/tasks/[id]/recurrence`): still query `task_calendar_events`. Add ontology-aware fallbacks or annotate as “legacy only” if scheduled for removal.
- **Profile calendar tab** (`profile/calendar` route): show combined feed or switch to new API once feature flag is on.
- **Project stats endpoint** (`/api/projects/[id]/stats`): uses `task_calendar_events` for “scheduled” counts; align with store logic to avoid mismatched numbers during rollout.

## Calendar Cutover Runbook (Draft - 2025‑11‑23)

**Prereqs (already shipped):**
- `legacy_entity_mappings` table + trigger/backfill keep ontology↔legacy lookups current.
- `onto_events` + `onto_event_sync` populated via `20251123_backfill_task_calendar_events.sql`.
- Dual-write path is live in `CalendarService.scheduleTask`, so all new events hit both systems.
- Read API for ontology events exists at `/api/projects/[id]/onto-events`; project store preloads data.

**Step 0 – Feature Flags**
1. Add a `calendar.ontology.read.enable` flag (per-org/user) in the feature flag service.
2. Default OFF in production; enable for internal org once monitoring (below) is green.

**Step 1 – Monitoring / Parity**
1. Metrics:
   - Nightly job compares counts of `task_calendar_events` vs `onto_events` (filtered by `props.legacy_task_id`) using `legacy_entity_mappings`.
   - Grafana panel charts Google webhook volume vs `onto_event_sync` inserts.
   - Alert if differential >0.1% for two consecutive runs.
2. Logs:
   - `calendar-service` dual-write warnings emit `dualwrite.onto_events.error` metric (rate-limited). Pager fires if >5/min.

**Step 2 – UI Read Switch**
1. Gate new Project page reads with the feature flag:
   - If ON, use `store.ontologyEvents` in addition to `task_calendar_events`.
   - Render visual chips using ontology events first; fall back to legacy while flag off.
2. Work items:
   - [ ] Replace `task.task_calendar_events` usage in project/task components with a helper that merges (legacy + ontology) or uses ontology-only when flag ON.
   - [ ] Update calendar tab to consume `/onto-events` payload (handles sync metadata, recurrence, organizer).

**Step 3 – Partial Disable of Legacy Writes**
1. Once UI + API are reading ontology events by default (flag ON for ≥1 week):
   - Stop creating new `task_calendar_events` records (set `calendar.legacy.write.enable` per user).
   - Keep delete/update flows dual-writing for at least another release so Google sync remains stable.

**Step 4 – Legacy Shutdown**
1. Snapshot tables before removal (export `task_calendar_events`, `project_calendars`).
2. Drop dependent indexes/triggers, then the table itself (after >2 weeks with zero reads).
3. Remove code paths referencing `task_calendar_events` (search for string in repo).

**Rollbacks**
- To revert, clear the feature flag (UI reads switch back instantly) and run `MigrationRollback.rollbackMigration(fromDate)` which deletes inserted `onto_events`/edges and resets `project_calendars.onto_project_id`.
- Keep `task_calendar_events` writes available until Step 4 to ensure rollback remains possible.

**Docs/Owner**
- Keep this section updated as engineering work completes.
- Owner: Ontology Platform Team (Slack #ontology-platform / Notion doc link TBD).

This framework provides a comprehensive, LLM-driven approach to migrating from the traditional system to the ontology system while preserving all data, relationships, and functionality. The use of AI for classification and template generation ensures accurate categorization while maintaining flexibility for unique project types.

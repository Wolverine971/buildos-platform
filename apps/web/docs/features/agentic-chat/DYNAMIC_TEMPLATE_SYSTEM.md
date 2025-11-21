# Dynamic Template System for Agentic Chat

## Overview

The Dynamic Template System enables the AI agent to intelligently suggest and create custom templates during project creation, making the system more flexible and adaptive to user needs.

## Key Features

### 1. Intelligent Template Matching
- Semantic understanding of user requirements
- Scoring system based on domain alignment, workflow compatibility, and feature coverage
- Automatic suggestion when no existing template scores >70% match

### 2. Dynamic Template Creation
- AI can suggest completely new template types based on user intent
- Templates are automatically created when projects are instantiated
- Support for template inheritance and specialization

### 3. Visual Feedback
- Template suggestion cards in chat interface
- Match score visualization
- Clear indication of new vs existing templates

## Architecture

### Core Components

#### 1. Template Suggestion Tool (`suggest_template`)
Location: `/src/lib/services/agentic-chat/tools/core/tool-definitions.ts`

```typescript
interface SuggestTemplateArgs {
  type_key: string;          // e.g., "project.research.ai_climate"
  name: string;              // Human-readable name
  description: string;       // Clear description
  parent_type_key?: string;  // Optional inheritance
  match_score: number;       // How well existing templates match (0-100)
  rationale: string;         // Why this template is needed
  properties: Record<string, PropertyDef>;  // Template properties
  workflow_states: WorkflowState[];         // FSM states
  example_props?: Record<string, unknown>;  // Example values
  benefits?: string[];       // Key benefits
}
```

#### 2. Enhanced Template Generator
Location: `/src/lib/services/agentic-chat/tools/core/template-generator-enhanced.ts`

Handles:
- Dynamic template creation from AI suggestions
- Schema generation from properties
- FSM specification from workflow states
- Intelligent default value generation

#### 3. Tool Executor Integration
Location: `/src/lib/services/agentic-chat/tools/core/tool-executor.ts`

Features:
- Stores template suggestions in session context
- Automatically applies suggestions when creating projects
- Merges suggested properties with user-provided values

## Usage Flow

### 1. User Requests Project Creation
```
User: "I want to create an AI research project on climate change"
```

### 2. AI Analyzes Intent
The AI performs deep intent analysis to understand:
- Domain (research, AI, climate)
- Required properties (datasets, models, indicators)
- Workflow patterns (research methodology)

### 3. Template Discovery & Matching
```typescript
// AI searches existing templates
list_onto_templates({ scope: 'project' })

// Scores each template
- project.research: 60% match (missing AI/climate specifics)
- project.software: 30% match (wrong domain)
```

### 4. Dynamic Template Suggestion
When no template scores >70%, AI calls `suggest_template`:

```typescript
suggest_template({
  type_key: "project.research.ai_climate",
  name: "AI Climate Research Project",
  description: "Research project combining AI methodologies with climate science",
  parent_type_key: "project.research",
  match_score: 60,
  rationale: "Existing templates don't capture AI methodology and climate-specific requirements",
  properties: {
    dataset_sources: { type: 'array', description: 'Climate data sources' },
    model_types: { type: 'array', description: 'AI/ML models used' },
    climate_indicators: { type: 'array', description: 'Climate metrics tracked' },
    publication_targets: { type: 'array', description: 'Target journals/conferences' }
  },
  workflow_states: [
    { state: 'proposal', transitions_to: ['literature_review'] },
    { state: 'literature_review', transitions_to: ['data_collection'] },
    { state: 'data_collection', transitions_to: ['modeling'] },
    { state: 'modeling', transitions_to: ['analysis'] },
    { state: 'analysis', transitions_to: ['publication'] },
    { state: 'publication' }
  ],
  benefits: [
    'Captures AI-specific research workflow',
    'Includes climate science properties',
    'Tracks publication pipeline'
  ]
})
```

### 5. Project Creation
AI creates project with suggested template:

```typescript
create_onto_project({
  project: {
    name: "Climate Change Impact Prediction Using Deep Learning",
    type_key: "project.research.ai_climate",  // Uses suggested template
    description: "Research project using neural networks to predict climate impacts",
    props: {
      dataset_sources: ["NOAA", "NASA Earth Observatory"],
      model_types: ["LSTM", "Transformer"],
      climate_indicators: ["temperature", "precipitation", "sea_level"],
      publication_targets: ["Nature Climate Change", "NeurIPS 2024"]
    }
  }
})
```

### 6. Automatic Template Creation
The system automatically:
1. Creates the template if it doesn't exist
2. Sets up schema from properties
3. Configures FSM from workflow states
4. Establishes inheritance from parent template

## Enhanced Prompts

### Project Creation Prompt
Location: `/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`

Key enhancements:
- Deep intent analysis instructions
- Semantic matching guidance
- Template suggestion workflow
- Example templates for common patterns

### Template Inference Prompt
Location: `/src/lib/services/agentic-chat/prompts/project-creation-enhanced.ts`

Provides:
- Pattern recognition guidelines
- Property generation patterns by domain
- FSM patterns by project type
- Quality checks for suggestions

## UI Components

### TemplateSuggestionCard
Location: `/src/lib/components/agent/TemplateSuggestionCard.svelte`

Features:
- Visual indication of new vs existing templates
- Match score display with color coding
- Properties and workflow visualization
- Benefits highlighting
- Optional action buttons

### ThinkingBlock Integration
Added `template_suggestion` activity type for visibility in thinking logs.

## Configuration

### Tool Configuration
Location: `/src/lib/services/agentic-chat/tools/core/tools.config.ts`

```typescript
project_create: [
  'list_onto_templates',
  'suggest_template',      // New tool
  'request_template_creation',
  'create_onto_project'
]
```

## Examples

### Example 1: Mobile App MVP
```
User: "I need a mobile app MVP project with user testing phases"

AI suggests: project.software.mobile_mvp
- Properties: target_platforms, user_testing_phases, mvp_features, feedback_loops
- Workflow: ideation → design → prototype → testing → iteration → launch
```

### Example 2: Wedding Planning
```
User: "Help me plan my wedding"

AI suggests: project.event.wedding
- Properties: venue_details, vendor_list, guest_management, budget_tracking, timeline
- Workflow: planning → booking → preparation → execution → followup
```

### Example 3: PhD Research
```
User: "Starting my PhD research on quantum computing"

AI suggests: project.research.academic.phd_quantum
- Properties: advisor, committee, research_questions, publications, conferences
- Workflow: proposal → coursework → research → thesis → defense → publication
```

## Benefits

1. **Flexibility**: System adapts to any project type without pre-configuration
2. **Intelligence**: AI understands implicit requirements and suggests appropriate properties
3. **Reusability**: Created templates become available for future similar projects
4. **Evolution**: Templates can inherit and specialize from existing ones
5. **User Experience**: Seamless creation without template selection friction

## Testing

### Unit Tests
- `template-generator-enhanced.test.ts`: Template creation logic
- `tool-executor-template.test.ts`: Tool executor integration
- `template-props-merger.service.test.ts`: Property merging

### Integration Testing
Test the full flow:
1. User request → AI analysis
2. Template suggestion → User confirmation
3. Project creation → Template instantiation
4. Verification of created entities

## Future Enhancements

1. **Template Library UI**: Browse and manage created templates
2. **Template Versioning**: Track template evolution over time
3. **Community Templates**: Share templates across users
4. **Template Analytics**: Track which templates are most successful
5. **Smart Defaults**: Learn optimal defaults from usage patterns

## Troubleshooting

### Template Not Created
- Check `ensureTemplateForScope` is called with correct parameters
- Verify template suggestion is stored in session context
- Ensure admin Supabase client has proper permissions

### Properties Not Merged
- Verify `resolveAndMergeTemplateProps` is called
- Check template has default_props defined
- Ensure property names match between template and instance

### Workflow States Missing
- Confirm FSM spec is generated from workflow_states
- Check state names are valid identifiers
- Verify transitions form a connected graph
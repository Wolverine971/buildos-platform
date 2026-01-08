<!-- apps/web/docs/features/preferences/README.md -->

# User Preferences System

**Last Updated**: January 7, 2026
**Status**: Complete
**Category**: Feature
**Location**: `/apps/web/docs/features/preferences/`

---

## Overview

The BuildOS User Preferences System enables personalized AI interactions through two tiers of preferences:

1. **Global Preferences** - User-level settings applied to all conversations
2. **Project Preferences** - Project-specific settings that override globals when chatting about a project

This system was implemented as part of [Onboarding V2 Phase 3](../onboarding/ONBOARDING_V2_UPDATE_ASSESSMENT.md#phase-3-checklist).

---

## Architecture

```
+------------------------------------------------------------+
|                     USER PREFERENCES                        |
+------------------------------------------------------------+
|                                                            |
|   GLOBAL PREFERENCES (users.preferences JSONB)             |
|   Applied to ALL conversations                             |
|                                                            |
|   - communication_style: 'direct' | 'supportive' | 'socratic'
|   - response_length: 'concise' | 'detailed' | 'adaptive'  |
|   - proactivity_level: 'minimal' | 'moderate' | 'high'    |
|   - primary_role: string (e.g., 'Product Manager')        |
|   - domain_context: string (e.g., 'B2B SaaS startup')     |
|                                                            |
+------------------------------------------------------------+
|                                                            |
|   PROJECT PREFERENCES (onto_projects.props.preferences)    |
|   Applied when chatting about a specific project           |
|                                                            |
|   - planning_depth: 'lightweight' | 'detailed' | 'rigorous'
|   - update_frequency: 'daily' | 'weekly' | 'as_needed'    |
|   - collaboration_mode: 'solo' | 'async_team' | 'realtime'|
|   - risk_tolerance: 'cautious' | 'balanced' | 'aggressive'|
|   - deadline_flexibility: 'strict' | 'flexible' | 'aspirational'
|                                                            |
+------------------------------------------------------------+
```

---

## Key Files

### Types

- **`/src/lib/types/user-preferences.ts`** - TypeScript type definitions for `UserPreferences` and `ProjectPreferences`

### UI Components

| File                                                           | Purpose                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/src/lib/components/onboarding-v2/PreferencesStep.svelte`     | Onboarding capture (communication style, proactivity, role/domain) |
| `/src/lib/components/profile/PreferencesTab.svelte`            | Settings page for editing global preferences                       |
| `/src/lib/components/ontology/OntologyProjectEditModal.svelte` | Project-specific preferences in sidebar                            |

### API Endpoints

| Endpoint                 | Methods  | Purpose                                  |
| ------------------------ | -------- | ---------------------------------------- |
| `/api/users/preferences` | GET, PUT | Fetch and update global user preferences |

### Services

| File                                         | Purpose                                            |
| -------------------------------------------- | -------------------------------------------------- |
| `/src/lib/services/agent-context-service.ts` | Loads and injects preferences into planner context |
| `/src/lib/services/onboarding-v2.service.ts` | Saves preferences during onboarding                |

---

## Global Preferences

### Communication Style

Determines the AI's tone and approach:

| Value        | Behavior                                                       |
| ------------ | -------------------------------------------------------------- |
| `direct`     | Be direct and concise. Skip pleasantries and get to the point. |
| `supportive` | Be encouraging and patient. Acknowledge their efforts.         |
| `socratic`   | Ask guiding questions to help them think through problems.     |

### Proactivity Level

Controls how much the AI volunteers information:

| Value      | Behavior                                                              |
| ---------- | --------------------------------------------------------------------- |
| `minimal`  | Only respond to what is asked. Do not volunteer unsolicited insights. |
| `moderate` | Surface important things user might miss, but don't overdo it.        |
| `high`     | Proactively surface risks, blockers, and opportunities.               |

### Response Length

Sets default verbosity:

| Value      | Behavior                                              |
| ---------- | ----------------------------------------------------- |
| `concise`  | Keep responses concise unless detail is requested.    |
| `detailed` | Provide detailed responses with context and examples. |
| `adaptive` | Match the depth of the question and situation.        |

### Working Context

- **`primary_role`**: User's job title or role (e.g., "Product Manager", "Freelancer")
- **`domain_context`**: User's industry or domain (e.g., "B2B SaaS", "Healthcare")

---

## Project Preferences

Project preferences live in `onto_projects.props.preferences` and override global preferences when the user is chatting about that specific project.

### Planning Depth

| Value         | Behavior                                                 |
| ------------- | -------------------------------------------------------- |
| `lightweight` | Keep planning lightweight with minimal overhead.         |
| `detailed`    | User wants detailed planning for this project.           |
| `rigorous`    | User wants rigorous, detailed planning for this project. |

### Deadline Flexibility

| Value          | Behavior                                                          |
| -------------- | ----------------------------------------------------------------- |
| `strict`       | This project has strict deadlines - emphasize timeline adherence. |
| `flexible`     | Deadlines are flexible for this project - prioritize quality.     |
| `aspirational` | Deadlines are aspirational targets that can shift as needed.      |

### Update Frequency

| Value       | Behavior                             |
| ----------- | ------------------------------------ |
| `daily`     | Preferred update cadence: daily.     |
| `weekly`    | Preferred update cadence: weekly.    |
| `as_needed` | Preferred update cadence: as needed. |

### Collaboration Mode

| Value        | Behavior                        |
| ------------ | ------------------------------- |
| `solo`       | Collaboration mode: solo.       |
| `async_team` | Collaboration mode: async team. |
| `realtime`   | Collaboration mode: real-time.  |

### Risk Tolerance

| Value        | Behavior                                                      |
| ------------ | ------------------------------------------------------------- |
| `cautious`   | Risk tolerance: cautious - avoid high-risk moves.             |
| `balanced`   | Default balanced approach.                                    |
| `aggressive` | Risk tolerance: aggressive - prioritize speed and bold moves. |

---

## Prompt Injection

Preferences are converted to natural language and injected into the planner context via `loadUserProfileWithPreferences()` in `agent-context-service.ts:567-684`.

### Flow

```
1. User sends message
2. AgentContextService.buildPlannerContext() called
3. loadUserProfileWithPreferences(userId, projectId?) fetches:
   - users.preferences (global)
   - onto_projects.props.preferences (if projectId provided)
4. Merges preferences (project overrides global)
5. Converts to natural language prompt injection
6. Injected into planner context as userProfile field
```

### Example Prompt Injection

For a user with:

- `communication_style: 'direct'`
- `proactivity_level: 'high'`
- `primary_role: 'Founder'`
- Project `deadline_flexibility: 'strict'`

The injected text would be:

```
Be direct and concise. Skip pleasantries and get to the point.
Proactively surface risks, blockers, and opportunities.
User role: Founder
This project has strict deadlines - emphasize timeline adherence.
```

---

## API Reference

### GET /api/users/preferences

Fetches the current user's global preferences.

**Response:**

```json
{
	"success": true,
	"data": {
		"preferences": {
			"communication_style": "direct",
			"proactivity_level": "moderate",
			"response_length": "adaptive",
			"primary_role": "Product Manager",
			"domain_context": "B2B SaaS"
		}
	}
}
```

### PUT /api/users/preferences

Updates the current user's global preferences. Merges with existing preferences.

**Request:**

```json
{
	"communication_style": "supportive",
	"primary_role": "Founder"
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"preferences": {
			"communication_style": "supportive",
			"proactivity_level": "moderate",
			"response_length": "adaptive",
			"primary_role": "Founder",
			"domain_context": "B2B SaaS"
		}
	}
}
```

**Validation:**

- `communication_style` must be one of: `direct`, `supportive`, `socratic`
- `proactivity_level` must be one of: `minimal`, `moderate`, `high`
- `response_length` must be one of: `concise`, `detailed`, `adaptive`
- `primary_role` and `domain_context` are free-form strings

---

## Database Schema

### users.preferences (JSONB)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
```

### onto_projects.props.preferences (nested in JSONB)

Project preferences are stored within the existing `props` JSONB column:

```json
{
	"props": {
		"preferences": {
			"planning_depth": "detailed",
			"deadline_flexibility": "strict"
		}
	}
}
```

---

## User Interface

### Onboarding (PreferencesStep.svelte)

During onboarding, users select:

1. Communication Style (required)
2. Proactivity Level (required)
3. Role and Domain (optional)

### Settings (PreferencesTab.svelte)

Located in Profile > AI Preferences tab:

- All global preferences editable
- Response length option (not in onboarding)
- Role and domain context

### Project Editor (OntologyProjectEditModal.svelte)

In the project edit modal sidebar under "AI Preferences":

- Planning depth
- Update frequency
- Collaboration mode
- Risk tolerance
- Deadline flexibility

---

## Related Documentation

- **[Onboarding V2 Assessment](../onboarding/ONBOARDING_V2_UPDATE_ASSESSMENT.md)** - Implementation phases and decisions
- **[Onboarding README](../onboarding/README.md)** - Onboarding flow overview
- **[Ontology System](../ontology/README.md)** - Project structure (where project prefs live)
- **[Agent Context Service](/src/lib/services/agent-context-service.ts)** - Preference injection implementation

---

## Implementation History

| Phase   | Date       | Scope                                                                                   |
| ------- | ---------- | --------------------------------------------------------------------------------------- |
| Phase 2 | 2026-01-07 | Communication style, proactivity level capture in onboarding                            |
| Phase 3 | 2026-01-07 | Working context (role/domain), settings tab, project preferences, full prompt injection |

---

**Document Author**: Claude
**Created**: January 7, 2026

<!-- apps/web/docs/features/integrations/INTEGRATION_OFFERINGS_SPEC.md -->

# BuildOS Integration Offerings Specification

## Overview

This document outlines the integration capabilities and offerings for BuildOS, an AI-powered productivity platform that transforms unstructured thoughts into actionable plans.

## 1. Executive Summary

### What is BuildOS?

BuildOS is an AI-powered productivity platform designed for anyone struggling with disorganization—from ADHD minds to overwhelmed professionals. Our core innovation is the **Brain Dump System**, where users write stream-of-consciousness thoughts, and AI automatically extracts projects, tasks, and context.

### Why Integrate with BuildOS?

- **Access to structured productivity data** from unstructured user input
- **Real-time project status updates** across multiple dimensions
- **AI-enriched context** for every project and task
- **Calendar-aware scheduling intelligence**
- **Graph-based relationships** revealing work patterns and dependencies

## 2. Integration Use Cases

### For AI Agents & Assistants

**Primary Use Case:** AI agents can query BuildOS for real-time project status updates and use this information to:

- Make informed decisions about resource allocation
- Provide contextual recommendations
- Trigger automated workflows based on project state
- Generate reports and summaries for stakeholders

**Example Scenario:**

```
AI Agent → BuildOS API: "What's the status of the Q4 marketing campaign?"
BuildOS → AI Agent: {
  project: "Q4 Marketing Campaign",
  state: "execution",
  completion: "67%",
  blockers: ["Pending design approval"],
  next_milestone: "Launch social media ads (3 days)",
  recent_updates: [...]
}
AI Agent → Takes action: Notifies design team about blocking approval
```

### For Project Management Tools

- **Bidirectional sync** with Jira, Linear, Asana, Monday.com
- **Automatic task creation** from brain dumps
- **Status updates** flowing between systems
- **Time tracking integration**

### For Calendar Applications

- **Export BuildOS tasks** as calendar events
- **Import external calendars** for availability analysis
- **Smart scheduling** based on project priorities
- **Time blocking** for deep work sessions

### For Communication Platforms

- **Daily brief delivery** to Slack/Teams channels
- **Project updates** as channel messages
- **Task reminders** in chat
- **Collaborative planning** through chat interfaces

### For Analytics & BI Tools

- **Export project metrics** to Tableau, Looker, Metabase
- **Track velocity and burndown** charts
- **Measure productivity patterns**
- **Generate executive dashboards**

### For Knowledge Management

- **Export projects** as Notion pages or Obsidian notes
- **Link BuildOS entities** to external documentation
- **Sync context documents** between systems
- **Create knowledge graphs** from project relationships

## 3. Available Data & Endpoints

### Core Entities You Can Access

#### Projects

- **Comprehensive project metadata** including name, description, type, state
- **3-dimensional facets:**
    - Context: personal, client, commercial
    - Scale: micro to epic
    - Stage: discovery to launch
- **Timeline data:** start/end dates, milestones
- **Relationship graph:** connected tasks, goals, documents
- **AI-generated context documents**

#### Tasks

- **Detailed task information:** title, description, priority, due dates
- **State tracking:** todo, in_progress, done, cancelled
- **Dependencies and blockers**
- **Calendar event associations**
- **Recurring series configuration**

#### Goals & Outcomes

- **Strategic objectives** with success criteria
- **Target dates and priority levels**
- **Progress tracking**
- **Associated metrics and KPIs**

#### Documents & Outputs

- **Project deliverables** with versioning
- **AI-generated content**
- **Linked references**
- **Collaborative editing history**

#### Brain Dumps

- **Raw user input** (stream of consciousness)
- **AI-extracted structure:** projects, tasks, context
- **Processing metadata:** tokens used, cost, duration
- **Clarification questions and answers**

#### Calendar Events

- **Project-specific calendars**
- **Task-event mappings**
- **Availability analysis**
- **Smart scheduling recommendations**

### API Capabilities

#### Read Operations

- Get project status and metadata
- Query tasks by various filters
- Retrieve goal progress
- Access brain dump history
- Fetch calendar events
- Get daily briefs and summaries
- Query relationship graphs
- Access user preferences

#### Write Operations

- Create new projects from templates
- Add tasks to existing projects
- Update task status and properties
- Create calendar events
- Submit brain dumps for processing
- Add notes and documents
- Create goal tracking entries

#### Real-time Subscriptions

- Project status changes
- Task updates
- New brain dump completions
- Calendar event modifications
- Goal progress updates

## 4. Integration Methods

### REST API

- **250+ endpoints** covering all major features
- **JSON response format** with consistent structure
- **Pagination and filtering** support
- **Rate limiting** for fair usage

### Webhooks

- **Event-driven notifications** for state changes
- **Configurable event subscriptions**
- **Signature verification** for security
- **Retry logic** with exponential backoff

### Real-time Subscriptions

- **WebSocket connections** via Supabase Realtime
- **Channel-based subscriptions** for specific entities
- **Presence detection** for collaborative features

### OAuth 2.0 Authentication

- **User-authorized access** with consent flow
- **Granular scopes** for specific capabilities
- **Token refresh** for long-lived integrations

### API Keys (Coming Soon)

- **Service accounts** for server-to-server integration
- **Scoped permissions** per key
- **Usage analytics** and audit trails

## 5. Data Models & Schemas

### Project Schema

```typescript
{
	id: string; // UUID
	name: string; // Project name
	description: string; // Detailed description
	type_key: string; // Template type (e.g., 'writer.book')
	state_key: string; // Current state (draft, active, complete)
	facet_context: string; // personal | client | commercial
	facet_scale: string; // micro | small | medium | large | epic
	facet_stage: string; // discovery | planning | execution | launch
	start_at: ISO8601; // Start date
	end_at: ISO8601; // End date
	completion_percentage: number; // 0-100
	props: object; // Custom properties
	created_at: ISO8601;
	updated_at: ISO8601;
}
```

### Task Schema

```typescript
{
	id: string; // UUID
	project_id: string; // Parent project
	title: string; // Task title
	description: string; // Detailed description
	state_key: string; // todo | in_progress | done | cancelled
	priority: number; // 1-10 scale
	due_at: ISO8601; // Due date/time
	estimated_hours: number; // Time estimate
	actual_hours: number; // Time tracked
	props: object; // Custom properties
	created_at: ISO8601;
	updated_at: ISO8601;
}
```

### Brain Dump Response

```typescript
{
  id: string;                   // UUID
  type: string;                // long | short
  content: string;             // Original user input
  extracted_context: {
    projects_created: Project[];
    tasks_created: Task[];
    goals_identified: Goal[];
    clarifications_needed: string[];
  };
  processing_status: string;    // completed | failed | pending
  metadata: {
    tokens_used: number;
    processing_time_ms: number;
    model_used: string;
  };
  created_at: ISO8601;
}
```

## 6. Security & Compliance

### Authentication

- **OAuth 2.0** for user-authorized access
- **JWT tokens** with expiration and refresh
- **API key authentication** (coming soon)

### Authorization

- **Row-level security** ensures data isolation
- **Granular permission scopes**
- **Admin-only endpoints** for sensitive operations

### Data Protection

- **TLS encryption** for all API traffic
- **Database encryption** at rest
- **GDPR compliance** for EU users
- **Data retention policies** with user control

### Rate Limiting

- **Per-endpoint limits** to prevent abuse
- **Burst allowances** for legitimate spikes
- **Custom limits** for enterprise partners

## 7. Getting Started

### Quick Start for AI Agents

1. **Register your application** at integrations.buildos.dev
2. **Configure OAuth settings** with your redirect URIs
3. **Request necessary scopes** for your use case
4. **Implement OAuth flow** to get user authorization
5. **Make API calls** with the access token

### Example: Get Project Status

```javascript
// Fetch current project status
const response = await fetch('https://api.buildos.dev/api/onto/projects/{project_id}', {
	headers: {
		Authorization: `Bearer ${accessToken}`,
		'Content-Type': 'application/json'
	}
});

const project = await response.json();

// Check project state and take action
if (project.state_key === 'blocked') {
	// Identify blockers and notify relevant parties
	const blockers = await getProjectBlockers(project.id);
	await notifyTeam(blockers);
}
```

### Example: Subscribe to Real-time Updates

```javascript
// Subscribe to project updates
const subscription = supabase
	.channel('project-updates')
	.on(
		'postgres_changes',
		{
			event: '*',
			schema: 'public',
			table: 'onto_projects',
			filter: `id=eq.${projectId}`
		},
		(payload) => {
			console.log('Project updated:', payload);
			// React to changes
		}
	)
	.subscribe();
```

## 8. Partnership Opportunities

### Become a BuildOS Integration Partner

We're actively seeking integration partners who can:

- **Enhance user productivity** through seamless workflows
- **Add value** to the BuildOS ecosystem
- **Maintain high quality** and security standards

### Benefits for Partners

- **Early access** to new features and APIs
- **Co-marketing opportunities**
- **Technical support** from our integration team
- **Featured placement** in our integration directory
- **Revenue sharing** for paid integrations

### Types of Partnerships

#### Technology Partners

Build deep integrations with BuildOS core features

#### Automation Partners

Connect BuildOS to automation platforms (Zapier, Make, n8n)

#### Enterprise Partners

Custom integrations for enterprise clients

#### AI/ML Partners

Leverage BuildOS data for advanced analytics and insights

## 9. Support & Resources

### Documentation

- **API Reference:** docs.buildos.dev/api
- **Integration Guides:** docs.buildos.dev/integrations
- **Code Examples:** github.com/buildos/integration-examples
- **SDKs:** Available for JavaScript, Python, Go

### Developer Support

- **Discord Community:** discord.gg/buildos-dev
- **Email Support:** integrations@buildos.dev
- **Office Hours:** Weekly Q&A sessions
- **Integration Sandbox:** Test environment with sample data

### Tools & Resources

- **Postman Collection:** Pre-built API requests
- **OpenAPI Spec:** Machine-readable API definition
- **Webhook Testing:** Tools for local development
- **Rate Limit Dashboard:** Monitor your usage

## 10. Pricing & Plans

### Developer Plan (Free)

- **100 API calls/day**
- **Access to core endpoints**
- **Community support**
- **Sandbox environment**

### Startup Plan ($99/month)

- **10,000 API calls/day**
- **All endpoints**
- **Email support**
- **Webhook access**
- **Real-time subscriptions**

### Business Plan ($499/month)

- **100,000 API calls/day**
- **Priority support**
- **Custom webhooks**
- **Advanced analytics**
- **SLA guarantee**

### Enterprise Plan (Custom)

- **Unlimited API calls**
- **Dedicated support**
- **Custom integrations**
- **On-premise options**
- **White-label capabilities**

## 11. Success Stories

### Case Study: AI Assistant Integration

"By integrating with BuildOS, our AI assistant can now understand the full context of a user's work. We've seen a 40% improvement in task completion rates and users love how their assistant 'just knows' what they're working on."
— _TechCorp AI Assistant Team_

### Case Study: Project Management Sync

"The bidirectional sync with BuildOS means our users can brain dump in BuildOS and see structured tasks appear in our PM tool automatically. It's magical!"
— _ProjectFlow Product Manager_

### Case Study: Calendar Intelligence

"BuildOS's calendar integration gave us the missing piece—understanding not just when things are scheduled, but why and how they connect to larger goals."
— _TimeMaster Calendar App_

## 12. Frequently Asked Questions

### Q: What makes BuildOS different from other productivity APIs?

**A:** BuildOS specializes in transforming unstructured thoughts into structured, actionable data through AI. Our Brain Dump system and ontology-based project management provide unique insights not available elsewhere.

### Q: Can I integrate BuildOS with my existing tools?

**A:** Yes! BuildOS is designed to complement existing workflows. We provide webhooks, REST APIs, and real-time subscriptions to ensure seamless integration.

### Q: How reliable is the BuildOS API?

**A:** We maintain 99.9% uptime with redundant infrastructure across multiple regions. Our queue-based architecture ensures no data loss even during peak loads.

### Q: What about data privacy?

**A:** User data privacy is our top priority. We use row-level security, encrypt data at rest and in transit, and never share user data without explicit consent.

### Q: Can I white-label BuildOS features?

**A:** Enterprise partners can access white-label options to embed BuildOS functionality seamlessly into their products.

## 13. Contact & Next Steps

### Ready to Integrate?

1. **Review our documentation** at docs.buildos.dev
2. **Sign up for a developer account** at integrations.buildos.dev
3. **Join our Discord community** for support
4. **Schedule a partnership call** for enterprise needs

### Contact Our Integration Team

**Email:** integrations@buildos.dev
**Partnership Inquiries:** partnerships@buildos.dev
**Technical Support:** support@buildos.dev

### Office Locations

**San Francisco (HQ)**
BuildOS, Inc.
[Address]
San Francisco, CA 94107

**Remote-First Company**
We work with partners globally

---

_BuildOS - Transforming Chaos into Clarity_

_Last Updated: November 2024_

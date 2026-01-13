<!-- apps/web/src/lib/tests/test-onto-multi-entity-comprehensive.md -->

# Ontology Multi-Entity Comprehensive Test

**Test Suite**: Testing all ontology entity types in complex scenarios
**Purpose**: Validate complete ontology system with all onto\_ tables
**Scope**: All entity types, relationships, and edge cases

## Test Prompt 1: Complete Product Launch - All Entities

**Scenario**: Comprehensive product launch project using ALL ontology entity types

**Context Type**: `project_create`

### User Input:

"I'm launching a new productivity app called 'FocusFlow'. It's a commercial SaaS product targeting remote teams. Budget $50k, 6-month timeline, need to track ROI. Must comply with SOC2. Key assets: MVP plan, marketing plan, documentation. Team of 5 people. Main risks: market competition, technical complexity. We'll use React/Node stack. Track user acquisition metrics. Research competitors first. Pricing review at month 3."

### Expected Agent Behavior:

This single request should create entities across ALL onto\_ tables:

```
create_onto_project({
  project: {
    name: "FocusFlow - Productivity SaaS Launch",
    type_key: "developer.saas",
    description: "Commercial SaaS productivity app for remote teams",
    props: {
      facets: {
        context: "commercial",
        scale: "large",
        stage: "planning"
      },
      budget: {
        total: 50000,
        currency: "USD"
      },
      tech_stack: {
        frontend: "React",
        backend: "Node.js"
      },
      team_size: 5
    },
    start_at: "[current_date]",
    end_at: "[current_date + 6 months]"
  },

  // === GOALS (onto_goals) ===
  goals: [
    {
      name: "Launch MVP to market",
      type_key: "goal.outcome",
      props: {
        target_date: "[current_date + 6 months]",
        measurement: "product_launched"
      }
    },
    {
      name: "Acquire 1000 beta users",
      type_key: "goal.metric",
      props: {
        target: 1000,
        unit: "users",
        timeline: "6 months"
      }
    },
    {
      name: "Achieve positive ROI by month 6",
      type_key: "goal.financial",
      props: {
        target: "positive_roi",
        measurement: "revenue_vs_cost"
      }
    }
  ],

  // === PLANS (onto_plans) ===
  plans: [
    {
      name: "Product Development",
      type_key: "plan.development.product",
      state_key: "active",
      props: {
        duration_months: 6,
        focus: "mvp_features"
      }
    },
    {
      name: "Marketing & Launch",
      type_key: "plan.marketing.launch",
      state_key: "draft",
      props: {
        start_month: 4
      }
    },
    {
      name: "Competitor Research",
      type_key: "plan.research.market",
      state_key: "active"
    }
  ],

  // === TASKS (onto_tasks) ===
  tasks: [
    {
      title: "Conduct competitor analysis",
      plan_name: "Competitor Research",
      priority: 5,
      state_key: "in_progress",
      due_at: "[current_date + 2 weeks]",
      props: {
        type: "research",
        estimated_hours: 20
      }
    },
    {
      title: "Design core app architecture",
      plan_name: "Product Development",
      priority: 5,
      state_key: "todo",
      props: {
        type: "technical",
        estimated_hours: 16
      }
    },
    {
      title: "Build MVP feature set",
      plan_name: "Product Development",
      priority: 5,
      state_key: "todo",
      props: {
        type: "development",
        estimated_hours: 400
      }
    }
  ],

  // === DOCUMENTS (onto_documents) ===
  documents: [
    {
      title: "Product Requirements Document (PRD)",
      type_key: "document.product.requirements",
      state_key: "active",
      props: {
        owner: "product_manager"
      }
    },
    {
      title: "Technical Architecture Specification",
      type_key: "document.technical.architecture",
      state_key: "draft"
    },
    {
      title: "Marketing Strategy Document",
      type_key: "document.marketing.strategy",
      state_key: "draft"
    }
  ],

  // === REQUIREMENTS (onto_requirements) ===
  requirements: [
    {
      text: "Must achieve SOC2 compliance before launch",
      type_key: "requirement.compliance",
      props: {
        standard: "SOC2",
        mandatory: true,
        deadline: "[current_date + 5 months]"
      }
    },
    {
      text: "Support 1000+ concurrent users with sub-second response",
      type_key: "requirement.performance",
      props: {
        metric: "concurrent_users",
        target: 1000,
        latency_target_ms: 1000
      }
    },
    {
      text: "Total budget not to exceed $50,000",
      type_key: "requirement.budget",
      props: {
        amount: 50000,
        currency: "USD",
        hard_limit: true
      }
    }
  ],

  // === MILESTONES (onto_milestones) ===
  milestones: [
    {
      title: "Competitor Research Complete",
      due_at: "[current_date + 1 month]",
      type_key: "milestone.research"
    },
    {
      title: "MVP Feature Freeze",
      due_at: "[current_date + 4 months]",
      type_key: "milestone.development"
    },
    {
      title: "Beta Launch",
      due_at: "[current_date + 5 months]",
      type_key: "milestone.launch"
    },
    {
      title: "Public Launch",
      due_at: "[current_date + 6 months]",
      type_key: "milestone.launch"
    }
  ],

  // === RISKS (onto_risks) ===
  risks: [
    {
      title: "Market Competition - Established Players",
      impact: "high",
      probability: 0.7,
      state_key: "identified",
      props: {
        category: "market",
        mitigation: "Differentiate with unique collaboration features"
      }
    },
    {
      title: "Technical Complexity - Real-time Sync",
      impact: "medium",
      probability: 0.5,
      state_key: "identified",
      props: {
        category: "technical",
        mitigation: "Use proven WebSocket libraries, extensive testing"
      }
    },
    {
      title: "Budget Overrun Risk",
      impact: "high",
      probability: 0.4,
      state_key: "monitoring",
      props: {
        category: "financial",
        mitigation: "Bi-weekly budget reviews, prioritize features"
      }
    }
  ],

  // === METRICS (onto_metrics) ===
  metrics: [
    {
      name: "User Acquisition Rate",
      type_key: "metric.growth.acquisition",
      unit: "users_per_week",
      props: {
        target: 50,
        measurement_frequency: "weekly"
      }
    },
    {
      name: "Monthly Recurring Revenue (MRR)",
      type_key: "metric.financial.revenue",
      unit: "USD",
      props: {
        target: 5000,
        timeline: "month_6"
      }
    },
    {
      name: "Customer Acquisition Cost (CAC)",
      type_key: "metric.financial.cac",
      unit: "USD",
      props: {
        target: 20,
        calculation: "marketing_spend / new_users"
      }
    }
  ],

  // === SOURCES (onto_sources) ===
  sources: [
    {
      uri: "https://www.gartner.com/productivity-tools-report-2025",
      props: {
        type: "market_research",
        title: "Gartner Productivity Tools Report 2025",
        accessed_date: "[current_date]"
      }
    },
    {
      uri: "https://github.com/competitor-app/public-roadmap",
      props: {
        type: "competitor_analysis",
        title: "Competitor Public Roadmap"
      }
    }
  ]
})
```

### Expected Results - Complete Ontology Population:

**ALL onto\_ tables should have entries:**

1. ✅ **onto_projects**: 1 project
    - Complete with all facets, props, dates
    - Linked to context_document

2. ✅ **onto_goals**: 3 goals
    - Outcome goal (launch MVP)
    - Metric goal (user acquisition)
    - Financial goal (ROI)

3. ✅ **onto_plans**: 3 plans
    - Product development (active)
    - Marketing launch (draft)
    - Competitor research (active)

4. ✅ **onto_tasks**: 3 initial tasks
    - Each with priority, state, plan linkage
    - Props include type and estimated hours

5. ✅ **onto_documents**: 3 documents
    - PRD (product requirements)
    - Architecture spec (technical)
    - Marketing strategy (marketing)

6. ✅ **onto_requirements**: 3 requirements
    - Compliance (SOC2)
    - Performance (concurrent users)
    - Budget (financial limit)

7. ✅ **onto_milestones**: 4 milestones
    - Research complete (1 month)
    - Feature freeze (4 months)
    - Beta launch (5 months)
    - Public launch (6 months)

8. ✅ **onto_risks**: 3 risks
    - Market competition (high impact, 70% probability)
    - Technical complexity (medium impact, 50% probability)
    - Budget overrun (high impact, 40% probability)

9. ✅ **onto_metrics**: 3 metrics
    - User acquisition rate (growth)
    - MRR (financial)
    - CAC (financial)

10. ✅ **onto_sources**: 2 external sources
    - Gartner report
    - Competitor roadmap

11. ✅ **onto_edges**: ~30+ relationships
    - project → goals (has_goal × 3)
    - project → plans (has_plan × 3)
    - project → tasks (has_task × 3)
    - project → documents (has_document × 3)
    - project → requirements (has_requirement × 3)
    - project → milestones (has_milestone × 4)
    - project → risks (has_risk × 3)
    - project → metrics (has_metric × 3)
    - project → sources (has_source × 2)
    - tasks → plans (belongs_to_plan × 3)

12. ✅ **onto_actors**: User actor created
    - Linked to all created_by fields

13. ✅ **Context Document** (onto_documents):
    - document.project.context type
    - Full project narrative
    - Linked via onto_projects.context_document_id

**Tables NOT populated (as expected, will be added later):**

- onto_insights (derived later from signals)
- onto_signals (external events, added during project)
- onto_metric_points (time-series data, collected over time)
- onto_events (calendar integration, added as scheduled)
- onto_document_versions (versions created on updates)
- onto_assignments (role assignments, added when assigning team)
- onto_permissions (access control, set up after creation)

---

## Test Prompt 2: Adding Missing Entity Types During Project

**Scenario**: After project creation, add signals, insights, and assignments

**Context Type**: `project`
**Entity ID**: [focusflow_project_id]

### User Input:

"We just got customer feedback via email survey - 78% want mobile app. Also, competitor launched similar feature yesterday. Assign Sarah as lead developer and Mike as product manager. Based on the survey and competitor signal, I think we should prioritize mobile development."

### Expected Agent Behavior:

1. **Create Signals** (External Events):

    ```
    create_onto_signal({
      project_id: "[current_project_id]",
      channel: "customer_feedback",
      ts: "[current_date]",
      payload: {
        source: "email_survey",
        metric: "mobile_app_demand",
        value: 0.78,
        sample_size: 100,
        summary: "78% of surveyed users want mobile app"
      }
    })

    create_onto_signal({
      project_id: "[current_project_id]",
      channel: "competitor_intelligence",
      ts: "[current_date - 1 day]",
      payload: {
        competitor: "CompetitorX",
        event: "feature_launch",
        feature: "mobile_app",
        impact: "high"
      }
    })
    ```

2. **Create Insight** (Derived from Signals):

    ```
    create_onto_insight({
      project_id: "[current_project_id]",
      title: "Mobile Development Should Be Prioritized",
      props: {
        rationale: "Customer demand (78%) + competitor movement indicates mobile is critical path",
        confidence: "high",
        data_sources: ["customer_survey", "competitor_analysis"],
        recommended_action: "Add mobile development to roadmap",
        impact: "strategic"
      },
      derived_from_signal_ids: "[survey_signal_id, competitor_signal_id]"
    })
    ```

3. **Create Actors and Assignments**:

    ```
    // Actors created automatically or looked up
    // Then assignments:

    create_onto_assignment({
      actor_id: "[sarah_actor_id]",
      object_id: "[current_project_id]",
      object_kind: "project",
      role_key: "lead_developer"
    })

    create_onto_assignment({
      actor_id: "[mike_actor_id]",
      object_id: "[current_project_id]",
      object_kind: "project",
      role_key: "product_manager"
    })
    ```

4. **Create New Plan for Mobile**:

    ```
    create_onto_plan({
      project_id: "[current_project_id]",
      name: "Mobile App Development",
      type_key: "plan.development.mobile",
      state_key: "active",
      props: {
        platform: ["iOS", "Android"],
        priority: "high",
        reason: "Customer demand + competitive pressure"
      }
    })
    ```

### Expected Results:

- ✅ **onto_signals**: 2 new signals (customer feedback + competitor)
- ✅ **onto_insights**: 1 insight derived from signals
- ✅ **onto_actors**: 2 new actors (Sarah, Mike) or existing ones linked
- ✅ **onto_assignments**: 2 role assignments (lead dev, PM)
- ✅ **onto_plans**: 1 new mobile plan
- ✅ **onto_edges**: New signal→insight relationships
  **All Entity Types Now Populated:**

- ✅ onto_projects, onto_goals, onto_plans, onto_tasks ✓
- ✅ onto_documents, onto_requirements ✓
- ✅ onto_milestones, onto_risks, onto_metrics ✓
- ✅ onto_sources ✓
- ✅ onto_signals ✓ (NEW)
- ✅ onto_insights ✓ (NEW)
- ✅ onto_actors ✓ (NEW)
- ✅ onto_assignments ✓ (NEW)

---

## Test Prompt 3: Time-Series Metrics and Versioning

**Scenario**: Track metrics over time and create document versions

**Context Type**: `project`

### User Input:

"Week 1 metrics: acquired 47 users, MRR at $200, CAC at $25. Week 2: 52 users, MRR $350, CAC $22. Also, PRD document updated to v2 with mobile requirements."

### Expected Agent Behavior:

1. **Create Metric Points** (Time-Series Data):

    ```
    // Week 1 data points
    create_onto_metric_point({
      metric_id: "[user_acquisition_metric_id]",
      ts: "[week_1_date]",
      numeric_value: 47,
      props: {
        week: 1,
        period: "weekly"
      }
    })

    create_onto_metric_point({
      metric_id: "[mrr_metric_id]",
      ts: "[week_1_date]",
      numeric_value: 200,
      props: {
        week: 1,
        currency: "USD"
      }
    })

    create_onto_metric_point({
      metric_id: "[cac_metric_id]",
      ts: "[week_1_date]",
      numeric_value: 25,
      props: {
        week: 1,
        currency: "USD"
      }
    })

    // Week 2 data points (similar structure)
    // ... 3 more metric points for week 2
    ```

2. **Create Document Version**:

    ```
    create_onto_document_version({
      document_id: "[prd_document_id]",
      number: 2,
      props: {
        changes: "Added mobile app requirements section",
        change_summary: "Mobile platform requirements, user stories for iOS/Android",
        changed_by: "[current_user]"
      },
      storage_uri: "s3://docs/prd-v2.pdf"
    })
    ```

### Expected Results:

- ✅ **onto_metric_points**: 6 data points (3 metrics × 2 weeks)
- ✅ **onto_document_versions**: 1 new version (PRD v2)
- ✅ **Time-series data**: Trackable metric trends over time
- ✅ **Version history**: Document changes tracked

**Final Count - ALL Entity Types:**

- ✅ onto_metric_points ✓ (NEW)
- ✅ onto_document_versions ✓ (NEW)

---

## Test Prompt 4: Calendar Events and Permissions

**Scenario**: Add team meetings and set up access control

**Context Type**: `project`

### User Input:

"Schedule weekly standup every Monday 9am for the team. Also, Sarah needs full access to code, Mike needs edit access to docs, and investors get read-only access to the project."

### Expected Agent Behavior:

1. **Create Recurring Event**:

    ```
    create_onto_event({
      project_id: "[current_project_id]",
      owner_entity_type: "project",
      owner_entity_id: "[current_project_id]",
      title: "Weekly Team Standup",
      start_at: "[next_monday_9am]",
      end_at: "[next_monday_9_30am]",
      all_day: false,
      type_key: "event.meeting.standup",
      recurrence: {
        frequency: "weekly",
        interval: 1,
        by_day: ["MO"],
        until: "[current_date + 6 months]"
      },
      timezone: "America/New_York",
      props: {
        attendees: ["Sarah", "Mike", "Team"],
        meeting_type: "standup"
      }
    })
    ```

2. **Create Permissions**:

    ```
    // Sarah - full access to project resources
    create_onto_permission({
      actor_id: "[sarah_actor_id]",
      object_id: "[current_project_id]",
      object_kind: "project",
      access: "write",
      role_key: "lead_developer"
    })

    // Mike - edit access to docs
    create_onto_permission({
      actor_id: "[mike_actor_id]",
      object_id: "[documents_*]",  // All documents
      object_kind: "document",
      access: "write",
      role_key: "product_manager"
    })

    // Investors - read-only project access
    create_onto_permission({
      actor_id: "[investors_group_id]",
      object_id: "[current_project_id]",
      object_kind: "project",
      access: "read",
      role_key: "stakeholder"
    })
    ```

### Expected Results:

- ✅ **onto_events**: 1 recurring event (weekly standup)
- ✅ **onto_permissions**: 3+ permission records
- ✅ **Recurrence pattern**: RRULE format for weekly Monday meetings
- ✅ **Access control**: Different permission levels for different actors
- ✅ **Event timezone**: Timezone-aware scheduling

**Final Achievement: 100% Ontology Coverage**

Core onto\_ tables now have test coverage:

- ✅ Core entities: projects, tasks, plans, goals ✓
- ✅ Documentation: documents ✓
- ✅ Planning: requirements, milestones, risks ✓
- ✅ Tracking: metrics, metric_points ✓
- ✅ Knowledge: sources, signals, insights ✓
- ✅ Team: actors, assignments, permissions ✓
- ✅ Versioning: document_versions ✓
- ✅ Calendar: events ✓
- ✅ Graph: edges (relationships between all entities) ✓

---

## Summary

This comprehensive test validates:

1. ✅ **Complete Entity Coverage**: All onto\_ tables populated
2. ✅ **Complex Relationships**: 30+ edges between entities
3. ✅ **Time-Series Data**: Metric tracking over time
4. ✅ **Versioning**: Document version history
5. ✅ **Access Control**: Permission management
6. ✅ **Calendar Integration**: Event scheduling with recurrence
7. ✅ **Signal → Insight Pipeline**: Data-driven insights
8. ✅ **Team Management**: Actor assignments and roles
9. ✅ **Risk & Compliance**: Requirements and risks tracked
10. ✅ **Multi-Dimensional**: Facets, states, types, priorities all working

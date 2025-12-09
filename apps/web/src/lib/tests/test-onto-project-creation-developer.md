<!-- apps/web/src/lib/tests/test-onto-project-creation-developer.md -->

# Ontology Project Creation Tests - Developer/Software Engineer Persona

**Test Suite**: Ontology project creation with agentic chat
**Persona**: Software Developer / Engineer
**Context Type**: `project_create` → `project` (after creation)
**Primary Template**: `developer.app`, `developer.saas`, `developer.feature`

## Test Prompt 1: SaaS Application - Full Stack Project

**Scenario**: Developer starting a new SaaS application with technical requirements

**Context Type**: `project_create`

### User Input:

"I want to build a SaaS project management tool. It needs user authentication, project workspaces, real-time collaboration, and a REST API. Using React frontend, Node.js backend, PostgreSQL database. Target MVP in 3 months with 5 core features."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="developer",
      search="saas"
    )
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "SaaS Project Management Tool",
        type_key: "developer.saas",
        description: "Full-stack SaaS application for project management with real-time collaboration",
        props: {
          facets: {
            context: "commercial",
            scale: "large",
            stage: "planning"
          },
          tech_stack: {
            frontend: "React",
            backend: "Node.js",
            database: "PostgreSQL"
          }
        },
        start_at: "[current_date]",
        end_at: "[current_date + 3 months]"
      },
      goals: [
        {
          name: "Launch MVP with 5 core features",
          type_key: "goal.outcome",
          props: {
            target: 5,
            measurement: "features_completed",
            deadline: "[current_date + 3 months]"
          }
        },
        {
          name: "Achieve 100 beta users",
          type_key: "goal.metric",
          props: {
            target: 100,
            unit: "users"
          }
        }
      ],
      plans: [
        {
          name: "Authentication & User Management",
          type_key: "plan.development.feature",
          state_key: "active"
        },
        {
          name: "Core Features Development",
          type_key: "plan.development.sprint",
          state_key: "active"
        },
        {
          name: "API Development",
          type_key: "plan.development.backend",
          state_key: "active"
        },
        {
          name: "Testing & QA",
          type_key: "plan.development.testing",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Set up project repository and development environment",
          plan_name: "Core Features Development",
          priority: 5,
          state_key: "todo",
          props: {
            type: "setup",
            estimated_hours: 4
          }
        },
        {
          title: "Design and implement database schema",
          plan_name: "Core Features Development",
          priority: 5,
          state_key: "todo",
          props: {
            type: "backend",
            estimated_hours: 8
          }
        },
        {
          title: "Implement user authentication (JWT)",
          plan_name: "Authentication & User Management",
          priority: 5,
          state_key: "todo",
          props: {
            type: "backend",
            estimated_hours: 12
          }
        },
        {
          title: "Build project workspace UI",
          plan_name: "Core Features Development",
          priority: 4,
          state_key: "todo",
          props: {
            type: "frontend",
            estimated_hours: 16
          }
        },
        {
          title: "Implement real-time collaboration with WebSockets",
          plan_name: "Core Features Development",
          priority: 4,
          state_key: "todo",
          props: {
            type: "fullstack",
            estimated_hours: 20
          }
        }
      ],
      requirements: [
        {
          text: "All API endpoints must be RESTful and documented",
          type_key: "requirement.technical",
          props: {
            category: "api"
          }
        },
        {
          text: "Support 100+ concurrent users with sub-second response times",
          type_key: "requirement.performance",
          props: {
            metric: "concurrent_users",
            target: 100
          }
        },
        {
          text: "GDPR compliance for user data handling",
          type_key: "requirement.compliance",
          props: {
            standard: "GDPR"
          }
        }
      ],
      documents: [
        {
          title: "Technical Architecture Document",
          type_key: "document.technical.architecture",
          state_key: "draft",
          props: {
            sections: ["System Design", "Tech Stack", "Infrastructure"]
          }
        },
        {
          title: "API Documentation",
          type_key: "document.technical.api",
          state_key: "draft"
        }
      ],
      outputs: [
        {
          name: "MVP Release v1.0",
          type_key: "output.software.release",
          state_key: "planned",
          props: {
            version: "1.0.0",
            release_type: "mvp"
          }
        }
      ]
    })
    ```

### Expected Results:

**Onto Tables Created**:

- ✅ **onto_projects**: 1 project
    - name: "SaaS Project Management Tool"
    - type_key: "developer.saas"
    - facet_context: "commercial"
    - facet_scale: "large"
    - facet_stage: "planning"
    - props includes tech_stack

- ✅ **onto_goals**: 2 goals
    - "Launch MVP with 5 core features" (outcome goal)
    - "Achieve 100 beta users" (metric goal)

- ✅ **onto_plans**: 4 plans
    - "Authentication & User Management" (active)
    - "Core Features Development" (active)
    - "API Development" (active)
    - "Testing & QA" (draft)

- ✅ **onto_tasks**: 5 tasks with estimated hours
    - Each task has type (setup/backend/frontend/fullstack)
    - Priorities and plan assignments

- ✅ **onto_requirements**: 3 requirements
    - Technical (API documentation)
    - Performance (concurrent users)
    - Compliance (GDPR)

- ✅ **onto_documents**: 2 technical documents
    - Architecture doc
    - API documentation

- ✅ **onto_outputs**: 1 release output
    - MVP v1.0 planned

- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 2: Bug Fix and Feature Implementation

**Scenario**: Developer working in project workspace on active sprint

**Context Type**: `project`
**Entity ID**: [existing project_id]

### User Input:

"Found a critical bug in the authentication system - password reset tokens not expiring. Also need to implement the invite user feature this sprint."

### Expected Agent Behavior:

1. **Create Bug Task**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Fix: Password reset tokens not expiring",
      priority: 5,
      state_key: "todo",
      plan_id: "[Authentication plan_id]",
      props: {
        type: "bugfix",
        severity: "critical",
        estimated_hours: 2,
        description: "Implement token expiration logic in password reset flow"
      }
    })
    ```

2. **Create Feature Task**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Implement user invitation system",
      priority: 4,
      state_key: "todo",
      plan_id: "[Authentication plan_id]",
      props: {
        type: "feature",
        estimated_hours: 8,
        description: "Allow admins to invite users via email with secure token"
      }
    })
    ```

3. **Create Risk Entry**:
    ```
    create_onto_risk({
      project_id: "[current_project_id]",
      title: "Security vulnerability in password reset",
      impact: "high",
      probability: 1.0,
      state_key: "mitigating",
      props: {
        category: "security",
        mitigation: "Implementing token expiration",
        discovered_date: "[current_date]"
      }
    })
    ```

### Expected Results:

- ✅ **onto_tasks**: 2 new tasks (bugfix + feature)
- ✅ **onto_risks**: 1 security risk
- ✅ **Task properties**: Type, severity, estimated hours
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 3: Sprint Planning with Metrics

**Scenario**: Developer planning next sprint with velocity tracking

**Context Type**: `project`

### User Input:

"Planning Sprint 3. Team velocity is 40 story points per 2-week sprint. This sprint focus: complete user dashboard (8 pts), implement notifications (5 pts), add export feature (8 pts), write API tests (5 pts), performance optimization (8 pts). Sprint starts Monday, ends in 2 weeks."

### Expected Agent Behavior:

1. **Create Sprint Plan**:

    ```
    create_onto_plan({
      project_id: "[current_project_id]",
      name: "Sprint 3",
      type_key: "plan.development.sprint",
      state_key: "active",
      props: {
        sprint_number: 3,
        duration_weeks: 2,
        start_date: "[next_monday]",
        end_date: "[next_monday + 2 weeks]",
        velocity_target: 40,
        velocity_unit: "story_points"
      }
    })
    ```

2. **Create Sprint Metric**:

    ```
    create_onto_metric({
      project_id: "[current_project_id]",
      name: "Sprint 3 Velocity",
      type_key: "metric.agile.velocity",
      unit: "story_points",
      props: {
        target: 40,
        sprint_number: 3
      }
    })
    ```

3. **Create Sprint Tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Complete user dashboard",
      priority: 5,
      state_key: "todo",
      plan_id: "[sprint_3_plan_id]",
      props: {
        story_points: 8,
        sprint: 3
      }
    })

    // ... similar for other 4 tasks
    ```

4. **Create Sprint Milestone**:
    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Sprint 3 Complete",
      due_at: "[next_monday + 2 weeks]",
      type_key: "milestone.sprint",
      props: {
        sprint_number: 3
      }
    })
    ```

### Expected Results:

- ✅ **onto_plans**: 1 new sprint plan with velocity target
- ✅ **onto_metrics**: 1 velocity metric
- ✅ **onto_tasks**: 5 sprint tasks with story points
- ✅ **onto_milestones**: 1 sprint completion milestone
- ✅ **Story points tracked**: Total = 34 pts (dashboard:8 + notifications:5 + export:8 + tests:5 + optimization:8)
- ✅ **Sprint dates**: Start/end dates set

---

## Test Prompt 4: Technical Decision Record

**Scenario**: Developer documenting architectural decision

**Context Type**: `project`

### User Input:

"We've decided to use Redis for caching instead of Memcached. Main reasons: better data structures, pub/sub support for real-time features, and persistence options. Considered Memcached but Redis fits our needs better for WebSocket state management."

### Expected Agent Behavior:

1. **Create Decision Record**:

    ```
    create_onto_decision({
      project_id: "[current_project_id]",
      title: "Caching Technology: Redis over Memcached",
      rationale: "Redis selected for superior data structures, pub/sub capabilities for real-time features, and persistence options crucial for WebSocket state management",
      decision_at: "[current_date]",
      props: {
        category: "infrastructure",
        decision_type: "technical_architecture",
        alternatives_considered: ["Memcached"],
        redis_benefits: [
          "Rich data structures (lists, sets, hashes)",
          "Built-in pub/sub for WebSocket coordination",
          "Persistence options (RDB, AOF)",
          "Better suited for real-time state management"
        ],
        impact: "high",
        decision_maker: "engineering_team"
      }
    })
    ```

2. **Update Architecture Document**:

    ```
    // Agent searches for architecture doc
    search_onto_documents({
      project_id: "[current_project_id]",
      search: "architecture"
    })

    // Then updates or suggests update
    update_onto_document({
      document_id: "[architecture_doc_id]",
      props: {
        caching_layer: "Redis",
        last_updated: "[current_date]"
      }
    })
    ```

### Expected Results:

- ✅ **onto_decisions**: 1 decision record with rationale
- ✅ **Alternatives documented**: Memcached considered
- ✅ **Impact assessment**: High impact decision
- ✅ **onto_documents**: Architecture doc updated
- ✅ **Decision linkage**: Linked to project infrastructure

---

## Test Prompt 5: Release Planning and Milestones

**Scenario**: Developer planning release schedule with multiple milestones

**Context Type**: `project`

### User Input:

"Release plan: Alpha release in 2 weeks for internal testing. Beta release in 6 weeks with 50 test users. General Availability in 3 months. Each release needs code freeze 3 days before release date."

### Expected Agent Behavior:

1. **Create Release Milestones**:

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Alpha Release - Internal Testing",
      due_at: "[current_date + 2 weeks]",
      type_key: "milestone.release",
      props: {
        release_type: "alpha",
        target_audience: "internal",
        code_freeze_date: "[current_date + 2 weeks - 3 days]"
      }
    })
    ```

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Beta Release - Limited User Testing",
      due_at: "[current_date + 6 weeks]",
      type_key: "milestone.release",
      props: {
        release_type: "beta",
        target_audience: "test_users",
        user_count: 50,
        code_freeze_date: "[current_date + 6 weeks - 3 days]"
      }
    })
    ```

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "General Availability (GA) Release",
      due_at: "[current_date + 3 months]",
      type_key: "milestone.release",
      props: {
        release_type: "ga",
        target_audience: "public",
        code_freeze_date: "[current_date + 3 months - 3 days]"
      }
    })
    ```

2. **Create Release Outputs**:

    ```
    create_onto_output({
      project_id: "[current_project_id]",
      name: "Alpha Release v0.1",
      type_key: "output.software.release",
      state_key: "planned",
      props: {
        version: "0.1.0",
        release_date: "[current_date + 2 weeks]"
      }
    })

    // ... similar for beta and GA
    ```

3. **Create Release Plan**:
    ```
    create_onto_plan({
      project_id: "[current_project_id]",
      name: "Release Management",
      type_key: "plan.development.release",
      state_key: "active",
      props: {
        release_schedule: {
          alpha: "[current_date + 2 weeks]",
          beta: "[current_date + 6 weeks]",
          ga: "[current_date + 3 months]"
        }
      }
    })
    ```

### Expected Results:

- ✅ **onto_milestones**: 3 release milestones with code freeze dates
- ✅ **onto_outputs**: 3 release outputs (alpha, beta, GA)
- ✅ **onto_plans**: 1 release management plan
- ✅ **Release schedule**: Clear timeline established
- ✅ **Code freeze tracking**: Freeze dates 3 days before each release

---

## Test Prompt 6: Performance Monitoring and Metrics

**Scenario**: Developer setting up performance tracking

**Context Type**: `project`

### User Input:

"Need to track performance metrics: API response time (target < 200ms), database query time (target < 50ms), page load time (target < 2s), error rate (target < 1%), and uptime (target 99.9%). Set up monitoring for these."

### Expected Agent Behavior:

1. **Create Performance Metrics**:

    ```
    create_onto_metric({
      project_id: "[current_project_id]",
      name: "API Response Time",
      type_key: "metric.performance.latency",
      unit: "milliseconds",
      props: {
        target: 200,
        threshold_warning: 150,
        threshold_critical: 250,
        measurement_frequency: "continuous"
      }
    })

    create_onto_metric({
      project_id: "[current_project_id]",
      name: "Database Query Time",
      type_key: "metric.performance.database",
      unit: "milliseconds",
      props: {
        target: 50,
        threshold_warning: 40,
        threshold_critical: 75
      }
    })

    create_onto_metric({
      project_id: "[current_project_id]",
      name: "Page Load Time",
      type_key: "metric.performance.frontend",
      unit: "seconds",
      props: {
        target: 2.0,
        threshold_warning: 1.5,
        threshold_critical: 3.0
      }
    })

    create_onto_metric({
      project_id: "[current_project_id]",
      name: "Error Rate",
      type_key: "metric.reliability.errors",
      unit: "percentage",
      props: {
        target: 1.0,
        threshold_warning: 0.5,
        threshold_critical: 2.0
      }
    })

    create_onto_metric({
      project_id: "[current_project_id]",
      name: "System Uptime",
      type_key: "metric.reliability.uptime",
      unit: "percentage",
      props: {
        target: 99.9,
        threshold_critical: 99.5
      }
    })
    ```

2. **Create Monitoring Plan**:

    ```
    create_onto_plan({
      project_id: "[current_project_id]",
      name: "Performance Monitoring",
      type_key: "plan.operations.monitoring",
      state_key: "active",
      props: {
        metrics_count: 5,
        monitoring_tools: ["Prometheus", "Grafana"]
      }
    })
    ```

3. **Create Monitoring Requirements**:
    ```
    create_onto_requirement({
      project_id: "[current_project_id]",
      text: "All performance metrics must be tracked and alerted in real-time",
      type_key: "requirement.operations",
      props: {
        category: "monitoring",
        tools: ["Prometheus", "Grafana", "PagerDuty"]
      }
    })
    ```

### Expected Results:

- ✅ **onto_metrics**: 5 performance metrics created
- ✅ **Metric targets**: Each metric has target, warning, critical thresholds
- ✅ **onto_plans**: 1 monitoring plan
- ✅ **onto_requirements**: 1 monitoring requirement
- ✅ **Metric types**: latency, database, frontend, errors, uptime
- ✅ **Units specified**: ms, seconds, percentage

---

## Edge Cases

### Edge Case 1: Microservices Architecture

**Input**: "This project will use microservices. We need separate services for auth, notifications, and data processing."

**Expected Behavior**:

- Creates main project as parent
- Creates 3 sub-projects (services) linked via onto_edges
- Each service has own plans, tasks, requirements
- Uses `also_types` to mark as microservice

### Edge Case 2: Technical Debt Tracking

**Input**: "We've accumulated technical debt: need to refactor auth module, update dependencies, improve test coverage from 60% to 80%."

**Expected Behavior**:

- Creates tasks with type "technical_debt"
- Creates metric for test coverage
- Creates plan for "Technical Debt Resolution"
- Links tasks to code quality goals

### Edge Case 3: Dependency Management

**Input**: "This task is blocked by the database schema task. Can't start until that's complete."

**Expected Behavior**:

- Updates task with blocking dependency via props
- Creates onto_edge with rel="blocked_by"
- Sets task state to "blocked"
- Links tasks via edges table

---

## Summary

This test suite validates:

1. ✅ **Technical Project Creation**: Full software project with architecture
2. ✅ **Sprint/Agile Management**: Velocity tracking, story points
3. ✅ **Bug/Feature Workflows**: Different task types and priorities
4. ✅ **Decision Records**: Architectural decisions with rationale
5. ✅ **Release Management**: Multi-stage release planning
6. ✅ **Performance Metrics**: Comprehensive monitoring setup
7. ✅ **Requirements Tracking**: Technical, performance, compliance requirements
8. ✅ **Risk Management**: Security and technical risks
9. ✅ **Milestone Tracking**: Sprint, release, code freeze milestones
10. ✅ **Edge Cases**: Microservices, technical debt, dependencies

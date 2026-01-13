<!-- apps/web/src/lib/tests/test-onto-project-creation-designer.md -->

# Ontology Project Creation Tests - Designer/Creative Professional Persona

**Test Suite**: Ontology project creation with agentic chat
**Persona**: Designer / Creative Professional
**Context Type**: `project_create` → `project` (after creation)
**Primary Template**: `designer.brand`, `designer.product`, `designer.ux`

## Test Prompt 1: Brand Identity Design - Full Project

**Scenario**: Designer creating comprehensive brand identity for new client

**Context Type**: `project_create`

### User Input:

"I need to create a complete brand identity for a new sustainable coffee company called 'Verde Roast'. Deliverables: logo design, color palette, typography system, brand guidelines, packaging design, and website mockups. Client wants modern, eco-friendly aesthetic. Timeline: 6 weeks with presentation milestones every 2 weeks."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="designer",
      search="brand"
    )
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "Verde Roast - Brand Identity Design",
        type_key: "designer.brand",
        description: "Complete brand identity for sustainable coffee company with modern eco-friendly aesthetic",
        props: {
          facets: {
            context: "commercial",
            scale: "large",
            stage: "discovery"
          },
          client_name: "Verde Roast",
          design_focus: ["brand_identity", "packaging", "digital"],
          aesthetic: "modern eco-friendly"
        },
        start_at: "[current_date]",
        end_at: "[current_date + 6 weeks]"
      },
      goals: [
        {
          name: "Deliver complete brand identity system",
          type_key: "goal.outcome",
          props: {
            assets_count: 6,
            measurement: "assets_approved"
          }
        },
        {
          name: "Client approval at all milestone presentations",
          type_key: "goal.outcome",
          props: {
            target: 3,
            measurement: "presentations_approved"
          }
        }
      ],
      plans: [
        {
          name: "Discovery & Research",
          type_key: "plan.design.discovery",
          state_key: "active"
        },
        {
          name: "Concept Development",
          type_key: "plan.design.concept",
          state_key: "draft"
        },
        {
          name: "Design Execution",
          type_key: "plan.design.execution",
          state_key: "draft"
        },
        {
          name: "Client Deliverables",
          type_key: "plan.design.delivery",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Conduct client interview and brand strategy session",
          plan_name: "Discovery & Research",
          priority: 5,
          state_key: "todo",
          props: {
            type: "research",
            estimated_hours: 3,
            stakeholders: ["client_founder", "marketing_director"]
          }
        },
        {
          title: "Competitive landscape research - sustainable coffee brands",
          plan_name: "Discovery & Research",
          priority: 5,
          state_key: "todo",
          props: {
            type: "research",
            estimated_hours: 4
          }
        },
        {
          title: "Develop logo concepts (3 directions)",
          plan_name: "Concept Development",
          priority: 5,
          state_key: "todo",
          props: {
            type: "design",
            estimated_hours: 12,
            iterations: 3
          }
        },
        {
          title: "Create color palette with accessibility testing",
          plan_name: "Concept Development",
          priority: 4,
          state_key: "todo",
          props: {
            type: "design",
            estimated_hours: 6,
            accessibility_standard: "WCAG AA"
          }
        },
        {
          title: "Design packaging mockups for coffee bags",
          plan_name: "Design Execution",
          priority: 4,
          state_key: "todo",
          props: {
            type: "design",
            estimated_hours: 16,
            formats: ["12oz_bag", "5lb_bag"]
          }
        }
      ],
      requirements: [
        {
          text: "All designs must meet WCAG AA accessibility standards",
          type_key: "requirement.design",
          props: {
            category: "accessibility",
            standard: "WCAG AA"
          }
        },
        {
          text: "Brand colors must be sustainable and eco-friendly tones",
          type_key: "requirement.design",
          props: {
            category: "aesthetics",
            constraint: "eco_palette"
          }
        },
        {
          text: "Deliverables in vector format (AI, SVG) and web-ready (PNG, WebP)",
          type_key: "requirement.technical",
          props: {
            file_formats: ["AI", "SVG", "PNG", "WebP"]
          }
        }
      ],
      documents: [
        {
          title: "Brand Strategy Brief",
          type_key: "document.design.brief",
          state_key: "draft",
          props: {
            sections: ["Brand Values", "Target Audience", "Competitive Position"]
          }
        },
        {
          title: "Design Moodboard",
          type_key: "document.design.moodboard",
          state_key: "draft"
        },
        {
          title: "Brand Guidelines Document",
          type_key: "document.design.guidelines",
          state_key: "planned",
          props: {
            sections: ["Logo Usage", "Color System", "Typography", "Voice & Tone"]
          }
        }
      ],
      milestones: [
        {
          title: "Week 2 Presentation - Concepts & Moodboards",
          due_at: "[current_date + 2 weeks]",
          type_key: "milestone.presentation",
          props: {
            assets: ["logo_concepts", "moodboard", "color_palette"]
          }
        },
        {
          title: "Week 4 Presentation - Design Refinements",
          due_at: "[current_date + 4 weeks]",
          type_key: "milestone.presentation",
          props: {
            assets: ["final_logo", "packaging_draft", "web_wireframes"]
          }
        },
        {
          title: "Week 6 Final Delivery",
          due_at: "[current_date + 6 weeks]",
          type_key: "milestone.delivery",
          props: {
            assets: ["all_design_files", "brand_guidelines", "presentation"]
          }
        }
      ]
    })
    ```

### Expected Results:

**Onto Tables Created**:

- ✅ **onto_projects**: 1 project
    - name: "Verde Roast - Brand Identity Design"
    - type_key: "designer.brand"
    - facet_context: "commercial"
    - facet_scale: "large"
    - facet_stage: "discovery"
    - props includes client_name, design_focus, aesthetic

- ✅ **onto_goals**: 2 goals
    - "Deliver complete brand identity system" (outcome)
    - "Client approval at all presentations" (outcome)

- ✅ **onto_plans**: 4 plans
    - "Discovery & Research" (active)
    - "Concept Development" (draft)
    - "Design Execution" (draft)
    - "Client Deliverables" (draft)

- ✅ **onto_tasks**: 5 tasks with estimated hours
    - Client interview (research)
    - Competitive research (research)
    - Logo concepts (design, 3 iterations)
    - Color palette (design, accessibility)
    - Packaging design (design)

- ✅ **onto_requirements**: 3 requirements
    - Accessibility (WCAG AA)
    - Design aesthetics (eco-friendly)
    - Technical (file formats)

- ✅ **onto_documents**: 3 design documents
    - Brand Strategy Brief
    - Design Moodboard
    - Brand Guidelines

    - Final Logo Package (multiple versions/formats)
    - Packaging Design Files
    - Website UI Mockups

- ✅ **onto_milestones**: 3 presentation/delivery milestones

- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 2: Design System Creation - UX/UI Focus

**Scenario**: Designer building design system for existing product

**Context Type**: `project_create`

### User Input:

"Need to create a comprehensive design system for our SaaS app. We have inconsistent UI patterns across 50+ screens. Build component library with buttons, forms, cards, navigation, data tables. Use Figma for design, need to export tokens for developers. Accessibility is critical - WCAG AAA for color contrast."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="designer",
      search="ux design system"
    )
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "SaaS Design System",
        type_key: "designer.ux",
        description: "Comprehensive design system to standardize UI patterns across 50+ product screens",
        props: {
          facets: {
            context: "commercial",
            scale: "large",
            stage: "planning"
          },
          design_tool: "Figma",
          component_count: "50+",
          accessibility_level: "WCAG AAA"
        }
      },
      goals: [
        {
          name: "Build reusable component library",
          type_key: "goal.outcome",
          props: {
            target: 30,
            measurement: "components_created"
          }
        },
        {
          name: "Achieve WCAG AAA accessibility compliance",
          type_key: "goal.quality",
          props: {
            standard: "WCAG AAA",
            scope: "all_components"
          }
        }
      ],
      plans: [
        {
          name: "Audit & Discovery",
          type_key: "plan.design.audit",
          state_key: "active"
        },
        {
          name: "Foundation - Tokens & Primitives",
          type_key: "plan.design.foundation",
          state_key: "draft"
        },
        {
          name: "Component Library",
          type_key: "plan.design.components",
          state_key: "draft"
        },
        {
          name: "Documentation & Handoff",
          type_key: "plan.design.documentation",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Audit all 50+ screens for UI patterns and inconsistencies",
          plan_name: "Audit & Discovery",
          priority: 5,
          state_key: "todo",
          props: {
            type: "audit",
            estimated_hours: 8
          }
        },
        {
          title: "Define color tokens with WCAG AAA contrast testing",
          plan_name: "Foundation - Tokens & Primitives",
          priority: 5,
          state_key: "todo",
          props: {
            type: "design",
            estimated_hours: 6,
            accessibility_standard: "WCAG AAA"
          }
        },
        {
          title: "Create typography scale and spacing system",
          plan_name: "Foundation - Tokens & Primitives",
          priority: 5,
          state_key: "todo",
          props: {
            type: "design",
            estimated_hours: 4
          }
        },
        {
          title: "Design button component with all variants and states",
          plan_name: "Component Library",
          priority: 4,
          state_key: "todo",
          props: {
            type: "component",
            estimated_hours: 6,
            variants: ["primary", "secondary", "ghost", "danger"],
            states: ["default", "hover", "active", "disabled", "loading"]
          }
        },
        {
          title: "Build data table component with sorting/filtering",
          plan_name: "Component Library",
          priority: 4,
          state_key: "todo",
          props: {
            type: "component",
            estimated_hours: 12,
            complexity: "high"
          }
        }
      ],
      requirements: [
        {
          text: "All components must meet WCAG AAA contrast requirements (7:1)",
          type_key: "requirement.accessibility",
          props: {
            standard: "WCAG AAA",
            contrast_ratio: 7.0
          }
        },
        {
          text: "Design tokens exported in JSON format for developer handoff",
          type_key: "requirement.technical",
          props: {
            format: "JSON",
            purpose: "developer_handoff"
          }
        },
        {
          text: "All components must have Figma auto-layout and variants",
          type_key: "requirement.design",
          props: {
            tool: "Figma",
            features: ["auto_layout", "variants"]
          }
        }
      ],
      documents: [
        {
          title: "UI Audit Report",
          type_key: "document.design.audit",
          state_key: "draft"
        },
        {
          title: "Design Token Specifications",
          type_key: "document.design.specifications",
          state_key: "draft",
          props: {
            token_types: ["colors", "typography", "spacing", "shadows"]
          }
        },
        {
          title: "Component Usage Guidelines",
          type_key: "document.design.guidelines",
          state_key: "planned"
        }
      ],
      metrics: [
        {
          name: "Component Library Progress",
          type_key: "metric.design.progress",
          unit: "components",
          props: {
            target: 30,
            current: 0
          }
        },
        {
          name: "Accessibility Compliance Rate",
          type_key: "metric.design.accessibility",
          unit: "percentage",
          props: {
            target: 100,
            standard: "WCAG AAA"
          }
        }
      ]
    })
    ```

### Expected Results:

- ✅ **onto_projects**: 1 project (design system)
- ✅ **onto_goals**: 2 goals (component library + accessibility)
- ✅ **onto_plans**: 4 plans (audit, foundation, components, documentation)
- ✅ **onto_tasks**: 5 tasks with complexity levels
- ✅ **onto_requirements**: 3 requirements (accessibility, technical, design tool)
- ✅ **onto_documents**: 3 documents (audit, tokens, guidelines)
- ✅ **onto_metrics**: 2 metrics (progress, accessibility)
- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 3: Update Design Task - Workspace Mode

**Scenario**: Designer in project workspace adding new components

**Context Type**: `project` (already in workspace)
**Entity ID**: [existing project_id]

### User Input:

"Add tasks for designing form components: text input, select dropdown, checkbox, radio buttons, and date picker. Each needs error states and validation feedback."

### Expected Agent Behavior:

1. **Create Component Tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Design text input component with validation states",
      priority: 4,
      state_key: "todo",
      plan_id: "[Component Library plan_id]",
      props: {
        type: "component",
        estimated_hours: 4,
        states: ["default", "focus", "error", "success", "disabled"],
        validation_types: ["required", "format", "length"]
      }
    })

    // Similar for other 4 form components...
    ```

2. **Create Design Document**:
    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Form Component Specifications",
      type_key: "document.design.specifications",
      state_key: "draft",
      props: {
        components: ["text_input", "select", "checkbox", "radio", "date_picker"]
      }
    })
    ```

### Expected Results:

- ✅ **onto_tasks**: 5 new component tasks
- ✅ **onto_documents**: 1 specification document
- ✅ **Task properties**: States, validation types, estimated hours
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 4: Design Review and Iteration

**Scenario**: Client feedback requires design revisions

**Context Type**: `project`

### User Input:

"Client reviewed logo concepts. They love option 2 but want to see it with darker green and in a circular badge version. Also requesting one more alternate concept combining elements from options 1 and 3. Need to present revisions in 3 days."

### Expected Agent Behavior:

1. **Update Original Task**:

    ```
    search_onto_tasks({
      search: "logo concepts",
      project_id: "[current_project_id]"
    })

    update_onto_task({
      task_id: "[logo_task_id]",
      state_key: "in_progress",
      props: {
        client_feedback: "Option 2 selected, needs refinements",
        iterations_completed: 1
      }
    })
    ```

2. **Create Revision Tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Refine logo option 2 - darker green color",
      priority: 5,
      state_key: "todo",
      plan_id: "[Concept Development plan_id]",
      props: {
        type: "revision",
        estimated_hours: 2,
        parent_task: "[logo_task_id]",
        revision_notes: "Client wants darker, more sustainable green tone"
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Create circular badge version of logo option 2",
      priority: 5,
      state_key: "todo",
      props: {
        type: "design",
        estimated_hours: 3,
        format: "circular_badge"
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Design hybrid concept combining options 1 + 3",
      priority: 4,
      state_key: "todo",
      props: {
        type: "design",
        estimated_hours: 4,
        iteration: 2
      }
    })
    ```

3. **Update Milestone**:
    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Logo Revision Presentation",
      due_at: "[current_date + 3 days]",
      type_key: "milestone.presentation",
      props: {
        assets: ["logo_option_2_refined", "circular_badge", "hybrid_concept"]
      }
    })
    ```

### Expected Results:

- ✅ **onto_tasks**: 1 updated, 3 new revision tasks
- ✅ **onto_milestones**: 1 new presentation milestone (3 days)
- ✅ **Task tracking**: Iteration count, revision notes
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 5: Design Delivery and Assets

**Scenario**: Preparing final assets with all file formats

**Context Type**: `project`

### User Input:

"Final logo is approved. Prepare delivery package: AI source files, SVG web files, PNG exports (transparent, white bg, black bg) in sizes 512px, 1024px, 2048px. Also need PDF brand guidelines with logo usage rules, color specs, and don'ts."

### Expected Agent Behavior:

1. **Create Delivery Tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Export logo in all required formats and sizes",
      priority: 5,
      state_key: "todo",
      plan_id: "[Client Deliverables plan_id]",
      props: {
        type: "export",
        estimated_hours: 2,
        formats: ["AI", "SVG", "PNG"],
        png_variants: ["transparent", "white_bg", "black_bg"],
        sizes: [512, 1024, 2048]
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Compile brand guidelines PDF",
      priority: 5,
      state_key: "todo",
      props: {
        type: "documentation",
        estimated_hours: 4,
        sections: ["logo_usage", "color_specifications", "usage_donts"]
      }
    })
    ```

2. **Create Document for Guidelines**:

    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Brand Guidelines - Final PDF",
      type_key: "document.design.guidelines",
      state_key: "in_progress",
      props: {
        format: "PDF",
        page_count: 12,
        sections: [
          "Logo Usage Rules",
          "Color System",
          "Typography",
          "Spacing & Clear Space",
          "Incorrect Usage Examples"
        ]
      }
    })
    ```

### Expected Results:

- ✅ **onto_tasks**: 2 delivery tasks (export + documentation)
- ✅ **onto_documents**: 1 new document (guidelines PDF)
- ✅ **File specifications**: All formats, sizes, variants tracked
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 6: Design Metrics and Portfolio

**Scenario**: Tracking design quality and building portfolio case study

**Context Type**: `project`

### User Input:

"Track design metrics for this project: 15 design revisions total, 3 client presentations, 87% of designs approved on first review. Also create portfolio case study documenting the process from discovery to final delivery."

### Expected Agent Behavior:

1. **Create Project Metrics**:

    ```
    create_onto_metric({
      project_id: "[current_project_id]",
      name: "Design Revisions",
      type_key: "metric.design.iterations",
      unit: "count",
      props: {
        total: 15,
        approved_first_round: 13
      }
    })

    create_onto_metric_point({
      metric_id: "[revisions_metric_id]",
      value: 15,
      recorded_at: "[current_date]",
      props: {
        context: "project_completion"
      }
    })

    create_onto_metric({
      project_id: "[current_project_id]",
      name: "First-Round Approval Rate",
      type_key: "metric.design.approval",
      unit: "percentage",
      props: {
        target: 80,
        actual: 87
      }
    })

    create_onto_metric_point({
      metric_id: "[approval_metric_id]",
      value: 87,
      recorded_at: "[current_date]"
    })
    ```

2. **Create Portfolio Document**:

    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Portfolio Case Study - Verde Roast Brand Identity",
      type_key: "document.design.portfolio",
      state_key: "draft",
      props: {
        sections: [
          "Project Overview",
          "Discovery & Research Phase",
          "Concept Development",
          "Design Execution",
          "Final Deliverables",
          "Results & Impact"
        ],
        metrics_highlighted: {
          revisions: 15,
          presentations: 3,
          approval_rate: 87
        },
        featured_assets: ["logo", "packaging", "web_mockups"]
      }
    })
    ```

3. **Create Insight**:
    ```
    create_onto_insight({
      project_id: "[current_project_id]",
      title: "High first-round approval rate demonstrates effective client communication",
      insight_type: "performance",
      confidence: 0.9,
      props: {
        analysis: "87% approval rate exceeded industry average of 65%, indicating strong discovery phase and client alignment",
        contributing_factors: [
          "Thorough client interview",
          "Detailed moodboards",
          "Regular check-ins during design"
        ]
      }
    })
    ```

### Expected Results:

- ✅ **onto_metrics**: 2 design metrics (revisions, approval rate)
- ✅ **onto_metric_points**: 2 data points recorded
- ✅ **onto_documents**: 1 portfolio case study document
- ✅ **onto_insights**: 1 performance insight
- ✅ **Metrics tracking**: Quantitative project success measures
- ✅ **Portfolio documentation**: Process and results captured

---

## Edge Cases

### Edge Case 1: Design System Migration

**Input**: "We're migrating from Material UI to our custom design system. Need to redesign 120 components across 8 product areas. Phased rollout over 4 months."

**Expected Behavior**:

- Creates main migration project
- Creates 8 sub-projects (product areas) via onto_edges
- Creates migration plan with phases
- Tracks progress metric (components migrated)
- Creates risk for breaking changes

### Edge Case 2: Multi-Designer Collaboration

**Input**: "This project has 3 designers: Sarah on logo/brand, Mike on web design, and I'm doing packaging. Need to coordinate and share assets."

**Expected Behavior**:

- Creates onto_actors for team members
- Creates onto_assignments for role distribution
- Creates onto_permissions for file access
- Links tasks to specific designers
- Creates collaboration plan

### Edge Case 3: Design Feedback Cycles

**Input**: "Client requested 5 rounds of revisions on the logo. Each round takes 3 days. This is affecting timeline and budget."

**Expected Behavior**:

- Creates onto_risk for scope creep
- Updates milestone dates
- Tracks revision count as metric
- Adds revision limit note in project documentation
- Updates project timeline

---

## Summary

This test suite validates:

1. ✅ **Brand Identity Projects**: Complete branding with assets
2. ✅ **Design System Creation**: Component libraries and tokens
3. ✅ **UX/UI Workflows**: Accessibility, design tools, handoff
4. ✅ **Client Collaboration**: Feedback cycles, revisions, approvals
5. ✅ **Asset Management**: Multiple formats, sizes, variants
6. ✅ **Design Metrics**: Revisions, approval rates, quality tracking
7. ✅ **Portfolio Documentation**: Case studies and process docs
8. ✅ **Requirements Tracking**: Accessibility, technical, aesthetics
9. ✅ **Milestone Management**: Presentations, deliveries, reviews
10. ✅ **Edge Cases**: Migrations, team collaboration, revision management

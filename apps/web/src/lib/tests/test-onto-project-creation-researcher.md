<!-- apps/web/src/lib/tests/test-onto-project-creation-researcher.md -->

# Ontology Project Creation Tests - Researcher/Academic Persona

**Test Suite**: Ontology project creation with agentic chat
**Persona**: Researcher / Academic / Scientist
**Context Type**: `project_create` → `project` (after creation)
**Primary Template**: `research.study`, `research.paper`, `research.experiment`

## Test Prompt 1: Research Study - Full Academic Project

**Scenario**: Researcher starting longitudinal study with data collection and analysis

**Context Type**: `project_create`

### User Input:

"I'm conducting a 12-month research study on the impact of remote work on employee productivity and mental health. Mixed-methods approach: quantitative survey data (n=500) and qualitative interviews (n=30). Need ethics approval, develop survey instrument, recruit participants, collect data quarterly, analyze results, and publish findings in peer-reviewed journal. Start January 2026."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="research",
      search="study"
    )
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "Remote Work Impact Study - Productivity & Mental Health",
        type_key: "research.study",
        description: "12-month mixed-methods longitudinal study examining remote work effects on employee productivity and mental health (n=500 quantitative, n=30 qualitative)",
        props: {
          facets: {
            context: "academic",
            scale: "large",
            stage: "planning"
          },
          research_details: {
            methodology: "mixed_methods",
            duration_months: 12,
            sample_size_quantitative: 500,
            sample_size_qualitative: 30,
            data_collection_frequency: "quarterly",
            research_area: ["organizational_psychology", "workplace_wellbeing"]
          }
        },
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-12-31T23:59:59Z"
      },
      goals: [
        {
          name: "Obtain IRB/ethics approval",
          type_key: "goal.milestone",
          props: {
            critical: true,
            blocking: true
          }
        },
        {
          name: "Recruit 500 survey participants and 30 interview subjects",
          type_key: "goal.outcome",
          props: {
            target_survey: 500,
            target_interview: 30,
            measurement: "participants_enrolled"
          }
        },
        {
          name: "Publish findings in peer-reviewed journal",
          type_key: "goal.outcome",
          props: {
            target: 1,
            measurement: "publications",
            journal_tier: "tier_1"
          }
        }
      ],
      plans: [
        {
          name: "Ethics & Compliance",
          type_key: "plan.research.ethics",
          state_key: "active"
        },
        {
          name: "Research Design & Instrumentation",
          type_key: "plan.research.design",
          state_key: "active"
        },
        {
          name: "Participant Recruitment",
          type_key: "plan.research.recruitment",
          state_key: "draft"
        },
        {
          name: "Data Collection",
          type_key: "plan.research.data_collection",
          state_key: "draft"
        },
        {
          name: "Data Analysis",
          type_key: "plan.research.analysis",
          state_key: "draft"
        },
        {
          name: "Publication & Dissemination",
          type_key: "plan.research.publication",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Prepare IRB application with research protocol",
          plan_name: "Ethics & Compliance",
          priority: 5,
          state_key: "todo",
          props: {
            type: "compliance",
            estimated_hours: 20,
            blocking: true,
            deadline: "2025-12-01"
          }
        },
        {
          title: "Develop quantitative survey instrument (validated scales)",
          plan_name: "Research Design & Instrumentation",
          priority: 5,
          state_key: "todo",
          props: {
            type: "research",
            estimated_hours: 15,
            scales: ["productivity_measure", "mental_health_inventory", "work_environment"]
          }
        },
        {
          title: "Design semi-structured interview protocol",
          plan_name: "Research Design & Instrumentation",
          priority: 5,
          state_key: "todo",
          props: {
            type: "research",
            estimated_hours: 10,
            interview_length: "60_minutes"
          }
        },
        {
          title: "Pilot test survey with 50 participants",
          plan_name: "Research Design & Instrumentation",
          priority: 4,
          state_key: "todo",
          props: {
            type: "testing",
            estimated_hours: 12,
            pilot_sample: 50
          }
        },
        {
          title: "Recruit 500 survey participants via company HR partners",
          plan_name: "Participant Recruitment",
          priority: 5,
          state_key: "todo",
          props: {
            type: "recruitment",
            estimated_hours: 30,
            target: 500,
            recruitment_channels: ["hr_partners", "professional_networks"]
          }
        },
        {
          title: "Conduct Q1 data collection - surveys and interviews",
          plan_name: "Data Collection",
          priority: 4,
          state_key: "todo",
          props: {
            type: "data_collection",
            estimated_hours: 40,
            quarter: 1,
            methods: ["survey", "interview"]
          }
        }
      ],
      requirements: [
        {
          text: "IRB approval required before any participant contact",
          type_key: "requirement.compliance",
          props: {
            standard: "IRB",
            critical: true,
            blocking: true
          }
        },
        {
          text: "All data must be anonymized and stored on secure servers",
          type_key: "requirement.data_security",
          props: {
            anonymization: true,
            encryption: "AES_256",
            storage: "university_secure_server"
          }
        },
        {
          text: "Survey instrument must use validated psychological scales",
          type_key: "requirement.methodology",
          props: {
            validation: "required",
            scales: ["peer_reviewed", "reliability_tested"]
          }
        },
        {
          text: "Minimum 80% retention rate across all four quarters",
          type_key: "requirement.quality",
          props: {
            retention_target: 0.8,
            measurement_points: 4
          }
        }
      ],
      documents: [
        {
          title: "IRB Application Package",
          type_key: "document.research.irb",
          state_key: "draft",
          props: {
            sections: ["protocol", "consent_forms", "recruitment_materials", "data_security_plan"]
          }
        },
        {
          title: "Research Protocol Document",
          type_key: "document.research.protocol",
          state_key: "draft",
          props: {
            version: "1.0"
          }
        },
        {
          title: "Survey Instrument v1.0",
          type_key: "document.research.instrument",
          state_key: "draft",
          props: {
            instrument_type: "survey",
            question_count: 45,
            estimated_completion: "15_minutes"
          }
        },
        {
          title: "Interview Guide",
          type_key: "document.research.instrument",
          state_key: "draft",
          props: {
            instrument_type: "interview",
            question_count: 12,
            duration: "60_minutes"
          }
        },
        {
          title: "Literature Review",
          type_key: "document.research.literature",
          state_key: "in_progress",
          props: {
            sources_reviewed: 0,
            target_sources: 75
          }
        }
      ],
      outputs: [
        {
          name: "Research Dataset - Anonymized",
          type_key: "output.research.dataset",
          state_key: "planned",
          props: {
            data_points: 2000,
            format: "CSV",
            anonymized: true
          }
        },
        {
          name: "Peer-Reviewed Journal Article",
          type_key: "output.research.publication",
          state_key: "planned",
          props: {
            publication_type: "journal_article",
            target_journal: "Journal of Organizational Psychology"
          }
        },
        {
          name: "Conference Presentation",
          type_key: "output.research.presentation",
          state_key: "planned",
          props: {
            conference: "Academy of Management Annual Meeting 2027"
          }
        }
      ],
      milestones: [
        {
          title: "IRB Approval Obtained",
          due_at: "2025-12-15T00:00:00Z",
          type_key: "milestone.approval",
          props: {
            critical: true,
            blocking: true
          }
        },
        {
          title: "Pilot Study Complete",
          due_at: "2026-01-31T00:00:00Z",
          type_key: "milestone.research"
        },
        {
          title: "Full Recruitment Complete (n=500)",
          due_at: "2026-02-28T00:00:00Z",
          type_key: "milestone.recruitment"
        },
        {
          title: "Q1 Data Collection Complete",
          due_at: "2026-03-31T00:00:00Z",
          type_key: "milestone.data_collection",
          props: {
            quarter: 1
          }
        },
        {
          title: "Q2 Data Collection Complete",
          due_at: "2026-06-30T00:00:00Z",
          type_key: "milestone.data_collection",
          props: {
            quarter: 2
          }
        },
        {
          title: "Q3 Data Collection Complete",
          due_at: "2026-09-30T00:00:00Z",
          type_key: "milestone.data_collection",
          props: {
            quarter: 3
          }
        },
        {
          title: "Q4 Data Collection Complete",
          due_at: "2026-12-31T00:00:00Z",
          type_key: "milestone.data_collection",
          props: {
            quarter: 4,
            final: true
          }
        },
        {
          title: "Statistical Analysis Complete",
          due_at: "2027-02-28T00:00:00Z",
          type_key: "milestone.analysis"
        },
        {
          title: "Journal Manuscript Submitted",
          due_at: "2027-04-30T00:00:00Z",
          type_key: "milestone.publication"
        }
      ],
      metrics: [
        {
          name: "Participant Recruitment Progress",
          type_key: "metric.research.recruitment",
          unit: "count",
          props: {
            target: 500,
            current: 0
          }
        },
        {
          name: "Survey Response Rate",
          type_key: "metric.research.response_rate",
          unit: "percentage",
          props: {
            target: 75
          }
        },
        {
          name: "Participant Retention Rate",
          type_key: "metric.research.retention",
          unit: "percentage",
          props: {
            target: 80,
            measurement_points: 4
          }
        },
        {
          name: "Literature Sources Reviewed",
          type_key: "metric.research.literature",
          unit: "count",
          props: {
            target: 75,
            current: 0
          }
        }
      ],
      risks: [
        {
          title: "IRB approval delays could push timeline",
          impact: "critical",
          probability: 0.3,
          state_key: "identified",
          props: {
            category: "regulatory",
            mitigation: "Submit IRB application 6 weeks early, maintain communication with IRB office"
          }
        },
        {
          title: "Low recruitment rate - may not reach n=500",
          impact: "high",
          probability: 0.4,
          state_key: "identified",
          props: {
            category: "recruitment",
            mitigation: "Partner with multiple organizations, offer participation incentives"
          }
        },
        {
          title: "Participant attrition across 12 months",
          impact: "medium",
          probability: 0.6,
          state_key: "identified",
          props: {
            category: "data_quality",
            mitigation: "Regular participant communication, completion incentives, track engagement"
          }
        },
        {
          title: "Data security breach",
          impact: "critical",
          probability: 0.1,
          state_key: "identified",
          props: {
            category: "compliance",
            mitigation: "University secure servers, encryption, access controls, regular audits"
          }
        }
      ],
      sources: [
        {
          title: "Remote Work and Employee Well-being: A Meta-Analysis (Smith et al., 2024)",
          source_type: "academic_paper",
          props: {
            authors: ["Smith, J.", "Jones, A.", "Brown, K."],
            year: 2024,
            journal: "Journal of Applied Psychology",
            relevance: "high"
          }
        },
        {
          title: "Validated Productivity Scale (VPS-20)",
          source_type: "instrument",
          props: {
            scale_name: "VPS-20",
            items: 20,
            reliability: "α = 0.89",
            validation_studies: 15
          }
        }
      ]
    })
    ```

### Expected Results:

**Onto Tables Created**:

- ✅ **onto_projects**: 1 project
    - name: "Remote Work Impact Study"
    - type_key: "research.study"
    - facet_context: "academic"
    - facet_scale: "large"
    - facet_stage: "planning"
    - props includes methodology, sample sizes, duration

- ✅ **onto_goals**: 3 goals
    - IRB approval (milestone, blocking)
    - Recruit participants (outcome, n=500 + n=30)
    - Publish in journal (outcome, tier 1)

- ✅ **onto_plans**: 6 plans
    - Ethics & Compliance (active)
    - Research Design & Instrumentation (active)
    - Participant Recruitment (draft)
    - Data Collection (draft)
    - Data Analysis (draft)
    - Publication & Dissemination (draft)

- ✅ **onto_tasks**: 6 tasks
    - IRB application (blocking, 20 hours)
    - Survey development (validated scales)
    - Interview protocol (60-min structure)
    - Pilot test (n=50)
    - Recruitment (n=500)
    - Q1 data collection (40 hours)

- ✅ **onto_requirements**: 4 requirements
    - IRB approval (compliance, blocking)
    - Data security (encryption, anonymization)
    - Validated instruments (methodology)
    - 80% retention rate (quality)

- ✅ **onto_documents**: 5 documents
    - IRB Application Package
    - Research Protocol
    - Survey Instrument v1.0
    - Interview Guide
    - Literature Review

- ✅ **onto_outputs**: 3 deliverables
    - Research Dataset (anonymized CSV)
    - Journal Article
    - Conference Presentation

- ✅ **onto_milestones**: 9 milestones
    - IRB approval (blocking)
    - Pilot complete
    - Recruitment complete
    - Q1-Q4 data collection (quarterly)
    - Analysis complete
    - Manuscript submitted

- ✅ **onto_metrics**: 4 metrics
    - Recruitment progress (target: 500)
    - Response rate (target: 75%)
    - Retention rate (target: 80%)
    - Literature review (target: 75 sources)

- ✅ **onto_risks**: 4 risks
    - IRB delays (critical, 0.3)
    - Low recruitment (high, 0.4)
    - Participant attrition (medium, 0.6)
    - Data breach (critical, 0.1)

- ✅ **onto_sources**: 2 sources
    - Meta-analysis paper
    - Validated scale instrument

- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 2: Literature Review - Systematic Review Project

**Scenario**: Researcher conducting systematic literature review

**Context Type**: `project_create`

### User Input:

"Starting systematic literature review on AI ethics in healthcare. Need to search 5 databases (PubMed, IEEE, ACM, Web of Science, Scopus), screen 500+ papers, extract data from 75 included studies, code themes, and write review paper. Using PRISMA guidelines. Timeline: 6 months."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="research",
      search="literature review"
    )
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "Systematic Review: AI Ethics in Healthcare",
        type_key: "research.literature_review",
        description: "Systematic literature review following PRISMA guidelines examining AI ethics frameworks in healthcare applications",
        props: {
          facets: {
            context: "academic",
            scale: "medium",
            stage: "planning"
          },
          review_details: {
            review_type: "systematic",
            methodology: "PRISMA",
            databases: ["PubMed", "IEEE Xplore", "ACM Digital Library", "Web of Science", "Scopus"],
            expected_screening: 500,
            target_included: 75,
            duration_months: 6
          }
        },
        start_at: "[current_date]",
        end_at: "[current_date + 6 months]"
      },
      goals: [
        {
          name: "Complete systematic search across 5 databases",
          type_key: "goal.outcome",
          props: {
            databases: 5
          }
        },
        {
          name: "Screen and include 75 studies for analysis",
          type_key: "goal.outcome",
          props: {
            screening_target: 500,
            inclusion_target: 75
          }
        },
        {
          name: "Publish systematic review in medical informatics journal",
          type_key: "goal.outcome",
          props: {
            publication_type: "systematic_review"
          }
        }
      ],
      plans: [
        {
          name: "Search Strategy Development",
          type_key: "plan.research.search",
          state_key: "active"
        },
        {
          name: "Database Searching",
          type_key: "plan.research.data_collection",
          state_key: "draft"
        },
        {
          name: "Screening & Selection",
          type_key: "plan.research.screening",
          state_key: "draft"
        },
        {
          name: "Data Extraction & Coding",
          type_key: "plan.research.analysis",
          state_key: "draft"
        },
        {
          name: "Synthesis & Writing",
          type_key: "plan.research.writing",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Define PICO framework and inclusion/exclusion criteria",
          plan_name: "Search Strategy Development",
          priority: 5,
          state_key: "todo",
          props: {
            type: "methodology",
            estimated_hours: 6,
            framework: "PICO"
          }
        },
        {
          title: "Develop comprehensive search strings for each database",
          plan_name: "Search Strategy Development",
          priority: 5,
          state_key: "todo",
          props: {
            type: "methodology",
            estimated_hours: 10,
            databases: 5
          }
        },
        {
          title: "Execute searches in all 5 databases",
          plan_name: "Database Searching",
          priority: 5,
          state_key: "todo",
          props: {
            type: "data_collection",
            estimated_hours: 8,
            databases: ["PubMed", "IEEE", "ACM", "WoS", "Scopus"]
          }
        },
        {
          title: "Title/abstract screening (first pass)",
          plan_name: "Screening & Selection",
          priority: 4,
          state_key: "todo",
          props: {
            type: "screening",
            estimated_hours: 20,
            expected_papers: 500
          }
        },
        {
          title: "Full-text review (second pass)",
          plan_name: "Screening & Selection",
          priority: 4,
          state_key: "todo",
          props: {
            type: "screening",
            estimated_hours: 30,
            expected_papers: 150
          }
        },
        {
          title: "Extract data using standardized form",
          plan_name: "Data Extraction & Coding",
          priority: 4,
          state_key: "todo",
          props: {
            type: "data_extraction",
            estimated_hours: 40,
            papers: 75
          }
        }
      ],
      requirements: [
        {
          text: "Follow PRISMA guidelines for systematic review reporting",
          type_key: "requirement.methodology",
          props: {
            standard: "PRISMA",
            checklist_items: 27
          }
        },
        {
          text: "Dual screening by two independent reviewers for reliability",
          type_key: "requirement.quality",
          props: {
            reviewers: 2,
            inter_rater_reliability: "Cohen's Kappa > 0.8"
          }
        },
        {
          text: "Document complete search strategy for reproducibility",
          type_key: "requirement.documentation",
          props: {
            reproducibility: "required"
          }
        }
      ],
      documents: [
        {
          title: "PRISMA Protocol",
          type_key: "document.research.protocol",
          state_key: "draft",
          props: {
            protocol_type: "PRISMA"
          }
        },
        {
          title: "Search Strategy Documentation",
          type_key: "document.research.methodology",
          state_key: "draft",
          props: {
            databases: 5
          }
        },
        {
          title: "Data Extraction Form",
          type_key: "document.research.instrument",
          state_key: "draft",
          props: {
            fields: ["author", "year", "study_design", "sample_size", "AI_application", "ethics_framework", "outcomes"]
          }
        },
        {
          title: "PRISMA Flow Diagram",
          type_key: "document.research.diagram",
          state_key: "planned"
        }
      ],
      outputs: [
        {
          name: "Systematic Review Manuscript",
          type_key: "output.research.publication",
          state_key: "planned",
          props: {
            publication_type: "systematic_review",
            target_journal: "Journal of Medical Internet Research"
          }
        }
      ],
      metrics: [
        {
          name: "Papers Screened",
          type_key: "metric.research.screening",
          unit: "count",
          props: {
            target: 500,
            current: 0
          }
        },
        {
          name: "Papers Included",
          type_key: "metric.research.inclusion",
          unit: "count",
          props: {
            target: 75,
            current: 0
          }
        },
        {
          name: "Inter-Rater Reliability",
          type_key: "metric.research.quality",
          unit: "kappa",
          props: {
            target: 0.8,
            measure: "Cohen's Kappa"
          }
        }
      ]
    })
    ```

### Expected Results:

- ✅ **onto_projects**: 1 systematic review project
- ✅ **onto_goals**: 3 goals (search, screen, publish)
- ✅ **onto_plans**: 5 plans (search, database, screening, extraction, writing)
- ✅ **onto_tasks**: 6 tasks (PICO, search strings, database search, screening, full-text, extraction)
- ✅ **onto_requirements**: 3 requirements (PRISMA, dual screening, documentation)
- ✅ **onto_documents**: 4 documents (protocol, search strategy, extraction form, flow diagram)
- ✅ **onto_outputs**: 1 deliverable (manuscript)
- ✅ **onto_metrics**: 3 metrics (screened, included, reliability)
- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 3: Data Analysis - Workspace Mode

**Scenario**: Researcher analyzing collected data

**Context Type**: `project` (already in workspace)
**Entity ID**: [existing project_id]

### User Input:

"Q1 data is in. 487 survey responses (97% response rate!), completed 8 interviews so far. Need to run statistical analysis: descriptive stats, correlation analysis, regression models. Also start qualitative coding of interview transcripts using thematic analysis."

### Expected Agent Behavior:

1. **Update Data Collection Metrics**:

    ```
    create_onto_metric_point({
      metric_id: "[response_rate_metric_id]",
      value: 97,
      recorded_at: "[current_date]",
      props: {
        quarter: 1,
        responses: 487,
        invited: 500
      }
    })

    create_onto_metric_point({
      metric_id: "[recruitment_metric_id]",
      value: 8,
      recorded_at: "[current_date]",
      props: {
        data_type: "interviews",
        target: 30,
        progress_percentage: 27
      }
    })
    ```

2. **Create Analysis Tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Clean and prepare Q1 survey data (n=487)",
      priority: 5,
      state_key: "todo",
      plan_id: "[Data Analysis plan_id]",
      props: {
        type: "data_preparation",
        estimated_hours: 8,
        software: "R",
        responses: 487
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Run descriptive statistics for all variables",
      priority: 5,
      state_key: "todo",
      props: {
        type: "statistical_analysis",
        estimated_hours: 4,
        analysis_type: "descriptive",
        software: "R"
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Correlation analysis - productivity vs mental health measures",
      priority: 5,
      state_key: "todo",
      props: {
        type: "statistical_analysis",
        estimated_hours: 6,
        analysis_type: "correlation",
        variables: ["productivity_score", "mental_health_score", "remote_work_hours"]
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Multiple regression model - predictors of productivity",
      priority: 4,
      state_key: "todo",
      props: {
        type: "statistical_analysis",
        estimated_hours: 10,
        analysis_type: "regression",
        dependent_variable: "productivity_score",
        independent_variables: ["remote_work_hours", "work_life_balance", "mental_health_score"]
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Transcribe 8 interview recordings",
      priority: 5,
      state_key: "todo",
      props: {
        type: "data_preparation",
        estimated_hours: 16,
        interviews: 8,
        transcription_method: "automated_then_manual_review"
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Thematic coding of interview transcripts (round 1)",
      priority: 4,
      state_key: "todo",
      props: {
        type: "qualitative_analysis",
        estimated_hours: 20,
        method: "thematic_analysis",
        software: "NVivo",
        transcripts: 8
      }
    })
    ```

3. **Create Analysis Documents**:

    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Q1 Statistical Analysis Report",
      type_key: "document.research.analysis",
      state_key: "draft",
      props: {
        quarter: 1,
        sample_size: 487,
        analyses: ["descriptive", "correlation", "regression"]
      }
    })

    create_onto_document({
      project_id: "[current_project_id]",
      title: "Qualitative Codebook - Thematic Analysis",
      type_key: "document.research.codebook",
      state_key: "draft",
      props: {
        coding_rounds: 1,
        transcripts_coded: 0,
        themes_identified: 0
      }
    })
    ```

4. **Create Insight**:
    ```
    create_onto_insight({
      project_id: "[current_project_id]",
      title: "Exceptionally high Q1 response rate (97%) indicates strong engagement",
      insight_type: "success",
      confidence: 0.95,
      props: {
        metric: "response_rate",
        value: 97,
        comparison: "Expected 75%, achieved 97% - 29% above target",
        implication: "High quality data, strong participant buy-in"
      }
    })
    ```

### Expected Results:

- ✅ **onto_metric_points**: 2 new data points (response rate, interviews)
- ✅ **onto_tasks**: 6 new analysis tasks (cleaning, stats, coding)
- ✅ **onto_documents**: 2 analysis documents (stats report, codebook)
- ✅ **onto_insights**: 1 insight about response rate
- ✅ **Task details**: Software (R, NVivo), analysis types, variables
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 4: Research Collaboration and Team Management

**Scenario**: Managing research team with role assignments

**Context Type**: `project`

### User Input:

"Adding team members: Dr. Sarah Kim is co-investigator handling statistical analysis, Mike Chen is research assistant doing interviews and transcription, Elena Rodriguez is graduate student working on literature review. Need to assign tasks and track contributions for co-authorship."

### Expected Agent Behavior:

1. **Create Team Actors**:

    ```
    create_onto_actor({
      project_id: "[current_project_id]",
      name: "Dr. Sarah Kim",
      actor_type: "co_investigator",
      props: {
        role: "Co-Investigator",
        expertise: ["statistical_analysis", "quantitative_methods"],
        contribution: "statistical_analysis_lead",
        authorship_order: 2
      }
    })

    create_onto_actor({
      project_id: "[current_project_id]",
      name: "Mike Chen",
      actor_type: "research_assistant",
      props: {
        role: "Research Assistant",
        expertise: ["qualitative_research", "interviewing"],
        contribution: "data_collection",
        authorship_order: 4
      }
    })

    create_onto_actor({
      project_id: "[current_project_id]",
      name: "Elena Rodriguez",
      actor_type: "graduate_student",
      props: {
        role: "Graduate Research Assistant",
        expertise: ["literature_review"],
        contribution: "literature_synthesis",
        authorship_order: 3
      }
    })
    ```

2. **Create Task Assignments**:

    ```
    create_onto_assignment({
      project_id: "[current_project_id]",
      actor_id: "[sarah_kim_actor_id]",
      entity_type: "plan",
      entity_id: "[Data Analysis plan_id]",
      role: "lead",
      props: {
        responsibilities: ["statistical_analysis", "methodology_consultation"]
      }
    })

    create_onto_assignment({
      project_id: "[current_project_id]",
      actor_id: "[mike_chen_actor_id]",
      entity_type: "task",
      entity_id: "[interview_task_id]",
      role: "executor",
      props: {
        responsibilities: ["conduct_interviews", "transcription"]
      }
    })

    create_onto_assignment({
      project_id: "[current_project_id]",
      actor_id: "[elena_rodriguez_actor_id]",
      entity_type: "task",
      entity_id: "[literature_review_task_id]",
      role: "executor",
      props: {
        responsibilities: ["literature_search", "synthesis"]
      }
    })
    ```

3. **Create Permissions**:

    ```
    create_onto_permission({
      project_id: "[current_project_id]",
      actor_id: "[sarah_kim_actor_id]",
      resource_type: "document",
      resource_id: "[dataset_id]",
      permission_level: "edit",
      props: {
        scope: "statistical_analysis"
      }
    })

    create_onto_permission({
      project_id: "[current_project_id]",
      actor_id: "[mike_chen_actor_id]",
      resource_type: "document",
      resource_id: "[interview_transcripts_id]",
      permission_level: "edit"
    })
    ```

4. **Create Team Document**:
    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Team Roles & Authorship Agreement",
      type_key: "document.research.team",
      state_key: "active",
      props: {
        team_members: [
          { name: "Dr. Sarah Kim", role: "Co-Investigator", authorship: 2 },
          { name: "Mike Chen", role: "Research Assistant", authorship: 4 },
          { name: "Elena Rodriguez", role: "Graduate RA", authorship: 3 }
        ],
        authorship_criteria: "substantial_contribution"
      }
    })
    ```

### Expected Results:

- ✅ **onto_actors**: 3 team members created
- ✅ **onto_assignments**: 3 role assignments (plan lead, task executors)
- ✅ **onto_permissions**: 2 data access permissions
- ✅ **onto_documents**: 1 team/authorship agreement
- ✅ **Collaboration tracking**: Roles, contributions, authorship order
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 5: Publication Process and Peer Review

**Scenario**: Submitting manuscript and managing peer review

**Context Type**: `project`

### User Input:

"Manuscript is ready to submit to Journal of Organizational Psychology. Need to prepare cover letter, format references to APA 7th, submit via editorial system. Expect 8-12 week review. If accepted with revisions, plan 4 weeks for revisions and resubmission."

### Expected Agent Behavior:

1. **Create Submission Tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Write cover letter for journal submission",
      priority: 5,
      state_key: "todo",
      plan_id: "[Publication plan_id]",
      props: {
        type: "writing",
        estimated_hours: 3,
        journal: "Journal of Organizational Psychology"
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Format manuscript to journal guidelines (APA 7th)",
      priority: 5,
      state_key: "todo",
      props: {
        type: "formatting",
        estimated_hours: 6,
        style_guide: "APA_7th",
        word_limit: 8000
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Submit manuscript via editorial system",
      priority: 5,
      state_key: "todo",
      props: {
        type: "submission",
        estimated_hours: 2,
        system: "ScholarOne"
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Prepare response to reviewer comments (contingent)",
      priority: 3,
      state_key: "blocked",
      props: {
        type: "revision",
        estimated_hours: 40,
        contingent_on: "peer_review_complete",
        timeline: "4_weeks"
      }
    })
    ```

2. **Create Submission Milestones**:

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Manuscript Submitted",
      due_at: "[current_date + 2 weeks]",
      type_key: "milestone.submission",
      props: {
        journal: "Journal of Organizational Psychology",
        submission_date: "[current_date + 2 weeks]"
      }
    })

    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Peer Review Decision Expected",
      due_at: "[current_date + 14 weeks]",
      type_key: "milestone.review",
      props: {
        review_period_weeks: 12,
        expected_outcomes: ["accept", "revise_resubmit", "reject"]
      }
    })

    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Revisions Submitted (if R&R)",
      due_at: "[current_date + 18 weeks]",
      type_key: "milestone.revision",
      props: {
        contingent: true,
        revision_period_weeks: 4
      }
    })
    ```

3. **Update Output Status**:

    ```
    search_onto_outputs({
      project_id: "[current_project_id]",
      search: "journal article"
    })

    update_onto_output({
      output_id: "[journal_article_output_id]",
      state_key: "in_progress",
      props: {
        manuscript_status: "ready_for_submission",
        word_count: 7500,
        target_journal: "Journal of Organizational Psychology",
        submission_date: "[current_date + 2 weeks]"
      }
    })
    ```

4. **Create Publication Document**:

    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Manuscript - Remote Work Impact on Productivity (v1.0 submitted)",
      type_key: "document.research.manuscript",
      state_key: "submitted",
      props: {
        version: "1.0",
        journal: "Journal of Organizational Psychology",
        word_count: 7500,
        submission_date: "[current_date + 2 weeks]",
        authors: ["Principal Investigator", "Dr. Sarah Kim", "Elena Rodriguez", "Mike Chen"]
      }
    })
    ```

5. **Create Decision Record**:
    ```
    create_onto_decision({
      project_id: "[current_project_id]",
      title: "Journal Selection: Journal of Organizational Psychology",
      rationale: "Tier 1 journal in field, high impact factor (4.2), appropriate scope for mixed-methods research, 12-week review time acceptable",
      decision_at: "[current_date]",
      props: {
        category: "publication",
        alternatives_considered: ["Work & Stress", "Journal of Applied Psychology"],
        impact_factor: 4.2,
        acceptance_rate: 0.18
      }
    })
    ```

### Expected Results:

- ✅ **onto_tasks**: 4 submission/revision tasks
- ✅ **onto_milestones**: 3 milestones (submission, review decision, revisions)
- ✅ **onto_outputs**: 1 updated (manuscript in progress)
- ✅ **onto_documents**: 1 submitted manuscript version
- ✅ **onto_decisions**: 1 journal selection decision
- ✅ **Timeline tracking**: 12-week review + 4-week revision periods
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 6: Research Ethics and Compliance Monitoring

**Scenario**: Tracking ongoing ethics compliance and reporting

**Context Type**: `project`

### User Input:

"IRB requires annual progress reports. Need to document: 487 participants enrolled, no adverse events, 2 protocol amendments (extended timeline, added interview questions). Also track data security: all data encrypted on university servers, only 3 team members have access. Annual report due March 1st."

### Expected Agent Behavior:

1. **Create Compliance Tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Prepare IRB annual progress report",
      priority: 5,
      state_key: "todo",
      plan_id: "[Ethics & Compliance plan_id]",
      props: {
        type: "compliance",
        estimated_hours: 8,
        deadline: "2026-03-01",
        report_type: "IRB_annual"
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Document protocol amendments for IRB",
      priority: 5,
      state_key: "todo",
      props: {
        type: "compliance",
        estimated_hours: 4,
        amendments: ["timeline_extension", "interview_questions_added"]
      }
    })
    ```

2. **Create Compliance Metrics**:

    ```
    create_onto_metric({
      project_id: "[current_project_id]",
      name: "Adverse Events Reported",
      type_key: "metric.research.safety",
      unit: "count",
      props: {
        current: 0,
        target: 0
      }
    })

    create_onto_metric_point({
      metric_id: "[adverse_events_metric_id]",
      value: 0,
      recorded_at: "[current_date]",
      props: {
        reporting_period: "annual",
        participants_enrolled: 487
      }
    })

    create_onto_metric({
      project_id: "[current_project_id]",
      name: "Data Access Control",
      type_key: "metric.research.security",
      unit: "count",
      props: {
        authorized_users: 3,
        description: "Team members with data access"
      }
    })
    ```

3. **Create Compliance Documents**:

    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "IRB Annual Progress Report 2026",
      type_key: "document.research.compliance",
      state_key: "draft",
      props: {
        report_type: "IRB_annual",
        reporting_period: "2025-2026",
        participants_enrolled: 487,
        adverse_events: 0,
        protocol_amendments: 2
      }
    })

    create_onto_document({
      project_id: "[current_project_id]",
      title: "Data Security Audit Log",
      type_key: "document.research.security",
      state_key: "active",
      props: {
        storage_location: "university_secure_server",
        encryption: "AES_256",
        access_control: {
          authorized_users: 3,
          access_log_maintained: true
        }
      }
    })
    ```

4. **Create Milestone**:

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "IRB Annual Report Due",
      due_at: "2026-03-01T00:00:00Z",
      type_key: "milestone.compliance",
      props: {
        critical: true,
        report_type: "IRB_annual"
      }
    })
    ```

5. **Update Requirements**:
    ```
    create_onto_requirement({
      project_id: "[current_project_id]",
      text: "All protocol amendments must be submitted to IRB before implementation",
      type_key: "requirement.compliance",
      props: {
        amendments_submitted: 2,
        approved: true
      }
    })
    ```

### Expected Results:

- ✅ **onto_tasks**: 2 compliance tasks (annual report, amendments)
- ✅ **onto_metrics**: 2 new metrics (adverse events, data access)
- ✅ **onto_metric_points**: 1 data point (zero adverse events)
- ✅ **onto_documents**: 2 compliance documents (IRB report, security audit)
- ✅ **onto_milestones**: 1 compliance deadline (March 1st)
- ✅ **onto_requirements**: 1 amendment requirement
- ✅ **Compliance tracking**: Complete audit trail maintained

---

## Edge Cases

### Edge Case 1: Grant-Funded Research with Budget Tracking

**Input**: "This study is funded by NSF grant #123456, budget $250k over 3 years. Track expenses: personnel 60%, equipment 20%, travel 10%, other 10%. Annual budget reports required."

**Expected Behavior**:

- Creates onto_metric for budget with allocations
- Creates onto_metric_points for quarterly spending
- Creates onto_milestones for annual budget reports
- Creates onto_requirements for NSF reporting
- Creates onto_sources for grant information
- Tracks expenses by category

### Edge Case 2: Multi-Site Collaborative Research

**Input**: "This is a multi-site study with 3 partner universities. Each site recruits 150 participants. Weekly coordination meetings, shared data repository, coordinated analysis."

**Expected Behavior**:

- Creates onto_actors for partner institutions
- Creates onto_assignments for site responsibilities
- Creates onto_metrics per site (recruitment, data quality)
- Creates onto_events for coordination meetings (recurring)
- Creates onto_permissions for data repository access
- Tracks site-specific progress

### Edge Case 3: Failed Experiment - Null Results

**Input**: "Analysis complete - no significant findings. Null results. Still valuable for publication as negative results. Pivot to exploratory analysis to identify unexpected patterns."

**Expected Behavior**:

- Creates onto_insight documenting null findings
- Updates onto_output to "negative_results" publication
- Creates new onto_tasks for exploratory analysis
- Creates onto_decision record about publication strategy
- Updates project goals to reflect pivot
- Maintains scientific rigor in documentation

---

## Summary

This test suite validates:

1. ✅ **Research Study Projects**: Longitudinal studies, data collection, analysis
2. ✅ **Literature Reviews**: Systematic reviews, PRISMA methodology, screening
3. ✅ **Ethics & Compliance**: IRB applications, ongoing monitoring, reporting
4. ✅ **Data Collection**: Surveys, interviews, quantitative/qualitative methods
5. ✅ **Statistical Analysis**: Descriptive stats, correlation, regression modeling
6. ✅ **Qualitative Analysis**: Thematic coding, interview transcription
7. ✅ **Team Collaboration**: Multi-investigator research, authorship tracking
8. ✅ **Publication Process**: Manuscript submission, peer review, revisions
9. ✅ **Research Metrics**: Recruitment, retention, response rates, quality measures
10. ✅ **Edge Cases**: Grant funding, multi-site, null results, pivot strategies

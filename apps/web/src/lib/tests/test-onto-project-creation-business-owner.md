<!-- apps/web/src/lib/tests/test-onto-project-creation-business-owner.md -->

# Ontology Project Creation Tests - Small Business Owner Persona

**Test Suite**: Ontology project creation with agentic chat
**Persona**: Small Business Owner / Entrepreneur
**Context Type**: `project_create` → `project` (after creation)
**Primary Template**: `business.startup`, `business.product_launch`, `business.operations`

## Test Prompt 1: Product Launch - E-commerce Business

**Scenario**: Small business owner launching new product line

**Context Type**: `project_create`

### User Input:

"Launching a new line of organic skincare products. Need to: source suppliers for 5 products (cleanser, toner, serum, moisturizer, sunscreen), create branding and packaging, set up Shopify store, do product photography, get FDA compliance for cosmetics, plan marketing campaign, and launch by Q2. Budget $25k. Want to reach $10k monthly revenue within 6 months."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="business",
      search="product launch"
    )
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "Organic Skincare Line - Product Launch",
        type_key: "business.product_launch",
        description: "Launch 5-product organic skincare line with e-commerce store, targeting $10k monthly revenue within 6 months",
        props: {
          facets: {
            context: "commercial",
            scale: "small",
            stage: "planning"
          },
          business_details: {
            product_count: 5,
            product_line: ["cleanser", "toner", "serum", "moisturizer", "sunscreen"],
            business_model: "e_commerce",
            platform: "Shopify",
            budget: 25000,
            revenue_target: 10000,
            revenue_timeframe_months: 6
          }
        },
        start_at: "[current_date]",
        end_at: "[Q2_end_date]"
      },
      goals: [
        {
          name: "Launch 5-product skincare line by Q2",
          type_key: "goal.outcome",
          props: {
            products: 5,
            launch_quarter: "Q2"
          }
        },
        {
          name: "Achieve $10k monthly revenue within 6 months",
          type_key: "goal.revenue",
          props: {
            target_revenue: 10000,
            timeframe_months: 6,
            measurement: "monthly_recurring_revenue"
          }
        },
        {
          name: "Obtain FDA compliance for all products",
          type_key: "goal.compliance",
          props: {
            standard: "FDA_cosmetics",
            critical: true
          }
        }
      ],
      plans: [
        {
          name: "Product Development & Sourcing",
          type_key: "plan.business.product",
          state_key: "active"
        },
        {
          name: "Branding & Design",
          type_key: "plan.business.branding",
          state_key: "active"
        },
        {
          name: "E-commerce Setup",
          type_key: "plan.business.ecommerce",
          state_key: "draft"
        },
        {
          name: "Compliance & Legal",
          type_key: "plan.business.legal",
          state_key: "active"
        },
        {
          name: "Marketing & Launch Campaign",
          type_key: "plan.business.marketing",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Research and vet organic ingredient suppliers",
          plan_name: "Product Development & Sourcing",
          priority: 5,
          state_key: "todo",
          props: {
            type: "sourcing",
            estimated_hours: 12,
            suppliers_to_evaluate: 10
          }
        },
        {
          title: "Negotiate contracts with top 3 suppliers",
          plan_name: "Product Development & Sourcing",
          priority: 5,
          state_key: "todo",
          props: {
            type: "negotiation",
            estimated_hours: 8,
            suppliers: 3
          }
        },
        {
          title: "Order product samples and conduct testing",
          plan_name: "Product Development & Sourcing",
          priority: 4,
          state_key: "todo",
          props: {
            type: "product_testing",
            estimated_hours: 10,
            products: 5
          }
        },
        {
          title: "Design brand identity (logo, colors, packaging)",
          plan_name: "Branding & Design",
          priority: 5,
          state_key: "todo",
          props: {
            type: "branding",
            estimated_hours: 20,
            deliverables: ["logo", "color_palette", "packaging_design"]
          }
        },
        {
          title: "Hire photographer for product photography",
          plan_name: "Branding & Design",
          priority: 4,
          state_key: "todo",
          props: {
            type: "vendor",
            estimated_hours: 8,
            products: 5,
            photo_count: 50
          }
        },
        {
          title: "Set up Shopify store with payment processing",
          plan_name: "E-commerce Setup",
          priority: 4,
          state_key: "todo",
          props: {
            type: "technical",
            estimated_hours: 12,
            platform: "Shopify",
            integrations: ["Stripe", "inventory_management"]
          }
        },
        {
          title: "Register products with FDA as cosmetics",
          plan_name: "Compliance & Legal",
          priority: 5,
          state_key: "todo",
          props: {
            type: "compliance",
            estimated_hours: 15,
            regulatory_body: "FDA",
            products: 5,
            critical: true
          }
        },
        {
          title: "Create content marketing plan (blog, social media)",
          plan_name: "Marketing & Launch Campaign",
          priority: 4,
          state_key: "todo",
          props: {
            type: "marketing",
            estimated_hours: 10,
            channels: ["Instagram", "TikTok", "blog"]
          }
        }
      ],
      requirements: [
        {
          text: "All products must be FDA compliant before sale",
          type_key: "requirement.compliance",
          props: {
            standard: "FDA_cosmetics",
            blocking: true
          }
        },
        {
          text: "Ingredients must be certified organic and sustainably sourced",
          type_key: "requirement.product",
          props: {
            certification: "organic",
            sustainability: "required"
          }
        },
        {
          text: "E-commerce site must have SSL certificate and PCI compliance",
          type_key: "requirement.technical",
          props: {
            security: ["SSL", "PCI_DSS"],
            payment_processing: true
          }
        },
        {
          text: "Launch budget must not exceed $25,000",
          type_key: "requirement.budget",
          props: {
            budget_cap: 25000,
            hard_limit: true
          }
        }
      ],
      documents: [
        {
          title: "Business Plan - Skincare Launch",
          type_key: "document.business.plan",
          state_key: "draft",
          props: {
            sections: ["market_analysis", "product_line", "financial_projections", "marketing_strategy"]
          }
        },
        {
          title: "Brand Guidelines",
          type_key: "document.business.branding",
          state_key: "draft"
        },
        {
          title: "Supplier Comparison Spreadsheet",
          type_key: "document.business.vendor",
          state_key: "draft",
          props: {
            suppliers_evaluated: 0,
            criteria: ["price", "quality", "certifications", "lead_time"]
          }
        },
        {
          title: "FDA Compliance Checklist",
          type_key: "document.business.compliance",
          state_key: "draft",
          props: {
            regulatory_body: "FDA",
            product_count: 5
          }
        }
      ],
      outputs: [
        {
          name: "5 Product SKUs Ready for Sale",
          type_key: "output.business.product",
          state_key: "planned",
          props: {
            sku_count: 5,
            product_line: "organic_skincare"
          }
        },
        {
          name: "Live Shopify E-commerce Store",
          type_key: "output.business.website",
          state_key: "planned",
          props: {
            platform: "Shopify",
            products: 5
          }
        },
        {
          name: "Marketing Campaign Assets",
          type_key: "output.business.marketing",
          state_key: "planned",
          props: {
            asset_types: ["product_photos", "social_content", "email_templates"]
          }
        }
      ],
      milestones: [
        {
          title: "Suppliers Selected and Contracts Signed",
          due_at: "[current_date + 4 weeks]",
          type_key: "milestone.vendor",
          props: {
            suppliers: 3
          }
        },
        {
          title: "FDA Compliance Approved",
          due_at: "[current_date + 8 weeks]",
          type_key: "milestone.compliance",
          props: {
            critical: true,
            blocking: true
          }
        },
        {
          title: "Product Photography Complete",
          due_at: "[current_date + 10 weeks]",
          type_key: "milestone.creative"
        },
        {
          title: "Shopify Store Live",
          due_at: "[current_date + 12 weeks]",
          type_key: "milestone.launch_prep"
        },
        {
          title: "Official Product Launch",
          due_at: "[Q2_start_date]",
          type_key: "milestone.launch",
          props: {
            launch_type: "soft_launch",
            marketing_campaign: true
          }
        }
      ],
      metrics: [
        {
          name: "Product Development Progress",
          type_key: "metric.business.product",
          unit: "count",
          props: {
            target: 5,
            current: 0,
            measurement: "products_ready"
          }
        },
        {
          name: "Launch Budget Spent",
          type_key: "metric.business.budget",
          unit: "USD",
          props: {
            budget: 25000,
            spent: 0
          }
        },
        {
          name: "Monthly Revenue",
          type_key: "metric.business.revenue",
          unit: "USD",
          props: {
            target: 10000,
            current: 0,
            measurement: "MRR"
          }
        },
        {
          name: "Customer Acquisition Cost",
          type_key: "metric.business.cac",
          unit: "USD",
          props: {
            target: 25,
            calculation: "marketing_spend / customers_acquired"
          }
        }
      ],
      risks: [
        {
          title: "FDA approval delays could push launch date",
          impact: "high",
          probability: 0.3,
          state_key: "identified",
          props: {
            category: "regulatory",
            mitigation: "Submit FDA applications early, work with compliance consultant"
          }
        },
        {
          title: "Supplier quality issues or delivery delays",
          impact: "high",
          probability: 0.4,
          state_key: "identified",
          props: {
            category: "supply_chain",
            mitigation: "Vet multiple suppliers, order samples, maintain backup supplier list"
          }
        },
        {
          title: "Budget overrun on product development",
          impact: "medium",
          probability: 0.5,
          state_key: "identified",
          props: {
            category: "financial",
            mitigation: "Track expenses weekly, negotiate fixed pricing with suppliers"
          }
        },
        {
          title: "Low initial sales - not reaching revenue target",
          impact: "medium",
          probability: 0.6,
          state_key: "identified",
          props: {
            category: "market",
            mitigation: "Build email list pre-launch, invest in influencer marketing, offer launch discount"
          }
        }
      ],
      decisions: [
        {
          title: "E-commerce Platform: Shopify over WooCommerce",
          rationale: "Shopify offers better ease of use, built-in payment processing, and lower technical maintenance compared to WooCommerce. Worth the monthly fee for faster launch.",
          decision_at: "[current_date]",
          props: {
            category: "technology",
            alternatives: ["WooCommerce", "BigCommerce"],
            monthly_cost: 79,
            decision_maker: "business_owner"
          }
        }
      ]
    })
    ```

### Expected Results:

**Onto Tables Created**:

- ✅ **onto_projects**: 1 project
    - name: "Organic Skincare Line - Product Launch"
    - type_key: "business.product_launch"
    - facet_context: "commercial"
    - facet_scale: "small"
    - facet_stage: "planning"
    - props includes product details, budget, revenue targets

- ✅ **onto_goals**: 3 goals
    - Launch 5 products by Q2 (outcome)
    - $10k monthly revenue in 6 months (revenue)
    - FDA compliance (compliance, critical)

- ✅ **onto_plans**: 5 plans
    - Product Development & Sourcing (active)
    - Branding & Design (active)
    - E-commerce Setup (draft)
    - Compliance & Legal (active)
    - Marketing & Launch Campaign (draft)

- ✅ **onto_tasks**: 8 tasks
    - Supplier research (sourcing, 12 hours)
    - Contract negotiation (3 suppliers)
    - Product testing (5 products)
    - Brand design (logo, colors, packaging)
    - Product photography (50 photos)
    - Shopify setup (technical, integrations)
    - FDA registration (compliance, critical)
    - Marketing plan (blog, social)

- ✅ **onto_requirements**: 4 requirements
    - FDA compliance (blocking)
    - Organic certification (product quality)
    - SSL/PCI compliance (technical security)
    - Budget cap $25k (financial constraint)

- ✅ **onto_documents**: 4 documents
    - Business Plan
    - Brand Guidelines
    - Supplier Comparison
    - FDA Compliance Checklist

- ✅ **onto_outputs**: 3 deliverables
    - 5 Product SKUs
    - Live Shopify Store
    - Marketing Campaign Assets

- ✅ **onto_milestones**: 5 milestones
    - Suppliers selected (4 weeks)
    - FDA approved (8 weeks, blocking)
    - Photography complete (10 weeks)
    - Store live (12 weeks)
    - Product launch (Q2)

- ✅ **onto_metrics**: 4 metrics
    - Product development progress (5 products)
    - Budget spent ($25k cap)
    - Monthly revenue (MRR target $10k)
    - Customer acquisition cost (CAC target $25)

- ✅ **onto_risks**: 4 risks
    - FDA delays (high, 0.3)
    - Supplier issues (high, 0.4)
    - Budget overrun (medium, 0.5)
    - Low sales (medium, 0.6)

- ✅ **onto_decisions**: 1 decision
    - Shopify vs WooCommerce selection

- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 2: Restaurant Operations - Service Business

**Scenario**: Restaurant owner improving operations and launching catering service

**Context Type**: `project_create`

### User Input:

"Own a small Italian restaurant. Want to improve operations: reduce food waste by 30%, increase table turnover by 20 minutes, train staff on new POS system, and launch catering service for corporate events. Catering could add $5k monthly revenue. Timeline: implement changes over next 3 months."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="business",
      search="operations restaurant"
    )
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "Restaurant Operations Improvement & Catering Launch",
        type_key: "business.operations",
        description: "Improve restaurant efficiency (reduce waste 30%, faster turnover) and launch corporate catering service",
        props: {
          facets: {
            context: "commercial",
            scale: "small",
            stage: "execution"
          },
          business_type: "restaurant",
          improvement_goals: {
            food_waste_reduction: 0.30,
            table_turnover_reduction_minutes: 20,
            new_revenue_stream: "catering",
            catering_monthly_target: 5000
          }
        },
        start_at: "[current_date]",
        end_at: "[current_date + 3 months]"
      },
      goals: [
        {
          name: "Reduce food waste by 30%",
          type_key: "goal.efficiency",
          props: {
            current_waste: "baseline",
            target_reduction: 0.30,
            measurement: "food_cost_percentage"
          }
        },
        {
          name: "Reduce table turnover time by 20 minutes",
          type_key: "goal.efficiency",
          props: {
            current_turnover: "90_minutes",
            target_turnover: "70_minutes",
            measurement: "average_table_time"
          }
        },
        {
          name: "Launch catering service generating $5k monthly",
          type_key: "goal.revenue",
          props: {
            target_revenue: 5000,
            new_service: "corporate_catering"
          }
        }
      ],
      plans: [
        {
          name: "Food Waste Reduction",
          type_key: "plan.business.efficiency",
          state_key: "active"
        },
        {
          name: "Service Speed Optimization",
          type_key: "plan.business.operations",
          state_key: "active"
        },
        {
          name: "POS System Training",
          type_key: "plan.business.training",
          state_key: "active"
        },
        {
          name: "Catering Service Launch",
          type_key: "plan.business.expansion",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Conduct food waste audit - 2 week baseline",
          plan_name: "Food Waste Reduction",
          priority: 5,
          state_key: "todo",
          props: {
            type: "audit",
            estimated_hours: 10,
            duration_weeks: 2
          }
        },
        {
          title: "Implement inventory management system",
          plan_name: "Food Waste Reduction",
          priority: 5,
          state_key: "todo",
          props: {
            type: "system",
            estimated_hours: 15,
            software: "MarketMan"
          }
        },
        {
          title: "Train kitchen staff on portion control",
          plan_name: "Food Waste Reduction",
          priority: 4,
          state_key: "todo",
          props: {
            type: "training",
            estimated_hours: 8,
            staff_count: 6
          }
        },
        {
          title: "Analyze current service bottlenecks",
          plan_name: "Service Speed Optimization",
          priority: 5,
          state_key: "todo",
          props: {
            type: "analysis",
            estimated_hours: 6,
            areas: ["kitchen_to_table", "payment_processing", "table_clearing"]
          }
        },
        {
          title: "Implement new POS system (Toast)",
          plan_name: "POS System Training",
          priority: 5,
          state_key: "todo",
          props: {
            type: "technical",
            estimated_hours: 12,
            pos_system: "Toast",
            integrations: ["payment", "inventory", "reporting"]
          }
        },
        {
          title: "Train all staff on Toast POS (10 employees)",
          plan_name: "POS System Training",
          priority: 5,
          state_key: "todo",
          props: {
            type: "training",
            estimated_hours: 20,
            staff_count: 10,
            training_per_person: 2
          }
        },
        {
          title: "Create catering menu with pricing",
          plan_name: "Catering Service Launch",
          priority: 4,
          state_key: "todo",
          props: {
            type: "product",
            estimated_hours: 8,
            menu_items: 15
          }
        },
        {
          title: "Reach out to 50 local businesses for catering",
          plan_name: "Catering Service Launch",
          priority: 4,
          state_key: "todo",
          props: {
            type: "sales",
            estimated_hours: 25,
            target_companies: 50,
            pitch_type: "corporate_lunch"
          }
        }
      ],
      requirements: [
        {
          text: "All staff must be certified on new POS before go-live",
          type_key: "requirement.training",
          props: {
            staff_count: 10,
            certification: "required",
            blocking: true
          }
        },
        {
          text: "Food safety certifications required for catering",
          type_key: "requirement.compliance",
          props: {
            certification: "ServSafe",
            catering_specific: true
          }
        },
        {
          text: "Catering van and equipment budget: $8,000",
          type_key: "requirement.budget",
          props: {
            budget_allocation: 8000,
            items: ["catering_van", "chafing_dishes", "transport_containers"]
          }
        }
      ],
      metrics: [
        {
          name: "Food Waste Percentage",
          type_key: "metric.business.efficiency",
          unit: "percentage",
          props: {
            baseline: "TBD",
            target_reduction: 30,
            measurement_frequency: "weekly"
          }
        },
        {
          name: "Average Table Turnover Time",
          type_key: "metric.business.operations",
          unit: "minutes",
          props: {
            baseline: 90,
            target: 70,
            measurement_frequency: "daily"
          }
        },
        {
          name: "Catering Revenue",
          type_key: "metric.business.revenue",
          unit: "USD",
          props: {
            target_monthly: 5000,
            current: 0
          }
        },
        {
          name: "POS System Adoption Rate",
          type_key: "metric.business.training",
          unit: "percentage",
          props: {
            target: 100,
            staff_trained: 0,
            total_staff: 10
          }
        }
      ],
      milestones: [
        {
          title: "Food Waste Baseline Complete",
          due_at: "[current_date + 2 weeks]",
          type_key: "milestone.audit"
        },
        {
          title: "POS System Go-Live",
          due_at: "[current_date + 6 weeks]",
          type_key: "milestone.implementation",
          props: {
            critical: true,
            staff_trained: 10
          }
        },
        {
          title: "Catering Menu Finalized",
          due_at: "[current_date + 8 weeks]",
          type_key: "milestone.product"
        },
        {
          title: "First Catering Event Delivered",
          due_at: "[current_date + 10 weeks]",
          type_key: "milestone.launch"
        }
      ]
    })
    ```

### Expected Results:

- ✅ **onto_projects**: 1 operations improvement project
- ✅ **onto_goals**: 3 goals (waste reduction, turnover, catering revenue)
- ✅ **onto_plans**: 4 plans (waste, speed, POS training, catering)
- ✅ **onto_tasks**: 8 tasks (audit, systems, training, sales)
- ✅ **onto_requirements**: 3 requirements (POS training, food safety, budget)
- ✅ **onto_metrics**: 4 metrics (waste%, turnover time, catering revenue, POS adoption)
- ✅ **onto_milestones**: 4 milestones (baseline, go-live, menu, first event)
- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 3: Tracking Revenue and Customer Metrics - Workspace Mode

**Scenario**: Business owner monitoring key performance indicators

**Context Type**: `project` (already in workspace)
**Entity ID**: [existing project_id]

### User Input:

"Track our metrics: Month 1 - 15 customers, $3,200 revenue, CAC $45. Month 2 - 28 customers, $6,100 revenue, CAC $38. Month 3 - 42 customers, $8,900 revenue, CAC $32. We're trending toward our $10k goal! Also customer retention is 85% - better than expected."

### Expected Agent Behavior:

1. **Create Revenue Metric Points**:

    ```
    create_onto_metric_point({
      metric_id: "[monthly_revenue_metric_id]",
      value: 3200,
      recorded_at: "[month_1_end]",
      props: {
        month: 1,
        customers: 15,
        growth_rate: null
      }
    })

    create_onto_metric_point({
      metric_id: "[monthly_revenue_metric_id]",
      value: 6100,
      recorded_at: "[month_2_end]",
      props: {
        month: 2,
        customers: 28,
        growth_rate: 0.91
      }
    })

    create_onto_metric_point({
      metric_id: "[monthly_revenue_metric_id]",
      value: 8900,
      recorded_at: "[month_3_end]",
      props: {
        month: 3,
        customers: 42,
        growth_rate: 0.46
      }
    })
    ```

2. **Create CAC Metric Points**:

    ```
    create_onto_metric_point({
      metric_id: "[cac_metric_id]",
      value: 45,
      recorded_at: "[month_1_end]",
      props: {
        month: 1,
        new_customers: 15
      }
    })

    create_onto_metric_point({
      metric_id: "[cac_metric_id]",
      value: 38,
      recorded_at: "[month_2_end]",
      props: {
        month: 2,
        new_customers: 13,
        improvement: "15.6% reduction"
      }
    })

    create_onto_metric_point({
      metric_id: "[cac_metric_id]",
      value: 32,
      recorded_at: "[month_3_end]",
      props: {
        month: 3,
        new_customers: 14,
        improvement: "28.9% reduction from Month 1"
      }
    })
    ```

3. **Create Retention Metric**:

    ```
    create_onto_metric({
      project_id: "[current_project_id]",
      name: "Customer Retention Rate",
      type_key: "metric.business.retention",
      unit: "percentage",
      props: {
        target: 80,
        actual: 85
      }
    })

    create_onto_metric_point({
      metric_id: "[retention_metric_id]",
      value: 85,
      recorded_at: "[month_3_end]",
      props: {
        measurement_period: "3_months",
        exceeded_target: true
      }
    })
    ```

4. **Create Insights**:

    ```
    create_onto_insight({
      project_id: "[current_project_id]",
      title: "Revenue growth accelerating - on track for $10k goal",
      insight_type: "trend",
      confidence: 0.9,
      props: {
        metric: "monthly_revenue",
        trajectory: "Month 1: $3.2k → Month 2: $6.1k → Month 3: $8.9k",
        projection: "Month 4: ~$10.5k (exceeding goal)",
        analysis: "91% growth M1-M2, 46% growth M2-M3, compound monthly growth rate 64%"
      }
    })

    create_onto_insight({
      project_id: "[current_project_id]",
      title: "CAC decreasing - marketing efficiency improving",
      insight_type: "success",
      confidence: 0.85,
      props: {
        metric: "customer_acquisition_cost",
        trend: "$45 → $38 → $32 (29% reduction overall)",
        analysis: "Improving word-of-mouth and repeat purchase reducing acquisition costs"
      }
    })

    create_onto_insight({
      project_id: "[current_project_id]",
      title: "Customer retention 85% exceeds 80% target",
      insight_type: "success",
      confidence: 0.9,
      props: {
        metric: "retention_rate",
        value: 85,
        target: 80,
        variance: "+5%",
        analysis: "Product quality and customer service driving strong retention"
      }
    })
    ```

### Expected Results:

- ✅ **onto_metric_points**: 7 data points (3 revenue, 3 CAC, 1 retention)
- ✅ **onto_metrics**: 1 new metric (retention rate)
- ✅ **onto_insights**: 3 insights (revenue trajectory, CAC improvement, retention success)
- ✅ **Trend analysis**: Growth rates, projections calculated
- ✅ **Performance tracking**: Month-over-month comparison
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 4: Investor Pitch and Funding Round

**Scenario**: Business owner preparing for investor pitch

**Context Type**: `project`

### User Input:

"Preparing to pitch to angel investors for $100k seed funding. Need pitch deck, financial projections for 3 years, product demo, competitor analysis. Meeting with 5 investors next month. Offering 15% equity. Goal: secure $100k to scale production and hire 2 employees."

### Expected Agent Behavior:

1. **Create Funding Plan**:

    ```
    create_onto_plan({
      project_id: "[current_project_id]",
      name: "Seed Funding Round - $100k",
      type_key: "plan.business.fundraising",
      state_key: "active",
      props: {
        funding_target: 100000,
        equity_offered: 0.15,
        investor_type: "angel",
        use_of_funds: ["production_scaling", "hiring_2_employees", "marketing"]
      }
    })
    ```

2. **Create Pitch Preparation Tasks**:

    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Create investor pitch deck (15 slides)",
      priority: 5,
      state_key: "todo",
      plan_id: "[Seed Funding plan_id]",
      props: {
        type: "presentation",
        estimated_hours: 20,
        slides: 15,
        key_sections: ["problem", "solution", "market", "traction", "team", "financials", "ask"]
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Build 3-year financial projections model",
      priority: 5,
      state_key: "todo",
      props: {
        type: "financial",
        estimated_hours: 15,
        years: 3,
        projections: ["revenue", "expenses", "cash_flow", "break_even"]
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Prepare product demo video (3 minutes)",
      priority: 4,
      state_key: "todo",
      props: {
        type: "demo",
        estimated_hours: 10,
        duration: "3_minutes",
        format: "video"
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Conduct competitive analysis (10 competitors)",
      priority: 4,
      state_key: "todo",
      props: {
        type: "research",
        estimated_hours: 12,
        competitors: 10,
        analysis_criteria: ["pricing", "features", "market_share", "strengths_weaknesses"]
      }
    })

    create_onto_task({
      project_id: "[current_project_id]",
      title: "Schedule pitch meetings with 5 angel investors",
      priority: 5,
      state_key: "todo",
      props: {
        type: "outreach",
        estimated_hours: 8,
        investors: 5,
        pitch_duration: "30_minutes"
      }
    })
    ```

3. **Create Funding Documents**:

    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Angel Investor Pitch Deck",
      type_key: "document.business.pitch",
      state_key: "draft",
      props: {
        slides: 15,
        format: "PDF",
        audience: "angel_investors"
      }
    })

    create_onto_document({
      project_id: "[current_project_id]",
      title: "3-Year Financial Projections",
      type_key: "document.business.financial",
      state_key: "draft",
      props: {
        years: 3,
        models: ["P&L", "cash_flow", "balance_sheet"],
        assumptions_documented: true
      }
    })

    create_onto_document({
      project_id: "[current_project_id]",
      title: "Competitive Landscape Analysis",
      type_key: "document.business.research",
      state_key: "draft",
      props: {
        competitors_analyzed: 0,
        target: 10
      }
    })
    ```

4. **Create Funding Goal and Milestones**:

    ```
    create_onto_goal({
      project_id: "[current_project_id]",
      name: "Secure $100k seed funding",
      type_key: "goal.funding",
      props: {
        funding_target: 100000,
        equity_offered: 0.15,
        investor_count_target: 1
      }
    })

    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Pitch Materials Complete",
      due_at: "[current_date + 2 weeks]",
      type_key: "milestone.preparation",
      props: {
        deliverables: ["pitch_deck", "financials", "demo", "competitive_analysis"]
      }
    })

    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "All Investor Pitches Completed",
      due_at: "[current_date + 1 month]",
      type_key: "milestone.pitch",
      props: {
        investor_meetings: 5
      }
    })

    create_onto_milestone({
      project_id: "[current_date + 6 weeks]",
      title: "Funding Closed - $100k Secured",
      type_key: "milestone.funding",
      props: {
        target_amount: 100000,
        aspirational: true
      }
    })
    ```

5. **Create Funding Decision**:
    ```
    create_onto_decision({
      project_id: "[current_project_id]",
      title: "Fundraising Strategy: Angel investors at 15% equity",
      rationale: "Angel investors provide faster access to capital ($100k) without the extensive due diligence of VCs. 15% equity valuation at ~$667k post-money is fair given current traction ($8.9k MRR, 85% retention). Will use funds to scale production and hire critical team members.",
      decision_at: "[current_date]",
      props: {
        category: "fundraising",
        alternatives: ["bank_loan", "revenue_based_financing", "bootstrapping"],
        valuation: 666666,
        use_of_funds: {
          production_scaling: 50000,
          hiring: 35000,
          marketing: 15000
        }
      }
    })
    ```

### Expected Results:

- ✅ **onto_plans**: 1 new plan (Seed Funding Round)
- ✅ **onto_tasks**: 5 funding prep tasks (deck, financials, demo, competitive analysis, outreach)
- ✅ **onto_documents**: 3 investor documents (pitch deck, financials, competitive analysis)
- ✅ **onto_goals**: 1 funding goal ($100k)
- ✅ **onto_milestones**: 3 milestones (materials, pitches, funding closed)
- ✅ **onto_decisions**: 1 fundraising strategy decision
- ✅ **Funding tracking**: Target, equity, use of funds all documented

---

## Summary

This test suite validates:

1. ✅ **Product Launch**: E-commerce, supplier sourcing, compliance, marketing
2. ✅ **Restaurant Operations**: Efficiency improvements, service expansion
3. ✅ **Revenue Tracking**: MRR, CAC, retention, growth metrics over time
4. ✅ **Funding Rounds**: Investor pitches, financial projections, fundraising strategy
5. ✅ **Business Planning**: Goals, budgets, milestones, risk management
6. ✅ **Vendor Management**: Supplier selection, contracts, quality control
7. ✅ **Compliance**: FDA, food safety, business registrations
8. ✅ **Team Expansion**: Hiring plans, training, role assignments
9. ✅ **Metric Tracking**: Time-series business KPIs with insights
10. ✅ **Decision Records**: Strategic choices with alternatives and rationale

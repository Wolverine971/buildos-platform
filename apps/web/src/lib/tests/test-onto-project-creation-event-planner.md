<!-- apps/web/src/lib/tests/test-onto-project-creation-event-planner.md -->

# Ontology Project Creation Tests - Event Planner Persona

**Test Suite**: Ontology project creation with agentic chat
**Persona**: Event Planner / Event Coordinator
**Context Type**: `project_create` → `project` (after creation)
**Primary Template**: `event.conference`, `event.wedding`, `event.corporate`

## Test Prompt 1: Corporate Conference - Full Event Planning

**Scenario**: Event planner organizing a tech conference with 500 attendees

**Context Type**: `project_create`

### User Input:

"I'm planning a tech conference called 'DevConnect 2026' for 500 attendees. Three-day event at the Grand Convention Center, June 15-17. Need to coordinate: 20 speakers, 5 sponsor booths, catering for all meals, AV setup for 3 simultaneous tracks, registration system, and evening networking events. Budget: $150k."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="event",
      search="conference"
    )
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "DevConnect 2026 - Tech Conference",
        type_key: "event.conference",
        description: "Three-day technology conference with 500 attendees, 20 speakers, and 5 sponsor booths",
        props: {
          facets: {
            context: "commercial",
            scale: "large",
            stage: "planning"
          },
          event_details: {
            attendee_count: 500,
            duration_days: 3,
            venue: "Grand Convention Center",
            budget: 150000,
            currency: "USD"
          },
          event_dates: {
            start: "2026-06-15",
            end: "2026-06-17"
          }
        },
        start_at: "[current_date]",
        end_at: "2026-06-17T18:00:00Z"
      },
      goals: [
        {
          name: "Successfully host 500 attendees over 3 days",
          type_key: "goal.outcome",
          props: {
            target: 500,
            measurement: "attendees_registered"
          }
        },
        {
          name: "Secure 20 speakers and 5 sponsors",
          type_key: "goal.outcome",
          props: {
            speakers_target: 20,
            sponsors_target: 5
          }
        },
        {
          name: "Stay within $150k budget",
          type_key: "goal.metric",
          props: {
            budget: 150000,
            measurement: "total_expenses"
          }
        }
      ],
      plans: [
        {
          name: "Venue & Logistics",
          type_key: "plan.event.venue",
          state_key: "active"
        },
        {
          name: "Speaker & Content Programming",
          type_key: "plan.event.programming",
          state_key: "active"
        },
        {
          name: "Sponsor & Partner Management",
          type_key: "plan.event.sponsors",
          state_key: "active"
        },
        {
          name: "Registration & Attendee Experience",
          type_key: "plan.event.attendees",
          state_key: "draft"
        },
        {
          name: "Catering & Hospitality",
          type_key: "plan.event.catering",
          state_key: "draft"
        },
        {
          name: "Marketing & Promotion",
          type_key: "plan.event.marketing",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Finalize venue contract with Grand Convention Center",
          plan_name: "Venue & Logistics",
          priority: 5,
          state_key: "todo",
          props: {
            type: "contract",
            estimated_hours: 4,
            deadline: "[current_date + 2 weeks]"
          }
        },
        {
          title: "Book AV company for 3 simultaneous tracks",
          plan_name: "Venue & Logistics",
          priority: 5,
          state_key: "todo",
          props: {
            type: "vendor",
            estimated_hours: 3,
            tracks: 3,
            equipment: ["projectors", "mics", "recording"]
          }
        },
        {
          title: "Recruit and confirm 20 speakers",
          plan_name: "Speaker & Content Programming",
          priority: 5,
          state_key: "todo",
          props: {
            type: "outreach",
            estimated_hours: 20,
            target: 20,
            current: 0
          }
        },
        {
          title: "Secure 5 sponsor commitments",
          plan_name: "Sponsor & Partner Management",
          priority: 5,
          state_key: "todo",
          props: {
            type: "sales",
            estimated_hours: 30,
            target_revenue: 50000
          }
        },
        {
          title: "Set up online registration system",
          plan_name: "Registration & Attendee Experience",
          priority: 4,
          state_key: "todo",
          props: {
            type: "technical",
            estimated_hours: 8,
            platform: "Eventbrite"
          }
        },
        {
          title: "Select catering vendor for 3-day event",
          plan_name: "Catering & Hospitality",
          priority: 4,
          state_key: "todo",
          props: {
            type: "vendor",
            estimated_hours: 6,
            meals_count: 9,
            dietary_restrictions: true
          }
        }
      ],
      requirements: [
        {
          text: "Venue must accommodate 500 people with 3 simultaneous breakout rooms",
          type_key: "requirement.venue",
          props: {
            capacity: 500,
            rooms_needed: 4,
            room_types: ["main_hall", "breakout_1", "breakout_2", "breakout_3"]
          }
        },
        {
          text: "All speakers must be confirmed by April 1st for marketing materials",
          type_key: "requirement.deadline",
          props: {
            deadline: "2026-04-01T00:00:00Z",
            critical: true
          }
        },
        {
          text: "Catering must support vegetarian, vegan, gluten-free options",
          type_key: "requirement.catering",
          props: {
            dietary_options: ["vegetarian", "vegan", "gluten_free", "halal"]
          }
        },
        {
          text: "Budget allocation: 40% venue, 25% catering, 20% AV, 15% marketing",
          type_key: "requirement.budget",
          props: {
            allocations: {
              venue: 60000,
              catering: 37500,
              av: 30000,
              marketing: 22500
            }
          }
        }
      ],
      documents: [
        {
          title: "Event Master Timeline",
          type_key: "document.event.timeline",
          state_key: "draft",
          props: {
            duration_days: 3,
            tracks: 3
          }
        },
        {
          title: "Vendor Contact List",
          type_key: "document.event.vendors",
          state_key: "draft"
        },
        {
          title: "Speaker Information Pack",
          type_key: "document.event.speakers",
          state_key: "planned"
        },
        {
          title: "Attendee Welcome Packet",
          type_key: "document.event.attendee",
          state_key: "planned"
        }
      ],
      outputs: [
        {
          name: "Conference Program Schedule",
          type_key: "output.event.program",
          state_key: "draft",
          props: {
            sessions_count: 30,
            tracks: 3
          }
        },
        {
          name: "Sponsor Booth Map",
          type_key: "output.event.floorplan",
          state_key: "planned",
          props: {
            booths: 5
          }
        }
      ],
      milestones: [
        {
          title: "Venue Contract Signed",
          due_at: "[current_date + 2 weeks]",
          type_key: "milestone.contract",
          props: {
            critical: true
          }
        },
        {
          title: "All Speakers Confirmed",
          due_at: "2026-04-01T00:00:00Z",
          type_key: "milestone.speakers",
          props: {
            speakers_count: 20
          }
        },
        {
          title: "Registration Opens",
          due_at: "2026-04-15T00:00:00Z",
          type_key: "milestone.registration",
          props: {
            ticket_types: ["early_bird", "regular", "vip"]
          }
        },
        {
          title: "Early Bird Registration Closes",
          due_at: "2026-05-15T23:59:59Z",
          type_key: "milestone.registration"
        },
        {
          title: "Event Day 1",
          due_at: "2026-06-15T08:00:00Z",
          type_key: "milestone.event_start"
        },
        {
          title: "Event Wrap-Up & Tear Down",
          due_at: "2026-06-17T18:00:00Z",
          type_key: "milestone.event_end"
        }
      ],
      actors: [
        {
          name: "Event Manager",
          actor_type: "role",
          props: {
            responsibilities: ["overall_coordination", "vendor_management"]
          }
        },
        {
          name: "Registration Coordinator",
          actor_type: "role",
          props: {
            responsibilities: ["attendee_management", "ticketing"]
          }
        },
        {
          name: "AV Technician (Vendor)",
          actor_type: "vendor",
          props: {
            company: "Pro AV Solutions"
          }
        }
      ],
      events: [
        {
          title: "DevConnect 2026 - Day 1",
          start_at: "2026-06-15T08:00:00Z",
          end_at: "2026-06-15T18:00:00Z",
          event_type: "conference_day",
          props: {
            sessions: 10,
            keynote: true
          }
        },
        {
          title: "DevConnect 2026 - Day 2",
          start_at: "2026-06-16T08:00:00Z",
          end_at: "2026-06-16T18:00:00Z",
          event_type: "conference_day"
        },
        {
          title: "DevConnect 2026 - Day 3",
          start_at: "2026-06-17T08:00:00Z",
          end_at: "2026-06-17T16:00:00Z",
          event_type: "conference_day",
          props: {
            closing_remarks: true
          }
        },
        {
          title: "Networking Reception - Evening Day 1",
          start_at: "2026-06-15T18:30:00Z",
          end_at: "2026-06-15T21:00:00Z",
          event_type: "networking",
          props: {
            sponsored: true,
            open_bar: true
          }
        }
      ],
      metrics: [
        {
          name: "Registration Count",
          type_key: "metric.event.attendance",
          unit: "attendees",
          props: {
            target: 500,
            current: 0
          }
        },
        {
          name: "Budget Tracking",
          type_key: "metric.event.budget",
          unit: "USD",
          props: {
            budget: 150000,
            spent: 0
          }
        },
        {
          name: "Speaker Confirmations",
          type_key: "metric.event.speakers",
          unit: "count",
          props: {
            target: 20,
            confirmed: 0
          }
        }
      ],
      risks: [
        {
          title: "Venue availability - backup location needed",
          impact: "critical",
          probability: 0.2,
          state_key: "identified",
          props: {
            category: "venue",
            mitigation: "Secure backup venue contract with 60-day notice"
          }
        },
        {
          title: "Low speaker response rate",
          impact: "high",
          probability: 0.4,
          state_key: "identified",
          props: {
            category: "programming",
            mitigation: "Start outreach 6 months early, offer speaker incentives"
          }
        },
        {
          title: "Budget overrun on catering",
          impact: "medium",
          probability: 0.5,
          state_key: "identified",
          props: {
            category: "budget",
            mitigation: "Lock in per-person pricing early, 10% contingency"
          }
        }
      ]
    })
    ```

### Expected Results:

**Onto Tables Created**:

- ✅ **onto_projects**: 1 project
    - name: "DevConnect 2026 - Tech Conference"
    - type_key: "event.conference"
    - facet_context: "commercial"
    - facet_scale: "large"
    - facet_stage: "planning"
    - props includes event_details (500 attendees, $150k budget)

- ✅ **onto_goals**: 3 goals
    - 500 attendees (outcome)
    - 20 speakers + 5 sponsors (outcome)
    - Stay within budget (metric)

- ✅ **onto_plans**: 6 plans
    - Venue & Logistics (active)
    - Speaker & Content Programming (active)
    - Sponsor & Partner Management (active)
    - Registration & Attendee Experience (draft)
    - Catering & Hospitality (draft)
    - Marketing & Promotion (draft)

- ✅ **onto_tasks**: 6 tasks
    - Venue contract (contract type)
    - AV booking (vendor type)
    - Speaker recruitment (outreach, target: 20)
    - Sponsor sales (sales, $50k target)
    - Registration system (technical)
    - Catering selection (vendor, dietary restrictions)

- ✅ **onto_requirements**: 4 requirements
    - Venue capacity (500 people, 4 rooms)
    - Speaker deadline (April 1st, critical)
    - Catering dietary options
    - Budget allocation breakdown

- ✅ **onto_documents**: 4 documents
    - Event Master Timeline
    - Vendor Contact List
    - Speaker Information Pack
    - Attendee Welcome Packet

- ✅ **onto_outputs**: 2 deliverables
    - Conference Program Schedule (30 sessions, 3 tracks)
    - Sponsor Booth Map (5 booths)

- ✅ **onto_milestones**: 6 milestones
    - Venue contract (2 weeks)
    - Speakers confirmed (April 1)
    - Registration opens (April 15)
    - Early bird ends (May 15)
    - Event starts (June 15)
    - Event ends (June 17)

- ✅ **onto_actors**: 3 roles/vendors
    - Event Manager (role)
    - Registration Coordinator (role)
    - AV Technician (vendor)

- ✅ **onto_events**: 4 calendar events
    - Day 1 (8am-6pm, keynote)
    - Day 2 (8am-6pm)
    - Day 3 (8am-4pm, closing)
    - Networking reception (6:30pm-9pm)

- ✅ **onto_metrics**: 3 metrics
    - Registration count (target: 500)
    - Budget tracking ($150k)
    - Speaker confirmations (target: 20)

- ✅ **onto_risks**: 3 risks
    - Venue availability (critical, 0.2 probability)
    - Low speaker response (high, 0.4 probability)
    - Budget overrun (medium, 0.5 probability)

- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 2: Wedding Planning - Personal Event

**Scenario**: Event planner organizing intimate wedding

**Context Type**: `project_create`

### User Input:

"Planning wedding for clients Emma & Jake. 150 guests, outdoor garden ceremony at Rosewood Estate on September 20th. Reception in estate ballroom. Need: photographer, videographer, florist, DJ, caterer for sit-down dinner, wedding cake, invitations. Ceremony at 4pm, reception until 11pm. Budget $50k."

### Expected Agent Behavior:

1. **Template Search**:

    ```
    list_onto_templates(
      scope="project",
      realm="event",
      search="wedding"
    )
    ```

2. **Project Creation**:
    ```
    create_onto_project({
      project: {
        name: "Emma & Jake's Wedding - Rosewood Estate",
        type_key: "event.wedding",
        description: "Intimate outdoor garden wedding with 150 guests, ceremony and ballroom reception",
        props: {
          facets: {
            context: "personal",
            scale: "medium",
            stage: "planning"
          },
          wedding_details: {
            couple_names: ["Emma", "Jake"],
            guest_count: 150,
            venue: "Rosewood Estate",
            budget: 50000,
            ceremony_type: "outdoor_garden"
          },
          event_dates: {
            date: "2026-09-20",
            ceremony_time: "16:00",
            reception_end: "23:00"
          }
        },
        start_at: "[current_date]",
        end_at: "2026-09-20T23:00:00Z"
      },
      goals: [
        {
          name: "Create perfect wedding day for Emma & Jake",
          type_key: "goal.outcome"
        },
        {
          name: "Execute flawless ceremony and reception",
          type_key: "goal.quality",
          props: {
            measurement: "client_satisfaction"
          }
        },
        {
          name: "Stay within $50k budget",
          type_key: "goal.metric",
          props: {
            budget: 50000
          }
        }
      ],
      plans: [
        {
          name: "Ceremony Planning",
          type_key: "plan.wedding.ceremony",
          state_key: "active"
        },
        {
          name: "Reception & Catering",
          type_key: "plan.wedding.reception",
          state_key: "active"
        },
        {
          name: "Vendor Management",
          type_key: "plan.wedding.vendors",
          state_key: "active"
        },
        {
          name: "Decor & Floral Design",
          type_key: "plan.wedding.decor",
          state_key: "draft"
        },
        {
          name: "Guest Experience",
          type_key: "plan.wedding.guests",
          state_key: "draft"
        }
      ],
      tasks: [
        {
          title: "Book photographer for ceremony and reception",
          plan_name: "Vendor Management",
          priority: 5,
          state_key: "todo",
          props: {
            type: "vendor",
            estimated_hours: 3,
            coverage_hours: 8
          }
        },
        {
          title: "Select florist for ceremony arch and centerpieces",
          plan_name: "Decor & Floral Design",
          priority: 5,
          state_key: "todo",
          props: {
            type: "vendor",
            estimated_hours: 4,
            arrangements_needed: ["ceremony_arch", "bridal_bouquet", "centerpieces", "boutonnières"]
          }
        },
        {
          title: "Arrange catering for 150-person sit-down dinner",
          plan_name: "Reception & Catering",
          priority: 5,
          state_key: "todo",
          props: {
            type: "vendor",
            estimated_hours: 6,
            guest_count: 150,
            service_style: "plated_dinner",
            courses: 3
          }
        },
        {
          title: "Create ceremony timeline and processional order",
          plan_name: "Ceremony Planning",
          priority: 4,
          state_key: "todo",
          props: {
            type: "planning",
            estimated_hours: 3
          }
        },
        {
          title: "Design and order wedding invitations",
          plan_name: "Guest Experience",
          priority: 4,
          state_key: "todo",
          props: {
            type: "design",
            estimated_hours: 5,
            quantity: 150,
            send_date: "[current_date + 3 months]"
          }
        }
      ],
      requirements: [
        {
          text: "Outdoor ceremony requires weather backup plan",
          type_key: "requirement.contingency",
          props: {
            primary_location: "garden",
            backup_location: "estate_ballroom",
            weather_threshold: "rain or extreme heat"
          }
        },
        {
          text: "Photography must include getting ready, ceremony, and reception",
          type_key: "requirement.vendor",
          props: {
            service: "photography",
            coverage: ["getting_ready", "ceremony", "reception", "send_off"],
            duration_hours: 8
          }
        },
        {
          text: "Invitations must be mailed 8 weeks before wedding",
          type_key: "requirement.deadline",
          props: {
            item: "invitations",
            deadline: "[wedding_date - 8 weeks]"
          }
        }
      ],
      milestones: [
        {
          title: "All Major Vendors Booked",
          due_at: "[current_date + 1 month]",
          type_key: "milestone.vendors"
        },
        {
          title: "Invitations Mailed",
          due_at: "[wedding_date - 8 weeks]",
          type_key: "milestone.invitations",
          props: {
            quantity: 150
          }
        },
        {
          title: "Final Guest Count Confirmed",
          due_at: "[wedding_date - 2 weeks]",
          type_key: "milestone.guests"
        },
        {
          title: "Rehearsal Dinner",
          due_at: "2026-09-19T18:00:00Z",
          type_key: "milestone.rehearsal"
        },
        {
          title: "Wedding Day",
          due_at: "2026-09-20T16:00:00Z",
          type_key: "milestone.wedding_day"
        }
      ],
      events: [
        {
          title: "Ceremony Setup",
          start_at: "2026-09-20T12:00:00Z",
          end_at: "2026-09-20T15:30:00Z",
          event_type: "setup"
        },
        {
          title: "Wedding Ceremony",
          start_at: "2026-09-20T16:00:00Z",
          end_at: "2026-09-20T16:45:00Z",
          event_type: "ceremony",
          props: {
            location: "Rosewood Estate Garden"
          }
        },
        {
          title: "Cocktail Hour",
          start_at: "2026-09-20T17:00:00Z",
          end_at: "2026-09-20T18:00:00Z",
          event_type: "cocktail_hour"
        },
        {
          title: "Reception & Dinner",
          start_at: "2026-09-20T18:00:00Z",
          end_at: "2026-09-20T23:00:00Z",
          event_type: "reception",
          props: {
            location: "Estate Ballroom",
            activities: ["first_dance", "toasts", "cake_cutting", "dancing"]
          }
        }
      ],
      metrics: [
        {
          name: "Guest RSVPs",
          type_key: "metric.event.rsvp",
          unit: "count",
          props: {
            invited: 150,
            confirmed: 0
          }
        },
        {
          name: "Wedding Budget",
          type_key: "metric.event.budget",
          unit: "USD",
          props: {
            budget: 50000,
            allocated: 0,
            spent: 0
          }
        }
      ]
    })
    ```

### Expected Results:

- ✅ **onto_projects**: 1 wedding project
- ✅ **onto_goals**: 3 goals (perfect day, quality execution, budget)
- ✅ **onto_plans**: 5 plans (ceremony, reception, vendors, decor, guests)
- ✅ **onto_tasks**: 5 tasks (vendors and planning)
- ✅ **onto_requirements**: 3 requirements (weather backup, photography, invitations)
- ✅ **onto_milestones**: 5 milestones (vendors, invitations, guest count, rehearsal, wedding day)
- ✅ **onto_events**: 4 timeline events (setup, ceremony, cocktail, reception)
- ✅ **onto_metrics**: 2 metrics (RSVPs, budget)
- ✅ **Context shift**: `project_create` → `project`

---

## Test Prompt 3: Update Event Status - Workspace Mode

**Scenario**: Event planner updating task progress

**Context Type**: `project` (already in workspace)
**Entity ID**: [existing project_id]

### User Input:

"Photographer booked - Sarah Chen Photography, $4,500 for 8 hours. Florist still needs follow-up. Caterer gave quote: $65/person = $9,750 total. That's within our catering budget allocation."

### Expected Agent Behavior:

1. **Update Photographer Task**:

    ```
    search_onto_tasks({
      search: "photographer",
      project_id: "[current_project_id]"
    })

    update_onto_task({
      task_id: "[photographer_task_id]",
      state_key: "done",
      props: {
        vendor_name: "Sarah Chen Photography",
        cost: 4500,
        coverage_hours: 8,
        booking_confirmed: true,
        confirmation_date: "[current_date]"
      }
    })
    ```

2. **Update Florist Task**:

    ```
    update_onto_task({
      task_id: "[florist_task_id]",
      state_key: "in_progress",
      props: {
        status_note: "Needs follow-up call",
        next_action: "Schedule consultation"
      }
    })
    ```

3. **Update Catering Task**:

    ```
    update_onto_task({
      task_id: "[catering_task_id]",
      state_key: "in_progress",
      props: {
        quote_received: true,
        cost_per_person: 65,
        total_cost: 9750,
        guest_count: 150,
        within_budget: true,
        next_action: "Review menu options and confirm"
      }
    })
    ```

4. **Update Budget Metric**:

    ```
    create_onto_metric_point({
      metric_id: "[budget_metric_id]",
      value: 14250,
      recorded_at: "[current_date]",
      props: {
        breakdown: {
          photographer: 4500,
          caterer_estimate: 9750
        },
        remaining_budget: 35750
      }
    })
    ```

5. **Create Decision Record**:
    ```
    create_onto_decision({
      project_id: "[current_project_id]",
      title: "Photographer Selected: Sarah Chen Photography",
      rationale: "Excellent portfolio of outdoor weddings, within budget at $4,500 for 8-hour coverage",
      decision_at: "[current_date]",
      props: {
        category: "vendor_selection",
        decision_maker: "event_planner",
        impact: "medium"
      }
    })
    ```

### Expected Results:

- ✅ **onto_tasks**: 1 completed (photographer), 2 updated (florist, catering)
- ✅ **onto_metric_points**: 1 budget data point ($14,250 allocated)
- ✅ **onto_decisions**: 1 vendor selection decision
- ✅ **Task tracking**: Costs, vendor names, next actions
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 4: Event Day Timeline Management

**Scenario**: Creating detailed day-of timeline

**Context Type**: `project`

### User Input:

"Create detailed wedding day timeline: 12pm setup starts, 2pm bridal party arrives for photos, 3:30pm guests arrive, 4pm ceremony, 4:45pm cocktail hour, 6pm reception entrance, 6:15pm first dance, 6:30pm dinner service, 8pm toasts, 9pm cake cutting, 11pm send-off."

### Expected Agent Behavior:

1. **Create Timeline Events**:

    ```
    create_onto_event({
      project_id: "[current_project_id]",
      title: "Vendor Setup Begins",
      start_at: "2026-09-20T12:00:00Z",
      end_at: "2026-09-20T15:30:00Z",
      event_type: "setup",
      props: {
        vendors: ["florist", "caterer", "av_company"],
        location: "Rosewood Estate"
      }
    })

    create_onto_event({
      project_id: "[current_project_id]",
      title: "Bridal Party Arrives - Pre-Ceremony Photos",
      start_at: "2026-09-20T14:00:00Z",
      end_at: "2026-09-20T15:45:00Z",
      event_type: "photography",
      props: {
        participants: ["bride", "groom", "bridesmaids", "groomsmen"],
        photographer: "Sarah Chen Photography"
      }
    })

    create_onto_event({
      project_id: "[current_project_id]",
      title: "Guest Arrival",
      start_at: "2026-09-20T15:30:00Z",
      end_at: "2026-09-20T16:00:00Z",
      event_type: "arrival"
    })

    create_onto_event({
      project_id: "[current_project_id]",
      title: "Wedding Ceremony",
      start_at: "2026-09-20T16:00:00Z",
      end_at: "2026-09-20T16:45:00Z",
      event_type: "ceremony",
      props: {
        location: "Garden",
        processional_time: "16:00",
        vows_time: "16:20",
        recessional_time: "16:40"
      }
    })

    create_onto_event({
      project_id: "[current_project_id]",
      title: "First Dance",
      start_at: "2026-09-20T18:15:00Z",
      end_at: "2026-09-20T18:25:00Z",
      event_type: "reception_activity",
      props: {
        activity: "first_dance",
        song: "[to be determined]"
      }
    })

    create_onto_event({
      project_id: "[current_project_id]",
      title: "Dinner Service",
      start_at: "2026-09-20T18:30:00Z",
      end_at: "2026-09-20T20:00:00Z",
      event_type: "dining",
      props: {
        service_style: "plated",
        courses: 3
      }
    })

    create_onto_event({
      project_id: "[current_project_id]",
      title: "Toasts",
      start_at: "2026-09-20T20:00:00Z",
      end_at: "2026-09-20T20:30:00Z",
      event_type: "reception_activity",
      props: {
        speakers: ["best_man", "maid_of_honor", "father_of_bride"]
      }
    })

    create_onto_event({
      project_id: "[current_project_id]",
      title: "Cake Cutting",
      start_at: "2026-09-20T21:00:00Z",
      end_at: "2026-09-20T21:15:00Z",
      event_type: "reception_activity"
    })

    create_onto_event({
      project_id: "[current_project_id]",
      title: "Grand Exit / Send-Off",
      start_at: "2026-09-20T23:00:00Z",
      end_at: "2026-09-20T23:15:00Z",
      event_type: "sendoff",
      props: {
        sendoff_type: "sparkler_exit"
      }
    })
    ```

2. **Create Timeline Document**:
    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Wedding Day Timeline - Master Schedule",
      type_key: "document.event.timeline",
      state_key: "in_progress",
      props: {
        event_count: 9,
        start_time: "12:00",
        end_time: "23:15",
        distribution_list: ["bride", "groom", "vendors", "wedding_party"]
      }
    })
    ```

### Expected Results:

- ✅ **onto_events**: 9 timeline events created
- ✅ **onto_documents**: 1 master timeline document
- ✅ **Event sequencing**: Chronological order maintained
- ✅ **Event details**: Locations, participants, activities tracked
- ✅ **Context maintained**: Still in project workspace

---

## Test Prompt 5: Vendor Management and Contracts

**Scenario**: Tracking vendor contracts and payments

**Context Type**: `project`

### User Input:

"Need to track vendor contracts. Venue requires 50% deposit ($5k) due 90 days before event, final payment 30 days before. Photographer needs 30% deposit ($1,350) at booking, balance on wedding day. Create payment schedule milestones."

### Expected Agent Behavior:

1. **Create Payment Milestones**:

    ```
    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Venue Deposit Due (50% - $5,000)",
      due_at: "[wedding_date - 90 days]",
      type_key: "milestone.payment",
      props: {
        vendor: "Rosewood Estate",
        amount: 5000,
        percentage: 50,
        payment_type: "deposit"
      }
    })

    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Venue Final Payment Due ($5,000)",
      due_at: "[wedding_date - 30 days]",
      type_key: "milestone.payment",
      props: {
        vendor: "Rosewood Estate",
        amount: 5000,
        percentage: 50,
        payment_type: "final"
      }
    })

    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Photographer Deposit Due (30% - $1,350)",
      due_at: "[current_date + 7 days]",
      type_key: "milestone.payment",
      props: {
        vendor: "Sarah Chen Photography",
        amount: 1350,
        percentage: 30,
        payment_type: "deposit"
      }
    })

    create_onto_milestone({
      project_id: "[current_project_id]",
      title: "Photographer Final Payment Due ($3,150)",
      due_at: "2026-09-20T00:00:00Z",
      type_key: "milestone.payment",
      props: {
        vendor: "Sarah Chen Photography",
        amount: 3150,
        percentage: 70,
        payment_type: "final",
        due_on_event_day: true
      }
    })
    ```

2. **Create Vendor Tracking Document**:

    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Vendor Contracts & Payment Schedule",
      type_key: "document.event.contracts",
      state_key: "active",
      props: {
        vendors: [
          {
            name: "Rosewood Estate",
            total_cost: 10000,
            deposit: 5000,
            deposit_due: "[wedding_date - 90 days]",
            final_payment: 5000,
            final_due: "[wedding_date - 30 days]"
          },
          {
            name: "Sarah Chen Photography",
            total_cost: 4500,
            deposit: 1350,
            deposit_due: "[current_date + 7 days]",
            final_payment: 3150,
            final_due: "2026-09-20"
          }
        ],
        total_contracted: 14500
      }
    })
    ```

3. **Create Payment Tasks**:
    ```
    create_onto_task({
      project_id: "[current_project_id]",
      title: "Process photographer deposit payment ($1,350)",
      priority: 5,
      state_key: "todo",
      plan_id: "[Vendor Management plan_id]",
      props: {
        type: "payment",
        amount: 1350,
        vendor: "Sarah Chen Photography",
        payment_method: "check",
        due_date: "[current_date + 7 days]"
      }
    })
    ```

### Expected Results:

- ✅ **onto_milestones**: 4 payment milestones (2 venue, 2 photographer)
- ✅ **onto_documents**: 1 contracts/payment tracking document
- ✅ **onto_tasks**: 1 immediate payment task
- ✅ **Payment tracking**: Amounts, percentages, due dates
- ✅ **Vendor details**: Complete payment schedules

---

## Test Prompt 6: Post-Event Analysis

**Scenario**: Event completed, tracking outcomes and insights

**Context Type**: `project`

### User Input:

"Wedding was a success! Final guest count: 142 (95% attendance). Total budget spent: $48,200 - came in under budget. Client satisfaction: 5/5 stars. Photographer delivered 850 photos. Only issue: ceremony started 15 minutes late due to traffic. Create post-event summary."

### Expected Agent Behavior:

1. **Update Final Metrics**:

    ```
    create_onto_metric_point({
      metric_id: "[rsvp_metric_id]",
      value: 142,
      recorded_at: "[wedding_date]",
      props: {
        invited: 150,
        attendance_rate: 0.95,
        no_shows: 8
      }
    })

    create_onto_metric_point({
      metric_id: "[budget_metric_id]",
      value: 48200,
      recorded_at: "[wedding_date]",
      props: {
        budget: 50000,
        under_budget: 1800,
        variance_percentage: -3.6
      }
    })

    create_onto_metric({
      project_id: "[current_project_id]",
      name: "Client Satisfaction",
      type_key: "metric.event.satisfaction",
      unit: "stars",
      props: {
        rating: 5,
        max_rating: 5
      }
    })

    create_onto_metric_point({
      metric_id: "[satisfaction_metric_id]",
      value: 5,
      recorded_at: "[wedding_date + 1 day]"
    })
    ```

2. **Create Insights**:

    ```
    create_onto_insight({
      project_id: "[current_project_id]",
      title: "High attendance rate indicates effective communication and guest engagement",
      insight_type: "success",
      confidence: 0.95,
      props: {
        metric: "attendance_rate",
        value: 0.95,
        analysis: "95% attendance exceeds typical wedding rate of 75-85%"
      }
    })

    create_onto_insight({
      project_id: "[current_project_id]",
      title: "Under-budget execution demonstrates effective vendor negotiation",
      insight_type: "success",
      confidence: 0.9,
      props: {
        metric: "budget_variance",
        value: -3.6,
        savings: 1800,
        analysis: "Came in 3.6% under budget while maintaining quality"
      }
    })
    ```

3. **Create Risk/Issue Record**:

    ```
    create_onto_risk({
      project_id: "[current_project_id]",
      title: "Ceremony delay - guest traffic issues",
      impact: "low",
      probability: 1.0,
      state_key: "occurred",
      props: {
        category: "logistics",
        actual_impact: "15 minute delay",
        resolution: "Started ceremony late, adjusted timeline",
        lesson_learned: "Provide detailed directions and traffic updates to guests"
      }
    })
    ```

4. **Create Post-Event Document**:

    ```
    create_onto_document({
      project_id: "[current_project_id]",
      title: "Post-Event Summary - Emma & Jake's Wedding",
      type_key: "document.event.summary",
      state_key: "completed",
      props: {
        event_date: "2026-09-20",
        final_guest_count: 142,
        budget_spent: 48200,
        client_rating: 5,
        deliverables: {
          photos: 850,
          video: "pending"
        },
        issues: ["15_min_ceremony_delay"],
        successes: ["high_attendance", "under_budget", "perfect_weather"]
      }
    })
    ```

5. **Update Project Status**:
    ```
    update_onto_project({
      project_id: "[current_project_id]",
      state_key: "completed",
      props: {
        completion_date: "2026-09-20",
        final_status: "success",
        client_satisfaction: 5
      }
    })
    ```

### Expected Results:

- ✅ **onto_metric_points**: 3 final data points (attendance, budget, satisfaction)
- ✅ **onto_metrics**: 1 new metric (client satisfaction)
- ✅ **onto_insights**: 2 success insights (attendance, budget)
- ✅ **onto_risks**: 1 occurred risk with lesson learned
- ✅ **onto_documents**: 1 post-event summary
- ✅ **onto_projects**: Project marked as completed
- ✅ **Outcome tracking**: Complete post-event analysis

---

## Edge Cases

### Edge Case 1: Multi-Day Conference with Complex Schedule

**Input**: "Three-day conference with 30 breakout sessions, 5 keynotes, 3 workshops running simultaneously, meal breaks, and networking events. Need session scheduling tool."

**Expected Behavior**:

- Creates 30+ onto_events for all sessions
- Creates plans for each day
- Tracks speaker assignments via onto_actors
- Creates session conflict detection via onto_insights
- Tracks attendance metrics per session

### Edge Case 2: Hybrid Event (In-Person + Virtual)

**Input**: "Conference has 500 in-person attendees and 2000 virtual attendees. Need separate registration, streaming setup, virtual networking rooms."

**Expected Behavior**:

- Creates separate metrics for in-person vs virtual
- Creates tasks for streaming infrastructure
- Creates requirements for A/V setup
- Tracks two attendance pools
- Creates virtual event specific milestones

### Edge Case 3: Event Cancellation/Postponement

**Input**: "Wedding postponed from June to September due to venue conflict. Need to update all vendor contracts and notify guests."

**Expected Behavior**:

- Updates all onto_events with new dates
- Creates tasks for vendor rescheduling
- Creates communication plan
- Updates milestones
- Creates risk record for cancellation fees

---

## Summary

This test suite validates:

1. ✅ **Conference Planning**: Large-scale events with speakers, sponsors, attendees
2. ✅ **Wedding Planning**: Personal events with vendors, timeline, budget
3. ✅ **Vendor Management**: Contracts, payments, deliverables tracking
4. ✅ **Timeline Management**: Detailed event day schedules
5. ✅ **Budget Tracking**: Real-time expense monitoring
6. ✅ **Guest Management**: RSVPs, attendance, experience
7. ✅ **Post-Event Analysis**: Metrics, insights, lessons learned
8. ✅ **Risk Management**: Contingency planning, issue resolution
9. ✅ **Multi-Stakeholder**: Actors, roles, vendors, participants
10. ✅ **Edge Cases**: Complex schedules, hybrid events, changes

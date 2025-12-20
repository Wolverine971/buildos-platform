-- supabase/migrations/20251220_seed_washington_example_project.sql
-- ============================================
-- George Washington Revolutionary War Example Project
-- DEEPLY NESTED ontology graph demonstration
-- ============================================
--
-- DESIGN PRINCIPLE: This graph is deeply nested.
-- - Goals connect to Project
-- - Milestones connect to Goals (not directly to Project)
-- - Plans connect to Milestones
-- - Sub-Plans connect to Plans
-- - Tasks connect to Plans/Sub-Plans/Milestones
-- - Sub-Milestones connect to Plans or Milestones
-- - Decisions/Risks connect to Milestones
-- - Documents connect to Milestones
--
-- All relationships use onto_edges for graph traversal

-- Add is_public column to onto_projects if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_projects' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE onto_projects ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
    CREATE INDEX idx_onto_projects_public ON onto_projects(is_public) WHERE is_public = TRUE;
  END IF;
END$$;

-- Add project_id column to onto_edges if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_edges' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE onto_edges ADD COLUMN project_id UUID REFERENCES onto_projects(id) ON DELETE CASCADE;
    CREATE INDEX idx_onto_edges_project ON onto_edges(project_id);
  END IF;
END$$;

-- Create Historical Examples actor
INSERT INTO onto_actors (id, kind, name, email, metadata)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'agent',
  'Historical Examples',
  'examples@buildos.ai',
  '{"description": "System actor for historical example projects demonstrating BuildOS ontology"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MAIN PROJECT
-- ============================================

INSERT INTO onto_projects (
  id, org_id, name, description, type_key,
  state_key, props, start_at, end_at, is_public, created_by
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  NULL,
  'Operation American Independence',
  'A comprehensive military and political campaign to secure American independence from Great Britain. This deeply nested ontology project demonstrates how BuildOS organizes complex multi-year initiatives with interconnected goals, milestones, plans, tasks, decisions, and risks.',
  'project.military.campaign',
  'completed',
  '{
    "facets": {"context": "nonprofit", "scale": "epic", "stage": "complete"},
    "commander": "George Washington",
    "theater": "North American Colonies",
    "opposing_force": "British Empire",
    "allies": ["France", "Spain", "Netherlands"],
    "outcome": "American Independence achieved",
    "duration_years": 8,
    "graph_depth": 6,
    "total_nodes": 100
  }'::jsonb,
  '1773-12-16'::timestamptz,
  '1783-12-23'::timestamptz,
  TRUE,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_public = EXCLUDED.is_public;

-- ============================================
-- GOALS (Level 1 - directly under Project)
-- ============================================

INSERT INTO onto_goals (id, project_id, name, type_key, props, created_by) VALUES
-- Goal 1: Preserve Army
('22221111-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Maintain Continental Army as a Viable Fighting Force', 'goal.strategic.primary',
 '{"priority": "critical", "state": "achieved", "strategic_principle": "The army itself is more important than any individual battle"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
-- Goal 2: Foreign Alliance
('22221111-0002-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Secure French Military Alliance', 'goal.strategic.diplomatic',
 '{"priority": "high", "state": "achieved", "target_ally": "France", "achieved_date": "1778-02-06"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
-- Goal 3: Independence
('22221111-0003-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Achieve American Independence from Great Britain', 'goal.strategic.ultimate',
 '{"priority": "critical", "state": "achieved", "achieved_date": "1783-09-03", "treaty": "Treaty of Paris"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
-- Goal 4: Civilian Control
('22221111-0004-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Maintain Civilian Authority Over Military', 'goal.principle.governance',
 '{"priority": "critical", "state": "achieved", "principle": "Military subordinate to civilian government"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MILESTONES (Level 2 - under Goals)
-- ============================================

INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
-- Under Goal 1: Preserve Army
('33331111-0001-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Army Preserved Through Strategic Retreat (New York)', 'milestone.military.survival',
 '1776-11-16'::timestamptz,
 '{"state": "achieved", "location": "New York/New Jersey", "troops_remaining": 3000, "parent_goal": "preserve-army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33331111-0001-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Army Morale and Strength Restored (Trenton)', 'milestone.military.revival',
 '1776-12-26'::timestamptz,
 '{"state": "achieved", "hessians_captured": 900, "morale_impact": "critical boost", "parent_goal": "preserve-army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33331111-0001-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Continental Army Professionalized (Valley Forge)', 'milestone.organizational.reform',
 '1778-06-19'::timestamptz,
 '{"state": "achieved", "location": "Valley Forge", "duration_months": 6, "trainer": "Baron von Steuben", "parent_goal": "preserve-army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Goal 2: Foreign Alliance
('33331111-0002-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Army Surrenders at Saratoga', 'milestone.military.decisive',
 '1777-10-17'::timestamptz,
 '{"state": "achieved", "location": "Saratoga, NY", "commander": "Horatio Gates", "british_surrendered": 5900, "parent_goal": "foreign-alliance"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33331111-0002-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treaty of Alliance Signed with France', 'milestone.diplomatic.alliance',
 '1778-02-06'::timestamptz,
 '{"state": "achieved", "location": "Paris", "french_minister": "Comte de Vergennes", "parent_goal": "foreign-alliance"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Goal 3: Independence
('33331111-0003-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Evacuation of Boston', 'milestone.military.victory',
 '1776-03-17'::timestamptz,
 '{"state": "achieved", "british_evacuated": 11000, "method": "artillery positioning", "parent_goal": "independence"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33331111-0003-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Declaration of Independence Adopted', 'milestone.political.founding',
 '1776-07-04'::timestamptz,
 '{"state": "achieved", "location": "Philadelphia", "signers": 56, "author": "Thomas Jefferson", "parent_goal": "independence"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33331111-0003-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Surrender at Yorktown', 'milestone.military.decisive',
 '1781-10-19'::timestamptz,
 '{"state": "achieved", "british_surrendered": 7000, "cornwallis": true, "effectively_ended_war": true, "parent_goal": "independence"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33331111-0003-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treaty of Paris Signed', 'milestone.diplomatic.peace',
 '1783-09-03'::timestamptz,
 '{"state": "achieved", "negotiators": ["Franklin", "Adams", "Jay"], "territory": "Atlantic to Mississippi", "parent_goal": "independence"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Goal 4: Civilian Control
('33331111-0004-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Newburgh Conspiracy Defused', 'milestone.governance.crisis',
 '1783-03-15'::timestamptz,
 '{"state": "achieved", "location": "Newburgh, NY", "issue": "unpaid wages", "spectacles_moment": true, "parent_goal": "civilian-control"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33331111-0004-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Washington Resigns Commission', 'milestone.governance.precedent',
 '1783-12-23'::timestamptz,
 '{"state": "achieved", "location": "Annapolis, MD", "congress_president": "Thomas Mifflin", "parent_goal": "civilian-control"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- SUB-MILESTONES (Level 3 - under Milestones)
-- Under Saratoga
('33332222-0002-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'First Battle of Saratoga (Freemans Farm)', 'milestone.military.battle',
 '1777-09-19'::timestamptz,
 '{"state": "achieved", "parent_milestone": "saratoga", "outcome": "tactical British victory but costly"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33332222-0002-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Second Battle of Saratoga (Bemis Heights)', 'milestone.military.battle',
 '1777-10-07'::timestamptz,
 '{"state": "achieved", "parent_milestone": "saratoga", "hero": "Benedict Arnold", "outcome": "decisive American victory"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33332222-0002-0001-0003-000000000001', '11111111-1111-1111-1111-111111111111',
 'General Burgoyne Surrenders 5,900 Troops', 'milestone.military.surrender',
 '1777-10-17'::timestamptz,
 '{"state": "achieved", "parent_milestone": "saratoga", "troops_surrendered": 5900, "first_full_army_surrender": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under French Alliance
('33332222-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treaty Ratified by Continental Congress', 'milestone.diplomatic.ratification',
 '1778-05-04'::timestamptz,
 '{"state": "achieved", "parent_milestone": "french-alliance"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PLANS (Level 3 - under Milestones)
-- ============================================

INSERT INTO onto_plans (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Under Milestone: Survived NY Campaign
('44441111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Defense of New York City', 'plan.campaign.military', 'completed',
 '{"facets": {"scale": "large"}, "start_date": "1776-07-01", "end_date": "1776-11-16", "british_forces": 32000, "american_forces": 23000}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Milestone: Trenton Revival
('44441111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Ten Crucial Days Campaign', 'plan.campaign.military', 'completed',
 '{"facets": {"scale": "medium"}, "start_date": "1776-12-25", "end_date": "1777-01-03", "objective": "restore morale through victories"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Milestone: Valley Forge
('44441111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Valley Forge Winter Encampment', 'plan.phase.reorganization', 'completed',
 '{"facets": {"scale": "large"}, "start_date": "1777-12-19", "end_date": "1778-06-19", "objective": "reorganize and professionalize army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Milestone: French Alliance
('44441111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Diplomatic Mission to France', 'plan.diplomatic.negotiation', 'completed',
 '{"facets": {"scale": "medium"}, "lead_negotiator": "Benjamin Franklin", "team": ["Silas Deane", "Arthur Lee"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Milestone: Boston Liberation
('44441111-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Boston Siege Campaign', 'plan.campaign.military', 'completed',
 '{"facets": {"scale": "large"}, "start_date": "1775-04-19", "end_date": "1776-03-17", "strategy": "siege and artillery positioning"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Milestone: Yorktown
('44441111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Combined Franco-American Yorktown Campaign', 'plan.campaign.decisive', 'completed',
 '{"facets": {"scale": "large"}, "start_date": "1781-08-19", "end_date": "1781-10-19", "franco_american_coordination": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SUB-PLANS (Level 4 - under Plans)
-- ============================================

INSERT INTO onto_plans (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Under Valley Forge Plan
('44442222-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Winter Camp Construction', 'plan.logistics.construction', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "valley-forge", "huts_required": 1500}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('44442222-0001-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Quartermaster Department Reform', 'plan.logistics.supply', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "valley-forge", "key_appointment": "Nathanael Greene"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('44442222-0001-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111',
 'Baron von Steuben Training Program', 'plan.training.military', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "valley-forge", "trainer": "Baron von Steuben", "arrived": "1778-02-23"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Boston Siege Plan
('44442222-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Fort Ticonderoga Artillery Acquisition', 'plan.logistics.acquisition', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "boston-siege", "commander": "Henry Knox"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('44442222-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Dorchester Heights Fortification', 'plan.tactical.fortification', 'completed',
 '{"facets": {"scale": "small"}, "parent_plan": "boston-siege", "execution": "overnight fortification"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Yorktown Plan
('44442222-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Strategic March from New York to Virginia', 'plan.maneuver.march', 'completed',
 '{"facets": {"scale": "large"}, "parent_plan": "yorktown", "distance_miles": 600, "deception_used": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('44442222-0003-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Coordination with French Fleet', 'plan.naval.coordination', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "yorktown", "admiral": "Comte de Grasse", "fleet_size": 28}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('44442222-0003-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111',
 'Yorktown Siege Operations', 'plan.tactical.siege', 'completed',
 '{"facets": {"scale": "large"}, "parent_plan": "yorktown", "siege_method": "parallel trenches and bombardment"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SUB-MILESTONES under Plans (Level 4-5)
-- ============================================

INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
-- Under Supply Reform Sub-Plan
('33333333-0001-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Supply Transportation Networks Established', 'milestone.logistics.system',
 '1778-03-15'::timestamptz,
 '{"state": "achieved", "parent_plan": "supply-reform", "improvements": ["systematic requisitioning", "transportation networks"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Training Sub-Plan
('33333333-0001-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111',
 'Model Company Training Complete', 'milestone.training.phase',
 '1778-03-01'::timestamptz,
 '{"state": "achieved", "parent_plan": "training", "soldiers_trained": 100}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33333333-0001-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111',
 'All Units Trained in Steuben Methods', 'milestone.training.complete',
 '1778-05-01'::timestamptz,
 '{"state": "achieved", "parent_plan": "training", "outcome": "professional army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Artillery Sub-Plan
('33333333-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Knox Artillery Train Reaches Boston Lines', 'milestone.logistics.delivery',
 '1776-01-25'::timestamptz,
 '{"state": "achieved", "parent_plan": "artillery", "cannons_delivered": 59, "journey_days": 56}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Dorchester Heights Sub-Plan
('33333333-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Dorchester Heights Fortified and Armed', 'milestone.tactical.fortification',
 '1776-03-04'::timestamptz,
 '{"state": "achieved", "parent_plan": "dorchester", "british_response": "evacuation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under March to Virginia Sub-Plan
('33333333-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Franco-American Forces Arrive at Yorktown', 'milestone.maneuver.arrival',
 '1781-09-28'::timestamptz,
 '{"state": "achieved", "parent_plan": "march-virginia", "total_forces": 19000, "cornwallis_trapped": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Naval Coordination Sub-Plan
('33333333-0003-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'French Fleet Defeats British at Battle of Chesapeake', 'milestone.naval.victory',
 '1781-09-05'::timestamptz,
 '{"state": "achieved", "parent_plan": "naval", "british_retreat": true, "bay_controlled": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Siege Operations Sub-Plan
('33333333-0003-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Redoubts 9 and 10 Captured', 'milestone.tactical.assault',
 '1781-10-14'::timestamptz,
 '{"state": "achieved", "parent_plan": "siege", "hamilton_heroism": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('33333333-0003-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Drummer Signals Request for Negotiations', 'milestone.diplomatic.parley',
 '1781-10-17'::timestamptz,
 '{"state": "achieved", "parent_plan": "siege", "white_flag": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TASKS (Various levels - under Plans/Sub-Plans/Milestones)
-- ============================================

INSERT INTO onto_tasks (id, project_id, type_key, title, state_key, priority, due_at, props, created_by) VALUES
-- Pre-war context tasks (directly under project)
('55551111-0000-0000-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Coordinate Colonial Resistance (Boston Tea Party)', 'done', 1, '1773-12-16'::timestamptz,
 '{"facets": {"scale": "medium"}, "assigned_to": "Samuel Adams", "event": "Boston Tea Party", "tea_destroyed_chests": 342}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55551111-0000-0000-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Participate in First Continental Congress', 'done', 1, '1774-10-26'::timestamptz,
 '{"facets": {"scale": "medium"}, "location": "Philadelphia", "delegates": 56, "outcome": "Continental Association"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55551111-0000-0000-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Accept Appointment as Commander-in-Chief', 'done', 1, '1775-06-19'::timestamptz,
 '{"facets": {"scale": "small"}, "appointed": "1775-06-15", "commissioned": "1775-06-19"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under NY Defense Plan
('55552222-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Defend Long Island Against British Landing', 'done', 1, '1776-08-27'::timestamptz,
 '{"facets": {"scale": "large"}, "outcome": "defeat at Battle of Long Island", "casualties": 2000}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55552222-0001-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Conduct Fighting Retreat from Manhattan', 'done', 1, '1776-09-15'::timestamptz,
 '{"facets": {"scale": "large"}, "kips_bay_panic": true, "harlem_heights_success": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55552222-0001-0001-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Complete Evacuation to New Jersey', 'done', 1, '1776-11-16'::timestamptz,
 '{"facets": {"scale": "large"}, "fort_washington_lost": true, "retreat_across_nj": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Ten Crucial Days Plan
('55552222-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Christmas Night Crossing of Delaware', 'done', 1, '1776-12-25'::timestamptz,
 '{"facets": {"scale": "medium"}, "weather": "noreaster, ice, snow", "troops_crossed": 2400, "crossing_point": "McConkeys Ferry"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55552222-0001-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Assault Hessian Garrison at Trenton', 'done', 1, '1776-12-26'::timestamptz,
 '{"facets": {"scale": "medium"}, "hessian_commander": "Colonel Johann Rall", "hessians_captured": 900, "american_casualties": 0}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55552222-0001-0002-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'March on and Defeat British at Princeton', 'done', 1, '1777-01-03'::timestamptz,
 '{"facets": {"scale": "medium"}, "night_march": true, "outflanked_cornwallis": true, "washington_led_charge": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Camp Construction Sub-Plan
('55553333-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.create',
 'Construct 1,500 Log Huts for Winter Quarters', 'done', 1, '1777-12-25'::timestamptz,
 '{"facets": {"scale": "large"}, "huts_built": 1500, "troops_per_hut": 8}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Supply Reform Sub-Plan
('55553333-0001-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Appoint Nathanael Greene as Quartermaster General', 'done', 1, '1778-03-02'::timestamptz,
 '{"facets": {"scale": "small"}, "appointee": "Nathanael Greene", "previous_qm": "Thomas Mifflin"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Training Sub-Plan
('55553333-0001-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Train Model Company of 100 Men', 'done', 1, '1778-03-01'::timestamptz,
 '{"facets": {"scale": "medium"}, "company_size": 100, "skills": ["drill", "bayonet", "formations"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55553333-0001-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Army-Wide Professional Training', 'done', 1, '1778-05-01'::timestamptz,
 '{"facets": {"scale": "large"}, "manual": "Blue Book", "skills": ["drill", "bayonet", "discipline", "inspections"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Diplomatic Mission Plan
('55552222-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Negotiate Alliance Terms with France', 'done', 1, '1778-02-06'::timestamptz,
 '{"facets": {"scale": "medium"}, "negotiators": ["Benjamin Franklin", "Silas Deane", "Arthur Lee"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55552222-0002-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Secure French Military Aid Commitments', 'done', 1, '1778-02-06'::timestamptz,
 '{"facets": {"scale": "medium"}, "aid_secured": ["troops", "naval support", "supplies", "financial loans"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Boston Siege Plan
('55552222-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Take Command of Continental Forces at Cambridge', 'done', 1, '1775-07-03'::timestamptz,
 '{"facets": {"scale": "small"}, "location": "Cambridge, MA"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55552222-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.review',
 'Complete Assessment of Army Readiness', 'done', 1, '1775-07-10'::timestamptz,
 '{"facets": {"scale": "small"}, "issues": ["uniform shortage", "ammunition shortage", "discipline problems"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Artillery Acquisition Sub-Plan
('55553333-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Transport Cannons from Fort Ticonderoga', 'done', 1, '1776-01-25'::timestamptz,
 '{"facets": {"scale": "large"}, "commander": "Henry Knox", "cannons": 59, "distance_miles": 300, "method": "ox-drawn sleds"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Dorchester Heights Sub-Plan
('55553333-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Fortify Dorchester Heights Overnight', 'done', 1, '1776-03-04'::timestamptz,
 '{"facets": {"scale": "medium"}, "executed_overnight": true, "cannons_positioned": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under March to Virginia Sub-Plan
('55553333-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Secret 600-Mile March to Virginia', 'done', 1, '1781-09-28'::timestamptz,
 '{"facets": {"scale": "large"}, "troops_american": 4000, "troops_french": 3000, "rochambeau": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55553333-0003-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Deception to Mask True Objective', 'done', 1, '1781-08-25'::timestamptz,
 '{"facets": {"scale": "medium"}, "false_dispatches": "attack on New York", "clinton_fooled": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Naval Coordination Sub-Plan
('55553333-0003-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Synchronize Land Operations with French Fleet', 'done', 1, '1781-09-05'::timestamptz,
 '{"facets": {"scale": "medium"}, "communication_method": "messengers", "timing_critical": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55553333-0003-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Ensure French Fleet Controls Chesapeake Bay', 'done', 1, '1781-09-05'::timestamptz,
 '{"facets": {"scale": "medium"}, "battle_of_chesapeake": "1781-09-05", "british_fleet_commander": "Admiral Graves"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Under Siege Operations Sub-Plan
('55553333-0003-0003-0005-000000000001', '11111111-1111-1111-1111-111111111111', 'task.create',
 'Construct First Siege Parallel', 'done', 1, '1781-10-06'::timestamptz,
 '{"facets": {"scale": "medium"}, "distance_from_enemy": "600 yards", "construction_method": "nighttime digging"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55553333-0003-0003-0006-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Begin Artillery Bombardment of British Lines', 'done', 1, '1781-10-09'::timestamptz,
 '{"facets": {"scale": "large"}, "washington_fired_first": true, "continuous_bombardment": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55553333-0003-0003-0007-000000000001', '11111111-1111-1111-1111-111111111111', 'task.create',
 'Construct Second Siege Parallel', 'done', 1, '1781-10-11'::timestamptz,
 '{"facets": {"scale": "medium"}, "distance_from_enemy": "300 yards", "blocked_by_redoubts": [9, 10]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55553333-0003-0003-0008-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Night Assault on British Redoubts 9 and 10', 'done', 1, '1781-10-14'::timestamptz,
 '{"facets": {"scale": "medium"}, "redoubt_10_commander": "Alexander Hamilton", "password": "Rochambeau", "bayonets_only": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('55553333-0003-0003-0009-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Receive British Capitulation', 'done', 1, '1781-10-19'::timestamptz,
 '{"facets": {"scale": "medium"}, "british_surrendered": 7000, "cornwallis_absent": true, "honors_of_war_denied": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Tasks under Milestone: Declaration (no plan)
('55552222-0003-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Coordinate Military Activities with Congress', 'done', 2, '1776-07-04'::timestamptz,
 '{"facets": {"scale": "small"}, "washington_location": "New York preparing defenses"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Tasks under Milestone: Treaty of Paris (no plan)
('55552222-0003-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Maintain Army While Diplomats Negotiate Peace', 'done', 1, '1783-09-03'::timestamptz,
 '{"facets": {"scale": "large"}, "army_maintained": true, "pressure_on_britain": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Tasks under Milestone: Newburgh (no plan)
('55552222-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Address Officers at Newburgh Meeting', 'done', 1, '1783-03-15'::timestamptz,
 '{"facets": {"scale": "small"}, "spectacles_moment": true, "quote": "I have grown gray in your service"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Tasks under Milestone: Resignation (no plan)
('55552222-0004-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Return Commission to Congress', 'done', 1, '1783-12-23'::timestamptz,
 '{"facets": {"scale": "small"}, "quote": "Having now finished the work assigned me, I retire from the great theatre of Action"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DECISIONS (under Milestones)
-- ============================================

INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
('66661111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Retreat from New York', '1776-08-29'::timestamptz,
 'British naval superiority made Manhattan indefensible; preservation of army paramount',
 '{"parent_milestone": "survived-ny", "alternatives": ["counterattack", "fight to last man"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('66661111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Cross Delaware on Christmas Night', '1776-12-24'::timestamptz,
 'Enlistments expiring Dec 31; dispersed Hessian garrisons vulnerable; small victory could revive cause',
 '{"parent_milestone": "trenton-revival", "key_factors": ["expiring enlistments", "low morale", "enemy dispersion"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('66661111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Encamp at Valley Forge', '1777-12-18'::timestamptz,
 'Defensible position 18 miles from Philadelphia; close enough to monitor British; allows reorganization',
 '{"parent_milestone": "valley-forge", "congress_wanted": "continue campaign"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('66661111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to March South to Virginia', '1781-08-14'::timestamptz,
 'De Grasse signaled fleet availability for Virginia; Cornwallis trapped; decisive victory possible',
 '{"parent_milestone": "yorktown", "original_plan": "attack New York", "catalyst": "de Grasse message"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('66661111-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Maintain Subordination to Congressional Authority', '1783-03-15'::timestamptz,
 'Military coup would betray cause; precedent of civilian control essential for new nation',
 '{"parent_milestone": "newburgh", "mutiny_averted": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RISKS (under Milestones)
-- ============================================

INSERT INTO onto_risks (id, project_id, title, type_key, probability, impact, state_key, props, created_by) VALUES
('77771111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Encirclement and Destruction of Army', 'risk.military.tactical', 0.6, 'critical', 'mitigated',
 '{"parent_milestone": "survived-ny", "mitigation": "Strategic retreat executed before encirclement"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('77771111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Army Dissolution from Expiring Enlistments', 'risk.personnel.critical', 0.9, 'critical', 'mitigated',
 '{"parent_milestone": "trenton-revival", "crisis_point": "December 31, 1776", "mitigation": "Trenton victory inspired reenlistments"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('77771111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Critical Supply Shortages', 'risk.logistics.critical', 0.9, 'high', 'mitigated',
 '{"parent_milestone": "valley-forge", "shortages": ["food", "clothing", "shoes", "blankets"], "mitigation": "Greene appointed Quartermaster"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('77771111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Naval Dominance', 'risk.military.strategic', 1.0, 'high', 'mitigated',
 '{"parent_milestone": "french-alliance", "mitigation": "French alliance provided naval capability"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('77771111-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Inadequate Supplies and Ammunition', 'risk.logistics.tactical', 0.8, 'high', 'mitigated',
 '{"parent_milestone": "boston", "mitigation": "Knox artillery solved siege capability"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('77771111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'French Fleet Timing and Coordination', 'risk.coordination.critical', 0.4, 'critical', 'mitigated',
 '{"parent_milestone": "yorktown", "mitigation": "de Grasse arrived on schedule; Battle of Chesapeake successful"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('77771111-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Officer Mutiny and Potential Coup', 'risk.political.critical', 0.5, 'critical', 'mitigated',
 '{"parent_milestone": "newburgh", "mitigation": "Washingtons personal appeal and moral authority"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENTS (under Milestones)
-- ============================================

INSERT INTO onto_documents (id, project_id, title, type_key, state_key, props, created_by) VALUES
('88881111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Regulations for the Order and Discipline of the Troops (Blue Book)', 'document.military.manual', 'published',
 '{"parent_milestone": "valley-forge", "author": "Baron von Steuben", "translators": ["John Laurens", "Alexander Hamilton"], "adopted": "1779"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('88881111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treaty of Alliance with France', 'document.diplomatic.treaty', 'published',
 '{"parent_milestone": "french-alliance", "signed": "1778-02-06", "key_terms": ["mutual defense", "no separate peace", "recognition of independence"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('88881111-0003-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Declaration of Independence', 'document.founding.charter', 'published',
 '{"parent_milestone": "declaration", "author": "Thomas Jefferson", "adopted": "1776-07-04", "signed": "1776-08-02"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('88881111-0003-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treaty of Paris 1783', 'document.diplomatic.treaty', 'published',
 '{"parent_milestone": "treaty-paris", "signed": "1783-09-03", "terms": ["independence recognized", "territorial boundaries", "fishing rights"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('88881111-0004-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Address to Congress Upon Resignation', 'document.speech.historic', 'published',
 '{"parent_milestone": "resignation", "delivered": "1783-12-23", "significance": "established precedent of civilian control"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),
('88881111-0000-0000-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Commission as Commander-in-Chief', 'document.military.commission', 'published',
 '{"parent": "project", "issued": "1775-06-19", "drafted_by": ["Richard Henry Lee", "Edward Rutledge", "John Adams"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GRAPH EDGES - The deeply nested relationships
-- ============================================

-- Clear existing edges for this project
DELETE FROM onto_edges WHERE project_id = '11111111-1111-1111-1111-111111111111';

INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, project_id, props) VALUES
-- ========== PROJECT → GOALS ==========
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0002-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0003-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0004-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),

-- Project-level tasks (pre-war)
('project', '11111111-1111-1111-1111-111111111111', 'has_task', 'task', '55551111-0000-0000-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "pre-war"}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_task', 'task', '55551111-0000-0000-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "pre-war"}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_task', 'task', '55551111-0000-0000-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "pre-war"}'::jsonb),

-- Project-level document
('project', '11111111-1111-1111-1111-111111111111', 'has_document', 'document', '88881111-0000-0000-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== GOAL 1 → MILESTONES ==========
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- ========== GOAL 2 → MILESTONES ==========
('goal', '22221111-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0002-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0002-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),

-- ========== GOAL 3 → MILESTONES ==========
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),

-- ========== GOAL 4 → MILESTONES ==========
('goal', '22221111-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0004-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0004-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),

-- ========== MILESTONE → PLANS ==========
-- Survived NY → NY Defense Plan
('milestone', '33331111-0001-0001-0000-000000000001', 'has_plan', 'plan', '44441111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Trenton → Ten Crucial Days Plan
('milestone', '33331111-0001-0002-0000-000000000001', 'has_plan', 'plan', '44441111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Valley Forge → Valley Forge Plan
('milestone', '33331111-0001-0003-0000-000000000001', 'has_plan', 'plan', '44441111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- French Alliance → Diplomatic Mission Plan
('milestone', '33331111-0002-0002-0000-000000000001', 'has_plan', 'plan', '44441111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Boston → Boston Siege Plan
('milestone', '33331111-0003-0001-0000-000000000001', 'has_plan', 'plan', '44441111-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Yorktown → Yorktown Campaign Plan
('milestone', '33331111-0003-0003-0000-000000000001', 'has_plan', 'plan', '44441111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== MILESTONE → SUB-MILESTONES ==========
-- Saratoga → sub-milestones
('milestone', '33331111-0002-0001-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0002-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('milestone', '33331111-0002-0001-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0002-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('milestone', '33331111-0002-0001-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0002-0001-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
-- French Alliance → Treaty Ratified sub-milestone
('milestone', '33331111-0002-0002-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== PLAN → SUB-PLANS ==========
-- Valley Forge Plan → sub-plans
('plan', '44441111-0001-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0001-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0001-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0001-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0001-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
-- Boston Siege Plan → sub-plans
('plan', '44441111-0003-0001-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0003-0001-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
-- Yorktown Campaign Plan → sub-plans
('plan', '44441111-0003-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0003-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0003-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- ========== PLAN → TASKS ==========
-- NY Defense Plan → tasks
('plan', '44441111-0001-0001-0001-000000000001', 'has_task', 'task', '55552222-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0001-0001-0001-000000000001', 'has_task', 'task', '55552222-0001-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0001-0001-0001-000000000001', 'has_task', 'task', '55552222-0001-0001-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
-- Ten Crucial Days Plan → tasks
('plan', '44441111-0001-0002-0001-000000000001', 'has_task', 'task', '55552222-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0001-0002-0001-000000000001', 'has_task', 'task', '55552222-0001-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0001-0002-0001-000000000001', 'has_task', 'task', '55552222-0001-0002-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
-- Diplomatic Mission Plan → tasks
('plan', '44441111-0002-0002-0001-000000000001', 'has_task', 'task', '55552222-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0002-0002-0001-000000000001', 'has_task', 'task', '55552222-0002-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
-- Boston Siege Plan → tasks
('plan', '44441111-0003-0001-0001-000000000001', 'has_task', 'task', '55552222-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0003-0001-0001-000000000001', 'has_task', 'task', '55552222-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),

-- ========== SUB-PLAN → TASKS ==========
-- Camp Construction → tasks
('plan', '44442222-0001-0003-0001-000000000001', 'has_task', 'task', '55553333-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Supply Reform → tasks
('plan', '44442222-0001-0003-0002-000000000001', 'has_task', 'task', '55553333-0001-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Training → tasks
('plan', '44442222-0001-0003-0003-000000000001', 'has_task', 'task', '55553333-0001-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0001-0003-0003-000000000001', 'has_task', 'task', '55553333-0001-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
-- Artillery Acquisition → tasks
('plan', '44442222-0003-0001-0001-000000000001', 'has_task', 'task', '55553333-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Dorchester Heights → tasks
('plan', '44442222-0003-0001-0002-000000000001', 'has_task', 'task', '55553333-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- March to Virginia → tasks
('plan', '44442222-0003-0003-0001-000000000001', 'has_task', 'task', '55553333-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0003-0003-0001-000000000001', 'has_task', 'task', '55553333-0003-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
-- Naval Coordination → tasks
('plan', '44442222-0003-0003-0002-000000000001', 'has_task', 'task', '55553333-0003-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0003-0003-0002-000000000001', 'has_task', 'task', '55553333-0003-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
-- Siege Operations → tasks
('plan', '44442222-0003-0003-0003-000000000001', 'has_task', 'task', '55553333-0003-0003-0005-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0003-0003-0003-000000000001', 'has_task', 'task', '55553333-0003-0003-0006-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44442222-0003-0003-0003-000000000001', 'has_task', 'task', '55553333-0003-0003-0007-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('plan', '44442222-0003-0003-0003-000000000001', 'has_task', 'task', '55553333-0003-0003-0008-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),
('plan', '44442222-0003-0003-0003-000000000001', 'has_task', 'task', '55553333-0003-0003-0009-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 5}'::jsonb),

-- ========== SUB-PLAN → SUB-MILESTONES ==========
-- Supply Reform → Supply Lines milestone
('plan', '44442222-0001-0003-0002-000000000001', 'has_sub_milestone', 'milestone', '33333333-0001-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Training → Training milestones
('plan', '44442222-0001-0003-0003-000000000001', 'has_sub_milestone', 'milestone', '33333333-0001-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0001-0003-0003-000000000001', 'has_sub_milestone', 'milestone', '33333333-0001-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
-- Artillery → Artillery arrives milestone
('plan', '44442222-0003-0001-0001-000000000001', 'has_sub_milestone', 'milestone', '33333333-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Dorchester → Heights fortified milestone
('plan', '44442222-0003-0001-0002-000000000001', 'has_sub_milestone', 'milestone', '33333333-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- March to Virginia → Forces arrive milestone
('plan', '44442222-0003-0003-0001-000000000001', 'has_sub_milestone', 'milestone', '33333333-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Naval Coordination → Chesapeake victory milestone
('plan', '44442222-0003-0003-0002-000000000001', 'has_sub_milestone', 'milestone', '33333333-0003-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Siege Operations → Siege milestones
('plan', '44442222-0003-0003-0003-000000000001', 'has_sub_milestone', 'milestone', '33333333-0003-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0003-0003-0003-000000000001', 'has_sub_milestone', 'milestone', '33333333-0003-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),

-- ========== MILESTONE → DECISIONS ==========
('milestone', '33331111-0001-0001-0000-000000000001', 'has_decision', 'decision', '66661111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0002-0000-000000000001', 'has_decision', 'decision', '66661111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0003-0000-000000000001', 'has_decision', 'decision', '66661111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0003-0000-000000000001', 'has_decision', 'decision', '66661111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0001-0000-000000000001', 'has_decision', 'decision', '66661111-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== MILESTONE → RISKS ==========
('milestone', '33331111-0001-0001-0000-000000000001', 'has_risk', 'risk', '77771111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0002-0000-000000000001', 'has_risk', 'risk', '77771111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0003-0000-000000000001', 'has_risk', 'risk', '77771111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0002-0002-0000-000000000001', 'has_risk', 'risk', '77771111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0001-0000-000000000001', 'has_risk', 'risk', '77771111-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0003-0000-000000000001', 'has_risk', 'risk', '77771111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0001-0000-000000000001', 'has_risk', 'risk', '77771111-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== MILESTONE → DOCUMENTS ==========
('milestone', '33331111-0001-0003-0000-000000000001', 'has_document', 'document', '88881111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0002-0002-0000-000000000001', 'has_document', 'document', '88881111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0002-0000-000000000001', 'has_document', 'document', '88881111-0003-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0004-0000-000000000001', 'has_document', 'document', '88881111-0003-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0002-0000-000000000001', 'has_document', 'document', '88881111-0004-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== MILESTONE → TASKS (tasks without plans) ==========
('milestone', '33331111-0003-0002-0000-000000000001', 'has_task', 'task', '55552222-0003-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0004-0000-000000000001', 'has_task', 'task', '55552222-0003-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0001-0000-000000000001', 'has_task', 'task', '55552222-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0002-0000-000000000001', 'has_task', 'task', '55552222-0004-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== CROSS-CUTTING RELATIONSHIPS ==========
-- Decision led to milestone
('decision', '66661111-0001-0002-0001-000000000001', 'led_to', 'milestone', '33331111-0001-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Saratoga enabled French Alliance
('milestone', '33331111-0002-0001-0000-000000000001', 'enabled', 'milestone', '33331111-0002-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- French Alliance enabled Yorktown
('milestone', '33331111-0002-0002-0000-000000000001', 'enabled', 'milestone', '33331111-0003-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Risk mitigated by milestone
('risk', '77771111-0002-0002-0001-000000000001', 'mitigated_by', 'milestone', '33331111-0002-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb)
;

-- ============================================
-- COMPLETE
-- ============================================
-- NOTE: RLS policies are defined in a separate migration:
-- 20251220_ontology_rls_policies.sql

DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'George Washington Revolutionary War Project';
  RAISE NOTICE 'DEEPLY NESTED ONTOLOGY GRAPH';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Project ID: 11111111-1111-1111-1111-111111111111';
  RAISE NOTICE '';
  RAISE NOTICE 'GRAPH STRUCTURE (6 levels deep):';
  RAISE NOTICE '  Level 0: Project (1)';
  RAISE NOTICE '  Level 1: Goals (4)';
  RAISE NOTICE '  Level 2: Milestones under Goals (11)';
  RAISE NOTICE '  Level 3: Plans + Sub-Milestones (15)';
  RAISE NOTICE '  Level 4: Sub-Plans + Tasks (25)';
  RAISE NOTICE '  Level 5: Tasks + Sub-Milestones under Sub-Plans (30)';
  RAISE NOTICE '';
  RAISE NOTICE 'ENTITIES:';
  RAISE NOTICE '  - 4 Goals';
  RAISE NOTICE '  - 22 Milestones (11 main + 11 sub)';
  RAISE NOTICE '  - 15 Plans (6 main + 9 sub)';
  RAISE NOTICE '  - 35 Tasks';
  RAISE NOTICE '  - 5 Decisions';
  RAISE NOTICE '  - 7 Risks';
  RAISE NOTICE '  - 6 Documents';
  RAISE NOTICE '  - 100+ Graph Edges';
  RAISE NOTICE '';
  RAISE NOTICE 'KEY RELATIONSHIPS:';
  RAISE NOTICE '  - Project → Goals (has_goal)';
  RAISE NOTICE '  - Goals → Milestones (has_milestone)';
  RAISE NOTICE '  - Milestones → Plans (has_plan)';
  RAISE NOTICE '  - Milestones → Sub-Milestones (has_sub_milestone)';
  RAISE NOTICE '  - Plans → Sub-Plans (has_sub_plan)';
  RAISE NOTICE '  - Plans → Tasks (has_task)';
  RAISE NOTICE '  - Sub-Plans → Sub-Milestones (has_sub_milestone)';
  RAISE NOTICE '  - Milestones → Decisions/Risks/Documents';
  RAISE NOTICE '  - Cross-cutting: enabled, led_to, mitigated_by';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: RLS policies in separate migration (20251220_ontology_rls_policies.sql)';
  RAISE NOTICE '==============================================';
END$$;

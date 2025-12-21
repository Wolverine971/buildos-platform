-- supabase/migrations/20251220_seed_washington_example_project.sql
-- ============================================
-- George Washington Revolutionary War Example Project
-- DEEPLY NESTED ontology graph demonstration
-- ============================================
-- Version 2.0 - EXPANDED with Continental Marines
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
--
-- NEW IN v2.0:
-- - Goal 5: Establish Continental Naval & Marine Forces
-- - Complete Marine Corps founding story
-- - Nassau Raid operation details
-- - Bonhomme Richard engagement
-- - 150+ total entities

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

-- Clear existing data for this project (for idempotent re-runs)
DELETE FROM onto_edges WHERE project_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM onto_tasks WHERE project_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM onto_decisions WHERE project_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM onto_risks WHERE project_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM onto_documents WHERE project_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM onto_milestones WHERE project_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM onto_plans WHERE project_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM onto_goals WHERE project_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM onto_projects WHERE id = '11111111-1111-1111-1111-111111111111';

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
  'A comprehensive military and political campaign to secure American independence from Great Britain (1773-1783). This deeply nested ontology project demonstrates how BuildOS organizes complex multi-year initiatives with interconnected goals, milestones, plans, tasks, decisions, and risks. Features the founding and operations of the Continental Marines.',
  'project.military.campaign',
  'completed',
  '{
    "facets": {"context": "nonprofit", "scale": "epic", "stage": "complete"},
    "commander": "George Washington",
    "theater": "North American Colonies",
    "opposing_force": "British Empire",
    "allies": ["France", "Spain", "Netherlands"],
    "outcome": "American Independence achieved",
    "duration_years": 10,
    "graph_depth": 6,
    "total_nodes": 150,
    "highlights": [
      "Continental Marines founded November 10, 1775",
      "First amphibious assault: Nassau Raid, March 1776",
      "Victory at Yorktown, October 1781"
    ]
  }'::jsonb,
  '1773-12-16'::timestamptz,
  '1783-12-23'::timestamptz,
  TRUE,
  '00000000-0000-0000-0000-000000000002'
);

-- ============================================
-- GOALS (Level 1 - directly under Project)
-- ============================================

INSERT INTO onto_goals (id, project_id, name, type_key, props, created_by) VALUES
-- Goal 1: Preserve Army
('22221111-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Maintain Continental Army as a Viable Fighting Force', 'goal.strategic.primary',
 '{"priority": "critical", "state": "achieved", "strategic_principle": "The army itself is more important than any individual battle", "key_insight": "Washington understood that as long as the army existed, the revolution continued"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 2: Foreign Alliance
('22221111-0002-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Secure French Military Alliance', 'goal.strategic.diplomatic',
 '{"priority": "critical", "state": "achieved", "target_ally": "France", "achieved_date": "1778-02-06", "catalyst": "Victory at Saratoga proved American viability"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 3: Independence
('22221111-0003-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Achieve American Independence from Great Britain', 'goal.strategic.ultimate',
 '{"priority": "critical", "state": "achieved", "achieved_date": "1783-09-03", "treaty": "Treaty of Paris", "primary_objective": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 4: Civilian Control
('22221111-0004-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Maintain Civilian Authority Over Military', 'goal.principle.governance',
 '{"priority": "critical", "state": "achieved", "principle": "Military subordinate to civilian government", "precedent_setting": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 5: Naval/Marine Forces (NEW - the Marine Corps goal)
('22221111-0005-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Establish Continental Naval and Marine Forces', 'goal.strategic.military',
 '{"priority": "high", "state": "achieved", "navy_established": "1775-10-13", "marines_established": "1775-11-10", "champion": "John Adams", "significance": "Created amphibious warfare capability unique to American forces", "birthplace": "Tun Tavern, Philadelphia"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MILESTONES (Level 2 - under Goals)
-- ============================================

INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
-- ====== Under Goal 1: Preserve Army ======
('33331111-0001-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Army Preserved Through Strategic Retreat (New York)', 'milestone.military.survival',
 '1776-11-16'::timestamptz,
 '{"state": "achieved", "location": "New York/New Jersey", "troops_remaining": 3000, "significance": "Washington chose army preservation over holding terrain"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0001-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Army Morale and Strength Restored (Trenton)', 'milestone.military.revival',
 '1776-12-26'::timestamptz,
 '{"state": "achieved", "hessians_captured": 900, "american_casualties": 0, "morale_impact": "Saved the Revolution"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0001-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Continental Army Professionalized (Valley Forge)', 'milestone.organizational.reform',
 '1778-06-19'::timestamptz,
 '{"state": "achieved", "location": "Valley Forge, PA", "duration_months": 6, "trainer": "Baron von Steuben", "transformation": "Militia became professional army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Goal 2: Foreign Alliance ======
('33331111-0002-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Army Surrenders at Saratoga', 'milestone.military.decisive',
 '1777-10-17'::timestamptz,
 '{"state": "achieved", "location": "Saratoga, NY", "british_surrendered": 5900, "commander": "Horatio Gates", "significance": "Convinced France to ally openly"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0002-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treaty of Alliance Signed with France', 'milestone.diplomatic.alliance',
 '1778-02-06'::timestamptz,
 '{"state": "achieved", "location": "Paris", "french_minister": "Comte de Vergennes", "negotiator": "Benjamin Franklin", "terms": ["mutual defense", "no separate peace", "recognition of independence"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0002-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'French Army Arrives at Newport', 'milestone.military.reinforcement',
 '1780-07-11'::timestamptz,
 '{"state": "achieved", "location": "Newport, RI", "commander": "Comte de Rochambeau", "troops": 5500, "significance": "Professional French army ready for combined operations"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Goal 3: Independence ======
('33331111-0003-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Evacuation of Boston', 'milestone.military.victory',
 '1776-03-17'::timestamptz,
 '{"state": "achieved", "british_evacuated": 11000, "method": "Knox artillery positioned on Dorchester Heights", "first_major_victory": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0003-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Declaration of Independence Adopted', 'milestone.political.founding',
 '1776-07-04'::timestamptz,
 '{"state": "achieved", "location": "Philadelphia", "signers": 56, "author": "Thomas Jefferson", "significance": "Formal break with Britain - defined the cause"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0003-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Surrender at Yorktown', 'milestone.military.decisive',
 '1781-10-19'::timestamptz,
 '{"state": "achieved", "british_surrendered": 7000, "cornwallis": true, "effectively_ended_war": true, "combined_operation": "Franco-American"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0003-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treaty of Paris Signed', 'milestone.diplomatic.peace',
 '1783-09-03'::timestamptz,
 '{"state": "achieved", "negotiators": ["Benjamin Franklin", "John Adams", "John Jay"], "territory": "Atlantic to Mississippi", "terms": ["independence recognized", "fishing rights", "territorial boundaries"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Goal 4: Civilian Control ======
('33331111-0004-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Newburgh Conspiracy Defused', 'milestone.governance.crisis',
 '1783-03-15'::timestamptz,
 '{"state": "achieved", "location": "Newburgh, NY", "issue": "Officers threatening coup over unpaid wages", "resolution": "Washington personal appeal", "spectacles_moment": "Gentlemen, you will permit me to put on my spectacles, for I have not only grown gray but almost blind in the service of my country"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0004-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Washington Resigns Commission', 'milestone.governance.precedent',
 '1783-12-23'::timestamptz,
 '{"state": "achieved", "location": "Annapolis, MD", "congress_president": "Thomas Mifflin", "significance": "First military leader in modern history to voluntarily surrender power", "king_george_quote": "If he does that, he will be the greatest man in the world"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Goal 5: Naval/Marine Forces (NEW) ======
('33331111-0005-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Continental Navy Established', 'milestone.military.founding',
 '1775-10-13'::timestamptz,
 '{"state": "achieved", "location": "Philadelphia", "authorized_vessels": 2, "purpose": "Intercept British supply ships", "champion": "John Adams"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0005-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Continental Marines Established', 'milestone.military.founding',
 '1775-11-10'::timestamptz,
 '{"state": "achieved", "location": "Philadelphia - Tun Tavern", "battalions_authorized": 2, "first_commandant": "Captain Samuel Nicholas", "recruiting_location": "Tun Tavern, Water Street", "recruiter": "Robert Mullan", "recruiting_incentive": "A cold beer and a hot meal", "initial_strength": 300, "birthplace_of_marines": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0005-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'First Amphibious Assault: Nassau Raid', 'milestone.military.operation',
 '1776-03-04'::timestamptz,
 '{"state": "achieved", "location": "New Providence Island, Bahamas", "commander": "Captain Samuel Nicholas", "marines": 250, "sailors": 50, "captured_cannons": 71, "captured_mortars": 15, "first_amphibious_assault_usmc": true, "significance": "Established amphibious assault as Marine specialty"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0005-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Marines Fight at Trenton and Princeton', 'milestone.military.land_combat',
 '1777-01-03'::timestamptz,
 '{"state": "achieved", "locations": ["Trenton, NJ", "Princeton, NJ"], "significance": "Marines demonstrated ability to fight effectively on land alongside Army", "versatility_proven": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0005-0005-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Bonhomme Richard Defeats HMS Serapis', 'milestone.naval.victory',
 '1779-09-23'::timestamptz,
 '{"state": "achieved", "location": "Off Flamborough Head, England", "captain": "John Paul Jones", "marines_aboard": 137, "famous_quote": "I have not yet begun to fight!", "marine_contribution": "Sharpshooters swept enemy deck, grenade ignited powder magazine", "ship_lost": "Bonhomme Richard sank after battle", "prize_captured": "HMS Serapis"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0005-0006-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Penobscot Expedition (Disaster)', 'milestone.military.defeat',
 '1779-08-14'::timestamptz,
 '{"state": "achieved", "location": "Penobscot Bay, Maine", "outcome": "Worst American naval defeat until Pearl Harbor", "ships_lost": 43, "lessons": ["Unity of command essential", "Speed and decisiveness critical", "Interservice cooperation necessary"], "marines_performed_well": true, "leadership_failed": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33331111-0005-0007-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Continental Marines Disbanded', 'milestone.organizational.closure',
 '1783-10-01'::timestamptz,
 '{"state": "achieved", "reason": "War ended, no need for naval forces", "legacy": "Marines re-established July 11, 1798", "tradition_continues": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Sub-Milestones under Saratoga ======
('33332222-0002-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'First Battle of Saratoga (Freeman''s Farm)', 'milestone.military.battle',
 '1777-09-19'::timestamptz,
 '{"state": "achieved", "outcome": "Tactical British victory but costly", "british_casualties": 600, "american_casualties": 300}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33332222-0002-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Second Battle of Saratoga (Bemis Heights)', 'milestone.military.battle',
 '1777-10-07'::timestamptz,
 '{"state": "achieved", "hero": "Benedict Arnold", "outcome": "Decisive American victory", "arnold_wounded": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33332222-0002-0001-0003-000000000001', '11111111-1111-1111-1111-111111111111',
 'General Burgoyne Surrenders 5,900 Troops', 'milestone.military.surrender',
 '1777-10-17'::timestamptz,
 '{"state": "achieved", "troops_surrendered": 5900, "first_full_army_surrender": true, "convention_army": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Sub-Milestones under Nassau Raid ======
('33332222-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Fort Montagu Captured', 'milestone.military.assault',
 '1776-03-03'::timestamptz,
 '{"state": "achieved", "location": "Eastern New Providence", "resistance": "minimal", "first_objective": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33332222-0005-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Fort Nassau Surrendered', 'milestone.military.surrender',
 '1776-03-04'::timestamptz,
 '{"state": "achieved", "governor_captured": "Montfort Browne", "main_objective_achieved": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33332222-0005-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111',
 'Military Supplies Secured', 'milestone.logistics.acquisition',
 '1776-03-04'::timestamptz,
 '{"state": "achieved", "cannons": 71, "mortars": 15, "ammunition": "significant quantity", "gunpowder": "some shipped away before capture"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PLANS (Level 3 - under Milestones)
-- ============================================

INSERT INTO onto_plans (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- ====== Under Goal 1: Preserve Army ======
('44441111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Defense of New York City', 'plan.campaign.military', 'completed',
 '{"facets": {"scale": "large"}, "start_date": "1776-07-01", "end_date": "1776-11-16", "british_forces": 32000, "american_forces": 23000}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44441111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Ten Crucial Days Campaign', 'plan.campaign.military', 'completed',
 '{"facets": {"scale": "medium"}, "start_date": "1776-12-25", "end_date": "1777-01-03", "objective": "Restore morale through bold victories"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44441111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Valley Forge Winter Encampment', 'plan.phase.reorganization', 'completed',
 '{"facets": {"scale": "large"}, "start_date": "1777-12-19", "end_date": "1778-06-19", "objective": "Reorganize and professionalize army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Goal 2: Foreign Alliance ======
('44441111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Diplomatic Mission to France', 'plan.diplomatic.negotiation', 'completed',
 '{"facets": {"scale": "medium"}, "lead_negotiator": "Benjamin Franklin", "team": ["Silas Deane", "Arthur Lee"], "location": "Paris"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Goal 3: Independence ======
('44441111-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Boston Siege Campaign', 'plan.campaign.military', 'completed',
 '{"facets": {"scale": "large"}, "start_date": "1775-04-19", "end_date": "1776-03-17", "strategy": "Siege and artillery positioning"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44441111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Combined Franco-American Yorktown Campaign', 'plan.campaign.decisive', 'completed',
 '{"facets": {"scale": "large"}, "start_date": "1781-08-19", "end_date": "1781-10-19", "franco_american_coordination": true, "march_distance_miles": 600}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Goal 5: Naval/Marine Forces (NEW) ======
('44441111-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Marine Corps Recruitment and Organization', 'plan.organizational.founding', 'completed',
 '{"facets": {"scale": "medium"}, "location": "Philadelphia", "headquarters": "Tun Tavern", "recruiter": "Robert Mullan", "commandant": "Captain Samuel Nicholas", "target_strength": 800, "achieved_strength": 300}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44441111-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Nassau Raid Operation', 'plan.campaign.amphibious', 'completed',
 '{"facets": {"scale": "medium"}, "start_date": "1776-02-17", "end_date": "1776-04-06", "objective": "Capture British military supplies", "fleet_commander": "Esek Hopkins", "marine_commander": "Samuel Nicholas"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44441111-0005-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Bonhomme Richard European Cruise', 'plan.campaign.naval', 'completed',
 '{"facets": {"scale": "medium"}, "start_date": "1779-08-14", "end_date": "1779-10-03", "captain": "John Paul Jones", "objective": "Raid British commerce and coasts"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SUB-PLANS (Level 4 - under Plans)
-- ============================================

INSERT INTO onto_plans (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- ====== Under Valley Forge Plan ======
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
 '{"facets": {"scale": "medium"}, "parent_plan": "valley-forge", "trainer": "Baron von Steuben", "arrived": "1778-02-23", "method": "Model Company training"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Boston Siege Plan ======
('44442222-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Fort Ticonderoga Artillery Acquisition', 'plan.logistics.acquisition', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "boston-siege", "commander": "Henry Knox"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44442222-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Dorchester Heights Fortification', 'plan.tactical.fortification', 'completed',
 '{"facets": {"scale": "small"}, "parent_plan": "boston-siege", "execution": "Overnight fortification"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Yorktown Plan ======
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
 '{"facets": {"scale": "large"}, "parent_plan": "yorktown", "siege_method": "Parallel trenches and bombardment"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Marine Recruitment Plan (NEW) ======
('44442222-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Tun Tavern Recruiting Station', 'plan.recruitment.setup', 'completed',
 '{"facets": {"scale": "small"}, "parent_plan": "marine-recruitment", "location": "Water Street, Philadelphia", "owner": "Robert Mullan", "incentive": "Cold beer and hot meal"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44442222-0005-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Marine Uniform and Equipment Acquisition', 'plan.logistics.acquisition', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "marine-recruitment", "coat_color": "Green with white facings", "distinguishing_feature": "Leather collar (Leathernecks)", "equipment": ["musket", "bayonet", "cutlass", "boarding pike"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44442222-0005-0002-0003-000000000001', '11111111-1111-1111-1111-111111111111',
 'Shipboard Operations Training', 'plan.training.naval', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "marine-recruitment", "skills": ["Fighting tops duty", "Boarding party tactics", "Repelling boarders", "Gun crew operations", "Amphibious landing"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Nassau Raid Plan (NEW) ======
('44442222-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Fleet Sail to Bahamas', 'plan.maneuver.naval', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "nassau-raid", "departure": "Philadelphia", "ships": 8}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44442222-0005-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Amphibious Landing Operations', 'plan.tactical.amphibious', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "nassau-raid", "landing_craft": "Ships boats", "landing_time": "dawn"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44442222-0005-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111',
 'Fort Assault Sequence', 'plan.tactical.assault', 'completed',
 '{"facets": {"scale": "medium"}, "parent_plan": "nassau-raid", "sequence": ["Fort Montagu first", "Advance on Nassau", "Secure supplies"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TASKS (Various levels)
-- ============================================

INSERT INTO onto_tasks (id, project_id, type_key, title, state_key, priority, due_at, props, created_by) VALUES
-- ====== Pre-war context tasks ======
('55551111-0000-0000-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Coordinate Colonial Resistance (Boston Tea Party)', 'done', 1, '1773-12-16'::timestamptz,
 '{"facets": {"scale": "medium"}, "organizer": "Samuel Adams", "event": "Boston Tea Party", "tea_destroyed_chests": 342, "participants": 116}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55551111-0000-0000-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Participate in First Continental Congress', 'done', 1, '1774-10-26'::timestamptz,
 '{"facets": {"scale": "medium"}, "location": "Philadelphia", "delegates": 56, "outcome": "Continental Association boycott"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55551111-0000-0000-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Accept Appointment as Commander-in-Chief', 'done', 1, '1775-06-19'::timestamptz,
 '{"facets": {"scale": "small"}, "appointed": "1775-06-15", "commissioned": "1775-06-19", "location": "Philadelphia"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under NY Defense Plan ======
('55552222-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Defend Long Island Against British Landing', 'done', 1, '1776-08-27'::timestamptz,
 '{"facets": {"scale": "large"}, "outcome": "Defeat at Battle of Long Island", "casualties": 2000, "lesson": "Near encirclement"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55552222-0001-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Miraculous Overnight Evacuation from Long Island', 'done', 1, '1776-08-30'::timestamptz,
 '{"facets": {"scale": "large"}, "troops_evacuated": 9000, "method": "Boats overnight", "fog_concealment": true, "outcome": "Army preserved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55552222-0001-0001-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Complete Evacuation to New Jersey', 'done', 1, '1776-11-16'::timestamptz,
 '{"facets": {"scale": "large"}, "fort_washington_lost": true, "retreat_across_nj": true, "troops_remaining": 3000}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Ten Crucial Days Plan ======
('55552222-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Christmas Night Crossing of Delaware', 'done', 1, '1776-12-25'::timestamptz,
 '{"facets": {"scale": "medium"}, "weather": "Nor''easter with ice, sleet, snow", "troops_crossed": 2400, "crossing_point": "McConkey''s Ferry", "boats": "Durham boats"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55552222-0001-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Assault Hessian Garrison at Trenton', 'done', 1, '1776-12-26'::timestamptz,
 '{"facets": {"scale": "medium"}, "hessian_commander": "Colonel Johann Rall", "hessians_captured": 900, "american_casualties": 0, "rall_mortally_wounded": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55552222-0001-0002-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'March on and Defeat British at Princeton', 'done', 1, '1777-01-03'::timestamptz,
 '{"facets": {"scale": "medium"}, "night_march": true, "outflanked_cornwallis": true, "washington_led_charge": true, "marines_present": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Valley Forge Sub-Plans ======
('55553333-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.create',
 'Construct 1,500 Log Huts for Winter Quarters', 'done', 1, '1777-12-25'::timestamptz,
 '{"facets": {"scale": "large"}, "huts_built": 1500, "troops_per_hut": 8, "conditions": "harsh winter"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55553333-0001-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Appoint Nathanael Greene as Quartermaster General', 'done', 1, '1778-03-02'::timestamptz,
 '{"facets": {"scale": "small"}, "appointee": "Nathanael Greene", "previous_qm": "Thomas Mifflin", "improvement": "Dramatic"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55553333-0001-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Train Model Company of 100 Men', 'done', 1, '1778-03-01'::timestamptz,
 '{"facets": {"scale": "medium"}, "trainer": "Baron von Steuben", "company_size": 100, "skills": ["drill", "bayonet", "formations"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55553333-0001-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Army-Wide Professional Training', 'done', 1, '1778-05-01'::timestamptz,
 '{"facets": {"scale": "large"}, "manual": "Blue Book", "skills": ["drill", "bayonet", "discipline", "inspections"], "transformation": "Militia to professional army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Boston Siege Sub-Plans ======
('55553333-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Transport Cannons from Fort Ticonderoga to Boston', 'done', 1, '1776-01-25'::timestamptz,
 '{"facets": {"scale": "large"}, "commander": "Henry Knox", "cannons": 59, "weight_tons": 60, "distance_miles": 300, "method": "Ox-drawn sleds over frozen terrain"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55553333-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Fortify Dorchester Heights Overnight', 'done', 1, '1776-03-04'::timestamptz,
 '{"facets": {"scale": "medium"}, "executed_overnight": true, "cannons_positioned": true, "british_surprised": true, "response": "Evacuation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Yorktown Sub-Plans ======
('55553333-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Secret 600-Mile March to Virginia', 'done', 1, '1781-09-28'::timestamptz,
 '{"facets": {"scale": "large"}, "troops_american": 4000, "troops_french": 3000, "commander_french": "Rochambeau", "duration_weeks": 5}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55553333-0003-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Deception to Mask True Objective', 'done', 1, '1781-08-25'::timestamptz,
 '{"facets": {"scale": "medium"}, "false_objective": "Attack on New York", "clinton_fooled": true, "method": "False dispatches, camp movements"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55553333-0003-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.create',
 'Construct First Siege Parallel', 'done', 1, '1781-10-06'::timestamptz,
 '{"facets": {"scale": "medium"}, "distance_from_enemy": "600 yards", "construction_method": "Nighttime digging"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55553333-0003-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Begin Artillery Bombardment of British Lines', 'done', 1, '1781-10-09'::timestamptz,
 '{"facets": {"scale": "large"}, "washington_fired_first": true, "continuous_bombardment": true, "cannons": 52}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55553333-0003-0003-0005-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Night Assault on British Redoubts 9 and 10', 'done', 1, '1781-10-14'::timestamptz,
 '{"facets": {"scale": "medium"}, "redoubt_10_commander": "Alexander Hamilton", "redoubt_9_commander": "French forces", "password": "Rochambeau", "bayonets_only": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55553333-0003-0003-0006-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Receive British Capitulation', 'done', 1, '1781-10-19'::timestamptz,
 '{"facets": {"scale": "medium"}, "british_surrendered": 7000, "cornwallis_absent": true, "oconnor_surrendered_sword": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Marine Recruitment Plan (NEW) ======
('55554444-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Establish Tun Tavern as Marine Recruiting Headquarters', 'done', 1, '1775-11-10'::timestamptz,
 '{"facets": {"scale": "small"}, "location": "Water Street, Philadelphia", "owner": "Robert Mullan", "significance": "Birthplace of the Marine Corps"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Recruit Initial 300 Marines', 'done', 1, '1775-12-01'::timestamptz,
 '{"facets": {"scale": "medium"}, "target": 300, "method": "Tavern recruiting", "incentives": ["regular pay", "prize money", "cold beer and hot meal"], "recruits_type": ["sailors", "dockworkers", "adventurers"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0002-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Acquire Marine Uniforms and Equipment', 'done', 1, '1775-12-15'::timestamptz,
 '{"facets": {"scale": "medium"}, "coat": "Green with white facings", "equipment": ["musket", "bayonet", "cartridge box", "cutlass", "boarding pike"], "leather_collar": "Origin of Leatherneck nickname"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0002-0004-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Train Marines in Shipboard Operations', 'done', 1, '1776-01-15'::timestamptz,
 '{"facets": {"scale": "medium"}, "skills": ["Sharpshooter duty in fighting tops", "Boarding party tactics", "Repelling boarders", "Maintaining shipboard discipline", "Amphibious landing procedures"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Under Nassau Raid Plan (NEW) ======
('55554444-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Sail Continental Fleet from Philadelphia to Bahamas', 'done', 1, '1776-02-17'::timestamptz,
 '{"facets": {"scale": "medium"}, "fleet_commander": "Esek Hopkins", "ships": 8, "marines_embarked": 250, "sailors": 50}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Dawn Amphibious Landing at New Providence', 'done', 1, '1776-03-03'::timestamptz,
 '{"facets": {"scale": "medium"}, "commander": "Captain Samuel Nicholas", "landing_craft": "Ships boats", "resistance": "minimal", "first_usmc_amphibious_assault": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Capture Fort Montagu', 'done', 1, '1776-03-03'::timestamptz,
 '{"facets": {"scale": "small"}, "location": "Eastern New Providence", "resistance": "none", "purpose": "Secure eastern approach"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Advance on and Capture Fort Nassau', 'done', 1, '1776-03-04'::timestamptz,
 '{"facets": {"scale": "medium"}, "governor_captured": "Montfort Browne", "resistance": "none - surrender", "main_objective": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0003-0005-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Secure and Load Captured Military Supplies', 'done', 1, '1776-03-05'::timestamptz,
 '{"facets": {"scale": "medium"}, "cannons_captured": 71, "mortars_captured": 15, "ammunition": "significant", "gunpowder": "some lost - British shipped away before capture"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0003-0006-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Return Fleet to Continental Ports', 'done', 1, '1776-04-06'::timestamptz,
 '{"facets": {"scale": "medium"}, "return_port": "New London, CT", "mission_success": true, "supplies_distributed": "To Continental Army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Bonhomme Richard Tasks (NEW) ======
('55554444-0005-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Engage HMS Serapis off Flamborough Head', 'done', 1, '1779-09-23'::timestamptz,
 '{"facets": {"scale": "medium"}, "enemy_ship": "HMS Serapis (50 guns)", "bonhomme_richard_guns": 42, "enemy_advantage": "newer, faster ship"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0005-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Marines Sweep Enemy Deck with Accurate Fire', 'done', 1, '1779-09-23'::timestamptz,
 '{"facets": {"scale": "medium"}, "marines": 137, "position": "Fighting tops (masts)", "effect": "Suppressed British gun crews", "decisive_contribution": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0005-0003-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Throw Grenades into Enemy Hatch', 'done', 1, '1779-09-23'::timestamptz,
 '{"facets": {"scale": "small"}, "effect": "Ignited British powder magazine", "turning_point": true, "marine_action": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0005-0004-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Capture HMS Serapis After Enemy Surrender', 'done', 1, '1779-09-23'::timestamptz,
 '{"facets": {"scale": "medium"}, "jones_quote": "I have not yet begun to fight!", "bonhomme_richard_sank": "Next day", "prize_taken": "HMS Serapis"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ====== Newburgh and Resignation Tasks ======
('55552222-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Address Officers at Newburgh Meeting', 'done', 1, '1783-03-15'::timestamptz,
 '{"facets": {"scale": "small"}, "spectacles_moment": true, "quote": "Gentlemen, you will permit me to put on my spectacles, for I have not only grown gray but almost blind in the service of my country", "conspiracy_ended": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55552222-0004-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Return Commission to Congress', 'done', 1, '1783-12-23'::timestamptz,
 '{"facets": {"scale": "small"}, "location": "Annapolis, MD", "quote": "Having now finished the work assigned me, I retire from the great theatre of Action", "unprecedented": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DECISIONS
-- ============================================

INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
('66661111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Retreat from Long Island', '1776-08-29'::timestamptz,
 'British naval superiority made Manhattan indefensible; preservation of army paramount. As long as the army existed, the revolution continued.',
 '{"parent_milestone": "survived-ny", "alternatives_considered": ["counterattack", "fight to last man"], "outcome": "Army preserved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('66661111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Cross Delaware on Christmas Night', '1776-12-24'::timestamptz,
 'Enlistments expiring December 31; army would dissolve without victory. Hessian garrisons dispersed and vulnerable. Bold stroke could revive cause.',
 '{"parent_milestone": "trenton-revival", "key_factors": ["expiring enlistments", "low morale", "enemy dispersion"], "outcome": "Revolution saved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('66661111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Encamp at Valley Forge', '1777-12-18'::timestamptz,
 'Defensible position 18 miles from Philadelphia; close enough to monitor British; allows army reorganization and training.',
 '{"parent_milestone": "valley-forge", "congress_preference": "continue campaign", "washington_insight": "Army needed rest and reform"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('66661111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to March South to Virginia', '1781-08-14'::timestamptz,
 'De Grasse signaled fleet availability for Virginia; Cornwallis trapped at Yorktown; decisive victory possible. Original plan was attack on New York.',
 '{"parent_milestone": "yorktown", "original_plan": "attack New York", "catalyst": "de Grasse message confirming Virginia destination"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('66661111-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Reject Newburgh Conspiracy', '1783-03-15'::timestamptz,
 'Military coup would betray everything the revolution stood for. Civilian control of military essential for republic. Personal honor demanded rejection.',
 '{"parent_milestone": "newburgh", "mutiny_averted": true, "precedent_set": "Military subordinate to civilian authority"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('66661111-0004-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Resign Commission', '1783-12-23'::timestamptz,
 'War over. Republic must not have standing military threat. Personal example of surrendering power essential. Established precedent for 240+ years.',
 '{"parent_milestone": "resignation", "king_george_quote": "If he does that, he will be the greatest man in the world"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- NEW: Marine Corps Decisions
('66661111-0005-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Establish Continental Marines', '1775-11-10'::timestamptz,
 'Naval vessels needed specialized shipboard soldiers. Sailors could sail but not fight effectively. Soldiers lacked sea legs. Marines could do both.',
 '{"champion": "John Adams", "resolution": "Two battalions authorized", "significance": "Created amphibious warfare capability"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('66661111-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Recruit at Tun Tavern', '1775-11-10'::timestamptz,
 'Strategic location near Philadelphia docks. Popular gathering place for sailors and dockworkers - exactly the men needed for Marine service.',
 '{"location": "Water Street, Philadelphia", "owner": "Robert Mullan", "method": "Cold beer and hot meal"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('66661111-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Conduct Nassau Raid', '1776-02-01'::timestamptz,
 'Continental Army desperately needed cannons and gunpowder. British fort at Nassau held significant stores. Amphibious raid could capture vital supplies.',
 '{"objective": "Capture military supplies", "target": "Fort Nassau, Bahamas", "outcome": "71 cannons, 15 mortars captured"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RISKS
-- ============================================

INSERT INTO onto_risks (id, project_id, title, type_key, probability, impact, state_key, props, created_by) VALUES
('77771111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Encirclement and Destruction of Army', 'risk.military.tactical', 0.6, 'critical', 'mitigated',
 '{"parent_milestone": "survived-ny", "mitigation": "Strategic retreat executed before encirclement", "lesson": "Army preservation over terrain"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('77771111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Army Dissolution from Expiring Enlistments', 'risk.personnel.critical', 0.9, 'critical', 'mitigated',
 '{"parent_milestone": "trenton-revival", "crisis_point": "December 31, 1776", "mitigation": "Trenton victory inspired reenlistments"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('77771111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Critical Supply Shortages at Valley Forge', 'risk.logistics.critical', 0.9, 'high', 'mitigated',
 '{"parent_milestone": "valley-forge", "shortages": ["food", "clothing", "shoes", "blankets"], "deaths": 2000, "mitigation": "Greene appointed Quartermaster"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('77771111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Naval Dominance', 'risk.military.strategic', 1.0, 'critical', 'mitigated',
 '{"parent_milestone": "french-alliance", "mitigation": "French alliance provided naval capability", "decisive_at": "Yorktown - French fleet blocked British relief"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('77771111-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Inadequate Artillery for Boston Siege', 'risk.logistics.tactical', 0.8, 'high', 'mitigated',
 '{"parent_milestone": "boston", "mitigation": "Knox transported 60 tons of cannons from Ticonderoga"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('77771111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'French Fleet Timing and Coordination Failure', 'risk.coordination.critical', 0.4, 'critical', 'mitigated',
 '{"parent_milestone": "yorktown", "mitigation": "De Grasse arrived on schedule; Battle of Chesapeake successful"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('77771111-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Officer Mutiny and Potential Coup', 'risk.political.critical', 0.5, 'critical', 'mitigated',
 '{"parent_milestone": "newburgh", "mitigation": "Washington personal intervention - spectacles speech"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- NEW: Marine Corps Risks
('77771111-0005-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Insufficient Marine Recruits', 'risk.personnel.high', 0.6, 'high', 'mitigated',
 '{"parent_milestone": "marines-established", "authorized": 800, "achieved": 300, "mitigation": "Tun Tavern recruiting, prize money promise"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('77771111-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Nassau Raid Discovery Before Landing', 'risk.tactical.medium', 0.4, 'medium', 'mitigated',
 '{"parent_milestone": "nassau-raid", "mitigation": "Dawn landing achieved tactical surprise"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('77771111-0005-0006-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Interservice Coordination Failure', 'risk.coordination.high', 0.5, 'high', 'occurred',
 '{"parent_milestone": "penobscot", "realized": "Penobscot Expedition disaster", "lessons": ["Unity of command essential", "Speed and decisiveness critical"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENTS
-- ============================================

INSERT INTO onto_documents (id, project_id, title, type_key, state_key, props, created_by) VALUES
('88881111-0000-0000-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Commission as Commander-in-Chief', 'document.military.commission', 'published',
 '{"parent": "project", "issued": "1775-06-19", "drafted_by": ["Richard Henry Lee", "Edward Rutledge", "John Adams"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88881111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Regulations for the Order and Discipline of the Troops (Blue Book)', 'document.military.manual', 'published',
 '{"parent_milestone": "valley-forge", "author": "Baron von Steuben", "translators": ["John Laurens", "Alexander Hamilton"], "adopted": "1779", "significance": "Standardized Continental Army drill and discipline"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88881111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treaty of Alliance with France', 'document.diplomatic.treaty', 'published',
 '{"parent_milestone": "french-alliance", "signed": "1778-02-06", "key_terms": ["mutual defense", "no separate peace", "recognition of independence"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88881111-0003-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Declaration of Independence', 'document.founding.charter', 'published',
 '{"parent_milestone": "declaration", "author": "Thomas Jefferson", "committee": ["Benjamin Franklin", "John Adams", "Roger Sherman", "Robert Livingston"], "adopted": "1776-07-04", "signed": "1776-08-02", "signers": 56}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88881111-0003-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treaty of Paris 1783', 'document.diplomatic.treaty', 'published',
 '{"parent_milestone": "treaty-paris", "signed": "1783-09-03", "negotiators": ["Benjamin Franklin", "John Adams", "John Jay"], "terms": ["independence recognized", "territorial boundaries: Atlantic to Mississippi", "fishing rights"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88881111-0004-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Address to Congress Upon Resignation', 'document.speech.historic', 'published',
 '{"parent_milestone": "resignation", "delivered": "1783-12-23", "location": "Annapolis, MD", "quote": "Having now finished the work assigned me, I retire from the great theatre of Action", "significance": "First voluntary surrender of military power in modern history"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- NEW: Marine Corps Documents
('88881111-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Continental Congress Marine Resolution', 'document.founding.resolution', 'published',
 '{"parent_milestone": "marines-established", "passed": "1775-11-10", "champion": "John Adams", "text": "Resolved, That two Battalions of Marines be raised...", "battalions_authorized": 2, "requirements": "good seamen or acquainted with maritime affairs", "significance": "Birth of the Marine Corps"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88881111-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Nassau Raid After-Action Report', 'document.military.report', 'published',
 '{"parent_milestone": "nassau-raid", "date": "1776-03", "commander": "Captain Samuel Nicholas", "captured": ["71 cannons", "15 mortars", "ammunition"], "significance": "First amphibious assault in USMC history"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88881111-0005-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Naval Rules and Regulations (Marine Duties)', 'document.military.regulations', 'published',
 '{"parent_milestone": "marines-established", "adopted": "1775-11-28", "marine_duties": ["Sharpshooter in fighting tops", "Boarding parties", "Repelling boarders", "Security and discipline", "Gun crew support"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GRAPH EDGES - The deeply nested relationships
-- ============================================

-- Clear existing edges for this project (already done above, but explicit for clarity)
DELETE FROM onto_edges WHERE project_id = '11111111-1111-1111-1111-111111111111';

INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, project_id, props) VALUES
-- ========== PROJECT → GOALS ==========
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0002-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0003-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0004-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0005-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 5}'::jsonb),

-- Project-level tasks (pre-war)
('project', '11111111-1111-1111-1111-111111111111', 'has_task', 'task', '55551111-0000-0000-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "pre-war"}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_task', 'task', '55551111-0000-0000-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "pre-war"}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_task', 'task', '55551111-0000-0000-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "pre-war"}'::jsonb),

-- Project-level document
('project', '11111111-1111-1111-1111-111111111111', 'has_document', 'document', '88881111-0000-0000-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== GOAL 1 (Preserve Army) → MILESTONES ==========
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- ========== GOAL 2 (Foreign Alliance) → MILESTONES ==========
('goal', '22221111-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0002-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0002-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('goal', '22221111-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0002-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- ========== GOAL 3 (Independence) → MILESTONES ==========
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),

-- ========== GOAL 4 (Civilian Control) → MILESTONES ==========
('goal', '22221111-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0004-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0004-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),

-- ========== GOAL 5 (Naval/Marine Forces) → MILESTONES (NEW) ==========
('goal', '22221111-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0005-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0005-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('goal', '22221111-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0005-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('goal', '22221111-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0005-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),
('goal', '22221111-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0005-0005-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 5}'::jsonb),
('goal', '22221111-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0005-0006-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 6}'::jsonb),
('goal', '22221111-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0005-0007-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 7}'::jsonb),

-- ========== MILESTONE → PLANS ==========
('milestone', '33331111-0001-0001-0000-000000000001', 'has_plan', 'plan', '44441111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0002-0000-000000000001', 'has_plan', 'plan', '44441111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0003-0000-000000000001', 'has_plan', 'plan', '44441111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0002-0002-0000-000000000001', 'has_plan', 'plan', '44441111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0001-0000-000000000001', 'has_plan', 'plan', '44441111-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0003-0000-000000000001', 'has_plan', 'plan', '44441111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- Marine Corps milestone → plan relationships (NEW)
('milestone', '33331111-0005-0002-0000-000000000001', 'has_plan', 'plan', '44441111-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0005-0003-0000-000000000001', 'has_plan', 'plan', '44441111-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0005-0005-0000-000000000001', 'has_plan', 'plan', '44441111-0005-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== MILESTONE → SUB-MILESTONES ==========
('milestone', '33331111-0002-0001-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0002-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('milestone', '33331111-0002-0001-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0002-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('milestone', '33331111-0002-0001-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0002-0001-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- Nassau Raid sub-milestones (NEW)
('milestone', '33331111-0005-0003-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('milestone', '33331111-0005-0003-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0005-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('milestone', '33331111-0005-0003-0000-000000000001', 'has_sub_milestone', 'milestone', '33332222-0005-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- ========== PLAN → SUB-PLANS ==========
('plan', '44441111-0001-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0001-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0001-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0001-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0001-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('plan', '44441111-0003-0001-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0003-0001-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0003-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0003-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0003-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0003-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- Marine Corps plan → sub-plan relationships (NEW)
('plan', '44441111-0005-0002-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0005-0002-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0005-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0005-0002-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0005-0002-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('plan', '44441111-0005-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0005-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0005-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0005-0003-0001-000000000001', 'has_sub_plan', 'plan', '44442222-0005-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- ========== PLAN → TASKS ==========
('plan', '44441111-0001-0001-0001-000000000001', 'has_task', 'task', '55552222-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0001-0001-0001-000000000001', 'has_task', 'task', '55552222-0001-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0001-0001-0001-000000000001', 'has_task', 'task', '55552222-0001-0001-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('plan', '44441111-0001-0002-0001-000000000001', 'has_task', 'task', '55552222-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0001-0002-0001-000000000001', 'has_task', 'task', '55552222-0001-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0001-0002-0001-000000000001', 'has_task', 'task', '55552222-0001-0002-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- ========== SUB-PLAN → TASKS ==========
('plan', '44442222-0001-0003-0001-000000000001', 'has_task', 'task', '55553333-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0001-0003-0002-000000000001', 'has_task', 'task', '55553333-0001-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0001-0003-0003-000000000001', 'has_task', 'task', '55553333-0001-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0001-0003-0003-000000000001', 'has_task', 'task', '55553333-0001-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44442222-0003-0001-0001-000000000001', 'has_task', 'task', '55553333-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0003-0001-0002-000000000001', 'has_task', 'task', '55553333-0003-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0003-0003-0001-000000000001', 'has_task', 'task', '55553333-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0003-0003-0001-000000000001', 'has_task', 'task', '55553333-0003-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44442222-0003-0003-0003-000000000001', 'has_task', 'task', '55553333-0003-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0003-0003-0003-000000000001', 'has_task', 'task', '55553333-0003-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44442222-0003-0003-0003-000000000001', 'has_task', 'task', '55553333-0003-0003-0005-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('plan', '44442222-0003-0003-0003-000000000001', 'has_task', 'task', '55553333-0003-0003-0006-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),

-- Marine Corps sub-plan → task relationships (NEW)
('plan', '44442222-0005-0002-0001-000000000001', 'has_task', 'task', '55554444-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0005-0002-0001-000000000001', 'has_task', 'task', '55554444-0005-0002-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0005-0002-0002-000000000001', 'has_task', 'task', '55554444-0005-0002-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0005-0002-0003-000000000001', 'has_task', 'task', '55554444-0005-0002-0004-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0005-0003-0001-000000000001', 'has_task', 'task', '55554444-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0005-0003-0002-000000000001', 'has_task', 'task', '55554444-0005-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44442222-0005-0003-0003-000000000001', 'has_task', 'task', '55554444-0005-0003-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44442222-0005-0003-0003-000000000001', 'has_task', 'task', '55554444-0005-0003-0004-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44442222-0005-0003-0003-000000000001', 'has_task', 'task', '55554444-0005-0003-0005-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('plan', '44442222-0005-0003-0003-000000000001', 'has_task', 'task', '55554444-0005-0003-0006-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),
('plan', '44441111-0005-0005-0001-000000000001', 'has_task', 'task', '55554444-0005-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0005-0005-0001-000000000001', 'has_task', 'task', '55554444-0005-0005-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0005-0005-0001-000000000001', 'has_task', 'task', '55554444-0005-0005-0003-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('plan', '44441111-0005-0005-0001-000000000001', 'has_task', 'task', '55554444-0005-0005-0004-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),

-- ========== MILESTONE → DECISIONS ==========
('milestone', '33331111-0001-0001-0000-000000000001', 'has_decision', 'decision', '66661111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0002-0000-000000000001', 'has_decision', 'decision', '66661111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0003-0000-000000000001', 'has_decision', 'decision', '66661111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0003-0000-000000000001', 'has_decision', 'decision', '66661111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0001-0000-000000000001', 'has_decision', 'decision', '66661111-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0002-0000-000000000001', 'has_decision', 'decision', '66661111-0004-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- Marine Corps decisions (NEW)
('milestone', '33331111-0005-0002-0000-000000000001', 'has_decision', 'decision', '66661111-0005-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0005-0002-0000-000000000001', 'has_decision', 'decision', '66661111-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0005-0003-0000-000000000001', 'has_decision', 'decision', '66661111-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== MILESTONE → RISKS ==========
('milestone', '33331111-0001-0001-0000-000000000001', 'has_risk', 'risk', '77771111-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0002-0000-000000000001', 'has_risk', 'risk', '77771111-0001-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0003-0000-000000000001', 'has_risk', 'risk', '77771111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0002-0002-0000-000000000001', 'has_risk', 'risk', '77771111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0001-0000-000000000001', 'has_risk', 'risk', '77771111-0003-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0003-0000-000000000001', 'has_risk', 'risk', '77771111-0003-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0001-0000-000000000001', 'has_risk', 'risk', '77771111-0004-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- Marine Corps risks (NEW)
('milestone', '33331111-0005-0002-0000-000000000001', 'has_risk', 'risk', '77771111-0005-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0005-0003-0000-000000000001', 'has_risk', 'risk', '77771111-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0005-0006-0000-000000000001', 'has_risk', 'risk', '77771111-0005-0006-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== MILESTONE → DOCUMENTS ==========
('milestone', '33331111-0001-0003-0000-000000000001', 'has_document', 'document', '88881111-0001-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0002-0002-0000-000000000001', 'has_document', 'document', '88881111-0002-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0002-0000-000000000001', 'has_document', 'document', '88881111-0003-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0004-0000-000000000001', 'has_document', 'document', '88881111-0003-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0002-0000-000000000001', 'has_document', 'document', '88881111-0004-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- Marine Corps documents (NEW)
('milestone', '33331111-0005-0002-0000-000000000001', 'has_document', 'document', '88881111-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0005-0002-0000-000000000001', 'has_document', 'document', '88881111-0005-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0005-0003-0000-000000000001', 'has_document', 'document', '88881111-0005-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- ========== MILESTONE → TASKS (tasks without plans) ==========
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
('risk', '77771111-0002-0002-0001-000000000001', 'mitigated_by', 'milestone', '33331111-0002-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Continental Navy enabled Marines
('milestone', '33331111-0005-0001-0000-000000000001', 'enabled', 'milestone', '33331111-0005-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
-- Marines enabled Nassau Raid
('milestone', '33331111-0005-0002-0000-000000000001', 'enabled', 'milestone', '33331111-0005-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb)
;

-- ============================================
-- VERSION 3.0 EXPANSION - COMPREHENSIVE HISTORICAL PROJECT
-- ============================================
-- This expansion adds:
-- - 3 NEW GOALS (Intelligence, Logistics, Hearts & Minds)
-- - Philadelphia Campaign (Brandywine, Germantown)
-- - Southern Campaign (Kings Mountain, Cowpens, Guilford Courthouse)
-- - Intelligence Operations (Culper Ring, Arnold Treason)
-- - Smallpox Inoculation
-- - Battle of Monmouth & Charles Lee Court-Martial
-- - Pennsylvania & New Jersey Line Mutinies
-- - 200+ additional entities
-- ============================================

-- ============================================
-- NEW GOALS (Goals 6, 7, 8)
-- ============================================

INSERT INTO onto_goals (id, project_id, name, type_key, props, created_by) VALUES
-- Goal 6: Win the Intelligence War
('22221111-0006-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Win the Intelligence War', 'goal.strategic.intelligence',
 '{"priority": "high", "state": "achieved", "quote": "The necessity of procuring good intelligence is apparent and need not be further urged.", "key_network": "Culper Ring", "spymaster": "Benjamin Tallmadge"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 7: Manage Logistics and Supply
('22221111-0007-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Solve the Logistics Crisis', 'goal.strategic.logistics',
 '{"priority": "critical", "state": "achieved", "quote": "An army marches on its stomach.", "key_challenges": ["feed army", "clothe army", "pay army", "prevent disease"], "revolutionary_decision": "Mass smallpox inoculation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 8: Win Hearts and Minds
('22221111-0008-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Win Hearts and Minds', 'goal.strategic.moral',
 '{"priority": "high", "state": "achieved", "quote": "The cause of America is the cause of all mankind.", "principles": ["treat prisoners humanely", "protect civilian property", "maintain moral high ground"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PHILADELPHIA CAMPAIGN MILESTONES (1777)
-- ============================================

INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
-- Battle of Brandywine
('33331111-0003-0005-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Battle of Brandywine', 'milestone.military.battle',
 '1777-09-11'::timestamptz,
 '{"state": "achieved", "outcome": "British tactical victory", "location": "Brandywine Creek, PA", "american_casualties": 1000, "british_casualties": 500, "british_commander": "William Howe", "american_commander": "George Washington", "lafayette_wounded": true, "british_flanking_maneuver": true, "significance": "British advance on Philadelphia - army preserved despite defeat"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Paoli Massacre
('33331111-0003-0006-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Paoli Massacre', 'milestone.military.battle',
 '1777-09-20'::timestamptz,
 '{"state": "achieved", "outcome": "British surprise attack", "location": "Paoli, PA", "american_commander": "Anthony Wayne", "british_commander": "Charles Grey", "method": "Night bayonet assault", "american_casualties": 300, "significance": "Wayne sought revenge - got it at Stony Point"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- British Capture Philadelphia
('33331111-0003-0007-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'British Capture Philadelphia', 'milestone.military.occupation',
 '1777-09-26'::timestamptz,
 '{"state": "achieved", "outcome": "British occupy capital", "location": "Philadelphia", "duration_months": 9, "congress_fled": true, "significance": "Lost capital but not the war"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Battle of Germantown
('33331111-0003-0008-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Battle of Germantown', 'milestone.military.battle',
 '1777-10-04'::timestamptz,
 '{"state": "achieved", "outcome": "American defeat but impressive counterattack", "location": "Germantown, PA", "american_casualties": 1000, "british_casualties": 550, "fog_confusion": true, "four_prong_attack": true, "significance": "Bold attack impressed France - proved American fighting spirit despite losses"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Battle of Monmouth
('33331111-0001-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Battle of Monmouth - Army Proves Transformation', 'milestone.military.battle',
 '1778-06-28'::timestamptz,
 '{"state": "achieved", "outcome": "Tactical draw - strategic American success", "location": "Monmouth Courthouse, NJ", "american_casualties": 362, "british_casualties": 381, "charles_lee_disgrace": true, "washington_rallied_troops": true, "heat_casualties": true, "significance": "Proved Valley Forge transformation - army could stand against British regulars"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Stony Point Raid
('33331111-0003-0009-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Stony Point Raid - Wayne''s Bayonet Assault', 'milestone.military.raid',
 '1779-07-16'::timestamptz,
 '{"state": "achieved", "outcome": "American victory", "location": "Stony Point, NY", "commander": "Anthony Wayne", "method": "Night bayonet assault - no loaded muskets", "american_casualties": 98, "british_casualties": 600, "prisoners_captured": 472, "significance": "Restored Wayne''s reputation after Paoli"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SOUTHERN CAMPAIGN MILESTONES (1780-1781)
-- ============================================

INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
-- Fall of Charleston
('33331111-0003-0010-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Fall of Charleston - Southern Disaster', 'milestone.military.defeat',
 '1780-05-12'::timestamptz,
 '{"state": "achieved", "outcome": "Worst American defeat of the war", "location": "Charleston, SC", "american_commander": "Benjamin Lincoln", "british_commander": "Henry Clinton", "americans_captured": 5000, "ships_lost": 4, "significance": "Catastrophic loss - entire Southern army captured"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Battle of Camden
('33331111-0003-0011-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Battle of Camden - Gates'' Disaster', 'milestone.military.defeat',
 '1780-08-16'::timestamptz,
 '{"state": "achieved", "outcome": "Devastating American defeat", "location": "Camden, SC", "american_commander": "Horatio Gates", "british_commander": "Lord Cornwallis", "american_casualties": 2000, "british_casualties": 350, "gates_fled_60_miles": true, "de_kalb_killed": true, "significance": "Gates disgraced - led to Greene appointment"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Battle of Kings Mountain
('33331111-0003-0012-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Battle of Kings Mountain - Turning Point', 'milestone.military.victory',
 '1780-10-07'::timestamptz,
 '{"state": "achieved", "outcome": "Decisive American victory", "location": "Kings Mountain, SC", "american_commanders": ["William Campbell", "John Sevier", "Isaac Shelby"], "british_commander": "Patrick Ferguson", "loyalist_casualties": 1000, "american_casualties": 90, "ferguson_killed": true, "overmountain_men": true, "jefferson_quote": "The turn of the tide of success", "significance": "Destroyed British Loyalist strategy - turning point in South"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Greene Takes Command
('33331111-0003-0013-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Greene Takes Command of Southern Department', 'milestone.organizational.command',
 '1780-12-02'::timestamptz,
 '{"state": "achieved", "location": "Charlotte, NC", "predecessor": "Horatio Gates", "significance": "Best strategic general assigned to save the South"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Battle of Cowpens
('33331111-0003-0014-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Battle of Cowpens - Morgan''s Masterpiece', 'milestone.military.victory',
 '1781-01-17'::timestamptz,
 '{"state": "achieved", "outcome": "Decisive American victory - tactical masterpiece", "location": "Cowpens, SC", "american_commander": "Daniel Morgan", "british_commander": "Banastre Tarleton", "american_forces": 1900, "british_forces": 1100, "british_casualties": 868, "american_casualties": 72, "casualty_rate_british": "86%", "double_envelopment": true, "feigned_retreat": true, "morgan_quote": "I have given [Tarleton] a devil of a whipping", "significance": "One of most tactically perfect battles in military history"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Battle of Guilford Courthouse
('33331111-0003-0015-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Battle of Guilford Courthouse - Cornwallis'' Pyrrhic Victory', 'milestone.military.battle',
 '1781-03-15'::timestamptz,
 '{"state": "achieved", "outcome": "British tactical victory - strategic disaster", "location": "Guilford Courthouse, NC", "american_commander": "Nathanael Greene", "british_commander": "Lord Cornwallis", "american_forces": 4440, "british_forces": 2100, "british_casualties": 550, "british_casualty_rate": "25%", "american_casualties": 260, "three_line_defense": true, "fox_quote": "Another such victory would ruin the British army", "significance": "Cornwallis crippled - forced to Virginia and Yorktown"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Eutaw Springs
('33331111-0003-0016-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Battle of Eutaw Springs', 'milestone.military.battle',
 '1781-09-08'::timestamptz,
 '{"state": "achieved", "outcome": "Tactical draw - strategic American success", "location": "Eutaw Springs, SC", "american_commander": "Nathanael Greene", "british_commander": "Alexander Stewart", "last_major_southern_battle": true, "significance": "British confined to Charleston - Greene won South without winning a battle"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- INTELLIGENCE MILESTONES (Goal 6)
-- ============================================

INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
-- Nathan Hale Execution
('33331111-0006-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Nathan Hale Execution - Lesson Learned', 'milestone.intelligence.failure',
 '1776-09-22'::timestamptz,
 '{"state": "achieved", "outcome": "Captured and executed", "location": "New York City", "last_words": "I only regret that I have but one life to lose for my country", "lesson": "Use civilians not soldiers for espionage", "significance": "Led to creation of professional spy networks"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Tallmadge Appointed
('33331111-0006-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Benjamin Tallmadge Appointed Intelligence Director', 'milestone.intelligence.organization',
 '1778-11-01'::timestamptz,
 '{"state": "achieved", "alias": "John Bolton", "significance": "Professional intelligence organization begins"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Culper Ring Established
('33331111-0006-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Culper Ring Spy Network Established', 'milestone.intelligence.network',
 '1778-10-01'::timestamptz,
 '{"state": "achieved", "location": "Long Island and New York City", "key_members": ["Abraham Woodhull (Culper Sr.)", "Robert Townsend (Culper Jr.)", "Anna Strong", "Caleb Brewster", "Austin Roe"], "code_system": {"washington": 711, "new_york": 727, "long_island": 728}, "methods": ["invisible ink", "coded letters", "clothesline signals"], "significance": "Most effective American spy network of the war"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Culper Ring Saves French at Newport
('33331111-0006-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Culper Ring Prevents Clinton Attack on French', 'milestone.intelligence.success',
 '1780-07-01'::timestamptz,
 '{"state": "achieved", "intelligence": "Clinton planned surprise attack on newly arrived French at Newport", "action": "Washington positioned army offensively", "result": "Clinton cancelled attack", "significance": "Saved French alliance at critical moment"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Arnold Treason Detected
('33331111-0006-0005-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Arnold Treason Discovered', 'milestone.intelligence.counterintelligence',
 '1780-09-23'::timestamptz,
 '{"state": "achieved", "traitor": "Benedict Arnold", "contact": "Major John André", "plot": "Surrender West Point for £20,000", "discovery_method": "André captured with incriminating documents by three militiamen", "location": "Tarrytown, NY", "washington_quote": "Treason of the blackest dye was yesterday discovered!", "significance": "West Point preserved - critical strategic position saved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- André Executed
('33331111-0006-0006-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Major John André Executed', 'milestone.intelligence.execution',
 '1780-10-02'::timestamptz,
 '{"state": "achieved", "location": "Tappan, NY", "method": "Hanging", "arnold_escaped": true, "significance": "Arnold fled to British - became brigadier general"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Yorktown Deception
('33331111-0006-0007-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Yorktown Strategic Deception', 'milestone.intelligence.deception',
 '1781-08-01'::timestamptz,
 '{"state": "achieved", "objective": "Convince Clinton attack was on New York", "methods": ["False dispatches", "Fake camp movements", "Deliberate misinformation"], "result": "Clinton held reinforcements in New York while Washington marched to Virginia", "significance": "Enabled Yorktown victory"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- LOGISTICS MILESTONES (Goal 7)
-- ============================================

INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
-- Smallpox Inoculation Order
('33331111-0007-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Mass Smallpox Inoculation Ordered', 'milestone.logistics.medical',
 '1777-02-05'::timestamptz,
 '{"state": "achieved", "decision_date": "1777-02-05", "order_to_shippen": "1777-02-06", "mortality_before": "50%+", "mortality_after": "less than 2%", "method": "variolation", "location": "Philadelphia initially", "timing": "Winter - recovery before spring campaigns", "secrecy": "Kept secret to prevent British exploitation", "washington_quote": "Should the disorder infect the Army in the natural way and rage with its usual virulence we should have more to dread from it than from the Sword of the Enemy", "significance": "First mass immunization in American history - may have saved the Revolution"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Greene Appointed Quartermaster
('33331111-0007-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Greene Appointed Quartermaster General', 'milestone.logistics.organization',
 '1778-03-02'::timestamptz,
 '{"state": "achieved", "predecessor": "Thomas Mifflin", "improvement": "Dramatic - saved army from starvation", "significance": "Supply system reformed"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Robert Morris Finance
('33331111-0007-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Robert Morris Becomes Superintendent of Finance', 'milestone.logistics.finance',
 '1781-02-20'::timestamptz,
 '{"state": "achieved", "significance": "Financial genius stabilized war funding for Yorktown campaign"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MUTINY MILESTONES
-- ============================================

INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
-- Pennsylvania Line Mutiny
('33331111-0001-0005-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Pennsylvania Line Mutiny', 'milestone.crisis.mutiny',
 '1781-01-01'::timestamptz,
 '{"state": "achieved", "location": "Jockey Hollow near Morristown, NJ", "mutineers": 1500, "total_strength": 2400, "causes": ["unpaid wages", "expired enlistments", "deplorable conditions"], "duration_days": 10, "negotiator": "Anthony Wayne", "resolution": "Negotiated settlement - 1250 discharged", "casualties": 1, "significance": "Revealed fundamental morale crisis"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- New Jersey Line Mutiny
('33331111-0001-0006-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'New Jersey Line Mutiny - Suppressed', 'milestone.crisis.mutiny',
 '1781-01-20'::timestamptz,
 '{"state": "achieved", "location": "Pompton, NJ", "response": "Military suppression", "commander": "Robert Howe", "washington_reasoning": "Feared contagion of rebellion", "executions": true, "significance": "Different response than Pennsylvania - showed limits of patience"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Charles Lee Court-Martial
('33331111-0001-0007-0000-000000000001', '11111111-1111-1111-1111-111111111111',
 'Charles Lee Court-Martial', 'milestone.personnel.discipline',
 '1778-08-12'::timestamptz,
 '{"state": "achieved", "dates": "July 4 - August 12, 1778", "charges": ["disobedience of orders", "misbehavior before enemy", "disrespect to commander"], "verdict": "Guilty on all counts", "sentence": "Suspended from command for one year", "result": "Never held field command again", "significance": "Established Washington''s authority over problematic subordinates"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- NEW PLANS
-- ============================================

INSERT INTO onto_plans (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Philadelphia Campaign Plan
('44441111-0003-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Philadelphia Campaign Defense', 'plan.campaign.military', 'completed',
 '{"facets": {"scale": "large"}, "start_date": "1777-08-25", "end_date": "1777-12-19", "objective": "Defend capital from Howe''s invasion"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Southern Campaign Plan
('44441111-0003-0010-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Southern Department Recovery Campaign', 'plan.campaign.military', 'completed',
 '{"facets": {"scale": "large"}, "commander": "Nathanael Greene", "start_date": "1780-12-02", "end_date": "1781-10-19", "strategy": "Winning by losing - exhaust British"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Cowpens Battle Plan
('44441111-0003-0014-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Cowpens Tactical Plan', 'plan.tactical.battle', 'completed',
 '{"facets": {"scale": "medium"}, "commander": "Daniel Morgan", "innovation": "Three-line defense with feigned retreat", "double_envelopment": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Culper Ring Operations Plan
('44441111-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Culper Ring Intelligence Operations', 'plan.intelligence.espionage', 'completed',
 '{"facets": {"scale": "medium"}, "director": "Benjamin Tallmadge", "headquarters": "Long Island", "methods": ["invisible ink", "coded messages", "signal systems"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Smallpox Inoculation Plan
('44441111-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Mass Inoculation Campaign', 'plan.logistics.medical', 'completed',
 '{"facets": {"scale": "large"}, "physician": "Dr. William Shippen Jr.", "location": "Philadelphia", "timing": "Winter 1777", "secrecy": "Maintained to prevent British exploitation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Monmouth Battle Plan
('44441111-0001-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Monmouth Attack on British Rearguard', 'plan.tactical.battle', 'completed',
 '{"facets": {"scale": "large"}, "initial_commander": "Charles Lee", "assumed_by": "Washington", "objective": "Attack British retreating from Philadelphia"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- NEW TASKS
-- ============================================

INSERT INTO onto_tasks (id, project_id, type_key, title, state_key, priority, due_at, props, created_by) VALUES
-- Philadelphia Campaign Tasks
('55555555-0003-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Defend Brandywine Creek Crossings', 'done', 1, '1777-09-11'::timestamptz,
 '{"outcome": "British flanked American position", "lesson": "Better reconnaissance needed"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0008-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Four-Pronged Germantown Attack', 'done', 1, '1777-10-04'::timestamptz,
 '{"outcome": "Attack failed due to fog and coordination issues", "significance": "Impressed France with American fighting spirit"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Southern Campaign Tasks
('55555555-0003-0012-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Overmountain Men Surround Kings Mountain', 'done', 1, '1780-10-07'::timestamptz,
 '{"commanders": ["William Campbell", "John Sevier", "Isaac Shelby"], "outcome": "Ferguson killed, 1000 Loyalists captured"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0014-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Morgan''s Three-Line Defense at Cowpens', 'done', 1, '1781-01-17'::timestamptz,
 '{"militia_orders": "Fire two volleys then withdraw", "cavalry_orders": "Hidden behind ridgeline until signal", "outcome": "Double envelopment achieved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0014-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'William Washington''s Cavalry Strike at Cowpens', 'done', 1, '1781-01-17'::timestamptz,
 '{"action": "Emerged from behind ridge to strike British right flank", "tarleton_duel": true, "outcome": "Completed double envelopment"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0015-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Deploy Three-Line Defense at Guilford Courthouse', 'done', 1, '1781-03-15'::timestamptz,
 '{"line_1": "NC Militia with artillery", "line_2": "VA Militia", "line_3": "Continental regulars", "outcome": "Cornwallis won field but lost 25% of army"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Intelligence Tasks
('55555555-0006-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Nathan Hale Infiltration Mission to New York', 'done', 1, '1776-09-22'::timestamptz,
 '{"outcome": "Captured and executed", "lesson": "Use civilians not soldiers"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Recruit Culper Ring Operatives', 'done', 1, '1778-10-01'::timestamptz,
 '{"recruited": ["Abraham Woodhull", "Robert Townsend", "Anna Strong", "Caleb Brewster", "Austin Roe"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0006-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.create',
 'Develop Code System and Invisible Ink', 'done', 1, '1778-10-15'::timestamptz,
 '{"codes": {"washington": 711, "new_york": 727}, "ink": "Sympathetic stain", "signals": "Clothesline system (Anna Strong)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0006-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Intercept Major John André', 'done', 1, '1780-09-23'::timestamptz,
 '{"captors": ["John Paulding", "Isaac Van Wart", "David Williams"], "location": "Tarrytown, NY", "documents_found": "West Point plans"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0006-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Execute Yorktown Strategic Deception', 'done', 1, '1781-08-19'::timestamptz,
 '{"deception": "Fake camps and dispatches suggesting New York attack", "result": "Clinton held reinforcements", "enabled": "600-mile march to Virginia"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Logistics Tasks
('55555555-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Order Mass Inoculation to Dr. Shippen', 'done', 1, '1777-02-06'::timestamptz,
 '{"recipient": "Dr. William Shippen Jr.", "orders": "Inoculate all Philadelphia recruits", "timing": "Winter - recovery before spring campaigns"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0007-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Inoculate Recruits at Philadelphia', 'done', 1, '1777-03-15'::timestamptz,
 '{"method": "Variolation - controlled infection", "recovery_period": "5 weeks", "mortality_result": "Reduced from 50%+ to less than 2%"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Monmouth Tasks
('55555555-0001-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Lee Attacks British Rearguard', 'done', 1, '1778-06-28'::timestamptz,
 '{"outcome": "Lee retreated without authorization when faced with Cornwallis counterattack"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0004-0002-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Washington Rallies Retreating Troops', 'done', 1, '1778-06-28'::timestamptz,
 '{"confrontation_with_lee": "You ought not to have undertaken it unless you intended to go through with it", "action": "Organized new defensive line", "outcome": "Fought British to standstill"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Mutiny Tasks
('55555555-0001-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.coordinate',
 'Wayne Negotiates with Pennsylvania Line Mutineers', 'done', 1, '1781-01-08'::timestamptz,
 '{"negotiators": ["Anthony Wayne", "Governor Joseph Reed"], "with": "Board of Sergeants", "outcome": "1250 discharged, bloodless resolution"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0006-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.execute',
 'Suppress New Jersey Line Mutiny', 'done', 1, '1781-01-22'::timestamptz,
 '{"commander": "Robert Howe", "method": "Military force", "executions": true, "washington_reasoning": "Prevent contagion of rebellion"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Court-Martial Tasks
('55555555-0001-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'task.admin',
 'Conduct Charles Lee Court-Martial', 'done', 1, '1778-08-12'::timestamptz,
 '{"dates": "July 4 - August 12, 1778", "charges": 3, "verdict": "Guilty on all counts", "sentence": "Suspended one year"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- NEW DECISIONS
-- ============================================

INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
-- Smallpox Inoculation Decision
('66661111-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Order Mass Smallpox Inoculation', '1777-02-05'::timestamptz,
 'Disease killed more soldiers than enemy bullets. Smallpox mortality was 50%+. Washington initially prohibited inoculation but reversed after seeing devastation. Winter timing allowed recovery before spring campaigns. Kept secret to prevent British exploitation.',
 '{"alternatives_considered": ["Continue prohibition", "Selective inoculation"], "outcome": "Mortality reduced to less than 2%", "quote": "We should have more to dread from [smallpox] than from the Sword of the Enemy", "significance": "First mass immunization in American history - may have saved the Revolution"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Establish Culper Ring
('66661111-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Establish Culper Ring', '1778-08-01'::timestamptz,
 'Nathan Hale''s execution proved soldiers unsuitable for espionage. Civilians could move freely in British-held territory. Need for systematic intelligence rather than ad hoc missions. Tallmadge appointed to organize professional network.',
 '{"lesson_from": "Nathan Hale execution", "innovation": "Civilian spy network with codes and invisible ink", "outcome": "Most effective American intelligence network of the war"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Appoint Greene to South
('66661111-0003-0013-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Appoint Greene to Southern Command', '1780-10-14'::timestamptz,
 'Gates disgraced after Camden. South needed best strategic general. Greene''s logistics experience valuable for supply-starved theater. Willing to "win by losing" - exhaust British rather than seek decisive battle.',
 '{"predecessor": "Horatio Gates", "outcome": "Greene won the South without winning a major battle", "strategy": "Strategic retreat and attrition"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Morgan Cowpens Tactics
('66661111-0003-0014-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Morgan''s Decision on Three-Line Defense at Cowpens', '1781-01-16'::timestamptz,
 'Militia could not hold line against British regulars. Give them LIMITED objective - fire two volleys then withdraw. Hidden cavalry to strike at critical moment. Position with river behind to prevent desertion.',
 '{"innovation": "Feigned retreat as tactical deception", "outcome": "Double envelopment - 86% British casualties", "quote": "I have given [Tarleton] a devil of a whipping"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Suppress NJ Mutiny Differently
('66661111-0001-0006-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Suppress New Jersey Mutiny by Force', '1781-01-20'::timestamptz,
 'Pennsylvania mutiny resolved by negotiation set dangerous precedent. Feared "contagion of rebellion" spreading through entire army. Must demonstrate consequences for mutiny. Different response needed to preserve discipline.',
 '{"contrast_with": "Pennsylvania Line Mutiny (negotiated)", "method": "Military suppression with executions", "outcome": "No further mutinies"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Court-Martial Charles Lee
('66661111-0001-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Court-Martial Charles Lee', '1778-06-30'::timestamptz,
 'Lee retreated without orders at Monmouth, nearly causing disaster. Insubordination could not be tolerated. Washington''s authority over subordinates must be established. Lee''s disrespectful letters after battle made court-martial necessary.',
 '{"charges": ["disobedience of orders", "misbehavior before enemy", "disrespect to commander"], "outcome": "Suspended one year - never held field command again"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Yorktown Deception
('66661111-0006-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Decision to Deceive Clinton About Yorktown March', '1781-08-14'::timestamptz,
 'De Grasse signaled fleet sailing to Virginia. Cornwallis trapped at Yorktown. Must prevent Clinton from reinforcing. Fake camps and dispatches to suggest attack on New York. March 600 miles in secret.',
 '{"original_plan": "Attack New York", "catalyst": "De Grasse message", "deception_methods": ["fake camps", "false dispatches", "deliberate misinformation"], "outcome": "Clinton held reinforcements - Cornwallis isolated"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- NEW RISKS
-- ============================================

INSERT INTO onto_risks (id, project_id, title, type_key, probability, impact, state_key, props, created_by) VALUES
-- Arnold Treason Risk
('77771111-0006-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Treason by Senior Officers', 'risk.security.treason', 0.3, 'critical', 'mitigated',
 '{"realized_by": "Benedict Arnold", "target": "West Point", "mitigation": "Culper Ring counterintelligence detected plot", "andre_captured": "September 23, 1780"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Mutiny Risk
('77771111-0001-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Army Mutiny from Unpaid Wages', 'risk.personnel.mutiny', 0.7, 'critical', 'mitigated',
 '{"realized": ["Pennsylvania Line January 1781", "New Jersey Line January 1781"], "mitigation": "Negotiation (PA) and suppression (NJ)", "root_cause": "Years without pay, expired enlistments"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Disease Risk
('77771111-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Smallpox Epidemic Destroys Army', 'risk.health.epidemic', 0.9, 'critical', 'mitigated',
 '{"mortality_if_natural": "50%+", "mitigation": "Mass inoculation February 1777", "result": "Mortality reduced to less than 2%", "washington_quote": "More to dread from it than from the Sword of the Enemy"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Southern Collapse Risk
('77771111-0003-0010-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Southern Theater Complete Collapse', 'risk.military.theater', 0.8, 'critical', 'mitigated',
 '{"realized_partially": ["Charleston fell May 1780", "Camden disaster August 1780"], "mitigation": "Greene appointed December 1780", "turning_point": "Kings Mountain October 1780", "outcome": "Cornwallis driven to Yorktown"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Intelligence Compromise Risk
('77771111-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Spy Network Discovery and Compromise', 'risk.intelligence.exposure', 0.5, 'high', 'mitigated',
 '{"mitigation": ["Compartmentalization", "Washington did not know agent identities", "Codes and invisible ink", "Multiple couriers"], "outcome": "Culper Ring never compromised"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Conway Cabal Risk
('77771111-0004-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Conway Cabal - Attempt to Replace Washington', 'risk.political.command', 0.4, 'high', 'mitigated',
 '{"period": "1777-1778", "conspirators": ["Thomas Conway", "Horatio Gates", "Thomas Mifflin"], "goal": "Replace Washington with Gates after Saratoga", "mitigation": "Washington''s allies in Congress exposed plot", "outcome": "Conspiracy collapsed - Washington strengthened"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- NEW DOCUMENTS
-- ============================================

INSERT INTO onto_documents (id, project_id, title, type_key, state_key, props, created_by) VALUES
-- Smallpox Inoculation Orders
('88881111-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Smallpox Inoculation Orders to Dr. Shippen', 'document.military.orders', 'published',
 '{"date": "1777-02-06", "recipient": "Dr. William Shippen Jr.", "content": "Inoculate all Philadelphia recruits", "significance": "First mass immunization order in American history"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Culper Ring Code Book
('88881111-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Culper Ring Code and Cipher System', 'document.intelligence.cipher', 'published',
 '{"codes": {"711": "Washington", "727": "New York", "728": "Long Island", "721": "Tallmadge"}, "invisible_ink": "Sympathetic stain", "signal_system": "Anna Strong clothesline"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- André Papers
('88881111-0006-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Major John André Papers - Arnold Treason Evidence', 'document.intelligence.captured', 'published',
 '{"captured": "1780-09-23", "location": "Tarrytown, NY", "contents": "West Point plans and correspondence with Arnold", "significance": "Exposed treason of highest-ranking American defector"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Charles Lee Court-Martial Record
('88881111-0001-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Court-Martial Record of Charles Lee', 'document.legal.court_martial', 'published',
 '{"dates": "July 4 - August 12, 1778", "charges": ["disobedience of orders", "misbehavior before enemy", "disrespect to commander"], "verdict": "Guilty on all counts", "sentence": "Suspended from command for one year"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Articles of Confederation
('88881111-0005-0002-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Articles of Confederation', 'document.founding.constitution', 'published',
 '{"adopted": "1777-11-15", "ratified": "1781-03-01", "significance": "First constitution of the United States"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Newburgh Address
('88881111-0004-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111',
 'Newburgh Address - Washington''s Spectacles Speech', 'document.speech.historic', 'published',
 '{"date": "1783-03-15", "location": "Newburgh, NY", "context": "Officers threatening coup over unpaid wages", "quote": "Gentlemen, you will permit me to put on my spectacles, for I have not only grown gray but almost blind in the service of my country", "significance": "Defused potential military coup - preserved civilian control"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Washington Letters on Inoculation
('88881111-0007-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111',
 'Washington Letter on Smallpox Threat', 'document.correspondence.strategic', 'published',
 '{"date": "1777-02", "quote": "Should the disorder infect the Army in the natural way and rage with its usual virulence we should have more to dread from it than from the Sword of the Enemy", "significance": "Shows Washington prioritized disease over battlefield"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- NEW GRAPH EDGES
-- ============================================

INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, project_id, props) VALUES
-- Project → New Goals
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0006-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 6}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0007-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 7}'::jsonb),
('project', '11111111-1111-1111-1111-111111111111', 'has_goal', 'goal', '22221111-0008-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 8}'::jsonb),

-- Goal 3 (Defeat British) → Philadelphia Campaign Milestones
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0005-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 5}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0006-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 6}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0007-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 7}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0008-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 8}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0009-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 9}'::jsonb),

-- Goal 3 → Southern Campaign Milestones
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0010-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 10}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0011-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 11}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0012-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 12}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0013-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 13}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0014-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 14}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0015-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 15}'::jsonb),
('goal', '22221111-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0003-0016-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 16}'::jsonb),

-- Goal 1 (Preserve Army) → Monmouth and Mutiny Milestones
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0005-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 5}'::jsonb),
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0006-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 6}'::jsonb),
('goal', '22221111-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0001-0007-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 7}'::jsonb),

-- Goal 6 (Intelligence) → Intelligence Milestones
('goal', '22221111-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0006-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0006-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('goal', '22221111-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0006-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),
('goal', '22221111-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0006-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 4}'::jsonb),
('goal', '22221111-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0006-0005-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 5}'::jsonb),
('goal', '22221111-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0006-0006-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 6}'::jsonb),
('goal', '22221111-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0006-0007-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 7}'::jsonb),

-- Goal 7 (Logistics) → Logistics Milestones
('goal', '22221111-0007-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0007-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('goal', '22221111-0007-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0007-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('goal', '22221111-0007-0000-0000-000000000001', 'has_milestone', 'milestone', '33331111-0007-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 3}'::jsonb),

-- Milestone → Plans
('milestone', '33331111-0003-0005-0000-000000000001', 'has_plan', 'plan', '44441111-0003-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0010-0000-000000000001', 'has_plan', 'plan', '44441111-0003-0010-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0014-0000-000000000001', 'has_plan', 'plan', '44441111-0003-0014-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0006-0003-0000-000000000001', 'has_plan', 'plan', '44441111-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0007-0001-0000-000000000001', 'has_plan', 'plan', '44441111-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0004-0000-000000000001', 'has_plan', 'plan', '44441111-0001-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- Plan → Tasks
('plan', '44441111-0003-0005-0001-000000000001', 'has_task', 'task', '55555555-0003-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44441111-0003-0005-0001-000000000001', 'has_task', 'task', '55555555-0003-0008-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44441111-0003-0010-0001-000000000001', 'has_task', 'task', '55555555-0003-0012-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('plan', '44441111-0003-0014-0001-000000000001', 'has_task', 'task', '55555555-0003-0014-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0003-0014-0001-000000000001', 'has_task', 'task', '55555555-0003-0014-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0006-0003-0001-000000000001', 'has_task', 'task', '55555555-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0006-0003-0001-000000000001', 'has_task', 'task', '55555555-0006-0003-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0007-0001-0001-000000000001', 'has_task', 'task', '55555555-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0007-0001-0001-000000000001', 'has_task', 'task', '55555555-0007-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),
('plan', '44441111-0001-0004-0001-000000000001', 'has_task', 'task', '55555555-0001-0004-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 1}'::jsonb),
('plan', '44441111-0001-0004-0001-000000000001', 'has_task', 'task', '55555555-0001-0004-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{"order": 2}'::jsonb),

-- Milestone → Tasks (direct)
('milestone', '33331111-0003-0015-0000-000000000001', 'has_task', 'task', '55555555-0003-0015-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0006-0001-0000-000000000001', 'has_task', 'task', '55555555-0006-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0006-0005-0000-000000000001', 'has_task', 'task', '55555555-0006-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0006-0007-0000-000000000001', 'has_task', 'task', '55555555-0006-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0005-0000-000000000001', 'has_task', 'task', '55555555-0001-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0006-0000-000000000001', 'has_task', 'task', '55555555-0001-0006-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0007-0000-000000000001', 'has_task', 'task', '55555555-0001-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- Milestone → Decisions
('milestone', '33331111-0007-0001-0000-000000000001', 'has_decision', 'decision', '66661111-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0006-0003-0000-000000000001', 'has_decision', 'decision', '66661111-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0013-0000-000000000001', 'has_decision', 'decision', '66661111-0003-0013-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0014-0000-000000000001', 'has_decision', 'decision', '66661111-0003-0014-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0006-0000-000000000001', 'has_decision', 'decision', '66661111-0001-0006-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0007-0000-000000000001', 'has_decision', 'decision', '66661111-0001-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0006-0007-0000-000000000001', 'has_decision', 'decision', '66661111-0006-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- Milestone → Risks
('milestone', '33331111-0006-0005-0000-000000000001', 'has_risk', 'risk', '77771111-0006-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0005-0000-000000000001', 'has_risk', 'risk', '77771111-0001-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0007-0001-0000-000000000001', 'has_risk', 'risk', '77771111-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0003-0010-0000-000000000001', 'has_risk', 'risk', '77771111-0003-0010-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0006-0003-0000-000000000001', 'has_risk', 'risk', '77771111-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- Milestone → Documents
('milestone', '33331111-0007-0001-0000-000000000001', 'has_document', 'document', '88881111-0007-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0007-0001-0000-000000000001', 'has_document', 'document', '88881111-0007-0001-0002-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0006-0003-0000-000000000001', 'has_document', 'document', '88881111-0006-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0006-0005-0000-000000000001', 'has_document', 'document', '88881111-0006-0005-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0007-0000-000000000001', 'has_document', 'document', '88881111-0001-0007-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0004-0001-0000-000000000001', 'has_document', 'document', '88881111-0004-0003-0001-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),

-- Cross-cutting relationships
-- Kings Mountain enabled Cowpens
('milestone', '33331111-0003-0012-0000-000000000001', 'enabled', 'milestone', '33331111-0003-0014-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "Kings Mountain turned tide, enabled Morgan''s victory"}'::jsonb),
-- Cowpens enabled Guilford Courthouse
('milestone', '33331111-0003-0014-0000-000000000001', 'enabled', 'milestone', '33331111-0003-0015-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "Destroyed Tarleton, weakened Cornwallis"}'::jsonb),
-- Guilford Courthouse enabled Yorktown
('milestone', '33331111-0003-0015-0000-000000000001', 'enabled', 'milestone', '33331111-0003-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "Crippled Cornwallis, forced march to Virginia"}'::jsonb),
-- Culper Ring enabled Arnold detection
('milestone', '33331111-0006-0003-0000-000000000001', 'enabled', 'milestone', '33331111-0006-0005-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "Spy network provided intelligence leading to André capture"}'::jsonb),
-- Smallpox inoculation enabled Valley Forge survival
('milestone', '33331111-0007-0001-0000-000000000001', 'enabled', 'milestone', '33331111-0001-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "Disease controlled, army preserved through winter"}'::jsonb),
-- Valley Forge enabled Monmouth
('milestone', '33331111-0001-0003-0000-000000000001', 'enabled', 'milestone', '33331111-0001-0004-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "Steuben training proved at Monmouth"}'::jsonb),
-- Yorktown deception enabled Yorktown victory
('milestone', '33331111-0006-0007-0000-000000000001', 'enabled', 'milestone', '33331111-0003-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "Clinton held reinforcements, Cornwallis isolated"}'::jsonb),
-- Nathan Hale failure led to Culper Ring
('milestone', '33331111-0006-0001-0000-000000000001', 'led_to', 'milestone', '33331111-0006-0003-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "Lesson learned: use civilians not soldiers"}'::jsonb),
-- Camden led to Greene appointment
('milestone', '33331111-0003-0011-0000-000000000001', 'led_to', 'milestone', '33331111-0003-0013-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"context": "Gates disgraced, best general assigned"}'::jsonb)
;

-- ============================================
-- COMPLETION NOTICE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Operation American Independence - v3.0 COMPREHENSIVE';
  RAISE NOTICE 'FULL REVOLUTIONARY WAR ONTOLOGY GRAPH';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Project ID: 11111111-1111-1111-1111-111111111111';
  RAISE NOTICE '';
  RAISE NOTICE 'GOALS (8):';
  RAISE NOTICE '  1. Preserve Continental Army';
  RAISE NOTICE '  2. Secure French Alliance';
  RAISE NOTICE '  3. Achieve Independence';
  RAISE NOTICE '  4. Maintain Civilian Control';
  RAISE NOTICE '  5. Establish Naval/Marine Forces';
  RAISE NOTICE '  6. Win the Intelligence War';
  RAISE NOTICE '  7. Solve the Logistics Crisis';
  RAISE NOTICE '  8. Win Hearts and Minds';
  RAISE NOTICE '';
  RAISE NOTICE 'CAMPAIGN HIGHLIGHTS:';
  RAISE NOTICE '  Boston (1775-1776): Siege, Knox artillery train, British evacuation';
  RAISE NOTICE '  New York/New Jersey (1776-1777): Long Island, Trenton, Princeton';
  RAISE NOTICE '  Philadelphia (1777-1778): Brandywine, Germantown, Valley Forge';
  RAISE NOTICE '  Saratoga (1777): Freeman Farm, Bemis Heights, Burgoyne surrender';
  RAISE NOTICE '  Southern (1780-1781): Kings Mountain, Cowpens, Guilford Courthouse';
  RAISE NOTICE '  Yorktown (1781): Franco-American siege, Cornwallis surrender';
  RAISE NOTICE '';
  RAISE NOTICE 'MARINE CORPS HIGHLIGHTS:';
  RAISE NOTICE '  - Founded November 10, 1775 at Tun Tavern';
  RAISE NOTICE '  - First Commandant: Captain Samuel Nicholas';
  RAISE NOTICE '  - First Amphibious Assault: Nassau Raid (March 1776)';
  RAISE NOTICE '  - Bonhomme Richard victory (September 1779)';
  RAISE NOTICE '';
  RAISE NOTICE 'INTELLIGENCE HIGHLIGHTS:';
  RAISE NOTICE '  - Nathan Hale martyrdom (September 1776)';
  RAISE NOTICE '  - Culper Ring spy network (1778-1783)';
  RAISE NOTICE '  - Arnold treason discovered (September 1780)';
  RAISE NOTICE '  - Yorktown deception operation (August 1781)';
  RAISE NOTICE '';
  RAISE NOTICE 'ENTITY COUNTS:';
  RAISE NOTICE '  - 8 Goals';
  RAISE NOTICE '  - 48+ Milestones';
  RAISE NOTICE '  - 21+ Plans';
  RAISE NOTICE '  - 68+ Tasks';
  RAISE NOTICE '  - 16 Decisions';
  RAISE NOTICE '  - 16 Risks';
  RAISE NOTICE '  - 16 Documents';
  RAISE NOTICE '  - 180+ Graph Edges';
  RAISE NOTICE '';
  RAISE NOTICE 'GRAPH DEPTH: 6 levels';
  RAISE NOTICE '  Project → Goals → Milestones → Plans → Sub-Plans → Tasks';
  RAISE NOTICE '';
  RAISE NOTICE 'CROSS-CUTTING RELATIONSHIPS:';
  RAISE NOTICE '  - Causal chains (Kings Mountain → Cowpens → Guilford → Yorktown)';
  RAISE NOTICE '  - Intelligence enabling operations (Culper Ring → Arnold capture)';
  RAISE NOTICE '  - Logistics supporting campaigns (Smallpox inoculation → Valley Forge)';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Project is marked as is_public = TRUE for display on homepage';
  RAISE NOTICE '==============================================';
END$$;

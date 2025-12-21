-- supabase/migrations/20251220_seed_hail_mary_example_project.sql
-- ============================================
-- Project Hail Mary Example Project
-- Based on the novel by Andy Weir (2021)
-- "Save Earth. Save Erid. Science is the universal language."
-- ============================================
-- Version 2.0 - Humanity's Last Hope Ontology (Enriched Edition)
--
-- DESIGN PRINCIPLE: This graph is deeply nested.
-- - Goals connect to Project
-- - Milestones connect to Goals (not directly to Project)
-- - Plans connect to Milestones
-- - Tasks connect to Plans/Milestones
-- - Decisions/Risks connect to Milestones
-- - Documents connect to Milestones
--
-- SCOPE: The Petrova Problem → Hail Mary Mission → First Contact → Salvation
-- A hard science fiction example demonstrating crisis management at galactic scale
--
-- SCIENTIFIC ACCURACY: Based on Andy Weir's meticulous research
-- - Astrophage: 10^15 joules/kg energy storage at 2 Kelvin
-- - Tau Ceti: 12 light-years from Earth (real star)
-- - 40 Eridani: 16.3 light-years (real triple star system)
-- - Eridian environment: 29 atmospheres ammonia, ~290K temperature

-- ============================================
-- CLEANUP (for idempotent re-runs)
-- ============================================
DELETE FROM onto_edges WHERE project_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM onto_tasks WHERE project_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM onto_documents WHERE project_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM onto_decisions WHERE project_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM onto_risks WHERE project_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM onto_plans WHERE project_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM onto_milestones WHERE project_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM onto_goals WHERE project_id = '33333333-3333-3333-3333-333333333333';
DELETE FROM onto_projects WHERE id = '33333333-3333-3333-3333-333333333333';

-- ============================================
-- PROJECT
-- ============================================
INSERT INTO onto_projects (
  id, org_id, name, description, type_key,
  state_key, props, start_at, end_at, is_public, created_by
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  NULL,
  'Project Hail Mary: Save Two Worlds',
  'Humanity''s desperate mission to save Earth from extinction. When the Sun begins to dim due to Astrophage - an alien microbe that consumes stellar energy - scientist Ryland Grace awakens alone on the spacecraft Hail Mary at Tau Ceti, 12 light-years from Earth. With amnesia and two dead crewmates, he must piece together his mission. What he discovers changes everything: another civilization faces the same extinction, and science truly is the universal language.',
  'project.fiction.scifi',
  'completed',
  '{
    "facets": {"context": "fiction", "scale": "epic", "stage": "complete"},
    "protagonist": "Dr. Ryland Grace (molecular biologist, former science teacher)",
    "director": "Eva Stratt (Petrova Taskforce - unlimited global authority)",
    "source": "Novel by Andy Weir (2021), hard science fiction",
    "threat": "Astrophage - single-celled microbe that consumes stellar energy (10^15 J/kg storage at 2K)",
    "sun_dimming": "4% reduction projected, ice age in 30 years if unchecked",
    "destination": "Tau Ceti (12 light-years) - only nearby star not dimming",
    "spacecraft": "Hail Mary (Astrophage-powered spin drive, 1.5g acceleration)",
    "crew": ["Dr. Ryland Grace", "Commander Yao", "Engineer Olesya Ilyukhina"],
    "ally": "Rocky (Eridian engineer, ~400kg, xenonite exoskeleton, ammonia-based)",
    "eridian_star": "40 Eridani (16.3 light-years from Earth)",
    "solution": "Taumoeba - predator organism from Adrian (Tau Ceti e) that consumes Astrophage",
    "journey_time": "4 years subjective, 13 years Earth-time",
    "coma_method": "Medically induced with memory-affecting drugs",
    "graph_depth": 6,
    "themes": ["Science as universal language", "Sacrifice for the greater good", "Cooperation across difference", "The threat becomes the solution"],
    "quote": "I penetrate the ridiculous, the absurd, and the impossible. Because nobody else can."
  }'::jsonb,
  '2024-01-01'::timestamptz,
  '2040-12-31'::timestamptz,
  TRUE,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GOALS (5 Strategic Objectives)
-- ============================================
INSERT INTO onto_goals (id, project_id, name, type_key, props, created_by) VALUES
-- Goal 1: Understand the Threat
('33333333-0001-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Understand the Petrova Problem', 'goal.strategic.research',
 '{"priority": "critical", "state": "achieved", "phase": "Discovery", "timeframe": "Years 1-2", "key_question": "Why is the Sun dimming?", "outcome": "Astrophage identified as single-celled alien microbe consuming stellar energy", "lead_scientist": "Dr. Ryland Grace", "discovery_method": "Venus atmospheric samples"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 2: Build the Mission
('33333333-0002-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Build and Launch Hail Mary', 'goal.strategic.engineering',
 '{"priority": "critical", "state": "achieved", "phase": "Construction", "timeframe": "Years 2-4", "innovation": "First Astrophage-powered spacecraft", "crew_capacity": 3, "propulsion": "Spin drive using Astrophage IR emission", "acceleration": "1.5g continuous", "construction_sites": "Global collaboration under Stratt authority"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 3: Reach Tau Ceti
('33333333-0003-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Reach Tau Ceti and Investigate', 'goal.strategic.exploration',
 '{"priority": "critical", "state": "achieved", "phase": "Journey", "distance": "12 light-years", "travel_time": "4 years subjective (relativistic)", "crew_survival": "1 of 3 (Yao and Ilyukhina died in coma)", "key_discovery": "First contact with Eridian civilization", "target_rationale": "Only nearby star not dimming from Astrophage"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 4: Find a Solution
('33333333-0004-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Find a Solution to Save Earth', 'goal.strategic.primary',
 '{"priority": "critical", "state": "achieved", "phase": "Discovery", "partner": "Rocky (Eridian engineer)", "solution": "Taumoeba - natural predator that consumes Astrophage", "source_planet": "Adrian (Tau Ceti e)", "collection_method": "Beetle probes with 10km xenonite chain", "validation": "Laboratory cultivation confirms Astrophage consumption"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 5: Overcome the Nitrogen Problem
('33333333-0005-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Develop Nitrogen-Resistant Taumoeba', 'goal.strategic.engineering',
 '{"priority": "critical", "state": "achieved", "phase": "Crisis Resolution", "problem": "Natural Taumoeba dies instantly in nitrogen-rich atmospheres", "implication": "Cannot deploy to Venus or Threeworld without adaptation", "solution": "Directed evolution through selective pressure", "method": "Expose successive generations to increasing nitrogen concentrations", "result": "Taumoeba-82.5 strain survives 8% nitrogen", "scientist": "Dr. Ryland Grace"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 6: Save Both Civilizations
('33333333-0006-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Save Earth and Erid', 'goal.strategic.cooperation',
 '{"priority": "critical", "state": "achieved", "phase": "Resolution", "sacrifice": "Grace gives up return fuel to rescue Rocky", "delivery_method": "Modified beetle probes as autonomous return vessels", "earth_outcome": "Sun restored to normal luminosity", "erid_outcome": "40 Eridani saved", "confirmation": "Rocky reports success 16 years later", "grace_fate": "Lives as teacher on Erid", "theme": "Friendship transcends species"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MILESTONES - GOAL 1: Understand the Threat
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES
('33333333-0001-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Detection of Petrova Line', 'milestone.discovery.anomaly', '2024-01-15'::timestamptz,
 '{"description": "Constant-wavelength infrared emission detected streaming from Sun toward Venus", "discoverer": "Dr. Irina Petrova (Russian astronomer)", "wavelength": "25.984 microns - impossibly precise for natural phenomenon", "significance": "First evidence something artificial or biological is at work", "implication": "Energy is being transported from the Sun"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0001-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Sun Dimming Confirmed', 'milestone.crisis.confirmation', '2024-02-01'::timestamptz,
 '{"impact": "Solar output reducing by measurable percentage", "projection": "4% reduction would cause global ice age", "timeline": "Earth uninhabitable in approximately 30 years", "affected_stars": "Multiple stars in vicinity also dimming", "response": "Unprecedented global emergency declared"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0001-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Venus Probe Discovers Astrophage', 'milestone.discovery.organism', '2024-02-06'::timestamptz,
 '{"finding": "Alien microbes collected from Venus upper atmosphere", "name_origin": "Astrophage = star-eater (Greek)", "properties": "Single-celled organism, absorbs electromagnetic radiation, stores at 2 Kelvin", "energy_density": "10^15 joules per kilogram (far exceeding nuclear fuel)", "propulsion": "Emits infrared light for thrust, travels between Sun and Venus"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0001-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Grace Identifies Astrophage Biology', 'milestone.research.breakthrough', '2024-03-11'::timestamptz,
 '{"scientist": "Dr. Ryland Grace (molecular biologist)", "key_insight": "Astrophage is not from our solar system - truly alien life", "lifecycle": "Absorbs stellar energy, stores in exotic state at 2K, breeds on Venus, returns to Sun", "breeding_location": "Venus atmosphere provides ideal conditions", "breakthrough": "Understanding lifecycle enables potential countermeasures"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0001-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Tau Ceti Identified as Unaffected', 'milestone.discovery.target', '2024-04-16'::timestamptz,
 '{"observation": "Spectroscopic analysis shows Tau Ceti is NOT dimming", "distance": "12 light-years from Earth", "star_type": "G-type main sequence (similar to Sun)", "hypothesis": "Something at Tau Ceti naturally controls Astrophage", "critical_question": "What is protecting Tau Ceti?", "decision": "Send mission to investigate and find solution"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 2: Build the Mission
-- ============================================
('33333333-0002-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Petrova Taskforce Formed', 'milestone.organization.founding', '2024-05-21'::timestamptz,
 '{"director": "Eva Stratt (Dutch administrator)", "authority": "Unprecedented - unlimited global power over all nations", "mandate": "Save humanity by any means necessary", "resources": "Can commandeer any facility, personnel, or funding worldwide", "oversight": "None - operates above all governments", "justification": "Existential threat requires unified response without bureaucracy"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Astrophage Fuel Discovery', 'milestone.engineering.propulsion', '2024-06-26'::timestamptz,
 '{"breakthrough": "Astrophage can power spacecraft - 10^15 J/kg energy density", "comparison": "Far exceeds chemical fuels (gasoline: 46 MJ/kg) and nuclear", "mechanism": "Heat Astrophage, it emits IR light, use mirrors to direct thrust", "irony": "The threat consuming our Sun becomes our only hope for interstellar travel", "implication": "Tau Ceti mission becomes physically possible"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Hail Mary Construction', 'milestone.engineering.spacecraft', '2024-07-03'::timestamptz,
 '{"design": "Astrophage-powered spin drive vessel", "crew_capacity": 3, "acceleration": "1.5g continuous thrust", "destination": "Tau Ceti (12 light-years)", "travel_time": "4 years subjective due to relativistic effects", "features": ["Full research laboratory", "Coma pods for journey", "Beetle probes for sample collection", "Centrifuge for artificial gravity"], "construction": "Fastest spacecraft ever built under global emergency"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Crew Selection and Training', 'milestone.personnel.selection', '2024-08-08'::timestamptz,
 '{"crew": ["Dr. Ryland Grace (molecular biologist/science lead)", "Commander Yao (Chinese military, mission commander)", "Engineer Olesya Ilyukhina (Russian, spacecraft systems)"], "selection_criteria": "Scientific expertise, psychological resilience, willingness for one-way mission", "coma_protocol": "Medically induced with memory-affecting drugs", "grace_problem": "Initially refused mission, had to be coerced", "training_duration": "Intensive but compressed due to timeline"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Hail Mary Launch', 'milestone.mission.launch', '2024-09-13'::timestamptz,
 '{"mission_type": "One-way suicide mission (intentional)", "objective": "Reach Tau Ceti, find solution, transmit data back to Earth via beetles", "crew_status": "Placed in medically induced coma", "expected_return": "None - insufficient fuel for round trip", "backup_plan": "Beetles programmed to return with solution autonomously if crew fails"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 3: Reach Tau Ceti
-- ============================================
('33333333-0003-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Grace Awakens with Amnesia', 'milestone.crisis.awakening', '2024-10-18'::timestamptz,
 '{"location": "Aboard Hail Mary at Tau Ceti", "condition": "Complete retrograde amnesia from coma drugs", "discovery": "Two crewmates (Yao and Ilyukhina) died during journey - coma failure", "bodies": "Preserved in bags, later given space burial", "challenge": "Alone, amnesiac, must piece together mission and identity", "first_words": "What is two plus two? (computer testing cognition)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Memory Recovery', 'milestone.personal.recovery', '2024-11-23'::timestamptz,
 '{"method": "Gradual flashbacks triggered by environmental cues", "key_memories": ["His profession as science teacher", "Astrophage research under Stratt", "Eva Stratt forcing him onto mission", "His cowardice in refusing to volunteer"], "revelation": "Grace tried to back out - Stratt used memory-affecting drugs to ensure compliance", "emotional_arc": "From confusion to purpose to guilt to redemption"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Arrival at Tau Ceti', 'milestone.mission.arrival', '2024-12-28'::timestamptz,
 '{"system": "Tau Ceti (12 light-years from Earth)", "star_status": "Confirmed unaffected by Astrophage", "planets_observed": "Multiple, including Adrian (Tau Ceti e)", "key_question": "What natural mechanism protects this star?", "mission_status": "Can proceed despite crew loss"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Detection of Alien Spacecraft', 'milestone.discovery.first_contact', '2024-01-05'::timestamptz,
 '{"designation": "Blip-A (Grace''s informal name)", "design": "Radically different from human engineering", "origin": "Unknown at detection", "significance": "First evidence of extraterrestrial intelligence in human history", "grace_reaction": "Terror, excitement, scientific curiosity", "approach": "Cautious observation, attempts mathematical communication"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'First Contact with Rocky', 'milestone.diplomacy.contact', '2024-02-10'::timestamptz,
 '{"alien_name": "Rocky (nickname given by Grace)", "species": "Eridian (from 40 Eridani system, 16.3 light-years from Earth)", "home_planet": "Erid - twice Earth gravity, 29 atmospheres ammonia, ~290K", "biology": "Rock-like exoskeleton, ~400kg mass, ammonia-based metabolism, perceives via echolocation (no eyes)", "communication_challenge": "Eridians use musical chord sounds, not visual language", "breakthrough": "Grace builds chord-to-English audio translator using math as common ground", "relationship": "Scientific partnership evolves into deep friendship"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0006-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Shared Problem Revealed', 'milestone.discovery.alliance', '2024-03-15'::timestamptz,
 '{"revelation": "40 Eridani (Rocky''s star) is ALSO being consumed by Astrophage", "eridian_timeline": "72 years before extinction (vs Earth''s 30) due to thicker atmosphere", "implication": "Two civilizations independently sent missions to Tau Ceti for same reason", "convergent_evolution": "Both species developed similar scientific methods", "decision": "Combine resources and expertise to find solution together", "rocky_quote": "You and me...same same. Save star. Save people."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 4: Find a Solution
-- ============================================
('33333333-0004-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Grace-Rocky Partnership Established', 'milestone.cooperation.formation', '2024-04-20'::timestamptz,
 '{"basis": "Shared scientific methodology - math and physics work the same everywhere", "communication_evolution": "From pointing at stars → visual symbols → audio chord translation", "rocky_skills": "Master engineer, built xenonite material (stronger than any human alloy)", "grace_skills": "Molecular biology, problem-solving, creative thinking", "trust_basis": "Both risking everything to save their species"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Joint Laboratory Operations', 'milestone.research.collaboration', '2024-05-25'::timestamptz,
 '{"method": "Connected Hail Mary and Blip-A via xenonite tunnel", "challenge": "Incompatible atmospheres - 29 atm ammonia (Rocky) vs 1 atm oxygen (Grace)", "solution": "Rocky builds airlock system, each can visit other''s ship briefly", "xenonite": "Eridian wonder material - created by mixing two liquids, hardens into ultra-strong solid", "shared_resources": "Samples, scientific equipment, complementary expertise"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Engine Crisis and Mutual Rescue', 'milestone.crisis.survival', '2024-06-02'::timestamptz,
 '{"incident": "Sampling Adrian causes engine malfunction - fuel tank breach from heat", "crisis": "Uncontrolled Astrophage thrust, Grace pinned by acceleration", "grace_danger": "Suffocating, trapped, approaching death", "rocky_sacrifice": "Enters human atmosphere (fatal to him) to save Grace", "rocky_collapses": "29-atm body in 1-atm environment - catastrophic", "grace_choice": "Repressurizes ship with ammonia, severely damages own lungs", "outcome": "Both survive through mutual sacrifice", "significance": "Trust and friendship cemented forever"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Discovery of Taumoeba', 'milestone.discovery.solution', '2024-07-07'::timestamptz,
 '{"organism": "Taumoeba (named by Grace - Tau Ceti amoeba)", "property": "Single-celled predator that consumes Astrophage as food source", "source": "Adrian (Tau Ceti e) - collected using beetle probes with 10km xenonite chain", "mechanism": "Taumoeba evolved to eat Astrophage, preventing it from reaching Tau Ceti", "significance": "Natural ecosystem control - why Tau Ceti is unaffected", "solution_potential": "Seed Taumoeba around affected stars to consume Astrophage"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Taumoeba Cultivation Success', 'milestone.research.validation', '2024-08-12'::timestamptz,
 '{"experiment": "Grow Taumoeba populations in Hail Mary lab", "result": "Successfully reproduces and actively consumes Astrophage samples", "rate": "Consumption rate sufficient to save a star", "challenge": "Finding right conditions for long-term cultivation", "breakthrough": "Grace and Rocky determine optimal environment", "next_step": "Prepare Taumoeba for delivery to Earth and Erid"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 5: Nitrogen Problem
-- ============================================
('33333333-0005-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Nitrogen Lethality Discovery', 'milestone.crisis.discovery', '2024-09-17'::timestamptz,
 '{"test": "Expose Taumoeba to simulated Venus atmosphere", "result": "Taumoeba dies instantly upon nitrogen exposure", "nitrogen_content": "Venus atmosphere contains 3.5% nitrogen, Threeworld 8%", "implication": "Natural Taumoeba cannot survive on either breeding planet", "crisis": "Solution found but cannot be deployed without modification"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Directed Evolution Strategy', 'milestone.research.methodology', '2024-10-22'::timestamptz,
 '{"inspiration": "Antibiotic-resistant bacteria on Earth", "hypothesis": "Selective pressure can create nitrogen-tolerant Taumoeba", "method": "Expose generations to sub-lethal nitrogen, select survivors", "goal": "Create strain surviving 8% nitrogen for Threeworld", "secondary_goal": "3.5% nitrogen for Venus"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Fuel Contamination Crisis', 'milestone.crisis.contamination', '2024-11-27'::timestamptz,
 '{"discovery": "Taumoeba escaped containment, contaminated Astrophage fuel tanks", "effect": "Fuel being consumed, ship losing power", "severity": "Complete power loss, life support failing", "immediate_response": "Flood compartments with pure nitrogen to kill Taumoeba", "rocky_help": "Rocky donates Astrophage fuel to restore power"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Beetle Repurposing as Thrusters', 'milestone.engineering.adaptation', '2024-12-04'::timestamptz,
 '{"problem": "Main propulsion damaged, ship spinning uncontrollably", "solution": "Repurpose beetle probes as emergency thrusters", "EVA_required": "Grace performs dangerous spacewalk during spin", "beetles_used": "John, Paul, and George (Ringo kept for data return)", "rocky_contribution": "Modifies beetle controls for acoustic commands", "outcome": "Ship stabilized, limited propulsion restored"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Taumoeba-82.5 Strain Achieved', 'milestone.research.breakthrough', '2025-01-09'::timestamptz,
 '{"strain_name": "Taumoeba-82.5", "nitrogen_tolerance": "Survives 8.25% nitrogen concentration", "venus_strain": "Taumoeba-35 (3.5% nitrogen) also created", "threeworld_compatible": "Yes - Erid breeding planet has 8% nitrogen", "earth_compatible": "Yes - Venus has 3.5% nitrogen", "method": "Weeks of directed evolution experiments"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0006-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Xenonite Permeation Discovery', 'milestone.crisis.discovery', '2025-02-14'::timestamptz,
 '{"discovery": "Evolved Taumoeba-82.5 can penetrate xenonite at molecular level", "implication": "Rocky''s ship is vulnerable to contamination", "difference": "Natural Taumoeba cannot penetrate xenonite", "evolution_side_effect": "Nitrogen resistance enabled xenonite permeation", "rocky_danger": "His fuel tanks are xenonite - could be contaminated"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 6: Save Both Civilizations
-- ============================================
('33333333-0006-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Rocky''s Ship Disabled', 'milestone.crisis.emergency', '2025-03-19'::timestamptz,
 '{"detection": "Rocky''s engine signature vanishes from sensors", "diagnosis": "Taumoeba-82.5 contaminated xenonite fuel tanks", "effect": "Total propulsion and power loss", "rocky_status": "Stranded, dying without power", "grace_options": ["Continue to Earth, abandon Rocky", "Turn around, attempt rescue"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'The Impossible Choice', 'milestone.decision.sacrifice', '2025-04-24'::timestamptz,
 '{"situation": "Rocky stranded, Grace has fuel to return to Earth OR rescue Rocky", "options": ["Return to Earth as hero, let Rocky and Eridians die", "Turn around, rescue Rocky, strand self forever"], "grace_choice": "Sacrifice - turns ship around", "reasoning": "Cannot abandon friend to death", "irony": "Coward who refused mission now makes ultimate sacrifice", "beetle_launch": "Launches remaining beetle with solution before turning around"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Rescue of Rocky', 'milestone.mission.rescue', '2025-05-01'::timestamptz,
 '{"search": "Grace uses Petrovascope as IR beacon to locate Blip-A", "duration": "Agonizing search through vast empty space", "discovery": "Detects faint reflected signal from Rocky''s ship", "EVA": "Grace approaches in spacewalk, knocks on hull", "response": "Faint chord sound - Rocky is alive", "extraction": "Connect airlock tunnel, Rocky emerges injured but alive"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Beetle Probes Launched to Earth', 'milestone.mission.transmission', '2025-06-06'::timestamptz,
 '{"payload": "Taumoeba-35 cultures, breeding protocols, deployment instructions", "probe": "Ringo (last remaining beetle)", "navigation": "Pre-programmed autonomous return to Earth", "data": "Complete scientific documentation of Astrophage and Taumoeba", "purpose": "Ensure humanity receives solution regardless of Grace''s fate"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Survival Solution: Taumoeba as Food', 'milestone.survival.adaptation', '2025-07-11'::timestamptz,
 '{"discovery": "Rocky''s ship contains 22 million kg of Taumoeba", "revelation": "Grace can eat Taumoeba - contains human-compatible nutrients", "irony": "The organism that caused crisis becomes salvation", "nutrition": "Sufficient protein and nutrients for long-term survival", "journey": "Grace can survive trip to Erid by eating Taumoeba"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0006-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Grace Arrives on Erid', 'milestone.survival.new_home', '2025-08-16'::timestamptz,
 '{"journey": "Rocky brings Grace to Erid on his repaired ship", "environment": "29 atm ammonia, 2x Earth gravity, 210°C, pitch black", "initial_survival": "Continues eating Taumoeba", "long_term": "Eridians synthesize Earth food from Hail Mary archives", "habitat": "Xenonite dome with Earth-like lighting and atmosphere", "status": "First human resident of alien world"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0007-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Confirmation: Both Stars Saved', 'milestone.success.confirmation', '2025-09-21'::timestamptz,
 '{"earth_sun": "Returned to normal luminosity", "eridian_star": "40 Eridani restored", "timeline": "16 years after Grace''s sacrifice", "method": "Long-range astronomical observation from Erid", "messenger": "Rocky brings news to Grace personally", "grace_reaction": "Joy, relief, validation - sacrifice was not in vain"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0008-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Return Option Offered', 'milestone.decision.homecoming', '2025-10-26'::timestamptz,
 '{"offer": "Earth builds ship to bring Grace home after success confirmed", "travel_time": "Another multi-year journey possible", "grace_choice": "Chooses to stay on Erid", "reasoning": "This is who I am - a teacher. These students need me.", "role": "Science teacher to young Eridians", "legacy": "Living bridge between two civilizations"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0009-0000-000000000001', '33333333-3333-3333-3333-333333333333',
 'Grace Becomes Teacher on Erid', 'milestone.legacy.teaching', '2025-11-03'::timestamptz,
 '{"classroom": "Xenonite dome with Earth-like conditions", "students": "Young Eridians learning human science", "first_lesson": "What is the speed of light?", "full_circle": "Middle school teacher becomes interstellar educator", "final_words": "I am the teacher. This is what I do.", "redemption": "Once a coward, now living embodiment of sacrifice and duty"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PLANS
-- ============================================
INSERT INTO onto_plans (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Research Plans
('33333333-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Astrophage Research Program', 'plan.research.biology', 'completed',
 '{"objective": "Fully characterize Astrophage biology, lifecycle, and vulnerabilities", "lead": "Dr. Ryland Grace (molecular biologist)", "methods": ["Spectroscopic analysis", "Laboratory cultivation", "Energy absorption measurement", "Temperature response testing"], "key_findings": ["Stores energy at 2K", "10^15 J/kg density", "Breeds on Venus", "Propels via IR emission"], "outcome": "Complete understanding enabled spacecraft design"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0001-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Interstellar Survey Plan', 'plan.research.astronomy', 'completed',
 '{"objective": "Identify stars not affected by Astrophage dimming", "method": "Comprehensive spectroscopic survey of nearby stars", "finding": "Tau Ceti (12 ly) shows no dimming while similar stars do", "hypothesis": "Something at Tau Ceti naturally controls or consumes Astrophage", "implication": "Investigation could reveal solution", "decision": "Tau Ceti becomes mission target"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Engineering Plans
('33333333-0002-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Hail Mary Spacecraft Design', 'plan.engineering.spacecraft', 'completed',
 '{"propulsion": "Spin drive - heats Astrophage, directs IR emission via mirrors", "acceleration": "1.5g continuous (not 15 m/s²)", "travel_time": "4 years subjective to Tau Ceti", "life_support": "Three coma pods for medically induced hibernation", "laboratory": "Full research capability - spectroscopy, cultivation, analysis", "probes": "Beetle probes for remote sampling and potential message return", "fuel": "Astrophage tanks - the threat becomes the fuel"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Crew Preparation Protocol', 'plan.personnel.preparation', 'completed',
 '{"coma_induction": "Medically induced hibernation for multi-year journey", "coma_drugs": "Include memory-affecting compounds", "grace_situation": "Refused mission, Stratt used drugs to ensure compliance", "ethical_cost": "Violated consent for survival of species", "training": "Intensive but compressed due to extinction timeline", "psychological_prep": "One-way mission acceptance (except Grace who was coerced)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- First Contact Plans
('33333333-0003-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'First Contact Protocol', 'plan.diplomacy.contact', 'completed',
 '{"approach": "Cautious, non-threatening scientific exchange", "assumption": "Any civilization that reached Tau Ceti is intelligent and technological", "communication_start": "Mathematical concepts as universal language", "initial_signals": "Prime numbers, geometric shapes, physical constants", "principle": "Demonstrate intelligence and peaceful intent", "flexibility": "Adapt to alien sensory modalities"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Cross-Species Communication Development', 'plan.communication.translation', 'completed',
 '{"challenge": "Eridians perceive through echolocation (sound), not light (vision)", "discovery": "Eridian language uses musical chords for words", "solution": "Grace builds chord-to-English audio translator", "common_ground": "Mathematics, physics, chemistry work the same for both species", "vocabulary_building": "Start with numbers, expand to objects, then abstract concepts", "outcome": "Full conversational ability achieved between Grace and Rocky"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Solution Plans
('33333333-0004-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Joint Research Operations', 'plan.research.collaborative', 'completed',
 '{"structure": "Connect Hail Mary and Blip-A via xenonite tunnel", "atmosphere_management": "Rocky builds airlock - 29 atm ammonia vs 1 atm oxygen", "xenonite": "Eridian wonder material stronger than any human alloy", "collaboration": "Share samples, equipment, and complementary expertise", "grace_role": "Molecular biology, creative problem-solving", "rocky_role": "Engineering, materials science, spacecraft repair"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Taumoeba Deployment Strategy', 'plan.solution.deployment', 'completed',
 '{"cultivation": "Grow Taumoeba populations in controlled conditions", "earth_delivery": "Beetle probes modified as autonomous return vessels with Taumoeba farms", "erid_delivery": "Rocky carries Taumoeba solution on return journey", "targets": ["Earth''s Sun (via beetles)", "40 Eridani (via Rocky)"], "redundancy": "Multiple beetles ensure solution reaches Earth", "instructions": "Include breeding protocols and deployment guidelines"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Nitrogen Resistance Plans
('33333333-0005-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Directed Evolution Program', 'plan.research.evolution', 'completed',
 '{"objective": "Create nitrogen-tolerant Taumoeba strains", "method": "Selective pressure through incremental nitrogen exposure", "inspiration": "Antibiotic-resistant bacteria development on Earth", "generations": "Multiple breeding cycles with increasing nitrogen", "targets": ["3.5% nitrogen for Venus (Taumoeba-35)", "8% nitrogen for Threeworld (Taumoeba-82.5)"], "success_criteria": "Survival and reproduction in target nitrogen levels"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Fuel Contamination Response Protocol', 'plan.emergency.response', 'completed',
 '{"trigger": "Taumoeba detected in fuel supply", "immediate_action": "Disable life support, flood with pure nitrogen", "assessment": "Test each fuel tank individually for contamination", "isolation": "Seal and jettison severely contaminated tanks", "power_restoration": "Accept Rocky''s Astrophage donation", "propulsion_recovery": "Repurpose beetle probes as emergency thrusters"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0003-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Beetle Thruster Conversion', 'plan.engineering.emergency', 'completed',
 '{"problem": "Main propulsion disabled, ship in uncontrolled spin", "solution": "Convert beetle probes to crude thrusters", "beetles_sacrificed": "John, Paul, George (3 of 4)", "beetle_preserved": "Ringo (for data return to Earth)", "modifications": "Bypass computer controls, enable acoustic command", "EVA_required": "Multiple dangerous spacewalks during spin", "outcome": "Ship stabilized, limited maneuverability restored"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Rescue Plans
('33333333-0006-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Rocky Rescue Operation', 'plan.mission.rescue', 'completed',
 '{"trigger": "Rocky''s engine signature disappears", "assessment": "Xenonite permeation by Taumoeba-82.5 contaminated fuel", "decision": "Grace turns around to search for Rocky", "search_method": "Use Petrovascope as IR beacon, scan for reflections", "rendezvous": "Locate Blip-A, perform EVA approach", "extraction": "Connect airlock tunnel, retrieve Rocky", "sacrifice": "Grace loses all fuel for Earth return"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Beetle Data Return Protocol', 'plan.mission.datareturn', 'completed',
 '{"probe": "Ringo (last remaining beetle)", "payload": ["Taumoeba-35 cultures", "Breeding protocols", "Deployment instructions", "Complete Astrophage documentation", "First contact records", "Grace''s final message"], "navigation": "Pre-programmed autonomous course to Earth", "redundancy": "Multiple data copies in sealed containers", "purpose": "Ensure humanity receives solution regardless of crew fate"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Survival Plans
('33333333-0006-0003-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Grace Survival on Erid', 'plan.survival.alien_world', 'completed',
 '{"environment": "29 atm ammonia, 2x gravity, 210°C, pitch black", "initial_food": "Eat Taumoeba (contains human-compatible nutrients)", "long_term_food": "Eridians synthesize Earth food from Hail Mary archives", "habitat": "Xenonite dome with Earth lighting and 1 atm oxygen", "medical": "Eridians clone human muscle tissue for meburgers", "resource": "Hail Mary computer archives contain complete Earth knowledge", "outcome": "Sustainable indefinite survival on alien world"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Adrian Sampling Plan
('33333333-0004-0003-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Adrian Atmosphere Sampling', 'plan.research.sampling', 'completed',
 '{"objective": "Collect samples from Adrian (Tau Ceti e) upper atmosphere", "target_altitude": "91.2 km - Astrophage breeding concentration zone", "method": "10km xenonite chain with sample collector", "orbital_requirements": "Maintain 12.6 km/s orbital velocity", "risks": ["Atmospheric drag", "Engine proximity to atmosphere", "Chain control"], "EVA": "Grace performs spacewalk for chain deployment", "outcome": "Successful sample collection, Taumoeba discovered"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TASKS
-- ============================================
INSERT INTO onto_tasks (id, project_id, type_key, title, state_key, priority, due_at, props, created_by) VALUES
-- Research Tasks
('33333333-0001-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.research.analysis', 'Analyze Venus probe samples', 'done', 1, '2024-02-01'::timestamptz,
 '{"finding": "Alien single-celled microbes identified in Venus upper atmosphere", "properties": "Absorb electromagnetic radiation, store at 2 Kelvin", "significance": "First confirmed extraterrestrial life", "scientist": "Dr. Ryland Grace"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0001-0001-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.research.biology', 'Determine Astrophage breeding mechanism', 'done', 1, '2024-02-15'::timestamptz,
 '{"scientist": "Dr. Ryland Grace", "method": "Laboratory cultivation and observation", "result": "Astrophage breeds in Venus atmosphere, then returns to Sun via IR propulsion", "lifecycle": "Sun absorption → Venus breeding → return to Sun"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0001-0001-0003-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.research.physics', 'Measure Astrophage energy storage', 'done', 1, '2024-03-01'::timestamptz,
 '{"finding": "10^15 joules per kilogram - far exceeds any known energy storage", "storage_temperature": "2 Kelvin (near absolute zero)", "implication": "Viable as spacecraft fuel - enables interstellar travel", "comparison": "Exceeds nuclear fuel by orders of magnitude"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0001-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.astronomy.observation', 'Survey nearby stars for dimming', 'done', 1, '2024-03-15'::timestamptz,
 '{"method": "Comprehensive spectroscopic analysis of all nearby stars", "key_finding": "Tau Ceti (12 light-years) shows NO dimming while similar stars do", "implication": "Something at Tau Ceti controls Astrophage naturally", "recommendation": "Investigate Tau Ceti as potential source of solution"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Engineering Tasks
('33333333-0002-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.engineering.propulsion', 'Design Astrophage propulsion system', 'done', 1, '2025-01-01'::timestamptz,
 '{"innovation": "Spin drive - first Astrophage-powered engine", "mechanism": "Heat Astrophage, it emits IR light, use mirrors to direct thrust", "acceleration": "1.5g continuous thrust", "irony": "The organism consuming our Sun becomes our means of interstellar travel"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0001-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.engineering.life_support', 'Build coma pod life support', 'done', 1, '2025-03-01'::timestamptz,
 '{"duration": "4+ year capability for interstellar journey", "monitoring": "Automated health tracking and intervention", "drugs": "Include memory-affecting compounds (controversial for Grace)", "pods": "Three units for full crew complement"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0001-0003-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.engineering.construction', 'Construct onboard research laboratory', 'done', 1, '2025-06-01'::timestamptz,
 '{"equipment": "Full spectroscopy, cultivation chambers, microscopy, analysis systems", "purpose": "Enable in-situ research at Tau Ceti without Earth communication", "design": "Self-sufficient scientific capability", "samples": "Storage for Astrophage and any discovered organisms"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.personnel.selection', 'Select and train crew', 'done', 1, '2025-09-01'::timestamptz,
 '{"selected": ["Dr. Ryland Grace (science)", "Commander Yao (command)", "Olesya Ilyukhina (engineering)"], "criteria": "Scientific expertise, psychological resilience, willingness for suicide mission", "grace_issue": "Refused mission - had to be coerced by Stratt", "training": "Compressed intensive preparation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- First Contact Tasks
('33333333-0003-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.diplomacy.approach', 'Establish non-threatening approach to alien vessel', 'done', 1, '2030-01-01'::timestamptz,
 '{"method": "Slow, predictable movements - demonstrate non-hostile intent", "signals": "Mathematical patterns (universal language)", "response": "Alien vessel (Blip-A) mirrors behavior", "outcome": "Mutual recognition of intelligence and peaceful intent"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.communication.visual', 'Develop visual communication symbols', 'done', 2, '2030-01-15'::timestamptz,
 '{"elements": "Star maps, numbers, chemical formulas, geometric shapes", "initial_success": "Established basic concepts and shared understanding", "limitation_discovered": "Rocky perceives through echolocation, not vision - can''t see Grace''s drawings", "adaptation_needed": "Switch to audio-based communication"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0002-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.communication.device', 'Build chord-to-English translator', 'done', 1, '2030-02-01'::timestamptz,
 '{"breakthrough": "Discovered Eridian language uses musical chords for words", "device": "Real-time audio translation system built by Grace", "method": "Map chord patterns to English vocabulary", "result": "Full conversational ability with Rocky achieved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Solution Tasks
('33333333-0004-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.engineering.construction', 'Connect Hail Mary and Blip-A via tunnel', 'done', 1, '2030-02-15'::timestamptz,
 '{"challenge": "29 atm ammonia (Rocky) vs 1 atm oxygen (Grace) - incompatible atmospheres", "solution": "Rocky builds xenonite tunnel and airlock system", "xenonite": "Eridian wonder material - mix two liquids, hardens into ultra-strong solid", "result": "Shared workspace enabling collaboration"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0001-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.engineering.repair', 'Purge soot from Rocky''s burned radiator', 'done', 1, '2030-03-01'::timestamptz,
 '{"crisis": "Engine malfunction caused radiator damage during Adrian sampling", "problem": "Soot blocking heat dissipation - ship overheating", "grace_solution": "Devised method to purge soot using available materials", "significance": "Human creativity complementing Eridian engineering"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0001-0003-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.engineering.innovation', 'Rocky modifies generator for Astrophage power', 'done', 1, '2030-03-15'::timestamptz,
 '{"problem": "Hail Mary fuel tank breach - damaged fuel system", "rocky_solution": "Builds Eridian-style Astrophage power generator", "materials": "Xenonite construction using Eridian methods", "outcome": "Ship functional again, can complete mission"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.research.sampling', 'Collect samples from Adrian (Tau Ceti planet)', 'done', 1, '2030-04-01'::timestamptz,
 '{"planet": "Adrian (Tau Ceti e)", "method": "Beetle probes with 10km xenonite collection chain", "finding": "Atmospheric samples contain unknown organism", "naming": "Grace names it Taumoeba (Tau Ceti amoeba)", "significance": "Potential solution to Astrophage problem"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0002-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.research.cultivation', 'Cultivate Taumoeba in controlled conditions', 'done', 1, '2030-04-15'::timestamptz,
 '{"experiment": "Grow Taumoeba population in laboratory", "result": "Successfully reproduces AND actively consumes Astrophage", "mechanism": "Taumoeba evolved to eat Astrophage as food source", "validation": "Consumption rate sufficient to save a star", "implication": "This is why Tau Ceti is unaffected - natural predator controls Astrophage"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Adrian Sampling Tasks
('33333333-0004-0003-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.engineering.manufacturing', 'Manufacture 10km xenonite sampling chain', 'done', 1, '2030-03-20'::timestamptz,
 '{"length": "10 kilometers", "material": "Xenonite (Eridian super-material)", "constructor": "Rocky", "purpose": "Extend from orbit into Adrian''s atmosphere", "properties": "Strong enough to withstand atmospheric drag at 12.6 km/s"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0003-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.EVA.deployment', 'Perform EVA for chain deployment', 'done', 1, '2030-03-25'::timestamptz,
 '{"astronaut": "Grace", "conditions": "1.4g gravity field, vacuum, extreme precision required", "task": "Deploy and manage 10km xenonite chain during Adrian orbit", "risks": ["Spin control", "Atmospheric drag", "Engine proximity"], "outcome": "Successful chain deployment and sample collection"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0003-0003-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.navigation.calculation', 'Calculate orbital mechanics for sampling', 'done', 1, '2030-03-18'::timestamptz,
 '{"scientist": "Rocky", "parameters": ["Target altitude: 91.2 km", "Orbital velocity: 12.6 km/s", "Chain length compensation", "Drag coefficient estimation"], "challenge": "Balance between chain reaching atmosphere and ship avoiding burnup", "outcome": "Precise trajectory enabling successful sample collection"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Nitrogen Crisis Tasks
('33333333-0005-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.research.testing', 'Test Taumoeba in simulated Venus atmosphere', 'done', 1, '2030-05-01'::timestamptz,
 '{"objective": "Verify Taumoeba survival in Venus conditions", "atmosphere": "Simulated Venus with 3.5% nitrogen", "result": "Taumoeba dies instantly upon nitrogen exposure", "crisis": "Solution found but cannot be deployed without modification"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0002-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.research.design', 'Design directed evolution experiment', 'done', 1, '2030-05-05'::timestamptz,
 '{"inspiration": "Antibiotic-resistant bacteria on Earth", "hypothesis": "Selective pressure can create nitrogen-tolerant strains", "method": "Expose generations to incrementally increasing nitrogen", "equipment": "Rocky builds precision atmosphere control chambers"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0002-0003-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.research.breeding', 'Breed Taumoeba-35 strain (Venus-compatible)', 'done', 1, '2030-06-01'::timestamptz,
 '{"target": "3.5% nitrogen tolerance", "method": "Successive generations with increasing nitrogen exposure", "generations": "Multiple breeding cycles", "result": "Taumoeba-35 thrives in simulated Venus atmosphere", "milestone": "First nitrogen-tolerant strain achieved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0002-0004-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.research.breeding', 'Breed Taumoeba-82.5 strain (Threeworld-compatible)', 'done', 1, '2030-06-15'::timestamptz,
 '{"target": "8.25% nitrogen tolerance (Threeworld has 8%)", "method": "Continue selective pressure beyond Taumoeba-35", "result": "Taumoeba-82.5 survives in both Venus and Threeworld conditions", "significance": "Both Earth and Erid can now be saved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Fuel Contamination Tasks
('33333333-0005-0003-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.emergency.sterilization', 'Flood compartments with pure nitrogen', 'done', 1, '2030-07-01'::timestamptz,
 '{"trigger": "Taumoeba detected consuming Astrophage fuel", "action": "Disable life support, depressurize, flood with nitrogen", "purpose": "Kill escaped Taumoeba using their nitrogen vulnerability", "risk": "Grace must survive without life support during process"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0003-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.emergency.assessment', 'Test and isolate contaminated fuel tanks', 'done', 1, '2030-07-02'::timestamptz,
 '{"method": "Test each tank individually for Taumoeba presence", "findings": "Multiple tanks contaminated at varying levels", "action": "Seal contaminated tanks, jettison most severely compromised", "outcome": "Remaining fuel preserved but insufficient for Earth return"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0003-0003-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.cooperation.resource', 'Accept Rocky''s Astrophage fuel donation', 'done', 1, '2030-07-03'::timestamptz,
 '{"situation": "Hail Mary has lost power, life support failing", "rocky_action": "Donates Astrophage from his sealed supply", "significance": "First interspecies resource sharing in history", "outcome": "Power restored, Grace survives"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Beetle Thruster Conversion Tasks
('33333333-0005-0004-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.EVA.retrieval', 'Perform EVA during ship spin to retrieve beetles', 'done', 1, '2030-07-10'::timestamptz,
 '{"conditions": "Ship spinning uncontrollably, centrifugal forces extreme", "objective": "Retrieve beetles John, Paul, George from external mounts", "difficulty": "Life-threatening - any mistake means death", "outcome": "Three beetles successfully retrieved despite spin"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0004-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.engineering.disassembly', 'Dismantle beetles for thruster components', 'done', 1, '2030-07-11'::timestamptz,
 '{"beetles_sacrificed": "John, Paul, George", "components_extracted": ["Astrophage fuel supply", "Propulsion systems", "Control electronics"], "beetle_preserved": "Ringo (for data return)", "purpose": "Create makeshift thrusters for ship stabilization"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0004-0003-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.engineering.modification', 'Rocky modifies beetle controls for acoustic command', 'done', 1, '2030-07-12'::timestamptz,
 '{"engineer": "Rocky", "modification": "Bypass original computer controls", "new_control": "Enable acoustic commands from Hail Mary communication systems", "outcome": "Beetles respond to chord-based instructions"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0004-0004-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.EVA.installation', 'Mount beetles as external thrusters', 'done', 1, '2030-07-13'::timestamptz,
 '{"task": "Position beetle propulsion systems around Hail Mary hull", "method": "Strategic placement for optimal rotational control", "result": "Ship can now stabilize spin and perform limited maneuvers", "limitation": "Crude thrusters, insufficient for full propulsion restoration"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Rescue Operation Tasks
('33333333-0006-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.navigation.rescue', 'Turn Hail Mary around to search for Rocky', 'done', 1, '2030-08-01'::timestamptz,
 '{"decision": "Grace chooses rescue over Earth return", "maneuver": "Complete 180-degree course reversal", "cost": "Uses fuel needed for Earth journey", "consequence": "Grace permanently stranded, cannot return home"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0001-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.search.detection', 'Use Petrovascope as IR beacon to locate Blip-A', 'done', 1, '2030-08-02'::timestamptz,
 '{"method": "Sweep space with Petrovascope, search for reflected IR signal", "challenge": "Vast empty space, tiny target", "duration": "Hours of agonizing scanning", "breakthrough": "Detect faint Petrova-wavelength reflection from Rocky''s ship"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0001-0003-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.EVA.rescue', 'Approach Blip-A and confirm Rocky alive', 'done', 1, '2030-08-03'::timestamptz,
 '{"approach": "Grace performs spacewalk to Rocky''s drifting ship", "method": "Knock on hull, listen for response", "agonizing_wait": "Silence, then faint chord sound", "confirmation": "Rocky is alive but injured and powerless"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0001-0004-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.EVA.extraction', 'Connect airlock tunnel and extract Rocky', 'done', 1, '2030-08-03'::timestamptz,
 '{"method": "Extend xenonite airlock tunnel between ships", "challenge": "Different atmospheric requirements", "extraction": "Rocky emerges injured but alive", "emotional_moment": "Friends reunited against all odds"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Final Data Return Tasks
('33333333-0006-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.mission.launch', 'Launch Ringo beetle with solution to Earth', 'done', 1, '2030-07-20'::timestamptz,
 '{"probe": "Ringo (last remaining beetle)", "payload": ["Taumoeba-35 cultures", "Complete breeding protocols", "Deployment instructions", "Astrophage documentation"], "timing": "Launched before Grace turns around for rescue", "purpose": "Ensure humanity receives solution regardless of Grace''s fate"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0002-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.communication.farewell', 'Record final message for Earth', 'done', 1, '2030-07-20'::timestamptz,
 '{"author": "Grace", "content": ["Explanation of solution", "First contact account", "Apology for initial cowardice", "Hope for humanity''s future"], "medium": "Recorded in beetle data storage", "tone": "Hopeful despite personal sacrifice"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Erid Survival Tasks
('33333333-0006-0003-0001-000000000002', '33333333-3333-3333-3333-333333333333',
 'task.survival.nutrition', 'Eat Taumoeba for survival nutrition', 'done', 2, '2030-09-01'::timestamptz,
 '{"discovery": "Rocky''s ship contains 22 million kg of Taumoeba", "revelation": "Taumoeba is edible and nutritious for humans", "irony": "Organism that caused crisis becomes salvation", "duration": "Grace survives on Taumoeba during journey to Erid"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0003-0002-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.engineering.habitat', 'Eridians construct xenonite habitat dome', 'done', 1, '2040-01-01'::timestamptz,
 '{"constructor": "Eridian engineers using Rocky''s designs", "material": "Xenonite (strong, gas-tight, transparent to sound)", "environment": "Earth-like lighting, 1 atm oxygen, comfortable temperature", "features": ["Sealed atmosphere", "Food synthesis capability", "Communication systems"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0003-0003-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.engineering.food', 'Synthesize Earth food from Hail Mary archives', 'done', 2, '2040-02-01'::timestamptz,
 '{"resource": "Hail Mary computer archives contain Earth agricultural knowledge", "method": "Eridians reverse-engineer human nutrition requirements", "innovation": "Clone human muscle tissue for meburgers", "outcome": "Sustainable long-term food supply for Grace"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0003-0004-000000000001', '33333333-3333-3333-3333-333333333333',
 'task.education.teaching', 'Grace begins teaching Eridian students', 'done', 2, '2040-06-01'::timestamptz,
 '{"role": "Science teacher to young Eridians", "classroom": "Xenonite dome with Earth-like conditions", "first_lesson": "What is the speed of light?", "significance": "Human knowledge passes to alien civilization", "fulfillment": "Grace finds his true purpose"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DECISIONS
-- ============================================
INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
('33333333-0001-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Form Petrova Taskforce with Unlimited Authority', '2024-02-01'::timestamptz,
 'Existential threat requires unified response without bureaucracy',
 '{"type": "decision.organization.emergency", "state": "decided", "decider": "World governments (unanimous)", "director": "Eva Stratt (Dutch administrator)", "authority": "Unprecedented - unlimited power over all nations, resources, personnel", "controversy": "Suspends normal legal protections", "outcome": "Enables rapid Hail Mary construction"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Use Astrophage as Spacecraft Fuel', '2024-06-01'::timestamptz,
 'Only known method for interstellar travel - 10^15 J/kg energy density enables journey to Tau Ceti',
 '{"type": "decision.engineering.propulsion", "state": "decided", "decider": "Petrova Taskforce engineering team", "irony": "The organism consuming our Sun becomes our only hope for travel", "mechanism": "Heat to emit IR, direct with mirrors", "risk": "Working with the dangerous organism threatening humanity", "outcome": "Enables Hail Mary mission"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0002-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Coerce Grace onto Mission with Memory Drugs', '2025-10-01'::timestamptz,
 'Humanity needs him - billions of lives vs one person''s consent. Grace is only person who fully understands Astrophage biology',
 '{"type": "decision.ethics.coercion", "state": "decided", "decider": "Eva Stratt", "context": "Grace refused the suicide mission out of fear", "method": "Coma drugs include memory-affecting compounds", "moral_cost": "Violated fundamental human rights for species survival", "stratt_quote": "I will do whatever it takes"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Trust Rocky and Share Information Fully', '2030-01-15'::timestamptz,
 'Rocky faces identical existential threat - cooperation is logical. Science is the universal language',
 '{"type": "decision.diplomacy.trust", "state": "decided", "decider": "Grace (unilateral, no Earth guidance)", "context": "First contact with alien intelligence", "risk": "Alien could be hostile or deceptive", "principle": "Shared methodology indicates trustworthiness", "outcome": "Partnership saves two civilizations"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Risk Ammonia Exposure to Save Rocky', '2030-03-01'::timestamptz,
 'Rocky collapsed in human atmosphere - Grace floods ship with 29 atm ammonia despite fatal risk to himself',
 '{"type": "decision.personal.sacrifice", "state": "decided", "decider": "Grace (split-second decision)", "context": "Rocky dying in 1 atm environment, needs 29 atm ammonia", "consequence": "Severe lung damage to Grace from ammonia exposure", "outcome": "Both survive, trust and friendship cemented", "symbolism": "Both willing to die for the other"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Sacrifice Return to Earth to Save Erid', '2030-07-25'::timestamptz,
 'Cannot let his friend and an entire civilization die when he can save them - the ultimate sacrifice',
 '{"type": "decision.moral.ultimate", "state": "decided", "decider": "Grace", "situation": "Rocky''s ship damaged, needs fuel to return to Erid with Taumoeba solution", "options": ["Keep fuel, return to Earth alone, let Rocky and all Eridians die", "Give fuel to Rocky, strand self forever, save billions of Eridian lives"], "choice": "Give fuel to Rocky - strand himself", "irony": "The coward who refused to volunteer now willingly makes ultimate sacrifice", "rocky_reaction": "Refuses at first, heartbroken, but accepts when Grace insists"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0002-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Choose to Remain on Erid as Teacher', '2040-06-01'::timestamptz,
 'This is who I truly am - a teacher. These students need me.',
 '{"type": "decision.personal.legacy", "state": "decided", "decider": "Grace", "context": "16 years after sacrifice, Earth builds ship to bring him home", "options": ["Return to Earth as hero", "Stay on Erid with Rocky and students"], "choice": "Stay on Erid", "role": "Science teacher to young Eridians in special habitat", "full_circle": "Once a middle school science teacher, now teaches next generation of alien civilization", "quote": "I am the teacher. This is what I do."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Additional Decisions for Key Plot Points
('33333333-0006-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Sacrifice Beetles as Emergency Thrusters', '2030-07-10'::timestamptz,
 'Ship stability required for survival; one beetle sufficient for Earth data return',
 '{"type": "decision.engineering.emergency", "state": "decided", "decider": "Grace with Rocky''s engineering support", "situation": "Main propulsion disabled, ship in deadly uncontrolled spin", "resources": "Four beetle probes (John, Paul, George, Ringo)", "options": ["Keep all beetles for data return", "Sacrifice some for ship stabilization"], "choice": "Sacrifice John, Paul, George as thrusters, keep Ringo", "irony": "Named after Beatles - three give their lives"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0002-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Accept Food from Aliens (Eat Taumoeba)', '2030-08-15'::timestamptz,
 'No other food available - Taumoeba contains human-compatible proteins and nutrients',
 '{"type": "decision.survival.nutrition", "state": "decided", "decider": "Grace (no real choice)", "situation": "Stranded in space, no human food available", "discovery": "Rocky''s ship contains 22 million kg of Taumoeba", "test": "Grace tastes Taumoeba - not toxic, surprisingly edible", "outcome": "Grace survives journey to Erid on Taumoeba diet", "irony": "Organism that caused fuel crisis becomes life-saving food"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0003-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Launch Ringo Before Rescue Attempt', '2030-07-20'::timestamptz,
 'If rescue fails, humanity still gets saved - mission success must be ensured first',
 '{"type": "decision.mission.priority", "state": "decided", "decider": "Grace", "situation": "Rocky''s ship disabled, Grace must choose: launch beetle first or rescue immediately", "choice": "Launch Ringo with solution before turning around", "payload": "Taumoeba-35, breeding protocols, first contact documentation", "sequence": "Launch → turnaround → search → rescue", "outcome": "Earth receives solution, rescue also succeeds"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0004-0001-000000000003', '33333333-3333-3333-3333-333333333333',
 'Conduct Directed Evolution Despite Risks', '2030-05-10'::timestamptz,
 'Without adaptation, both civilizations die anyway - the risk is acceptable',
 '{"type": "decision.research.ethics", "state": "decided", "decider": "Grace and Rocky (jointly)", "problem": "Natural Taumoeba dies in nitrogen - useless for Venus and Threeworld", "proposed_solution": "Directed evolution to create nitrogen-tolerant strains", "risk_identified": "Evolution might create dangerous new capabilities", "risk_realized": "Taumoeba-82.5 gained xenonite permeation ability", "outcome": "Success with serious side effect (xenonite contamination)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RISKS
-- ============================================
INSERT INTO onto_risks (id, project_id, title, type_key, probability, impact, state_key, props, created_by) VALUES
('33333333-0001-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'No Solution Exists at Tau Ceti', 'risk.mission.failure', 0.4, 'critical', 'closed',
 '{"scenario": "Tau Ceti immunity is unexplainable or cannot be replicated", "stakes": "If no solution found, Earth faces extinction in 30 years", "mitigation": "None - mission is humanity''s last and only hope", "actual_outcome": "Solution found - Taumoeba is natural Astrophage predator", "resolution": "Risk closed with discovery"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Crew Death During Journey', 'risk.personnel.mortality', 0.3, 'high', 'occurred',
 '{"anticipated_risk": "Multi-year coma may cause fatalities", "occurrence": "Yao and Ilyukhina died during 4-year coma transit", "cause": "Coma system failure - bodies maintained but consciousness lost", "survivor": "Grace alone (ironic - the one who refused to go)", "impact": "Mission continues with single operator", "mitigation_in_future": "Improve coma pod reliability"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Hostile First Contact', 'risk.diplomacy.conflict', 0.3, 'critical', 'closed',
 '{"scenario": "Aliens attack, refuse cooperation, or deceive", "potential_outcomes": ["Military conflict", "Sabotage", "Being used as resource"], "mitigation": "Cautious approach, demonstrate intelligence and peaceful intent through math", "actual_outcome": "Rocky becomes trusted ally and friend", "significance": "First contact in human history is peaceful scientific partnership"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0002-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Communication Impossible', 'risk.technical.communication', 0.5, 'high', 'closed',
 '{"scenario": "Cannot establish meaningful communication with alien", "challenge": "Eridians perceive via echolocation (sound), not vision like humans", "additional_challenge": "Eridian language uses musical chords, not human phonemes", "solution": "Grace builds chord-to-English audio translator using math as bridge", "outcome": "Full conversational ability achieved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Atmospheric Incompatibility Fatal', 'risk.environmental.atmosphere', 0.6, 'critical', 'mitigated',
 '{"hazard": "Rocky requires 29-atm ammonia atmosphere - instantly lethal to humans", "reverse_hazard": "Grace requires 1-atm oxygen - causes catastrophic decompression for Rocky", "mitigation": "Xenonite airlock system built by Rocky", "incident": "Rocky entered human atmosphere to save Grace, nearly died", "counter_incident": "Grace flooded ship with ammonia to save Rocky, severely damaged lungs", "symbolism": "Both willing to die to save the other"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0002-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Spacecraft Systems Failure', 'risk.technical.systems', 0.4, 'critical', 'occurred',
 '{"occurrence": "Engine malfunction during Adrian sampling, fuel tank breach from heat", "consequences": ["Uncontrolled acceleration", "Fuel system damage", "Radiator soot blockage"], "response": "Rocky and Grace collaborate - Rocky rebuilds systems, Grace devises creative solutions", "outcome": "Mission continues through partnership", "lesson": "Two species'' complementary skills overcome problems neither could solve alone"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Grace Starvation on Erid', 'risk.survival.nutrition', 0.7, 'critical', 'mitigated',
 '{"problem": "All Eridian food is toxic to humans - incompatible biochemistry", "no_return": "Grace has no fuel to return to Earth for food", "immediate_solution": "Eat Taumoeba - discovered to contain human-compatible nutrients", "long_term_solution": "Eridians use Hail Mary knowledge archive to synthesize Earth-compatible food", "construction": "Build sealed human habitat on Erid", "outcome": "Sustainable indefinite survival on alien world"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0002-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Earth Solution Fails to Arrive', 'risk.mission.failure', 0.2, 'critical', 'closed',
 '{"scenario": "Beetle probes fail during 12-light-year journey or Taumoeba dies in transit", "mitigation": "Multiple redundant beetles launched", "stakes": "If fails, humanity goes extinct", "actual_outcome": "At least one beetle reached Earth successfully", "confirmation": "Rocky reports Earth''s Sun restored to normal luminosity 16 years later", "significance": "Grace''s sacrifice was not in vain"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Additional Risks for Comprehensive Coverage
('33333333-0006-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Taumoeba Fuel Tank Contamination', 'risk.technical.contamination', 0.6, 'critical', 'occurred',
 '{"hazard": "Taumoeba escapes containment into Astrophage fuel supply", "occurrence": "Taumoeba consumed significant portion of fuel before detection", "detection": "Power fluctuations, fuel gauge readings dropping", "immediate_impact": "Life support failing, ship losing power", "response": "Flood with nitrogen to kill Taumoeba (exploiting their weakness)", "recovery": "Rocky donates Astrophage to restore power", "lesson": "Biological containment critical when working with fuel-eating organisms"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0002-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Xenonite Permeation by Evolved Taumoeba', 'risk.technical.evolution', 0.3, 'critical', 'occurred',
 '{"hazard": "Directed evolution creates Taumoeba capable of penetrating xenonite", "mechanism": "Nitrogen resistance mutations enabled molecular-level xenonite infiltration", "unexpected": "Natural Taumoeba cannot penetrate xenonite - only evolved strain", "impact": "Rocky''s xenonite fuel tanks contaminated, ship disabled", "detection": "Rocky''s engine signature disappears during return journey", "cascade": "Forces Grace to choose between Earth return and rescue"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0003-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Adrian Sampling Chain Failure', 'risk.engineering.sampling', 0.4, 'high', 'mitigated',
 '{"hazard": "10km xenonite chain breaks or fails during Adrian atmospheric sampling", "consequences": ["Lost sampling capability", "Potential debris damage to ship", "Mission failure if no samples collected"], "mitigation": "Rocky''s superior xenonite engineering, careful orbital mechanics", "tension": "Chain deployed at extreme depth into atmosphere", "actual_outcome": "Successful sample collection, Taumoeba discovered"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0004-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'EVA During Ship Spin', 'risk.personnel.EVA', 0.7, 'critical', 'mitigated',
 '{"hazard": "Grace must perform spacewalk while ship is spinning uncontrollably", "forces": "Centrifugal force throwing astronaut away from ship", "equipment": "Suit tether, timing, and precision critical", "task": "Retrieve beetle probes for thruster conversion", "grace_approach": "Time movements with spin, use ship geometry", "outcome": "Successful beetle retrieval despite extreme danger", "count": "Multiple EVAs required throughout mission"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0005-0001-000000000004', '33333333-3333-3333-3333-333333333333',
 'Rocky Cannot Be Located for Rescue', 'risk.mission.search', 0.5, 'critical', 'closed',
 '{"hazard": "Disabled Blip-A drifting in vast empty space without power or beacon", "search_area": "Enormous volume, tiny target", "method": "Use Petrovascope as IR source, scan for reflections", "duration": "Hours of agonizing scanning", "emotional_stakes": "Rocky dying while Grace searches", "breakthrough": "Detect faint Petrova-wavelength reflection", "outcome": "Successful location and rescue"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0006-0001-000000000001', '33333333-3333-3333-3333-333333333333',
 'Memory Loss from Coma Drugs', 'risk.medical.cognition', 0.8, 'high', 'occurred',
 '{"hazard": "Coma drugs cause permanent retrograde amnesia", "occurrence": "Grace awakens with no memory of mission, identity, or skills", "severity": "Complete memory loss initially", "recovery": "Gradual flashbacks triggered by environmental cues", "timeline": "Days to weeks for full memory recovery", "purpose": "Plot device, but also represents Stratt''s ethical violation", "implications": "Grace must rediscover his mission while alone in space"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENTS
-- ============================================
INSERT INTO onto_documents (id, project_id, title, type_key, state_key, props, created_by) VALUES
('33333333-0001-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Petrova Line Discovery Report', 'document.scientific.discovery', 'published',
 '{"author": "Dr. Irina Petrova (Russian astronomer)", "finding": "Constant-wavelength infrared emission (25.984 microns) streaming from Sun toward Venus", "wavelength_precision": "Impossibly precise for natural phenomenon", "significance": "First detection of what would be named Astrophage", "implication": "Something is transporting energy from the Sun"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0001-0002-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Astrophage Biology Paper', 'document.scientific.research', 'published',
 '{"author": "Dr. Ryland Grace (molecular biologist)", "title": "Complete Characterization of Astrophage Lifecycle and Energy Storage", "key_findings": ["Single-celled alien organism", "Absorbs stellar energy", "Stores at 2 Kelvin in exotic state", "10^15 J/kg energy density", "Breeds in Venus atmosphere", "Propels via IR emission"], "breakthrough": "First complete understanding of extraterrestrial life"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0002-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Hail Mary Mission Specifications', 'document.engineering.specification', 'published',
 '{"spacecraft": "Hail Mary", "propulsion": "Spin drive - Astrophage-powered via IR emission and mirror direction", "acceleration": "1.5g continuous", "destination": "Tau Ceti (12 light-years)", "travel_time": "4 years subjective", "crew": 3, "mission_type": "One-way investigation", "equipment": ["Research laboratory", "Coma pods", "Beetle probes"], "fuel": "Astrophage tanks - the threat becomes the fuel"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'First Contact Log', 'document.diplomatic.log', 'published',
 '{"author": "Dr. Ryland Grace", "subject": "Initial contact and communication with Eridian vessel (Blip-A) and occupant (Rocky)", "communication_evolution": ["Mathematical signals", "Visual symbols (limited by Rocky''s sound-based perception)", "Audio chord-to-English translator"], "key_discovery": "Eridians face same Astrophage threat to their star (40 Eridani)", "outcome": "Scientific partnership and friendship established"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0003-0002-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Eridian-Human Dictionary', 'document.linguistic.reference', 'published',
 '{"languages": ["English", "Eridian (musical chord-based)"], "format": "Audio translation mappings", "entries": "Thousands of translated concepts - numbers, objects, abstract ideas", "creators": "Dr. Ryland Grace and Rocky (collaborative effort)", "method": "Start with mathematics, expand through shared scientific observations", "significance": "First interspecies dictionary in history"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0004-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Taumoeba Discovery Report', 'document.scientific.breakthrough', 'published',
 '{"discoverers": "Dr. Ryland Grace and Rocky (joint discovery)", "organism": "Taumoeba (Tau Ceti amoeba) - single-celled Astrophage predator", "source": "Adrian (Tau Ceti e) atmosphere, collected via beetle probe with 10km xenonite chain", "mechanism": "Taumoeba evolved to consume Astrophage as food source", "significance": "Explains why Tau Ceti is unaffected - natural population control", "application": "Can be seeded around affected stars to eliminate Astrophage"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Instructions for Taumoeba Deployment', 'document.operational.protocol', 'published',
 '{"author": "Dr. Ryland Grace", "payload": "Beetle probes containing Taumoeba breeding populations", "destination": "Earth (autonomous 12-light-year journey)", "instructions": ["Cultivation environment requirements", "Breeding protocols", "Solar deployment procedures", "Expected consumption rates"], "redundancy": "Multiple beetles with identical payloads", "purpose": "Save humanity even if Grace cannot return"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0002-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Grace''s Final Message to Earth', 'document.personal.farewell', 'published',
 '{"author": "Dr. Ryland Grace", "context": "Message sent with beetle probes, knowing he cannot return", "content": ["Explanation of Taumoeba solution and deployment", "Account of first contact with Eridians", "Apology for initial cowardice, gratitude for second chance", "Description of sacrifice for Rocky and Erid", "Hope for humanity''s future"], "tone": "Hopeful and at peace despite personal cost", "closing": "I was a teacher. This is what I do."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Additional Documents for Comprehensive Coverage
('33333333-0005-0003-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Xenonite Material Specifications', 'document.engineering.specification', 'published',
 '{"author": "Rocky (transcribed by Grace)", "material": "Xenonite - Eridian wonder material", "creation": "Mix two liquid components, hardens into ultra-strong solid", "properties": ["Stronger than any human alloy", "Gas-tight", "Transparent to sound", "Can be formed into any shape"], "applications": ["Ship hull", "Airlocks", "Sampling chain", "Human habitat dome"], "limitation": "Evolved Taumoeba-82.5 can permeate at molecular level"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0005-0004-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Taumoeba Evolution Log', 'document.scientific.log', 'published',
 '{"author": "Dr. Ryland Grace", "objective": "Create nitrogen-tolerant Taumoeba strains", "methodology": "Directed evolution through selective pressure", "generations_tracked": "Hundreds of cycles over weeks", "key_milestones": ["Taumoeba-5 (first survivors at 0.5% nitrogen)", "Taumoeba-35 (Venus-compatible at 3.5%)", "Taumoeba-82.5 (Threeworld-compatible at 8.25%)"], "unexpected_discovery": "Taumoeba-82.5 gained ability to permeate xenonite", "success": "Both Earth and Erid can now receive compatible strains"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Beetle Probe Operations Manual', 'document.engineering.manual', 'published',
 '{"author": "Hail Mary mission engineering team", "probes": ["John", "Paul", "George", "Ringo"], "primary_function": "Autonomous sample collection and data return", "propulsion": "Astrophage-powered mini-drives", "range": "Interstellar (12+ light-years)", "sampling_capability": "Atmospheric collection with xenonite chain extension", "data_capacity": "Complete mission documentation plus samples", "fate": {"John": "Converted to emergency thruster", "Paul": "Converted to emergency thruster", "George": "Converted to emergency thruster", "Ringo": "Launched to Earth with Taumoeba solution"}}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0002-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Eridian Biology Reference', 'document.scientific.reference', 'published',
 '{"subject": "Rocky and Eridian species physiology", "home_system": "40 Eridani (triple star, 16.3 light-years from Earth)", "home_planet": "Erid (twice Earth gravity, 29 atmospheres, ammonia atmosphere)", "temperature": "~290K average", "body_mass": "~400 kg", "exoskeleton": "Xenonite composition", "senses": "Echolocation (no eyes - planet is pitch black)", "communication": "Musical chord-based language", "lifespan": "Unknown, but includes multiple generations for interstellar missions", "diet": "Ammonia-based biochemistry", "reproduction": "Egg-laying species"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0003-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Blip-A Spacecraft Analysis', 'document.engineering.analysis', 'published',
 '{"author": "Dr. Ryland Grace", "designation": "Blip-A (informal)", "species": "Eridian", "propulsion": "Astrophage-powered (same principle as Hail Mary)", "hull": "Xenonite construction", "atmosphere": "29 atm ammonia", "crew": "Rocky (solo mission like Grace)", "mission": "Investigate Tau Ceti for Astrophage solution", "notable_features": ["No windows (Eridians perceive via sound)", "Pressurized for high-gravity environment"], "outcome": "Disabled by Taumoeba-82.5 contamination, rescued by Grace"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0004-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Adrian Planetary Survey', 'document.scientific.survey', 'published',
 '{"planet": "Adrian (Tau Ceti e)", "distance_from_star": "Habitable zone equivalent", "atmosphere": "Contains Astrophage breeding layer at ~91km altitude", "key_discovery": "Home of Taumoeba - natural Astrophage predator", "ecosystem": "Taumoeba consumes Astrophage, preventing star dimming", "sampling_method": "10km xenonite chain from orbital altitude", "significance": "Explains why Tau Ceti is unaffected - natural population control", "samples_collected": "Multiple Taumoeba specimens for cultivation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('33333333-0006-0005-0001-000000000005', '33333333-3333-3333-3333-333333333333',
 'Erid Habitat Construction Plans', 'document.engineering.construction', 'published',
 '{"purpose": "Human-habitable dome on Erid for Grace", "material": "Xenonite (Eridian construction)", "internal_atmosphere": "1 atm oxygen, Earth-normal composition", "lighting": "Artificial full-spectrum (Erid is pitch black)", "temperature": "Comfortable human range despite 210°C external", "food_production": "Synthesis from Hail Mary knowledge archives", "innovations": "Cloned human muscle tissue for meburgers", "size": "Classroom plus living quarters", "builders": "Eridian engineers supervised by Rocky"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GRAPH EDGES
-- ============================================
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, project_id, props) VALUES
-- Project → Goals
('project', '33333333-3333-3333-3333-333333333333', 'has', 'goal', '33333333-0001-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('project', '33333333-3333-3333-3333-333333333333', 'has', 'goal', '33333333-0002-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('project', '33333333-3333-3333-3333-333333333333', 'has', 'goal', '33333333-0003-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('project', '33333333-3333-3333-3333-333333333333', 'has', 'goal', '33333333-0004-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('project', '33333333-3333-3333-3333-333333333333', 'has', 'goal', '33333333-0005-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('project', '33333333-3333-3333-3333-333333333333', 'has', 'goal', '33333333-0006-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Goal 1 → Milestones
('goal', '33333333-0001-0000-0000-000000000001', 'has', 'milestone', '33333333-0001-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0001-0000-0000-000000000001', 'has', 'milestone', '33333333-0001-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0001-0000-0000-000000000001', 'has', 'milestone', '33333333-0001-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0001-0000-0000-000000000001', 'has', 'milestone', '33333333-0001-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0001-0000-0000-000000000001', 'has', 'milestone', '33333333-0001-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Goal 2 → Milestones
('goal', '33333333-0002-0000-0000-000000000001', 'has', 'milestone', '33333333-0002-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0002-0000-0000-000000000001', 'has', 'milestone', '33333333-0002-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0002-0000-0000-000000000001', 'has', 'milestone', '33333333-0002-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0002-0000-0000-000000000001', 'has', 'milestone', '33333333-0002-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0002-0000-0000-000000000001', 'has', 'milestone', '33333333-0002-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Goal 3 → Milestones
('goal', '33333333-0003-0000-0000-000000000001', 'has', 'milestone', '33333333-0003-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0003-0000-0000-000000000001', 'has', 'milestone', '33333333-0003-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0003-0000-0000-000000000001', 'has', 'milestone', '33333333-0003-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0003-0000-0000-000000000001', 'has', 'milestone', '33333333-0003-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0003-0000-0000-000000000001', 'has', 'milestone', '33333333-0003-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0003-0000-0000-000000000001', 'has', 'milestone', '33333333-0003-0006-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Goal 4 → Milestones
('goal', '33333333-0004-0000-0000-000000000001', 'has', 'milestone', '33333333-0004-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0004-0000-0000-000000000001', 'has', 'milestone', '33333333-0004-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0004-0000-0000-000000000001', 'has', 'milestone', '33333333-0004-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0004-0000-0000-000000000001', 'has', 'milestone', '33333333-0004-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0004-0000-0000-000000000001', 'has', 'milestone', '33333333-0004-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Goal 5 → Milestones
('goal', '33333333-0005-0000-0000-000000000001', 'has', 'milestone', '33333333-0005-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0005-0000-0000-000000000001', 'has', 'milestone', '33333333-0005-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0005-0000-0000-000000000001', 'has', 'milestone', '33333333-0005-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0005-0000-0000-000000000001', 'has', 'milestone', '33333333-0005-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0005-0000-0000-000000000001', 'has', 'milestone', '33333333-0005-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0005-0000-0000-000000000001', 'has', 'milestone', '33333333-0005-0006-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Goal 6 → Milestones
('goal', '33333333-0006-0000-0000-000000000001', 'has', 'milestone', '33333333-0006-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0006-0000-0000-000000000001', 'has', 'milestone', '33333333-0006-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0006-0000-0000-000000000001', 'has', 'milestone', '33333333-0006-0003-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0006-0000-0000-000000000001', 'has', 'milestone', '33333333-0006-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0006-0000-0000-000000000001', 'has', 'milestone', '33333333-0006-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0006-0000-0000-000000000001', 'has', 'milestone', '33333333-0006-0006-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0006-0000-0000-000000000001', 'has', 'milestone', '33333333-0006-0007-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0006-0000-0000-000000000001', 'has', 'milestone', '33333333-0006-0008-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('goal', '33333333-0006-0000-0000-000000000001', 'has', 'milestone', '33333333-0006-0009-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Milestones → Plans
('milestone', '33333333-0001-0004-0000-000000000001', 'has', 'plan', '33333333-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0001-0005-0000-000000000001', 'has', 'plan', '33333333-0001-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0002-0003-0000-000000000001', 'has', 'plan', '33333333-0002-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0002-0004-0000-000000000001', 'has', 'plan', '33333333-0002-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0005-0000-000000000001', 'has', 'plan', '33333333-0003-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0005-0000-000000000001', 'has', 'plan', '33333333-0003-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0004-0002-0000-000000000001', 'has', 'plan', '33333333-0004-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0004-0004-0000-000000000001', 'has', 'plan', '33333333-0004-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0003-0000-000000000001', 'has', 'plan', '33333333-0005-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0003-0000-000000000001', 'has', 'plan', '33333333-0005-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0004-0000-000000000001', 'has', 'plan', '33333333-0005-0003-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0006-0002-0000-000000000001', 'has', 'plan', '33333333-0006-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0006-0004-0000-000000000001', 'has', 'plan', '33333333-0006-0002-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0006-0006-0000-000000000001', 'has', 'plan', '33333333-0006-0003-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0004-0004-0000-000000000001', 'has', 'plan', '33333333-0004-0003-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Plans → Tasks
('plan', '33333333-0001-0001-0001-000000000001', 'has', 'task', '33333333-0001-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0001-0001-0001-000000000001', 'has', 'task', '33333333-0001-0001-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0001-0001-0001-000000000001', 'has', 'task', '33333333-0001-0001-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0001-0002-0001-000000000001', 'has', 'task', '33333333-0001-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0002-0001-0001-000000000001', 'has', 'task', '33333333-0002-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0002-0001-0001-000000000001', 'has', 'task', '33333333-0002-0001-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0002-0001-0001-000000000001', 'has', 'task', '33333333-0002-0001-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0002-0002-0001-000000000001', 'has', 'task', '33333333-0002-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0003-0001-0001-000000000001', 'has', 'task', '33333333-0003-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0003-0002-0001-000000000001', 'has', 'task', '33333333-0003-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0003-0002-0001-000000000001', 'has', 'task', '33333333-0003-0002-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0004-0001-0001-000000000001', 'has', 'task', '33333333-0004-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0004-0001-0001-000000000001', 'has', 'task', '33333333-0004-0001-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0004-0001-0001-000000000001', 'has', 'task', '33333333-0004-0001-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0004-0002-0001-000000000001', 'has', 'task', '33333333-0004-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0004-0002-0001-000000000001', 'has', 'task', '33333333-0004-0002-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0001-0001-000000000001', 'has', 'task', '33333333-0005-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0001-0001-000000000001', 'has', 'task', '33333333-0005-0001-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0001-0001-000000000001', 'has', 'task', '33333333-0005-0001-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Adrian Sampling Tasks
('plan', '33333333-0004-0003-0001-000000000001', 'has', 'task', '33333333-0004-0003-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0004-0003-0001-000000000001', 'has', 'task', '33333333-0004-0003-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0004-0003-0001-000000000001', 'has', 'task', '33333333-0004-0003-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Nitrogen Crisis Tasks
('plan', '33333333-0005-0001-0001-000000000001', 'has', 'task', '33333333-0005-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0001-0001-000000000001', 'has', 'task', '33333333-0005-0002-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0001-0001-000000000001', 'has', 'task', '33333333-0005-0002-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0001-0001-000000000001', 'has', 'task', '33333333-0005-0002-0004-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Fuel Contamination Tasks
('plan', '33333333-0005-0002-0001-000000000001', 'has', 'task', '33333333-0005-0003-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0002-0001-000000000001', 'has', 'task', '33333333-0005-0003-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0002-0001-000000000001', 'has', 'task', '33333333-0005-0003-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Beetle Thruster Tasks
('plan', '33333333-0005-0003-0001-000000000001', 'has', 'task', '33333333-0005-0004-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0003-0001-000000000001', 'has', 'task', '33333333-0005-0004-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0003-0001-000000000001', 'has', 'task', '33333333-0005-0004-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0005-0003-0001-000000000001', 'has', 'task', '33333333-0005-0004-0004-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Rescue Operation Tasks
('plan', '33333333-0006-0001-0001-000000000001', 'has', 'task', '33333333-0006-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0006-0001-0001-000000000001', 'has', 'task', '33333333-0006-0001-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0006-0001-0001-000000000001', 'has', 'task', '33333333-0006-0001-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0006-0001-0001-000000000001', 'has', 'task', '33333333-0006-0001-0004-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Beetle Data Return Tasks
('plan', '33333333-0006-0002-0001-000000000001', 'has', 'task', '33333333-0006-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0006-0002-0001-000000000001', 'has', 'task', '33333333-0006-0002-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Erid Survival Tasks
('plan', '33333333-0006-0003-0001-000000000001', 'has', 'task', '33333333-0006-0003-0001-000000000002', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0006-0003-0001-000000000001', 'has', 'task', '33333333-0006-0003-0002-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0006-0003-0001-000000000001', 'has', 'task', '33333333-0006-0003-0003-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('plan', '33333333-0006-0003-0001-000000000001', 'has', 'task', '33333333-0006-0003-0004-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Milestones → Documents
('milestone', '33333333-0001-0001-0000-000000000001', 'has', 'document', '33333333-0001-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0001-0004-0000-000000000001', 'has', 'document', '33333333-0001-0002-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0002-0003-0000-000000000001', 'has', 'document', '33333333-0002-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0005-0000-000000000001', 'has', 'document', '33333333-0003-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0005-0000-000000000001', 'has', 'document', '33333333-0003-0002-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0004-0004-0000-000000000001', 'has', 'document', '33333333-0004-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0002-0000-000000000001', 'has', 'document', '33333333-0005-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0002-0000-000000000001', 'has', 'document', '33333333-0005-0002-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Additional Document Edges
('milestone', '33333333-0004-0002-0000-000000000001', 'has', 'document', '33333333-0005-0003-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0005-0000-000000000001', 'has', 'document', '33333333-0005-0004-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0004-0000-000000000001', 'has', 'document', '33333333-0006-0001-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0005-0000-000000000001', 'has', 'document', '33333333-0006-0002-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0004-0000-000000000001', 'has', 'document', '33333333-0006-0003-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0004-0004-0000-000000000001', 'has', 'document', '33333333-0006-0004-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0006-0006-0000-000000000001', 'has', 'document', '33333333-0006-0005-0001-000000000005', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Milestones → Decisions
('milestone', '33333333-0002-0001-0000-000000000001', 'has', 'decision', '33333333-0001-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0002-0002-0000-000000000001', 'has', 'decision', '33333333-0002-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0002-0004-0000-000000000001', 'has', 'decision', '33333333-0002-0002-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0005-0000-000000000001', 'has', 'decision', '33333333-0003-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0004-0003-0000-000000000001', 'has', 'decision', '33333333-0004-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0001-0000-000000000001', 'has', 'decision', '33333333-0005-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0005-0000-000000000001', 'has', 'decision', '33333333-0005-0002-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Additional Decision Edges
('milestone', '33333333-0005-0004-0000-000000000001', 'has', 'decision', '33333333-0006-0001-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0006-0005-0000-000000000001', 'has', 'decision', '33333333-0006-0002-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0006-0004-0000-000000000001', 'has', 'decision', '33333333-0006-0003-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0002-0000-000000000001', 'has', 'decision', '33333333-0006-0004-0001-000000000003', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Milestones → Risks
('milestone', '33333333-0001-0005-0000-000000000001', 'has', 'risk', '33333333-0001-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0001-0000-000000000001', 'has', 'risk', '33333333-0002-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0004-0000-000000000001', 'has', 'risk', '33333333-0003-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0005-0000-000000000001', 'has', 'risk', '33333333-0003-0002-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0004-0002-0000-000000000001', 'has', 'risk', '33333333-0004-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0004-0003-0000-000000000001', 'has', 'risk', '33333333-0004-0002-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0003-0000-000000000001', 'has', 'risk', '33333333-0005-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0002-0000-000000000001', 'has', 'risk', '33333333-0005-0002-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
-- Additional Risk Edges
('milestone', '33333333-0005-0003-0000-000000000001', 'has', 'risk', '33333333-0006-0001-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0006-0000-000000000001', 'has', 'risk', '33333333-0006-0002-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0004-0004-0000-000000000001', 'has', 'risk', '33333333-0006-0003-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0005-0004-0000-000000000001', 'has', 'risk', '33333333-0006-0004-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0006-0003-0000-000000000001', 'has', 'risk', '33333333-0006-0005-0001-000000000004', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),
('milestone', '33333333-0003-0001-0000-000000000001', 'has', 'risk', '33333333-0006-0006-0001-000000000001', '33333333-3333-3333-3333-333333333333', '{}'::jsonb),

-- Cross-cutting causal relationships
-- Research enabled mission
('milestone', '33333333-0001-0004-0000-000000000001', 'enabled', 'milestone', '33333333-0002-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Understanding Astrophage enabled using it as fuel"}'::jsonb),
-- Tau Ceti discovery enabled mission target
('milestone', '33333333-0001-0005-0000-000000000001', 'enabled', 'milestone', '33333333-0002-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Identified destination for Hail Mary"}'::jsonb),
-- Launch enabled journey
('milestone', '33333333-0002-0005-0000-000000000001', 'enabled', 'milestone', '33333333-0003-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Mission launched, Grace awakens at destination"}'::jsonb),
-- Arrival enabled first contact
('milestone', '33333333-0003-0003-0000-000000000001', 'enabled', 'milestone', '33333333-0003-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Reaching Tau Ceti led to alien encounter"}'::jsonb),
-- First contact enabled partnership
('milestone', '33333333-0003-0005-0000-000000000001', 'enabled', 'milestone', '33333333-0004-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Meeting Rocky led to collaboration"}'::jsonb),
-- Partnership enabled solution
('milestone', '33333333-0004-0002-0000-000000000001', 'enabled', 'milestone', '33333333-0004-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Joint research led to Taumoeba discovery"}'::jsonb),
-- Solution enabled salvation
('milestone', '33333333-0004-0004-0000-000000000001', 'enabled', 'milestone', '33333333-0005-0002-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Taumoeba enabled saving both civilizations"}'::jsonb),
-- Mutual rescue cemented trust
('milestone', '33333333-0004-0003-0000-000000000001', 'enabled', 'milestone', '33333333-0005-0001-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Saving each other led to ultimate sacrifice decision"}'::jsonb),
-- Sacrifice led to confirmation
('milestone', '33333333-0005-0001-0000-000000000001', 'led_to', 'milestone', '33333333-0005-0004-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Grace staying enabled both stars to be saved"}'::jsonb),
-- Confirmation led to new life
('milestone', '33333333-0005-0004-0000-000000000001', 'led_to', 'milestone', '33333333-0005-0005-0000-000000000001', '33333333-3333-3333-3333-333333333333', '{"context": "Mission success allowed Grace to find new purpose"}'::jsonb)
;

-- ============================================
-- COMPLETION NOTICE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Project Hail Mary: Save Two Worlds - v3.0';
  RAISE NOTICE 'COMPREHENSIVE HARD SCIENCE FICTION ONTOLOGY';
  RAISE NOTICE 'Based on the novel by Andy Weir (2021)';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Project ID: 33333333-3333-3333-3333-333333333333';
  RAISE NOTICE '';
  RAISE NOTICE 'STORY PHASES:';
  RAISE NOTICE '  1. Discovery: Petrova Line → Astrophage identified (2K, 10^15 J/kg)';
  RAISE NOTICE '  2. Construction: Hail Mary built with Astrophage spin drive';
  RAISE NOTICE '  3. Journey: Grace awakens alone at Tau Ceti with amnesia';
  RAISE NOTICE '  4. First Contact: Meets Rocky the Eridian engineer';
  RAISE NOTICE '  5. Collaboration: Joint research, mutual rescues, xenonite tunnel';
  RAISE NOTICE '  6. Solution: Taumoeba discovered on Adrian (Tau Ceti e)';
  RAISE NOTICE '  7. Nitrogen Crisis: Directed evolution creates resistant strains';
  RAISE NOTICE '  8. Fuel Contamination: Emergency beetle thruster conversion';
  RAISE NOTICE '  9. Sacrifice: Grace gives fuel to Rocky, strands himself';
  RAISE NOTICE '  10. Legacy: Grace becomes teacher on Erid, both stars saved';
  RAISE NOTICE '';
  RAISE NOTICE 'SCIENTIFIC ACCURACY:';
  RAISE NOTICE '  - Astrophage: 10^15 J/kg at 2 Kelvin (per novel)';
  RAISE NOTICE '  - Tau Ceti: 12 light-years (real star)';
  RAISE NOTICE '  - 40 Eridani: 16.3 light-years (real triple star system)';
  RAISE NOTICE '  - Eridian environment: 29 atm ammonia, ~290K, 2x Earth gravity';
  RAISE NOTICE '  - Rocky: ~400kg mass, xenonite exoskeleton, echolocation';
  RAISE NOTICE '  - Beetle probes: John, Paul, George, Ringo';
  RAISE NOTICE '  - Taumoeba strains: Taumoeba-35 (Venus), Taumoeba-82.5 (Threeworld)';
  RAISE NOTICE '';
  RAISE NOTICE 'THEMES:';
  RAISE NOTICE '  - Science as universal language';
  RAISE NOTICE '  - Cooperation across radical difference';
  RAISE NOTICE '  - Sacrifice for the greater good';
  RAISE NOTICE '  - The threat becomes the solution (Astrophage as fuel)';
  RAISE NOTICE '  - Redemption (coward becomes hero)';
  RAISE NOTICE '  - Friendship transcends species';
  RAISE NOTICE '';
  RAISE NOTICE 'ENTITY COUNTS:';
  RAISE NOTICE '  - 6 Goals (Discovery → Mission → Journey → Solution → Nitrogen → Salvation)';
  RAISE NOTICE '  - 32 Milestones (comprehensive story coverage)';
  RAISE NOTICE '  - 15 Plans (research, engineering, emergency, survival)';
  RAISE NOTICE '  - 40 Tasks (EVA, lab work, rescues, teaching)';
  RAISE NOTICE '  - 11 Decisions (ethical dilemmas, survival choices)';
  RAISE NOTICE '  - 14 Risks (mission failure, contamination, EVA dangers)';
  RAISE NOTICE '  - 15 Documents (papers, logs, manuals, surveys)';
  RAISE NOTICE '  - 130+ Graph Edges (hierarchical + causal relationships)';
  RAISE NOTICE '';
  RAISE NOTICE 'KEY QUOTES:';
  RAISE NOTICE '  "I penetrate the ridiculous, the absurd, and the impossible."';
  RAISE NOTICE '  "You and me...same same. Save star. Save people." - Rocky';
  RAISE NOTICE '  "I am the teacher. This is what I do." - Grace';
  RAISE NOTICE '';
  RAISE NOTICE 'BOOK READER COVERAGE:';
  RAISE NOTICE '  - Complete nitrogen crisis storyline';
  RAISE NOTICE '  - Beetle conversion emergency (John, Paul, George sacrifice)';
  RAISE NOTICE '  - Xenonite permeation discovery and consequences';
  RAISE NOTICE '  - Eridian biology and Blip-A spacecraft details';
  RAISE NOTICE '  - Adrian planetary survey and sampling chain';
  RAISE NOTICE '  - Taumoeba evolution log with strain milestones';
  RAISE NOTICE '  - Full rescue operation and survival on Erid';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Project is marked as is_public = TRUE for display';
  RAISE NOTICE '==============================================';
END$$;

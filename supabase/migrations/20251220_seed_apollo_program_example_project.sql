-- supabase/migrations/20251220_seed_apollo_program_example_project.sql
-- ============================================
-- NASA Apollo Program Example Project
-- "Land a man on the Moon and return him safely to Earth"
-- ============================================
-- Version 3.0 - Comprehensive Space Race Ontology (Verified & Massively Expanded)
--
-- DESIGN PRINCIPLE: This graph is deeply nested.
-- - Goals connect to Project
-- - Milestones connect to Goals (not directly to Project)
-- - Plans connect to Milestones
-- - Tasks connect to Plans/Milestones
-- - Decisions/Risks connect to Milestones
-- - Documents connect to Milestones
--
-- All relationships use onto_edges for graph traversal
--
-- SCOPE: Mercury (1958-1963) → Gemini (1965-1966) → Apollo (1967-1972)
-- Total investment: $25.4 billion ($257 billion in 2020 dollars, $187B in 2024)
-- Personnel: 400,000+ employees and contractors at peak
-- Major Contractors: Boeing, North American Aviation, Grumman, Douglas Aircraft, IBM
--
-- KEY PERSONNEL:
-- - NASA Administrators: James Webb (1961-68), Thomas Paine (1968-70)
-- - Engineers: Wernher von Braun (Marshall), Max Faget (spacecraft design)
-- - Flight Directors: Chris Kraft, Gene Kranz, Glynn Lunney
-- - Mission Architect: John Houbolt (Lunar Orbit Rendezvous)
--
-- MISSION STATISTICS:
-- - 12 astronauts walked on the Moon (Apollo 11, 12, 14, 15, 16, 17)
-- - 842 pounds (382 kg) of lunar samples returned
-- - 2,196 individual samples from 6 landing sites
-- - 6 successful lunar landings out of 7 attempts (Apollo 13 aborted)

-- ============================================
-- CLEANUP (for idempotent re-runs)
-- ============================================
DELETE FROM onto_edges WHERE project_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM onto_tasks WHERE project_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM onto_documents WHERE project_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM onto_decisions WHERE project_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM onto_risks WHERE project_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM onto_plans WHERE project_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM onto_milestones WHERE project_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM onto_goals WHERE project_id = '22222222-2222-2222-2222-222222222222';
DELETE FROM onto_projects WHERE id = '22222222-2222-2222-2222-222222222222';

-- ============================================
-- PROJECT
-- ============================================
INSERT INTO onto_projects (
  id, org_id, name, description, type_key,
  state_key, props, start_at, end_at, is_public, created_by
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  NULL,
  'Project Apollo: Race to the Moon',
  'NASA''s ambitious program to land humans on the Moon and return them safely to Earth, fulfilling President Kennedy''s May 25, 1961 challenge to Congress. The culmination of Mercury (1958-1963) and Gemini (1965-1966) programs, Apollo achieved six successful lunar landings between July 1969 and December 1972, with 12 astronauts walking on the lunar surface.',
  'project.government.space',
  'completed',
  '{
    "facets": {"context": "government", "scale": "epic", "stage": "complete"},
    "organization": "NASA (National Aeronautics and Space Administration)",
    "administrators": ["James E. Webb (1961-1968)", "Thomas O. Paine (1968-1970)", "James C. Fletcher (1971-1977)"],
    "key_centers": ["Kennedy Space Center (Launch)", "Johnson Space Center (Mission Control)", "Marshall Space Flight Center (Rockets)"],
    "theater": "Earth Orbit, Lunar Orbit, Lunar Surface",
    "duration": "14 years (1958-1972)",
    "budget": "$25.4 billion nominal ($257B in 2020 dollars)",
    "peak_employment": "400,000+ employees and contractors",
    "major_contractors": ["Boeing (S-IC first stage)", "North American Aviation (CSM, S-II)", "Grumman (Lunar Module)", "Douglas Aircraft (S-IVB)", "IBM (Instrument Unit)"],
    "mission_statistics": {
      "total_crewed_flights": 11,
      "lunar_landings": 6,
      "astronauts_to_moon": 24,
      "moonwalkers": 12,
      "lunar_samples": "842 pounds (382 kg)",
      "lunar_samples_count": 2196
    },
    "key_engineers": ["Wernher von Braun", "Max Faget", "John Houbolt", "George Low", "Joseph Shea"],
    "flight_directors": ["Chris Kraft", "Gene Kranz", "Glynn Lunney", "Clifford Charlesworth"],
    "graph_depth": 6,
    "kennedy_quote": "We choose to go to the Moon in this decade and do the other things, not because they are easy, but because they are hard.",
    "program_phases": ["Mercury: Prove survival in space", "Gemini: Master rendezvous/docking/EVA", "Apollo: Land on Moon and return"]
  }'::jsonb,
  '1958-10-01'::timestamptz,
  '1972-12-19'::timestamptz,
  TRUE,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GOALS (6 Strategic Objectives)
-- ============================================
INSERT INTO onto_goals (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Goal 1: Prove Human Spaceflight (Mercury)
('22222222-0001-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Prove Human Spaceflight is Possible', 'goal.strategic.foundation', 'achieved',
 '{"priority": "critical", "state": "achieved", "program": "Project Mercury", "timeframe": "1958-1963", "budget": "$277 million", "missions": 6, "astronauts": ["Alan Shepard", "Gus Grissom", "John Glenn", "Scott Carpenter", "Wally Schirra", "Gordon Cooper"], "key_question": "Can humans survive and function in space?", "answer": "Yes - 6 successful crewed flights proved it"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 2: Master Orbital Operations (Gemini)
('22222222-0002-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Master Orbital Operations', 'goal.strategic.capability', 'achieved',
 '{"priority": "critical", "state": "achieved", "program": "Project Gemini", "timeframe": "1965-1966", "budget": "$1.3 billion", "missions": 10, "crew_size": 2, "capabilities_demonstrated": ["space rendezvous", "orbital docking", "spacewalks (EVA)", "long-duration flight (14 days)", "precision reentry", "orbital maneuvering"], "longest_mission": "Gemini 7 - 14 days", "first_docking": "Gemini 8 with Agena - March 16, 1966", "total_astronauts": 16}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 3: Land on the Moon
('22222222-0003-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Land Humans on the Moon', 'goal.strategic.primary', 'achieved',
 '{"priority": "critical", "state": "achieved", "program": "Apollo", "deadline": "Before December 31, 1969", "first_landing": "July 20, 1969 (Apollo 11)", "last_landing": "December 11, 1972 (Apollo 17)", "total_landings": 6, "moonwalkers": ["Neil Armstrong", "Buzz Aldrin", "Pete Conrad", "Alan Bean", "Alan Shepard", "Edgar Mitchell", "David Scott", "James Irwin", "John Young", "Charles Duke", "Eugene Cernan", "Harrison Schmitt"], "armstrong_quote": "That is one small step for [a] man, one giant leap for mankind", "landing_sites": ["Sea of Tranquility", "Ocean of Storms", "Fra Mauro", "Hadley Rille", "Descartes Highlands", "Taurus-Littrow"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 4: Return Safely to Earth
('22222222-0004-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Return Astronauts Safely to Earth', 'goal.strategic.safety', 'achieved',
 '{"priority": "critical", "state": "achieved", "in_flight_deaths": 0, "ground_test_deaths": 3, "apollo_1_tragedy": "Grissom, White, Chaffee - January 27, 1967", "close_calls": ["Apollo 13 - oxygen tank explosion, crew rescued via LM lifeboat"], "reentry_speed": "25,000 mph from lunar return trajectory", "heatshield": "Ablative design by Avco Corporation", "recovery_method": "Pacific Ocean splashdown with Navy recovery ships", "flight_director_quote": "Failure is not an option - Gene Kranz"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 5: Scientific Discovery
('22222222-0005-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Conduct Lunar Science', 'goal.strategic.science', 'achieved',
 '{"priority": "high", "state": "achieved", "samples_returned": "842 pounds (382 kg) of lunar material", "sample_count": 2196, "oldest_sample_age": "4.5 billion years", "experiments": "Apollo Lunar Surface Experiments Package (ALSEP)", "discoveries": ["Lunar origin from giant impact", "Magma ocean crystallization history", "Troctolite 76535 - evidence of ancient magnetic field", "Armalcolite mineral (named for Armstrong, Aldrin, Collins)"], "ongoing_research": "Samples still being studied 50+ years later with new technology", "laser_retroreflectors": "Still used today for Earth-Moon distance measurements"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 6: Beat the Soviets
('22222222-0006-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Win the Space Race', 'goal.strategic.political', 'achieved',
 '{"priority": "critical", "state": "achieved", "context": "Cold War technological and ideological competition", "soviet_advantages": ["First satellite (Sputnik, 1957)", "First human in space (Gagarin, 1961)", "First spacewalk (Leonov, 1965)"], "soviet_moon_program": "N1 rocket failed all 4 test flights (1969-1972)", "outcome": "USA first and only nation to land humans on Moon (as of 2024)", "geopolitical_impact": "Demonstrated technological superiority of free market democracy", "kennedy_motivation": "Needed clear goal where US could win"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 7: Post-Apollo Legacy (Skylab & Apollo-Soyuz)
('22222222-0007-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Establish Apollo Legacy', 'goal.strategic.legacy', 'achieved',
 '{"priority": "high", "state": "achieved", "context": "Leverage Apollo investment for space station and international cooperation", "programs": ["Skylab (1973-1974)", "Apollo-Soyuz Test Project (1975)"], "skylab_achievements": ["First American space station", "171 days of crewed occupation", "Proved long-duration spaceflight feasible", "Solar science and Earth observations"], "astp_significance": ["First international crewed space mission", "US-Soviet cooperation at height of détente", "Last Apollo spacecraft flight", "Symbolic handshake in orbit"], "hardware_reuse": "Saturn V and Apollo spacecraft from cancelled lunar missions", "legacy": "Paved way for Shuttle-Mir and International Space Station"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MILESTONES - GOAL 1: Mercury Program
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, state_key, due_at, props, created_by) VALUES
-- Mercury Milestones
('22222222-0001-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'NASA Established', 'milestone.program.founding', 'completed',
 '1958-10-01'::timestamptz,
 '{"state": "achieved", "significance": "National Aeronautics and Space Administration created from NACA"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Mercury Seven Selected', 'milestone.personnel.selection', 'completed',
 '1959-04-09'::timestamptz,
 '{"state": "achieved", "location": "Dolley Madison House, Washington DC", "astronauts": {"navy": ["Alan B. Shepard Jr.", "Walter M. Schirra Jr.", "M. Scott Carpenter"], "air_force": ["L. Gordon Cooper Jr.", "Virgil I. Grissom", "Donald K. Slayton"], "marines": ["John H. Glenn Jr."]}, "selection_process": "From 508 candidates to 32 finalists to 7 selected", "requirements": "Military test pilots, under 40, under 5 ft 11 in", "medical_testing": "Lovelace Clinic (NM) and Wright Aeromedical Lab (OH)", "significance": "Instant national heroes - compared to Columbus and Wright Brothers"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First American in Space', 'milestone.mission.crewed', 'completed',
 '1961-05-05'::timestamptz,
 '{"state": "achieved", "launch_time": "09:34 EST", "mission": "Mercury-Redstone 3 (Freedom 7)", "astronaut": "Alan B. Shepard Jr.", "duration": "15 minutes 28 seconds", "altitude": "116.5 miles (187 km)", "type": "Suborbital ballistic trajectory", "max_speed": "5,180 mph", "landing": "Atlantic Ocean, recovered by USS Lake Champlain", "significance": "First American in space, 23 days after Yuri Gagarin", "presidential_witness": "JFK and Jackie watched live TV coverage"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Kennedy''s Moon Challenge', 'milestone.political.declaration', 'completed',
 '1961-05-25'::timestamptz,
 '{"state": "achieved", "location": "Joint Session of Congress, U.S. Capitol", "speaker": "President John F. Kennedy", "speech_title": "Special Message to the Congress on Urgent National Needs", "quote": "I believe that this nation should commit itself to achieving the goal, before this decade is out, of landing a man on the Moon and returning him safely to the Earth", "context": "20 days after Shepard flight, 6 weeks after Gagarin", "budget_request": "$7-9 billion over 5 years", "why_the_moon": "Goal where America could win - Soviets were ahead in orbital flight", "later_rice_speech": "September 12, 1962 - We choose to go to the Moon"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First American in Orbit', 'milestone.mission.crewed', 'completed',
 '1962-02-20'::timestamptz,
 '{"state": "achieved", "mission": "Mercury-Atlas 6 (Friendship 7)", "astronaut": "John H. Glenn Jr.", "orbits": 3, "duration": "4 hours 55 minutes 23 seconds", "altitude": "162 miles (261 km)", "speed": "17,544 mph", "landing": "Atlantic Ocean near Grand Turk Island", "drama": "False indicator suggested loose heat shield - ground decided not to jettison retropack as precaution", "national_reaction": "Ticker-tape parade in NYC, addressed Joint Session of Congress", "significance": "First American to orbit Earth - 10 months after Gagarin"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Mercury Program Completed', 'milestone.program.completion', 'completed',
 '1963-05-16'::timestamptz,
 '{"state": "achieved", "final_mission": "Mercury-Atlas 9 (Faith 7)", "astronaut": "L. Gordon Cooper Jr.", "duration": "34 hours 19 minutes 49 seconds", "orbits": 22, "total_crewed_missions": 6, "total_astronauts_flown": 6, "deke_slayton": "Grounded for heart condition, never flew Mercury", "program_cost": "$277 million", "lessons_learned": ["Humans can survive weightlessness", "Humans can function and work in space", "Spacecraft systems can support human life", "Successful recovery from orbit possible"], "next_step": "Project Gemini"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 2: Gemini Program
-- ============================================
('22222222-0002-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First Gemini Crewed Flight', 'milestone.mission.crewed', 'completed',
 '1965-03-23'::timestamptz,
 '{"state": "achieved", "mission": "Gemini 3 (Molly Brown)", "crew": ["Virgil I. Grissom (Commander)", "John W. Young (Pilot)"], "duration": "4 hours 52 minutes 31 seconds", "orbits": 3, "achievement": "First American two-person crew, first manual spacecraft maneuvers in orbit", "nickname_story": "Grissom named it Molly Brown (unsinkable) after his Mercury capsule sank", "corned_beef_sandwich": "Young smuggled sandwich aboard - minor controversy"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0002-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First American Spacewalk', 'milestone.mission.eva', 'completed',
 '1965-06-03'::timestamptz,
 '{"state": "achieved", "mission": "Gemini 4", "crew": ["James A. McDivitt (Commander)", "Edward H. White II (Pilot)"], "mission_duration": "4 days 1 hour 56 minutes", "eva_duration": "23 minutes", "eva_astronaut": "Edward H. White II", "eva_equipment": "Hand-held maneuvering unit (HHMU)", "white_quote": "I am returning now - most reluctant words", "comparison": "Soviets first (Alexei Leonov, March 18, 1965) by 10 weeks", "significance": "Proved Americans could also work outside spacecraft"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0002-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Long-Duration Flight Achieved', 'milestone.mission.endurance', 'completed',
 '1965-08-21'::timestamptz,
 '{"state": "achieved", "mission": "Gemini 5 (8 Days or Bust)", "crew": ["L. Gordon Cooper Jr. (Commander)", "Charles Conrad Jr. (Pilot)"], "duration": "7 days 22 hours 55 minutes", "orbits": 120, "innovation": "First use of fuel cells for spacecraft electrical power", "significance": "Demonstrated 8-day endurance needed for lunar mission round trip", "problem": "Fuel cell issues reduced power, phantom rendezvous simulation cancelled"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0002-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First Space Rendezvous', 'milestone.mission.rendezvous', 'completed',
 '1965-12-15'::timestamptz,
 '{"state": "achieved", "missions": ["Gemini 6A", "Gemini 7"], "gemini_7_crew": ["Frank Borman (Commander)", "James A. Lovell Jr. (Pilot)"], "gemini_6a_crew": ["Walter M. Schirra Jr. (Commander)", "Thomas P. Stafford (Pilot)"], "gemini_7_launch": "December 4, 1965", "gemini_6a_launch": "December 15, 1965", "gemini_7_duration": "13 days 18 hours 35 minutes (longest Gemini)", "closest_approach": "1 foot (30 cm) - nose to nose", "soviet_comparison": "USSR Vostok pairs came within several kilometers but could not maneuver", "significance": "First true rendezvous - proved orbital mechanics for lunar mission"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0002-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First Space Docking', 'milestone.mission.docking', 'completed',
 '1966-03-16'::timestamptz,
 '{"state": "achieved", "mission": "Gemini 8", "crew": ["Neil A. Armstrong (Commander)", "David R. Scott (Pilot)"], "target": "Agena Target Vehicle (ATV)", "docking_time": "6 hours 33 minutes into flight", "emergency": "Stuck thruster caused violent roll up to 1 revolution per second", "armstrong_response": "Undocked from Agena, used reentry control system to stabilize", "mission_duration": "10 hours 41 minutes (cut short)", "spin_rate": "Nearly 1 rpm - approaching blackout and structural limits", "significance": "First docking in space, first in-flight emergency, Armstrong proved cool under pressure", "foreshadowing": "Armstrong would later command Apollo 11"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0002-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Gemini Program Completed', 'milestone.program.completion', 'completed',
 '1966-11-15'::timestamptz,
 '{"state": "achieved", "final_mission": "Gemini 12", "crew": ["James A. Lovell Jr. (Commander)", "Edwin E. Aldrin Jr. (Pilot)"], "aldrin_eva": "5 hours 30 minutes total over 3 EVAs", "aldrin_innovations": "Underwater neutral buoyancy training, planned rest periods, foot restraints, handholds", "program_totals": {"missions": 10, "astronauts_flown": 16, "crew_time": "nearly 1,000 hours", "evas": 10, "cost": "$1.3 billion"}, "skills_proven": ["Rendezvous", "Docking", "EVA", "Long-duration flight", "Precision landing", "Fuel cells"], "outcome": "All objectives achieved - ready for Apollo lunar missions"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 3: Apollo Lunar Landings
-- ============================================
('22222222-0003-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 1 Fire', 'milestone.disaster.fire', 'completed',
 '1967-01-27'::timestamptz,
 '{"state": "achieved", "time": "18:31 EST", "location": "Launch Complex 34, Cape Kennedy", "crew_lost": ["Virgil I. Grissom (Commander)", "Edward H. White II (Senior Pilot)", "Roger B. Chaffee (Pilot)"], "test_type": "Plugs-out test - simulated launch countdown", "cause_of_death": "Cardiac arrest from carbon monoxide, fire lasted 25 seconds", "fire_origin": "Electrical arc under Grissom left footrest", "contributing_factors": ["Pure oxygen atmosphere at 16.7 psi", "Extensive flammable materials (Velcro, nylon)", "Inward-opening hatch impossible to open quickly", "Deficient wiring and quality control"], "investigation": "Apollo 204 Review Board chaired by Floyd L. Thompson", "report_date": "April 5, 1967", "delay": "21 months before next crewed flight", "legacy": "Gene Kranz Tough and Competent speech - safety culture transformation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First Crewed Apollo Flight', 'milestone.mission.crewed', 'completed',
 '1968-10-11'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 7", "crew": ["Walter M. Schirra Jr. (Commander)", "Donn F. Eisele (CM Pilot)", "R. Walter Cunningham (LM Pilot)"], "launch_vehicle": "Saturn IB", "duration": "10 days 20 hours 9 minutes", "orbits": 163, "firsts": "First live TV broadcast from American spacecraft", "crew_issues": "Crew developed colds, tensions with ground - only Apollo crew not to fly again", "block_ii_changes": ["New quick-opening hatch", "Reduced flammables", "Mixed gas atmosphere on pad"], "significance": "Validated redesigned Block II Command Module - 101% success"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First Humans to the Moon', 'milestone.mission.lunar_orbit', 'completed',
 '1968-12-21'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 8", "crew": ["Frank Borman (Commander)", "James A. Lovell Jr. (CM Pilot)", "William A. Anders (LM Pilot)"], "duration": "6 days 3 hours 42 seconds", "lunar_orbits": 10, "firsts": ["First crewed Saturn V launch", "First humans to leave Earth orbit", "First humans to orbit another world", "First humans to see lunar far side", "First humans to see whole Earth"], "bold_decision": "LM not ready - sent CSM alone, intelligence suggested Soviet circumlunar attempt", "christmas_eve_broadcast": "Genesis reading - largest TV audience to date", "earthrise_photo": "Photographed by Bill Anders - became symbol of environmental movement", "anders_quote": "We came all this way to explore the Moon, and the most important thing is that we discovered the Earth"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Module Test in Earth Orbit', 'milestone.mission.test', 'completed',
 '1969-03-03'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 9", "crew": ["James A. McDivitt (Commander)", "David R. Scott (CM Pilot)", "Russell L. Schweickart (LM Pilot)"], "duration": "10 days 1 hour 54 seconds", "call_signs": {"csm": "Gumdrop", "lm": "Spider"}, "tests_performed": ["First crewed LM flight", "LM extraction from S-IVB", "LM descent and ascent engine firings", "LM-CSM rendezvous and docking", "EVA transfer test (shortened due to Schweickart illness)"], "max_separation": "111 miles between LM and CSM", "significance": "Validated all Apollo lunar mission systems in Earth orbit safety"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Module Test in Lunar Orbit', 'milestone.mission.dress_rehearsal', 'completed',
 '1969-05-18'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 10", "crew": ["Thomas P. Stafford (Commander)", "John W. Young (CM Pilot)", "Eugene A. Cernan (LM Pilot)"], "duration": "8 days 3 minutes 23 seconds", "call_signs": {"csm": "Charlie Brown", "lm": "Snoopy"}, "closest_approach": "47,400 feet (8.4 nautical miles) above lunar surface", "snoopy_incident": "LM ascent stage gyrated wildly during staging - Cernan exclaimed profanity on live broadcast", "why_not_land": "LM too heavy, short fuel deliberately to prevent temptation to land", "speed_record": "24,791 mph - fastest humans have ever traveled (still stands)", "significance": "Everything but the landing - cleared the way for Apollo 11"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First Lunar Landing - Apollo 11', 'milestone.mission.lunar_landing', 'completed',
 '1969-07-20'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 11", "launch_date": "July 16, 1969 13:32:00 UTC", "crew": ["Neil A. Armstrong (Commander)", "Edwin E. Aldrin Jr. (LM Pilot)", "Michael Collins (CM Pilot)"], "call_signs": {"csm": "Columbia", "lm": "Eagle"}, "landing_time": "20:17:40 UTC", "landing_site": "Sea of Tranquility (Mare Tranquillitatis)", "landing_coordinates": "0.67408°N, 23.47297°E", "tranquility_base": "Houston, Tranquility Base here. The Eagle has landed.", "first_step_time": "02:56:15 UTC on July 21", "armstrong_quote": "That is one small step for [a] man, one giant leap for mankind", "eva_duration": "2 hours 31 minutes 40 seconds", "time_on_surface": "21 hours 36 minutes", "samples": "47.5 pounds (21.5 kg)", "experiments": "Seismometer, laser ranging retroreflector, solar wind collector", "plaque_text": "Here men from the planet Earth first set foot upon the Moon, July 1969 A.D. We came in peace for all mankind", "splashdown": "July 24, 1969 - Pacific Ocean", "mission_duration": "8 days 3 hours 18 minutes 35 seconds", "distance_traveled": "953,054 miles", "tv_audience": "600 million people worldwide"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0007-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 12 - Precision Landing', 'milestone.mission.lunar_landing', 'completed',
 '1969-11-19'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 12", "launch_date": "November 14, 1969", "crew": ["Charles Conrad Jr. (Commander)", "Alan L. Bean (LM Pilot)", "Richard F. Gordon Jr. (CM Pilot)"], "call_signs": {"csm": "Yankee Clipper", "lm": "Intrepid"}, "landing_site": "Ocean of Storms (Oceanus Procellarum)", "lightning_strikes": "Rocket struck by lightning twice 36 and 52 seconds after launch - systems recovered", "precision_landing": "Within 600 feet (183 m) of Surveyor 3 probe (landed April 1967)", "surveyor_parts": "Retrieved TV camera and other components for study", "evas": 2, "total_eva_time": "7 hours 45 minutes", "samples": "75.7 pounds (34.4 kg)", "conrad_quote": "Whoopee! Man, that may have been a small one for Neil, but that is a long one for me"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0008-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 13 - Successful Failure', 'milestone.mission.abort', 'completed',
 '1970-04-13'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 13", "launch_date": "April 11, 1970", "crew": ["James A. Lovell Jr. (Commander)", "John L. Swigert Jr. (CM Pilot)", "Fred W. Haise Jr. (LM Pilot)"], "call_signs": {"csm": "Odyssey", "lm": "Aquarius"}, "mattingly_replacement": "Swigert replaced Ken Mattingly 72 hours before launch due to rubella exposure", "explosion_time": "55:54:53 mission elapsed time (April 13, 22:08 UTC)", "cause": "Oxygen tank No. 2 explosion from damaged wiring during ground test years earlier", "swigert_words": "Okay Houston, we have had a problem here", "lovell_words": "Houston, we have had a problem", "movie_misquote": "Houston, we have a problem (present tense in 1995 film)", "lifeboat": "LM Aquarius used as lifeboat for 4 days", "co2_fix": "Square CM lithium hydroxide canisters adapted to fit round LM receptacles using duct tape, cardboard, plastic bags", "temperature": "Cabin dropped to 38°F (3°C)", "power_down": "CM powered down to preserve batteries for reentry", "trajectory": "Free-return around Moon with correction burns", "splashdown": "April 17, 1970 in Pacific Ocean", "mission_duration": "5 days 22 hours 54 minutes", "flight_director": "Gene Kranz led White Team through crisis", "significance": "Greatest rescue in space history - proved NASA could handle emergencies"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0009-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 14 - Return to the Moon', 'milestone.mission.lunar_landing', 'completed',
 '1971-02-05'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 14", "launch_date": "January 31, 1971", "crew": ["Alan B. Shepard Jr. (Commander)", "Edgar D. Mitchell (LM Pilot)", "Stuart A. Roosa (CM Pilot)"], "call_signs": {"csm": "Kitty Hawk", "lm": "Antares"}, "landing_site": "Fra Mauro highlands (intended Apollo 13 site)", "shepard_return": "Only Mercury astronaut to walk on Moon, 10 years after first American spaceflight", "shepard_golf": "Hit two golf balls with improvised 6-iron - second went miles and miles and miles", "cone_crater": "Crew nearly reached rim but turned back - post-flight analysis showed they were within 65 feet", "evas": 2, "total_eva_time": "9 hours 22 minutes", "samples": "94.35 pounds (42.8 kg)", "modular_equipment_transporter": "Two-wheeled cart to carry tools and samples"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0010-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 15 - First Lunar Rover', 'milestone.mission.lunar_landing', 'completed',
 '1971-07-30'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 15", "launch_date": "July 26, 1971", "crew": ["David R. Scott (Commander)", "James B. Irwin (LM Pilot)", "Alfred M. Worden (CM Pilot)"], "call_signs": {"csm": "Endeavour", "lm": "Falcon"}, "j_mission": "First extended J-mission with longer stays and more science", "landing_site": "Hadley-Apennine region at base of Apennine Mountains", "lunar_rover": "First Lunar Roving Vehicle (LRV) - built by Boeing, folded in LM", "rover_specs": {"max_speed": "8 mph", "range": "57 miles", "weight": "460 pounds"}, "rover_distance": "17.5 miles (28.2 km) total", "evas": 3, "total_eva_time": "18 hours 33 minutes", "samples": "170.4 pounds (77.3 kg)", "genesis_rock": "Sample 15415 - 4.1 billion year old anorthosite from original lunar crust", "galileo_experiment": "Scott dropped hammer and feather simultaneously - fell at same rate in vacuum", "fallen_astronaut": "Scott secretly placed memorial statue and plaque for deceased astronauts/cosmonauts"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0011-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 16 - Highlands Exploration', 'milestone.mission.lunar_landing', 'completed',
 '1972-04-21'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 16", "launch_date": "April 16, 1972", "crew": ["John W. Young (Commander)", "Charles M. Duke Jr. (LM Pilot)", "Thomas K. Mattingly II (CM Pilot)"], "call_signs": {"csm": "Casper", "lm": "Orion"}, "mattingly_vindication": "Finally flew after being grounded from Apollo 13 - never got rubella", "landing_site": "Descartes Highlands - first mission to lunar highlands", "near_abort": "CSM main engine oscillation nearly aborted landing - fixed from orbit", "evas": 3, "total_eva_time": "20 hours 14 minutes", "rover_distance": "16.8 miles (27 km)", "samples": "211.4 pounds (95.8 kg)", "speed_record": "Young set lunar speed record of 11.2 mph in rover", "duke_family_photo": "Duke left family photo on lunar surface"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0012-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 17 - Final Lunar Mission', 'milestone.mission.lunar_landing', 'completed',
 '1972-12-11'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 17", "launch_date": "December 7, 1972 (05:33 UTC - only night launch)", "crew": ["Eugene A. Cernan (Commander)", "Harrison H. Schmitt (LM Pilot)", "Ronald E. Evans (CM Pilot)"], "call_signs": {"csm": "America", "lm": "Challenger"}, "landing_site": "Taurus-Littrow valley", "schmitt_significance": "Only professional geologist to walk on Moon - replaced Joe Engle", "troctolite_76535": "Most scientifically important lunar sample - evidence of ancient magnetic field", "orange_soil": "Schmitt discovered orange volcanic glass beads (3.7 billion years old)", "evas": 3, "total_eva_time": "22 hours 3 minutes 57 seconds (longest total)", "rover_distance": "22.3 miles (35.9 km)", "samples": "243.7 pounds (110.5 kg) - most of any mission", "final_plaque": "Here man completed his first explorations of the Moon, December 1972 A.D. May the spirit of peace in which we came be reflected in the lives of all mankind", "cernan_last_words": "We leave as we came and, God willing, as we shall return, with peace and hope for all mankind", "last_to_walk": "Cernan was last person on Moon (Schmitt entered LM first)", "blue_marble": "Crew photographed famous Blue Marble image of Earth"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 4: Safe Return
-- ============================================
('22222222-0004-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Heatshield Design Validated', 'milestone.engineering.thermal', 'completed',
 '1968-10-22'::timestamptz,
 '{"state": "achieved", "significance": "Ablative heatshield proven to protect crew during 25,000 mph reentry from lunar return trajectory"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0004-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Recovery Operations Perfected', 'milestone.operations.recovery', 'completed',
 '1969-07-24'::timestamptz,
 '{"state": "achieved", "method": "Splashdown in Pacific Ocean", "recovery_ships": "US Navy aircraft carriers", "helicopter_retrieval": "Astronauts lifted to ship"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 5: Science
-- ============================================
('22222222-0005-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Sample Return', 'milestone.science.samples', 'completed',
 '1972-12-19'::timestamptz,
 '{"state": "achieved", "total_samples": "842 pounds (382 kg)", "missions_contributing": ["Apollo 11", "Apollo 12", "Apollo 14", "Apollo 15", "Apollo 16", "Apollo 17"], "oldest_sample": "4.5 billion years"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0005-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'ALSEP Experiments Deployed', 'milestone.science.experiments', 'completed',
 '1972-12-11'::timestamptz,
 '{"state": "achieved", "name": "Apollo Lunar Surface Experiments Package", "experiments": ["seismometers", "laser ranging retroreflectors", "solar wind collectors", "heat flow probes"], "data_transmission": "Until 1977"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 6: Space Race
-- ============================================
('22222222-0006-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Soviets Launch Sputnik', 'milestone.competition.soviet', 'completed',
 '1957-10-04'::timestamptz,
 '{"state": "achieved", "significance": "First artificial satellite, started Space Race", "american_response": "Shock and urgency to catch up"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0006-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Gagarin First Human in Space', 'milestone.competition.soviet', 'completed',
 '1961-04-12'::timestamptz,
 '{"state": "achieved", "cosmonaut": "Yuri Gagarin", "mission": "Vostok 1", "significance": "Soviets ahead - first human in space"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0006-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'America Wins the Moon Race', 'milestone.competition.victory', 'completed',
 '1969-07-20'::timestamptz,
 '{"state": "achieved", "significance": "USA first (and only) nation to land humans on Moon", "soviet_program": "N1 rocket failed all 4 test flights", "outcome": "Decisive American victory in Space Race"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - INFRASTRUCTURE & FACILITIES
-- ============================================
('22222222-0007-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Vehicle Assembly Building Completed', 'milestone.infrastructure.construction', 'completed',
 '1966-06-30'::timestamptz,
 '{"state": "achieved", "location": "Kennedy Space Center, Florida", "dimensions": {"height": "526 feet (160 m)", "floor_area": "8 acres", "volume": "129,428,000 cubic feet"}, "features": "Largest single-story building in world, 4 high bays for Saturn V stacking", "architect": "Max O. Urbahn", "contractor": "Morrison-Knudsen", "cost": "$117 million", "significance": "Could stack 4 Saturn V rockets simultaneously"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0007-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Mission Control Center Operational', 'milestone.infrastructure.operations', 'completed',
 '1965-06-01'::timestamptz,
 '{"state": "achieved", "location": "Manned Spacecraft Center (now Johnson Space Center), Houston, Texas", "first_mission": "Gemini 4", "rooms": {"MOCR_1": "Gemini missions", "MOCR_2": "Apollo missions"}, "design": "Christopher Kraft", "features": ["Giant display screens", "Individual consoles for each discipline", "Real-time telemetry", "Voice communications"], "famous_quotes_location": "Where Houston, we have a problem was received"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0007-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Launch Complex 39 Activated', 'milestone.infrastructure.launch', 'completed',
 '1967-11-09'::timestamptz,
 '{"state": "achieved", "location": "Kennedy Space Center, Florida", "pads": {"39A": "Primary Apollo pad", "39B": "Backup pad"}, "crawler_transporter": {"speed": "1 mph loaded", "weight": "6 million pounds", "purpose": "Move Saturn V from VAB to pad"}, "mobile_launch_platform": "Platform with umbilical tower", "first_launch": "Apollo 4 (November 9, 1967)", "flame_trench": "42 feet deep, deflects 7.5 million pounds of thrust"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0007-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Receiving Laboratory Ready', 'milestone.infrastructure.science', 'completed',
 '1969-01-01'::timestamptz,
 '{"state": "achieved", "location": "Manned Spacecraft Center, Houston", "purpose": "Quarantine astronauts and process lunar samples", "quarantine_period": "21 days after return", "features": ["Biological barrier facility", "Sample processing labs", "Vacuum chambers", "Crew quarters"], "used_for": ["Apollo 11", "Apollo 12", "Apollo 14"], "quarantine_ended": "After Apollo 14 - no lunar pathogens found"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - ROBOTIC PRECURSOR MISSIONS
-- ============================================
('22222222-0008-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Ranger Program Success', 'milestone.robotic.reconnaissance', 'completed',
 '1965-03-24'::timestamptz,
 '{"state": "achieved", "program_dates": "1961-1965", "purpose": "First close-up photographs of lunar surface", "successes": ["Ranger 7 (Jul 1964) - 4,316 photos", "Ranger 8 (Feb 1965) - 7,137 photos", "Ranger 9 (Mar 1965) - 5,814 photos"], "failures": "Rangers 1-6 all failed", "impact_imaging": "Transmitted photos until impact with Moon", "contribution": "Proved Moon surface could support lander - not deep dust"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0008-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Surveyor Soft Landings', 'milestone.robotic.landing', 'completed',
 '1968-01-10'::timestamptz,
 '{"state": "achieved", "program_dates": "1966-1968", "purpose": "Soft land on Moon, test surface properties", "successes": ["Surveyor 1 (Jun 1966) - first US soft landing", "Surveyor 3 (Apr 1967) - visited by Apollo 12", "Surveyor 5 (Sep 1967)", "Surveyor 6 (Nov 1967)", "Surveyor 7 (Jan 1968)"], "failures": ["Surveyor 2", "Surveyor 4"], "discoveries": ["Surface can support spacecraft", "Soil composition analysis", "17,000+ photos transmitted"], "apollo_12_retrieval": "Conrad and Bean retrieved Surveyor 3 camera"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0008-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Orbiter Mapping Complete', 'milestone.robotic.mapping', 'completed',
 '1967-08-01'::timestamptz,
 '{"state": "achieved", "program_dates": "1966-1967", "purpose": "Photograph and map potential Apollo landing sites", "missions": 5, "success_rate": "100% - all 5 successful", "coverage": "99% of lunar surface photographed", "resolution": "1 meter at best", "famous_image": "Lunar Orbiter 1 - First photo of Earth from lunar orbit (Aug 1966)", "landing_sites_selected": "Identified and certified Apollo landing sites", "orbit_type": "Polar orbits for full coverage"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - SOVIET COMPETITION (Expanded)
-- ============================================
('22222222-0006-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'First Spacewalk (Soviet)', 'milestone.competition.soviet', 'completed',
 '1965-03-18'::timestamptz,
 '{"state": "achieved", "mission": "Voskhod 2", "cosmonaut": "Alexei Leonov", "duration": "12 minutes", "problems": "Suit ballooned in vacuum - nearly could not reenter airlock", "us_response": "Ed White spacewalk 10 weeks later (Gemini 4)", "significance": "Soviets still ahead in space firsts"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0006-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Luna 9 First Soft Landing', 'milestone.competition.soviet', 'completed',
 '1966-02-03'::timestamptz,
 '{"state": "achieved", "mission": "Luna 9", "significance": "First spacecraft to soft-land on Moon and transmit photos", "landing_site": "Oceanus Procellarum", "photos": "First panoramic images from lunar surface", "us_response": "Surveyor 1 landed 4 months later (June 1966)", "settled_debate": "Proved Moon surface was solid, not deep dust"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0006-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Luna 10 First Lunar Orbit', 'milestone.competition.soviet', 'completed',
 '1966-04-03'::timestamptz,
 '{"state": "achieved", "mission": "Luna 10", "significance": "First spacecraft to orbit the Moon", "orbit_period": "2 hours 58 minutes", "instruments": "Measured radiation, micrometeorites, magnetic field", "broadcast": "Played Internationale from lunar orbit during Party Congress"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0006-0007-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Zond Circumlunar Flights', 'milestone.competition.soviet', 'completed',
 '1968-09-21'::timestamptz,
 '{"state": "achieved", "missions": ["Zond 5 (Sep 1968) - first circumlunar return with animals", "Zond 6 (Nov 1968) - more animals, camera"], "significance": "Soviets could have sent cosmonauts around Moon before Apollo 8", "why_no_crew": "Parachute failures on return, deemed too risky", "us_response": "Accelerated Apollo 8 to beat potential Soviet circumlunar mission"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0006-0008-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'N1 Rocket Failures', 'milestone.competition.soviet', 'completed',
 '1972-11-23'::timestamptz,
 '{"state": "achieved", "test_flights": [{"date": "1969-02-21", "result": "Engine shutdown at 66 seconds, destroyed"}, {"date": "1969-07-03", "result": "Exploded on pad - largest artificial non-nuclear explosion"}, {"date": "1971-06-27", "result": "Rolled and broke apart at 51 seconds"}, {"date": "1972-11-23", "result": "Reached 40km, then destroyed"}], "height": "344 feet (taller than Saturn V)", "engines": "30 NK-15 engines in first stage", "problems": "Engine synchronization, vibration, quality control", "program_cancelled": "1976", "significance": "Soviet Moon program failure ended Space Race"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0006-0009-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Luna 16 First Robotic Sample Return', 'milestone.competition.soviet', 'completed',
 '1970-09-24'::timestamptz,
 '{"state": "achieved", "mission": "Luna 16", "landing_site": "Sea of Fertility", "sample_mass": "101 grams", "significance": "First robotic lunar sample return - Soviet alternative to crewed landing", "comparison": "Apollo returned 842 pounds; Luna missions returned about 300 grams total", "technology": "Proved robotic sample return possible"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0006-0010-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunokhod 1 First Lunar Rover', 'milestone.competition.soviet', 'completed',
 '1970-11-17'::timestamptz,
 '{"state": "achieved", "mission": "Luna 17 / Lunokhod 1", "significance": "First remote-controlled rover on another world", "duration": "11 months of operation", "distance": "10.54 km traveled", "features": ["8 wheels", "Solar panels", "Cameras", "Soil analysis"], "comparison": "Beat Apollo Lunar Rover (July 1971) by 8 months, but unmanned"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - TRAINING & TESTING
-- ============================================
('22222222-0009-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Landing Research Vehicle Flights', 'milestone.training.simulation', 'completed',
 '1968-05-06'::timestamptz,
 '{"state": "achieved", "dates": "1964-1972", "vehicle": "LLRV / LLTV (Flying Bedstead)", "location": "Ellington Field, Houston", "purpose": "Simulate lunar module handling in last 150 feet of descent", "pilots": "All lunar landing commanders trained", "armstrong_ejection": "May 6, 1968 - Armstrong ejected safely when LLRV crashed", "neil_quote": "Valuable training - worth the risk", "crashes": 3, "significance": "Critical for landing confidence"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0009-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Neutral Buoyancy Simulator Operational', 'milestone.training.facility', 'completed',
 '1966-01-01'::timestamptz,
 '{"state": "achieved", "location": "Marshall Space Flight Center", "purpose": "Underwater EVA training simulating weightlessness", "pool_size": "75 feet diameter, 40 feet deep", "innovation": "Buzz Aldrin used extensively for Gemini 12 EVA success", "still_used": "Evolved into current Neutral Buoyancy Lab at JSC", "significance": "Solved EVA exhaustion problems plaguing earlier Gemini missions"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0009-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 4 - First Saturn V Test', 'milestone.testing.rocket', 'completed',
 '1967-11-09'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 4 (AS-501)", "type": "Uncrewed all-up test", "achievements": ["First Saturn V flight", "First S-IC stage flight", "First S-II stage flight", "First S-IVB restart in orbit", "CM reentry at lunar return velocity"], "walter_cronkite": "CBS ceiling tiles fell during launch - This is really something!", "outcome": "Complete success - validated all-up testing approach", "significance": "Proved Saturn V could reach the Moon"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0009-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 5 - First Lunar Module Test', 'milestone.testing.spacecraft', 'completed',
 '1968-01-22'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 5 (AS-204)", "launch_vehicle": "Saturn IB", "type": "Uncrewed LM test in Earth orbit", "tests": ["Descent engine firing", "Ascent engine firing", "Stage separation (fire-in-the-hole)", "Abort staging simulation"], "outcome": "Successful despite minor issues", "significance": "Validated LM propulsion systems", "lm_designation": "LM-1"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0009-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 6 - Final Uncrewed Saturn V', 'milestone.testing.rocket', 'completed',
 '1968-04-04'::timestamptz,
 '{"state": "achieved", "mission": "Apollo 6 (AS-502)", "type": "Uncrewed Saturn V test", "problems": ["Pogo oscillation in S-II stage", "Two J-2 engines shut down early", "S-IVB failed to restart"], "outcome": "Partial success - problems identified and fixed", "fixes": "Helium injection to dampen pogo, J-2 engine modifications", "significance": "Last test before crewed flights - all issues resolved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - CANCELLED MISSIONS (0014-*)
-- ============================================
-- Apollo 20 cancelled first to free up Saturn V for Skylab
('22222222-0014-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 20 Cancelled', 'milestone.program.cancellation', 'completed',
 '1970-01-04'::timestamptz,
 '{"state": "achieved", "reason": "Budget cuts and Saturn V reallocation for Skylab", "context": "First Apollo mission cancelled", "announcement": "NASA Administrator Thomas Paine", "hardware_fate": "Saturn V SA-514 reserved for Skylab orbital workshop launch", "significance": "Began wind-down of Apollo lunar program"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Apollo 18 and 19 cancelled together
('22222222-0014-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 18 and 19 Cancelled', 'milestone.program.cancellation', 'completed',
 '1970-09-02'::timestamptz,
 '{"state": "achieved", "reason": "Congressional budget cuts, declining public interest, cost savings", "context": "Final lunar mission cancellations", "apollo_18_target": "Copernicus crater", "apollo_19_target": "Hyginus Rille", "crews_affected": ["Richard Gordon, Vance Brand, Harrison Schmitt (Apollo 18)", "Fred Haise, William Pogue, Gerald Carr (Apollo 19)"], "schmitt_outcome": "Reassigned to Apollo 17 - only scientist to walk on Moon", "budget_pressure": "NASA funding fell from 4.41% to 1.35% of federal budget", "legacy": "Apollo 17 became final lunar mission"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - POST-APOLLO LEGACY (0015-*)
-- Skylab and Apollo-Soyuz Test Project
-- ============================================
('22222222-0015-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Skylab Launch', 'milestone.program.station', 'completed',
 '1973-05-14'::timestamptz,
 '{"state": "achieved", "launch_vehicle": "Saturn V SA-513 (two-stage configuration)", "mission": "First American space station", "damage": "Micrometeoroid shield torn off during launch, one solar panel lost", "mass": "169,950 lbs (77,088 kg)", "orbital_workshop": "Converted S-IVB stage", "workshop_volume": "12,417 cubic feet (351.6 m³) - largest habitable volume of any spacecraft", "rescue_mission": "Skylab 2 crew deployed parasol sunshade and freed jammed solar panel"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0015-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Skylab 2 - First Crewed Mission', 'milestone.mission.station', 'completed',
 '1973-05-25'::timestamptz,
 '{"state": "achieved", "crew": ["Pete Conrad (Commander)", "Joseph Kerwin (Science Pilot)", "Paul Weitz (Pilot)"], "duration": "28 days, 49 minutes", "launch_vehicle": "Saturn IB", "repairs": "Deployed parasol sunshade through airlock, freed stuck solar panel during EVA", "eva_total": "5 hours 41 minutes", "achievements": ["Saved Skylab station", "First American EVA repair mission", "Medical experiments on long-duration effects"], "conrad_quote": "Everybody acts like we landed on the Moon. We just did what we were supposed to do."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0015-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Skylab 3 - Second Crewed Mission', 'milestone.mission.station', 'completed',
 '1973-07-28'::timestamptz,
 '{"state": "achieved", "crew": ["Alan Bean (Commander)", "Owen Garriott (Science Pilot)", "Jack Lousma (Pilot)"], "duration": "59 days, 11 hours, 9 minutes", "eva_total": "13 hours 44 minutes", "achievements": ["Deployed twin-pole sunshade (A-frame)", "Extensive solar observations during Comet Kohoutek passage", "3 EVAs conducted"], "experiments": "Earth resources, solar physics, biomedical"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0015-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Skylab 4 - Final Crewed Mission', 'milestone.mission.station', 'completed',
 '1973-11-16'::timestamptz,
 '{"state": "achieved", "crew": ["Gerald Carr (Commander)", "Edward Gibson (Science Pilot)", "William Pogue (Pilot)"], "duration": "84 days, 1 hour, 16 minutes - longest US spaceflight until Shuttle-Mir era", "eva_total": "22 hours 21 minutes (4 EVAs)", "achievements": ["Observed Comet Kohoutek", "Christmas EVA", "Extensive solar observations", "Set spaceflight duration record"], "notable_incident": "Crew complained about overwork, NASA adjusted schedule - lessons learned for future long-duration missions", "station_fate": "Skylab reentered atmosphere July 11, 1979 over Western Australia"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0015-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo-Soyuz Test Project', 'milestone.mission.international', 'completed',
 '1975-07-17'::timestamptz,
 '{"state": "achieved", "us_crew": ["Thomas Stafford (Commander)", "Vance Brand (CM Pilot)", "Deke Slayton (DM Pilot) - finally flew after 16-year medical grounding"], "soviet_crew": ["Alexei Leonov (Commander)", "Valeri Kubasov (Flight Engineer)"], "docking_time": "July 17, 1975 at 12:12 PM EDT", "handshake": "Stafford and Leonov shook hands through docking module at 3:17 PM EDT", "duration": "US: 9 days, 1 hour, 28 minutes; Soviet: 5 days, 22 hours, 31 minutes", "significance": ["First international crewed space mission", "Last Apollo spacecraft flight", "Last splashdown (until Crew Dragon)", "US-Soviet cooperation during détente"], "docking_module": "Custom adapter built by Rockwell to connect incompatible docking systems", "slayton_note": "Original Mercury 7 astronaut, grounded 1962-1972 for heart condition", "legacy": "Laid groundwork for Shuttle-Mir and ISS cooperation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - BUDGET & FUNDING (0016-*)
-- ============================================
('22222222-0016-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Peak NASA Budget - FY 1966', 'milestone.budget.peak', 'completed',
 '1966-07-01'::timestamptz,
 '{"state": "achieved", "fiscal_year": 1966, "budget": "$5.933 billion", "percent_federal_budget": "4.41%", "context": "Height of Apollo buildup - largest NASA budget ever as percentage of federal spending", "equivalent_2020_dollars": "$49.4 billion", "employment_peak": "400,000+ people across NASA, contractors, universities", "major_contractors": ["North American Aviation (CSM)", "Grumman (LM)", "Boeing (S-IC)", "Douglas (S-IVB)", "IBM (guidance)"], "facilities_built": ["Vehicle Assembly Building", "Launch Complex 39", "Mission Control Center expansion"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0016-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo Budget Decline Begins', 'milestone.budget.decline', 'completed',
 '1967-07-01'::timestamptz,
 '{"state": "achieved", "fiscal_year": 1967, "budget": "$5.0 billion", "percent_federal_budget": "3.1%", "context": "Post-Kennedy assassination, Vietnam War costs increasing, Great Society programs competing for funds", "trend": "Continued decline through 1972", "fy_1972_budget": "$3.4 billion (1.61% of federal budget)", "impact": ["Apollo 20 cancelled (January 1970)", "Apollo 18-19 cancelled (September 1970)", "Post-Apollo plans (lunar base, Mars) abandoned"], "administrator_quote": "Webb fought hard for budget, retired 1968; successors had less political capital"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - DIPLOMACY & WORLD IMPACT (0017-*)
-- ============================================
('22222222-0017-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Giant Leap World Tour', 'milestone.diplomacy.goodwill', 'completed',
 '1969-09-29'::timestamptz,
 '{"state": "achieved", "duration": "38 days (September 29 - November 5, 1969)", "countries_visited": 22, "cities": "24 cities", "participants": ["Neil Armstrong", "Buzz Aldrin", "Michael Collins", "and their wives"], "highlights": ["Massive crowds worldwide", "Pope Paul VI audience", "Queen Elizabeth II reception", "Addressed joint sessions of Congress in multiple countries"], "context": "Largest goodwill tour in US history at the time", "purpose": "Share Apollo 11 achievement with world, demonstrate peaceful space exploration", "quote": "Armstrong: We came in peace for all mankind - now sharing that message globally"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0017-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Goodwill Moon Rocks Distribution', 'milestone.diplomacy.science', 'completed',
 '1970-01-01'::timestamptz,
 '{"state": "achieved", "apollo_11_distribution": "Tiny samples encased in acrylic to 135 countries and 50 US states", "apollo_17_distribution": "Larger samples (1.142 grams each) to same recipients", "presentation": "Mounted with country flags flown to Moon on respective missions", "total_countries": 135, "nixon_presentation": "President Nixon presented during state visits", "current_status": "Many samples lost, stolen, or locations unknown - subject of recovery efforts", "scientific_value": "Symbolic rather than scientific due to small size", "significance": "Extended Apollo achievement as global diplomacy tool"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - KEY PERSONNEL ACHIEVEMENTS (0018-*)
-- ============================================
('22222222-0018-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo Guidance Computer Software Completion', 'milestone.engineering.software', 'completed',
 '1969-07-01'::timestamptz,
 '{"state": "achieved", "leader": "Margaret Hamilton, Director of Apollo Flight Computer Programming at MIT Instrumentation Laboratory", "innovation": "Pioneered software engineering as a discipline", "key_contribution": "Priority-based task scheduling that saved Apollo 11 landing during 1202/1203 alarms", "team_size": "400+ engineers", "memory": "36,864 words of core rope memory (ROM), 2,048 words of erasable core memory (RAM)", "lines_of_code": "Approximately 145,000 lines of assembly code", "hamilton_quote": "There was no choice but to be pioneers", "recognition": "Presidential Medal of Freedom (2016)", "legacy": "Coined term software engineering - now standard industry practice"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0018-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222',
 'Human Computers Calculate Trajectories', 'milestone.engineering.computation', 'completed',
 '1962-02-20'::timestamptz,
 '{"state": "achieved", "key_figure": "Katherine Johnson, NASA mathematician", "contribution": "Calculated trajectories for Mercury and Apollo missions", "mercury_contribution": "John Glenn requested she personally verify electronic computer calculations before his orbital flight", "apollo_contribution": "Calculated backup navigation charts for Apollo 11", "context": "African American women mathematicians (human computers) at Langley Research Center", "colleagues": ["Dorothy Vaughan", "Mary Jackson", "Christine Darden"], "recognition": "Presidential Medal of Freedom (2015), NASA building named in her honor", "book_film": "Hidden Figures (2016) brought their story to public attention", "glenn_quote": "Get the girl to check the numbers... If she says theyre good, Im ready to go"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PLANS
-- ============================================
INSERT INTO onto_plans (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Mercury Plans
('22222222-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Mercury Capsule Development', 'plan.engineering.spacecraft', 'completed',
 '{"contractor": "McDonnell Aircraft", "design": "Single-seat capsule", "launch_vehicles": ["Redstone", "Atlas"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0002-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Astronaut Selection and Training', 'plan.personnel.training', 'completed',
 '{"criteria": "Military test pilots", "selection": "From 500 candidates to 7", "training": ["centrifuge", "altitude chamber", "survival", "spacecraft systems"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Gemini Plans
('22222222-0002-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Rendezvous and Docking Training', 'plan.operations.training', 'completed',
 '{"objective": "Master orbital mechanics for lunar mission", "techniques": ["co-elliptic approach", "direct ascent", "catch-up maneuvers"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0002-0002-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'EVA Technique Development', 'plan.operations.eva', 'completed',
 '{"lessons_learned": "Gemini 9 showed EVA more demanding than expected", "solutions": ["handholds", "foot restraints", "underwater training", "task planning"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Apollo Plans
('22222222-0003-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Orbit Rendezvous Mission Mode', 'plan.mission.architecture', 'completed',
 '{"decision_date": "1962-07-11", "selected_over": ["Direct Ascent", "Earth Orbit Rendezvous"], "advantage": "Smaller spacecraft, single Saturn V launch", "architect": "John Houbolt"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0002-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Saturn V Development', 'plan.engineering.launch_vehicle', 'completed',
 '{"designer": "Wernher von Braun at Marshall Space Flight Center", "stages": {"s_ic": {"contractor": "Boeing", "facility": "Michoud Assembly Facility, New Orleans", "engines": "5x Rocketdyne F-1", "thrust": "7.5 million lbf"}, "s_ii": {"contractor": "North American Aviation", "facility": "Seal Beach, California", "engines": "5x Rocketdyne J-2", "thrust": "1 million lbf"}, "s_ivb": {"contractor": "Douglas Aircraft", "engines": "1x Rocketdyne J-2", "thrust": "200,000 lbf"}, "instrument_unit": {"contractor": "IBM", "purpose": "Guidance computer and flight control"}}, "specifications": {"height": "363 feet (111 m)", "diameter": "33 feet (10 m)", "mass_fully_fueled": "6.5 million pounds", "payload_to_leo": "310,000 pounds", "payload_to_tli": "107,000 pounds"}, "test_approach": "All-up testing advocated by George Mueller - saved 2+ years", "total_flights": 13, "success_rate": "100% (no payload losses)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0003-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Command/Service Module Development', 'plan.engineering.spacecraft', 'completed',
 '{"contractor": "North American Aviation, Downey, California", "crew": 3, "versions": {"block_i": "Earth orbital testing only (never flew crewed after Apollo 1)", "block_ii": "Lunar missions with redesigned safety features"}, "command_module": {"shape": "Truncated cone", "diameter": "12 ft 10 in (3.91 m)", "height": "11 ft 5 in (3.48 m)", "habitable_volume": "210 cubic feet (5.9 m³)", "heatshield": "Ablative - Avco Corporation"}, "service_module": {"propulsion": "Service Propulsion System (SPS) - 20,500 lbf", "fuel_cells": "3 hydrogen-oxygen fuel cells", "consumables": "Oxygen, hydrogen, water"}, "unit_cost": "$77 million", "role": "Transport crew to/from Moon, lunar orbit operations"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0004-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Module Development', 'plan.engineering.spacecraft', 'completed',
 '{"contractor": "Grumman Aerospace Corporation, Bethpage, New York", "contract_date": "November 7, 1962", "crew": 2, "versions": {"h_series": "Apollo 11-14, shorter stays", "j_series": "Apollo 15-17, extended stays with rover"}, "descent_stage": {"engine": "Throttleable descent engine (TDE) - 1,050 to 6,300 lbf", "propellant": "Aerozine-50 and nitrogen tetroxide", "legs": 4, "purpose": "Land on Moon, serve as launch platform"}, "ascent_stage": {"engine": "Ascent Propulsion System (APS) - 3,500 lbf", "crew_volume": "160 cubic feet (4.5 m³)", "purpose": "Return crew to lunar orbit for CSM docking"}, "mass": "33,500 lbs (15,200 kg) - H series", "subcontractors": ["Bell Aerosystems (ascent engine)", "Rocketdyne (descent engine)", "Hamilton Standard (life support)", "MIT (guidance computer)"], "unit_cost": "$50 million", "unique": "First spacecraft designed to fly only in vacuum - no aerodynamic streamlining"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0005-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 1 Fire Response Plan', 'plan.safety.redesign', 'completed',
 '{"changes": ["Quick-opening outward hatch", "Reduced flammable materials", "Rewired electrical systems", "Mixed gas atmosphere on pad", "Safety review boards"], "delay": "20 months"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0006-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Roving Vehicle Program', 'plan.engineering.rover', 'completed',
 '{"contractor": "Boeing", "missions": ["Apollo 15", "Apollo 16", "Apollo 17"], "max_speed": "8 mph", "range": "57 miles", "mass": "460 pounds"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Apollo 13 Rescue Plan
('22222222-0004-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 13 Rescue Operations', 'plan.emergency.rescue', 'completed',
 '{"lifeboat": "Used Lunar Module for life support", "trajectory": "Free-return around Moon", "power": "Shut down Command Module to preserve batteries", "co2_fix": "Improvised adapter for lithium hydroxide canisters", "duration": "4 days survival in crippled spacecraft"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TASKS
-- ============================================
INSERT INTO onto_tasks (id, project_id, type_key, title, state_key, priority, due_at, props, created_by) VALUES
-- Mercury Tasks
('22222222-0001-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.engineering.build',
 'Build Mercury capsule with ablative heatshield', 'done', 1, '1960-01-01'::timestamptz,
 '{"contractor": "McDonnell", "units_built": 20}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'task.engineering.testing',
 'Man-rate Redstone and Atlas boosters', 'done', 1, '1961-01-01'::timestamptz,
 '{"redstone": "Suborbital flights", "atlas": "Orbital flights"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0002-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.training.physical',
 'Train astronauts in centrifuge for high-G tolerance', 'done', 2, '1960-06-01'::timestamptz,
 '{"max_g": "11 G", "location": "Johnsville, PA"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0002-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'task.training.technical',
 'Train astronauts in spacecraft systems', 'done', 2, '1961-03-01'::timestamptz,
 '{"simulators": "Procedures trainers", "hours": "Hundreds per astronaut"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Gemini Tasks
('22222222-0002-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.operations.rendezvous',
 'Practice orbital rendezvous maneuvers', 'done', 1, '1965-12-15'::timestamptz,
 '{"missions": ["Gemini 6A/7", "Gemini 8", "Gemini 10", "Gemini 11", "Gemini 12"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0002-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'task.operations.docking',
 'Practice docking with Agena target vehicles', 'done', 1, '1966-03-16'::timestamptz,
 '{"first_docking": "Gemini 8", "lessons": "Control system issues identified and fixed"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0002-0002-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.training.neutral_buoyancy',
 'Develop underwater EVA training', 'done', 2, '1966-09-01'::timestamptz,
 '{"insight": "Neutral buoyancy simulates weightlessness for EVA practice"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Apollo Tasks
('22222222-0003-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.infrastructure.construction',
 'Construct Vehicle Assembly Building', 'done', 1, '1966-06-30'::timestamptz,
 '{"location": "Kennedy Space Center", "volume": "Largest single-story building in world", "purpose": "Stack Saturn V rockets"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0001-0002-000000000002', '22222222-2222-2222-2222-222222222222', 'task.infrastructure.construction',
 'Build Launch Complex 39', 'done', 1, '1967-11-09'::timestamptz,
 '{"pads": ["39A", "39B"], "crawler": "Transport Saturn V from VAB to pad"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0002-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.testing.launch_vehicle',
 'Test Saturn V with uncrewed flights', 'done', 1, '1968-04-04'::timestamptz,
 '{"missions": ["Apollo 4", "Apollo 6"], "result": "All-up testing validated rocket"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0003-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.engineering.redesign',
 'Redesign Command Module hatch after Apollo 1', 'done', 1, '1968-10-11'::timestamptz,
 '{"old": "Inward-opening, multi-piece", "new": "Outward-opening, single-motion, opens in 10 seconds"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0003-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'task.engineering.safety',
 'Remove flammable materials from spacecraft', 'done', 1, '1968-10-11'::timestamptz,
 '{"removed": ["Velcro", "Nylon netting", "Paper checklists"], "replaced_with": "Self-extinguishing materials"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0004-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.testing.propulsion',
 'Qualify Lunar Module descent engine', 'done', 1, '1969-03-03'::timestamptz,
 '{"throttleable": "Yes - 10% to 60%", "purpose": "Powered descent to lunar surface"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0004-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'task.testing.spacecraft',
 'Test Lunar Module in Earth orbit', 'done', 1, '1969-03-03'::timestamptz,
 '{"mission": "Apollo 9", "crew": "McDivitt, Scott, Schweickart"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0006-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.mission.landing',
 'Land Apollo 11 on the Moon', 'done', 1, '1969-07-20'::timestamptz,
 '{"site": "Sea of Tranquility", "crew": ["Armstrong", "Aldrin"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0006-0002-000000000002', '22222222-2222-2222-2222-222222222222', 'task.science.sampling',
 'Collect lunar samples', 'done', 2, '1972-12-19'::timestamptz,
 '{"apollo_11": "47.5 pounds", "total_all_missions": "842 pounds"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0006-0003-000000000001', '22222222-2222-2222-2222-222222222222', 'task.ceremony.flag',
 'Plant American flag on Moon', 'done', 3, '1969-07-20'::timestamptz,
 '{"missions": "All six landings", "symbolism": "American achievement, peaceful purposes"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Apollo 13 Rescue Tasks
('22222222-0004-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', 'task.emergency.power',
 'Power down Command Module', 'done', 1, '1970-04-13'::timestamptz,
 '{"purpose": "Preserve batteries for reentry", "challenge": "Procedures had to be invented in real-time"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0004-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'task.emergency.survival',
 'Transfer crew to Lunar Module lifeboat', 'done', 1, '1970-04-13'::timestamptz,
 '{"crew": ["Lovell", "Swigert", "Haise"], "duration": "4 days in LM"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0004-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222', 'task.emergency.lifesupport',
 'Build CO2 scrubber adapter', 'done', 1, '1970-04-14'::timestamptz,
 '{"problem": "Square CM canisters, round LM receptacles", "solution": "Duct tape, cardboard, plastic bags", "time": "Built from instructions radioed from Houston"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0004-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222', 'task.emergency.navigation',
 'Execute free-return trajectory burn', 'done', 1, '1970-04-14'::timestamptz,
 '{"engine": "LM descent engine", "purpose": "Speed up return to Earth"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- ADDITIONAL TASKS - TECHNOLOGY DEVELOPMENT
-- ============================================
('22222222-0010-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'task.engineering.computer',
 'Develop Apollo Guidance Computer', 'done', 1, '1966-01-01'::timestamptz,
 '{"developer": "MIT Instrumentation Laboratory", "manufacturer": "Raytheon", "lead": "Charles Stark Draper", "specs": {"memory": "74KB total (36K ROM, 2K RAM)", "speed": "0.043 MHz", "weight": "70 pounds"}, "innovation": "First integrated circuit computer", "software_lead": "Margaret Hamilton", "significance": "Pioneered software engineering discipline"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'task.engineering.lifesupport',
 'Design and Build Spacesuits (A7L)', 'done', 1, '1968-01-01'::timestamptz,
 '{"contractor": "ILC Dover (suit), Hamilton Standard (backpack)", "model": "A7L (Apollo missions)", "layers": 21, "weight": "180 pounds on Earth (30 on Moon with backpack)", "pressure": "3.7 psi pure oxygen", "mobility": "21 joints", "cost": "$100,000 per suit", "custom_fit": "Each suit custom-made for astronaut"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222', 'task.engineering.eva',
 'Develop Portable Life Support System (PLSS)', 'done', 1, '1968-01-01'::timestamptz,
 '{"contractor": "Hamilton Standard", "functions": ["Oxygen supply", "CO2 removal", "Temperature control", "Communications"], "duration": "4-7 hours EVA capability", "cooling": "Liquid cooling garment", "weight": "84 pounds Earth weight"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222', 'task.engineering.propulsion',
 'Build F-1 Rocket Engine', 'done', 1, '1967-01-01'::timestamptz,
 '{"contractor": "Rocketdyne", "thrust": "1.5 million pounds each", "fuel": "RP-1 kerosene and liquid oxygen", "burn_time": "165 seconds", "flow_rate": "3 tons per second", "development_time": "8 years (1959-1967)", "quantity_per_launch": 5, "combustion_instability": "Major challenge - solved with baffles"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0001-0005-000000000001', '22222222-2222-2222-2222-222222222222', 'task.engineering.propulsion',
 'Build J-2 Rocket Engine', 'done', 1, '1966-01-01'::timestamptz,
 '{"contractor": "Rocketdyne", "thrust": "225,000 pounds (vacuum)", "fuel": "Liquid hydrogen and liquid oxygen", "innovation": "First large restartable rocket engine", "restarts": "Up to 2 in flight", "uses": ["S-II stage (5 engines)", "S-IVB stage (1 engine)"], "significance": "Enabled trans-lunar injection"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0001-0006-000000000001', '22222222-2222-2222-2222-222222222222', 'task.engineering.navigation',
 'Develop Lunar Module Landing Radar', 'done', 1, '1968-01-01'::timestamptz,
 '{"contractor": "Ryan Aeronautical", "functions": ["Altitude measurement", "Velocity measurement"], "range": "50,000 feet to surface", "accuracy": "Better than 1%", "critical_for": "Powered descent - computer needs accurate altitude and speed", "apollo_11_issue": "Program alarms during landing due to radar data overflow"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0001-0007-000000000001', '22222222-2222-2222-2222-222222222222', 'task.infrastructure.equipment',
 'Build Crawler-Transporter', 'done', 1, '1966-01-01'::timestamptz,
 '{"contractor": "Marion Power Shovel Company", "quantity": 2, "weight": "6 million pounds", "dimensions": "131 x 114 feet", "speed": "1 mph loaded, 2 mph unloaded", "fuel_consumption": "150 gallons per mile", "leveling": "Keeps rocket vertical within 10 arcminutes", "journey": "3.5 miles from VAB to pad 39A", "still_used": "Modified for Space Shuttle and SLS"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- ADDITIONAL TASKS - MISSION OPERATIONS
-- ============================================
('22222222-0010-0002-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'task.operations.trajectory',
 'Perform Trans-Lunar Injection (TLI)', 'done', 1, '1969-07-16'::timestamptz,
 '{"description": "S-IVB third stage restart to send spacecraft toward Moon", "delta_v": "10,000 fps", "duration": "6 minute burn", "window": "Must occur at precise time for trajectory", "distance": "Earth to Moon 238,855 miles average", "travel_time": "3 days"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0002-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'task.operations.trajectory',
 'Execute Lunar Orbit Insertion (LOI)', 'done', 1, '1969-07-19'::timestamptz,
 '{"description": "CSM engine burn to enter lunar orbit", "engine": "Service Propulsion System (SPS)", "duration": "6 minute retrograde burn", "critical": "Loss of signal behind Moon - crew must execute blind", "orbit": "60 x 170 nautical miles initial, then circularized"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0002-0003-000000000001', '22222222-2222-2222-2222-222222222222', 'task.operations.landing',
 'Execute Powered Descent Initiation (PDI)', 'done', 1, '1969-07-20'::timestamptz,
 '{"description": "LM descent engine burn from orbit to surface", "duration": "12 minutes", "altitude_start": "50,000 feet", "phases": ["Braking phase", "Approach phase", "Landing phase"], "fuel_margin": "Approximately 2 minutes hover time", "armstrong_manual": "Apollo 11 - took manual control to avoid boulder field"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0002-0004-000000000001', '22222222-2222-2222-2222-222222222222', 'task.science.experiments',
 'Deploy ALSEP Experiments', 'done', 2, '1972-12-11'::timestamptz,
 '{"full_name": "Apollo Lunar Surface Experiments Package", "missions": ["Apollo 12", "Apollo 14", "Apollo 15", "Apollo 16", "Apollo 17"], "experiments": ["Passive Seismometer", "Active Seismometer", "Laser Ranging Retroreflector", "Solar Wind Collector", "Heat Flow Probe", "Lunar Surface Magnetometer"], "power": "Plutonium RTG - operated until 1977", "data": "Detected moonquakes, established Moon has small core"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0002-0005-000000000001', '22222222-2222-2222-2222-222222222222', 'task.operations.rendezvous',
 'Perform LM Ascent and Rendezvous', 'done', 1, '1969-07-21'::timestamptz,
 '{"description": "Launch from Moon surface, rendezvous with CSM", "engine": "Ascent Propulsion System (APS)", "burn_time": "7 minutes to orbit", "rendezvous": "3-4 hours after liftoff", "critical": "Single engine, no backup - must work", "call_signs": "Eagle/Columbia, Intrepid/Yankee Clipper, etc."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0002-0006-000000000001', '22222222-2222-2222-2222-222222222222', 'task.operations.trajectory',
 'Perform Trans-Earth Injection (TEI)', 'done', 1, '1969-07-21'::timestamptz,
 '{"description": "CSM engine burn to return to Earth", "engine": "Service Propulsion System", "duration": "2.5 minute burn", "critical": "Behind Moon, out of contact - must execute precisely", "coast_time": "3 days back to Earth", "trajectory": "Free-return backup available"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0002-0007-000000000001', '22222222-2222-2222-2222-222222222222', 'task.operations.reentry',
 'Execute CM Reentry', 'done', 1, '1969-07-24'::timestamptz,
 '{"entry_velocity": "25,000 mph (36,000 fps)", "entry_angle": "6.5 degrees (narrow corridor)", "heat": "5,000°F on heat shield", "g_forces": "6-7 Gs peak", "blackout": "4 minutes communication blackout", "parachutes": "3 main chutes, 83.5 feet diameter each", "splashdown": "Pacific Ocean, Navy recovery"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- ADDITIONAL TASKS - CREW TRAINING
-- ============================================
('22222222-0010-0003-0001-000000000001', '22222222-2222-2222-2222-222222222222', 'task.training.science',
 'Geology Field Training', 'done', 2, '1969-06-01'::timestamptz,
 '{"purpose": "Train astronauts to recognize and collect scientifically valuable samples", "locations": ["Grand Canyon", "Iceland", "Hawaii volcanoes", "Meteor Crater, AZ", "New Mexico lava fields"], "instructors": "USGS geologists", "hours": "Hundreds per crew", "schmitt_exception": "Harrison Schmitt already a geologist - helped train others"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0003-0002-000000000001', '22222222-2222-2222-2222-222222222222', 'task.training.simulation',
 'Lunar Surface Simulation Training', 'done', 2, '1969-06-01'::timestamptz,
 '{"location": "Building 9, Manned Spacecraft Center", "equipment": ["1/6 gravity simulators", "Full-scale LM mockup", "Lunar surface mockup"], "egress_practice": "Exit/enter LM in suits", "tool_usage": "Sample collection, flag deployment, ALSEP setup"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0003-0003-000000000001', '22222222-2222-2222-2222-222222222222', 'task.training.simulation',
 'Command Module Simulator Training', 'done', 2, '1969-06-01'::timestamptz,
 '{"location": "Kennedy Space Center and MSC Houston", "simulator_type": "Full mission simulator", "capabilities": ["Full procedures training", "Malfunction scenarios", "Reentry simulation"], "hours_per_crew": "400+ hours in simulator", "fidelity": "Exact cockpit replica with out-the-window visuals"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0003-0004-000000000001', '22222222-2222-2222-2222-222222222222', 'task.training.simulation',
 'Lunar Module Simulator Training', 'done', 2, '1969-06-01'::timestamptz,
 '{"location": "Kennedy Space Center and MSC Houston", "special_feature": "Descent and landing simulation", "landing_scenarios": "Hundreds of practice landings", "malfunctions": "Computer alarms, sensor failures, abort scenarios", "armstrong_prep": "Extensive practice for manual landing override"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0010-0003-0005-000000000001', '22222222-2222-2222-2222-222222222222', 'task.training.emergency',
 'Survival Training', 'done', 2, '1968-01-01'::timestamptz,
 '{"scenarios": ["Water survival", "Jungle survival", "Desert survival"], "water_training": "Pacific Ocean splashdown egress", "jungle_location": "Panama Canal Zone", "desert_location": "Nevada desert", "purpose": "Off-target landing recovery"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DECISIONS
-- ============================================
INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
('22222222-0001-0001-0001-000000000003', '22222222-2222-2222-2222-222222222222',
 'Select Mercury Seven Astronauts', '1959-04-09'::timestamptz,
 'Military test pilots under 40, under 5''11" required. Selected 7 from 508 candidates.',
 '{"type": "decision.personnel.selection", "selected": 7, "from": 508, "decider": "NASA"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0001-0001-000000000003', '22222222-2222-2222-2222-222222222222',
 'Adopt Lunar Orbit Rendezvous', '1962-07-11'::timestamptz,
 'Required smallest spacecraft, could use single Saturn V. John Houbolt''s advocacy proved decisive.',
 '{"type": "decision.architecture.mission_mode", "options": ["Direct Ascent", "Earth Orbit Rendezvous", "Lunar Orbit Rendezvous"], "selected": "Lunar Orbit Rendezvous", "advocate": "John Houbolt"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0001-0002-000000000003', '22222222-2222-2222-2222-222222222222',
 'All-Up Testing for Saturn V', '1963-11-01'::timestamptz,
 'Test complete rocket on first flight instead of stage-by-stage. High risk but saved 2+ years of development time.',
 '{"type": "decision.testing.approach", "advocate": "George Mueller", "approach": "Test complete rocket on first flight", "outcome": "Saved 2+ years of development time"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222',
 'Send Apollo 8 to Moon Without LM', '1968-08-19'::timestamptz,
 'LM not ready, intelligence suggested Soviet circumlunar attempt. First crewed Saturn V, first lunar orbit.',
 '{"type": "decision.mission.bold", "context": "LM not ready, intelligence suggested Soviet circumlunar attempt", "risk": "First crewed Saturn V, first lunar orbit", "outcome": "Historic success, Christmas Eve broadcast"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0003-0001-000000000003', '22222222-2222-2222-2222-222222222222',
 'Implement Block II CM After Apollo 1', '1967-04-05'::timestamptz,
 'Complete redesign required after Apollo 1 fire. New hatch, reduced flammables, rewired systems, safety culture transformation.',
 '{"type": "decision.safety.redesign", "changes": ["New hatch", "Reduced flammables", "Rewired systems", "Safety culture"], "delay": "20 months", "result": "No further cabin fires"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0006-0001-000000000003', '22222222-2222-2222-2222-222222222222',
 'Select Neil Armstrong as First Man on Moon', '1969-04-14'::timestamptz,
 'Civilian, mission commander, modest personality. Armstrong embodied the ideal face of Apollo program.',
 '{"type": "decision.personnel.historic", "alternatives": "Buzz Aldrin (LM pilot)", "significance": "Face of Apollo program"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0008-0001-000000000003', '22222222-2222-2222-2222-222222222222',
 'Abort Apollo 13 Lunar Landing', '1970-04-13'::timestamptz,
 'Crew survival prioritized over mission objectives after oxygen tank explosion. Use LM as lifeboat, free-return trajectory.',
 '{"type": "decision.mission.abort", "trigger": "Oxygen tank explosion", "priority": "Crew survival over mission objectives", "method": "Use LM as lifeboat, free-return trajectory"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0012-0001-000000000003', '22222222-2222-2222-2222-222222222222',
 'End Apollo Program After Apollo 17', '1970-09-02'::timestamptz,
 'Budget cuts and waning public interest. Cancelled Apollo 18, 19, 20. Last moonwalk December 14, 1972.',
 '{"type": "decision.program.termination", "cancelled_missions": ["Apollo 18", "Apollo 19", "Apollo 20"], "reason": "Budget cuts, public interest waned", "last_moonwalk": "1972-12-14"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- ADDITIONAL DECISIONS
-- ============================================
('22222222-0011-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Select Apollo 11 Landing Site', '1969-06-17'::timestamptz,
 'Sea of Tranquility selected for smooth terrain, fuel efficiency, optimal lighting conditions, and Lunar Orbiter mapping.',
 '{"type": "decision.mission.landing_site", "site_selected": "Sea of Tranquility (Site 2)", "coordinates": "0.67408°N, 23.47297°E", "criteria": ["Smooth terrain", "Fuel efficiency", "Lighting conditions (low Sun angle)", "Mapped by Lunar Orbiter"], "alternatives_considered": ["Site 1 (Sinus Medii)", "Site 3 (Central Bay)", "Site 4", "Site 5"], "final_review": "Apollo Site Selection Board"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0011-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222',
 'Use Pure Oxygen Atmosphere', '1962-01-01'::timestamptz,
 'Simpler system, lighter weight, proven in Mercury/Gemini. Fire hazard realized after Apollo 1; mixed gas on pad thereafter.',
 '{"type": "decision.engineering.environment", "pressure": "5 psi in flight, 16.7 psi on pad", "risk": "Fire hazard in pure oxygen - realized after Apollo 1", "post_apollo1": "Mixed gas (60% O2, 40% N2) on pad, pure O2 in flight", "lesson": "Weight savings nearly cost lives"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0011-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222',
 'Select Command Module Contractor', '1961-11-28'::timestamptz,
 'North American Aviation scored highest on technical approach. Initial bid $400 million, final cost over $3.5 billion.',
 '{"type": "decision.contracts.spacecraft", "selected": "North American Aviation", "bid_amount": "$400 million initial", "competitors": ["Martin", "General Dynamics", "McDonnell", "General Electric"], "evaluation": "North American scored highest on technical approach", "final_cost": "Over $3.5 billion through program"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0011-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222',
 'Select Lunar Module Contractor', '1962-11-07'::timestamptz,
 'Grumman had best technical approach for unique two-stage design. First spacecraft designed solely for vacuum operation.',
 '{"type": "decision.contracts.spacecraft", "selected": "Grumman Aircraft Engineering Corporation", "competitors": 11, "evaluation": "Best technical approach for unique two-stage design", "key_personnel": ["Tom Kelly (Chief Engineer)", "Joe Gavin (VP)", "John Snedeker"], "challenge": "First spacecraft designed solely for vacuum operation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0011-0001-0005-000000000001', '22222222-2222-2222-2222-222222222222',
 'Include Scientists in Astronaut Corps', '1965-06-28'::timestamptz,
 'Scientist-Astronauts Group 4 selected. Established precedent for mission specialists; Schmitt became only scientist to walk on Moon.',
 '{"type": "decision.personnel.diversity", "group_selected": "Scientist-Astronauts Group 4", "scientists": ["Harrison Schmitt (geologist)", "Joseph Allen (physicist)", "Anthony England (geophysicist)", "Karl Henize (astronomer)", "Story Musgrave (physician)", "William Thornton (physician)"], "schmitt_achievement": "Only scientist to walk on Moon (Apollo 17)", "legacy": "Established precedent for mission specialists"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0011-0001-0006-000000000001', '22222222-2222-2222-2222-222222222222',
 'Replace Engle with Schmitt on Apollo 17', '1971-08-13'::timestamptz,
 'Scientific community lobbied for geologist on final Moon mission. Schmitt discovered orange soil, collected most valuable samples.',
 '{"type": "decision.personnel.crew_assignment", "original_lmp": "Joe Engle (test pilot)", "replacement": "Harrison Schmitt (geologist)", "decider": "NASA Administrator James Fletcher", "engle_reaction": "Disappointed but professional", "schmitt_contribution": "Discovered orange soil, collected most valuable samples"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0011-0001-0007-000000000001', '22222222-2222-2222-2222-222222222222',
 'Armstrong Takes Manual Control on Apollo 11', '1969-07-20'::timestamptz,
 'Computer targeting boulder-strewn crater. Armstrong took semi-manual control, flew 1,500 feet downrange with 25 seconds fuel remaining.',
 '{"type": "decision.mission.realtime", "time": "20:14 UTC", "situation": "Computer targeting boulder-strewn crater", "action": "Armstrong took semi-manual control (P66)", "fuel_remaining": "25 seconds at touchdown", "distance_flown": "Flew 1,500 feet downrange to find safe spot", "training_value": "LLRV practice proved essential", "capcom": "Charlie Duke"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0011-0001-0008-000000000001', '22222222-2222-2222-2222-222222222222',
 'Continue Descent Despite 1202 Alarms', '1969-07-20'::timestamptz,
 'Steve Bales (age 26) and Jack Garman (age 24) determined alarms were not continuous - computer was recovering. Go for landing.',
 '{"type": "decision.mission.realtime", "alarm": "1202 (Executive Overflow)", "meaning": "Computer overloaded - too much data from radar", "decision": "Go for landing", "decider": "Steve Bales (Guidance Officer) with Jack Garman (backroom)", "garman_age": 24, "basis": "Alarms were not continuous - computer recovering", "significance": "Split-second decision saved mission"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0011-0001-0009-000000000001', '22222222-2222-2222-2222-222222222222',
 'Use J-missions for Extended Exploration', '1969-09-01'::timestamptz,
 'Extended missions with Lunar Rover, longer stays, more science. Apollo 15, 16, 17 became J-missions.',
 '{"type": "decision.mission.architecture", "j_missions": ["Apollo 15", "Apollo 16", "Apollo 17"], "enhancements": ["Lunar Roving Vehicle", "Extended LM consumables", "Longer surface stays (3 days)", "3 EVAs per mission", "More science instruments"], "h_missions": ["Apollo 11", "Apollo 12", "Apollo 14"], "cancelled": "Apollo 18, 19, 20 would have been J-missions"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0011-0001-0010-000000000001', '22222222-2222-2222-2222-222222222222',
 'Night Launch for Apollo 17', '1972-12-07'::timestamptz,
 'Launch window dictated by Moon position. Only night launch of Apollo program, visible from 500 miles away.',
 '{"type": "decision.mission.operations", "time": "05:33 UTC (12:33 AM EST)", "reason": "Launch window dictated by Moon position", "significance": "Only night launch of Apollo program", "spectators": "500,000 despite late hour", "visibility": "Launch visible from 500 miles away"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RISKS
-- ============================================
INSERT INTO onto_risks (id, project_id, title, type_key, probability, impact, state_key, props, created_by) VALUES
('22222222-0001-0001-0001-000000000004', '22222222-2222-2222-2222-222222222222',
 'Launch Vehicle Failure', 'risk.technical.rocket', 0.3, 'critical', 'mitigated',
 '{"mitigation": "Extensive testing, abort systems", "occurrences": "Several uncrewed failures early on"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0001-0001-000000000004', '22222222-2222-2222-2222-222222222222',
 'Spacecraft Fire', 'risk.safety.fire', 0.2, 'critical', 'occurred',
 '{"occurrence": "Apollo 1, January 27, 1967", "casualties": 3, "aftermath": "Complete safety overhaul, 20-month delay"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0002-0001-000000000004', '22222222-2222-2222-2222-222222222222',
 'Micrometeorite Strike', 'risk.environmental.space', 0.1, 'high', 'mitigated',
 '{"mitigation": "Spacecraft hull design, operational awareness", "occurrence": "None significant"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0003-0001-000000000004', '22222222-2222-2222-2222-222222222222',
 'Lunar Module Descent Engine Failure', 'risk.technical.propulsion', 0.1, 'critical', 'mitigated',
 '{"mitigation": "Extensive testing, abort procedures", "occurrence": "None - all descents successful"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0004-0001-000000000004', '22222222-2222-2222-2222-222222222222',
 'Rendezvous Failure in Lunar Orbit', 'risk.operations.rendezvous', 0.15, 'critical', 'mitigated',
 '{"scenario": "LM unable to dock with CSM", "mitigation": "Backup procedures, Gemini experience", "occurrence": "None"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0005-0001-000000000004', '22222222-2222-2222-2222-222222222222',
 'Spacecraft Systems Failure En Route', 'risk.technical.systems', 0.2, 'critical', 'occurred',
 '{"occurrence": "Apollo 13 oxygen tank explosion", "outcome": "Crew survived using LM lifeboat", "lesson": "Redundancy and crew training saved lives"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0006-0001-000000000004', '22222222-2222-2222-2222-222222222222',
 'Lunar Surface EVA Emergency', 'risk.operations.eva', 0.15, 'high', 'mitigated',
 '{"scenarios": ["Suit breach", "Fall", "Equipment failure"], "mitigation": "Training, buddy system, abort procedures", "occurrence": "None critical"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0006-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Soviet Moon Landing Before US', 'risk.competition.political', 0.4, 'high', 'closed',
 '{"context": "USSR ahead in early Space Race", "mitigation": "Kennedy commitment, massive resources", "outcome": "USA won decisively - Soviet N1 rocket failed"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- ADDITIONAL RISKS
-- ============================================
('22222222-0012-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Van Allen Radiation Belt Exposure', 'risk.environmental.radiation', 0.15, 'high', 'mitigated',
 '{"hazard": "Energetic protons and electrons trapped in Earths magnetic field", "belts": ["Inner belt: 1,000-6,000 km", "Outer belt: 13,000-60,000 km"], "transit_time": "Approximately 30 minutes through belts", "trajectory": "Carefully planned to minimize exposure", "dosage": "Average 0.18 rad per mission (acceptable)", "mitigation": "Fast transit, aluminum shielding, trajectory planning"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222',
 'Solar Particle Event During Mission', 'risk.environmental.radiation', 0.1, 'critical', 'mitigated',
 '{"hazard": "Massive radiation from solar flares", "worst_case": "August 1972 event - between Apollo 16 and 17 - would have been lethal", "monitoring": "NOAA solar observation network", "protection": "Mission abort, CM as radiation shelter", "occurrence": "No major events during crewed missions (luck)", "lesson": "Future missions need dedicated storm shelters"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222',
 'Navigation Error During Trans-lunar Coast', 'risk.operations.navigation', 0.1, 'high', 'mitigated',
 '{"precision_required": "Entry corridor 2 degrees wide at 25,000 mph", "navigation_method": "Star sighting with sextant + ground tracking", "mid_course_corrections": "Up to 4 planned burns to adjust trajectory", "apollo_13": "PC+2 burn successfully performed with crippled spacecraft", "backup": "Free-return trajectory available"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222',
 'Communications Loss', 'risk.operations.communications', 0.2, 'high', 'mitigated',
 '{"challenge": "Quarter-million mile distance", "network": "Deep Space Network (DSN) - Goldstone, Canberra, Madrid", "backup": "S-band and VHF systems", "lunar_farside": "Complete loss of signal for 45 minutes per orbit", "apollo_13_challenge": "Reduced power meant using low-gain antenna", "contingency": "Crew trained to execute critical burns autonomously"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0005-000000000001', '22222222-2222-2222-2222-222222222222',
 'Service Propulsion System Failure', 'risk.technical.propulsion', 0.1, 'critical', 'mitigated',
 '{"engine": "Aerojet AJ10-137", "criticality": "Must work for LOI, TEI - no redundancy", "reliability": "Designed for 36 starts, only used 2-3 per mission", "thrust": "20,500 lbf", "hypergolic": "Self-igniting fuel/oxidizer", "occurrence": "Zero failures in program", "backup": "LM descent engine could provide limited backup"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0006-000000000001', '22222222-2222-2222-2222-222222222222',
 'LM Ascent Engine Failure', 'risk.technical.propulsion', 0.05, 'critical', 'mitigated',
 '{"criticality": "Absolutely must work - no backup, no rescue possible", "design": "Extreme simplicity, hypergolic propellants", "testing": "Most tested engine in program", "reliability": "Designed for absolute reliability over performance", "pressure_fed": "No turbopumps to fail", "occurrence": "Zero failures - all 6 lunar liftoffs successful"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0007-000000000001', '22222222-2222-2222-2222-222222222222',
 'Dust Contamination on Lunar Surface', 'risk.environmental.lunar', 0.9, 'medium', 'mitigated',
 '{"problem": "Lunar dust extremely abrasive, clingy, pervasive", "effects": ["Suit joints stiffened", "Visor scratched", "Equipment degraded", "Respiratory hazard if inhaled"], "apollo_17": "Dust caused significant suit problems", "temporary_fixes": "Brushing, tape to remove dust", "lesson": "Major challenge for future lunar stays"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0008-000000000001', '22222222-2222-2222-2222-222222222222',
 'Heat Shield Failure During Reentry', 'risk.technical.thermal', 0.05, 'critical', 'mitigated',
 '{"entry_temperature": "5,000°F on heat shield surface", "heat_shield": "Ablative material by Avco Corporation", "testing": "Extensive ground testing, Apollo 4 unmanned test", "single_point_failure": "No redundancy - must work", "occurrence": "None - all entries successful", "apollo_13_concern": "Unknown damage from explosion - shield proved intact"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0009-000000000001', '22222222-2222-2222-2222-222222222222',
 'Parachute Failure During Descent', 'risk.technical.recovery', 0.1, 'critical', 'occurred',
 '{"system": "3 main parachutes, 3 drogue chutes", "apollo_15": "One of three main chutes failed - successful landing anyway", "design_margin": "CM can land safely on 2 chutes", "testing": "Extensive drop tests", "drogue": "Slows CM, stabilizes before mains", "occurrence": "1 chute failure (Apollo 15), 1 chute collapse (Skylab 2)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0010-000000000001', '22222222-2222-2222-2222-222222222222',
 'Lunar Biological Contamination', 'risk.science.biological', 0.01, 'unknown', 'closed',
 '{"concern": "Unknown lunar pathogens could threaten Earth life", "precaution": "21-day quarantine for astronauts and samples", "lunar_receiving_lab": "Biological barrier facility in Houston", "protocol": "Crew in Mobile Quarantine Facility immediately after splashdown", "finding": "No biological material found on Moon", "quarantine_ended": "After Apollo 14 - deemed unnecessary"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0012-0001-0011-000000000001', '22222222-2222-2222-2222-222222222222',
 'Mascon Navigation Anomalies', 'risk.environmental.lunar', 0.3, 'medium', 'mitigated',
 '{"discovery": "Lunar Orbiter tracking showed orbit perturbations", "cause": "Mass concentrations (mascons) under maria", "effect": "Unpredictable changes to lunar orbit", "first_issue": "Apollo 11 landing target overshot by 4 miles", "mitigation": "Detailed gravity mapping, orbit corrections", "legacy": "Led to lunar gravity field mapping"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENTS
-- ============================================
INSERT INTO onto_documents (id, project_id, title, type_key, state_key, props, created_by) VALUES
('22222222-0001-0004-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Kennedy''s Moon Speech to Congress', 'document.speech.historic', 'published',
 '{"date": "1961-05-25", "speaker": "President John F. Kennedy", "location": "Joint Session of Congress", "quote": "I believe that this nation should commit itself to achieving the goal, before this decade is out, of landing a man on the Moon and returning him safely to the Earth."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0001-0004-0002-000000000001', '22222222-2222-2222-2222-222222222222',
 'Rice University Moon Speech', 'document.speech.historic', 'published',
 '{"date": "1962-09-12", "speaker": "President John F. Kennedy", "location": "Rice Stadium, Houston", "quote": "We choose to go to the Moon in this decade and do the other things, not because they are easy, but because they are hard."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0001-0001-000000000005', '22222222-2222-2222-2222-222222222222',
 'Apollo 204 Review Board Report', 'document.investigation.accident', 'published',
 '{"date": "1967-04-05", "subject": "Apollo 1 Fire Investigation", "findings": "Electrical ignition, pure oxygen atmosphere, flammable materials, hatch design", "recommendations": "Complete spacecraft redesign"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0003-0001-000000000005', '22222222-2222-2222-2222-222222222222',
 'Apollo 8 Genesis Reading', 'document.broadcast.historic', 'published',
 '{"date": "1968-12-24", "context": "Christmas Eve broadcast from lunar orbit", "crew": ["Borman", "Lovell", "Anders"], "content": "In the beginning, God created the heavens and the earth...", "audience": "Largest TV audience in history at that time"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0006-0001-000000000005', '22222222-2222-2222-2222-222222222222',
 'Apollo 11 Lunar Plaque', 'document.artifact.plaque', 'published',
 '{"date": "1969-07-20", "text": "Here men from the planet Earth first set foot upon the Moon, July 1969 A.D. We came in peace for all mankind.", "signatures": ["Nixon", "Armstrong", "Collins", "Aldrin"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0006-0002-000000000005', '22222222-2222-2222-2222-222222222222',
 'Armstrong''s First Words on Moon', 'document.quote.historic', 'published',
 '{"date": "1969-07-20", "time": "20:17:40 UTC", "speaker": "Neil Armstrong", "quote": "That''s one small step for man, one giant leap for mankind.", "context": "First human words spoken on lunar surface"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0008-0001-000000000005', '22222222-2222-2222-2222-222222222222',
 'Apollo 13 Problem Report', 'document.transmission.historic', 'published',
 '{"date": "1970-04-13", "time": "55:54:53 mission elapsed time", "speakers": ["Jack Swigert", "Jim Lovell"], "swigert": "Okay, Houston, we''ve had a problem here", "lovell": "Houston, we''ve had a problem", "misquote": "Houston, we have a problem (from 1995 film)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0003-0012-0001-000000000005', '22222222-2222-2222-2222-222222222222',
 'Cernan''s Last Words on Moon', 'document.quote.historic', 'published',
 '{"date": "1972-12-14", "speaker": "Eugene Cernan", "quote": "We leave as we came and, God willing, as we shall return, with peace and hope for all mankind.", "context": "Last words spoken on lunar surface (to date)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0005-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Earthrise Photograph', 'document.photograph.iconic', 'published',
 '{"date": "1968-12-24", "photographer": "Bill Anders (Apollo 8)", "significance": "First photograph of Earth from deep space, became symbol of environmental movement", "anders_quote": "We came all this way to explore the Moon, and the most important thing is that we discovered the Earth."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- ADDITIONAL DOCUMENTS
-- ============================================
('22222222-0013-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222',
 'Nixon''s Prepared Disaster Speech', 'document.speech.contingency', 'published',
 '{"date": "1969-07-18", "author": "William Safire", "purpose": "Statement in case Apollo 11 astronauts stranded on Moon", "title": "In Event of Moon Disaster", "opening": "Fate has ordained that the men who went to the moon to explore in peace will stay on the moon to rest in peace.", "closing": "For every human being who looks up at the moon in the nights to come will know that there is some corner of another world that is forever mankind.", "used": false, "declassified": "1999"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222',
 'Blue Marble Photograph', 'document.photograph.iconic', 'published',
 '{"date": "1972-12-07", "mission": "Apollo 17", "photographers": "Crew (credited to mission)", "location": "29,000 km from Earth en route to Moon", "significance": "Most widely distributed photograph in history", "features_visible": ["Africa", "Arabian Peninsula", "Madagascar", "Antarctica ice cap"], "environmental_impact": "Became symbol of Earth Day and environmental movement"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222',
 'Gene Kranz Tough and Competent Speech', 'document.speech.internal', 'published',
 '{"date": "1967-01-28", "speaker": "Gene Kranz, Flight Director", "context": "Day after Apollo 1 fire", "audience": "Mission Control team", "key_quote": "From this day forward, Flight Control will be known by two words: Tough and Competent. Tough means we are forever accountable for what we do or what we fail to do. Competent means we will never take anything for granted.", "placard": "Tough and Competent signs on every console in Mission Control"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222',
 'Houbolt Letter to Seamans', 'document.correspondence.advocacy', 'published',
 '{"date": "1961-11-15", "author": "John Houbolt, NASA Langley", "recipient": "Robert Seamans, Associate Administrator", "subject": "Advocacy for Lunar Orbit Rendezvous", "context": "Broke chain of command to advocate LOR", "opening": "Somewhat as a voice in the wilderness, I would like to pass on a few thoughts...", "derision_quote": "A scheme that has a 50% chance of getting a man to the Moon and a 1% chance of getting him back", "outcome": "Led to adoption of LOR mode in 1962"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0005-000000000001', '22222222-2222-2222-2222-222222222222',
 'Tranquility Base Transcript', 'document.transcript.mission', 'published',
 '{"date": "1969-07-20", "duration": "2.5 hours surface EVA", "key_exchanges": ["Houston, Tranquility Base here. The Eagle has landed.", "Roger Tranquility, we copy you on the ground. You got a bunch of guys about to turn blue. We are breathing again. Thanks a lot.", "That is one small step for man, one giant leap for mankind."], "aldrin_communion": "Buzz Aldrin privately took communion on lunar surface", "flag_planting": "Had difficulty getting flag to stand in lunar soil"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0006-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 13 Mission Operations Report', 'document.report.technical', 'published',
 '{"date": "1970-06", "title": "Apollo 13 Mission Report", "document_number": "MSC-02680", "sections": ["Mission Description", "Vehicle Performance", "Anomaly Summary", "Conclusions"], "key_findings": ["Oxygen tank 2 failure due to damaged wiring", "Cryo tank heater switch welded shut during ground test", "LM performed as lifeboat beyond design", "Mission Control improvisation critical"], "recommendations": "Multiple design and operational changes"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0007-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 11 Presidential Phone Call', 'document.transmission.historic', 'published',
 '{"date": "1969-07-20", "caller": "President Richard Nixon", "recipients": "Neil Armstrong and Buzz Aldrin on lunar surface", "location": "Oval Office to Sea of Tranquility", "nixon_opening": "Hello, Neil and Buzz. I am talking to you by telephone from the Oval Office at the White House, and this certainly has to be the most historic telephone call ever made.", "duration": "Approximately 2 minutes", "significance": "First Earth-Moon telephone conversation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0008-000000000001', '22222222-2222-2222-2222-222222222222',
 'Fallen Astronaut Memorial', 'document.artifact.memorial', 'published',
 '{"date": "1971-08-01", "mission": "Apollo 15", "location": "Hadley Rille landing site", "sculptor": "Paul Van Hoeydonck", "placed_by": "David Scott (secretly)", "description": "Small aluminum figure lying face down + plaque with 14 names", "names_included": ["Theodore Freeman", "Charles Bassett", "Elliot See", "Gus Grissom", "Roger Chaffee", "Ed White", "Vladimir Komarov", "Yuri Gagarin", "Pavel Belyayev", "Georgi Dobrovolski", "Viktor Patsayev", "Vladislav Volkov", "Edward Givens", "Clifton Williams"], "controversy": "Scott later faced criticism for commercialization attempt"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0009-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 17 Final Lunar Plaque', 'document.artifact.plaque', 'published',
 '{"date": "1972-12-14", "location": "Taurus-Littrow, Moon", "text": "Here man completed his first explorations of the Moon, December 1972 A.D. May the spirit of peace in which we came be reflected in the lives of all mankind.", "signatures": ["Richard Nixon (President)", "Eugene A. Cernan (Commander)", "Ronald E. Evans (CM Pilot)", "Harrison H. Schmitt (LM Pilot)"], "significance": "Marks end of human lunar exploration (to date)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0010-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 11 Goodwill Messages Disc', 'document.artifact.disc', 'published',
 '{"date": "1969-07-20", "location": "Left on Moon at Tranquility Base", "contents": "Messages from 73 world leaders", "format": "Silicon disc, 1.5 inches diameter", "notable_absences": "Soviet Union, China did not participate", "additional_items": ["Patch from Apollo 1", "Soviet medals for Gagarin and Komarov"], "reading_requirement": "Microscope needed to read messages"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0011-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo Program Summary Report', 'document.report.program', 'published',
 '{"date": "1975-04", "document_number": "JSC-09423", "title": "Apollo Program Summary Report", "purpose": "Comprehensive technical and management summary of Apollo", "chapters": ["Program Management", "Flight Hardware", "Mission Operations", "Crew Systems", "Scientific Results", "Technology Spinoffs"], "pages": "400+", "audience": "Technical and historical record"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0012-000000000001', '22222222-2222-2222-2222-222222222222',
 'Margaret Hamilton Apollo Code', 'document.artifact.software', 'published',
 '{"date": "1969", "developer": "MIT Instrumentation Laboratory", "lead": "Margaret Hamilton", "language": "Assembly language", "lines_of_code": "Approximately 145,000", "innovations": ["Asynchronous executive", "Priority scheduling", "Error recovery"], "famous_image": "Hamilton standing next to printouts as tall as her", "1202_alarm": "Her priority system allowed landing to continue despite overload", "term_coined": "Software engineering"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0013-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo 11 Quarantine Protocol', 'document.procedure.safety', 'published',
 '{"date": "1969", "title": "Lunar Biological Containment Program", "purpose": "Prevent contamination of Earth by possible lunar organisms", "elements": ["Biological Isolation Garments (BIGs)", "Mobile Quarantine Facility (MQF)", "Lunar Receiving Laboratory (LRL)"], "duration": "21 days post-splashdown", "sample_handling": "Vacuum glove boxes, biological barriers", "ended": "After Apollo 14 - no lunar life found"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('22222222-0013-0001-0014-000000000001', '22222222-2222-2222-2222-222222222222',
 'Apollo Flight Journal', 'document.reference.operations', 'published',
 '{"type": "Comprehensive mission transcripts and commentary", "editor": "Eric M. Jones and Ken Glover", "content": ["Complete air-to-ground transcripts", "Technical commentary", "Crew debriefs", "Photo indexes"], "missions_covered": ["Apollo 7", "Apollo 8", "Apollo 9", "Apollo 10", "Apollo 11", "Apollo 12", "Apollo 13", "Apollo 14", "Apollo 15", "Apollo 16", "Apollo 17"], "url": "history.nasa.gov/afj/", "significance": "Definitive operational record of Apollo"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GRAPH EDGES
-- ============================================
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, project_id, props) VALUES
-- Project → Goals
('project', '22222222-2222-2222-2222-222222222222', 'has', 'goal', '22222222-0001-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('project', '22222222-2222-2222-2222-222222222222', 'has', 'goal', '22222222-0002-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('project', '22222222-2222-2222-2222-222222222222', 'has', 'goal', '22222222-0003-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('project', '22222222-2222-2222-2222-222222222222', 'has', 'goal', '22222222-0004-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('project', '22222222-2222-2222-2222-222222222222', 'has', 'goal', '22222222-0005-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('project', '22222222-2222-2222-2222-222222222222', 'has', 'goal', '22222222-0006-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('project', '22222222-2222-2222-2222-222222222222', 'has', 'goal', '22222222-0007-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Goal 1 (Mercury) → Milestones
('goal', '22222222-0001-0000-0000-000000000001', 'has', 'milestone', '22222222-0001-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0001-0000-0000-000000000001', 'has', 'milestone', '22222222-0001-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0001-0000-0000-000000000001', 'has', 'milestone', '22222222-0001-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0001-0000-0000-000000000001', 'has', 'milestone', '22222222-0001-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0001-0000-0000-000000000001', 'has', 'milestone', '22222222-0001-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0001-0000-0000-000000000001', 'has', 'milestone', '22222222-0001-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Goal 2 (Gemini) → Milestones
('goal', '22222222-0002-0000-0000-000000000001', 'has', 'milestone', '22222222-0002-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0002-0000-0000-000000000001', 'has', 'milestone', '22222222-0002-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0002-0000-0000-000000000001', 'has', 'milestone', '22222222-0002-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0002-0000-0000-000000000001', 'has', 'milestone', '22222222-0002-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0002-0000-0000-000000000001', 'has', 'milestone', '22222222-0002-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0002-0000-0000-000000000001', 'has', 'milestone', '22222222-0002-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Goal 3 (Apollo Landings) → Milestones
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0007-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0008-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0009-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0010-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0011-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0003-0012-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Goal 4 (Safe Return) → Milestones
('goal', '22222222-0004-0000-0000-000000000001', 'has', 'milestone', '22222222-0004-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0004-0000-0000-000000000001', 'has', 'milestone', '22222222-0004-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Goal 5 (Science) → Milestones
('goal', '22222222-0005-0000-0000-000000000001', 'has', 'milestone', '22222222-0005-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0005-0000-0000-000000000001', 'has', 'milestone', '22222222-0005-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Goal 6 (Space Race) → Milestones
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Milestones → Plans
('milestone', '22222222-0001-0001-0000-000000000001', 'has', 'plan', '22222222-0001-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0001-0002-0000-000000000001', 'has', 'plan', '22222222-0001-0002-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0002-0004-0000-000000000001', 'has', 'plan', '22222222-0002-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0002-0002-0000-000000000001', 'has', 'plan', '22222222-0002-0002-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'plan', '22222222-0003-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'plan', '22222222-0003-0002-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'plan', '22222222-0003-0003-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'plan', '22222222-0003-0004-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0001-0000-000000000001', 'has', 'plan', '22222222-0003-0005-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0010-0000-000000000001', 'has', 'plan', '22222222-0003-0006-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0008-0000-000000000001', 'has', 'plan', '22222222-0004-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Plans → Tasks
('plan', '22222222-0001-0001-0001-000000000001', 'has', 'task', '22222222-0001-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0001-0001-0001-000000000001', 'has', 'task', '22222222-0001-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0001-0002-0001-000000000001', 'has', 'task', '22222222-0001-0002-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0001-0002-0001-000000000001', 'has', 'task', '22222222-0001-0002-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0002-0001-0001-000000000001', 'has', 'task', '22222222-0002-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0002-0001-0001-000000000001', 'has', 'task', '22222222-0002-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0002-0002-0001-000000000001', 'has', 'task', '22222222-0002-0002-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0001-0001-000000000001', 'has', 'task', '22222222-0003-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0001-0001-000000000001', 'has', 'task', '22222222-0003-0001-0002-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0002-0001-000000000001', 'has', 'task', '22222222-0003-0002-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0005-0001-000000000001', 'has', 'task', '22222222-0003-0003-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0005-0001-000000000001', 'has', 'task', '22222222-0003-0003-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0004-0001-000000000001', 'has', 'task', '22222222-0003-0004-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0004-0001-000000000001', 'has', 'task', '22222222-0003-0004-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'task', '22222222-0003-0006-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'task', '22222222-0003-0006-0002-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'task', '22222222-0003-0006-0003-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0004-0001-0001-000000000001', 'has', 'task', '22222222-0004-0001-0001-000000000002', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0004-0001-0001-000000000001', 'has', 'task', '22222222-0004-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0004-0001-0001-000000000001', 'has', 'task', '22222222-0004-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0004-0001-0001-000000000001', 'has', 'task', '22222222-0004-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Milestones → Documents
('milestone', '22222222-0001-0004-0000-000000000001', 'has', 'document', '22222222-0001-0004-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0001-0004-0000-000000000001', 'has', 'document', '22222222-0001-0004-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0001-0000-000000000001', 'has', 'document', '22222222-0003-0001-0001-000000000005', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0003-0000-000000000001', 'has', 'document', '22222222-0003-0003-0001-000000000005', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'document', '22222222-0003-0006-0001-000000000005', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'document', '22222222-0003-0006-0002-000000000005', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0008-0000-000000000001', 'has', 'document', '22222222-0003-0008-0001-000000000005', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0012-0000-000000000001', 'has', 'document', '22222222-0003-0012-0001-000000000005', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0005-0001-0000-000000000001', 'has', 'document', '22222222-0005-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Milestones → Decisions
('milestone', '22222222-0001-0002-0000-000000000001', 'has', 'decision', '22222222-0001-0001-0001-000000000003', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'decision', '22222222-0003-0001-0001-000000000003', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'decision', '22222222-0003-0001-0002-000000000003', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0003-0000-000000000001', 'has', 'decision', '22222222-0003-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0001-0000-000000000001', 'has', 'decision', '22222222-0003-0003-0001-000000000003', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'decision', '22222222-0003-0006-0001-000000000003', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0008-0000-000000000001', 'has', 'decision', '22222222-0003-0008-0001-000000000003', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0012-0000-000000000001', 'has', 'decision', '22222222-0003-0012-0001-000000000003', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Milestones → Risks
('milestone', '22222222-0001-0003-0000-000000000001', 'has', 'risk', '22222222-0001-0001-0001-000000000004', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0001-0000-000000000001', 'has', 'risk', '22222222-0003-0001-0001-000000000004', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0003-0002-0001-000000000004', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0003-0003-0001-000000000004', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0003-0004-0001-000000000004', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0008-0000-000000000001', 'has', 'risk', '22222222-0003-0005-0001-000000000004', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0003-0006-0001-000000000004', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0006-0002-0000-000000000001', 'has', 'risk', '22222222-0006-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- Cross-cutting causal relationships
-- Mercury enabled Gemini
('milestone', '22222222-0001-0006-0000-000000000001', 'enabled', 'milestone', '22222222-0002-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Mercury proved human spaceflight, Gemini built on it"}'::jsonb),
-- Gemini enabled Apollo
('milestone', '22222222-0002-0006-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Gemini mastered rendezvous/docking needed for lunar orbit operations"}'::jsonb),
-- Apollo 1 fire led to safety improvements
('milestone', '22222222-0003-0001-0000-000000000001', 'led_to', 'milestone', '22222222-0003-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Block II redesign made Apollo 7 possible"}'::jsonb),
-- Apollo 7 enabled Apollo 8
('milestone', '22222222-0003-0002-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Validated CSM systems for lunar mission"}'::jsonb),
-- Apollo 8 enabled Apollo 9
('milestone', '22222222-0003-0003-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Proved lunar trajectory, navigation, reentry"}'::jsonb),
-- Apollo 9 enabled Apollo 10
('milestone', '22222222-0003-0004-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Validated LM in Earth orbit"}'::jsonb),
-- Apollo 10 enabled Apollo 11
('milestone', '22222222-0003-0005-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Full dress rehearsal cleared way for landing"}'::jsonb),
-- Kennedy speech enabled program
('milestone', '22222222-0001-0004-0000-000000000001', 'enabled', 'goal', '22222222-0003-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Presidential commitment provided funding and urgency"}'::jsonb),
-- Sputnik led to NASA
('milestone', '22222222-0006-0001-0000-000000000001', 'led_to', 'milestone', '22222222-0001-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Soviet achievement spurred American response"}'::jsonb),
-- Gagarin led to Kennedy commitment
('milestone', '22222222-0006-0002-0000-000000000001', 'led_to', 'milestone', '22222222-0001-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "USSR ahead in space - Kennedy needed dramatic goal"}'::jsonb),
-- Apollo 11 led to Space Race victory
('milestone', '22222222-0003-0006-0000-000000000001', 'led_to', 'milestone', '22222222-0006-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "First lunar landing achieved Kennedy goal, won Space Race"}'::jsonb),
-- Apollo 13 demonstrated safe return capability
('milestone', '22222222-0003-0008-0000-000000000001', 'enabled', 'goal', '22222222-0004-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Successful failure proved redundancy and crew training"}'::jsonb),
-- Apollo 15 rover enabled expanded exploration
('milestone', '22222222-0003-0010-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0011-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Lunar rover proved successful, used on remaining missions"}'::jsonb),
-- Lunar landings enabled science
('milestone', '22222222-0003-0006-0000-000000000001', 'enabled', 'milestone', '22222222-0005-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Each landing brought back samples"}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - SPACE RACE MILESTONES (0006-04 through 0006-10)
-- These Soviet achievements connect to Goal 6: Win the Space Race
-- ============================================
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0007-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0008-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0009-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0006-0010-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - INFRASTRUCTURE MILESTONES (0007-*)
-- These connect to Goal 3: Land Humans on the Moon (infrastructure needed for Apollo)
-- ============================================
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0007-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0007-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0007-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0007-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - ROBOTIC PRECURSOR MILESTONES (0008-*)
-- These connect to Goal 3 (enabled Apollo landing site selection)
-- ============================================
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0008-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0008-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0008-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - TRAINING & TESTING MILESTONES (0009-*)
-- These connect to Goal 3 (testing validated Apollo hardware)
-- ============================================
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0009-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0009-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0009-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0009-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0009-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - TECHNOLOGY DEVELOPMENT TASKS (0010-0001-*)
-- Connect to Saturn V Development Plan (engineering tasks)
-- ============================================
('plan', '22222222-0003-0002-0001-000000000001', 'has', 'task', '22222222-0010-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0003-0001-000000000001', 'has', 'task', '22222222-0010-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0003-0001-000000000001', 'has', 'task', '22222222-0010-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0002-0001-000000000001', 'has', 'task', '22222222-0010-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0002-0001-000000000001', 'has', 'task', '22222222-0010-0001-0005-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0004-0001-000000000001', 'has', 'task', '22222222-0010-0001-0006-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0002-0001-000000000001', 'has', 'task', '22222222-0010-0001-0007-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - MISSION OPERATIONS TASKS (0010-0002-*)
-- Connect to Apollo 11 milestone and LOR mission mode plan
-- ============================================
('plan', '22222222-0003-0001-0001-000000000001', 'has', 'task', '22222222-0010-0002-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0001-0001-000000000001', 'has', 'task', '22222222-0010-0002-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0001-0001-000000000001', 'has', 'task', '22222222-0010-0002-0003-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0005-0001-0000-000000000001', 'has', 'task', '22222222-0010-0002-0004-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0001-0001-000000000001', 'has', 'task', '22222222-0010-0002-0005-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0003-0001-0001-000000000001', 'has', 'task', '22222222-0010-0002-0006-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0004-0001-0000-000000000001', 'has', 'task', '22222222-0010-0002-0007-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - CREW TRAINING TASKS (0010-0003-*)
-- Connect to Astronaut Selection and Training Plan
-- ============================================
('plan', '22222222-0001-0002-0001-000000000001', 'has', 'task', '22222222-0010-0003-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0001-0002-0001-000000000001', 'has', 'task', '22222222-0010-0003-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0001-0002-0001-000000000001', 'has', 'task', '22222222-0010-0003-0003-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0001-0002-0001-000000000001', 'has', 'task', '22222222-0010-0003-0004-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('plan', '22222222-0001-0002-0001-000000000001', 'has', 'task', '22222222-0010-0003-0005-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - DECISIONS (0011-*)
-- Connect to appropriate milestones
-- ============================================
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0001-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0001-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0004-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0001-0002-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0005-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0012-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0006-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0007-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0008-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0010-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0009-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0012-0000-000000000001', 'has', 'decision', '22222222-0011-0001-0010-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - RISKS (0012-*)
-- Connect to appropriate milestones
-- ============================================
('milestone', '22222222-0003-0003-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0003-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0003-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0005-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0006-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0007-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0004-0001-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0008-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0004-0001-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0009-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0010-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'risk', '22222222-0012-0001-0011-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - DOCUMENTS (0013-*)
-- Connect to appropriate milestones
-- ============================================
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'document', '22222222-0013-0001-0001-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0012-0000-000000000001', 'has', 'document', '22222222-0013-0001-0002-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0001-0000-000000000001', 'has', 'document', '22222222-0013-0001-0003-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'document', '22222222-0013-0001-0004-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'document', '22222222-0013-0001-0005-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0008-0000-000000000001', 'has', 'document', '22222222-0013-0001-0006-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'document', '22222222-0013-0001-0007-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0010-0000-000000000001', 'has', 'document', '22222222-0013-0001-0008-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0012-0000-000000000001', 'has', 'document', '22222222-0013-0001-0009-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'document', '22222222-0013-0001-0010-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0012-0000-000000000001', 'has', 'document', '22222222-0013-0001-0011-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'document', '22222222-0013-0001-0012-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0006-0000-000000000001', 'has', 'document', '22222222-0013-0001-0013-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('milestone', '22222222-0003-0012-0000-000000000001', 'has', 'document', '22222222-0013-0001-0014-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),

-- ============================================
-- CAUSAL RELATIONSHIPS - Robotic precursors enabled Apollo
-- ============================================
('milestone', '22222222-0008-0001-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Ranger proved Moon surface could support lander"}'::jsonb),
('milestone', '22222222-0008-0002-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Surveyor soft landings proved landing feasibility"}'::jsonb),
('milestone', '22222222-0008-0003-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Lunar Orbiter mapping identified landing sites"}'::jsonb),

-- Infrastructure enabled missions
('milestone', '22222222-0007-0001-0000-000000000001', 'enabled', 'milestone', '22222222-0009-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "VAB required for Saturn V stacking"}'::jsonb),
('milestone', '22222222-0007-0003-0000-000000000001', 'enabled', 'milestone', '22222222-0009-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Launch Complex 39 first used for Apollo 4"}'::jsonb),
('milestone', '22222222-0009-0001-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "LLRV training critical for landing confidence"}'::jsonb),

-- Soviet milestones drove US urgency
('milestone', '22222222-0006-0004-0000-000000000001', 'led_to', 'milestone', '22222222-0002-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Soviet spacewalk spurred US EVA development"}'::jsonb),
('milestone', '22222222-0006-0005-0000-000000000001', 'led_to', 'milestone', '22222222-0008-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Luna 9 landing accelerated Surveyor program"}'::jsonb),
('milestone', '22222222-0006-0007-0000-000000000001', 'led_to', 'milestone', '22222222-0003-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Zond flights accelerated Apollo 8 lunar orbit decision"}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - CANCELLED MISSIONS (0014-*)
-- Connect to Goal 3 (Land Humans on Moon) as program wind-down milestones
-- ============================================
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0014-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0014-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
-- Cancellations led to Skylab
('milestone', '22222222-0014-0001-0000-000000000001', 'led_to', 'milestone', '22222222-0015-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Apollo 20 cancellation freed Saturn V SA-513 for Skylab launch"}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - POST-APOLLO LEGACY (0015-*)
-- Connect to Goal 7 (Establish Apollo Legacy)
-- ============================================
('goal', '22222222-0007-0000-0000-000000000001', 'has', 'milestone', '22222222-0015-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0007-0000-0000-000000000001', 'has', 'milestone', '22222222-0015-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0007-0000-0000-000000000001', 'has', 'milestone', '22222222-0015-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0007-0000-0000-000000000001', 'has', 'milestone', '22222222-0015-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0007-0000-0000-000000000001', 'has', 'milestone', '22222222-0015-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
-- Skylab mission chain
('milestone', '22222222-0015-0001-0000-000000000001', 'enabled', 'milestone', '22222222-0015-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Skylab 2 crew repaired damage from launch"}'::jsonb),
('milestone', '22222222-0015-0002-0000-000000000001', 'enabled', 'milestone', '22222222-0015-0003-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Skylab 2 saved station for subsequent missions"}'::jsonb),
('milestone', '22222222-0015-0003-0000-000000000001', 'enabled', 'milestone', '22222222-0015-0004-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Skylab 3 extended station operations"}'::jsonb),
-- Apollo 17 led to ASTP (final Apollo flights)
('milestone', '22222222-0003-0012-0000-000000000001', 'led_to', 'milestone', '22222222-0015-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Apollo 17 last lunar mission, Apollo hardware used for ASTP"}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - BUDGET MILESTONES (0016-*)
-- Connect to Goal 7 (context for why legacy programs existed)
-- ============================================
('goal', '22222222-0007-0000-0000-000000000001', 'has', 'milestone', '22222222-0016-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0007-0000-0000-000000000001', 'has', 'milestone', '22222222-0016-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
-- Budget decline led to cancellations
('milestone', '22222222-0016-0002-0000-000000000001', 'led_to', 'milestone', '22222222-0014-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Budget pressure drove Apollo mission cancellations"}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - DIPLOMACY MILESTONES (0017-*)
-- Connect to Goal 6 (Win the Space Race - diplomatic victory)
-- ============================================
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0017-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0006-0000-0000-000000000001', 'has', 'milestone', '22222222-0017-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
-- Apollo 11 led to world tour
('milestone', '22222222-0003-0006-0000-000000000001', 'led_to', 'milestone', '22222222-0017-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Apollo 11 landing triggered worldwide goodwill tour"}'::jsonb),
-- World tour led to moon rock diplomacy
('milestone', '22222222-0017-0001-0000-000000000001', 'led_to', 'milestone', '22222222-0017-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Goodwill tour success led to expanded moon rock diplomacy"}'::jsonb),

-- ============================================
-- ADDITIONAL EDGES - KEY PERSONNEL MILESTONES (0018-*)
-- Connect to Goal 3 (these achievements enabled lunar landing)
-- ============================================
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0018-0001-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
('goal', '22222222-0003-0000-0000-000000000001', 'has', 'milestone', '22222222-0018-0002-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{}'::jsonb),
-- Software enabled Apollo 11
('milestone', '22222222-0018-0001-0000-000000000001', 'enabled', 'milestone', '22222222-0003-0006-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Hamilton software saved Apollo 11 landing during 1202 alarm"}'::jsonb),
-- Human computers enabled early missions
('milestone', '22222222-0018-0002-0000-000000000001', 'enabled', 'milestone', '22222222-0001-0005-0000-000000000001', '22222222-2222-2222-2222-222222222222', '{"context": "Katherine Johnson calculations verified Glenn orbital flight"}'::jsonb)
;

-- ============================================
-- COMPLETION NOTICE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Project Apollo: Race to the Moon - v4.0 (Complete History)';
  RAISE NOTICE 'NASA SPACE PROGRAM ONTOLOGY GRAPH';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Project ID: 22222222-2222-2222-2222-222222222222';
  RAISE NOTICE '';
  RAISE NOTICE 'PROGRAMS & MISSIONS COVERED:';
  RAISE NOTICE '  Mercury (1958-1963): 6 crewed flights, first Americans in space';
  RAISE NOTICE '  Gemini (1965-1966): 10 crewed flights, rendezvous/docking/EVA';
  RAISE NOTICE '  Robotic Precursors: Ranger, Surveyor, Lunar Orbiter';
  RAISE NOTICE '  Apollo (1967-1972): 11 crewed flights, 6 lunar landings';
  RAISE NOTICE '  Soviet Competition: Sputnik through Luna/Lunokhod programs';
  RAISE NOTICE '  Skylab (1973-1974): Americas first space station, 3 crews';
  RAISE NOTICE '  Apollo-Soyuz (1975): First international crewed mission';
  RAISE NOTICE '';
  RAISE NOTICE 'GOALS (7):';
  RAISE NOTICE '  1. Prove Human Spaceflight (Mercury) - ACHIEVED';
  RAISE NOTICE '  2. Master Orbital Operations (Gemini) - ACHIEVED';
  RAISE NOTICE '  3. Land Humans on the Moon - ACHIEVED (6 landings)';
  RAISE NOTICE '  4. Return Astronauts Safely - ACHIEVED (0 in-flight deaths)';
  RAISE NOTICE '  5. Conduct Lunar Science - ACHIEVED (842 lbs samples)';
  RAISE NOTICE '  6. Win the Space Race - ACHIEVED (only nation to land humans)';
  RAISE NOTICE '  7. Establish Apollo Legacy - ACHIEVED (Skylab + ASTP)';
  RAISE NOTICE '';
  RAISE NOTICE 'ENTITY COUNTS:';
  RAISE NOTICE '  - 7 Goals (with detailed metrics and outcomes)';
  RAISE NOTICE '  - 63+ Milestones (verified dates, crew, technical facts)';
  RAISE NOTICE '  - 11 Plans (detailed engineering specifications)';
  RAISE NOTICE '  - 45+ Tasks (technology, operations, training)';
  RAISE NOTICE '  - 18 Decisions (contracts, crew, mission-critical)';
  RAISE NOTICE '  - 19 Risks (technical, environmental, competition)';
  RAISE NOTICE '  - 23 Documents (speeches, photos, transcripts, artifacts)';
  RAISE NOTICE '  - 230+ Graph Edges (hierarchical + causal relationships)';
  RAISE NOTICE '';
  RAISE NOTICE 'NEW IN V4.0:';
  RAISE NOTICE '  - Cancelled Missions: Apollo 18, 19, 20 with reasons';
  RAISE NOTICE '  - Skylab Program: Launch + all 3 crewed missions';
  RAISE NOTICE '  - Apollo-Soyuz: Stafford-Leonov handshake in orbit';
  RAISE NOTICE '  - Budget History: Peak FY1966 (4.41%%) through decline';
  RAISE NOTICE '  - Diplomacy: Giant Leap World Tour, Moon Rock gifts';
  RAISE NOTICE '  - Key Personnel: Margaret Hamilton, Katherine Johnson';
  RAISE NOTICE '';
  RAISE NOTICE 'KEY PERSONNEL DOCUMENTED:';
  RAISE NOTICE '  - All 12 moonwalkers with full names and missions';
  RAISE NOTICE '  - Mercury Seven astronauts (by military branch)';
  RAISE NOTICE '  - NASA Leaders: Webb, Paine, Fletcher';
  RAISE NOTICE '  - Engineers: von Braun, Faget, Houbolt, Low, Shea';
  RAISE NOTICE '  - Software: Margaret Hamilton (AGC), Katherine Johnson';
  RAISE NOTICE '  - Flight Directors: Kraft, Kranz, Lunney, Charlesworth';
  RAISE NOTICE '  - Contractors: Boeing, North American, Grumman, MIT';
  RAISE NOTICE '';
  RAISE NOTICE 'HIGHLIGHTS:';
  RAISE NOTICE '  - Apollo 1 Fire (Jan 27, 1967) - safety transformation';
  RAISE NOTICE '  - Apollo 11 First Landing (Jul 20, 1969) - 600M viewers';
  RAISE NOTICE '  - Apollo 13 Rescue (Apr 13-17, 1970) - greatest rescue';
  RAISE NOTICE '  - Apollo 17 Final Mission (Dec 1972) - geologist Schmitt';
  RAISE NOTICE '  - Skylab 2 Repair (May 1973) - saved the station';
  RAISE NOTICE '  - Apollo-Soyuz Handshake (Jul 1975) - Cold War thaw';
  RAISE NOTICE '  - 842 pounds (382 kg) of lunar samples from 6 sites';
  RAISE NOTICE '  - Total cost: $25.4 billion ($257B in 2020 dollars)';
  RAISE NOTICE '';
  RAISE NOTICE 'DATA SOURCES: NASA History, Smithsonian, verified encyclopedias';
  RAISE NOTICE 'Note: Project is marked as is_public = TRUE for display';
  RAISE NOTICE '==============================================';
END$$;

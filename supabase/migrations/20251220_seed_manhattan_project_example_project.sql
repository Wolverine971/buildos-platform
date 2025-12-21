-- supabase/migrations/20251220_seed_manhattan_project_example_project.sql
-- ============================================
-- The Manhattan Project Example Project
-- "Now I am become Death, the destroyer of worlds"
-- ============================================
-- Version 1.0 - Comprehensive Atomic Age Ontology
--
-- DESIGN PRINCIPLE: This graph is deeply nested.
-- - Goals connect to Project
-- - Milestones connect to Goals (not directly to Project)
-- - Plans connect to Milestones
-- - Tasks connect to Plans/Milestones
-- - Decisions/Risks connect to Milestones
-- - Documents connect to Milestones
--
-- SCOPE: Einstein-Szilard Letter (1939) → Atomic Energy Act (1946)
-- Total investment: $1.889 billion (1945 dollars) / ~$30 billion (2024 dollars)
-- Personnel: 130,000+ employees at peak
-- Sites: Oak Ridge (TN), Hanford (WA), Los Alamos (NM)
--
-- KEY PERSONNEL:
-- - Military: Gen. Leslie Groves (commander), Col. Kenneth Nichols, Gen. Thomas Farrell
-- - Scientific: J. Robert Oppenheimer (Los Alamos), Enrico Fermi (Chicago),
--               Leo Szilard (initiator), Glenn Seaborg (plutonium), Hans Bethe (theory)
-- - Political: FDR, Truman, Vannevar Bush, Henry Stimson
--
-- KEY STATISTICS:
-- - 2 bomb designs: Little Boy (uranium gun-type), Fat Man (plutonium implosion)
-- - 1 test: Trinity (July 16, 1945) - 21 kilotons
-- - 2 combat uses: Hiroshima (Aug 6), Nagasaki (Aug 9)
-- - ~200,000 casualties

-- ============================================
-- CLEANUP (for idempotent re-runs)
-- ============================================
DELETE FROM onto_edges WHERE project_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM onto_tasks WHERE project_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM onto_documents WHERE project_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM onto_decisions WHERE project_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM onto_risks WHERE project_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM onto_plans WHERE project_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM onto_milestones WHERE project_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM onto_goals WHERE project_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM onto_projects WHERE id = '66666666-6666-6666-6666-666666666666';

-- ============================================
-- PROJECT
-- ============================================
INSERT INTO onto_projects (
  id, org_id, name, description, type_key,
  state_key, props, start_at, end_at, is_public, created_by
) VALUES (
  '66666666-6666-6666-6666-666666666666',
  NULL,
  'The Manhattan Project: Building the Atomic Bomb',
  'The secret U.S. government program that developed the first nuclear weapons during World War II. Running from 1942-1946, it employed over 130,000 people, cost $1.889 billion ($30+ billion in 2024 dollars), and culminated in the atomic bombings of Hiroshima and Nagasaki. The project represented an unprecedented fusion of military command, industrial capacity, and scientific genius—transforming theoretical physics into practical weapons within just seven years.',
  'project.government.military',
  'completed',
  '{
    "facets": {"context": "historical", "scale": "epic", "stage": "complete"},
    "commander": "Brigadier General Leslie R. Groves",
    "scientific_director": "J. Robert Oppenheimer",
    "sites": ["Oak Ridge (TN)", "Hanford (WA)", "Los Alamos (NM)"],
    "cost": "$1.889 billion (1945) / ~$30 billion (2024)",
    "personnel_peak": "130,000+",
    "code_names": {
      "overall": "Manhattan Engineer District",
      "oak_ridge": "Site X / Clinton Engineer Works",
      "hanford": "Site W / Hanford Engineer Works",
      "los_alamos": "Site Y / Project Y"
    },
    "bombs": {
      "little_boy": "Uranium-235 gun-type (Hiroshima)",
      "fat_man": "Plutonium-239 implosion (Trinity, Nagasaki)"
    }
  }'::jsonb,
  '1939-08-02'::timestamptz,
  '1946-08-01'::timestamptz,
  TRUE,
  '00000000-0000-0000-0000-000000000002'
);

-- ============================================
-- GOALS (6 Strategic Objectives)
-- ============================================
INSERT INTO onto_goals (id, project_id, name, type_key, props, created_by) VALUES
-- Goal 1: Beat Germany to the Bomb
('22226666-0001-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Develop Atomic Weapons Before Nazi Germany', 'goal.strategic',
 '{"priority": 1, "state": "achieved", "description": "The original strategic imperative: fear that Germany, with its advanced physics establishment, might develop atomic weapons first. This existential threat drove the initial urgency and massive investment.", "outcome": "Germany surrendered May 1945 before completing program; U.S. tested first bomb July 1945"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 2: Produce Fissile Material
('22226666-0002-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Produce Sufficient Fissile Material at Industrial Scale', 'goal.operational',
 '{"priority": 1, "state": "achieved", "description": "Enrich uranium-235 and produce plutonium-239 in quantities sufficient for multiple weapons. This required building the largest industrial facilities ever constructed, using technologies never before attempted at scale.", "sites": ["Oak Ridge", "Hanford"], "materials": ["U-235", "Pu-239"], "outcome": "Produced material for 3 bombs"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 3: Design and Build Weapons
('22226666-0003-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Design and Build Deliverable Nuclear Weapons', 'goal.technical',
 '{"priority": 1, "state": "achieved", "description": "Transform theoretical physics into practical weapons small enough for aircraft delivery. Required solving unprecedented engineering challenges in explosives, metallurgy, and electronics.", "site": "Los Alamos", "designs": ["Little Boy (gun-type)", "Fat Man (implosion)"], "outcome": "Both designs deployed successfully"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 4: Maintain Secrecy
('22226666-0004-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Maintain Absolute Secrecy', 'goal.security',
 '{"priority": 1, "state": "achieved", "description": "Prevent enemies from learning about the program through compartmentalization, security protocols, and counterintelligence. Over 130,000 workers, most unaware of what they were building.", "methods": ["compartmentalization", "need-to-know", "cover stories"], "outcome": "Public secrecy maintained; Soviet penetration not discovered until 1950"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 5: End War with Japan
('22226666-0005-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'End the War with Japan', 'goal.strategic',
 '{"priority": 1, "state": "achieved", "description": "Use atomic weapons to force Japanese surrender and avoid the costly invasion of the Japanese mainland (Operation Downfall), projected to cause massive casualties on both sides.", "targets": ["Hiroshima", "Nagasaki"], "outcome": "Japan surrendered August 15, 1945"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 6: Establish Post-War Nuclear Capability
('22226666-0006-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Establish Post-War Nuclear Capability', 'goal.institutional',
 '{"priority": 2, "state": "achieved", "description": "Transition from wartime military project to peacetime atomic energy program. Maintain nuclear monopoly while building institutional infrastructure for continued development.", "outcome": "Atomic Energy Act of 1946 created civilian AEC"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MILESTONES - Goal 1: Beat Germany
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES

('33336666-0001-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Einstein-Szilard Letter Sent to FDR',
 'milestone.initiation',
 '1939-08-02'::timestamptz,
 '{"state": "achieved", "description": "Leo Szilard drafted and Albert Einstein signed letter warning President Roosevelt that Germany might develop atomic bombs, urging U.S. to begin nuclear research", "personnel": ["Albert Einstein", "Leo Szilard", "Edward Teller", "Eugene Wigner"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0001-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'FDR Briefed by Alexander Sachs',
 'milestone.decision',
 '1939-10-11'::timestamptz,
 '{"state": "achieved", "description": "Economist Alexander Sachs personally delivered Einstein letter to Roosevelt and convinced him of its importance over two meetings", "personnel": ["FDR", "Alexander Sachs"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0001-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Advisory Committee on Uranium Established',
 'milestone.organizational',
 '1939-10-21'::timestamptz,
 '{"state": "achieved", "description": "First U.S. government body to study atomic energy for military purposes, chaired by Lyman Briggs with $6,000 budget", "personnel": ["Lyman Briggs"], "budget": "$6,000"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0001-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Office of Scientific Research and Development Created',
 'milestone.organizational',
 '1941-06-28'::timestamptz,
 '{"state": "achieved", "description": "FDR Executive Order 8807 created OSRD under Vannevar Bush, centralizing wartime scientific research", "personnel": ["Vannevar Bush", "James Conant"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0001-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'National Academy of Sciences Report Confirms Feasibility',
 'milestone.technical',
 '1941-05-17'::timestamptz,
 '{"state": "achieved", "description": "Arthur Compton report to NAS concluded atomic bombs were feasible and recommended accelerated development", "personnel": ["Arthur Compton"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0001-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'FDR Authorizes Full-Scale Development',
 'milestone.decision',
 '1941-12-06'::timestamptz,
 '{"state": "achieved", "description": "One day before Pearl Harbor, FDR approved accelerated atomic bomb program with full government commitment", "personnel": ["FDR", "Vannevar Bush"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0001-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Alsos Mission Confirms German Program Far Behind',
 'milestone.intelligence',
 '1944-11-15'::timestamptz,
 '{"state": "achieved", "description": "Military intelligence mission led by Col. Boris Pash captured German scientists and documents, confirming Nazi atomic program was years behind U.S.", "personnel": ["Col. Boris Pash", "Samuel Goudsmit"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0001-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Germany Surrenders (V-E Day)',
 'milestone.external',
 '1945-05-08'::timestamptz,
 '{"state": "achieved", "description": "Germany surrendered unconditionally, eliminating the original threat that motivated the Manhattan Project"}',
 '00000000-0000-0000-0000-000000000002');

-- ============================================
-- MILESTONES - Goal 2: Produce Fissile Material
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES

('33336666-0002-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Plutonium Discovered at Berkeley',
 'milestone.scientific',
 '1940-12-14'::timestamptz,
 '{"state": "achieved", "description": "Glenn Seaborg and team bombarded uranium with deuterons, producing neptunium-238 which decayed to plutonium-238—a new element", "personnel": ["Glenn Seaborg", "Edwin McMillan", "Joseph Kennedy", "Arthur Wahl"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Plutonium-239 Proven Fissile',
 'milestone.scientific',
 '1941-03-28'::timestamptz,
 '{"state": "achieved", "description": "Seaborg, Segrè, and Kennedy demonstrated Pu-239 undergoes neutron-induced fission—opening second path to atomic weapons", "personnel": ["Glenn Seaborg", "Emilio Segrè", "Joseph Kennedy"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Oak Ridge Site Approved',
 'milestone.construction',
 '1942-09-29'::timestamptz,
 '{"state": "achieved", "description": "Under Secretary Patterson authorized acquisition of 56,000 acres near Elza, Tennessee for uranium enrichment facilities", "personnel": ["Robert Patterson", "Leslie Groves"], "cost": "$3.5 million (land)"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Chicago Pile-1 Achieves Criticality',
 'milestone.scientific',
 '1942-12-02'::timestamptz,
 '{"state": "achieved", "description": "First controlled, self-sustaining nuclear chain reaction achieved under Stagg Field bleachers at University of Chicago. Compton coded message: The Italian navigator has just landed in the new world.", "personnel": ["Enrico Fermi", "Leo Szilard", "Herbert Anderson"], "power": "0.5 watts"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Hanford Site Selected',
 'milestone.construction',
 '1943-01-16'::timestamptz,
 '{"state": "achieved", "description": "Col. Franklin Matthias selected 500,000-acre site in Washington State for plutonium production reactors, near Columbia River and Grand Coulee Dam power", "personnel": ["Col. Franklin Matthias", "Leslie Groves"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Y-12 Electromagnetic Plant Construction Begins',
 'milestone.construction',
 '1943-02-18'::timestamptz,
 '{"state": "achieved", "description": "Construction of calutron racetracks for electromagnetic uranium separation began at Oak Ridge", "contractor": "Tennessee Eastman", "cost": "$477.6 million total"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'K-25 Gaseous Diffusion Plant Construction Begins',
 'milestone.construction',
 '1943-06-02'::timestamptz,
 '{"state": "achieved", "description": "Construction began on worlds largest building under one roof for gaseous diffusion uranium enrichment", "contractor": "Union Carbide", "cost": "$512.2 million total"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Hanford B Reactor Construction Begins',
 'milestone.construction',
 '1943-08-01'::timestamptz,
 '{"state": "achieved", "description": "DuPont began construction of first full-scale plutonium production reactor", "contractor": "DuPont"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0009-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Silver Bullion Acquired for Calutrons',
 'milestone.procurement',
 '1943-03-01'::timestamptz,
 '{"state": "achieved", "description": "Treasury Department loaned 14,700 short tons of silver bullion from West Point for electromagnetic separation coils—copper was scarce", "quantity": "14,700 short tons"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Hanford B Reactor Completed',
 'milestone.construction',
 '1944-09-13'::timestamptz,
 '{"state": "achieved", "description": "First full-scale plutonium production reactor completed at Hanford", "personnel": ["DuPont engineers"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0011-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Xenon Poisoning Crisis Solved',
 'milestone.technical',
 '1944-09-27'::timestamptz,
 '{"state": "achieved", "description": "B Reactor mysteriously shut down hours after startup. Fermi diagnosed xenon-135 neutron poisoning; DuPonts conservative design with extra tube capacity saved the project", "personnel": ["Enrico Fermi", "John Wheeler", "DuPont engineers"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0012-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'First Plutonium Produced at Hanford',
 'milestone.production',
 '1944-11-06'::timestamptz,
 '{"state": "achieved", "description": "B Reactor produced first plutonium after xenon problem solved by loading additional fuel tubes"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0013-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'First Plutonium Arrives at Los Alamos',
 'milestone.delivery',
 '1945-02-02'::timestamptz,
 '{"state": "achieved", "description": "First weapons-grade plutonium delivered from Hanford to Los Alamos for bomb fabrication"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0002-0014-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Little Boy Uranium Core Completed',
 'milestone.production',
 '1945-07-24'::timestamptz,
 '{"state": "achieved", "description": "64 kg of weapons-grade uranium-235 assembled for Little Boy gun-type bomb", "material": "64 kg U-235"}',
 '00000000-0000-0000-0000-000000000002');

-- ============================================
-- MILESTONES - Goal 3: Design and Build Weapons
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES

('33336666-0003-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Los Alamos Site Selected',
 'milestone.construction',
 '1942-11-16'::timestamptz,
 '{"state": "achieved", "description": "Oppenheimer, Groves, and team selected Los Alamos Ranch School site in New Mexico for bomb design laboratory", "personnel": ["J. Robert Oppenheimer", "Leslie Groves"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Oppenheimer Named Scientific Director',
 'milestone.organizational',
 '1942-10-15'::timestamptz,
 '{"state": "achieved", "description": "Groves selected Oppenheimer to lead Los Alamos despite security concerns about his leftist associations", "personnel": ["Leslie Groves", "J. Robert Oppenheimer"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Los Alamos Laboratory Opens',
 'milestone.organizational',
 '1943-04-01'::timestamptz,
 '{"state": "achieved", "description": "Project Y officially opened. Scientists began arriving at the secret mesa laboratory in New Mexico", "personnel": ["J. Robert Oppenheimer"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Gun-Type Design Established',
 'milestone.technical',
 '1943-08-01'::timestamptz,
 '{"state": "achieved", "description": "Thin Man gun-type design established for uranium bomb—one subcritical mass fired into another at high speed", "design": "gun-type"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Implosion Research Group Formed',
 'milestone.organizational',
 '1944-01-11'::timestamptz,
 '{"state": "achieved", "description": "Special implosion group formed under Edward Teller to study compression-based bomb design", "personnel": ["Edward Teller", "Seth Neddermeyer"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Pu-240 Spontaneous Fission Problem Discovered',
 'milestone.technical',
 '1944-04-05'::timestamptz,
 '{"state": "achieved", "description": "Emilio Segrè discovered reactor-produced plutonium contained Pu-240 with high spontaneous fission rate—gun-type design impossible for plutonium", "personnel": ["Emilio Segrè"], "impact": "Required complete redesign to implosion"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Crash Implosion Program Launched',
 'milestone.organizational',
 '1944-08-01'::timestamptz,
 '{"state": "achieved", "description": "Los Alamos reorganized around implosion design. George Kistiakowsky brought in to lead explosive lens development", "personnel": ["George Kistiakowsky", "J. Robert Oppenheimer"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Explosive Lens Design Perfected',
 'milestone.technical',
 '1945-02-01'::timestamptz,
 '{"state": "achieved", "description": "Kistiakowsky team perfected 32-point explosive lens system for symmetric implosion of plutonium core", "personnel": ["George Kistiakowsky"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0009-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Trinity Test Site Prepared',
 'milestone.construction',
 '1945-05-07'::timestamptz,
 '{"state": "achieved", "description": "100-foot tower and instrumentation installed at Jornada del Muerto test site, 210 miles south of Los Alamos", "location": "Alamogordo, NM"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'TRINITY TEST - First Nuclear Explosion',
 'milestone.achievement',
 '1945-07-16'::timestamptz,
 '{"state": "achieved", "description": "5:29:45 AM - First nuclear weapon detonated. Implosion device yielded 21 kilotons, vaporizing tower and creating trinitite glass. Oppenheimer quoted Bhagavad Gita: Now I am become Death, the destroyer of worlds", "yield": "21 kilotons", "personnel": ["J. Robert Oppenheimer", "Kenneth Bainbridge", "Norris Bradbury"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0011-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Little Boy Assembled on Tinian',
 'milestone.deployment',
 '1945-07-31'::timestamptz,
 '{"state": "achieved", "description": "Gun-type uranium bomb assembled on Tinian Island in Pacific, ready for deployment", "location": "Tinian Island"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0003-0012-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Fat Man Assembled on Tinian',
 'milestone.deployment',
 '1945-08-08'::timestamptz,
 '{"state": "achieved", "description": "Implosion plutonium bomb assembled and loaded onto B-29 Bockscar", "location": "Tinian Island"}',
 '00000000-0000-0000-0000-000000000002');

-- ============================================
-- MILESTONES - Goal 4: Maintain Secrecy
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES

('33336666-0004-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Manhattan Engineer District Established',
 'milestone.organizational',
 '1942-08-16'::timestamptz,
 '{"state": "achieved", "description": "Innocuous name chosen to hide atomic bomb project within Army Corps of Engineers bureaucracy", "location": "270 Broadway, New York"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0004-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Compartmentalization Policy Implemented',
 'milestone.security',
 '1942-09-23'::timestamptz,
 '{"state": "achieved", "description": "Groves implemented strict need-to-know policy. Workers knew only their specific tasks, not overall project purpose"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0004-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Security Clearances Established',
 'milestone.security',
 '1942-10-01'::timestamptz,
 '{"state": "achieved", "description": "Multi-level security clearance system established for all project personnel"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0004-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Klaus Fuchs Begins Espionage',
 'milestone.security',
 '1944-08-01'::timestamptz,
 '{"state": "achieved", "description": "German-British physicist Klaus Fuchs, working at Los Alamos, began passing detailed bomb designs to Soviet intelligence. Not discovered until 1950", "personnel": ["Klaus Fuchs"], "impact": "Accelerated Soviet bomb by 1-2 years"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0004-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'David Greenglass Passes Information',
 'milestone.security',
 '1945-01-01'::timestamptz,
 '{"state": "achieved", "description": "Army machinist David Greenglass provided implosion lens diagrams to Soviet handler. Brother-in-law of Julius Rosenberg", "personnel": ["David Greenglass"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0004-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Trinity Test Cover Story Released',
 'milestone.security',
 '1945-07-16'::timestamptz,
 '{"state": "achieved", "description": "Alamogordo Air Base issued press release claiming remotely located ammunition magazine exploded. True cause not revealed until after Hiroshima"}',
 '00000000-0000-0000-0000-000000000002');

-- ============================================
-- MILESTONES - Goal 5: End War with Japan
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES

('33336666-0005-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Target Committee Formed',
 'milestone.organizational',
 '1945-04-27'::timestamptz,
 '{"state": "achieved", "description": "Committee formed to select Japanese cities for atomic attack. Criteria: military significance, size, minimal prior bomb damage", "personnel": ["Leslie Groves"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0005-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Interim Committee Recommends Use Without Warning',
 'milestone.decision',
 '1945-06-01'::timestamptz,
 '{"state": "achieved", "description": "Advisory committee to Truman recommended military use against Japan without prior warning or demonstration", "personnel": ["Henry Stimson", "James Byrnes"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0005-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Franck Report Urges Demonstration',
 'milestone.ethics',
 '1945-06-11'::timestamptz,
 '{"state": "achieved", "description": "Chicago scientists committee led by James Franck urged demonstration rather than direct military use. Report was not forwarded to Truman", "personnel": ["James Franck", "Leo Szilard", "Glenn Seaborg"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0005-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Szilard Petition Circulated',
 'milestone.ethics',
 '1945-07-17'::timestamptz,
 '{"state": "achieved", "description": "70 scientists signed petition urging Truman not to use bomb without warning Japan. Petition never reached the President", "personnel": ["Leo Szilard"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0005-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Potsdam Declaration Issued',
 'milestone.diplomatic',
 '1945-07-26'::timestamptz,
 '{"state": "achieved", "description": "Truman, Churchill, and Chiang demanded Japan surrender unconditionally or face prompt and utter destruction. No explicit mention of atomic weapons", "personnel": ["Harry Truman", "Winston Churchill", "Chiang Kai-shek"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0005-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Bombing Order Issued',
 'milestone.military',
 '1945-07-25'::timestamptz,
 '{"state": "achieved", "description": "General Carl Spaatz ordered to bomb Hiroshima, Kokura, Niigata, or Nagasaki as weather permitted, after August 3", "personnel": ["Gen. Carl Spaatz", "Gen. Thomas Handy"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0005-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'HIROSHIMA - Little Boy Dropped',
 'milestone.achievement',
 '1945-08-06'::timestamptz,
 '{"state": "achieved", "description": "8:15 AM - B-29 Enola Gay dropped Little Boy uranium bomb on Hiroshima. 15 kiloton yield. ~80,000 killed instantly, 60,000+ died later", "aircraft": "Enola Gay", "pilot": "Col. Paul Tibbets", "yield": "15 kilotons", "casualties": "140,000+"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0005-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'NAGASAKI - Fat Man Dropped',
 'milestone.achievement',
 '1945-08-09'::timestamptz,
 '{"state": "achieved", "description": "11:02 AM - B-29 Bockscar dropped Fat Man plutonium bomb on Nagasaki (Kokura obscured by clouds). 21 kiloton yield. ~40,000 killed instantly", "aircraft": "Bockscar", "pilot": "Maj. Charles Sweeney", "yield": "21 kilotons", "casualties": "70,000+"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0005-0009-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Japan Announces Surrender',
 'milestone.achievement',
 '1945-08-15'::timestamptz,
 '{"state": "achieved", "description": "Emperor Hirohito overruled military leaders and announced Japans acceptance of Potsdam Declaration terms. V-J Day"}',
 '00000000-0000-0000-0000-000000000002');

-- ============================================
-- MILESTONES - Goal 6: Post-War Capability
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, due_at, props, created_by) VALUES

('33336666-0006-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Atomic Energy Act Signed',
 'milestone.legislative',
 '1946-08-01'::timestamptz,
 '{"state": "achieved", "description": "Truman signed act transferring control of atomic energy from military to civilian Atomic Energy Commission", "personnel": ["Harry Truman"]}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0006-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Atomic Energy Commission Established',
 'milestone.organizational',
 '1947-01-01'::timestamptz,
 '{"state": "achieved", "description": "Civilian AEC assumed control of all atomic energy matters from Manhattan Engineer District"}',
 '00000000-0000-0000-0000-000000000002'),

('33336666-0006-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'National Laboratories Established',
 'milestone.organizational',
 '1946-07-01'::timestamptz,
 '{"state": "achieved", "description": "Los Alamos, Oak Ridge, Argonne, and other Manhattan Project sites transitioned to national laboratories for continued research"}',
 '00000000-0000-0000-0000-000000000002');

-- ============================================
-- PLANS
-- ============================================
INSERT INTO onto_plans (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Uranium Enrichment Plans
('44446666-0001-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Y-12 Electromagnetic Separation Program', 'plan.production', 'completed',
 '{"description": "Use Ernest Lawrence calutron technology to electromagnetically separate U-235 from U-238 at industrial scale. Required borrowing 14,700 tons of silver from Treasury.", "site": "Oak Ridge", "contractor": "Tennessee Eastman", "cost": "$477.6 million", "method": "calutrons"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0001-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'K-25 Gaseous Diffusion Program', 'plan.production', 'completed',
 '{"description": "Pump uranium hexafluoride through porous barriers to separate lighter U-235. Largest building under one roof ever constructed.", "site": "Oak Ridge", "contractor": "Union Carbide", "cost": "$512.2 million", "method": "gaseous diffusion"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0001-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'S-50 Thermal Diffusion Program', 'plan.production', 'completed',
 '{"description": "Use thermal gradients to partially separate uranium isotopes as supplementary enrichment feed.", "site": "Oak Ridge", "method": "thermal diffusion"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Plutonium Production Plans
('44446666-0002-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Chicago Pile Proof-of-Concept', 'plan.research', 'completed',
 '{"description": "Build first nuclear reactor to prove chain reaction feasibility before committing to full-scale production reactors.", "site": "Chicago", "leader": "Enrico Fermi"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0002-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Hanford Production Reactor Program', 'plan.production', 'completed',
 '{"description": "Build three graphite-moderated, water-cooled production reactors to irradiate uranium and produce plutonium-239.", "site": "Hanford", "contractor": "DuPont", "reactors": ["B", "D", "F"], "cost": "$390 million"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0002-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Plutonium Chemical Separation', 'plan.production', 'completed',
 '{"description": "Extract plutonium from irradiated uranium fuel using bismuth phosphate process in massive canyon buildings.", "site": "Hanford", "method": "bismuth phosphate"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Weapons Design Plans
('44446666-0003-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Gun-Type Weapon Design (Little Boy)', 'plan.engineering', 'completed',
 '{"description": "Fire one subcritical mass of U-235 into another at high speed using modified artillery gun barrel.", "weapon": "Little Boy", "material": "U-235", "method": "gun assembly"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0003-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Implosion Weapon Design (Fat Man)', 'plan.engineering', 'completed',
 '{"description": "Compress subcritical plutonium sphere using precisely shaped explosive lenses to achieve supercriticality.", "weapon": "Fat Man", "material": "Pu-239", "method": "implosion", "lenses": 32}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0003-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Trinity Test Preparation', 'plan.testing', 'completed',
 '{"description": "Prepare and execute first nuclear test to validate implosion design before combat deployment.", "site": "Alamogordo", "date": "1945-07-16"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0003-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Explosive Lens Development', 'plan.engineering', 'completed',
 '{"description": "Design 32-point system of fast and slow explosives to create perfectly spherical implosion shockwave.", "leader": "George Kistiakowsky"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Security Plans
('44446666-0004-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Compartmentalization Protocol', 'plan.security', 'completed',
 '{"description": "Implement strict need-to-know policy so workers understand only their immediate tasks, not overall project purpose.", "principle": "need-to-know"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0004-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Counterintelligence Operations', 'plan.security', 'completed',
 '{"description": "Monitor personnel, investigate leaks, coordinate with FBI and OSS to prevent espionage.", "leader": "Col. Boris Pash"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0004-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Alsos Mission', 'plan.intelligence', 'completed',
 '{"description": "Military intelligence mission to track German atomic program and capture personnel and materials.", "leader": "Col. Boris Pash", "scientific_lead": "Samuel Goudsmit"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Deployment Plans
('44446666-0005-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Target Selection Process', 'plan.military', 'completed',
 '{"description": "Evaluate Japanese cities for atomic attack based on military significance, population, and strategic value.", "targets_considered": ["Hiroshima", "Kokura", "Niigata", "Nagasaki", "Kyoto"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0005-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'B-29 Modification Program', 'plan.military', 'completed',
 '{"description": "Modify B-29 Superfortress bombers to carry atomic bombs. Train crews at Wendover Field.", "aircraft": "B-29 Silverplate", "unit": "509th Composite Group"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44446666-0005-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Tinian Forward Deployment', 'plan.military', 'completed',
 '{"description": "Establish forward base on Tinian Island for final bomb assembly and combat missions.", "location": "Tinian Island", "unit": "509th Composite Group"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TASKS
-- ============================================
INSERT INTO onto_tasks (id, project_id, type_key, title, state_key, priority, due_at, props, created_by) VALUES

-- Y-12 Tasks
('55556666-0001-0001-0001-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.procurement', 'Procure 14,700 tons silver from Treasury',
 'done', 1, '1943-03-01'::timestamptz,
 '{"assignee": "War Department", "description": "Borrow silver bullion from West Point for calutron electromagnetic coils—copper too scarce"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0001-0001-0002-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.construction', 'Build Y-12 calutron racetracks',
 'done', 1, '1943-11-01'::timestamptz,
 '{"assignee": "Tennessee Eastman", "description": "Construct Alpha and Beta racetracks for electromagnetic separation"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0001-0001-0003-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.operations', 'Train female calutron operators',
 'done', 2, '1944-01-01'::timestamptz,
 '{"assignee": "Tennessee Eastman", "description": "Recruit and train young women to operate calutron controls—they outperformed PhD physicists"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0001-0001-0004-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.production', 'Produce weapons-grade U-235',
 'done', 1, '1945-07-01'::timestamptz,
 '{"assignee": "Y-12", "description": "Enrich uranium to >80% U-235 for Little Boy core", "quantity": "64 kg"}',
 '00000000-0000-0000-0000-000000000002'),

-- K-25 Tasks
('55556666-0001-0002-0001-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.engineering', 'Develop gaseous diffusion barrier',
 'done', 1, '1943-09-01'::timestamptz,
 '{"assignee": "Union Carbide", "description": "Create porous nickel barriers that allow U-235 preferential passage"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0001-0002-0002-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.construction', 'Build K-25 main building',
 'done', 1, '1944-09-01'::timestamptz,
 '{"assignee": "Union Carbide", "description": "Construct U-shaped building—largest under one roof in world"}',
 '00000000-0000-0000-0000-000000000002'),

-- Hanford Tasks
('55556666-0002-0001-0001-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.construction', 'Construct B Reactor',
 'done', 1, '1944-09-13'::timestamptz,
 '{"assignee": "DuPont", "description": "Build first full-scale plutonium production reactor"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0002-0001-0002-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.construction', 'Construct D Reactor',
 'done', 1, '1944-12-17'::timestamptz,
 '{"assignee": "DuPont", "description": "Build second production reactor"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0002-0001-0003-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.construction', 'Construct F Reactor',
 'done', 1, '1945-02-25'::timestamptz,
 '{"assignee": "DuPont", "description": "Build third production reactor"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0002-0001-0004-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.engineering', 'Solve xenon poisoning problem',
 'done', 1, '1944-09-27'::timestamptz,
 '{"assignee": "Enrico Fermi", "description": "Diagnose reactor shutdown caused by Xe-135 neutron absorption; load extra fuel tubes"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0002-0001-0005-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.production', 'Produce weapons-grade plutonium',
 'done', 1, '1945-07-01'::timestamptz,
 '{"assignee": "Hanford", "description": "Irradiate uranium and separate Pu-239 for Fat Man cores"}',
 '00000000-0000-0000-0000-000000000002'),

-- Los Alamos Tasks
('55556666-0003-0001-0001-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.research', 'Calculate critical mass for U-235',
 'done', 1, '1943-06-01'::timestamptz,
 '{"assignee": "Theoretical Division", "description": "Determine minimum mass of U-235 needed for chain reaction"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0003-0001-0002-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.research', 'Calculate critical mass for Pu-239',
 'done', 1, '1943-06-01'::timestamptz,
 '{"assignee": "Theoretical Division", "description": "Determine minimum mass of Pu-239 needed for chain reaction"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0003-0001-0003-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.engineering', 'Design gun-type assembly mechanism',
 'done', 1, '1944-06-01'::timestamptz,
 '{"assignee": "Gun Group", "description": "Engineer modified artillery barrel to fire uranium projectile into target"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0003-0001-0004-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.engineering', 'Design 32-point explosive lens array',
 'done', 1, '1945-02-01'::timestamptz,
 '{"assignee": "George Kistiakowsky", "description": "Create precisely shaped explosive charges for symmetric implosion"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0003-0001-0005-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.engineering', 'Design implosion initiator',
 'done', 1, '1945-05-01'::timestamptz,
 '{"assignee": "Los Alamos", "description": "Create polonium-beryllium initiator to start chain reaction at precise moment"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0003-0001-0006-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.fabrication', 'Fabricate plutonium pit',
 'done', 1, '1945-07-01'::timestamptz,
 '{"assignee": "Los Alamos", "description": "Machine plutonium sphere for Fat Man core"}',
 '00000000-0000-0000-0000-000000000002'),

-- Trinity Test Tasks
('55556666-0003-0002-0001-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.construction', 'Build 100-foot test tower',
 'done', 2, '1945-05-07'::timestamptz,
 '{"assignee": "Los Alamos", "description": "Construct steel tower at Trinity site to elevate Gadget"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0003-0002-0002-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.installation', 'Install instrumentation bunkers',
 'done', 2, '1945-06-01'::timestamptz,
 '{"assignee": "Los Alamos", "description": "Build observation bunkers at 10,000 yards from ground zero"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0003-0002-0003-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.assembly', 'Assemble Gadget on tower',
 'done', 1, '1945-07-15'::timestamptz,
 '{"assignee": "Norris Bradbury", "description": "Hoist and assemble implosion device on tower for test"}',
 '00000000-0000-0000-0000-000000000002'),

-- Deployment Tasks
('55556666-0005-0001-0001-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.modification', 'Modify B-29s for atomic bomb delivery',
 'done', 1, '1945-06-01'::timestamptz,
 '{"assignee": "509th Composite Group", "description": "Remove armor, modify bomb bays for 10,000 lb weapons"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0005-0001-0002-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.training', 'Train combat crews',
 'done', 1, '1945-07-01'::timestamptz,
 '{"assignee": "Col. Paul Tibbets", "description": "Train crews on high-altitude bombing and escape maneuvers at Wendover Field"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0005-0001-0003-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.assembly', 'Assemble Little Boy on Tinian',
 'done', 1, '1945-07-31'::timestamptz,
 '{"assignee": "Los Alamos team", "description": "Final assembly of gun-type uranium bomb in Pacific"}',
 '00000000-0000-0000-0000-000000000002'),

('55556666-0005-0001-0004-000000000001', '66666666-6666-6666-6666-666666666666',
 'task.assembly', 'Assemble Fat Man on Tinian',
 'done', 1, '1945-08-08'::timestamptz,
 '{"assignee": "Los Alamos team", "description": "Final assembly of implosion plutonium bomb in Pacific"}',
 '00000000-0000-0000-0000-000000000002');

-- ============================================
-- DECISIONS
-- ============================================
INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES

('66666666-0001-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Transfer Project to Army Control',
 '1942-06-18'::timestamptz,
 'OSRD research program needed massive industrial scale-up that only the Army Corps of Engineers could provide. Military command structure enabled rapid procurement, construction, and security.',
 '{"type": "decision.organizational", "state": "decided", "decided_by": "Vannevar Bush, Gen. Somervell", "options": ["Continue civilian control", "Transfer to Army"]}',
 '00000000-0000-0000-0000-000000000002'),

('66666666-0001-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Select Leslie Groves as Commander',
 '1942-09-17'::timestamptz,
 'Groves proven leadership on Pentagon construction and forceful personality would drive project to completion. Promoted to brigadier general to command respect from scientists.',
 '{"type": "decision.personnel", "state": "decided", "decided_by": "Gen. Somervell, Gen. Styer"}',
 '00000000-0000-0000-0000-000000000002'),

('66666666-0001-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Select Oppenheimer as Scientific Director',
 '1942-10-15'::timestamptz,
 'Despite security concerns about leftist associations, Oppenheimer combined scientific brilliance with organizational skills and deep understanding of project scope. Groves personally overrode security objections.',
 '{"type": "decision.personnel", "state": "decided", "decided_by": "Leslie Groves"}',
 '00000000-0000-0000-0000-000000000002'),

('66666666-0001-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Pursue Multiple Enrichment Technologies',
 '1942-11-01'::timestamptz,
 'No single enrichment method proven at industrial scale. Building Y-12 (electromagnetic), K-25 (gaseous diffusion), and S-50 (thermal diffusion) simultaneously hedged against failure of any one approach.',
 '{"type": "decision.technical", "state": "decided", "decided_by": "Groves, S-1 Committee", "options": ["Bet on single technology", "Pursue multiple in parallel"]}',
 '00000000-0000-0000-0000-000000000002'),

('66666666-0002-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Commit to Implosion Design for Plutonium',
 '1944-04-15'::timestamptz,
 'Discovery of Pu-240 spontaneous fission made gun-type impossible for plutonium. Only implosion could assemble critical mass fast enough to avoid predetonation. Required massive R&D pivot.',
 '{"type": "decision.technical", "state": "decided", "decided_by": "Oppenheimer, Groves", "impact": "Complete redesign of plutonium bomb"}',
 '00000000-0000-0000-0000-000000000002'),

('66666666-0002-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Conduct Trinity Test',
 '1945-03-01'::timestamptz,
 'Implosion design too complex and expensive to risk failure in combat. Gun-type considered reliable without testing. Trinity would validate implosion and provide data on nuclear explosion effects.',
 '{"type": "decision.technical", "state": "decided", "decided_by": "Oppenheimer, Groves", "options": ["Test first", "Deploy without testing"]}',
 '00000000-0000-0000-0000-000000000002'),

('66666666-0003-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Use Atomic Bombs on Japanese Cities',
 '1945-06-01'::timestamptz,
 'Interim Committee recommended military use without specific warning. Shock effect needed to force surrender and avoid costly invasion. Demonstration might fail or allow defensive preparations.',
 '{"type": "decision.strategic", "state": "decided", "decided_by": "Harry Truman, Interim Committee", "options": ["Demonstration first", "Warning then use", "Direct military use"]}',
 '00000000-0000-0000-0000-000000000002'),

('66666666-0003-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Remove Kyoto from Target List',
 '1945-06-01'::timestamptz,
 'Secretary of War Stimson removed Kyoto from target list due to its cultural and religious significance. Argued destruction would make postwar reconciliation impossible and embitter Japanese against US.',
 '{"type": "decision.ethical", "state": "decided", "decided_by": "Henry Stimson"}',
 '00000000-0000-0000-0000-000000000002'),

('66666666-0003-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Select Hiroshima as Primary Target',
 '1945-07-25'::timestamptz,
 'Hiroshima selected for military significance (Second Army HQ), industrial capacity, and minimal prior bomb damage that would clearly demonstrate atomic weapon effects.',
 '{"type": "decision.military", "state": "decided", "decided_by": "Target Committee, Groves"}',
 '00000000-0000-0000-0000-000000000002'),

('66666666-0003-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Drop Second Bomb on Nagasaki',
 '1945-08-09'::timestamptz,
 'After Japan did not immediately surrender following Hiroshima, second bomb dropped on Nagasaki (Kokura obscured by clouds). Demonstrated US possessed multiple weapons.',
 '{"type": "decision.military", "state": "decided", "decided_by": "Truman (standing order)", "context": "Japan had not surrendered after Hiroshima"}',
 '00000000-0000-0000-0000-000000000002');

-- ============================================
-- RISKS
-- ============================================
INSERT INTO onto_risks (id, project_id, title, type_key, probability, impact, state_key, props, created_by) VALUES

('77776666-0001-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Germany Develops Atomic Bomb First',
 'risk.strategic',
 0.5, 'critical', 'mitigated',
 '{"description": "Nazi Germany with advanced physics establishment might develop atomic weapons first", "mitigation": "Maximum speed and secrecy; Alsos Mission to track German progress", "outcome": "German program far behind; ended with surrender May 1945"}',
 '00000000-0000-0000-0000-000000000002'),

('77776666-0001-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Uranium Enrichment Technology Fails',
 'risk.technical',
 0.5, 'high', 'mitigated',
 '{"description": "No single enrichment technology proven at industrial scale", "mitigation": "Pursue multiple parallel approaches (Y-12, K-25, S-50)", "outcome": "Y-12 succeeded; K-25 contributed intermediate product"}',
 '00000000-0000-0000-0000-000000000002'),

('77776666-0002-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Production Reactor Meltdown',
 'risk.safety',
 0.2, 'critical', 'mitigated',
 '{"description": "Hanford reactors might fail catastrophically with radiation release", "mitigation": "Remote site selection; reactor spacing; DuPont conservative safety culture", "outcome": "Xenon poisoning solved; no meltdowns occurred"}',
 '00000000-0000-0000-0000-000000000002'),

('77776666-0002-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Xenon-135 Reactor Poisoning',
 'risk.technical',
 0.8, 'high', 'occurred',
 '{"description": "Fission product Xe-135 absorbed neutrons and shut down B Reactor hours after startup", "mitigation": "DuPont conservative design included extra fuel tube capacity", "outcome": "Fermi diagnosed problem; extra tubes loaded; reactor restarted"}',
 '00000000-0000-0000-0000-000000000002'),

('77776666-0003-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Soviet Espionage Penetrates Project',
 'risk.security',
 0.8, 'critical', 'occurred',
 '{"description": "USSR might steal atomic secrets through intelligence operations", "mitigation": "Compartmentalization, security clearances, counterintelligence", "outcome": "Klaus Fuchs, David Greenglass, Theodore Hall provided detailed information; Soviet bomb accelerated 1-2 years"}',
 '00000000-0000-0000-0000-000000000002'),

('77776666-0003-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Pu-240 Causes Predetonation in Gun-Type',
 'risk.technical',
 0.8, 'critical', 'occurred',
 '{"description": "Reactor-produced Pu-239 contaminated with Pu-240 having high spontaneous fission rate", "mitigation": "Switch to implosion design with faster assembly time", "outcome": "Implosion design successfully developed and deployed"}',
 '00000000-0000-0000-0000-000000000002'),

('77776666-0004-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Implosion Device Fails to Detonate',
 'risk.technical',
 0.5, 'high', 'mitigated',
 '{"description": "Complex implosion design might fizzle or fail completely", "mitigation": "Trinity test to validate design before combat use", "outcome": "Trinity successful; Fat Man worked as designed"}',
 '00000000-0000-0000-0000-000000000002'),

('77776666-0004-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Scientists Refuse to Work on Weapons',
 'risk.personnel',
 0.2, 'medium', 'mitigated',
 '{"description": "Scientists might refuse based on ethical concerns or resign", "mitigation": "Appeal to patriotism; compartmentalization limited knowledge of ultimate purpose", "outcome": "Franck Report and Szilard Petition issued but ignored; only Joseph Rotblat resigned"}',
 '00000000-0000-0000-0000-000000000002'),

('77776666-0005-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Combat Delivery Fails',
 'risk.military',
 0.2, 'high', 'mitigated',
 '{"description": "Bomb might not detonate, aircraft shot down, or mission fails", "mitigation": "B-29 modifications; extensive crew training; multiple bombs prepared", "outcome": "Both Hiroshima and Nagasaki missions successful"}',
 '00000000-0000-0000-0000-000000000002'),

('77776666-0005-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Japan Does Not Surrender After Bombing',
 'risk.strategic',
 0.5, 'high', 'mitigated',
 '{"description": "Japanese military might refuse surrender even after atomic attacks", "mitigation": "Multiple bombs ready; continued conventional bombing; Soviet declaration of war", "outcome": "Emperor overruled military; Japan surrendered August 15"}',
 '00000000-0000-0000-0000-000000000002');

-- ============================================
-- DOCUMENTS
-- ============================================
INSERT INTO onto_documents (id, project_id, title, type_key, state_key, props, created_by) VALUES
('88886666-0001-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Einstein-Szilard Letter', 'document.letter', 'published',
 '{"date": "1939-08-02", "author": "Albert Einstein (drafted by Leo Szilard)", "recipient": "President Franklin D. Roosevelt", "significance": "Initiated U.S. atomic program", "quote": "It may become possible to set up a nuclear chain reaction in a large mass of uranium... extremely powerful bombs of a new type may thus be constructed"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0001-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Franck Report', 'document.report', 'published',
 '{"date": "1945-06-11", "author": "James Franck Committee", "recipient": "Secretary of War Henry Stimson", "significance": "Scientists urged demonstration rather than direct military use", "quote": "If the United States would be the first to release this new means of indiscriminate destruction upon mankind, she would sacrifice public support throughout the world"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0001-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Szilard Petition', 'document.petition', 'published',
 '{"date": "1945-07-17", "author": "Leo Szilard (70 scientists signed)", "recipient": "President Harry S. Truman", "significance": "Scientists petitioned against use without warning Japan - never delivered to Truman", "quote": "A nation which sets the precedent of using these newly liberated forces of nature for purposes of destruction may have to bear the responsibility of opening the door to an era of devastation on an unimaginable scale"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0001-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Potsdam Declaration', 'document.declaration', 'published',
 '{"date": "1945-07-26", "author": "Truman, Churchill, Chiang Kai-shek", "recipient": "Japan", "significance": "Final warning demanding unconditional surrender", "quote": "The alternative for Japan is prompt and utter destruction"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0002-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Compton Coded Message - CP-1 Success', 'document.message', 'published',
 '{"date": "1942-12-02", "author": "Arthur Compton", "recipient": "James Conant", "significance": "Announced first controlled nuclear chain reaction", "quote": "The Italian navigator has just landed in the new world", "context": "Italian navigator = Enrico Fermi; new world = nuclear age"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0002-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Trinity Test Report', 'document.report', 'published',
 '{"date": "1945-07-16", "author": "Kenneth Bainbridge (test director)", "significance": "Documented first nuclear explosion", "yield": "21 kilotons", "quote_oppenheimer": "Now I am become Death, the destroyer of worlds", "quote_bainbridge": "Now we are all sons of bitches"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0002-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Groves AAA Priority Authorization', 'document.memo', 'published',
 '{"date": "1942-09-19", "author": "Donald Nelson (War Production Board)", "recipient": "Leslie Groves", "significance": "Gave Manhattan Project top procurement priority", "context": "Groves threatened to go to the President if denied"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0003-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Interim Committee Recommendation', 'document.memo', 'published',
 '{"date": "1945-06-01", "author": "Interim Committee", "recipient": "President Truman", "significance": "Recommended military use against Japan without warning", "members": ["Henry Stimson", "James Byrnes", "Vannevar Bush", "James Conant"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0003-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Bombing Order - Hiroshima', 'document.order', 'published',
 '{"date": "1945-07-25", "author": "Gen. Thomas Handy", "recipient": "Gen. Carl Spaatz", "significance": "Authorized atomic bomb use against Japan", "targets": ["Hiroshima", "Kokura", "Niigata", "Nagasaki"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0003-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Trinity Cover Story Press Release', 'document.press_release', 'published',
 '{"date": "1945-07-16", "author": "Alamogordo Air Base", "significance": "Concealed first nuclear test from public", "quote": "A remotely located ammunition magazine containing a considerable amount of high explosives and pyrotechnics exploded, but there was no loss of life or limb to anyone"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0003-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Truman Announcement - Hiroshima', 'document.speech', 'published',
 '{"date": "1945-08-06", "author": "Harry S. Truman", "significance": "First public disclosure of atomic weapons", "quote": "Sixteen hours ago an American airplane dropped one bomb on Hiroshima... It is an atomic bomb. It is a harnessing of the basic power of the universe."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('88886666-0004-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666',
 'Atomic Energy Act of 1946', 'document.legislation', 'published',
 '{"date": "1946-08-01", "author": "U.S. Congress", "signed_by": "Harry S. Truman", "significance": "Transferred atomic energy control from military to civilian Atomic Energy Commission"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GRAPH EDGES
-- ============================================

-- Project → Goals
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, project_id, props) VALUES
('project', '66666666-6666-6666-6666-666666666666', 'has', 'goal', '22226666-0001-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('project', '66666666-6666-6666-6666-666666666666', 'has', 'goal', '22226666-0002-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('project', '66666666-6666-6666-6666-666666666666', 'has', 'goal', '22226666-0003-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('project', '66666666-6666-6666-6666-666666666666', 'has', 'goal', '22226666-0004-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('project', '66666666-6666-6666-6666-666666666666', 'has', 'goal', '22226666-0005-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('project', '66666666-6666-6666-6666-666666666666', 'has', 'goal', '22226666-0006-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Goal 1 → Milestones (Beat Germany)
('goal', '22226666-0001-0000-0000-000000000001', 'has', 'milestone', '33336666-0001-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0001-0000-0000-000000000001', 'has', 'milestone', '33336666-0001-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0001-0000-0000-000000000001', 'has', 'milestone', '33336666-0001-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0001-0000-0000-000000000001', 'has', 'milestone', '33336666-0001-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0001-0000-0000-000000000001', 'has', 'milestone', '33336666-0001-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0001-0000-0000-000000000001', 'has', 'milestone', '33336666-0001-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0001-0000-0000-000000000001', 'has', 'milestone', '33336666-0001-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0001-0000-0000-000000000001', 'has', 'milestone', '33336666-0001-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Goal 2 → Milestones (Produce Fissile Material)
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0009-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0011-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0012-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0013-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0002-0000-0000-000000000001', 'has', 'milestone', '33336666-0002-0014-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Goal 3 → Milestones (Design Weapons)
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0009-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0011-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0003-0000-0000-000000000001', 'has', 'milestone', '33336666-0003-0012-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Goal 4 → Milestones (Maintain Secrecy)
('goal', '22226666-0004-0000-0000-000000000001', 'has', 'milestone', '33336666-0004-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0004-0000-0000-000000000001', 'has', 'milestone', '33336666-0004-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0004-0000-0000-000000000001', 'has', 'milestone', '33336666-0004-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0004-0000-0000-000000000001', 'has', 'milestone', '33336666-0004-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0004-0000-0000-000000000001', 'has', 'milestone', '33336666-0004-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0004-0000-0000-000000000001', 'has', 'milestone', '33336666-0004-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Goal 5 → Milestones (End War)
('goal', '22226666-0005-0000-0000-000000000001', 'has', 'milestone', '33336666-0005-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0005-0000-0000-000000000001', 'has', 'milestone', '33336666-0005-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0005-0000-0000-000000000001', 'has', 'milestone', '33336666-0005-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0005-0000-0000-000000000001', 'has', 'milestone', '33336666-0005-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0005-0000-0000-000000000001', 'has', 'milestone', '33336666-0005-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0005-0000-0000-000000000001', 'has', 'milestone', '33336666-0005-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0005-0000-0000-000000000001', 'has', 'milestone', '33336666-0005-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0005-0000-0000-000000000001', 'has', 'milestone', '33336666-0005-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0005-0000-0000-000000000001', 'has', 'milestone', '33336666-0005-0009-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Goal 6 → Milestones (Post-War)
('goal', '22226666-0006-0000-0000-000000000001', 'has', 'milestone', '33336666-0006-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0006-0000-0000-000000000001', 'has', 'milestone', '33336666-0006-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('goal', '22226666-0006-0000-0000-000000000001', 'has', 'milestone', '33336666-0006-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Causal Relationships: Milestones → Milestones (enabled/led_to)
-- Einstein letter → FDR briefed → Advisory Committee
('milestone', '33336666-0001-0001-0000-000000000001', 'enabled', 'milestone', '33336666-0001-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Einstein letter led to FDR briefing"}'::jsonb),
('milestone', '33336666-0001-0002-0000-000000000001', 'enabled', 'milestone', '33336666-0001-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "FDR approval led to Advisory Committee"}'::jsonb),
-- Chicago Pile → Hanford construction
('milestone', '33336666-0002-0004-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "CP-1 success enabled Hanford reactor construction"}'::jsonb),
-- Pu-240 discovery → Implosion program
('milestone', '33336666-0003-0006-0000-000000000001', 'led_to', 'milestone', '33336666-0003-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Pu-240 problem forced crash implosion program"}'::jsonb),
-- Trinity → Hiroshima → Nagasaki → Surrender
('milestone', '33336666-0003-0010-0000-000000000001', 'enabled', 'milestone', '33336666-0005-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Trinity success enabled Hiroshima bombing"}'::jsonb),
('milestone', '33336666-0005-0007-0000-000000000001', 'led_to', 'milestone', '33336666-0005-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Hiroshima did not end war, led to Nagasaki"}'::jsonb),
('milestone', '33336666-0005-0008-0000-000000000001', 'led_to', 'milestone', '33336666-0005-0009-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Nagasaki led to Japan surrender"}'::jsonb),

-- Plans → Milestones
('plan', '44446666-0001-0001-0000-000000000001', 'implements', 'milestone', '33336666-0002-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0001-0002-0000-000000000001', 'implements', 'milestone', '33336666-0002-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0002-0001-0000-000000000001', 'implements', 'milestone', '33336666-0002-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0002-0002-0000-000000000001', 'implements', 'milestone', '33336666-0002-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0003-0001-0000-000000000001', 'implements', 'milestone', '33336666-0003-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0003-0002-0000-000000000001', 'implements', 'milestone', '33336666-0003-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0003-0003-0000-000000000001', 'implements', 'milestone', '33336666-0003-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Documents → Milestones
('document', '88886666-0001-0001-0000-000000000001', 'documents', 'milestone', '33336666-0001-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('document', '88886666-0001-0002-0000-000000000001', 'documents', 'milestone', '33336666-0005-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('document', '88886666-0001-0003-0000-000000000001', 'documents', 'milestone', '33336666-0005-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('document', '88886666-0001-0004-0000-000000000001', 'documents', 'milestone', '33336666-0005-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('document', '88886666-0002-0001-0000-000000000001', 'documents', 'milestone', '33336666-0002-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('document', '88886666-0002-0002-0000-000000000001', 'documents', 'milestone', '33336666-0003-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('document', '88886666-0003-0002-0000-000000000001', 'documents', 'milestone', '33336666-0005-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('document', '88886666-0003-0004-0000-000000000001', 'documents', 'milestone', '33336666-0005-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Decisions → Milestones
('decision', '66666666-0001-0003-0000-000000000001', 'informs', 'milestone', '33336666-0003-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('decision', '66666666-0002-0001-0000-000000000001', 'informs', 'milestone', '33336666-0003-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('decision', '66666666-0002-0002-0000-000000000001', 'informs', 'milestone', '33336666-0003-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('decision', '66666666-0003-0001-0000-000000000001', 'informs', 'milestone', '33336666-0005-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('decision', '66666666-0003-0003-0000-000000000001', 'informs', 'milestone', '33336666-0005-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Risks → Milestones/Plans
('risk', '77776666-0001-0002-0000-000000000001', 'mitigated_by', 'plan', '44446666-0001-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('risk', '77776666-0002-0002-0000-000000000001', 'occurred_at', 'milestone', '33336666-0002-0011-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('risk', '77776666-0003-0001-0000-000000000001', 'occurred_at', 'milestone', '33336666-0004-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('risk', '77776666-0003-0002-0000-000000000001', 'occurred_at', 'milestone', '33336666-0003-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('risk', '77776666-0004-0001-0000-000000000001', 'mitigated_by', 'plan', '44446666-0003-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
-- Additional Risk edges
('risk', '77776666-0001-0001-0000-000000000001', 'mitigated_by', 'plan', '44446666-0004-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Alsos Mission tracked German progress"}'::jsonb),
('risk', '77776666-0001-0001-0000-000000000001', 'occurred_at', 'milestone', '33336666-0001-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Risk confirmed mitigated when Alsos found Germans behind"}'::jsonb),
('risk', '77776666-0002-0001-0000-000000000001', 'mitigated_by', 'plan', '44446666-0002-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "DuPont safety culture mitigated meltdown risk"}'::jsonb),
('risk', '77776666-0001-0002-0000-000000000001', 'mitigated_by', 'plan', '44446666-0001-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "K-25 provided backup enrichment path"}'::jsonb),
('risk', '77776666-0004-0002-0000-000000000001', 'occurred_at', 'milestone', '33336666-0005-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Franck Report represented scientist concerns"}'::jsonb),
('risk', '77776666-0005-0001-0000-000000000001', 'mitigated_by', 'plan', '44446666-0005-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "B-29 modifications and crew training mitigated delivery risk"}'::jsonb),
('risk', '77776666-0005-0002-0000-000000000001', 'occurred_at', 'milestone', '33336666-0005-0009-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Risk mitigated when Japan surrendered"}'::jsonb),

-- ============================================
-- PLAN → TASK EDGES (Tasks belong to Plans)
-- ============================================

-- Y-12 Electromagnetic Plan → Tasks
('plan', '44446666-0001-0001-0000-000000000001', 'contains', 'task', '55556666-0001-0001-0001-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0001-0001-0000-000000000001', 'contains', 'task', '55556666-0001-0001-0002-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0001-0001-0000-000000000001', 'contains', 'task', '55556666-0001-0001-0003-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0001-0001-0000-000000000001', 'contains', 'task', '55556666-0001-0001-0004-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- K-25 Gaseous Diffusion Plan → Tasks
('plan', '44446666-0001-0002-0000-000000000001', 'contains', 'task', '55556666-0001-0002-0001-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0001-0002-0000-000000000001', 'contains', 'task', '55556666-0001-0002-0002-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Hanford Reactor Plan → Tasks
('plan', '44446666-0002-0002-0000-000000000001', 'contains', 'task', '55556666-0002-0001-0001-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0002-0002-0000-000000000001', 'contains', 'task', '55556666-0002-0001-0002-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0002-0002-0000-000000000001', 'contains', 'task', '55556666-0002-0001-0003-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0002-0002-0000-000000000001', 'contains', 'task', '55556666-0002-0001-0004-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0002-0002-0000-000000000001', 'contains', 'task', '55556666-0002-0001-0005-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Gun-Type Design Plan → Tasks
('plan', '44446666-0003-0001-0000-000000000001', 'contains', 'task', '55556666-0003-0001-0001-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0003-0001-0000-000000000001', 'contains', 'task', '55556666-0003-0001-0003-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Implosion Design Plan → Tasks
('plan', '44446666-0003-0002-0000-000000000001', 'contains', 'task', '55556666-0003-0001-0002-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0003-0002-0000-000000000001', 'contains', 'task', '55556666-0003-0001-0005-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0003-0002-0000-000000000001', 'contains', 'task', '55556666-0003-0001-0006-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Explosive Lens Plan → Tasks
('plan', '44446666-0003-0004-0000-000000000001', 'contains', 'task', '55556666-0003-0001-0004-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Trinity Test Plan → Tasks
('plan', '44446666-0003-0003-0000-000000000001', 'contains', 'task', '55556666-0003-0002-0001-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0003-0003-0000-000000000001', 'contains', 'task', '55556666-0003-0002-0002-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0003-0003-0000-000000000001', 'contains', 'task', '55556666-0003-0002-0003-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- B-29 Modification Plan → Tasks
('plan', '44446666-0005-0002-0000-000000000001', 'contains', 'task', '55556666-0005-0001-0001-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0005-0002-0000-000000000001', 'contains', 'task', '55556666-0005-0001-0002-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Tinian Deployment Plan → Tasks
('plan', '44446666-0005-0003-0000-000000000001', 'contains', 'task', '55556666-0005-0001-0003-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0005-0003-0000-000000000001', 'contains', 'task', '55556666-0005-0001-0004-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- ============================================
-- ADDITIONAL PLAN → MILESTONE EDGES
-- ============================================

-- S-50 Thermal Diffusion → contributed to enrichment milestones
('plan', '44446666-0001-0003-0000-000000000001', 'implements', 'milestone', '33336666-0002-0014-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "S-50 contributed feed for final enrichment"}'::jsonb),

-- Plutonium Separation → plutonium delivery milestone
('plan', '44446666-0002-0003-0000-000000000001', 'implements', 'milestone', '33336666-0002-0012-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0002-0003-0000-000000000001', 'implements', 'milestone', '33336666-0002-0013-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Explosive Lens → implosion design milestones
('plan', '44446666-0003-0004-0000-000000000001', 'implements', 'milestone', '33336666-0003-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Compartmentalization → secrecy milestones
('plan', '44446666-0004-0001-0000-000000000001', 'implements', 'milestone', '33336666-0004-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0004-0001-0000-000000000001', 'implements', 'milestone', '33336666-0004-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0004-0001-0000-000000000001', 'implements', 'milestone', '33336666-0004-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Counterintelligence → security milestones (and failures)
('plan', '44446666-0004-0002-0000-000000000001', 'implements', 'milestone', '33336666-0004-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0004-0002-0000-000000000001', 'implements', 'milestone', '33336666-0004-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Alsos Mission → intelligence milestone
('plan', '44446666-0004-0003-0000-000000000001', 'implements', 'milestone', '33336666-0001-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Target Selection → target milestones
('plan', '44446666-0005-0001-0000-000000000001', 'implements', 'milestone', '33336666-0005-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0005-0001-0000-000000000001', 'implements', 'milestone', '33336666-0005-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- B-29 Modification → deployment milestones
('plan', '44446666-0005-0002-0000-000000000001', 'implements', 'milestone', '33336666-0003-0011-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0005-0002-0000-000000000001', 'implements', 'milestone', '33336666-0003-0012-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Tinian Deployment → bombing milestones
('plan', '44446666-0005-0003-0000-000000000001', 'implements', 'milestone', '33336666-0003-0011-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0005-0003-0000-000000000001', 'implements', 'milestone', '33336666-0003-0012-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0005-0003-0000-000000000001', 'implements', 'milestone', '33336666-0005-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('plan', '44446666-0005-0003-0000-000000000001', 'implements', 'milestone', '33336666-0005-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- ============================================
-- ADDITIONAL DECISION → MILESTONE EDGES
-- ============================================

-- Transfer to Army → Manhattan District established
('decision', '66666666-0001-0001-0000-000000000001', 'informs', 'milestone', '33336666-0004-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Select Groves → organizational changes
('decision', '66666666-0001-0002-0000-000000000001', 'informs', 'milestone', '33336666-0004-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('decision', '66666666-0001-0002-0000-000000000001', 'informs', 'milestone', '33336666-0002-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Groves approved Oak Ridge site"}'::jsonb),
('decision', '66666666-0001-0002-0000-000000000001', 'informs', 'milestone', '33336666-0002-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Groves approved Hanford site"}'::jsonb),

-- Multiple Enrichment → all enrichment facility milestones
('decision', '66666666-0001-0004-0000-000000000001', 'informs', 'milestone', '33336666-0002-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('decision', '66666666-0001-0004-0000-000000000001', 'informs', 'milestone', '33336666-0002-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Remove Kyoto → target selection milestone
('decision', '66666666-0003-0002-0000-000000000001', 'informs', 'milestone', '33336666-0005-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Stimson removed Kyoto from target list"}'::jsonb),

-- Nagasaki decision → Nagasaki bombing
('decision', '66666666-0003-0004-0000-000000000001', 'informs', 'milestone', '33336666-0005-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Use on Japan decision → Interim Committee milestone
('decision', '66666666-0003-0001-0000-000000000001', 'informs', 'milestone', '33336666-0005-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- ============================================
-- ADDITIONAL DOCUMENT → MILESTONE EDGES
-- ============================================

-- Groves AAA Priority → procurement enabled construction
('document', '88886666-0002-0003-0000-000000000001', 'documents', 'milestone', '33336666-0002-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "AAA priority enabled rapid Oak Ridge construction"}'::jsonb),
('document', '88886666-0002-0003-0000-000000000001', 'documents', 'milestone', '33336666-0002-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "AAA priority enabled Hanford construction"}'::jsonb),

-- Interim Committee → recommendation milestone
('document', '88886666-0003-0001-0000-000000000001', 'documents', 'milestone', '33336666-0005-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Trinity Cover Story → Trinity cover-up milestone
('document', '88886666-0003-0003-0000-000000000001', 'documents', 'milestone', '33336666-0004-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('document', '88886666-0003-0003-0000-000000000001', 'documents', 'milestone', '33336666-0003-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- Atomic Energy Act → post-war milestones
('document', '88886666-0004-0001-0000-000000000001', 'documents', 'milestone', '33336666-0006-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),
('document', '88886666-0004-0001-0000-000000000001', 'documents', 'milestone', '33336666-0006-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{}'::jsonb),

-- ============================================
-- ADDITIONAL MILESTONE → MILESTONE CAUSAL EDGES
-- ============================================

-- Goal 1: Organizational chain
('milestone', '33336666-0001-0003-0000-000000000001', 'enabled', 'milestone', '33336666-0001-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Advisory Committee led to OSRD creation"}'::jsonb),
('milestone', '33336666-0001-0004-0000-000000000001', 'enabled', 'milestone', '33336666-0001-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "OSRD enabled NAS feasibility study"}'::jsonb),
('milestone', '33336666-0001-0005-0000-000000000001', 'enabled', 'milestone', '33336666-0001-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "NAS report led to FDR full authorization"}'::jsonb),
('milestone', '33336666-0001-0006-0000-000000000001', 'enabled', 'milestone', '33336666-0004-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "FDR authorization led to Manhattan Engineer District"}'::jsonb),

-- Goal 2: Production chain - Uranium
('milestone', '33336666-0002-0003-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Oak Ridge site enabled Y-12 construction"}'::jsonb),
('milestone', '33336666-0002-0003-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Oak Ridge site enabled K-25 construction"}'::jsonb),
('milestone', '33336666-0002-0009-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Silver procurement enabled calutron construction"}'::jsonb),
('milestone', '33336666-0002-0006-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0014-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Y-12 calutrons produced Little Boy uranium"}'::jsonb),

-- Goal 2: Production chain - Plutonium
('milestone', '33336666-0002-0001-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Plutonium discovery led to fissile confirmation"}'::jsonb),
('milestone', '33336666-0002-0002-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Pu-239 fissility confirmed led to Hanford site selection"}'::jsonb),
('milestone', '33336666-0002-0005-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Hanford selection enabled B Reactor construction"}'::jsonb),
('milestone', '33336666-0002-0010-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0011-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "B Reactor completion led to xenon crisis"}'::jsonb),
('milestone', '33336666-0002-0011-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0012-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Xenon solution enabled plutonium production"}'::jsonb),
('milestone', '33336666-0002-0012-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0013-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Plutonium production enabled delivery to Los Alamos"}'::jsonb),

-- Goal 3: Weapons development chain
('milestone', '33336666-0003-0001-0000-000000000001', 'enabled', 'milestone', '33336666-0003-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Los Alamos site selection enabled lab opening"}'::jsonb),
('milestone', '33336666-0003-0002-0000-000000000001', 'enabled', 'milestone', '33336666-0003-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Oppenheimer appointment enabled lab operations"}'::jsonb),
('milestone', '33336666-0003-0003-0000-000000000001', 'enabled', 'milestone', '33336666-0003-0004-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Lab opening enabled gun-type design work"}'::jsonb),
('milestone', '33336666-0003-0003-0000-000000000001', 'enabled', 'milestone', '33336666-0003-0005-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Lab opening enabled implosion research"}'::jsonb),
('milestone', '33336666-0003-0007-0000-000000000001', 'enabled', 'milestone', '33336666-0003-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Crash implosion program led to explosive lens perfection"}'::jsonb),
('milestone', '33336666-0003-0008-0000-000000000001', 'enabled', 'milestone', '33336666-0003-0009-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Explosive lens success enabled Trinity site preparation"}'::jsonb),
('milestone', '33336666-0003-0009-0000-000000000001', 'enabled', 'milestone', '33336666-0003-0010-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Trinity site ready enabled the test"}'::jsonb),

-- Goal 3: Deployment chain
('milestone', '33336666-0002-0014-0000-000000000001', 'enabled', 'milestone', '33336666-0003-0011-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Uranium core completion enabled Little Boy assembly"}'::jsonb),
('milestone', '33336666-0002-0013-0000-000000000001', 'enabled', 'milestone', '33336666-0003-0012-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Plutonium delivery enabled Fat Man assembly"}'::jsonb),
('milestone', '33336666-0003-0011-0000-000000000001', 'enabled', 'milestone', '33336666-0005-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Little Boy assembly enabled Hiroshima mission"}'::jsonb),
('milestone', '33336666-0003-0012-0000-000000000001', 'enabled', 'milestone', '33336666-0005-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Fat Man assembly enabled Nagasaki mission"}'::jsonb),

-- Goal 5: End War chain
('milestone', '33336666-0005-0001-0000-000000000001', 'enabled', 'milestone', '33336666-0005-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Target Committee fed into Interim Committee"}'::jsonb),
('milestone', '33336666-0005-0002-0000-000000000001', 'enabled', 'milestone', '33336666-0005-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Interim Committee recommendation led to bombing order"}'::jsonb),
('milestone', '33336666-0005-0005-0000-000000000001', 'enabled', 'milestone', '33336666-0005-0006-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Potsdam ultimatum set stage for bombing order"}'::jsonb),
('milestone', '33336666-0005-0006-0000-000000000001', 'enabled', 'milestone', '33336666-0005-0007-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Bombing order authorized Hiroshima"}'::jsonb),

-- Cross-goal connections
('milestone', '33336666-0001-0008-0000-000000000001', 'led_to', 'milestone', '33336666-0005-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Germany surrender shifted focus to Japan"}'::jsonb),
('milestone', '33336666-0002-0004-0000-000000000001', 'enabled', 'milestone', '33336666-0002-0008-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "CP-1 success proved reactor feasibility for Hanford"}'::jsonb),

-- Goal 6: Post-war transition
('milestone', '33336666-0005-0009-0000-000000000001', 'enabled', 'milestone', '33336666-0006-0001-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "War end enabled transition to civilian control"}'::jsonb),
('milestone', '33336666-0006-0001-0000-000000000001', 'enabled', 'milestone', '33336666-0006-0002-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Atomic Energy Act created the AEC"}'::jsonb),
('milestone', '33336666-0006-0001-0000-000000000001', 'enabled', 'milestone', '33336666-0006-0003-0000-000000000001', '66666666-6666-6666-6666-666666666666', '{"description": "Atomic Energy Act enabled National Lab system"}'::jsonb);

-- ============================================
-- COMPLETION NOTICE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'THE MANHATTAN PROJECT - v1.1';
  RAISE NOTICE '"Now I am become Death, the destroyer of worlds"';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'ENTITY COUNTS:';
  RAISE NOTICE '  - 6 Goals';
  RAISE NOTICE '  - 51 Milestones';
  RAISE NOTICE '  - 16 Plans';
  RAISE NOTICE '  - 24 Tasks';
  RAISE NOTICE '  - 10 Decisions';
  RAISE NOTICE '  - 10 Risks';
  RAISE NOTICE '  - 12 Documents';
  RAISE NOTICE '  - 200+ Edges (fully connected graph)';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'EDGE TYPES:';
  RAISE NOTICE '  - Project -> Goals: 6';
  RAISE NOTICE '  - Goals -> Milestones: 51';
  RAISE NOTICE '  - Plans -> Tasks: 24';
  RAISE NOTICE '  - Plans -> Milestones: 28';
  RAISE NOTICE '  - Decisions -> Milestones: 15';
  RAISE NOTICE '  - Documents -> Milestones: 16';
  RAISE NOTICE '  - Risks -> Plans/Milestones: 12';
  RAISE NOTICE '  - Milestone -> Milestone (causal): 40+';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'KEY DATES:';
  RAISE NOTICE '  - Aug 2, 1939: Einstein-Szilard Letter';
  RAISE NOTICE '  - Dec 2, 1942: Chicago Pile-1 Critical';
  RAISE NOTICE '  - Jul 16, 1945: Trinity Test (21 kt)';
  RAISE NOTICE '  - Aug 6, 1945: Hiroshima (15 kt)';
  RAISE NOTICE '  - Aug 9, 1945: Nagasaki (21 kt)';
  RAISE NOTICE '  - Aug 15, 1945: Japan Surrenders';
  RAISE NOTICE '==============================================';
END$$;

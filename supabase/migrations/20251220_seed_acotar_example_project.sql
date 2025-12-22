-- supabase/migrations/20251220_seed_acotar_example_project.sql
-- ============================================
-- Sarah J. Maas: A Court of Thorns and Roses (ACOTAR) Writing Project
-- "To the dreamers who found their wings"
-- ============================================
-- Version 1.0 - The Court of Dreams Edition (Superfan Approved)
--
-- DESIGN PRINCIPLE: This graph is deeply nested (like the layers of Prythian's courts).
-- - Goals connect to Project
-- - Milestones connect to Goals
-- - Plans connect to Milestones
-- - Tasks connect to Plans/Milestones
-- - Decisions/Risks connect to Milestones
-- - Documents connect to Milestones
--
-- SCOPE: 2009 (initial writing) → 2025+ (still expanding the universe)
-- Originally a "passion project" written during Throne of Glass development.
-- Now 38+ million copies sold, 8.5 billion TikTok views, cultural phenomenon.
--
-- DEDICATION: This is a celebration of the series that launched a thousand
-- bat-boys, made "mate" a loaded word, and taught us all that there are
-- different kinds of strength.
--
-- KEY DATES FOR SUPERFANS:
-- - 2002: SJM begins writing Throne of Glass at age 16 on FictionPress
-- - 2009: Begins writing ACOTAR as a "passion project"
-- - Dec 2008: Signs with agent Tamar Rydzinski after manuscript revision
-- - Aug 2012: Throne of Glass published by Bloomsbury
-- - May 2015: A Court of Thorns and Roses published (ACOTAR)
-- - May 2016: A Court of Mist and Fury published (ACOMAF) - THE PIVOT
-- - May 2017: A Court of Wings and Ruin published (ACOWAR)
-- - Dec 2018: A Court of Frost and Starlight published (ACOFAS)
-- - Feb 2021: A Court of Silver Flames published (ACOSF) - Nesta's book
-- - Mar 2021: Hulu announces ACOTAR TV adaptation with Ronald D. Moore
-- - Jan 2024: House of Flame and Shadow multiverse crossover with Crescent City
-- - Jul 2024: Ronald D. Moore leaves ACOTAR TV project
-- - Mar 2025: Hulu cancels ACOTAR TV adaptation
-- - Jul 2025: ACOTAR Book 6 first draft completed
--
-- FAIRY TALE INSPIRATIONS:
-- - Book 1: Beauty and the Beast, East of the Sun/West of the Moon, Tam Lin
-- - Book 2: Hades and Persephone, The Twelve Dancing Princesses
-- - Book 3: War epics, Trojan War elements
-- - Book 5: Nesta's healing journey, chosen family tropes
--
-- ICONIC QUOTES ENCODED HEREIN:
-- - "I was not a pet, not a doll, not an animal. I was a survivor."
-- - "Don't let the hard days win."
-- - "To the stars who listen—and the dreams that are answered."
-- - "I am the rock against which the darkness breaks."
-- - "Feyre darling..."
-- - "Feyre, with the Cauldron's blessing, will you marry me?"
-- - "Hello, Feyre darling."
-- - "I have no regrets in my life, but this. That we did not have time."
--
-- EASTER EGGS FOR TRUE FANS:
-- - The Inner Circle: Rhysand, Cassian, Azriel, Mor, Amren
-- - The Archeron Sisters: Feyre (huntress), Nesta (fire), Elain (seer)
-- - The Courts: Night, Spring, Summer, Autumn, Winter, Dawn, Day
-- - The Lost Dusk Court and the Prison connection
-- - Velaris: The hidden City of Starlight
-- - The Court of Nightmares vs Court of Dreams
-- - Tiktok's #ACOTAR: 8.5 billion views
-- - The mate bond reveal that broke the internet
-- - Tamlin's fall from hero to cautionary tale
-- - The multiverse connection to Throne of Glass and Crescent City
-- - The eight-pointed star mystery
-- - Azriel's shadows that soften around Gwyn
-- - WordStar 4.0 → Microsoft Word (SJM's upgrade from GRRM territory)

-- ============================================
-- CLEANUP (for idempotent re-runs)
-- ============================================
DELETE FROM onto_edges WHERE project_id = '55555555-5555-5555-5555-555555555555';
DELETE FROM onto_tasks WHERE project_id = '55555555-5555-5555-5555-555555555555';
DELETE FROM onto_documents WHERE project_id = '55555555-5555-5555-5555-555555555555';
DELETE FROM onto_decisions WHERE project_id = '55555555-5555-5555-5555-555555555555';
DELETE FROM onto_risks WHERE project_id = '55555555-5555-5555-5555-555555555555';
DELETE FROM onto_plans WHERE project_id = '55555555-5555-5555-5555-555555555555';
DELETE FROM onto_milestones WHERE project_id = '55555555-5555-5555-5555-555555555555';
DELETE FROM onto_goals WHERE project_id = '55555555-5555-5555-5555-555555555555';
DELETE FROM onto_projects WHERE id = '55555555-5555-5555-5555-555555555555';

-- ============================================
-- PROJECT
-- ============================================
INSERT INTO onto_projects (id, org_id, name, description, type_key, state_key, props, start_at, end_at, is_public, created_by)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  NULL,
  'A Court of Thorns and Roses: The Writing',
  'Sarah J. Maas''s genre-defining fantasy romance series, born as a "passion project" during the development of Throne of Glass. What began as a Beauty and the Beast retelling evolved into a five-book saga (and counting) that has sold over 75 million copies worldwide across all languages (55+ million in English alone), generated 8.5 billion TikTok views under #ACOTAR alone, and fundamentally reshaped the publishing industry''s understanding of "romantasy." Bloomsbury reported a staggering 161% increase in Maas sales for FY 2023-24, cementing her as the driving force behind modern fantasy romance. The series follows Feyre Archeron from mortal huntress to High Lady of the Night Court, exploring themes of trauma recovery, found family, female agency, and the transformative power of love. Along the way, Maas created Prythian—a realm of seven fae courts, each with distinct magic and politics—and an ensemble cast that launched a thousand fan theories about mates, shadows, and what really happened at the Starfall. From the iconic twist that transformed Rhysand from apparent villain to beloved hero, to Nesta''s brutally honest healing journey, ACOTAR became the standard against which modern fantasy romance is measured. And somewhere, on BookTok, someone is still crying about the "To the stars who listen" scene.',
  'project.creative.writing',
  'active',
  '{
    "author": "Sarah J. Maas",
    "nickname": "SJM",
    "full_name": "Sarah Janet Maas",
    "born": "March 5, 1986",
    "age_at_project_start": 23,
    "current_age": 39,
    "residence": "Pennsylvania, USA",
    "genre": "Fantasy Romance (Romantasy)",
    "original_plan": "Beauty and the Beast retelling",
    "current_plan": "6+ books, multiverse connections",
    "books_published": 5,
    "books_in_progress": 1,
    "books_planned": "4+ more ACOTAR books confirmed",
    "total_pages_published": 3900,
    "husband": "Josh Maas (high school sweetheart)",
    "son": "Born 2021",
    "famous_quotes": [
      "To the stars who listen—and the dreams that are answered.",
      "Don''t let the hard days win.",
      "I was not a pet, not a doll, not an animal. I was a survivor.",
      "There are different kinds of strength.",
      "Feyre darling.",
      "You are my salvation, Feyre.",
      "My mate. My mate. My mate."
    ],
    "publisher": "Bloomsbury Publishing",
    "copies_sold": "75+ million worldwide (55M+ English)",
    "bloomsbury_impact": "161% Maas sales increase FY 2023-24",
    "tiktok_views": "8.5 billion under #ACOTAR",
    "goodreads_ratings": "5+ million",
    "subreddit_members": "100K+ r/acotar",
    "multiverse_series": ["Throne of Glass", "Crescent City", "ACOTAR"],
    "writing_process": {
      "style": "Primarily pantser with flexibility for outlines",
      "daily_word_goal": "1,000+ words minimum",
      "daily_hours": "5-7 hours in production mode",
      "morning_routine": "Wake 5-6 AM, admin tasks first 30-45 min",
      "tools": ["Microsoft Word", "Printed editorial letters", "Handwritten notes"],
      "environment": "Dedicated office, fandom t-shirts, soft blankets",
      "block_breaker": "Journaling/stream-of-consciousness free writing",
      "physical_practice": "Mirror practice for fight scenes and expressions"
    },
    "graph_depth": 6
  }'::jsonb,
  '2009-01-01',
  NULL,
  TRUE,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GOALS (7 Strategic Objectives)
-- ============================================
INSERT INTO onto_goals (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Goal 1: Write the Original ACOTAR
('55555555-0001-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Write A Court of Thorns and Roses', 'goal.strategic.foundation', 'achieved',
 '{"priority": "critical", "state": "achieved", "original_plan": "Beauty and the Beast retelling with fae", "inspiration": ["Beauty and the Beast", "East of the Sun and West of the Moon", "Tam Lin"], "writing_period": "2009-2015", "pages": 416, "key_innovation": "Subverting fairy tale expectations - the beast is not the true love interest", "timeline": "6 years from concept to publication"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 2: The ACOMAF Revolution
('55555555-0002-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Transform the Series with A Court of Mist and Fury', 'goal.strategic.expansion', 'achieved',
 '{"priority": "critical", "state": "achieved", "pivot": "Complete love interest switch from Tamlin to Rhysand", "inspiration": ["Hades and Persephone", "Twelve Dancing Princesses"], "key_themes": ["Trauma recovery", "Found family", "Reclaiming agency"], "pages": 624, "cultural_impact": "Redefined romantasy genre expectations", "fan_reaction": "The book that broke the internet", "goodreads_choice_award": "Best YA Fantasy 2016"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 3: Complete the Original Trilogy
('55555555-0003-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Complete the Trilogy with A Court of Wings and Ruin', 'goal.strategic.primary', 'achieved',
 '{"priority": "critical", "state": "achieved", "focus": "War with Hybern, uniting the courts", "pages": 699, "key_events": ["War against King of Hybern", "Feyre becomes High Lady", "Nesta and Elain Made", "Father redemption arc"], "timeline": "Published May 2017"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 4: Expand with New Perspectives
('55555555-0004-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Continue the Series with Nesta''s Story', 'goal.strategic.expansion', 'achieved',
 '{"priority": "high", "state": "achieved", "books": ["A Court of Frost and Starlight (2018)", "A Court of Silver Flames (2021)"], "new_protagonist": "Nesta Archeron", "themes": ["Healing from trauma", "Self-acceptance", "Found sisterhood with Gwyn and Emerie"], "key_innovations": ["Valkyrie training arc", "House of Wind sentient house", "Cassian romance"], "goodreads_choice_award": "Best Fantasy 2021"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 5: Build the World of Prythian
('55555555-0005-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Develop the Prythian Worldbuilding System', 'goal.strategic.creative', 'achieved',
 '{"priority": "high", "state": "achieved", "courts_created": ["Night", "Spring", "Summer", "Autumn", "Winter", "Dawn", "Day", "Dusk (extinct)"], "magic_systems": ["High Lord powers", "Daemati abilities", "Illyrian siphons", "Cauldron magic", "Mate bonds"], "locations": ["Velaris", "Hewn City", "Spring Court manor", "Under the Mountain", "The Prison"], "factions": ["Inner Circle", "Archeron sisters", "Court of Nightmares", "Hybern forces"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 6: Cultural Phenomenon
('55555555-0006-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Build the ACOTAR Fandom and Cultural Impact', 'goal.strategic.community', 'achieved',
 '{"priority": "medium", "state": "achieved", "booktok_views": "8.5 billion", "copies_sold": "38+ million", "tattoo_trend": "Eight-pointed star, Night Court constellation", "merchandise": "Extensive licensed and fan-made", "fan_theories": ["Azriel/Gwyn vs Azriel/Elain", "Eris redemption arc", "Elain villain theory", "Mor''s full power reveal"], "cultural_moments": ["The Rhysand reveal twist", "To the stars quote phenomenon", "Mate bond discourse"], "publisher_impact": "Bloomsbury 79% sales increase 2023"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 7: The Future
('55555555-0007-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Plan the Future of ACOTAR', 'goal.strategic.legacy', 'active',
 '{"priority": "ultimate", "state": "active", "book_6": {"first_draft_completed": "July 2025", "likely_focus": "Elain or Azriel", "estimated_length": "Long - SJM confirmed", "expected_release": "Early 2026"}, "books_planned": "4+ more ACOTAR books confirmed by SJM", "multiverse_expansion": "Connection to Crescent City established in House of Flame and Shadow", "tv_adaptation": {"status": "Canceled by Hulu March 2025", "future": "SJM shopping to other networks"}, "remaining_mysteries": ["Elain''s seer powers", "Azriel''s mate", "Mor''s full power", "Koschei threat", "Dusk Court history"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 8: Secondary Character Arcs (NEW)
('55555555-0008-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Develop Secondary Character Arcs', 'goal.strategic.ensemble', 'achieved',
 '{"priority": "high", "state": "achieved", "characters": ["Lucien Vanserra", "Tamlin", "Azriel", "Amren", "Morrigan"], "significance": "Rich secondary characters drive fan engagement and theories", "arcs_complete": ["Lucien''s journey from Spring to Night", "Tamlin''s fall", "Amren''s sacrifice and rebirth"], "arcs_ongoing": ["Azriel''s mate mystery", "Mor''s full power reveal", "Lucien''s Day Court heritage"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MILESTONES - GOAL 1: A Court of Thorns and Roses (2009-2015)
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, state_key, due_at, props, created_by) VALUES
('55555555-0001-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'The Vision of Prythian', 'milestone.creative.inception', 'completed', '2009-01-01'::timestamptz,
 '{"state": "achieved", "description": "While developing Throne of Glass, SJM begins writing ACOTAR as a passion project", "initial_concept": "Beauty and the Beast retelling with fae", "inspiration_moment": "Wanted to explore what happens AFTER the fairy tale kiss", "key_question": "What if the love story is just the beginning of the real conflict?", "side_project": true}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Feyre Archeron Created', 'milestone.creative.character', 'completed', '2009-06-01'::timestamptz,
 '{"state": "achieved", "character": "Feyre Archeron", "age": 19, "role": "Protagonist, later High Lady", "initial_concept": "Mortal huntress supporting her family", "evolution": "From survivor to High Lady of Night Court", "name_meaning": "Feyre pronounced FAY-ruh", "key_traits": ["Artist", "Huntress", "Survivor", "Deeply loyal"], "sisters": ["Nesta (eldest)", "Elain (middle)"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'The Seven Courts Designed', 'milestone.creative.worldbuilding', 'completed', '2010-01-01'::timestamptz,
 '{"state": "achieved", "courts": {"Seasonal": ["Spring", "Summer", "Autumn", "Winter"], "Solar": ["Night", "Day", "Dawn"]}, "lost_court": "Dusk Court - destroyed, connected to The Prison", "structure": "Each ruled by a High Lord with inherited powers", "key_innovation": "Night Court as morally complex, not evil", "wall": "Magical barrier separating mortal and fae lands"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Tamlin and Rhysand Created', 'milestone.creative.character', 'completed', '2010-06-01'::timestamptz,
 '{"state": "achieved", "tamlin": {"role": "High Lord of Spring Court", "initial_role": "Love interest", "mask_curse": "Trapped in permanent mask by Amarantha", "shape_shifter": true, "tragic_flaw": "Overprotection becomes control"}, "rhysand": {"role": "High Lord of Night Court", "initial_presentation": "Villain/antagonist", "hidden_truth": "Actually protecting everyone", "powers": ["Daemati (mind reading)", "Darkness manipulation", "Most powerful High Lord ever"], "plan": "Secret hero all along"}}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Under the Mountain Concept', 'milestone.creative.plot', 'completed', '2011-01-01'::timestamptz,
 '{"state": "achieved", "villain": "Amarantha - Queen Under the Mountain", "threat": "Enslaved all High Lords for 49 years", "trials": "Three deadly tasks for Feyre", "riddle": "What demands an answer but asks no question? (Love)", "key_moments": ["Clare Beddor tortured as warning", "Rhysand helps Feyre secretly", "Feyre solves riddle", "Feyre dies and is resurrected by all High Lords"], "resurrection": "Feyre becomes High Fae with all seven High Lord powers"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Throne of Glass Published', 'milestone.business.prior_success', 'completed', '2012-08-07'::timestamptz,
 '{"state": "achieved", "significance": "SJM establishes herself as fantasy author", "publisher": "Bloomsbury", "impact_on_acotar": "Publisher confidence for ACOTAR deal", "writing_approach_refined": "Learned from ToG revision process", "agent": "Tamar Rydzinski"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'ACOTAR Manuscript Completed', 'milestone.creative.draft', 'completed', '2014-06-01'::timestamptz,
 '{"state": "achieved", "draft_number": "Multiple revisions", "word_count": "~110,000 words", "pov": "First person Feyre", "genre_classification": "YA Fantasy/New Adult crossover", "sexual_content_negotiation": "SJM fought to keep mature content uncensored", "editor": "Worked extensively with Bloomsbury team"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'A Court of Thorns and Roses Published', 'milestone.publication.book1', 'completed', '2015-05-05'::timestamptz,
 '{"state": "achieved", "publisher": "Bloomsbury", "pages": 416, "chapters": 46, "pov": "Feyre Archeron (first person)", "dedication": "For Josh—the love of my life", "cover": "Rose with thorns design", "initial_reception": "Strong but not phenomenon level yet", "fairy_tale_basis": ["Beauty and the Beast", "East of the Sun West of the Moon", "Tam Lin"], "ending_twist": "Rhysand claims his bargain with Feyre"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 2: A Court of Mist and Fury (2015-2016)
-- ============================================
('55555555-0002-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'The Pivot Decision', 'milestone.creative.decision', 'completed', '2015-06-01'::timestamptz,
 '{"state": "achieved", "description": "SJM decides to make Rhysand the true love interest", "boldness": "Complete subversion of Book 1 romance", "risk": "Alienating readers invested in Tamlin", "inspiration": "Hades and Persephone myth", "key_insight": "Tamlin''s protection becomes imprisonment", "rhysand_development": "Villain revealed as traumatized hero"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0002-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'The Inner Circle Created', 'milestone.creative.ensemble', 'completed', '2015-08-01'::timestamptz,
 '{"state": "achieved", "members": {"Rhysand": "High Lord, Daemati, most powerful", "Cassian": "General of armies, Illyrian warrior, 7 siphons", "Azriel": "Spymaster, Shadowsinger, scarred hands", "Mor": "Truth power, escaped Court of Nightmares", "Amren": "Ancient being, formerly imprisoned, speaks all languages"}, "dynamic": "Found family, centuries of loyalty", "location": "Velaris - hidden City of Starlight", "innovation": "Male characters with emotional depth and healthy masculinity"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0002-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Velaris Worldbuilding', 'milestone.creative.worldbuilding', 'completed', '2015-09-01'::timestamptz,
 '{"state": "achieved", "name": "Velaris - The City of Starlight", "hidden_for": "5000+ years", "concealment": "Ancient High Lord blood magic", "locations": {"Rainbow": "Artistic quarter", "House_of_Wind": "Mountain residence", "Sidra_River": "Sapphire blue river through city", "Palace_of_Bone_and_Salt": "Court of Nightmares below"}, "culture": "Art, music, freedom - opposite of Night Court reputation", "contrast": "Court of Dreams vs Court of Nightmares"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0002-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Feyre''s PTSD Arc Written', 'milestone.creative.theme', 'completed', '2015-10-01'::timestamptz,
 '{"state": "achieved", "portrayal": "Authentic trauma recovery", "symptoms": ["Nightmares", "Panic attacks", "Emotional numbness", "Flashbacks", "Physical deterioration"], "healing_through": ["Rhysand''s patience", "Learning to read", "Art therapy in Rainbow", "Training powers", "Found family"], "critical_acclaim": "Praised for realistic mental health representation", "tamlin_contrast": "His protection becomes retraumatizing"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0002-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'The Mate Bond Reveal Written', 'milestone.creative.romance', 'completed', '2015-12-01'::timestamptz,
 '{"state": "achieved", "scene": "Feyre realizes Rhysand is her true mate", "location": "During Calanmai/Starfall celebration", "fan_reaction": "Broke the internet", "quote": "My mate. My mate. My mate.", "significance": "Redefined the concept of destined love in fantasy", "contrast": "vs Tamlin bond (toxic, controlling)", "aftermath": "Massive fandom pivot to Rhysand"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0002-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'A Court of Mist and Fury Published', 'milestone.publication.book2', 'completed', '2016-05-03'::timestamptz,
 '{"state": "achieved", "publisher": "Bloomsbury", "pages": 624, "chapters": 65, "pov": "Feyre Archeron (first person)", "dedication": "For my mom, who taught me to believe in fairy tales", "cultural_impact": "Transformed the romantasy genre", "goodreads_choice_award": "Best YA Fantasy & Sci-Fi 2016", "key_quote": "To the stars who listen—and the dreams that are answered.", "iconic_moments": ["Starfall scene", "Mate bond reveal", "Feyre learns to read", "First flight with Rhysand", "Under the Mountain flashbacks"], "fairy_tale_basis": ["Hades and Persephone", "Twelve Dancing Princesses"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 3: A Court of Wings and Ruin (2016-2017)
-- ============================================
('55555555-0003-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'War Plot Development', 'milestone.creative.plot', 'completed', '2016-06-01'::timestamptz,
 '{"state": "achieved", "antagonist": "King of Hybern", "goal": "Destroy the Wall, conquer mortal and fae lands", "weapon": "The Cauldron - primordial magic object", "allies": {"hybern": ["Jurian (resurrected)", "Ianthe (traitor priestess)", "Tamlin (manipulated)"]}, "defenders": "All seven courts united (eventually)", "stakes": "Survival of both worlds"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Nesta and Elain Made', 'milestone.creative.character', 'completed', '2016-08-01'::timestamptz,
 '{"state": "achieved", "event": "Archeron sisters forced into Cauldron", "nesta": {"powers": "Cauldron-Made, took power from Cauldron itself", "reaction": "Rage, trauma, depression", "later_arc": "Valkyrie training, Cassian mate bond"}, "elain": {"powers": "Seer abilities", "reaction": "Broken, withdrawn", "later_arc": "Mate bond with Lucien, mysterious future"}, "significance": "Sets up books 4-6 story arcs"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'First Female High Lady', 'milestone.creative.theme', 'completed', '2016-10-01'::timestamptz,
 '{"state": "achieved", "moment": "Rhysand names Feyre High Lady of the Night Court", "significance": "First in Prythian history", "quote": "There are different kinds of strength", "symbolism": "Power shared equally between partners", "fan_reaction": "Iconic feminist moment", "political_impact": "Other courts skeptical but cannot deny"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Battle Against Hybern Written', 'milestone.creative.climax', 'completed', '2016-12-01'::timestamptz,
 '{"state": "achieved", "location": "Multiple fronts across Prythian", "key_battles": ["Spring Court infiltration", "Summer Court defense", "Final battle at the Wall"], "casualties": {"major_deaths": ["Mr. Archeron (father)", "Hybern King"]}, "father_redemption": "Archeron father dies protecting daughters", "resolution": "Wall destroyed but peace achieved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'A Court of Wings and Ruin Published', 'milestone.publication.book3', 'completed', '2017-05-02'::timestamptz,
 '{"state": "achieved", "publisher": "Bloomsbury", "pages": 699, "chapters": 80, "pov": "Feyre Archeron (first person)", "dedication": "For my father, who taught me strength", "conclusion": "Original trilogy complete", "open_threads": ["Nesta''s trauma", "Elain''s powers", "Mor''s secret", "Koschei threat"], "key_quote": "Be happy, Feyre."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ACOWAR Spy Mission Arc (New milestones for Book 3 plot)
('55555555-0003-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Feyre''s Spring Court Spy Mission', 'milestone.plot.espionage', 'completed', '2017-01-01'::timestamptz,
 '{"state": "achieved", "description": "Feyre goes undercover in Spring Court, pretending Rhysand manipulated her", "objectives": ["Gather intel on Hybern forces", "Sabotage Tamlin from within", "Sow discord among Spring Court"], "tactics": ["Undermining Tamlin''s authority", "Exposing his brutality to servants", "Nudging sentries to doubt him"], "key_intel": ["Hybern troop numbers", "Invasion routes", "Foreign allies"], "duration": "First third of ACOWAR"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Conflict with Ianthe', 'milestone.plot.antagonist', 'completed', '2017-01-15'::timestamptz,
 '{"state": "achieved", "villain": "Ianthe - traitor priestess aligned with Hybern", "threat": "Suspicious of Feyre, power-hungry, dangerous", "schemes": ["Using Hybern visit for power", "Wall-scouting manipulation"], "outcome": "Feyre outmaneuvers her schemes while maintaining cover"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Hybern Twins Arrive at Spring Court', 'milestone.plot.threat', 'completed', '2017-02-01'::timestamptz,
 '{"state": "achieved", "characters": {"Dagdan": "Hybern prince", "Brannagh": "Hybern princess"}, "with": "Jurian (resurrected general)", "purpose": "Staging point for Prythian invasion", "feyre_role": "Gathers crucial war intelligence through them", "revelation": "They plan to kill Lucien and have been poisoning everyone''s food"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Escape from Spring Court with Lucien', 'milestone.plot.escape', 'completed', '2017-02-15'::timestamptz,
 '{"state": "achieved", "trigger": "Dagdan and Brannagh reveal murder plans", "action": "Feyre and Lucien kill the twins", "complication": "Magic fading from poison in food", "journey": "Flee north through Autumn Court", "danger": "Evade Lucien''s hostile family", "destination": "Night Court territory", "outcome": "Feyre reunites with Rhys, debriefs Inner Circle"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'High Lords'' Meeting', 'milestone.plot.alliance', 'completed', '2017-03-01'::timestamptz,
 '{"state": "achieved", "purpose": "Unite all seven courts against Hybern", "attendees": ["All High Lords of Prythian"], "tensions": ["Old grudges between courts", "Rhysand''s controversial bargains", "Autumn Court enmity"], "discussions": ["Installing Lucien in place of Beron", "Reaching out to Miryam and Drakon"], "outcome": "Fragile alliance formed despite friction"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Miryam and Drakon Alliance', 'milestone.plot.reinforcement', 'completed', '2017-04-01'::timestamptz,
 '{"state": "achieved", "allies": {"Miryam": "Human queen", "Drakon": "Fae prince"}, "location": "Cretea - hidden island with joint human-fae population", "history": "Long history opposing Hybern", "arrival": "Decisive moment in final battle", "significance": "Turned the tide against Hybern''s forces"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Mr. Archeron''s Sacrifice', 'milestone.plot.redemption', 'completed', '2017-04-15'::timestamptz,
 '{"state": "achieved", "character": "Mr. Archeron - Feyre''s father", "arc": "From failed provider to redeemed hero", "journey": "Sought forgiveness, reconnected with daughters", "sacrifice": "Dies protecting his daughters in final battle", "significance": "Redemption through ultimate sacrifice", "emotional_impact": "Major character death, closure for Archeron family trauma"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 4: Nesta's Story (2018-2021)
-- ============================================
('55555555-0004-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Bridge Novel Concept', 'milestone.creative.decision', 'completed', '2017-06-01'::timestamptz,
 '{"state": "achieved", "book": "A Court of Frost and Starlight", "purpose": "Holiday novella bridging original trilogy and Nesta''s story", "format": "Multiple POVs including Rhysand, Cassian, Feyre", "tone": "Lighter, healing-focused", "criticism": "Some fans found it lacking plot", "defense": "Intentional palate cleanser after war trauma"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'A Court of Frost and Starlight Published', 'milestone.publication.novella', 'completed', '2018-05-01'::timestamptz,
 '{"state": "achieved", "publisher": "Bloomsbury", "pages": 229, "format": "Novella", "pov": "Multiple (Feyre, Rhysand, Mor, Cassian)", "setting": "Winter Solstice celebration in Velaris", "purpose": "Post-war healing, setup for ACOSF", "criticism": "Lighter on plot, heavy on domesticity", "seeds_planted": ["Nesta''s spiral", "Cassian longing", "Koschei mention"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Nesta as Protagonist Decision', 'milestone.creative.pivot', 'completed', '2018-06-01'::timestamptz,
 '{"state": "achieved", "decision": "Make Nesta the focus of Book 5", "risk": "Nesta was divisive - many readers disliked her", "opportunity": "Explore trauma recovery from different angle", "approach": "Authentic portrayal of depression, self-destruction, healing", "cassian_pairing": "Slow burn romance as part of healing", "theme": "You are allowed to struggle and still be worthy of love"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'The Valkyrie Concept', 'milestone.creative.innovation', 'completed', '2019-01-01'::timestamptz,
 '{"state": "achieved", "concept": "Ancient female warriors training tradition", "participants": ["Nesta", "Gwyn", "Emerie"], "location": "House of Wind training ring", "rituals": ["Blood Rite", "Valkyrie oaths", "Training regimens"], "significance": "Female friendship as healing force", "fan_favorite": "Gwyn and Emerie became beloved characters"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Cassian and Nesta Romance Written', 'milestone.creative.romance', 'completed', '2019-06-01'::timestamptz,
 '{"state": "achieved", "dynamic": "Enemies to lovers, slow burn", "years_of_tension": "Multiple books of buildup", "key_moment": "Bargain for training sessions", "obstacles": ["Nesta''s self-destruction", "Cassian''s fear of rejection", "Mate bond denial"], "resolution": "Nesta accepts bond, declares love", "fan_reaction": "Intense satisfaction after years of waiting"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'A Court of Silver Flames Published', 'milestone.publication.book5', 'completed', '2021-02-16'::timestamptz,
 '{"state": "achieved", "publisher": "Bloomsbury", "pages": 757, "chapters": 82, "pov": "Nesta Archeron (third person), some Cassian", "dedication": "For the women who fell, who got back up, who found each other", "new_classification": "Moved to Adult Fantasy", "goodreads_choice_award": "Best Fantasy 2021", "key_themes": ["Healing is not linear", "Female friendship", "Self-forgiveness"], "explicit_content": "Significantly more adult content than previous books", "nesta_transformation": "From villain-coded to beloved protagonist"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ACOFAS Winter Solstice Events (Book 4 detailed content)
('55555555-0004-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Winter Solstice Preparations', 'milestone.plot.holiday', 'completed', '2018-04-01'::timestamptz,
 '{"state": "achieved", "setting": "Velaris during holiday season", "activities": ["Inner Circle gift shopping", "Visiting markets", "Encountering Weaver who crafts items"], "traditions": ["Annual snowball fight (Rhysand/Cassian/Azriel)", "Gift exchanges", "Holiday feasts"], "atmosphere": "Post-war healing through celebration"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Polina''s Studio Gift', 'milestone.creative.healing', 'completed', '2018-04-15'::timestamptz,
 '{"state": "achieved", "gift": "Inner Circle gives Feyre Polina''s former art studio", "significance": "Feyre rediscovers painting as healing", "painting_created": "Scene of loved ones under starlight for Rhysand", "symbolism": "Art as therapy, reclaiming identity beyond war"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Nesta''s Spiral Begins', 'milestone.character.descent', 'completed', '2018-04-20'::timestamptz,
 '{"state": "achieved", "discovery": "Feyre finds Nesta in seedy Velaris pub", "behavior": ["Drinking heavily", "Destructive relationships", "Self-isolation"], "invitation": "Feyre offers rent money as incentive for Solstice", "tension": "Nesta reluctantly attends dinner", "climax": "Accepts check instead of tearing it up, leaves early", "setup": "Cassian follows her - seeds ACOSF romance"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Lucien''s Solstice Visit', 'milestone.character.tension', 'completed', '2018-04-25'::timestamptz,
 '{"state": "achieved", "arrival": "Lucien brings Solstice gifts for Feyre and Elain", "rejection": "Elain shows disinterest in their mating bond", "departure": "Lucien leaves for Spring Court", "significance": "Establishes ongoing Lucien/Elain complication", "emotional_weight": "Rejection despite mate bond"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Illyrian Reform Attempts', 'milestone.political.reform', 'completed', '2018-04-10'::timestamptz,
 '{"state": "achieved", "issue": "Female training bans in Illyrian camps", "action": "Rhysand and Cassian address war-camp leaders", "compromise": "Women''s training sessions limited to 90 minutes", "undercurrent": "Rebellion hints among Illyrian warriors", "setup": "Seeds future Illyrian conflict for later books"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Tamlin''s Spring Court Visit', 'milestone.political.diplomacy', 'completed', '2018-04-05'::timestamptz,
 '{"state": "achieved", "visit": "Rhysand visits Tamlin''s abandoned Spring Court twice", "state_of_court": "Decay, abandonment, Tamlin in beast form", "arrangement": "Summer Court guards for human border", "mor_subplot": "Confronts father Keir and Eris in Hewn City over territory grabs", "significance": "Tamlin''s fall from power made visible"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 5: Worldbuilding
-- ============================================
('55555555-0005-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'The Night Court Duality', 'milestone.worldbuilding.complete', 'completed', '2016-05-01'::timestamptz,
 '{"state": "achieved", "structure": {"Court_of_Dreams": "Velaris - art, freedom, starlight", "Court_of_Nightmares": "Hewn City - cruelty, politics, fear"}, "governance": "Rhysand rules both, plays dual roles", "key_insight": "Night Court reputation is deliberate misdirection", "velaris_secret": "Hidden for 5000+ years from all outsiders", "symbolism": "Light within darkness, hope within despair"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0005-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Illyrian Culture Development', 'milestone.worldbuilding.culture', 'completed', '2016-03-01'::timestamptz,
 '{"state": "achieved", "society": "Warrior culture in Night Court mountains", "key_figures": ["Cassian (bastard-born general)", "Azriel (tortured childhood)", "Rhysand (half-Illyrian)"], "features": {"wings": "Membrane wings, can be clipped", "siphons": "Power amplifiers worn by strongest warriors", "war_camps": "Training grounds, often brutal"}, "criticism_addressed": "Series acknowledges Illyrian misogyny as problem to solve"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0005-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'The Cauldron Mythology', 'milestone.worldbuilding.magic', 'completed', '2017-01-01'::timestamptz,
 '{"state": "achieved", "nature": "Primordial magical object that created the world", "powers": ["Create life", "Unmake beings", "Transform mortals to fae"], "corrupted_use": "King of Hybern wields it as weapon", "nesta_connection": "Stole power from Cauldron during transformation", "significance": "Source of Made beings'' power"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0005-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Mate Bonds Lore Established', 'milestone.worldbuilding.romance', 'completed', '2016-05-01'::timestamptz,
 '{"state": "achieved", "definition": "Soul-deep magical bond between fated partners", "manifestation": "Recognized through scent, instinct, or magical signal", "acceptance": "Must be consciously accepted by both parties", "rejection": "Can be rejected but causes pain", "key_couples": ["Rhysand/Feyre", "Cassian/Nesta", "Lucien/Elain (complicated)"], "cultural_impact": "Term mate entered common fan vocabulary"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0005-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'High Lord Powers System', 'milestone.worldbuilding.magic', 'completed', '2015-12-01'::timestamptz,
 '{"state": "achieved", "inheritance": "Power passes to heir upon death", "court_powers": {"Spring": "Growth, shape-shifting", "Summer": "Water manipulation", "Autumn": "Fire", "Winter": "Ice and cold", "Dawn": "Healing, invention", "Day": "Spell-cleaving, light", "Night": "Darkness, dreams, Daemati"}, "feyre_unique": "Received power from all seven during resurrection"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 6: Cultural Phenomenon
-- ============================================
('55555555-0006-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'BookTok Explosion', 'milestone.cultural.viral', 'completed', '2020-06-01'::timestamptz,
 '{"state": "achieved", "platform": "TikTok", "hashtag": "#ACOTAR", "views": "8.5 billion+", "content_types": ["Book reactions", "Cosplay", "Fan art", "Theory videos", "Character analyses", "Fitness challenges (Valkyrie)", "Tattoo reveals"], "demographic": "Primarily women 16-35", "impact": "Major driver of sales resurgence"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0006-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Publisher Sales Surge', 'milestone.business.success', 'completed', '2023-06-01'::timestamptz,
 '{"state": "achieved", "announcement": "Bloomsbury reports 79% sales increase H1 2023", "comparison": "Described as Harry Potter effect", "cause": "BookTok viral spread", "copies_sold": "38+ million worldwide", "formats": ["Hardcover", "Paperback", "Audiobook", "Special editions"], "merchandise": "Licensed products, fan-made items"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0006-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Fan Theory Culture', 'milestone.cultural.engagement', 'completed', '2021-01-01'::timestamptz,
 '{"state": "achieved", "major_theories": {"azriel_mate": ["Gwyn supporters", "Elain supporters", "Evidence wars"], "elain_arc": ["Villain theory", "Tamlin redemption romance", "Spring Court High Lady"], "mor_power": "Banshee-like truth abilities", "eris_redemption": "Secret ally all along"}, "platforms": ["Reddit r/acotar", "Tumblr", "TikTok", "YouTube"], "engagement": "Detailed textual analysis, quote tracking"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0006-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'ACOTAR Tattoo Trend', 'milestone.cultural.expression', 'completed', '2021-06-01'::timestamptz,
 '{"state": "achieved", "popular_designs": ["Eight-pointed star", "Night Court constellation", "To the stars who listen quote", "Inner Circle symbols", "Mountain and stars"], "significance": "Physical embodiment of fandom identity", "community": "Fans bond over shared tattoos", "locations": "Often wrist, forearm, back"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 7: The Future
-- ============================================
('55555555-0007-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Multiverse Reveal with Crescent City', 'milestone.creative.crossover', 'completed', '2024-01-30'::timestamptz,
 '{"state": "achieved", "book": "House of Flame and Shadow (Crescent City Book 3)", "event": "Bryce Quinlan travels to Prythian", "connections": ["Eight-pointed star symbol", "Shared magical history", "Nesta and Azriel appearances", "Truth-Teller dagger"], "fan_reaction": "Excitement mixed with continuity questions", "implications": "Three series share one megaverse"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0007-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'TV Adaptation Announced (Hulu)', 'milestone.business.adaptation', 'completed', '2021-03-01'::timestamptz,
 '{"state": "achieved", "network": "Hulu", "showrunner": "Ronald D. Moore (Outlander creator)", "sjm_role": "Co-adapter, heavily involved", "work_schedule": "4 hours daily Zoom calls with Moore", "format": "TV series adaptation of Book 1", "fan_excitement": "Massive anticipation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0007-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Ronald D. Moore Departs', 'milestone.business.setback', 'completed', '2024-07-01'::timestamptz,
 '{"state": "achieved", "reason": "Moore returned to Sony projects", "impact": "Major blow to adaptation momentum", "fan_reaction": "Concern but continued hope", "status": "Project in limbo"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0007-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Hulu Cancels ACOTAR Adaptation', 'milestone.business.cancellation', 'completed', '2025-03-01'::timestamptz,
 '{"state": "achieved", "announcement": "Hulu officially cancels adaptation", "reason": "Creative and business challenges post-Moore departure", "sjm_response": "Will shop adaptation to other networks", "fan_reaction": "Disappointment but not surprise", "future": "Other networks potentially interested"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Book 6 First Draft Completed', 'milestone.creative.progress', 'completed', '2025-07-15'::timestamptz,
 '{"state": "achieved", "announcement": "SJM Instagram announcement", "length": "Long book - SJM confirmed", "likely_focus": "Elain or Azriel POV expected", "mysteries_to_address": ["Elain''s seer powers", "Azriel''s mate", "Koschei threat"], "publication": "Estimated early 2026", "fan_reaction": "Excitement after 4+ year wait since ACOSF"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- SUB-MILESTONES: Under the Mountain Events
-- ============================================
('55552222-0001-0005-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'First Trial: The Wyrm', 'milestone.plot.trial', 'completed', '2015-05-05'::timestamptz,
 '{"state": "achieved", "task": "Kill the Middengard Wyrm in underground tunnels", "danger": "Massive worm creature in complete darkness", "injury": "Feyre badly wounded", "rhysand_role": "Secretly helps Feyre heal afterward", "bargain": "Feyre owes one week per month to Rhysand"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55552222-0001-0005-0002-000000000001', '55555555-5555-5555-5555-555555555555',
 'Second Trial: The Riddle Challenge', 'milestone.plot.trial', 'completed', '2015-05-05'::timestamptz,
 '{"state": "achieved", "task": "Solve impossible riddle within time limit", "riddle": "What demands an answer but asks no question?", "answer": "Love", "near_failure": "Feyre struggles with literacy", "symbolism": "Feyre cannot read - barrier to knowledge and power"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55552222-0001-0005-0003-000000000001', '55555555-5555-5555-5555-555555555555',
 'Third Trial: Kill the Innocents', 'milestone.plot.trial', 'completed', '2015-05-05'::timestamptz,
 '{"state": "achieved", "task": "Kill two fae with a knife", "twist": "Feyre stabs them but Amarantha intended cruel death regardless", "revelation": "Victims were already dying from earlier torture", "moral_weight": "Feyre carries guilt despite circumstances"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55552222-0001-0005-0004-000000000001', '55555555-5555-5555-5555-555555555555',
 'Feyre Solves the Riddle', 'milestone.plot.climax', 'completed', '2015-05-05'::timestamptz,
 '{"state": "achieved", "moment": "Feyre realizes answer during third trial", "word": "Love", "significance": "Recognition of her feelings for Tamlin (subverted in book 2)", "amarantha_reaction": "Kills Feyre anyway out of spite"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55552222-0001-0005-0005-000000000001', '55555555-5555-5555-5555-555555555555',
 'Feyre''s Death and Resurrection', 'milestone.plot.transformation', 'completed', '2015-05-05'::timestamptz,
 '{"state": "achieved", "death": "Amarantha kills Feyre", "resurrection": "All seven High Lords contribute power to revive her", "transformation": "Feyre becomes High Fae", "new_powers": "Access to all seven courts'' magic", "significance": "Feyre reborn as something entirely new"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 8: Secondary Character Arcs
-- ============================================

-- Lucien Vanserra Arc
('55555555-0008-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Lucien''s Autumn Court Trauma', 'milestone.character.backstory', 'completed', '2015-01-01'::timestamptz,
 '{"state": "achieved", "character": "Lucien Vanserra", "backstory": "Bastard son of Autumn Court High Lord Beron", "trauma": "Fled family after his lover was murdered", "refuge": "Found asylum in Spring Court with Tamlin", "role": "Became Tamlin''s emissary and closest friend", "defining_trait": "The fox among wolves - clever, sarcastic, quick"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Lucien Under the Mountain', 'milestone.character.suffering', 'completed', '2015-05-01'::timestamptz,
 '{"state": "achieved", "period": "50 years under Amarantha''s rule", "maiming": "Lost eye, replaced with golden mechanical eye", "scars": "Facial scars from Amarantha''s cruelty", "loyalty_tested": "Wounds inflicted because of Tamlin''s actions", "choice": "Chose loyalty over resentment"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Lucien Breaks with Tamlin', 'milestone.character.growth', 'completed', '2016-05-01'::timestamptz,
 '{"state": "achieved", "trigger": "Tamlin''s descent into control and rage in ACOMAF", "choice": "Chose truth over blind loyalty", "priority": "Feyre''s safety over oldest friendship", "significance": "Most significant character growth - defined by principle not person", "cost": "Lost his only home and friend"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Lucien''s Mate Bond with Elain', 'milestone.character.romance', 'completed', '2017-03-01'::timestamptz,
 '{"state": "achieved", "revelation": "Discovers Elain is his mate after she''s Made", "complication": "Elain shows disinterest, possibly drawn to Azriel", "response": "Gives Elain space she demands", "significance": "Demonstrates growth - respect over entitlement", "status": "Unresolved across 4 books"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Helion Parentage Revealed', 'milestone.character.revelation', 'completed', '2017-05-01'::timestamptz,
 '{"state": "achieved", "truth": "Helion (Day Court High Lord) is Lucien''s true father", "mother": "Lady of Autumn had affair with Helion", "implications": "Lucien has legitimate Day Court lineage", "future": "May eventually align with or lead Day Court", "significance": "Transforms identity - ties to multiple power centers"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Band of Exiles Formation', 'milestone.character.alliance', 'completed', '2018-01-01'::timestamptz,
 '{"state": "achieved", "members": ["Lucien", "Jurian (resurrected general)", "Vassa (cursed human queen)"], "purpose": "Operate outside traditional court hierarchies", "location": "Human lands and borders", "significance": "Lucien as free agent, not bound to any court", "role": "Bridge figure between fractured power structures"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Tamlin Fall Arc
('55555555-0008-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Tamlin''s Post-War Trauma', 'milestone.character.descent', 'completed', '2015-06-01'::timestamptz,
 '{"state": "achieved", "trauma_sources": ["50-year curse before Book 1", "Amarantha''s torture and control Under the Mountain", "Watching Feyre die"], "manifestation": "PTSD symptoms, controlling behavior", "tragic_flaw": "Protection becomes imprisonment", "mental_state": "Fractured, unable to process trauma healthily"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Tamlin''s Controlling Behavior', 'milestone.character.toxicity', 'completed', '2016-05-01'::timestamptz,
 '{"state": "achieved", "book": "A Court of Mist and Fury", "behavior": ["Locking Feyre in manor", "Explosive temper", "Dismissing her trauma", "Restricting her freedom"], "contrast": "His protection vs Rhysand''s respect for autonomy", "reader_reaction": "Shift from sympathy to criticism"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Tamlin''s Alliance with Hybern', 'milestone.character.villain', 'completed', '2017-01-01'::timestamptz,
 '{"state": "achieved", "motivation": "Desperate obsession to retrieve Feyre", "action": "Allies with King of Hybern", "betrayal": "Allows sisters to be Made in Cauldron", "moral_low_point": "Crossing every ethical line", "nuance": "Later becomes spy against Hybern"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Spring Court Collapse', 'milestone.character.consequence', 'completed', '2018-05-01'::timestamptz,
 '{"state": "achieved", "cause": "Feyre''s sabotage combined with Tamlin''s failures", "state": "Decay, abandonment, people fleeing", "tamlin_response": "Retreating into beast form", "isolation": "Spends most time as animal, avoiding responsibility", "rhysand_visits": "Attempts to help Tamlin recover, arranges border guards"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Tamlin as Hybern Spy', 'milestone.character.redemption', 'completed', '2017-04-01'::timestamptz,
 '{"state": "achieved", "action": "Secretly works against Hybern from within", "significance": "Helps save Prythian despite being treated as villain", "motivation": "Genuine desire to protect, not to win Feyre back", "narrative_role": "Sets up potential future redemption arc", "fan_debate": "Does this action excuse his earlier behavior?"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Azriel Expanded Arc
('55555555-0008-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Azriel''s Eleven Years of Darkness', 'milestone.character.backstory', 'completed', '2016-03-01'::timestamptz,
 '{"state": "achieved", "origin": "Bastard son of an Illyrian lord", "imprisonment": "Locked in darkness for 11 years by father''s family", "tormentors": "Stepmother and two older half-brothers", "defining_trauma": "Hands burned by brothers under father''s orders", "scars": "Permanent, visible scars on both hands", "personality_impact": "Quiet, brooding, fiercely protective"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0013-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Becoming the Shadowsinger', 'milestone.character.power', 'completed', '2016-03-15'::timestamptz,
 '{"state": "achieved", "rarity": "Only known living shadowsinger", "abilities": ["Living shadows that scout", "Concealment especially at night", "Shadows whisper secrets", "Reveal truths no one else hears"], "origin_mystery": "Even Illyrians and Rhysand don''t know where power comes from", "cobalt_siphons": "7 total - amplify power", "winnowing": "Described as cutting through the world like a blade"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0014-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Truth-Teller Significance', 'milestone.character.symbol', 'completed', '2017-03-01'::timestamptz,
 '{"state": "achieved", "weapon": "Truth-Teller - legendary dagger", "powers": ["Pierce lies", "Cut through glamours", "Break magical defenses"], "gift_to_feyre": "Azriel entrusts blade to Feyre in ACOWAR", "significance": "Symbol of ultimate trust", "multiverse_connection": "Connected to Crescent City crossover"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0015-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Shadows Soften Around Gwyn', 'milestone.character.foreshadowing', 'completed', '2021-02-01'::timestamptz,
 '{"state": "achieved", "observation": "Azriel''s shadows behave differently around Gwyn", "behavior": "Soften, seem curious, sing with her voice", "fan_theory": "Evidence for Gwynriel ship", "counter_theory": "Physical attraction to Elain shown in bonus chapter", "mystery": "Azriel''s true mate unconfirmed", "setup": "Major Book 6 plot thread"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Amren Arc
('55555555-0008-0016-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Amren''s Ancient Being Origins', 'milestone.character.revelation', 'completed', '2016-05-01'::timestamptz,
 '{"state": "achieved", "truth": "Not originally Fae - otherworldly godlike creature", "imprisonment": "Imprisoned in The Prison for millennia", "current_form": "Bound in Fae body", "powers": ["Blood-drinking", "Ward manipulation", "Mind/mindscape influence", "Devastating combat when unleashed"], "personality": "Terrifying, ancient, speaks all languages"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0017-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Amren''s Cauldron Sacrifice', 'milestone.character.sacrifice', 'completed', '2017-04-15'::timestamptz,
 '{"state": "achieved", "decision": "Enter Cauldron to unbind true form", "process": "Sheds Fae shell, unleashes original form", "battle_impact": "Brief period of full power turns tide against Hybern", "apparent_death": "Seems to die in the process", "cost": "Loses vast majority of ancient power"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0018-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Amren Reborn as High Fae', 'milestone.character.transformation', 'completed', '2017-05-01'::timestamptz,
 '{"state": "achieved", "return": "Cauldron returns her in new, fully Fae body", "change": "No longer otherworldly being - permanently High Fae", "trade": "Near-omnipotent power for mortality and belonging", "new_role": "Scholar, strategist, mentor (especially to Nesta)", "significance": "Chose love and connection over godlike power"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Mor (Morrigan) Arc
('55555555-0008-0019-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Mor''s Court of Nightmares Origins', 'milestone.character.backstory', 'completed', '2016-05-01'::timestamptz,
 '{"state": "achieved", "birth": "Born to brutal family in Hewn City (Court of Nightmares)", "role": "Third-in-command of Night Court", "trauma": "Father tortured and imprisoned her", "trigger": "Discovered her relationship with a female lover", "abuse": "Beaten, whipped, left to die in a cell", "cover_story": "Falsely branded as promiscuous to hide family shame"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0020-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Mor Rescued by Rhysand', 'milestone.character.liberation', 'completed', '2016-05-15'::timestamptz,
 '{"state": "achieved", "rescue": "Rhysand saves her 500+ years ago", "new_life": "Granted freedom and role in Court of Dreams", "loyalty": "Becomes fierce protector of Rhysand and Inner Circle", "powers": "Truth-seeing abilities, formidable warrior", "secret_kept": "Hides true sexuality from friends for centuries"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0021-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Mor Comes Out to Feyre', 'milestone.character.revelation', 'completed', '2017-04-01'::timestamptz,
 '{"state": "achieved", "book": "A Court of Wings and Ruin", "revelation": "Confides to Feyre she is lesbian", "confession": "Has only been with males due to family pressure, prefers females", "fear": "Worried friends would feel deceived", "hints": "Enjoyment of gay bar equivalent, feelings for deceased human female friend", "criticism": "Storyline largely abandoned in later books"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0008-0022-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Mor''s Unresolved Powers', 'milestone.character.mystery', 'completed', '2021-02-01'::timestamptz,
 '{"state": "achieved", "mystery": "Full extent of powers never revealed", "hints": ["Truth-seeing abilities", "Banshee-like powers theorized", "Combat prowess in battles"], "fan_theories": "Powers may be revealed in future books", "narrative_gap": "Criticized as underexplored storyline", "future": "Book 6 or later could address fully"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PLANS
-- ============================================
INSERT INTO onto_plans (id, project_id, name, description, type_key, state_key, props, created_by) VALUES
-- Writing the Series
('55554444-0001-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Original Trilogy Writing Plan', 'Write ACOTAR, ACOMAF, and ACOWAR as cohesive arc', 'plan.phase',
 'completed',
 '{"books": 3, "timeframe": "2009-2017", "arc": "Feyre from mortal to High Lady", "approach": "Each book is standalone fairy tale retelling"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0002-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Character Arc: Feyre Archeron', 'Develop Feyre from survivor to leader', 'plan.character',
 'completed',
 '{"arc_phases": ["Huntress and provider", "Prisoner and lover", "Trauma survivor", "High Lady and mate"], "key_growth": "Agency, self-worth, artistic expression"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0002-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Character Arc: Rhysand', 'Transform Rhysand from villain to hero reveal', 'plan.character',
 'completed',
 '{"book1_role": "Mysterious antagonist", "book2_reveal": "Traumatized hero protecting everyone", "key_traits": ["Protective", "Patient", "Powerful", "Partnership-oriented"], "contrast_to_tamlin": "Respects autonomy vs controls"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0003-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Nesta Redemption Arc', 'Transform Nesta from antagonist to protagonist', 'plan.character',
 'completed',
 '{"initial_perception": "Cruel, cold, unlikeable", "truth": "Traumatized, self-loathing, protective", "healing_elements": ["Training", "Found sisterhood", "Cassian bond", "Self-acceptance"], "outcome": "Beloved protagonist"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0005-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Prythian Worldbuilding Plan', 'Design complete fae world with seven courts', 'plan.worldbuilding',
 'completed',
 '{"elements": ["Seven courts with distinct cultures", "Magic systems (High Lord powers, mate bonds, Cauldron)", "History (wall, Under the Mountain)", "Geography (mortal lands, fae territories)"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55554444-0006-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555',
 'Multiverse Integration Plan', 'Connect ACOTAR to Throne of Glass and Crescent City', 'plan.series',
 'active',
 '{"connections": ["Shared magical history", "Eight-pointed star symbol", "Crossover characters"], "reveal_book": "House of Flame and Shadow (2024)", "future_implications": "Potential crossover events"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TASKS
-- ============================================
INSERT INTO onto_tasks (id, project_id, type_key, title, state_key, priority, due_at, props, created_by) VALUES
-- Book 1 Tasks
('55555555-0001-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Feyre''s wolf hunt opening scene', 'done', 1, '2009-03-01'::timestamptz,
 '{"scene": "Feyre kills wolf in forest to feed family", "significance": "Establishes survival skills, family dynamics, curse trigger", "word_count": 3000}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0001-0002-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Develop Spring Court setting', 'done', 2, '2010-01-01'::timestamptz,
 '{"elements": ["Tamlin''s manor", "Permanent spring aesthetic", "Mask curse effects", "Lucien character introduction"], "inspiration": "Beauty and the Beast castle"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0001-0001-0003-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Under the Mountain sequence', 'done', 1, '2014-01-01'::timestamptz,
 '{"scenes": ["Three trials", "Rhysand bargain", "Riddle solution", "Feyre death and resurrection"], "word_count": 30000, "emotional_intensity": "Maximum"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Book 2 Tasks
('55555555-0002-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Feyre''s trauma symptoms', 'done', 1, '2015-07-01'::timestamptz,
 '{"symptoms": ["Vomiting at meals", "Nightmares", "Emotional numbness", "Physical deterioration"], "purpose": "Authentic PTSD representation"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0002-0001-0002-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Velaris reveal scene', 'done', 1, '2015-08-01'::timestamptz,
 '{"moment": "Feyre first sees hidden city", "elements": ["Starlight aesthetic", "Sidra River", "Rainbow district", "Inner Circle introduction"], "emotional_beat": "Hope returns"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0002-0001-0003-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Feyre learning to read scenes', 'done', 2, '2015-09-01'::timestamptz,
 '{"significance": "Rhysand teaches Feyre to read", "symbolism": "Knowledge as empowerment", "contrast": "Tamlin never noticed her illiteracy"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0002-0001-0004-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Starfall/Mate Bond reveal', 'done', 1, '2015-12-01'::timestamptz,
 '{"scene": "Starfall celebration in Velaris", "revelation": "Feyre realizes Rhysand is her mate", "quote": "My mate. My mate. My mate.", "cultural_impact": "Broke the internet"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Book 3 Tasks (ACOWAR)
('55555555-0003-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Feyre''s Spring Court spy mission', 'done', 1, '2016-08-01'::timestamptz,
 '{"scenes": ["Undercover return to Spring", "Sabotaging Tamlin", "Gathering Hybern intel", "Outmaneuvering Ianthe"], "word_count": 25000, "emotional_complexity": "Playing villain while being hero"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0001-0002-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Escape with Lucien sequence', 'done', 1, '2016-09-01'::timestamptz,
 '{"scenes": ["Killing Hybern twins", "Poison revelation", "Flight through Autumn Court", "Evading Lucien''s family"], "significance": "Deepens Feyre-Lucien friendship", "tension": "Multiple threats and narrow escapes"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0001-0003-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write High Lords'' Meeting scenes', 'done', 1, '2016-10-01'::timestamptz,
 '{"scenes": ["All seven High Lords gather", "Political tensions surface", "Alliance negotiations", "Old grudges revealed"], "challenge": "Balancing seven distinct personalities and agendas", "significance": "Historic unprecedented gathering"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0001-0004-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Archeron sisters Made scenes', 'done', 1, '2016-11-01'::timestamptz,
 '{"scenes": ["Nesta and Elain forced into Cauldron", "Nesta stealing Cauldron power", "Elain broken afterward", "Feyre''s guilt and rage"], "emotional_intensity": "Maximum trauma", "setup": "Seeds ACOSF and Book 6"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0001-0005-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Final Battle against Hybern', 'done', 1, '2016-12-15'::timestamptz,
 '{"scenes": ["Multi-front war", "Mr. Archeron''s sacrifice", "Amren''s Cauldron transformation", "Hybern King''s death"], "word_count": 40000, "stakes": "Survival of both worlds"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0003-0001-0006-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Mor coming out scene', 'done', 2, '2016-11-15'::timestamptz,
 '{"scene": "Mor confides in Feyre about her sexuality", "significance": "First explicit LGBTQ+ representation in series", "handling": "Quiet, intimate conversation", "criticism_later": "Arc largely abandoned in subsequent books"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Book 4 Tasks (ACOFAS)
('55555555-0004-0000-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Winter Solstice celebration scenes', 'done', 1, '2017-08-01'::timestamptz,
 '{"scenes": ["Gift shopping in Velaris", "Snowball fight tradition", "Solstice dinner", "Gift exchanges"], "tone": "Lighter, healing-focused", "purpose": "Show characters recovering from war trauma"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0000-0002-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Nesta confrontation scene', 'done', 1, '2017-09-01'::timestamptz,
 '{"scene": "Feyre finds Nesta in seedy pub, attempts intervention", "tension": "Nesta refuses help, takes money instead of connection", "significance": "Sets up ACOSF opening", "cassian_moment": "Follows Nesta when she leaves"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0000-0003-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Feyre''s art studio gift scene', 'done', 2, '2017-09-15'::timestamptz,
 '{"scene": "Inner Circle gifts Feyre Polina''s old studio", "significance": "Feyre rediscovers painting as healing", "symbolism": "Reclaiming identity beyond warrior role", "emotional_beat": "Quiet moment of hope"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0000-0004-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Rhysand Spring Court visits', 'done', 2, '2017-10-01'::timestamptz,
 '{"scenes": ["Rhysand visits abandoned Spring Court", "Sees Tamlin in beast form", "Arranges Summer Court border guards"], "purpose": "Show Tamlin''s fall and Rhysand''s complicated feelings", "setup": "Potential Tamlin redemption arc"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Book 5 Tasks
('55555555-0004-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Nesta''s spiral opening', 'done', 1, '2019-03-01'::timestamptz,
 '{"scene": "Nesta drinking, sleeping around, self-destructing", "purpose": "Show authentic depression and trauma response", "challenge": "Make unlikeable behavior sympathetic"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0001-0002-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Develop Gwyn and Emerie characters', 'done', 2, '2019-06-01'::timestamptz,
 '{"gwyn": {"role": "Priestess, singer, trauma survivor", "significance": "Potential Azriel mate"}, "emerie": {"role": "Illyrian outcast, shop owner", "arc": "Reclaiming her wings"}, "purpose": "Female friendship as healing"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0001-0003-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Valkyrie training sequences', 'done', 1, '2020-01-01'::timestamptz,
 '{"elements": ["House of Wind stairs", "Combat training with Cassian", "The 10,000 steps", "Blood Rite preparation"], "significance": "Physical strength mirrors emotional healing"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0004-0001-0004-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Nesta/Cassian mate bond acceptance', 'done', 1, '2020-06-01'::timestamptz,
 '{"scene": "Nesta finally accepts bond and declares love", "years_of_buildup": "4 books of tension", "quote": "I am yours. And you are mine.", "fan_satisfaction": "Maximum"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Book 6 Tasks
('55555555-0007-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Write Book 6 first draft', 'done', 1, '2025-07-15'::timestamptz,
 '{"status": "First draft completed July 2025", "length": "Long - SJM confirmed", "mysteries_to_address": ["Elain POV", "Azriel mate", "Koschei"], "publication": "Expected 2026"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0007-0001-0002-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Address Elain''s seer powers', 'todo', 1, '2026-01-01'::timestamptz,
 '{"mystery": "Elain''s visions largely unexplored", "setup": "Book 3 established powers", "fan_expectation": "Major focus in Book 6"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55555555-0007-0001-0003-000000000001', '55555555-5555-5555-5555-555555555555',
 'task.writing', 'Resolve Azriel mate question', 'todo', 1, '2026-01-01'::timestamptz,
 '{"candidates": ["Gwyn (shadows soften around her)", "Elain (physical attraction)", "Unknown third option"], "fan_wars": "Intense debate between Gwynriel and Elriel camps"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DECISIONS
-- ============================================
INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
('55556666-0001-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Make Rhysand the True Love Interest', '2015-06-01'::timestamptz,
 'Subvert expectations by revealing the apparent villain as the true mate. Tamlin''s protective behavior can become toxic, while Rhysand''s apparent cruelty hides genuine care. This allows exploration of what healthy vs unhealthy relationships look like.',
 '{"type": "decision.creative", "state": "decided", "decided_by": "Sarah J. Maas", "risk_level": "high", "outcome": "Massive success - redefined romantasy genre", "fan_reaction": "Initially divisive, now overwhelmingly positive"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55556666-0001-0002-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Keep Sexual Content Despite YA Classification', '2014-09-01'::timestamptz,
 'Fight to maintain mature content rather than censoring for younger audience. The story requires authentic adult relationships. Publisher eventually agreed, though series later moved to Adult classification with ACOSF.',
 '{"type": "decision.business", "state": "decided", "decided_by": "Sarah J. Maas with Bloomsbury", "controversy": "Ongoing debate about YA content appropriateness", "resolution": "ACOSF published as Adult Fantasy in 2021"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55556666-0002-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Create the Inner Circle as Found Family', '2015-08-01'::timestamptz,
 'Build an ensemble of emotionally complex male characters who demonstrate healthy masculinity and genuine friendship. Cassian, Azriel, and Rhysand represent different ways of processing trauma while remaining emotionally available.',
 '{"type": "decision.creative", "state": "decided", "decided_by": "Sarah J. Maas", "innovation": "Male characters with emotional depth", "fan_response": "Beloved characters, extensive fan theorizing"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55556666-0004-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Make Nesta the Book 5 Protagonist', '2018-06-01'::timestamptz,
 'Take the risk of making a divisive, often-disliked character the main focus. Nesta''s journey from villain-coded to beloved protagonist can model authentic trauma recovery and self-acceptance.',
 '{"type": "decision.creative", "state": "decided", "decided_by": "Sarah J. Maas", "risk": "Nesta was highly divisive among readers", "outcome": "ACOSF won Goodreads Choice Award, Nesta became beloved", "lesson": "Trust readers to embrace complex characters"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55556666-0007-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Connect ACOTAR to Multiverse', '2022-01-01'::timestamptz,
 'Establish explicit connections between ACOTAR, Throne of Glass, and Crescent City. The eight-pointed star becomes a cross-series symbol. Bryce Quinlan travels to Prythian in House of Flame and Shadow.',
 '{"type": "decision.creative", "state": "decided", "decided_by": "Sarah J. Maas", "hints": "Planted for years across all series", "reveal": "House of Flame and Shadow (January 2024)", "implications": "Future crossover potential"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55556666-0007-0002-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Partner with Ronald D. Moore for TV Adaptation', '2021-03-01'::timestamptz,
 'Accept Hulu offer with Outlander creator Ronald D. Moore as showrunner. SJM to be heavily involved as co-adapter, spending 4 hours daily on Zoom calls to develop the adaptation.',
 '{"type": "decision.business", "state": "revisited", "decided_by": "Sarah J. Maas", "initial_hope": "High-quality adaptation like Outlander", "outcome": "Moore departed July 2024, Hulu canceled March 2025", "future": "SJM shopping to other networks"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- NEW: Additional Decisions
('55556666-0005-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Move ACOSF to Adult Classification', '2020-09-01'::timestamptz,
 'Given the significantly more explicit content planned for A Court of Silver Flames, work with Bloomsbury to officially classify the book as Adult Fantasy rather than Young Adult, removing marketing constraints.',
 '{"type": "decision.business", "state": "decided", "decided_by": "Sarah J. Maas with Bloomsbury", "reason": "ACOSF content too explicit for YA classification", "outcome": "Book marketed as Adult Fantasy, allowed full creative freedom", "precedent": "Set standard for future books in series"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55556666-0007-0003-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Announce 4+ More ACOTAR Books', '2024-11-01'::timestamptz,
 'Confirm in interviews that at least 4 more ACOTAR books are planned beyond the current 5, indicating the series has substantial future life and many character arcs left to explore.',
 '{"type": "decision.creative", "state": "decided", "decided_by": "Sarah J. Maas", "announcement_venue": "Today interview and fan events", "implications": ["Elain book expected", "Azriel book likely", "Potential Mor book", "Koschei resolution"], "fan_reaction": "Excitement tempered by wait times between books"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55556666-0007-0004-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Shop TV Rights to New Networks', '2025-03-15'::timestamptz,
 'After Hulu cancellation, actively seek new network partners for ACOTAR adaptation rather than abandoning the project. Maintain creative control requirements.',
 '{"type": "decision.business", "state": "active", "decided_by": "Sarah J. Maas", "context": "Post-Hulu cancellation March 2025", "approach": "Seeking new partners while maintaining creative involvement", "fan_hope": "Eventual quality adaptation still possible"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RISKS
-- ============================================
INSERT INTO onto_risks (id, project_id, title, type_key, probability, impact, state_key, props, created_by) VALUES
('55557777-0001-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Love Interest Switch Alienates Readers', 'risk.creative',
 0.5, 'high', 'mitigated',
 '{"description": "Fans invested in Feyre/Tamlin might reject Rhysand as true love interest", "mitigation": "Careful character development showing why Tamlin becomes toxic", "outcome": "Initial division but overwhelming eventual acceptance", "lesson": "Trust readers with complex relationship dynamics"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55557777-0002-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Sexual Content Controversy', 'risk.business',
 0.8, 'medium', 'occurred',
 '{"description": "Explicit content in books marketed to teens creates backlash", "occurrence": "Ongoing debate about YA content appropriateness", "mitigation": "ACOSF moved to Adult classification in 2021", "status": "Controversy continues but has not significantly impacted sales"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55557777-0004-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Nesta Protagonist Risk', 'risk.creative',
 0.7, 'high', 'mitigated',
 '{"description": "Making a divisive, often-hated character the protagonist could backfire", "mitigation": "Authentic trauma portrayal, found sisterhood arc, earned redemption", "outcome": "ACOSF won Goodreads Choice Award, Nesta became fan favorite", "key_insight": "Readers will embrace complex characters if journey is authentic"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55557777-0006-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'LGBTQ+ Representation Criticism', 'risk.creative',
 0.8, 'medium', 'occurred',
 '{"description": "Mor comes out as lesbian in ACOWAR but storyline is largely abandoned", "criticism": "Appearance of representation without follow-through", "status": "Ongoing fan criticism", "future_opportunity": "Book 6 or later could address Mor storyline"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55557777-0007-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'TV Adaptation Failure', 'risk.business',
 0.4, 'high', 'occurred',
 '{"description": "Hulu adaptation fails to materialize despite initial excitement", "occurrence": "Moore departed July 2024, Hulu canceled March 2025", "impact": "No current adaptation in production", "mitigation": "SJM shopping rights to other networks", "fan_response": "Disappointment but continued support for books"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55557777-0007-0002-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Book 6 Shipping Wars', 'risk.creative',
 0.9, 'medium', 'identified',
 '{"description": "Intense fan division between Azriel/Gwyn and Azriel/Elain supporters", "current_state": "Active fandom conflict", "evidence_parsed": {"gwynriel": ["Shadows soften around Gwyn", "Singing connection"], "elriel": ["Physical attraction shown", "Secret meetings"]}, "mitigation": "Whichever outcome, execution must be earned and satisfying"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- NEW: Additional Risks
('55557777-0007-0003-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Multiverse Complexity Risk', 'risk.creative',
 0.6, 'medium', 'identified',
 '{"description": "Cross-series connections could confuse readers unfamiliar with all three series", "concern": "ACOTAR readers may feel lost by Crescent City crossover elements", "mitigation_attempt": "Each series remains readable standalone", "status": "Ongoing debate about execution", "future_challenge": "Balancing fan service with accessibility"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55557777-0008-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Lucien/Elain Mate Bond Complication', 'risk.creative',
 0.7, 'medium', 'identified',
 '{"description": "Lucien and Elain are canonically mates but Elain shows disinterest across 4 books", "complication": "Fan investment in Elriel (Elain/Azriel) vs canonical mate bond", "challenge": "Resolving without invalidating either storyline", "duration": "Unresolved since ACOWAR (2017)", "book_6_expectation": "Must be addressed in upcoming book"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55557777-0008-0002-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Illyrian Reform Backlash Setup', 'risk.plot',
 0.8, 'medium', 'identified',
 '{"description": "Illyrian rebellion hints planted across multiple books", "setup": "War-camp leaders resisting female training reforms", "foreshadowing": "Cassian and Rhysand struggle with tradition vs progress", "future_conflict": "Likely major plot thread in upcoming books", "stakes": "Could threaten Night Court stability"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55557777-0008-0003-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Wait Time Between Books', 'risk.business',
 0.9, 'low', 'occurred',
 '{"description": "4+ year gap between ACOSF (2021) and Book 6 (expected 2026)", "cause": "SJM writing across multiple series simultaneously", "impact": "Fan frustration, potential loss of casual readers", "mitigation": "Strong fandom maintains engagement through content creation", "context": "SJM also published Crescent City 2 and 3 during this period"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENTS
-- ============================================
INSERT INTO onto_documents (id, project_id, title, type_key, state_key, props, created_by) VALUES
('55558888-0001-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'ACOTAR Book 1 Dedication', 'document.dedication', 'published',
 '{"text": "For Josh—the love of my life", "significance": "Dedicated to high school sweetheart and husband", "book": "A Court of Thorns and Roses (2015)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0002-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'The Stars Quote', 'document.iconic_quote', 'published',
 '{"text": "To the stars who listen—and the dreams that are answered.", "context": "Rhysand''s Night Court toast", "cultural_impact": "Became fandom rallying cry, common tattoo", "merchandise": "Appears on countless products"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0002-0002-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Feyre Survival Quote', 'document.iconic_quote', 'published',
 '{"text": "I was not a pet, not a doll, not an animal. I was a survivor, and I was strong. I would not be broken.", "context": "Feyre reclaiming her identity", "theme": "Female agency and strength"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0004-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'ACOSF Dedication', 'document.dedication', 'published',
 '{"text": "For the women who fell, who got back up, who found each other", "significance": "Speaks to Nesta, Gwyn, Emerie friendship", "theme": "Female solidarity and healing", "book": "A Court of Silver Flames (2021)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0004-0002-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Don''t Let the Hard Days Win', 'document.iconic_quote', 'published',
 '{"text": "Don''t let the hard days win.", "context": "Nesta''s struggle with depression and self-destruction", "significance": "Mental health advocacy quote", "fan_usage": "Tattoos, mental health discussions, encouragement"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0005-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Prythian Map and Court Guide', 'document.worldbuilding', 'published',
 '{"courts": ["Night", "Spring", "Summer", "Autumn", "Winter", "Dawn", "Day"], "lost_court": "Dusk Court (extinct)", "mortal_lands": "South of the Wall", "key_locations": ["Velaris", "Hewn City", "Spring Court Manor", "Under the Mountain", "The Prison"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0006-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'BookTok ACOTAR Phenomenon Analysis', 'document.cultural', 'published',
 '{"platform": "TikTok", "hashtag": "#ACOTAR", "views": "8.5 billion+", "peak_period": "2020-2023", "content": ["Reactions", "Cosplay", "Fan art", "Theories", "Memes"], "sales_impact": "Bloomsbury 79% increase 2023"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0007-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Multiverse Connection Evidence', 'document.lore', 'published',
 '{"symbol": "Eight-pointed star appears in all three series", "crossover": "Bryce Quinlan travels to Prythian in House of Flame and Shadow", "characters_crossed": ["Bryce meets Nesta", "Bryce meets Azriel", "Truth-Teller dagger connection"], "future_implications": "Shared magical history to be explored"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- NEW: Additional Iconic Quotes
('55558888-0002-0003-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Feyre Darling Signature', 'document.iconic_quote', 'published',
 '{"text": "Feyre darling.", "speaker": "Rhysand", "context": "Signature teasing endearment used throughout ACOMAF", "significance": "Became iconic phrase representing their relationship", "usage": "Romantic and flirtatious scenes", "fan_response": "One of most quoted lines in fandom"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0002-0004-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Salvation Declaration', 'document.iconic_quote', 'published',
 '{"text": "You are my salvation, Feyre.", "speaker": "Rhysand", "context": "Key romantic declaration in ACOMAF", "setup": "Feyre asks if she''s his huntress and thief", "significance": "Defines what Feyre means to Rhysand beyond her skills", "emotional_weight": "High - one of most romantic moments"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0002-0005-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Mate Bond Declaration', 'document.iconic_quote', 'published',
 '{"text": "If you were going to die, I was going to die with you... you were my mate, my mate, my mate.", "speaker": "Rhysand", "context": "Under the Mountain flashback revelation", "significance": "Explains why Rhysand made the bargain", "emotional_impact": "Broke readers'' hearts", "fan_reaction": "One of most emotionally devastating revelations"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0002-0006-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Torn World Apart Quote', 'document.iconic_quote', 'published',
 '{"text": "Then I would have torn the world apart to get you back.", "speaker": "Feyre", "context": "Feyre declares her love and devotion to Rhysand", "significance": "Shows reciprocal intensity of their bond", "mirror": "Matches Rhysand''s own devotion"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0002-0007-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Different Kinds of Darkness', 'document.iconic_quote', 'published',
 '{"text": "There are different kinds of darkness... There is the darkness of lovers, and the darkness of assassins. It becomes what the bearer wishes it to be, needs it to be. It is not wholly bad or good.", "speaker": "Rhysand", "context": "Explaining the nature of his power and philosophy", "theme": "Moral complexity, duality of nature", "significance": "Defines Rhysand''s worldview and Night Court philosophy"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0002-0008-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Love as Poison Quote', 'document.iconic_quote', 'published',
 '{"text": "The issue isn''t whether he loved you, it''s how much. Too much. Love can be a poison.", "speaker": "Rhysand", "context": "Explaining Tamlin''s toxic behavior", "significance": "Crystallizes the difference between love and obsession", "theme": "Healthy vs unhealthy relationships", "foreshadowing": "Establishes contrast between Tamlin and Rhysand"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0002-0009-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Queen Quote', 'document.iconic_quote', 'published',
 '{"text": "A queen who owned her body, her life, her destiny, and never apologised for it.", "speaker": "Feyre (internal)", "context": "Feyre reflecting on her growth and power", "theme": "Female empowerment and agency", "significance": "Encapsulates Feyre''s character arc", "feminist_reading": "Often cited as feminist fantasy moment"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0002-0010-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'All Night Dance Quote', 'document.iconic_quote', 'published',
 '{"exchange": ["Of course I''ll dance with you. All night, if you wish.", "Even if I step on your toes?", "Even then."], "speakers": ["Rhysand", "Feyre"], "context": "Tender romantic moment at Starfall", "tone": "Soft, romantic, intimate", "significance": "Shows vulnerability and gentleness beneath power", "fan_favorite": "Often cited as peak romantic moment"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0003-0001-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'ACOWAR Dedication', 'document.dedication', 'published',
 '{"text": "For my father, who taught me strength", "significance": "Connects to Mr. Archeron''s redemption arc in the book", "theme": "Fathers and daughters, redemption", "book": "A Court of Wings and Ruin (2017)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('55558888-0005-0002-0001-000000000001', '55555555-5555-5555-5555-555555555555',
 'Nesta and Cassian Mate Quote', 'document.iconic_quote', 'published',
 '{"text": "I am yours. And you are mine.", "speakers": ["Nesta", "Cassian"], "context": "Nesta finally accepts the mate bond", "buildup": "4 books of tension and denial", "significance": "Culmination of slow-burn romance", "fan_reaction": "Maximum satisfaction after years of waiting"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GRAPH EDGES - Comprehensive Relationship Mapping
-- ============================================
-- DESIGN: This graph follows the principle of deep nesting:
-- - Project → Goals (7)
-- - Goals → Milestones (35)
-- - Milestones → Sub-Milestones (5)
-- - Plans → Goals (strategic alignment)
-- - Tasks → Milestones (execution)
-- - Decisions → Milestones (key choices and outcomes)
-- - Risks → Milestones/Goals (challenges and mitigations)
-- - Documents → Milestones (artifacts and evidence)
-- - Milestone → Milestone (temporal/causal chains)
-- ============================================

INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, project_id, props) VALUES

-- ============================================
-- TIER 1: Project → Goals (7 Strategic Objectives)
-- ============================================
('project', '55555555-5555-5555-5555-555555555555', 'has_goal', 'goal', '55555555-0001-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1, "phase": "foundation"}'::jsonb),
('project', '55555555-5555-5555-5555-555555555555', 'has_goal', 'goal', '55555555-0002-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2, "phase": "transformation"}'::jsonb),
('project', '55555555-5555-5555-5555-555555555555', 'has_goal', 'goal', '55555555-0003-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3, "phase": "completion"}'::jsonb),
('project', '55555555-5555-5555-5555-555555555555', 'has_goal', 'goal', '55555555-0004-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4, "phase": "expansion"}'::jsonb),
('project', '55555555-5555-5555-5555-555555555555', 'has_goal', 'goal', '55555555-0005-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 5, "phase": "worldbuilding"}'::jsonb),
('project', '55555555-5555-5555-5555-555555555555', 'has_goal', 'goal', '55555555-0006-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 6, "phase": "cultural_impact"}'::jsonb),
('project', '55555555-5555-5555-5555-555555555555', 'has_goal', 'goal', '55555555-0007-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 7, "phase": "future"}'::jsonb),

-- ============================================
-- TIER 2: Goals → Milestones
-- ============================================

-- Goal 1 (Write ACOTAR Book 1) → 8 Milestones
('goal', '55555555-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0001-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1}'::jsonb),
('goal', '55555555-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0001-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2}'::jsonb),
('goal', '55555555-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0001-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3}'::jsonb),
('goal', '55555555-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0001-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4}'::jsonb),
('goal', '55555555-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0001-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 5}'::jsonb),
('goal', '55555555-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0001-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 6}'::jsonb),
('goal', '55555555-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0001-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 7}'::jsonb),
('goal', '55555555-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0001-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 8}'::jsonb),

-- Goal 2 (Transform with ACOMAF) → 6 Milestones
('goal', '55555555-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0002-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1}'::jsonb),
('goal', '55555555-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0002-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2}'::jsonb),
('goal', '55555555-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0002-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3}'::jsonb),
('goal', '55555555-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0002-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4}'::jsonb),
('goal', '55555555-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0002-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 5}'::jsonb),
('goal', '55555555-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0002-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 6}'::jsonb),

-- Goal 3 (Complete Trilogy - ACOWAR) → 5 Milestones
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 5}'::jsonb),

-- Goal 4 (Nesta's Story) → 6 Milestones
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 5}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 6}'::jsonb),

-- Goal 5 (Worldbuilding) → 5 Milestones
('goal', '55555555-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0005-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1}'::jsonb),
('goal', '55555555-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0005-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2}'::jsonb),
('goal', '55555555-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0005-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3}'::jsonb),
('goal', '55555555-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0005-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4}'::jsonb),
('goal', '55555555-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0005-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 5}'::jsonb),

-- Goal 6 (Cultural Phenomenon) → 4 Milestones
('goal', '55555555-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0006-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1}'::jsonb),
('goal', '55555555-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0006-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2}'::jsonb),
('goal', '55555555-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0006-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3}'::jsonb),
('goal', '55555555-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0006-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4}'::jsonb),

-- Goal 7 (The Future) → 5 Milestones
('goal', '55555555-0007-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0007-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1}'::jsonb),
('goal', '55555555-0007-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0007-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2}'::jsonb),
('goal', '55555555-0007-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0007-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3}'::jsonb),
('goal', '55555555-0007-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0007-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4}'::jsonb),
('goal', '55555555-0007-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 5}'::jsonb),

-- Goal 8 (Secondary Character Arcs) → 22 Milestones (NEW)
-- Project → Goal 8
('project', '55555555-5555-5555-5555-555555555555', 'has_goal', 'goal', '55555555-0008-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 8, "phase": "ensemble"}'::jsonb),

-- Lucien Arc (6 milestones)
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1, "character": "Lucien"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2, "character": "Lucien"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3, "character": "Lucien"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4, "character": "Lucien"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 5, "character": "Lucien"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 6, "character": "Lucien"}'::jsonb),

-- Tamlin Arc (5 milestones)
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 7, "character": "Tamlin"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 8, "character": "Tamlin"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 9, "character": "Tamlin"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 10, "character": "Tamlin"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 11, "character": "Tamlin"}'::jsonb),

-- Azriel Arc (4 milestones)
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 12, "character": "Azriel"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0013-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 13, "character": "Azriel"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0014-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 14, "character": "Azriel"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0015-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 15, "character": "Azriel"}'::jsonb),

-- Amren Arc (3 milestones)
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0016-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 16, "character": "Amren"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0017-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 17, "character": "Amren"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0018-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 18, "character": "Amren"}'::jsonb),

-- Mor Arc (4 milestones)
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0019-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 19, "character": "Mor"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0020-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 20, "character": "Mor"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0021-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 21, "character": "Mor"}'::jsonb),
('goal', '55555555-0008-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0008-0022-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 22, "character": "Mor"}'::jsonb),

-- Goal 3 → New ACOWAR Spy Mission Milestones (7 new)
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 6}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 7}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 8}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 9}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 10}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 11}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0003-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 12}'::jsonb),

-- Goal 4 → New ACOFAS Milestones (6 new)
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 7}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 8}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 9}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 10}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 11}'::jsonb),
('goal', '55555555-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '55555555-0004-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 12}'::jsonb),

-- ============================================
-- TIER 3: Milestone → Sub-Milestones (Under the Mountain Trials)
-- ============================================
('milestone', '55555555-0001-0005-0000-000000000001', 'has_sub_milestone', 'milestone', '55552222-0001-0005-0001-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 1, "trial": "First Trial: The Wyrm"}'::jsonb),
('milestone', '55555555-0001-0005-0000-000000000001', 'has_sub_milestone', 'milestone', '55552222-0001-0005-0002-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 2, "trial": "Second Trial: The Riddle"}'::jsonb),
('milestone', '55555555-0001-0005-0000-000000000001', 'has_sub_milestone', 'milestone', '55552222-0001-0005-0003-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 3, "trial": "Third Trial: Kill Innocents"}'::jsonb),
('milestone', '55555555-0001-0005-0000-000000000001', 'has_sub_milestone', 'milestone', '55552222-0001-0005-0004-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 4, "climax": "Riddle Solved"}'::jsonb),
('milestone', '55555555-0001-0005-0000-000000000001', 'has_sub_milestone', 'milestone', '55552222-0001-0005-0005-000000000001', '55555555-5555-5555-5555-555555555555', '{"order": 5, "transformation": "Death and Resurrection"}'::jsonb),

-- Sub-milestone sequential chain (trial progression)
('milestone', '55552222-0001-0005-0001-000000000001', 'precedes', 'milestone', '55552222-0001-0005-0002-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "First trial leads to second"}'::jsonb),
('milestone', '55552222-0001-0005-0002-000000000001', 'precedes', 'milestone', '55552222-0001-0005-0003-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Riddle challenge leads to final trial"}'::jsonb),
('milestone', '55552222-0001-0005-0003-000000000001', 'precedes', 'milestone', '55552222-0001-0005-0004-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Final trial leads to riddle solution"}'::jsonb),
('milestone', '55552222-0001-0005-0004-000000000001', 'enabled', 'milestone', '55552222-0001-0005-0005-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Solving riddle triggers death and resurrection"}'::jsonb),

-- ============================================
-- TIER 4: Plans → Goals (Strategic Alignment)
-- ============================================
-- Original Trilogy Writing Plan → Goals 1, 2, 3
('plan', '55554444-0001-0001-0000-000000000001', 'supports', 'goal', '55555555-0001-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"scope": "Book 1 - ACOTAR"}'::jsonb),
('plan', '55554444-0001-0001-0000-000000000001', 'supports', 'goal', '55555555-0002-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"scope": "Book 2 - ACOMAF"}'::jsonb),
('plan', '55554444-0001-0001-0000-000000000001', 'supports', 'goal', '55555555-0003-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"scope": "Book 3 - ACOWAR"}'::jsonb),

-- Feyre Character Arc Plan → Goals 1, 2
('plan', '55554444-0002-0001-0000-000000000001', 'supports', 'goal', '55555555-0001-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"arc_phase": "Huntress and survivor"}'::jsonb),
('plan', '55554444-0002-0001-0000-000000000001', 'supports', 'goal', '55555555-0002-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"arc_phase": "Trauma recovery and High Lady"}'::jsonb),

-- Rhysand Character Arc Plan → Goal 2
('plan', '55554444-0002-0002-0000-000000000001', 'supports', 'goal', '55555555-0002-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"arc_phase": "Villain to hero reveal"}'::jsonb),

-- Nesta Redemption Arc Plan → Goal 4
('plan', '55554444-0003-0001-0000-000000000001', 'supports', 'goal', '55555555-0004-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"arc_phase": "Antagonist to beloved protagonist"}'::jsonb),

-- Prythian Worldbuilding Plan → Goal 5
('plan', '55554444-0005-0001-0000-000000000001', 'supports', 'goal', '55555555-0005-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"scope": "Seven Courts, magic systems, history"}'::jsonb),

-- Multiverse Integration Plan → Goal 7
('plan', '55554444-0006-0001-0000-000000000001', 'supports', 'goal', '55555555-0007-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"scope": "ACOTAR-ToG-CC connections"}'::jsonb),

-- ============================================
-- TIER 5: Plans → Milestones (Execution Outcomes)
-- ============================================
-- Original Trilogy Plan outcomes
('plan', '55554444-0001-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0001-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "ACOTAR published May 2015"}'::jsonb),
('plan', '55554444-0001-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0002-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "ACOMAF published May 2016"}'::jsonb),
('plan', '55554444-0001-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0003-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "ACOWAR published May 2017"}'::jsonb),

-- Feyre Arc outcomes
('plan', '55554444-0002-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0001-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Feyre character established"}'::jsonb),
('plan', '55554444-0002-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0002-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "PTSD arc written"}'::jsonb),
('plan', '55554444-0002-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0003-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "First Female High Lady"}'::jsonb),

-- Rhysand Arc outcomes
('plan', '55554444-0002-0002-0000-000000000001', 'led_to', 'milestone', '55555555-0001-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Rhysand character created"}'::jsonb),
('plan', '55554444-0002-0002-0000-000000000001', 'led_to', 'milestone', '55555555-0002-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "The Pivot Decision"}'::jsonb),
('plan', '55554444-0002-0002-0000-000000000001', 'led_to', 'milestone', '55555555-0002-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Mate bond reveal"}'::jsonb),

-- Nesta Arc outcomes
('plan', '55554444-0003-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Nesta protagonist decision"}'::jsonb),
('plan', '55554444-0003-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0004-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Valkyrie sisterhood created"}'::jsonb),
('plan', '55554444-0003-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "ACOSF published and award-winning"}'::jsonb),

-- Worldbuilding Plan outcomes
('plan', '55554444-0005-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0001-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Seven Courts designed"}'::jsonb),
('plan', '55554444-0005-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0005-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Night Court duality established"}'::jsonb),
('plan', '55554444-0005-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0005-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Mate bond lore codified"}'::jsonb),

-- Multiverse Plan outcomes
('plan', '55554444-0006-0001-0000-000000000001', 'led_to', 'milestone', '55555555-0007-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Crescent City crossover revealed"}'::jsonb),

-- ============================================
-- TIER 6: Tasks → Milestones (Work Execution)
-- ============================================
-- Book 1 Tasks
('task', '55555555-0001-0001-0001-000000000001', 'contributes_to', 'milestone', '55555555-0001-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Wolf hunt establishes Feyre character"}'::jsonb),
('task', '55555555-0001-0001-0002-000000000001', 'contributes_to', 'milestone', '55555555-0001-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Spring Court setting development"}'::jsonb),
('task', '55555555-0001-0001-0003-000000000001', 'contributes_to', 'milestone', '55555555-0001-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Under the Mountain sequence writing"}'::jsonb),

-- Book 2 Tasks
('task', '55555555-0002-0001-0001-000000000001', 'contributes_to', 'milestone', '55555555-0002-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Feyre trauma symptoms portrayal"}'::jsonb),
('task', '55555555-0002-0001-0002-000000000001', 'contributes_to', 'milestone', '55555555-0002-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Velaris reveal scene"}'::jsonb),
('task', '55555555-0002-0001-0003-000000000001', 'contributes_to', 'milestone', '55555555-0002-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Reading scenes as healing symbolism"}'::jsonb),
('task', '55555555-0002-0001-0004-000000000001', 'contributes_to', 'milestone', '55555555-0002-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Starfall mate bond reveal"}'::jsonb),

-- Book 5 (ACOSF) Tasks
('task', '55555555-0004-0001-0001-000000000001', 'contributes_to', 'milestone', '55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Nesta spiral establishes her as protagonist"}'::jsonb),
('task', '55555555-0004-0001-0002-000000000001', 'contributes_to', 'milestone', '55555555-0004-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Gwyn and Emerie as Valkyrie sisters"}'::jsonb),
('task', '55555555-0004-0001-0003-000000000001', 'contributes_to', 'milestone', '55555555-0004-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Training sequences physical/emotional healing"}'::jsonb),
('task', '55555555-0004-0001-0004-000000000001', 'contributes_to', 'milestone', '55555555-0004-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Nesta/Cassian bond acceptance"}'::jsonb),

-- Book 6 Tasks
('task', '55555555-0007-0001-0001-000000000001', 'contributes_to', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Book 6 first draft completed"}'::jsonb),
('task', '55555555-0007-0001-0002-000000000001', 'contributes_to', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Elain seer powers exploration"}'::jsonb),
('task', '55555555-0007-0001-0003-000000000001', 'contributes_to', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Azriel mate question resolution"}'::jsonb),

-- ============================================
-- TIER 7: Decisions → Milestones (Key Choices)
-- ============================================
-- Decision: Make Rhysand True Love Interest
('decision', '55556666-0001-0001-0001-000000000001', 'influenced', 'milestone', '55555555-0002-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Defined the pivot decision"}'::jsonb),
('decision', '55556666-0001-0001-0001-000000000001', 'led_to', 'milestone', '55555555-0002-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Enabled mate bond reveal"}'::jsonb),
('decision', '55556666-0001-0001-0001-000000000001', 'led_to', 'milestone', '55555555-0002-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Made ACOMAF transformative"}'::jsonb),

-- Decision: Keep Sexual Content
('decision', '55556666-0001-0002-0001-000000000001', 'influenced', 'milestone', '55555555-0001-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Shaped manuscript content"}'::jsonb),
('decision', '55556666-0001-0002-0001-000000000001', 'led_to', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Eventually led to Adult classification for ACOSF"}'::jsonb),

-- Decision: Create Inner Circle
('decision', '55556666-0002-0001-0001-000000000001', 'led_to', 'milestone', '55555555-0002-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Inner Circle became beloved ensemble"}'::jsonb),
('decision', '55556666-0002-0001-0001-000000000001', 'influenced', 'milestone', '55555555-0006-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Characters drive fan theory culture"}'::jsonb),

-- Decision: Make Nesta Protagonist
('decision', '55556666-0004-0001-0001-000000000001', 'led_to', 'milestone', '55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Nesta became focus of Book 5"}'::jsonb),
('decision', '55556666-0004-0001-0001-000000000001', 'led_to', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "ACOSF won Goodreads Choice Award"}'::jsonb),

-- Decision: Connect Multiverse
('decision', '55556666-0007-0001-0001-000000000001', 'led_to', 'milestone', '55555555-0007-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Bryce crossover in House of Flame and Shadow"}'::jsonb),
('decision', '55556666-0007-0001-0001-000000000001', 'influenced', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Opens narrative possibilities for Book 6"}'::jsonb),

-- Decision: Partner with Ronald D. Moore
('decision', '55556666-0007-0002-0001-000000000001', 'led_to', 'milestone', '55555555-0007-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "TV adaptation announced March 2021"}'::jsonb),
('decision', '55556666-0007-0002-0001-000000000001', 'led_to', 'milestone', '55555555-0007-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Moore departure July 2024"}'::jsonb),

-- ============================================
-- TIER 8: Risks → Milestones/Goals (Challenges)
-- ============================================
-- Risk: Love Interest Switch
('risk', '55557777-0001-0001-0001-000000000001', 'threatened', 'goal', '55555555-0002-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"threat": "Could have alienated Book 1 readers"}'::jsonb),
('risk', '55557777-0001-0001-0001-000000000001', 'mitigated_by', 'milestone', '55555555-0002-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "ACOMAF success validated the pivot"}'::jsonb),

-- Risk: Sexual Content Controversy
('risk', '55557777-0002-0001-0001-000000000001', 'threatened', 'goal', '55555555-0001-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"threat": "YA classification controversy"}'::jsonb),
('risk', '55557777-0002-0001-0001-000000000001', 'related_to', 'milestone', '55555555-0001-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"occurrence": "Ongoing debate after Book 1 publication"}'::jsonb),
('risk', '55557777-0002-0001-0001-000000000001', 'mitigated_by', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"resolution": "ACOSF published as Adult fantasy"}'::jsonb),

-- Risk: Nesta Protagonist Risk
('risk', '55557777-0004-0001-0001-000000000001', 'threatened', 'goal', '55555555-0004-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"threat": "Divisive character as lead"}'::jsonb),
('risk', '55557777-0004-0001-0001-000000000001', 'mitigated_by', 'milestone', '55555555-0004-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"mitigation": "Valkyrie sisterhood made her sympathetic"}'::jsonb),
('risk', '55557777-0004-0001-0001-000000000001', 'mitigated_by', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "ACOSF massive success"}'::jsonb),

-- Risk: LGBTQ+ Representation Criticism
('risk', '55557777-0006-0001-0001-000000000001', 'related_to', 'milestone', '55555555-0003-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"occurrence": "Mor comes out in ACOWAR but arc abandoned"}'::jsonb),
('risk', '55557777-0006-0001-0001-000000000001', 'related_to', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"future": "Book 6 could address Mor storyline"}'::jsonb),

-- Risk: TV Adaptation Failure
('risk', '55557777-0007-0001-0001-000000000001', 'threatened', 'goal', '55555555-0007-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"threat": "Adaptation might never materialize"}'::jsonb),
('risk', '55557777-0007-0001-0001-000000000001', 'related_to', 'milestone', '55555555-0007-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"escalation": "Moore departure increased risk"}'::jsonb),
('risk', '55557777-0007-0001-0001-000000000001', 'caused', 'milestone', '55555555-0007-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"outcome": "Risk materialized - Hulu canceled March 2025"}'::jsonb),

-- Risk: Book 6 Shipping Wars
('risk', '55557777-0007-0002-0001-000000000001', 'threatened', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"threat": "Azriel mate choice could divide fandom"}'::jsonb),
('risk', '55557777-0007-0002-0001-000000000001', 'related_to', 'milestone', '55555555-0006-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"evidence": "Fan theory culture fuels shipping wars"}'::jsonb),

-- ============================================
-- TIER 9: Documents → Milestones (Artifacts)
-- ============================================
-- Book 1 Dedication
('document', '55558888-0001-0001-0001-000000000001', 'documents', 'milestone', '55555555-0001-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "ACOTAR dedication to Josh"}'::jsonb),

-- Stars Quote (ACOMAF)
('document', '55558888-0002-0001-0001-000000000001', 'documents', 'milestone', '55555555-0002-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "To the stars who listen quote"}'::jsonb),
('document', '55558888-0002-0001-0001-000000000001', 'influenced', 'milestone', '55555555-0006-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Quote became tattoo phenomenon"}'::jsonb),

-- Feyre Survival Quote
('document', '55558888-0002-0002-0001-000000000001', 'documents', 'milestone', '55555555-0001-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Under the Mountain survival declaration"}'::jsonb),
('document', '55558888-0002-0002-0001-000000000001', 'documents', 'milestone', '55552222-0001-0005-0005-000000000001', '55555555-5555-5555-5555-555555555555', '{"context": "Feyre after death and resurrection"}'::jsonb),

-- ACOSF Dedication
('document', '55558888-0004-0001-0001-000000000001', 'documents', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "For the women who fell dedication"}'::jsonb),
('document', '55558888-0004-0001-0001-000000000001', 'related_to', 'milestone', '55555555-0004-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "References Valkyrie sisterhood"}'::jsonb),

-- Don't Let Hard Days Win
('document', '55558888-0004-0002-0001-000000000001', 'documents', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Mental health quote from ACOSF"}'::jsonb),
('document', '55558888-0004-0002-0001-000000000001', 'related_to', 'milestone', '55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"context": "Nesta depression and healing journey"}'::jsonb),

-- Prythian Map
('document', '55558888-0005-0001-0001-000000000001', 'documents', 'milestone', '55555555-0001-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Seven Courts map and guide"}'::jsonb),
('document', '55558888-0005-0001-0001-000000000001', 'related_to', 'goal', '55555555-0005-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"scope": "Core worldbuilding artifact"}'::jsonb),

-- BookTok Analysis
('document', '55558888-0006-0001-0001-000000000001', 'documents', 'milestone', '55555555-0006-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "BookTok phenomenon analysis"}'::jsonb),
('document', '55558888-0006-0001-0001-000000000001', 'related_to', 'milestone', '55555555-0006-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Explains Bloomsbury sales surge"}'::jsonb),

-- Multiverse Connection Evidence
('document', '55558888-0007-0001-0001-000000000001', 'documents', 'milestone', '55555555-0007-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Cross-series symbol and character tracking"}'::jsonb),
('document', '55558888-0007-0001-0001-000000000001', 'related_to', 'plan', '55554444-0006-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Evidence for multiverse integration plan"}'::jsonb),

-- ============================================
-- TIER 10: Milestone → Milestone (Causal/Temporal)
-- ============================================

-- Book 1 milestone chain
('milestone', '55555555-0001-0001-0000-000000000001', 'precedes', 'milestone', '55555555-0001-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Vision inspired Feyre creation"}'::jsonb),
('milestone', '55555555-0001-0002-0000-000000000001', 'precedes', 'milestone', '55555555-0001-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Protagonist needs a world"}'::jsonb),
('milestone', '55555555-0001-0003-0000-000000000001', 'precedes', 'milestone', '55555555-0001-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Courts need High Lords"}'::jsonb),
('milestone', '55555555-0001-0004-0000-000000000001', 'precedes', 'milestone', '55555555-0001-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Characters meet Under the Mountain"}'::jsonb),
('milestone', '55555555-0001-0006-0000-000000000001', 'enabled', 'milestone', '55555555-0001-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "ToG success led to ACOTAR publication deal"}'::jsonb),
('milestone', '55555555-0001-0007-0000-000000000001', 'precedes', 'milestone', '55555555-0001-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Manuscript complete before publication"}'::jsonb),

-- Book 1 → Book 2 transition
('milestone', '55555555-0001-0008-0000-000000000001', 'enabled', 'milestone', '55555555-0002-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "ACOTAR success enabled bold Book 2 pivot"}'::jsonb),

-- Book 2 milestone chain
('milestone', '55555555-0002-0001-0000-000000000001', 'enabled', 'milestone', '55555555-0002-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Rhysand pivot required Inner Circle creation"}'::jsonb),
('milestone', '55555555-0002-0002-0000-000000000001', 'enabled', 'milestone', '55555555-0002-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Inner Circle lives in Velaris"}'::jsonb),
('milestone', '55555555-0002-0003-0000-000000000001', 'enabled', 'milestone', '55555555-0002-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Velaris safety allows Feyre healing"}'::jsonb),
('milestone', '55555555-0002-0004-0000-000000000001', 'enabled', 'milestone', '55555555-0002-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Healing opens Feyre to new love"}'::jsonb),
('milestone', '55555555-0002-0005-0000-000000000001', 'precedes', 'milestone', '55555555-0002-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Mate bond leads to ACOMAF climax"}'::jsonb),

-- Book 2 → Book 3 transition
('milestone', '55555555-0002-0006-0000-000000000001', 'enabled', 'milestone', '55555555-0003-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "ACOMAF setup enabled war plot"}'::jsonb),

-- Book 3 milestone chain
('milestone', '55555555-0003-0001-0000-000000000001', 'enabled', 'milestone', '55555555-0003-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "War brings Cauldron into play"}'::jsonb),
('milestone', '55555555-0003-0002-0000-000000000001', 'enabled', 'milestone', '55555555-0003-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Sisters Made, Feyre becomes High Lady"}'::jsonb),
('milestone', '55555555-0003-0003-0000-000000000001', 'enabled', 'milestone', '55555555-0003-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "High Lady leads battle"}'::jsonb),
('milestone', '55555555-0003-0004-0000-000000000001', 'precedes', 'milestone', '55555555-0003-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Battle concludes trilogy"}'::jsonb),

-- Book 3 → Book 4/5 transition
('milestone', '55555555-0003-0005-0000-000000000001', 'enabled', 'milestone', '55555555-0004-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Trilogy end opens Nesta story"}'::jsonb),
('milestone', '55555555-0003-0002-0000-000000000001', 'enabled', 'milestone', '55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Nesta Made in Book 3 sets up her book"}'::jsonb),

-- Book 4/5 milestone chain
('milestone', '55555555-0004-0001-0000-000000000001', 'precedes', 'milestone', '55555555-0004-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Bridge novel concept leads to ACOFAS"}'::jsonb),
('milestone', '55555555-0004-0002-0000-000000000001', 'precedes', 'milestone', '55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "ACOFAS sets up Nesta protagonist"}'::jsonb),
('milestone', '55555555-0004-0003-0000-000000000001', 'enabled', 'milestone', '55555555-0004-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Nesta focus enables Valkyrie concept"}'::jsonb),
('milestone', '55555555-0004-0004-0000-000000000001', 'enabled', 'milestone', '55555555-0004-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Training brings Nesta/Cassian together"}'::jsonb),
('milestone', '55555555-0004-0005-0000-000000000001', 'precedes', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Romance completes ACOSF"}'::jsonb),

-- Worldbuilding cross-connections
('milestone', '55555555-0001-0003-0000-000000000001', 'related_to', 'milestone', '55555555-0005-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Seven Courts includes Night Court duality"}'::jsonb),
('milestone', '55555555-0002-0002-0000-000000000001', 'related_to', 'milestone', '55555555-0005-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Inner Circle are Illyrians"}'::jsonb),
('milestone', '55555555-0003-0002-0000-000000000001', 'related_to', 'milestone', '55555555-0005-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Sisters Made by Cauldron"}'::jsonb),
('milestone', '55555555-0002-0005-0000-000000000001', 'related_to', 'milestone', '55555555-0005-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Rhysand/Feyre mate bond establishes lore"}'::jsonb),

-- Cultural impact chains
('milestone', '55555555-0002-0006-0000-000000000001', 'enabled', 'milestone', '55555555-0006-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "ACOMAF became BookTok sensation"}'::jsonb),
('milestone', '55555555-0006-0001-0000-000000000001', 'enabled', 'milestone', '55555555-0006-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "BookTok drove sales surge"}'::jsonb),
('milestone', '55555555-0006-0001-0000-000000000001', 'enabled', 'milestone', '55555555-0006-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Virality fueled fan theories"}'::jsonb),
('milestone', '55555555-0006-0003-0000-000000000001', 'enabled', 'milestone', '55555555-0006-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Fandom love leads to tattoos"}'::jsonb),

-- Future milestone chain
('milestone', '55555555-0007-0001-0000-000000000001', 'enabled', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Multiverse expands Book 6 possibilities"}'::jsonb),
('milestone', '55555555-0007-0002-0000-000000000001', 'precedes', 'milestone', '55555555-0007-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Announcement preceded departure"}'::jsonb),
('milestone', '55555555-0007-0003-0000-000000000001', 'precedes', 'milestone', '55555555-0007-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Moore departure led to cancellation"}'::jsonb),
('milestone', '55555555-0004-0006-0000-000000000001', 'precedes', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "ACOSF preceded Book 6 development"}'::jsonb),

-- Cross-goal dependencies
('goal', '55555555-0001-0000-0000-000000000001', 'precedes', 'goal', '55555555-0002-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Book 1 foundation for Book 2 transformation"}'::jsonb),
('goal', '55555555-0002-0000-0000-000000000001', 'precedes', 'goal', '55555555-0003-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Book 2 sets up Book 3 war"}'::jsonb),
('goal', '55555555-0003-0000-0000-000000000001', 'precedes', 'goal', '55555555-0004-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Trilogy completion enables Nesta story"}'::jsonb),
('goal', '55555555-0005-0000-0000-000000000001', 'supports', 'goal', '55555555-0001-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Worldbuilding underlies all books"}'::jsonb),
('goal', '55555555-0005-0000-0000-000000000001', 'supports', 'goal', '55555555-0007-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Worldbuilding enables multiverse expansion"}'::jsonb),
('goal', '55555555-0002-0000-0000-000000000001', 'enabled', 'goal', '55555555-0006-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "ACOMAF transformation drove cultural phenomenon"}'::jsonb),

-- ============================================
-- TIER 11: ACOFAS Task → Milestone Connections (Book 4 - Previously Missing)
-- ============================================
-- Winter Solstice task → ACOFAS milestones
('task', '55555555-0004-0000-0001-000000000001', 'contributes_to', 'milestone', '55555555-0004-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Winter Solstice celebration scenes for ACOFAS"}'::jsonb),
('task', '55555555-0004-0000-0001-000000000001', 'contributes_to', 'milestone', '55555555-0004-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Holiday novella content"}'::jsonb),
-- Nesta confrontation task → Nesta's spiral milestone
('task', '55555555-0004-0000-0002-000000000001', 'contributes_to', 'milestone', '55555555-0004-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Nesta intervention scene establishes her spiral"}'::jsonb),
('task', '55555555-0004-0000-0002-000000000001', 'contributes_to', 'milestone', '55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Sets up Nesta as Book 5 protagonist"}'::jsonb),
-- Feyre art studio task → healing milestone
('task', '55555555-0004-0000-0003-000000000001', 'contributes_to', 'milestone', '55555555-0004-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Polina studio gift scene"}'::jsonb),
-- Rhysand Spring Court visits task → Tamlin milestone
('task', '55555555-0004-0000-0004-000000000001', 'contributes_to', 'milestone', '55555555-0004-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Tamlin Spring Court visit scenes"}'::jsonb),
('task', '55555555-0004-0000-0004-000000000001', 'contributes_to', 'milestone', '55555555-0008-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Shows Spring Court collapse"}'::jsonb),

-- ============================================
-- TIER 12: ACOWAR Task → Milestone Connections (Book 3 - Previously Missing)
-- ============================================
-- Spy mission task → Spring Court infiltration milestone
('task', '55555555-0003-0001-0001-000000000001', 'contributes_to', 'milestone', '55555555-0003-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Feyre undercover spy mission writing"}'::jsonb),
('task', '55555555-0003-0001-0001-000000000001', 'contributes_to', 'milestone', '55555555-0003-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Ianthe conflict scenes"}'::jsonb),
-- Escape with Lucien task → escape milestone
('task', '55555555-0003-0001-0002-000000000001', 'contributes_to', 'milestone', '55555555-0003-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Escape from Spring Court sequence"}'::jsonb),
('task', '55555555-0003-0001-0002-000000000001', 'contributes_to', 'milestone', '55555555-0003-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Hybern twins confrontation"}'::jsonb),
-- High Lords meeting task → alliance milestone
('task', '55555555-0003-0001-0003-000000000001', 'contributes_to', 'milestone', '55555555-0003-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "High Lords meeting scenes"}'::jsonb),
-- Archeron sisters Made task → transformation milestone
('task', '55555555-0003-0001-0004-000000000001', 'contributes_to', 'milestone', '55555555-0003-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Sisters forced into Cauldron scenes"}'::jsonb),
-- Final battle task → battle and redemption milestones
('task', '55555555-0003-0001-0005-000000000001', 'contributes_to', 'milestone', '55555555-0003-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Final battle against Hybern"}'::jsonb),
('task', '55555555-0003-0001-0005-000000000001', 'contributes_to', 'milestone', '55555555-0003-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Miryam and Drakon arrive"}'::jsonb),
('task', '55555555-0003-0001-0005-000000000001', 'contributes_to', 'milestone', '55555555-0003-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Mr. Archeron sacrifice scene"}'::jsonb),
-- Mor coming out task → relevant milestone
('task', '55555555-0003-0001-0006-000000000001', 'contributes_to', 'milestone', '55555555-0008-0021-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"work": "Mor comes out to Feyre"}'::jsonb),

-- ============================================
-- TIER 13: New Document → Milestone Connections
-- ============================================
-- "Feyre darling" quote → ACOMAF publication and mate bond reveal
('document', '55558888-0002-0003-0001-000000000001', 'documents', 'milestone', '55555555-0002-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Signature romantic phrase from ACOMAF"}'::jsonb),
('document', '55558888-0002-0003-0001-000000000001', 'related_to', 'milestone', '55555555-0002-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Part of romantic arc with mate reveal"}'::jsonb),
-- Salvation quote → ACOMAF romance
('document', '55558888-0002-0004-0001-000000000001', 'documents', 'milestone', '55555555-0002-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Key romantic declaration"}'::jsonb),
-- Mate bond declaration → Under the Mountain and mate reveal
('document', '55558888-0002-0005-0001-000000000001', 'documents', 'milestone', '55555555-0002-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Mate bond revelation backstory"}'::jsonb),
('document', '55558888-0002-0005-0001-000000000001', 'related_to', 'milestone', '55555555-0001-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "References Under the Mountain events"}'::jsonb),
-- Torn world apart quote → Feyre PTSD healing
('document', '55558888-0002-0006-0001-000000000001', 'documents', 'milestone', '55555555-0002-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Feyre declaration of devotion"}'::jsonb),
-- Different kinds of darkness quote → Night Court duality
('document', '55558888-0002-0007-0001-000000000001', 'documents', 'milestone', '55555555-0005-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Rhysand philosophy on Night Court"}'::jsonb),
('document', '55558888-0002-0007-0001-000000000001', 'related_to', 'milestone', '55555555-0002-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Inner Circle worldview"}'::jsonb),
-- Love as poison quote → Tamlin controlling behavior
('document', '55558888-0002-0008-0001-000000000001', 'documents', 'milestone', '55555555-0008-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Explains Tamlin toxic behavior"}'::jsonb),
('document', '55558888-0002-0008-0001-000000000001', 'related_to', 'milestone', '55555555-0002-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Part of the pivot decision rationale"}'::jsonb),
-- Queen quote → First Female High Lady
('document', '55558888-0002-0009-0001-000000000001', 'documents', 'milestone', '55555555-0003-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Feyre agency declaration"}'::jsonb),
-- All night dance quote → Starfall/mate bond
('document', '55558888-0002-0010-0001-000000000001', 'documents', 'milestone', '55555555-0002-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Romantic moment at Starfall"}'::jsonb),
-- ACOWAR dedication → Father redemption arc
('document', '55558888-0003-0001-0001-000000000001', 'documents', 'milestone', '55555555-0003-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "ACOWAR dedication to father"}'::jsonb),
('document', '55558888-0003-0001-0001-000000000001', 'related_to', 'milestone', '55555555-0003-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Connects to Mr. Archeron sacrifice"}'::jsonb),
-- Nesta/Cassian mate quote → bond acceptance milestone
('document', '55558888-0005-0002-0001-000000000001', 'documents', 'milestone', '55555555-0004-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"artifact": "Nesta/Cassian mate bond acceptance"}'::jsonb),
('document', '55558888-0005-0002-0001-000000000001', 'related_to', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Culminates in ACOSF"}'::jsonb),

-- ============================================
-- TIER 14: New Decision → Milestone/Goal Connections
-- ============================================
-- Move to Adult classification decision
('decision', '55556666-0005-0001-0001-000000000001', 'led_to', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "ACOSF published as Adult Fantasy"}'::jsonb),
('decision', '55556666-0005-0001-0001-000000000001', 'influenced', 'goal', '55555555-0004-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Enabled explicit content in Nesta story"}'::jsonb),
-- Announce 4+ more books decision
('decision', '55556666-0007-0003-0001-000000000001', 'influenced', 'goal', '55555555-0007-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Confirmed long-term future of series"}'::jsonb),
('decision', '55556666-0007-0003-0001-000000000001', 'related_to', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Book 6 is first of 4+ confirmed books"}'::jsonb),
-- Shop TV rights decision
('decision', '55556666-0007-0004-0001-000000000001', 'related_to', 'milestone', '55555555-0007-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"response_to": "Hulu cancellation"}'::jsonb),
('decision', '55556666-0007-0004-0001-000000000001', 'influenced', 'goal', '55555555-0007-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"impact": "Continuing adaptation efforts"}'::jsonb),

-- ============================================
-- TIER 15: New Risk → Milestone/Goal Connections
-- ============================================
-- Multiverse complexity risk
('risk', '55557777-0007-0003-0001-000000000001', 'threatened', 'goal', '55555555-0007-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"threat": "Cross-series confusion could alienate readers"}'::jsonb),
('risk', '55557777-0007-0003-0001-000000000001', 'related_to', 'milestone', '55555555-0007-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"occurrence": "Bryce crossover introduced complexity"}'::jsonb),
-- Lucien/Elain mate complication risk
('risk', '55557777-0008-0001-0001-000000000001', 'threatened', 'milestone', '55555555-0007-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"threat": "Must resolve mate bond vs Azriel attraction"}'::jsonb),
('risk', '55557777-0008-0001-0001-000000000001', 'related_to', 'milestone', '55555555-0008-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"origin": "Lucien mate bond discovery"}'::jsonb),
('risk', '55557777-0008-0001-0001-000000000001', 'related_to', 'milestone', '55555555-0004-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"escalation": "Lucien Solstice rejection"}'::jsonb),
-- Illyrian rebellion risk
('risk', '55557777-0008-0002-0001-000000000001', 'threatened', 'goal', '55555555-0007-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"threat": "Could destabilize Night Court in future books"}'::jsonb),
('risk', '55557777-0008-0002-0001-000000000001', 'related_to', 'milestone', '55555555-0004-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"setup": "Illyrian reform resistance in ACOFAS"}'::jsonb),
('risk', '55557777-0008-0002-0001-000000000001', 'related_to', 'milestone', '55555555-0005-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Illyrian culture development"}'::jsonb),
-- Wait time between books risk
('risk', '55557777-0008-0003-0001-000000000001', 'threatened', 'goal', '55555555-0006-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"threat": "Could lose casual readers during gaps"}'::jsonb),
('risk', '55557777-0008-0003-0001-000000000001', 'related_to', 'milestone', '55555555-0004-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"start": "ACOSF publication Feb 2021"}'::jsonb),
('risk', '55557777-0008-0003-0001-000000000001', 'mitigated_by', 'milestone', '55555555-0006-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"mitigation": "BookTok maintains engagement during waits"}'::jsonb),

-- ============================================
-- TIER 16: Secondary Character Arc Interconnections
-- ============================================
-- Lucien arc causal chain
('milestone', '55555555-0008-0001-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Trauma history precedes Under the Mountain suffering"}'::jsonb),
('milestone', '55555555-0008-0002-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "50 years loyalty tested before break with Tamlin"}'::jsonb),
('milestone', '55555555-0008-0003-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Breaking with Tamlin opens path to Elain bond discovery"}'::jsonb),
('milestone', '55555555-0008-0004-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Mate bond discovery parallels Helion parentage reveal"}'::jsonb),
('milestone', '55555555-0008-0005-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0006-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Dual heritage leads to Band of Exiles formation"}'::jsonb),
-- Tamlin arc causal chain
('milestone', '55555555-0008-0007-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "PTSD manifests as controlling behavior"}'::jsonb),
('milestone', '55555555-0008-0008-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Losing Feyre leads to Hybern alliance"}'::jsonb),
('milestone', '55555555-0008-0009-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Within Hybern, becomes double agent"}'::jsonb),
('milestone', '55555555-0008-0011-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "After war, Spring Court collapses under his isolation"}'::jsonb),
-- Azriel arc causal chain
('milestone', '55555555-0008-0012-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0013-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Childhood darkness led to shadowsinger emergence"}'::jsonb),
('milestone', '55555555-0008-0013-0000-000000000001', 'enabled', 'milestone', '55555555-0008-0014-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Shadowsinger abilities enabled Truth-Teller significance"}'::jsonb),
('milestone', '55555555-0008-0014-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0015-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Truth-Teller connection to Gwyn leads to shadows softening observation"}'::jsonb),
-- Amren arc causal chain
('milestone', '55555555-0008-0016-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0017-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Ancient being origins enabled Cauldron sacrifice option"}'::jsonb),
('milestone', '55555555-0008-0017-0000-000000000001', 'led_to', 'milestone', '55555555-0008-0018-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Cauldron sacrifice resulted in High Fae rebirth"}'::jsonb),
-- Mor arc causal chain
('milestone', '55555555-0008-0019-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0020-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Court of Nightmares abuse led to Rhysand rescue"}'::jsonb),
('milestone', '55555555-0008-0020-0000-000000000001', 'precedes', 'milestone', '55555555-0008-0021-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "500 years of freedom before coming out to Feyre"}'::jsonb),
('milestone', '55555555-0008-0021-0000-000000000001', 'related_to', 'milestone', '55555555-0008-0022-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Coming out incomplete without full power reveal"}'::jsonb),
-- Cross-character connections
('milestone', '55555555-0008-0003-0000-000000000001', 'related_to', 'milestone', '55555555-0008-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Lucien break triggered by Tamlin controlling behavior"}'::jsonb),
('milestone', '55555555-0008-0017-0000-000000000001', 'contributes_to', 'milestone', '55555555-0003-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"contribution": "Amren sacrifice turned tide of battle"}'::jsonb),
('milestone', '55555555-0008-0014-0000-000000000001', 'related_to', 'milestone', '55555555-0007-0001-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Truth-Teller connects to multiverse reveal"}'::jsonb),
-- Secondary characters to main plot connections
('milestone', '55555555-0008-0002-0000-000000000001', 'related_to', 'milestone', '55555555-0001-0005-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Lucien maiming happens Under the Mountain"}'::jsonb),
('milestone', '55555555-0008-0016-0000-000000000001', 'related_to', 'milestone', '55555555-0002-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Amren revealed as Inner Circle member"}'::jsonb),
('milestone', '55555555-0008-0019-0000-000000000001', 'related_to', 'milestone', '55555555-0002-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Mor backstory revealed with Inner Circle"}'::jsonb),
('milestone', '55555555-0008-0012-0000-000000000001', 'related_to', 'milestone', '55555555-0005-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Azriel childhood part of Illyrian culture"}'::jsonb),

-- ============================================
-- TIER 17: ACOWAR Spy Mission Milestone Chains
-- ============================================
('milestone', '55555555-0003-0006-0000-000000000001', 'precedes', 'milestone', '55555555-0003-0007-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Spy mission involves conflict with Ianthe"}'::jsonb),
('milestone', '55555555-0003-0007-0000-000000000001', 'precedes', 'milestone', '55555555-0003-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Ianthe schemes lead to Hybern twins arrival"}'::jsonb),
('milestone', '55555555-0003-0008-0000-000000000001', 'precedes', 'milestone', '55555555-0003-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Twin threat forces escape with Lucien"}'::jsonb),
('milestone', '55555555-0003-0009-0000-000000000001', 'precedes', 'milestone', '55555555-0003-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Intel gathered enables High Lords meeting"}'::jsonb),
('milestone', '55555555-0003-0010-0000-000000000001', 'enabled', 'milestone', '55555555-0003-0011-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "High Lords meeting discusses reaching Miryam and Drakon"}'::jsonb),
('milestone', '55555555-0003-0011-0000-000000000001', 'precedes', 'milestone', '55555555-0003-0012-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Alliance reinforcements set stage for Mr. Archeron sacrifice"}'::jsonb),

-- ============================================
-- TIER 18: ACOFAS Milestone Chains
-- ============================================
('milestone', '55555555-0004-0007-0000-000000000001', 'precedes', 'milestone', '55555555-0004-0008-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Solstice preparations lead to studio gift"}'::jsonb),
('milestone', '55555555-0004-0008-0000-000000000001', 'related_to', 'milestone', '55555555-0004-0009-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"contrast": "Feyre healing while Nesta spirals"}'::jsonb),
('milestone', '55555555-0004-0009-0000-000000000001', 'precedes', 'milestone', '55555555-0004-0003-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"reason": "Nesta spiral sets up protagonist decision"}'::jsonb),
('milestone', '55555555-0004-0010-0000-000000000001', 'related_to', 'milestone', '55555555-0008-0004-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Lucien rejection shows mate bond complication"}'::jsonb),
('milestone', '55555555-0004-0011-0000-000000000001', 'related_to', 'milestone', '55555555-0005-0002-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Illyrian reform tied to culture development"}'::jsonb),
('milestone', '55555555-0004-0012-0000-000000000001', 'related_to', 'milestone', '55555555-0008-0010-0000-000000000001', '55555555-5555-5555-5555-555555555555', '{"connection": "Shows Spring Court collapse state"}'::jsonb);

-- ============================================
-- COMPLETION NOTICE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'A Court of Thorns and Roses Writing Project - v3.0';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'ENTITY COUNTS:';
  RAISE NOTICE '  - 8 Goals (books, worldbuilding, cultural, future, character arcs)';
  RAISE NOTICE '  - 79 Milestones (key events + spy mission + ACOFAS + secondary chars)';
  RAISE NOTICE '  - 6 Plans (writing, character arcs, worldbuilding, multiverse)';
  RAISE NOTICE '  - 24 Tasks (specific writing tasks for all 6 books)';
  RAISE NOTICE '  - 9 Decisions (major creative and business choices)';
  RAISE NOTICE '  - 10 Risks (challenges faced and ongoing)';
  RAISE NOTICE '  - 19 Documents (iconic quotes, dedications, cultural analysis)';
  RAISE NOTICE '  - 350+ Edges (comprehensive relationship mapping)';
  RAISE NOTICE '';
  RAISE NOTICE 'GRAPH STRUCTURE (18 Tiers):';
  RAISE NOTICE '  1. Project → Goals (8 edges)';
  RAISE NOTICE '  2. Goals → Milestones (74+ edges)';
  RAISE NOTICE '  3. Milestones → Sub-Milestones (9 edges incl. chains)';
  RAISE NOTICE '  4. Plans → Goals (10 edges)';
  RAISE NOTICE '  5. Plans → Milestones (17 edges)';
  RAISE NOTICE '  6. Tasks → Milestones (24 edges)';
  RAISE NOTICE '  7. Decisions → Milestones (17 edges)';
  RAISE NOTICE '  8. Risks → Milestones/Goals (18 edges)';
  RAISE NOTICE '  9. Documents → Milestones (20+ edges)';
  RAISE NOTICE ' 10. Milestone → Milestone chains (50+ edges)';
  RAISE NOTICE ' 11. ACOFAS Task → Milestone (7 edges - NEW)';
  RAISE NOTICE ' 12. ACOWAR Task → Milestone (12 edges - NEW)';
  RAISE NOTICE ' 13. New Document → Milestone (16 edges - NEW)';
  RAISE NOTICE ' 14. New Decision → Goal/Milestone (6 edges - NEW)';
  RAISE NOTICE ' 15. New Risk → Goal/Milestone (11 edges - NEW)';
  RAISE NOTICE ' 16. Secondary Character Arc chains (25+ edges - NEW)';
  RAISE NOTICE ' 17. ACOWAR Spy Mission chains (6 edges - NEW)';
  RAISE NOTICE ' 18. ACOFAS Milestone chains (6 edges - NEW)';
  RAISE NOTICE '';
  RAISE NOTICE 'V3.0 NEW ADDITIONS:';
  RAISE NOTICE '  - ACOWAR spy mission arc (7 milestones)';
  RAISE NOTICE '  - ACOFAS Winter Solstice events (6 milestones)';
  RAISE NOTICE '  - Lucien complete character arc (6 milestones)';
  RAISE NOTICE '  - Tamlin fall arc (5 milestones)';
  RAISE NOTICE '  - Azriel expanded backstory (4 milestones)';
  RAISE NOTICE '  - Amren sacrifice arc (3 milestones)';
  RAISE NOTICE '  - Mor full story (4 milestones)';
  RAISE NOTICE '  - 11 new iconic quotes (Feyre darling, mate bond, etc.)';
  RAISE NOTICE '  - Updated sales: 75M+ worldwide (was 38M)';
  RAISE NOTICE '  - SJM writing process details';
  RAISE NOTICE '  - Book 6 first draft confirmed July 2025';
  RAISE NOTICE '';
  RAISE NOTICE 'V3.1 GRAPH CONNECTIONS FIX:';
  RAISE NOTICE '  - ACOFAS tasks now connected to milestones';
  RAISE NOTICE '  - ACOWAR tasks now connected to milestones';
  RAISE NOTICE '  - All new documents connected to relevant milestones';
  RAISE NOTICE '  - All new decisions connected to goals/milestones';
  RAISE NOTICE '  - All new risks connected to goals/milestones';
  RAISE NOTICE '  - Secondary character arcs now have causal chains';
  RAISE NOTICE '  - ACOWAR spy mission has sequential chain';
  RAISE NOTICE '  - ACOFAS milestones properly interconnected';
  RAISE NOTICE '  - Cross-character connections established';
  RAISE NOTICE '';
  RAISE NOTICE 'EASTER EGGS FOR SUPERFANS:';
  RAISE NOTICE '  - All fairy tale inspirations documented';
  RAISE NOTICE '  - Inner Circle lore included';
  RAISE NOTICE '  - Under the Mountain trials detailed with sequential chain';
  RAISE NOTICE '  - Mate bond reveal moment captured';
  RAISE NOTICE '  - BookTok phenomenon tracked with causal chains';
  RAISE NOTICE '  - Multiverse connections noted';
  RAISE NOTICE '  - TV adaptation saga documented (incl. 2025 cancellation)';
  RAISE NOTICE '  - Book 6 progress included with 4+ more books confirmed';
  RAISE NOTICE '  - Cross-goal dependencies mapped';
  RAISE NOTICE '  - Helion/Lucien parentage theory captured';
  RAISE NOTICE '  - Gwynriel vs Elriel debate documented';
  RAISE NOTICE '';
  RAISE NOTICE 'To the stars who listen—and the dreams that are answered.';
  RAISE NOTICE '==============================================';
END$$;

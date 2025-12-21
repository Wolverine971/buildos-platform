-- supabase/migrations/20251220_seed_grrm_writing_example_project.sql
-- ============================================
-- George R.R. Martin: A Song of Ice and Fire Writing Project
-- "The gardener plants seeds and watches them grow... eventually"
-- ============================================
-- Version 2.0 - The Neverending Story (Superfan Satirical Edition)
--
-- DESIGN PRINCIPLE: This graph is deeply nested (like GRRM's plot threads).
-- - Goals connect to Project
-- - Milestones connect to Goals
-- - Plans connect to Milestones
-- - Tasks connect to Plans/Milestones
-- - Decisions/Risks connect to Milestones
-- - Documents connect to Milestones
--
-- SCOPE: 1991 (initial vision) → 2025+ (still writing)
-- Originally planned as a trilogy. Currently 5 books published, 2 remaining.
-- Time waiting for Book 6: 14+ years and counting
--
-- SATIRICAL DISCLAIMER: This is a loving tribute to GRRM's epic struggle
-- between artistic perfectionism and the mortal limits of human lifespan.
--
-- KEY DATES FOR SUPERFANS:
-- - 1991: Vision of direwolf pups in summer snow while writing "Avalon"
-- - 1993: Original 3-page letter to agent (Jon/Arya romance! Tyrion villain!)
-- - 1994: 200 pages + outline submitted to Kirby McCauley
-- - Aug 1996: A Game of Thrones (694 pages)
-- - Nov 1998: A Clash of Kings (761 pages) - Locus Award
-- - Nov 2000: A Storm of Swords (973 pages) - Red Wedding written LAST
-- - Oct 2005: A Feast for Crows (753 pages) - 5 YEAR GAP - "Meanwhile..."
-- - Jul 2011: A Dance with Dragons (1016 pages) - 6 MORE YEARS
-- - 2011-????: The Winds of Winter - THE LONG WAIT
--
-- FAMOUS QUOTES ENCODED HEREIN:
-- - "George R.R. Martin is not your bitch." - Neil Gaiman, 2009
-- - "I will make no predictions..." - GRRM after too many broken promises
-- - "Life is meaningless and full of pain" - GRRM on Jets losses (235 NFL posts!)
-- - "The gardener plants seeds..." - GRRM on his writing philosophy
--
-- EASTER EGGS FOR TRUE FANS:
-- - The 1993 letter: Jon/Arya love triangle, Tyrion as villain, Jaime as king
-- - The Meereenese Knot: Why ADWD took 6 years (Tyrion, Dany, Victarion, Quentyn)
-- - R+L=J: 20 years of fan theorizing, confirmed in S6E10
-- - The Five-Year Gap: Abandoned plan that made books 4-5 unwieldy
-- - WordStar 4.0: Still using 1987 DOS software in 2025
-- - Jean Cocteau Cinema: Purchased 2013, another "distraction"
-- - Wild Cards: 34 volumes edited since 1987, still ongoing

-- ============================================
-- CLEANUP (for idempotent re-runs)
-- ============================================
DELETE FROM onto_edges WHERE project_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM onto_tasks WHERE project_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM onto_documents WHERE project_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM onto_decisions WHERE project_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM onto_risks WHERE project_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM onto_plans WHERE project_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM onto_milestones WHERE project_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM onto_goals WHERE project_id = '44444444-4444-4444-4444-444444444444';
DELETE FROM onto_projects WHERE id = '44444444-4444-4444-4444-444444444444';

-- ============================================
-- PROJECT
-- ============================================
INSERT INTO onto_projects (id, org_id, name, description, type_key, state_key, props, start_at, end_at, is_public, created_by)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  NULL,
  'A Song of Ice and Fire: The Writing',
  'George R.R. Martin''s epic fantasy series, originally conceived as a trilogy in 1991 when a vision of direwolf pups in summer snow interrupted his sci-fi novel. After 5 published books (4,197 pages), 14+ years waiting for book 6, one HBO series that overtook the source material, a million-signature petition demanding a Season 8 remake, and Neil Gaiman famously declaring "George R.R. Martin is not your bitch," fans have developed a complex relationship with hope, despair, and WordStar 4.0. The series follows the noble houses of Westeros, but the real drama is watching a gardener tend his garden on a DOS computer while simultaneously editing Wild Cards Volume 34, executive producing House of the Dragon, running the Jean Cocteau Cinema, writing worldbuilding for Elden Ring, and blogging about the Jets. Promise me, George. Promise me you''ll finish.',
  'project.creative.writing',
  'active',
  '{
    "author": "George R.R. Martin",
    "nickname": "GRRM",
    "full_name": "George Raymond Richard Martin",
    "born": "September 20, 1948",
    "age_at_project_start": 42,
    "current_age": 76,
    "residence": "Santa Fe, New Mexico",
    "genre": "Epic Fantasy",
    "original_plan": "Trilogy (1993 letter to agent)",
    "current_plan": "7 books (probably)",
    "books_published": 5,
    "books_remaining": 2,
    "total_pages_published": 4197,
    "pages_in_progress": "~1200 of estimated 1500",
    "writing_style": "Gardener (not Architect)",
    "word_processor": "WordStar 4.0 on DOS (from 1987)",
    "refuses_to_upgrade": true,
    "wife": "Parris McBride (married 2011 after 30 years together)",
    "famous_quotes": [
      "I will make no predictions. Every time I do, assholes on the Internet take that as a promise.",
      "George R.R. Martin is not your bitch. - Neil Gaiman",
      "The gardener plants seeds and watches them grow.",
      "Life is meaningless and full of pain. (on Jets losses)"
    ],
    "fan_status": "Cautiously Hopeless",
    "subreddit_members": "1M+ r/asoiaf",
    "coping_mechanisms": ["Re-reads", "Tinfoil theories", "Denial", "Wild Cards"],
    "graph_depth": 6
  }'::jsonb,
  '1991-06-01',
  NULL,
  TRUE,
  '00000000-0000-0000-0000-000000000002'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GOALS (7 Strategic Objectives)
-- ============================================
INSERT INTO onto_goals (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Goal 1: Write the Original Trilogy
('44444444-0001-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Complete the Original Trilogy', 'goal.strategic.foundation', 'achieved',
 '{"priority": "critical", "state": "achieved", "original_plan": "3 books as promised in 1993 letter", "actual": "Grew into 7+ books", "1993_letter_plans": {"jon_arya_romance": true, "tyrion_villain": true, "jaime_takes_throne": true, "sansa_bears_joffrey_son": true}, "lesson": "Never trust a gardener with a deadline", "timeline": "1991-2000", "pages_delivered": 2428}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 2: Expand the Series
('44444444-0002-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Expand Beyond the Trilogy', 'goal.strategic.expansion', 'achieved',
 '{"priority": "high", "state": "achieved", "books_4_and_5": "Split into two parallel novels by geography", "feast_characters": ["Cersei", "Jaime", "Brienne", "Sansa", "Arya", "Samwell", "Ironborn", "Dorne"], "dance_characters": ["Jon", "Tyrion", "Daenerys", "Bran", "Theon"], "complication": "The Meereenese Knot", "five_year_gap": "Abandoned - too many flashbacks needed", "timeline": "2001-2011", "pages_delivered": 1769}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 3: Finish Winds of Winter
('44444444-0003-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Finish The Winds of Winter', 'goal.strategic.primary', 'active',
 '{"priority": "critical", "state": "active", "status": "~75% complete (2022 estimate)", "years_in_progress": 14, "estimated_pages": 1500, "current_pages": "~1200", "sample_chapters_released": ["Theon I", "Arianne I", "Arianne II", "Mercy (Arya)", "Alayne (Sansa)", "Tyrion I", "Tyrion II", "Barristan I", "Barristan II", "Victarion I", "The Forsaken (Aeron)"], "major_battles_pending": ["Battle of Ice (Winterfell)", "Battle of Fire (Meereen)"], "challenges": ["Interweaving 12+ POV narratives", "Resolving Jon resurrection", "Tyrion/Dany convergence"], "mood": "Cautiously Optimistic™", "covid_progress": "Best writing year since ADWD"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 4: Complete the Series
('44444444-0004-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Write A Dream of Spring', 'goal.strategic.finale', 'draft',
 '{"priority": "critical", "state": "not_started", "status": "Not started (officially)", "fan_hope_level": "Minimal", "actuarial_concern": "Significant", "ending_known": "To GRRM, D&D, and possibly editors", "differs_from_show": "Confirmed - same broad strokes, different execution", "bran_still_king": "Probably", "bittersweet_promise": "Yes", "robert_jordan_model": "Rejected - no one else will finish", "timeline": "TBD-TBD"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 5: Manage Distractions
('44444444-0005-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Resist All Distractions', 'goal.strategic.focus', 'abandoned',
 '{"priority": "critical", "state": "failed_spectacularly", "distractions": {"hbo_got": "8 seasons, occasional writer, constant consultant", "house_of_dragon": "Executive Producer since 2022", "knight_seven_kingdoms": "Executive Producer, premieres Jan 2026", "wild_cards": "34 volumes edited since 1987", "elden_ring": "Worldbuilding 2019-2022, FromSoftware collab", "jean_cocteau_cinema": "Purchased 2013, still operating", "fire_and_blood": "736 pages published 2018", "world_of_ice_and_fire": "326 pages published 2014", "conventions": "WorldCon, SDCC, NYCC, countless others", "not_a_blog": "235+ NFL posts, 15+ years of blogging", "jets_giants": "Two teams, infinite disappointment", "theater_projects": "Various", "ten_thousand_ships": "In development", "aegons_conquest": "In development"}, "success_rate": "0%", "fan_reaction": "WRITE THE BOOK"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 6: Keep Fans Hopeful
('44444444-0006-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Maintain Fan Hope (Without Promises)', 'goal.strategic.community', 'active',
 '{"priority": "medium", "state": "active", "strategy": "Periodic vague updates on Not A Blog", "key_phrases": ["Still working on it", "Making progress", "It is a challenging book", "When it is done"], "effectiveness": "Diminishing returns since 2016", "neil_gaiman_defense": "George R.R. Martin is not your bitch (2009)", "subreddit_status": "r/asoiaf in permanent meme mode", "notable_coping": ["Preston Jacobs videos", "Alt Shift X essays", "Re-reading for the 47th time"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Goal 7: Honor the Craft (New)
('44444444-0007-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Write an Ending Worthy of the Journey', 'goal.strategic.legacy', 'active',
 '{"priority": "ultimate", "state": "philosophical", "philosophy": "A rushed book is forever bad, a delayed book is eventually good", "show_ending_reaction": "I do not want to repeat what happened with Game of Thrones", "key_reveals_remaining": ["Jon''s full parentage implications", "Azor Ahai identity", "Three-headed dragon prophecy", "Bran''s true purpose", "Hodor origin (done differently)", "Lady Stoneheart resolution"], "theories_to_address": ["R+L=J ✓", "Cleganebowl", "fAegon vs Aegon", "Grand Northern Conspiracy", "Southron Ambitions"], "valonqar_prophecy": "Still unresolved"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MILESTONES - GOAL 1: Original Trilogy Era (1991-2000)
-- ============================================
INSERT INTO onto_milestones (id, project_id, title, type_key, state_key, due_at, props, created_by) VALUES
('44444444-0001-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'The Vision in Summer Snows', 'milestone.creative.inception', 'completed', '1991-06-01'::timestamptz,
 '{"state": "achieved", "description": "While writing sci-fi novel Avalon, GRRM has sudden vision of direwolf pups in summer snow", "first_chapter": "Bran I - written in 3 days", "initial_pages": 100, "scene": "A man beheaded, a dead direwolf mother, six pups for six Stark children", "ghost_detail": "Jon finds the albino runt last - a clear sign of his outsider status", "inspiration": "The image just came to him unbidden", "abandoned_project": "Avalon sci-fi novel never completed", "mood": "Excited"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'The 1993 Letter to Agent', 'milestone.business.proposal', 'completed', '1993-10-01'::timestamptz,
 '{"state": "achieved", "agent": "Kirby McCauley (later Ralph Vicinanza)", "document": "3-page outline letter", "plan": "Three books as generational saga", "five_survivors": ["Tyrion", "Daenerys", "Jon", "Arya", "Bran"], "shocking_original_plans": {"jon_arya_romance": "Tormented love between supposed half-siblings", "tyrion_villain": "Kills Joffrey, blamed for other murders, joins Starks for revenge", "jaime_king": "Kills everyone ahead of him in succession, takes throne", "sansa_tragedy": "Bears Joffrey a son, torn between child and family", "catelyn_death": "Killed by White Walkers beyond the Wall", "robb_death": "Dies in battle (Red Wedding invented later)"}, "irony_level": "Maximum - nothing went as planned", "letter_location": "HarperCollins UK offices, leaked via Waterstones Twitter 2015"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'A Game of Thrones Published', 'milestone.publication.book1', 'completed', '1996-08-01'::timestamptz,
 '{"state": "achieved", "publisher": "Bantam Spectra", "pages": 694, "chapters": 73, "pov_characters": ["Eddard", "Catelyn", "Sansa", "Arya", "Bran", "Jon", "Tyrion", "Daenerys"], "iconic_moments": ["Winter is Coming", "Bran pushed from tower", "Ned loses head"], "ned_death": "Subverted fantasy expectations - protagonist dies in book 1", "awards": ["Locus Award nomination", "World Fantasy Award nomination"], "time_to_write": "~5 years (1991-1996)", "initial_print_run": "Small - fantasy was not mainstream yet", "dedication": "For Parris"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'A Clash of Kings Published', 'milestone.publication.book2', 'completed', '1998-11-16'::timestamptz,
 '{"state": "achieved", "pages": 761, "chapters": 70, "gap_from_previous": "2 years 3 months", "new_pov": "Theon Greyjoy, Davos Seaworth", "iconic_moments": ["Battle of Blackwater", "Shadow baby assassination", "Theon takes Winterfell", "House of the Undying visions"], "prophecies_introduced": ["Azor Ahai", "The Prince That Was Promised", "Three treasons", "Three fires", "Three mounts"], "awards": ["Locus Award winner"], "fan_mood": "Optimistic - 2 year gap seemed normal"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'A Storm of Swords Published', 'milestone.publication.book3', 'completed', '2000-11-08'::timestamptz,
 '{"state": "achieved", "pages": 973, "chapters": 82, "gap_from_previous": "2 years", "new_pov": "Jaime Lannister, Samwell Tarly", "iconic_moments": ["Red Wedding", "Purple Wedding", "Oberyn vs Mountain", "Jon becomes Lord Commander", "Tyrion kills Tywin", "Lady Stoneheart reveal"], "red_wedding_writing": "Written LAST - GRRM avoided it until whole book done", "red_wedding_reaction": "Like murdering two of my children", "parris_reaction": "Cried when she read it", "fan_trauma": "Books thrown against walls and into fireplaces", "real_history_basis": ["Black Dinner (1440 Scotland)", "Glencoe Massacre (1692)"], "writing_pace": "Still reasonable - fans had hope"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 2: Expansion Era (2001-2011)
-- ============================================
('44444444-0002-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'The Five-Year Gap Abandoned', 'milestone.creative.restructure', 'completed', '2001-01-01'::timestamptz,
 '{"state": "achieved", "original_plan": "Skip 5 years in story after ASOS", "intended_purpose": "Let child characters age to teenagers", "problem": "Too many flashbacks needed - readers would be confused", "affected_characters": ["Arya (9→14)", "Bran (7→12)", "Sansa (11→16)", "Jon (14→19)", "Daenerys (13→18)"], "solution": "Write everything in real-time", "consequence": "Books 4 and 5 become unwieldy, characters remain young", "pages_discarded": "Hundreds", "lesson": "Some structural decisions cannot be undone"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'The Meereenese Knot Emerges', 'milestone.creative.problem', 'completed', '2002-01-01'::timestamptz,
 '{"state": "achieved", "description": "Complex plot tangle - getting all characters to Meereen in right order with right information", "characters_converging": ["Daenerys (already there)", "Tyrion (via Volantis)", "Victarion (Iron Fleet)", "Quentyn Martell (secret mission)", "Barristan (already there)", "Marwyn the Mage (sailing)", "Moqorro (visions)"], "complications": ["Xaro''s ship offer timing", "Daenerys marriage to Hizdahr", "Yunkish siege", "Daario imprisonment", "Drogon''s return", "The pale mare plague", "Tyrion''s slave journey"], "versions_written": {"quentyn_arrival": "Three different versions tested"}, "solution": "Added Barristan POV to cover Meereen while Dany rides Drogon", "years_to_untangle": "5+ years", "fan_essay": "The Meereenese Blot analysis - still debated"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'A Feast for Crows Published', 'milestone.publication.book4', 'completed', '2005-10-17'::timestamptz,
 '{"state": "achieved", "pages": 753, "chapters": 46, "gap_from_previous": "5 YEARS - the waiting begins", "split_decision": "Manuscript too large - split by geography not chronology", "pov_characters": ["Cersei", "Jaime", "Brienne", "Sansa (as Alayne)", "Arya", "Samwell", "Aeron Greyjoy", "Victarion", "Asha", "Arianne Martell", "Areo Hotah"], "missing_characters": ["Jon Snow", "Tyrion Lannister", "Daenerys Targaryen", "Bran Stark"], "infamous_author_note": "Meanwhile, back at the Wall...", "new_locations": ["Dorne", "Iron Islands", "Oldtown", "Braavos"], "kingsmoot": "First in 4000 years", "cersei_descent": "POV reveals her paranoia and incompetence", "fan_reaction": "Where is Tyrion? Where is Dany? WHERE IS JON?"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'HBO Acquires TV Rights', 'milestone.business.adaptation', 'completed', '2007-01-01'::timestamptz,
 '{"state": "achieved", "showrunners": ["David Benioff", "D.B. Weiss"], "pitch": "The Sopranos in Middle-earth", "how_they_convinced_grrm": "Correctly answered who Jon Snow''s mother was", "pilot_filmed": "2009 (reshot after poor reception)", "series_order": "2010", "promise": "Faithful adaptation of books", "grrm_involvement": "Wrote one episode per season (S1-S4)", "future_impact": "Massive distraction incoming", "ironic_foreshadowing": "Show would finish before books"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'A Dance with Dragons Published', 'milestone.publication.book5', 'completed', '2011-07-12'::timestamptz,
 '{"state": "achieved", "pages": 1016, "chapters": 73, "gap_from_previous": "5 years 9 months", "parallel_to": "A Feast for Crows (same timeline, different POVs)", "pov_characters": ["Jon Snow", "Tyrion", "Daenerys", "Bran", "Theon (as Reek)", "Davos", "Barristan (NEW)", "Melisandre (NEW)", "Quentyn Martell (NEW)", "Jon Connington (NEW)"], "iconic_moments": ["Jon stabbed by Night''s Watch (For the Watch)", "Tyrion meets Young Griff/Aegon", "Dany rides Drogon", "Theon escapes with Jeyne Poole", "Quentyn tries to tame dragons (Oh)"], "ending_cliffhangers": ["Is Jon dead?", "Where is Dany?", "Will Stannis defeat Boltons?", "Is Aegon real or fake (fAegon)?"], "deadline_pressure": "HBO show premiered 3 months earlier", "fan_mood": "Relieved but worried about future waits"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0006-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Game of Thrones TV Premiere', 'milestone.adaptation.premiere', 'completed', '2011-04-17'::timestamptz,
 '{"state": "achieved", "network": "HBO", "episode": "Winter Is Coming", "budget": "$6M per episode (Season 1)", "cast": ["Sean Bean (Ned)", "Peter Dinklage (Tyrion)", "Emilia Clarke (Dany)", "Kit Harington (Jon)"], "reception": "Critical acclaim, massive viewership", "total_run": {"seasons": 8, "episodes": 73, "years": "2011-2019"}, "impact_on_writing": "Catastrophic distraction - GRRM involved in production", "episodes_written_by_grrm": ["The Pointy End (S1)", "Blackwater (S2)", "The Bear and the Maiden Fair (S3)", "The Lion and the Rose (S4)"], "ending_controversy": {"season_8_rating": "Lowest rated season", "petition_signatures": "1.8 million demanded remake", "bran_king_reaction": "Widespread disbelief"}, "grrm_quote_on_ending": "I do not want to repeat what happened with Game of Thrones"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0007-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Season 8 Backlash & The Petition', 'milestone.adaptation.backlash', 'completed', '2019-05-19'::timestamptz,
 '{"state": "achieved", "petition_launched": "May 9, 2019", "petition_creator": "Dylan D. (Dyson Lovell)", "petition_title": "Remake Game of Thrones Season 8 with competent writers", "signatures": "1.8+ million", "peak_velocity": "500,000 signatures in 24 hours", "criticisms": ["Rushed pacing (6 episodes for final season)", "Daenerys heel-turn too abrupt", "Night King defeated too easily", "Bran the Broken as king unexplained", "Character arcs abandoned (Jaime, Jon)"], "cast_reactions": {"jacob_anderson": "Called petition rude and dismissive of crew efforts", "isaac_hempstead_wright": "Deemed it absurd and ridiculous", "kit_harington": "Defended the ending"}, "grrm_silence": "Conspicuously did not defend the ending publicly", "lasting_impact": "Damaged franchise reputation, influenced spinoff approach", "hbo_response": "No remake, focused on prequels instead"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 3: The Winds of Winter Saga (2011-Present)
-- ============================================
('44444444-0003-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Winds of Winter Announced', 'milestone.announcement.book6', 'completed', '2010-01-01'::timestamptz,
 '{"state": "achieved", "initial_chapters": "4 chapters left over from ADWD", "initial_pages": "100+", "chapters_moved_from_adwd": ["Theon sample chapter", "Parts of Arianne", "Barristan battle setup"], "optimism": "High - just continuing momentum", "narrator": "And so the waiting began..."}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Three Year Estimate Given', 'milestone.estimate.optimistic', 'completed', '2011-04-01'::timestamptz,
 '{"state": "achieved", "quote": "Realistically, it is going to take me three years to finish Winds of Winter", "context": "Interview after ADWD publication", "expected_year": "2014", "actual_result": "14+ years and counting", "accuracy": "0%", "lesson": "Never trust the gardener"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Sample Chapters Released (Torture)', 'milestone.marketing.samples', 'completed', '2016-05-01'::timestamptz,
 '{"state": "achieved", "purpose": "Keep fans interested during long wait", "effect": "Torture - taste of book they cannot have", "chapters_released": {"theon_i": {"date": "2011-12", "event": "Website", "content": "Theon with Stannis at crofters village"}, "arianne_i": {"date": "2013-01", "event": "Website", "content": "Arianne travels to meet Aegon"}, "mercy": {"date": "2014-03", "event": "Website", "content": "Arya as actress, kills Raff the Sweetling"}, "alayne": {"date": "2015-04", "event": "Website", "content": "Sansa at tourney in Vale"}, "arianne_ii": {"date": "2016-05", "event": "Website", "content": "Arianne approaches Storm''s End"}, "the_forsaken": {"date": "2016-05", "event": "Balticon reading", "content": "Aeron Damphair captive of Euron - extremely dark"}}, "readings_at_cons": ["Victarion", "Tyrion I", "Tyrion II", "Barristan I", "Barristan II"], "total_chapters_known": 11}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'First Major Deadline Missed', 'milestone.deadline.missed', 'missed', '2016-01-02'::timestamptz,
 '{"state": "missed", "deadline": "Finish before Season 6 airs (April 2016)", "quote": "The last couple of months I have been pretty good, so I remain optimistic", "result": "Not done", "blog_post_date": "2016-01-02", "blog_post_title": "Last Year (Winds of Winter)", "famous_admission": "I tried. I failed.", "word_count_at_time": "Hundreds of pages short", "fan_reaction": "Sympathetic but frustrated"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'The Show Overtakes the Books', 'milestone.crisis.overtaken', 'completed', '2016-04-24'::timestamptz,
 '{"state": "achieved", "event": "Season 6 Episode 1 - The Red Woman", "major_spoilers_revealed": ["Jon Snow resurrection", "Hodor origin (Hold the Door)", "R+L=J confirmation", "Battle of the Bastards outcome", "Cersei destroys Sept of Baelor", "Dany sails for Westeros"], "author_reaction": "Deep disappointment - wanted books first", "fan_reaction": "Complex emotions - excitement mixed with loss", "quote": "The show has now gone ahead of the books", "lasting_impact": "Every major reveal now spoiled for book readers"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0006-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Neil Gaiman Defense Invoked', 'milestone.cultural.moment', 'completed', '2009-05-12'::timestamptz,
 '{"state": "achieved", "original_post": "Entitlement Issues - Neil Gaiman blog", "famous_quote": "George R.R. Martin is not your bitch", "context": "Fan asked Gaiman if wrong to be frustrated about wait", "gaiman_argument": "Authors are not machines, not on contract to readers, have lives", "advice": "Wait. Read something else. Get on with your life.", "lasting_impact": "Became touchstone in author-reader relationship debates", "still_cited": "Every time someone complains about TWOW"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0007-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'COVID Isolation Progress', 'milestone.progress.actual', 'completed', '2020-12-31'::timestamptz,
 '{"state": "achieved", "progress": "Hundreds and hundreds of pages", "quote": "I am making progress on Winds of Winter", "location": "Remote mountain cabin in New Mexico", "reason": "Pandemic isolation - no conventions, no travel, no distractions", "best_year": "Since Dance with Dragons was completed", "irony": "Global tragedy became writing opportunity", "pages_written_2020": "Significant progress on all fronts"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0008-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Three-Quarters Done Announcement', 'milestone.progress.update', 'completed', '2022-10-01'::timestamptz,
 '{"state": "achieved", "event": "Interview/blog update", "status": "About three-quarters done", "pages_estimate": "~1100-1200 of estimated 1500", "remaining": "~300-400 pages", "context": "First concrete progress update in years", "fan_reaction": "Cautious hope mixed with PTSD from past estimates", "challenge": "Still need to interweave all storylines"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0009-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'No More Predictions Announcement', 'milestone.policy.change', 'completed', '2021-01-01'::timestamptz,
 '{"state": "achieved", "quote": "I will make no predictions on when I will finish. Every time I do, assholes on the Internet take that as a promise, and then wait eagerly to crucify me when I miss the deadline.", "wisdom": "Hard-earned after years of broken promises", "policy": "When it is done, it will be done", "fan_reaction": "Resigned acceptance"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0010-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Still Not Finished (2025)', 'milestone.status.current', 'in_progress', '2025-12-31'::timestamptz,
 '{"state": "in_progress", "pages_written": "~1200+", "years_since_adwd": 14, "challenge": "Interweaving 12+ POV narratives into one cohesive plot", "quote": "It is a challenging book", "major_remaining_work": ["Battle of Ice resolution", "Battle of Fire resolution", "Jon resurrection aftermath", "Tyrion/Dany meeting", "Aegon invasion of Westeros", "Cersei trial by combat"], "convention_updates": "Vague but hopeful", "fan_status": "Permanent state of cautious despair"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0011-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Beware the Butterflies (Deleted Post)', 'milestone.controversy.deleted', 'completed', '2024-07-15'::timestamptz,
 '{"state": "achieved", "blog_title": "Beware the Butterflies", "posted_then_deleted": true, "duration_before_deletion": "Less than 24 hours", "subject": "Criticism of House of the Dragon Season 2 changes", "main_grievance": "Blood and Cheese scene weakened by omitting Prince Maelor", "maelor_issue": {"book_version": "Toddler Maelor present, forced to watch brother die", "show_version": "Maelor cut entirely", "ryan_condal_promise": "Would introduce Maelor later", "condal_reversal": "Decided against including Maelor at all"}, "butterfly_effect_warning": "Changes will weaken Helaena suicide, Bitterbridge riot, and future plot points", "got_comparison": "Worried HOTD going same direction as Game of Thrones finale", "famous_quotes": ["Simpler is not better", "What will we offer the fans instead, once we have killed these butterflies?"], "hbo_response": "Statement defending Condal, emphasizing difficulty of dramatizing core elements", "aftermath": "Post deleted, tension between Martin and showrunners revealed", "fan_reaction": "Screenshots preserved and widely circulated"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0012-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'July 2024: Little Progress Admission', 'milestone.progress.setback', 'completed', '2024-07-01'::timestamptz,
 '{"state": "achieved", "blog_post": "July 2024 update on Not A Blog", "admission": "Made little progress on The Winds of Winter", "pages_written": "Some new pages, far less than hoped", "reason": "Television projects consumed most of time", "projects_blamed": ["House of the Dragon Season 2", "A Knight of the Seven Kingdoms development", "Various other HBO spinoffs"], "tone": "Apologetic but unapologetic", "fan_reaction": "Frustrated resignation", "hope_offered": "None specific", "contrast_with_2020": "COVID isolation was most productive period; 2024 was not"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 4: A Dream of Spring (Theoretical)
-- ============================================
('44444444-0004-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Dream of Spring Conceptualized', 'milestone.planning.theoretical', 'pending', '2030-12-31'::timestamptz,
 '{"state": "not_started", "status": "Exists in GRRM''s mind only", "outline": "Presumably exists - ending shared with D&D", "writing_started": "Unknown - possibly some notes", "fan_expectation": "Approaching zero", "estimated_length": "1500+ pages", "book_number": 7, "final_book": "Supposedly - unless it grows again"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0004-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Ending Known Only to GRRM', 'milestone.secret.ending', 'pending', '2035-12-31'::timestamptz,
 '{"state": "not_started", "shared_with": ["D&D (showrunners) - broad strokes only", "Possibly editors", "Wife Parris"], "differs_from_show": "Confirmed - execution will be very different", "show_ending_elements": {"bran_king": "Likely still happens", "dany_fate": "Similar but better developed", "jon_exile": "Unknown", "kings_landing_destruction": "Probably different"}, "bittersweet_promise": "Tolkien-inspired ending planned", "details": "Classified - GRRM takes to grave if unfinished"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0004-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Robert Jordan Model Rejected', 'milestone.policy.succession', 'completed', '2014-06-01'::timestamptz,
 '{"state": "achieved", "context": "Robert Jordan died before finishing Wheel of Time", "jordan_solution": "Brandon Sanderson completed series from notes", "grrm_position": "Will not allow another author to finish", "quote": "I don''t want anybody else to write about Westeros when I am gone", "instructions_left": "None - or at least none public", "fan_anxiety": "Maximum"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 5: Distractions
-- ============================================
('44444444-0005-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Wild Cards Anthology Editing', 'milestone.distraction.ongoing', 'completed', '2025-02-01'::timestamptz,
 '{"state": "achieved", "description": "Shared-world superhero anthology series started 1987", "origin": "Superworld RPG campaign - GRRM was gamemaster", "role": "Editor and contributor", "volumes_published": 34, "co_editor": "Melinda Snodgrass (later volumes)", "grrm_character": "The Great and Powerful Turtle", "publisher_history": ["Bantam (1987-1993)", "Baen (1993-1995)", "Tor Books (2008-present)"], "time_consumed": "Significant - editing anthology is real work", "fan_reaction": "WHY ARE YOU EDITING WILD CARDS"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'HBO Show Involvement (2011-2019)', 'milestone.distraction.major', 'completed', '2019-05-19'::timestamptz,
 '{"state": "achieved", "seasons": 8, "episodes": 73, "grrm_episodes_written": 4, "involvement_level": "Consultant, producer, occasional writer", "convention_appearances": "Countless - panels, premieres, interviews", "travel": "LA, NYC, London, Belfast", "impact_on_writing": "Major time sink - admitted he should have declined more", "irony": "Show finished 5+ years before next book"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Elden Ring Worldbuilding', 'milestone.distraction.gaming', 'completed', '2022-02-25'::timestamptz,
 '{"state": "achieved", "date": "2019-2022", "collaboration": "FromSoftware / Hidetaka Miyazaki", "contribution": "Mythology and worldbuilding for The Lands Between", "grrm_work": "Wrote the overarching mythos and history before the Shattering", "game_release": "2022-02-25", "metacritic": 96, "copies_sold": "25+ million", "fan_reaction": "Great game, but WRITE THE BOOK GEORGE", "time_spent": "Unknown but clearly substantial"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'House of the Dragon Involvement', 'milestone.distraction.spinoff', 'completed', '2022-08-21'::timestamptz,
 '{"state": "achieved", "premiere": "2022-08-21", "network": "HBO", "role": "Executive Producer and consultant", "source_material": "Fire & Blood (2018)", "showrunner": "Ryan Condal", "seasons_aired": 2, "seasons_planned": 4, "reception": "Much better than GoT S8", "time_cost": "Considerable - active involvement in production", "upcoming": "A Knight of the Seven Kingdoms (Jan 2026)"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Jean Cocteau Cinema Acquired', 'milestone.distraction.local', 'completed', '2013-08-09'::timestamptz,
 '{"state": "achieved", "venue": "Jean Cocteau Cinema", "location": "Santa Fe, New Mexico Railyard District", "acquired": "2013", "history": "Originally opened 1976, closed 2006, GRRM bought entire building", "reopened": "August 9, 2013", "role": "Owner and operator", "associated_businesses": ["Beastly Books", "Milk of the Poppy (bar concept)"], "events": "Film screenings, author events, game nights", "company": "Highgarden Entertainment", "justification": "Supporting local arts and community"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0006-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Constant Convention Appearances', 'milestone.distraction.travel', 'completed', '2019-12-31'::timestamptz,
 '{"state": "achieved", "events": ["WorldCon (annually)", "San Diego Comic-Con", "New York Comic Con", "Balticon", "Loncon", "Sasquan", "Countless others"], "impact": "Cannot write while traveling", "writing_days_lost": "Weeks per year minimum", "fan_demand": "High - people want to see him", "irony": "Same fans who want book also want appearances", "covid_benefit": "2020 - no travel, actual writing progress"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0007-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Fire & Blood Published Instead', 'milestone.distraction.book', 'completed', '2018-11-20'::timestamptz,
 '{"state": "achieved", "date": "2018-11-20", "pages": 736, "content": "History of House Targaryen from Aegon I to Aegon III", "irony": "Published a 736-page book that was NOT Winds of Winter", "purpose": "Source material for House of the Dragon", "fan_reaction": "Grateful but frustrated - WHERE IS TWOW", "justification": "Different kind of writing, clears head"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0008-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Not A Blog Football Posts', 'milestone.distraction.blogging', 'completed', '2024-12-31'::timestamptz,
 '{"state": "achieved", "platform": "LiveJournal (now georgerrmartin.com)", "started": "2006", "nfl_posts": "235+ posts tagged NFL", "teams": ["New York Jets", "New York Giants"], "famous_phrase": "Life is meaningless and full of pain", "usage_of_phrase": {"jets_losses": 23, "giants_losses": 25}, "time_spent": "Unknown but clearly loves football", "fan_reaction": "Stop blogging about Jets and WRITE"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0009-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Snow Sequel Cancelled', 'milestone.distraction.cancelled', 'completed', '2024-06-01'::timestamptz,
 '{"state": "achieved", "project": "Snow - Jon Snow sequel series", "announced": "June 2022 by GRRM on Not A Blog", "star": "Kit Harington attached", "premise": "Jon Snow life after exile beyond the Wall", "development_time": "2022-2024", "status": "Shelved/Cancelled by HBO in 2024", "reason": "Creative differences, changed priorities", "grrm_involvement": "Consulted on scripts", "time_consumed": "Unknown but measurable", "irony": "Even sequel about exile got exiled", "hbo_pivot": "Focusing on prequels instead (HOTD, Knight of Seven Kingdoms)", "door_open": "Not completely ruled out for future", "fan_reaction": "Mixed - some wanted more Jon, others wanted TWOW"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0010-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'A Knight of the Seven Kingdoms Development', 'milestone.distraction.spinoff', 'in_progress', '2026-01-18'::timestamptz,
 '{"state": "in_progress", "series": "A Knight of the Seven Kingdoms", "source": "Tales of Dunk and Egg novellas", "first_season_adapts": "The Hedge Knight", "premiere_date": "January 18, 2026", "network": "HBO / Max", "episodes": 6, "cast": {"ser_duncan_tall": "Peter Claffey", "egg_aegon_targaryen": "Dexter Sol Ansell"}, "filming_location": "Belfast, Northern Ireland", "grrm_role": "Executive Producer, source material author", "time_consumed": "Significant - active involvement", "remaining_novellas": ["The Sworn Sword", "The Mystery Knight"], "unwritten_novellas": ["The She-Wolves of Winterfell", "The Village Hero"], "irony": "Adapting novellas he finished while not finishing TWOW", "fan_hope": "Maybe this motivates him to write more Dunk and Egg"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0011-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'House of the Dragon Season 2', 'milestone.distraction.spinoff', 'completed', '2024-08-04'::timestamptz,
 '{"state": "achieved", "premiere": "June 16, 2024", "finale": "August 4, 2024", "episodes": 8, "network": "HBO / Max", "showrunner": "Ryan Condal (sole showrunner after Miguel Sapochnik departure)", "grrm_role": "Executive Producer, consultant", "source": "Fire & Blood", "reception": "Generally positive, but pacing criticisms", "controversy": "Blood and Cheese changes sparked Beware the Butterflies post", "grrm_involvement_level": "Scripts incorporate his notes before filming", "seasons_planned": 4, "time_consumed": "Considerable - premieres, interviews, script consultations", "fan_reaction": "Better than GOT S8, but WRITE THE BOOK"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0012-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'The Spinoff Empire (5-6 Shows in Development)', 'milestone.distraction.empire', 'in_progress', '2025-12-31'::timestamptz,
 '{"state": "in_progress", "confirmed_projects": {"house_of_the_dragon": {"status": "Airing", "seasons": "4 planned"}, "knight_of_seven_kingdoms": {"status": "Premieres Jan 2026", "seasons": "TBD"}, "ten_thousand_ships": {"status": "In development", "about": "Nymeria and Rhoynar migration"}}, "cancelled_projects": {"snow": "Jon Snow sequel - shelved 2024", "flea_bottom": "Cancelled early", "9_voyages": "Sea Snake show - cancelled"}, "rumored_projects": ["Aegons Conquest animated", "Golden Empire of Yi Ti animated", "Other sequels per GRRM"], "grrm_quote": "Five or six shows in development", "total_time_consumed": "Immeasurable", "twow_impact": "Catastrophic", "business_reality": "HBO needs content, GRRM is the IP"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 6: Fan Relations
-- ============================================
('44444444-0006-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Not A Blog Updates', 'milestone.communication.blog', 'completed', '2006-04-01'::timestamptz,
 '{"state": "achieved", "platform": "Started LiveJournal, now georgerrmartin.com/notablog", "started": "2006", "origin_of_name": "Didnt think hed have time for a real blog", "content_breakdown": {"football": "40%", "wild_cards": "20%", "politics": "15%", "conventions": "15%", "twow_updates": "5%", "other": "5%"}, "frequency": "When inspired", "annual_new_year_post": "Tradition - usually mentions TWOW vaguely"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0006-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'The Waiting Community Forms', 'milestone.community.emergence', 'completed', '2012-01-01'::timestamptz,
 '{"state": "achieved", "subreddit": "r/asoiaf", "members": "1+ million", "founded": "During the long wait", "famous_content_creators": ["Preston Jacobs", "Alt Shift X", "Lucifer Means Lightbringer", "Ideas of Ice and Fire"], "coping_mechanisms": ["Re-reads (47th time)", "Tinfoil theories", "Denial", "Reading other fantasy", "Making memes"], "popular_theories": ["R+L=J (confirmed)", "Cleganebowl (confirmed)", "fAegon Blackfyre", "Grand Northern Conspiracy", "Southron Ambitions"], "memes": ["Sweet summer child", "Get hype", "TWOW when", "George please"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- ============================================
-- MILESTONES - GOAL 7: Legacy (New)
-- ============================================
('44444444-0007-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444',
 'Marriage to Parris McBride', 'milestone.personal.marriage', 'completed', '2011-02-15'::timestamptz,
 '{"state": "achieved", "date": "2011-02-15", "location": "Santa Fe home (small ceremony)", "larger_reception": "WorldCon Reno, August 2011", "met": "1975 at Kubla Khan Sci-Fi convention Nashville", "together_since": "1981 (after his first marriage ended)", "years_before_marriage": 30, "grrm_joke": "Maybe this relationship was going to work out after all", "rings": "Custom Celtic-inspired by local artisans", "parris_request": "Donate to animal charities instead of gifts"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PLANS
-- ============================================
INSERT INTO onto_plans (id, project_id, name, type_key, state_key, props, created_by) VALUES
-- Writing Plans
('44444444-0001-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Original Trilogy Outline', 'plan.creative.outline', 'completed',
 '{"status": "abandoned", "books_planned": 3, "books_actual": "7+", "lesson": "Stories grow in the telling", "tolkien_nod": "Acknowledged"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Gardener Writing Method', 'plan.creative.methodology', 'active',
 '{"philosophy": "Plant seeds, watch them grow", "opposite_of": "Architect (detailed outline)", "advantage": "Organic storytelling", "disadvantage": "Cannot predict completion date"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Five-Year Gap Plan', 'plan.creative.structure', 'completed',
 '{"status": "abandoned", "concept": "Skip 5 years, let characters age", "problem": "Too many flashbacks needed", "solution": "Write everything chronologically", "consequence": "Much longer series"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Split Book 4 Strategy', 'plan.publication.split', 'completed',
 '{"original": "One massive book", "result": "Feast for Crows + Dance with Dragons", "split_by": "Geography/POV characters", "reader_reaction": "Confusion about timeline"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Winds of Winter Completion Plan', 'plan.creative.current', 'active',
 '{"target_pages": 1500, "current_pages": "~1200", "remaining": "~300-400", "challenges": ["Interweaving plots", "Battle of Ice", "Battle of Fire", "Meereen resolution"], "deadline": "When it is done"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Isolation Writing Strategy', 'plan.productivity.isolation', 'completed',
 '{"location": "Remote mountain cabin", "distractions": "Minimized", "internet": "Limited", "best_period": "COVID-19 lockdown 2020", "pages_written": "Hundreds"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0004-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Dream of Spring Planning', 'plan.creative.future', 'draft',
 '{"status": "Theoretical", "depends_on": "Winds of Winter completion", "ending": "Known to author", "timeline": "Unknown", "fan_hope": "Fading"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Distraction Management Protocol', 'plan.productivity.focus', 'completed',
 '{"status": "abandoned", "intended": "Reduce side projects", "actual": "More side projects", "success_rate": "0%", "current_distractions": ["House of the Dragon", "Knight of Seven Kingdoms", "Ten Thousand Ships", "Film projects"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TASKS (Expanded with superfan details)
-- ============================================
INSERT INTO onto_tasks (id, project_id, type_key, title, state_key, priority, due_at, props, created_by) VALUES
-- Early Writing Tasks (1991-1996)
('44444444-0001-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444',
 'task.writing.chapter', 'Write Bran I - The Direwolves', 'done', 1, '1991-06-15'::timestamptz,
 '{"time": "3 days", "inspiration": "Vision came unbidden while writing Avalon", "scene": "Stark children find direwolf pups after execution", "symbolism": "6 pups for 6 children, Ghost (albino runt) for Jon the outsider", "foreshadowing": "Dead mother killed by stag - Baratheons will destroy Starks", "quality": "One of the most iconic fantasy openings ever written"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0001-0002-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.worldbuilding.houses', 'Design the Great Houses of Westeros', 'done', 1, '1994-12-31'::timestamptz,
 '{"great_houses": 9, "houses_designed": {"stark": {"sigil": "Direwolf", "words": "Winter Is Coming", "seat": "Winterfell"}, "lannister": {"sigil": "Lion", "words": "Hear Me Roar (unofficial: A Lannister Always Pays His Debts)", "seat": "Casterly Rock"}, "targaryen": {"sigil": "Three-headed dragon", "words": "Fire and Blood", "seat": "Dragonstone"}, "baratheon": {"sigil": "Crowned stag", "words": "Ours Is The Fury", "seat": "Storm''s End"}, "greyjoy": {"sigil": "Kraken", "words": "We Do Not Sow", "seat": "Pyke"}, "tyrell": {"sigil": "Rose", "words": "Growing Strong", "seat": "Highgarden"}, "martell": {"sigil": "Sun and spear", "words": "Unbowed, Unbent, Unbroken", "seat": "Sunspear"}, "arryn": {"sigil": "Falcon and moon", "words": "As High As Honor", "seat": "The Eyrie"}, "tully": {"sigil": "Leaping trout", "words": "Family, Duty, Honor", "seat": "Riverrun"}}, "family_trees": "Extensive - GRRM tracks all lineages"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0001-0003-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.worldbuilding.institution', 'Develop the Wall and Night''s Watch', 'done', 1, '1994-12-31'::timestamptz,
 '{"height": "700 feet", "length": "300 miles", "age": "8000 years", "builder": "Bran the Builder (legendary)", "purpose": "Keep Others out (forgotten)", "oaths": "Night gathers and now my watch begins...", "castles": "19 castles, only 3 manned by AGOT", "horn_of_winter": "Legendary horn said to bring down the Wall"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0002-0001-000000000002', '44444444-4444-4444-4444-444444444444',
 'task.writing.chapter', 'Write the Red Wedding (Catelyn XI)', 'done', 1, '2000-08-01'::timestamptz,
 '{"book": "A Storm of Swords", "chapter": "Catelyn VII (Chapter 51)", "written": "LAST - avoided until rest of book done", "author_quote": "It was like murdering two of my children", "years_carried": "8 years with Robb, Catelyn", "parris_reaction": "Cried when she read it", "reader_reactions": "Books thrown against walls, into fireplaces", "historical_basis": ["Black Dinner 1440", "Glencoe Massacre 1692"], "foreshadowing": "Bread and salt, The Rains of Castamere, Grey Wind''s behavior", "deaths": ["Robb Stark", "Catelyn Stark", "Grey Wind", "Most of Stark army"], "author_comparison": "Purple Wedding was easy and fun - Joffrey deserved it"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0002-0002-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.mystery', 'Hide R+L=J clues throughout series', 'done', 1, '1996-08-01'::timestamptz,
 '{"theory": "Rhaegar + Lyanna = Jon Snow", "years_of_fan_speculation": "20 (1996-2016)", "clues_planted": ["Ned''s fever dreams of Tower of Joy", "Promise me, Ned", "Blue winter roses", "Ned thinks of Jon when Robert mentions Rhaegar''s children", "Jon''s connection to Ghost (Targaryen isolation)", "Dany''s vision in House of the Undying"], "confirmation": "HBO Season 6 Episode 10 (June 2016)", "grrm_test_for_d&d": "Who is Jon Snow''s mother? - They passed"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- TWOW Tasks (The Long Wait)
('44444444-0003-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444',
 'task.writing.plot', 'Resolve the Meereenese Knot (finally)', 'in_progress', 1, '2026-12-31'::timestamptz,
 '{"description": "Get all characters to Meereen in right order with right information", "characters_converging": ["Tyrion (via Volantis, slavers)", "Victarion (Iron Fleet, dragonbinder horn)", "Quentyn (arrived, died trying to tame dragon)", "Barristan (POV added to cover while Dany gone)", "Marwyn the Mage (still sailing)", "Moqorro (red priest with visions)"], "complications": ["Dany flew off on Drogon", "Tyrion enslaved then freed", "Pale mare plague", "Yunkish siege", "Hizdahr''s loyalty unknown"], "versions_written": "Multiple Quentyn timelines tested", "years_struggling": "10+", "status": "Partially untangled in TWOW"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0002-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.battle', 'Write the Battle of Ice (Winterfell)', 'in_progress', 1, '2026-12-31'::timestamptz,
 '{"location": "Crofters'' Village, outside Winterfell", "combatants": {"stannis_force": ["Stannis Baratheon", "Northmen (Mormonts, Glovers)", "Southron knights", "Asha Greyjoy (captive)"], "bolton_force": ["Roose Bolton", "Ramsay Bolton", "Frey forces", "Manderly forces (secretly anti-Bolton)"]}, "conditions": "Deep winter, blizzards, frozen lakes", "theon_sample_chapter": "Released 2011 - Stannis has Theon", "grand_northern_conspiracy": "Fan theory that Northern lords are plotting Bolton downfall", "manderly_quote": "The North Remembers", "frey_pies": "Wyman Manderly may have fed Freys to Boltons", "differs_from_show": "Stannis still alive in books, very different battle"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0003-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.battle', 'Write the Battle of Fire (Meereen)', 'in_progress', 1, '2026-12-31'::timestamptz,
 '{"location": "Outside Meereen walls", "combatants": {"defenders": ["Barristan Selmy commanding", "Unsullied", "Second Sons (Dany''s sellswords)", "Freedmen"], "attackers": ["Yunkish slave armies", "New Ghis legions", "Volantene fleet (coming)"], "wild_cards": ["Victarion''s Iron Fleet", "Dragons Rhaegal and Viserion (loose)", "Tyrion with Second Sons"]}, "barristan_sample_chapter": "Battle begins with his charge", "victarion_sample_chapter": "Approaching with dragonbinder horn", "tyrion_sample_chapter": "With Second Sons, watching chaos", "complexity": "Multiple POVs, dragons, naval battle, siege warfare"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0004-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.plot', 'Resolve Jon Snow''s fate (For the Watch)', 'in_progress', 1, '2026-12-31'::timestamptz,
 '{"status_end_of_adwd": "Stabbed multiple times by Night''s Watch mutineers", "last_words": "Ghost...", "fan_theories": {"warging": "Consciousness transferred to Ghost", "resurrection": "Melisandre will revive like Beric/Stoneheart", "ice_preservation": "Cold cells preserve body", "azor_ahai": "Death and rebirth fulfill prophecy"}, "show_resolution": "Resurrected by Melisandre S6E2", "book_resolution": "In progress - likely similar but more complex", "consequences": "Released from Night''s Watch vows? Changed personality like Beric? Fire wight?"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0005-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.chapter', 'Write Mercy chapter (Arya kills Raff)', 'done', 2, '2014-03-01'::timestamptz,
 '{"released": "March 2014 on website", "pov": "Arya Stark (as Mercy, actress)", "location": "Braavos", "target": "Raff the Sweetling (Lannister soldier)", "callback": "Raff killed Lommy Greenhands in ACOK", "arya_quote": "Is there gold in the village?", "significance": "First kill from her list in books", "faceless_men": "Arya using skills learned at House of Black and White", "mercy_persona": "Actress in Braavosi theater"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0006-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.chapter', 'Write Alayne chapter (Sansa in Vale)', 'done', 2, '2015-04-01'::timestamptz,
 '{"released": "April 2015 on website", "pov": "Sansa Stark (as Alayne Stone)", "location": "Gates of the Moon, Vale", "event": "Tourney of the Winged Knights", "littlefinger_plan": "Harry the Heir courtship", "harry_hardyng": "Next in line for Vale after sickly Robin", "suitors": "Multiple lords competing for Alayne", "significance": "Sansa learning the game from Littlefinger", "differs_from_show": "No Ramsay storyline in books"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0007-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.chapter', 'Write The Forsaken chapter (Aeron/Euron)', 'done', 2, '2016-05-01'::timestamptz,
 '{"released": "May 2016 at Balticon (reading)", "pov": "Aeron Greyjoy (Damphair)", "location": "Silence (Euron''s ship)", "content": "EXTREMELY dark - Aeron captive of Euron", "euron_plans": "Apocalyptic vision involving Old Gods, R''hllor, and blood magic", "shade_of_the_evening": "Euron forces Aeron to drink", "visions": "Horrifying prophetic nightmares", "fan_reaction": "Euron is terrifying in books, way scarier than show", "tied_to_prow": "Aeron and priests bound to ship for battle", "significance": "Sets up Euron as major endgame villain"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0008-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.structure', 'Interweave all POV narratives', 'in_progress', 1, '2026-12-31'::timestamptz,
 '{"challenge": "12+ POV characters across multiple continents converging", "pov_characters_twow": ["Jon Snow", "Daenerys", "Tyrion", "Arya", "Sansa", "Bran", "Cersei", "Jaime", "Theon", "Arianne", "Victarion", "Barristan", "Aeron", "Connington", "Samwell", "Melisandre"], "quote": "Interweave their narratives to create one cohesive plot", "difficulty": "This is THE main holdup", "timelines": "Must sync events across Westeros and Essos", "biggest_challenge": "Making it flow as novel not just POV anthology"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0009-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.plot', 'Write Aegon/fAegon invasion of Westeros', 'in_progress', 1, '2026-12-31'::timestamptz,
 '{"character": "Aegon VI Targaryen (or Blackfyre pretender?)", "aka": "Young Griff", "raised_by": "Jon Connington (former Hand, exiled)", "claim": "Son of Rhaegar, swapped before Mountain killed him", "fan_debate": "Real Targaryen or Blackfyre pretender (fAegon)?", "arianne_chapters": "Traveling to meet him", "current_action": "Taking Storm''s End, moving on King''s Landing", "not_in_show": "Entire character cut from HBO adaptation", "significance": "Third head of dragon? Or false dragon Dany must defeat?"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Future Tasks (Aspirational)
('44444444-0004-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444',
 'task.writing.book7', 'Start writing A Dream of Spring', 'todo', 1, '2030-12-31'::timestamptz,
 '{"prerequisite": "Finish Winds of Winter", "estimated_start": "Unknown - years away", "estimated_length": "1500+ pages", "fan_patience": "Exhausted", "actuarial_concern": "Non-trivial", "content": "Long Night, final battle with Others, all prophecies resolved, bittersweet ending"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0004-0001-0002-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.finale', 'Write the ending GRRM''s way', 'todo', 1, '2035-12-31'::timestamptz,
 '{"differs_from_show": "Confirmed - same broad strokes, very different execution", "known_endpoints": {"bran_king": "Likely still happens - GRRM told D&D", "dany_fate": "Probably similar but better developed over 2 books", "jon_fate": "Unknown - exile seems show-only", "others_defeat": "Will be more complex than Night King stabbing"}, "show_backlash": "1.7M petition for remake", "grrm_quote": "I do not want to repeat what happened with Game of Thrones", "bittersweet_promise": "Tolkien-style ending planned"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0004-0001-0003-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.writing.plot', 'Resolve Lady Stoneheart arc', 'todo', 2, '2026-12-31'::timestamptz,
 '{"character": "Catelyn Stark - resurrected by Beric Dondarrion", "current_status": "Leading Brotherhood Without Banners, hanging Freys", "brienne_confrontation": "Captured Brienne and Pod in AFFC", "cliffhanger": "Brienne screamed a word - probably Sword (to fight Jaime)", "cut_from_show": "Entirely absent from HBO adaptation", "fan_anticipation": "Major unresolved plot thread", "vengeance": "Methodically killing everyone involved in Red Wedding"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

-- Distraction Tasks (All Done Unfortunately)
('44444444-0005-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444',
 'task.distraction.writing', 'Write HBO episodes S1-S4', 'done', 3, '2014-04-13'::timestamptz,
 '{"episodes_written": ["The Pointy End (S1E8)", "Blackwater (S2E9)", "The Bear and the Maiden Fair (S3E7)", "The Lion and the Rose (S4E2)"], "blackwater": "Considered one of best episodes", "purple_wedding": "Fun to write - Joffrey deserved it", "stopped_after_s4": "Too busy with other obligations", "time_consumed": "Significant - screenplay is different skill"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0001-0002-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.distraction.gaming', 'Write Elden Ring mythology', 'done', 3, '2022-02-25'::timestamptz,
 '{"game": "Elden Ring", "collaboration": "FromSoftware / Hidetaka Miyazaki", "grrm_contribution": "Overarching mythos, The Lands Between history before the Shattering", "demigods": "All children/relatives of Queen Marika", "lore_depth": "Extensive worldbuilding, item descriptions", "release": "February 2022", "metacritic": 96, "copies_sold": "25+ million", "fan_reaction": "Great game, but WHERE IS WINDS OF WINTER GEORGE"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0001-0003-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.distraction.editing', 'Edit Wild Cards Volume 34 (and counting)', 'done', 3, '2025-02-01'::timestamptz,
 '{"series": "Wild Cards", "role": "Editor since 1987", "volumes": 34, "latest": "House Rules (Feb 2025)", "origin": "Superworld RPG campaign", "grrm_character": "The Great and Powerful Turtle", "co_editor": "Melinda Snodgrass", "fan_frustration": "Every new Wild Cards = pages not written for TWOW"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0001-0004-000000000001', '44444444-4444-4444-4444-444444444444',
 'task.distraction.blogging', 'Blog about Jets losses', 'done', 4, '2024-12-31'::timestamptz,
 '{"platform": "Not A Blog", "teams": ["New York Jets", "New York Giants"], "nfl_posts": "235+ tagged", "famous_phrase": "Life is meaningless and full of pain", "jets_usage": 23, "giants_usage": 25, "2023_hope": "Aaron Rodgers signing", "2023_reality": "Rodgers injured play 4, season over", "2024_hope": "Hope springs eternal for football fans", "fan_reaction": "STOP BLOGGING ABOUT JETS AND WRITE"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DECISIONS
-- ============================================
INSERT INTO onto_decisions (id, project_id, title, decision_at, rationale, props, created_by) VALUES
('44444444-0001-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444',
 'Adopt Gardener Writing Philosophy', '1991-06-01'::timestamptz,
 'Chose to discover the story while writing rather than follow a detailed outline - allows for organic character development but makes completion dates impossible to predict',
 '{"type": "decision.creative.methodology", "state": "decided", "choice": "Gardener over Architect", "meaning": "Discover story while writing vs. detailed outline", "consequence": "Cannot predict completion", "regret_level": "Unknown"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0002-0001-000000000003', '44444444-4444-4444-4444-444444444444',
 'Use WordStar 4.0 Forever', '1987-01-01'::timestamptz,
 'Familiarity and lack of distracting features outweigh benefits of modern word processors - writing on DOS machine with 1987 software ensures focus on prose',
 '{"type": "decision.technical.tooling", "state": "decided", "software": "WordStar 4.0", "operating_system": "DOS", "reason": "Familiarity, no distracting features", "year_of_software": "1987", "refusal_to_upgrade": "Absolute"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444',
 'Abandon the Five-Year Gap', '2001-01-01'::timestamptz,
 'Too many flashbacks needed to explain what happened during the gap - decided to write everything chronologically even though it meant longer series',
 '{"type": "decision.creative.structure", "state": "decided", "original_plan": "Skip 5 years in narrative", "problem": "Too many flashbacks", "new_approach": "Write everything chronologically", "impact": "Series became much longer"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0002-0001-000000000003', '44444444-4444-4444-4444-444444444444',
 'Split Book 4 Geographically', '2005-01-01'::timestamptz,
 'Manuscript too large for single book - split by character location with Feast for Crows covering Westeros and Dance with Dragons covering Essos and the Wall',
 '{"type": "decision.publication.structure", "state": "decided", "problem": "Manuscript too large", "solution": "Split by character location", "books": ["Feast for Crows (Westeros)", "Dance with Dragons (Essos + Wall)"], "reader_confusion": "Significant"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0003-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'License to HBO', '2007-01-01'::timestamptz,
 'Substantial payment and promise of faithful adaptation convinced GRRM to license TV rights - partial creative control retained as consultant and producer',
 '{"type": "decision.business.adaptation", "state": "decided", "year": "2007", "showrunners": ["Benioff", "Weiss"], "payment": "Substantial", "creative_control": "Partial", "regret_about_ending": "Documented"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444',
 'Stop Making Deadline Predictions', '2021-01-01'::timestamptz,
 'Every prediction becomes a broken promise and leads to fan disappointment - decided to never estimate completion dates again after years of missed deadlines',
 '{"type": "decision.communication.policy", "state": "decided", "date": "2021", "reason": "Every prediction becomes a broken promise", "quote": "Assholes on the Internet take that as a promise", "wisdom": "Hard-won"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444',
 'Accept Every Side Project', '2011-04-17'::timestamptz,
 'Creative fulfillment from diverse projects justified taking time away from TWOW - side projects provide mental breaks and different creative challenges',
 '{"type": "decision.productivity.fatal", "state": "decided", "projects": ["Wild Cards", "Elden Ring", "House of the Dragon", "Theatre", "Film adaptations"], "impact_on_TWOW": "Devastating", "justification": "Creative fulfillment", "fan_reaction": "WRITE THE BOOK"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0002-0001-000000000003', '44444444-4444-4444-4444-444444444444',
 'Delete the Butterflies Blog Post', '2024-07-16'::timestamptz,
 'Removed critical blog post about House of the Dragon within 24 hours after HBO response - preserved author-network relationship but revealed underlying tensions',
 '{"type": "decision.communication.retraction", "state": "decided", "post_title": "Beware the Butterflies", "posted": "July 15, 2024", "deleted": "July 16, 2024", "content": "Criticism of HOTD S2 Blood and Cheese changes", "reason_for_deletion": "Likely pressure from HBO, preserve relationship", "hbo_response": "Statement defending Ryan Condal", "consequence": "Tension revealed publicly, screenshots preserved forever", "regret_level": "Unknown", "fan_interpretation": "GRRM was right but forced to back down"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0004-0001-000000000003', '44444444-4444-4444-4444-444444444444',
 'Accept HBO Ending the Show Early', '2019-05-19'::timestamptz,
 'Did not push back forcefully enough when HBO chose to end Game of Thrones in 8 seasons rather than the 10+ GRRM envisioned',
 '{"type": "decision.business.regret", "state": "decided", "grrm_preference": "10+ seasons", "hbo_decision": "8 seasons, final two shortened", "showrunner_preference": "End it, move on", "grrm_influence": "Limited - they had the rights", "consequence": "Rushed ending, fan backlash, damaged legacy", "alternative": "Could have pushed for more seasons or later conclusion", "quote": "I do not want to repeat what happened with Game of Thrones", "lesson_applied": "More involvement in HOTD production"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RISKS
-- ============================================
INSERT INTO onto_risks (id, project_id, title, type_key, probability, impact, state_key, props, created_by) VALUES
('44444444-0001-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444',
 'Story Outgrows Original Plan', 'risk.creative.scope', 0.9, 'high', 'occurred',
 '{"planned": "Trilogy", "actual": "7+ books", "mitigation": "None - embraced the growth", "status": "Fully realized"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444',
 'The Meereenese Knot Problem', 'risk.creative.complexity', 0.8, 'critical', 'occurred',
 '{"description": "Plot threads too tangled around Meereen", "years_delayed": "5+", "characters_stuck": ["Daenerys", "Tyrion", "Others"], "resolution": "Partial, ongoing"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444',
 'TV Show Catches Up to Books', 'risk.business.adaptation', 0.9, 'critical', 'occurred',
 '{"occurrence": "Season 6 (2016)", "impact_description": "Major spoilers", "author_feeling": "Disappointment", "mitigation_possible": "No"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0002-0001-000000000004', '44444444-4444-4444-4444-444444444444',
 'Perpetual Distraction Syndrome', 'risk.productivity.distractions', 1.0, 'critical', 'occurred',
 '{"distractions": "Endless", "willpower": "Insufficient", "fan_frustration": "Maximum", "solution": "Not found"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0004-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444',
 'Author Mortality Concerns', 'risk.existential.time', 0.3, 'critical', 'identified',
 '{"author_age": 76, "books_remaining": 2, "average_pace": "6 years per book", "math": "Concerning", "fan_anxiety": "Significant", "author_response": "Still writing"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0004-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Series Never Completed', 'risk.existential.completion', 0.4, 'critical', 'identified',
 '{"scenario": "Author unable to finish", "contingency": "Unknown - refuses to let others finish", "robert_jordan_model": "Rejected", "fan_nightmare": "Real possibility"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0006-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444',
 'Fan Patience Exhaustion', 'risk.community.engagement', 0.9, 'high', 'occurred',
 '{"wait_time": "14+ years for Book 6", "memes": "Abundant", "subreddit_mood": "Cynical", "hope_remaining": "Trace amounts"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0006-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'Ending Already Spoiled by Show', 'risk.creative.spoilers', 0.7, 'high', 'occurred',
 '{"major_reveals": ["Hodor origin", "R+L=J", "Bran as King", "Dany''s fate"], "book_versions": "Will differ in execution", "surprise_factor": "Reduced"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0003-0001-000000000004', '44444444-4444-4444-4444-444444444444',
 'HBO Creative Differences', 'risk.business.relationship', 0.6, 'high', 'occurred',
 '{"manifestation": "Beware the Butterflies deleted blog post (July 2024)", "issue": "GRRM publicly criticized House of the Dragon changes", "hbo_response": "Statement defending showrunner", "tension_points": ["Blood and Cheese scene changes", "Prince Maelor omission", "Butterfly effect concerns"], "precedent": "Similar to Game of Thrones divergences", "mitigation": "Post deleted, but damage done", "ongoing_concern": "Author-showrunner alignment on future seasons"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0003-0001-000000000004', '44444444-4444-4444-4444-444444444444',
 'Spinoff Empire Diluting Focus', 'risk.productivity.overcommitment', 0.9, 'critical', 'occurred',
 '{"shows_in_development": "5-6 per GRRM", "active_involvement": ["House of the Dragon", "A Knight of the Seven Kingdoms"], "cancelled_but_consumed_time": ["Snow sequel", "9 Voyages"], "in_development": ["Ten Thousand Ships", "Aegons Conquest animated"], "executive_producer_duties": "Script review, casting input, promotional appearances", "opportunity_cost": "Every hour on TV is an hour not on TWOW", "financial_incentive": "~$15M per season makes TV very attractive", "fan_frustration": "WRITE THE BOOK"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0004-0001-000000000004', '44444444-4444-4444-4444-444444444444',
 'Fire & Blood Volume 2 Also Pending', 'risk.productivity.parallel_projects', 0.8, 'medium', 'identified',
 '{"book": "Fire & Blood Volume 2 (Blood & Fire)", "content": "Targaryen history from Aegon III to Robert''s Rebellion", "status": "In progress alongside TWOW", "september_2024_update": "A few new pages added", "competition_for_attention": "Another unfinished book waiting", "dependency": "Source material for future HOTD seasons", "fan_concern": "Will GRRM finish either book?", "pages_written": "Unknown", "priority_vs_twow": "TWOW supposedly takes precedence"}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENTS
-- ============================================
INSERT INTO onto_documents (id, project_id, title, type_key, state_key, props, created_by) VALUES
('44444444-0001-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'Original Trilogy Proposal', 'document.business.proposal', 'published',
 '{"date": "1993", "content": "Three-book outline", "accuracy_to_final": "Low", "pages": "Unknown", "agent": "Received with interest"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0002-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'The World of Ice and Fire', 'document.reference.worldbook', 'published',
 '{"date": "2014", "authors": ["GRRM", "Elio Garcia", "Linda Antonsson"], "pages": 326, "content": "Complete history of Westeros", "time_that_could_have_been_spent_on_TWOW": "Considerable"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0002-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'Fire & Blood', 'document.history.targaryen', 'published',
 '{"date": "2018", "pages": 736, "content": "Targaryen history", "source_for": "House of the Dragon", "fan_reaction": "WHERE IS WINDS"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'TWOW Sample Chapters (Released)', 'document.preview.chapters', 'published',
 '{"chapters_released": ["Theon", "Arianne I", "Arianne II", "Mercy", "Alayne", "Tyrion", "Barristan", "Victarion"], "purpose": "Maintain fan interest", "effect": "Torture"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0002-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'Not A Blog: Year-End Updates', 'document.communication.blog', 'published',
 '{"platform": "LiveJournal", "content": "Annual progress updates", "reliability": "Variable", "famous_posts": ["Last Year (Winds of Winter)", "No, Winter is NOT coming"]}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0003-0001-000000000001', '44444444-4444-4444-4444-444444444444',
 'The Infamous 2016 Apology', 'document.communication.apology', 'published',
 '{"date": "2016-01-02", "title": "Last Year (Winds of Winter)", "content": "Detailed explanation of missed deadlines", "quote": "I tried. I failed.", "fan_response": "Sympathetic but frustrated"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0005-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'Elden Ring Lore Documents', 'document.distraction.gaming', 'published',
 '{"date": "2019-2022", "collaboration": "FromSoftware", "content": "Worldbuilding and mythology", "pages_of_TWOW_not_written": "Classified"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0006-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'The No More Predictions Manifesto', 'document.policy.announcement', 'published',
 '{"date": "2021", "quote": "I will make no predictions on when I will finish. Every time I do, assholes on the Internet take that as a promise, and then wait eagerly to crucify me when I miss the deadline.", "wisdom": "Earned through suffering"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0003-0004-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'Beware the Butterflies (Deleted)', 'document.controversy.deleted', 'published',
 '{"date": "2024-07-15", "status": "Deleted within 24 hours of posting", "title": "Beware the Butterflies", "platform": "Not A Blog", "subject": "Criticism of House of the Dragon Season 2", "key_grievances": ["Blood and Cheese scene weakened", "Prince Maelor omitted", "Butterfly effect on future plot points"], "famous_quotes": ["Simpler is not better", "What will we offer the fans instead?"], "preservation": "Screenshots and transcripts circulated widely", "hbo_response": "Statement defending Ryan Condal", "significance": "Revealed author-showrunner tension publicly"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0001-0003-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'The 1993 Letter (Full Leaked Text)', 'document.historical.outline', 'published',
 '{"date": "1993-10", "leaked": "2015 via Waterstones UK Twitter", "pages": 3, "format": "Typewritten letter to agent", "recipient": "Ralph Vicinanza (literary agent)", "content": "Original trilogy outline for A Song of Ice and Fire", "five_survivors": ["Tyrion", "Daenerys", "Jon", "Arya", "Bran"], "shocking_original_plans": {"jon_arya_romance": "Tormented love between supposed half-siblings", "tyrion_villain_arc": "Kills Joffrey, joins Starks for revenge, falls for Arya", "jaime_king": "Kills everyone ahead in succession, takes throne", "sansa_tragedy": "Bears Joffrey a son", "catelyn_death": "Killed by Others beyond Wall", "robb_death": "Dies in battle (not Red Wedding)"}, "accuracy_to_published": "Very low - everything changed", "historical_value": "Shows how stories evolve", "transcript_available": "Tower of the Hand, The Ringer"}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0007-0002-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'Career Before Westeros', 'document.historical.background', 'published',
 '{"early_career": {"first_sale": "The Hero (Galaxy magazine, 1971)", "breakthrough": "A Song for Lya (Hugo Award, 1974)", "novels": ["Dying of the Light (1977)", "Fevre Dream (1982)", "The Armageddon Rag (1983)"]}, "hollywood_years": {"trigger": "Armageddon Rag commercial failure", "twilight_zone": "Staff writer, 1985-1986 revival", "beauty_and_the_beast": "Writer-producer, 1987-1990", "other_work": "Max Headroom, various pilots", "duration": "~10 years in Hollywood"}, "return_to_prose": {"year": "Early 1990s", "catalyst": "Vision of direwolf pups (1991)", "lesson": "TV paid better but prose was his passion"}, "writing_tool": {"software": "WordStar 4.0", "os": "DOS", "year_of_software": 1987, "refuses_to_upgrade": true, "reason": "Does everything needed, no distractions"}, "awards_pre_asoiaf": {"hugos": ["A Song for Lya", "Sandkings", "The Way of Cross and Dragon"], "nebulas": ["A Song for Lya", "Sandkings", "Portraits of His Children"], "world_fantasy": ["Fevre Dream", "The Skin Trade"]}}'::jsonb,
 '00000000-0000-0000-0000-000000000002'),

('44444444-0007-0003-0001-000000000005', '44444444-4444-4444-4444-444444444444',
 'ASOIAF By The Numbers', 'document.statistics.series', 'published',
 '{"book_sales": {"total_worldwide": "90+ million copies", "franchise_value": "Billions (with HBO)"}, "author_earnings": {"net_worth_2024": "~$120 million", "hbo_per_season": "~$15 million", "annual_income": "~$25 million"}, "book_statistics": {"agot": {"published": "1996-08-06", "pages": 694, "chapters": 73}, "acok": {"published": "1998-11-16", "pages": 761, "chapters": 70}, "asos": {"published": "2000-11-08", "pages": 973, "chapters": 82}, "affc": {"published": "2005-10-17", "pages": 753, "chapters": 46}, "adwd": {"published": "2011-07-12", "pages": 1016, "chapters": 73}, "total_pages": 4197, "total_chapters": 344}, "awards": {"hugos": ["AGOT (1997)", "ASOS (2001)", "Blood of the Dragon (1997)"], "locus": "All 5 novels won Locus Fantasy", "nebulas": ["AGOT", "ASOS"]}, "waiting_statistics": {"gap_asos_to_affc": "5 years", "gap_affc_to_adwd": "5 years 9 months", "gap_adwd_to_twow": "14+ years and counting"}}'::jsonb,
 '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- GRAPH EDGES
-- ============================================
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, project_id, props) VALUES
-- Project → Goals (7 goals now)
('project', '44444444-4444-4444-4444-444444444444', 'has_goal', 'goal', '44444444-0001-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('project', '44444444-4444-4444-4444-444444444444', 'has_goal', 'goal', '44444444-0002-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('project', '44444444-4444-4444-4444-444444444444', 'has_goal', 'goal', '44444444-0003-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('project', '44444444-4444-4444-4444-444444444444', 'has_goal', 'goal', '44444444-0004-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('project', '44444444-4444-4444-4444-444444444444', 'has_goal', 'goal', '44444444-0005-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('project', '44444444-4444-4444-4444-444444444444', 'has_goal', 'goal', '44444444-0006-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('project', '44444444-4444-4444-4444-444444444444', 'has_goal', 'goal', '44444444-0007-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Goal 1 → Milestones
('goal', '44444444-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0001-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0001-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0001-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0001-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0001-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0001-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Goal 2 → Milestones
('goal', '44444444-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0002-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0002-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0002-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0002-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0002-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0002-0006-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Goal 3 → Milestones (expanded TWOW saga)
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0006-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0007-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0008-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0009-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0010-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Goal 4 → Milestones (Dream of Spring + Robert Jordan rejection)
('goal', '44444444-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0004-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0004-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0004-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0004-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Goal 5 → Milestones (Distractions - now with Fire & Blood and NFL blogging)
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0006-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0007-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0008-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Goal 6 → Milestones (Fan Relations)
('goal', '44444444-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0006-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0006-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0006-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Goal 7 → Milestones (Legacy)
('goal', '44444444-0007-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0007-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Milestones → Plans
('milestone', '44444444-0001-0002-0000-000000000001', 'has_plan', 'plan', '44444444-0001-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0001-0001-0000-000000000001', 'has_plan', 'plan', '44444444-0001-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0002-0001-0000-000000000001', 'has_plan', 'plan', '44444444-0002-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0002-0003-0000-000000000001', 'has_plan', 'plan', '44444444-0002-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0003-0008-0000-000000000001', 'has_plan', 'plan', '44444444-0003-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0003-0006-0000-000000000001', 'has_plan', 'plan', '44444444-0003-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0004-0001-0000-000000000001', 'has_plan', 'plan', '44444444-0004-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0005-0006-0000-000000000001', 'has_plan', 'plan', '44444444-0005-0001-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Plans → Tasks (expanded with new TWOW tasks)
('plan', '44444444-0001-0002-0001-000000000001', 'has_task', 'task', '44444444-0001-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0001-0002-0001-000000000001', 'has_task', 'task', '44444444-0001-0001-0002-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0001-0002-0001-000000000001', 'has_task', 'task', '44444444-0001-0001-0003-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0001-0005-0000-000000000001', 'has_task', 'task', '44444444-0001-0002-0001-000000000002', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0001-0005-0000-000000000001', 'has_task', 'task', '44444444-0001-0002-0002-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
-- TWOW tasks (expanded)
('plan', '44444444-0003-0001-0001-000000000001', 'has_task', 'task', '44444444-0003-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0003-0001-0001-000000000001', 'has_task', 'task', '44444444-0003-0001-0002-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0003-0001-0001-000000000001', 'has_task', 'task', '44444444-0003-0001-0003-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0003-0001-0001-000000000001', 'has_task', 'task', '44444444-0003-0001-0004-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0003-0001-0001-000000000001', 'has_task', 'task', '44444444-0003-0001-0005-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0003-0001-0001-000000000001', 'has_task', 'task', '44444444-0003-0001-0006-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0003-0001-0001-000000000001', 'has_task', 'task', '44444444-0003-0001-0007-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0003-0001-0001-000000000001', 'has_task', 'task', '44444444-0003-0001-0008-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0003-0001-0001-000000000001', 'has_task', 'task', '44444444-0003-0001-0009-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
-- ADOS tasks
('plan', '44444444-0004-0001-0001-000000000001', 'has_task', 'task', '44444444-0004-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0004-0001-0001-000000000001', 'has_task', 'task', '44444444-0004-0001-0002-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0004-0001-0001-000000000001', 'has_task', 'task', '44444444-0004-0001-0003-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
-- Distraction tasks
('plan', '44444444-0005-0001-0001-000000000001', 'has_task', 'task', '44444444-0005-0001-0001-000000000002', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0005-0001-0001-000000000001', 'has_task', 'task', '44444444-0005-0001-0002-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0005-0001-0001-000000000001', 'has_task', 'task', '44444444-0005-0001-0003-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('plan', '44444444-0005-0001-0001-000000000001', 'has_task', 'task', '44444444-0005-0001-0004-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Milestones → Documents
('milestone', '44444444-0001-0002-0000-000000000001', 'has_document', 'document', '44444444-0001-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0002-0005-0000-000000000001', 'has_document', 'document', '44444444-0001-0002-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0002-0005-0000-000000000001', 'has_document', 'document', '44444444-0002-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0003-0001-0000-000000000001', 'has_document', 'document', '44444444-0003-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0003-0005-0000-000000000001', 'has_document', 'document', '44444444-0003-0002-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0003-0003-0000-000000000001', 'has_document', 'document', '44444444-0003-0003-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0005-0003-0000-000000000001', 'has_document', 'document', '44444444-0005-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0003-0005-0000-000000000001', 'has_document', 'document', '44444444-0006-0001-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Milestones → Decisions
('milestone', '44444444-0001-0001-0000-000000000001', 'has_decision', 'decision', '44444444-0001-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0001-0001-0000-000000000001', 'has_decision', 'decision', '44444444-0001-0002-0001-000000000003', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0002-0001-0000-000000000001', 'has_decision', 'decision', '44444444-0002-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0002-0003-0000-000000000001', 'has_decision', 'decision', '44444444-0002-0002-0001-000000000003', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0002-0004-0000-000000000001', 'has_decision', 'decision', '44444444-0002-0003-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0003-0005-0000-000000000001', 'has_decision', 'decision', '44444444-0003-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0005-0002-0000-000000000001', 'has_decision', 'decision', '44444444-0005-0001-0001-000000000003', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Milestones → Risks
('milestone', '44444444-0001-0005-0000-000000000001', 'has_risk', 'risk', '44444444-0001-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0002-0002-0000-000000000001', 'has_risk', 'risk', '44444444-0002-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0003-0004-0000-000000000001', 'has_risk', 'risk', '44444444-0003-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0005-0006-0000-000000000001', 'has_risk', 'risk', '44444444-0003-0002-0001-000000000004', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0004-0001-0000-000000000001', 'has_risk', 'risk', '44444444-0004-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0004-0002-0000-000000000001', 'has_risk', 'risk', '44444444-0004-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0006-0002-0000-000000000001', 'has_risk', 'risk', '44444444-0006-0001-0001-000000000004', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('milestone', '44444444-0003-0004-0000-000000000001', 'has_risk', 'risk', '44444444-0006-0002-0001-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Cross-cutting causal relationships
-- Vision led to trilogy plan
('milestone', '44444444-0001-0001-0000-000000000001', 'led_to', 'milestone', '44444444-0001-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Initial vision became book proposal"}'::jsonb),
-- Each book enabled the next
('milestone', '44444444-0001-0003-0000-000000000001', 'enabled', 'milestone', '44444444-0001-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Book 1 success enabled Book 2"}'::jsonb),
('milestone', '44444444-0001-0004-0000-000000000001', 'enabled', 'milestone', '44444444-0001-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Growing readership"}'::jsonb),
('milestone', '44444444-0001-0005-0000-000000000001', 'enabled', 'milestone', '44444444-0002-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Trilogy complete, series expands"}'::jsonb),
-- Meereenese Knot caused delays
('milestone', '44444444-0002-0002-0000-000000000001', 'led_to', 'milestone', '44444444-0002-0003-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Plot problems caused 5-year gap between books"}'::jsonb),
-- HBO deal led to distractions
('milestone', '44444444-0002-0004-0000-000000000001', 'led_to', 'milestone', '44444444-0005-0002-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "TV adaptation consumed author time"}'::jsonb),
-- Show overtaking books
('milestone', '44444444-0002-0006-0000-000000000001', 'led_to', 'milestone', '44444444-0003-0004-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Show continued while books stalled"}'::jsonb),
-- Missed deadlines led to no more predictions
('milestone', '44444444-0003-0003-0000-000000000001', 'led_to', 'milestone', '44444444-0003-0005-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Repeated failures led to policy change"}'::jsonb),
-- COVID enabled progress
('milestone', '44444444-0003-0006-0000-000000000001', 'enabled', 'milestone', '44444444-0003-0007-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Isolation allowed focused writing"}'::jsonb),
-- Distractions block completion
('milestone', '44444444-0005-0004-0000-000000000001', 'led_to', 'milestone', '44444444-0003-0008-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Side projects consume writing time"}'::jsonb),
-- TWOW needed for Dream
('milestone', '44444444-0003-0008-0000-000000000001', 'enabled', 'milestone', '44444444-0004-0001-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Cannot start Book 7 until Book 6 done (theoretically)"}'::jsonb),

-- ============================================
-- NEW ENTITY EDGES (2024-2025 additions)
-- ============================================

-- Goal 2 → New Milestone (Season 8 Backlash)
('goal', '44444444-0002-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0002-0007-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Goal 3 → New Milestones (Butterflies controversy, July 2024 update)
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0011-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0003-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0003-0012-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- Goal 5 → New Milestones (Snow cancelled, Knight of Seven Kingdoms, HOTD S2, Spinoff Empire)
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0009-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0010-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0011-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
('goal', '44444444-0005-0000-0000-000000000001', 'has_milestone', 'milestone', '44444444-0005-0012-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- New Milestone → Document edges
-- Butterflies milestone → Butterflies document (deleted blog post)
('milestone', '44444444-0003-0011-0000-000000000001', 'has_document', 'document', '44444444-0003-0004-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
-- 1993 Letter document linked to original trilogy proposal milestone
('milestone', '44444444-0001-0002-0000-000000000001', 'has_document', 'document', '44444444-0001-0003-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
-- Career document linked to Goal 7 first milestone (legacy considerations)
('milestone', '44444444-0007-0001-0000-000000000001', 'has_document', 'document', '44444444-0007-0002-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
-- ASOIAF statistics document linked to legacy milestone
('milestone', '44444444-0007-0001-0000-000000000001', 'has_document', 'document', '44444444-0007-0003-0001-000000000005', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- New Milestone → Decision edges
-- Butterflies deletion decision linked to Butterflies milestone
('milestone', '44444444-0003-0011-0000-000000000001', 'has_decision', 'decision', '44444444-0003-0002-0001-000000000003', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
-- HBO season shortening decision linked to Season 8 backlash milestone
('milestone', '44444444-0002-0007-0000-000000000001', 'has_decision', 'decision', '44444444-0002-0004-0001-000000000003', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- New Milestone → Risk edges
-- HBO Creative Differences risk linked to Butterflies milestone
('milestone', '44444444-0003-0011-0000-000000000001', 'has_risk', 'risk', '44444444-0003-0003-0001-000000000004', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
-- Spinoff dilution risk linked to Spinoff Empire milestone
('milestone', '44444444-0005-0012-0000-000000000001', 'has_risk', 'risk', '44444444-0005-0003-0001-000000000004', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),
-- Fire & Blood Vol 2 pending risk linked to July 2024 update
('milestone', '44444444-0003-0012-0000-000000000001', 'has_risk', 'risk', '44444444-0003-0004-0001-000000000004', '44444444-4444-4444-4444-444444444444', '{}'::jsonb),

-- New causal relationships
-- Season 8 backlash led to more GRRM involvement in HOTD
('milestone', '44444444-0002-0007-0000-000000000001', 'led_to', 'milestone', '44444444-0005-0011-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Season 8 backlash motivated deeper involvement in spinoffs"}'::jsonb),
-- HOTD S2 led to Butterflies controversy
('milestone', '44444444-0005-0011-0000-000000000001', 'led_to', 'milestone', '44444444-0003-0011-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Creative differences over HOTD S2 changes sparked the blog post"}'::jsonb),
-- Butterflies controversy led to July 2024 admission of little progress
('milestone', '44444444-0003-0011-0000-000000000001', 'led_to', 'milestone', '44444444-0003-0012-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Same month - controversy and TWOW update both in July 2024"}'::jsonb),
-- Snow sequel cancellation enabled Knight of Seven Kingdoms focus
('milestone', '44444444-0005-0009-0000-000000000001', 'enabled', 'milestone', '44444444-0005-0010-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Cancelling Snow freed resources for Knight of Seven Kingdoms"}'::jsonb),
-- Spinoff Empire created by multiple shows in development
('milestone', '44444444-0005-0010-0000-000000000001', 'led_to', 'milestone', '44444444-0005-0012-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "Each new show adds to the spinoff empire"}'::jsonb),
('milestone', '44444444-0005-0011-0000-000000000001', 'led_to', 'milestone', '44444444-0005-0012-0000-000000000001', '44444444-4444-4444-4444-444444444444', '{"context": "HOTD success spawned more spinoffs"}'::jsonb)
;

-- ============================================
-- COMPLETION NOTICE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'A Song of Ice and Fire: The Writing - v1.0';
  RAISE NOTICE 'THE NEVER-ENDING STORY (SATIRICAL EDITION)';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Project ID: 44444444-4444-4444-4444-444444444444';
  RAISE NOTICE '';
  RAISE NOTICE 'TIMELINE:';
  RAISE NOTICE '  1991: Vision in summer snow';
  RAISE NOTICE '  1996: A Game of Thrones';
  RAISE NOTICE '  1998: A Clash of Kings';
  RAISE NOTICE '  2000: A Storm of Swords';
  RAISE NOTICE '  2005: A Feast for Crows (5 year gap begins)';
  RAISE NOTICE '  2011: A Dance with Dragons';
  RAISE NOTICE '  2011-????: The Winds of Winter (14+ years)';
  RAISE NOTICE '  ????: A Dream of Spring (fan hopium)';
  RAISE NOTICE '';
  RAISE NOTICE 'WRITING STATUS:';
  RAISE NOTICE '  Books Published: 5';
  RAISE NOTICE '  Books Remaining: 2';
  RAISE NOTICE '  TWOW Progress: ~75%% (~1200/1500 pages)';
  RAISE NOTICE '  Deadlines Missed: Countless';
  RAISE NOTICE '  Distractions Accepted: All of them';
  RAISE NOTICE '';
  RAISE NOTICE 'ENTITY COUNTS:';
  RAISE NOTICE '  - 7 Goals (1 failed: Resist Distractions)';
  RAISE NOTICE '  - 33 Milestones (+7 new: Season 8 backlash, Butterflies, etc.)';
  RAISE NOTICE '  - 8 Plans (2 abandoned)';
  RAISE NOTICE '  - 18 Tasks';
  RAISE NOTICE '  - 9 Decisions (+2 new)';
  RAISE NOTICE '  - 11 Risks (+3 new, most occurred)';
  RAISE NOTICE '  - 12 Documents (+4 new)';
  RAISE NOTICE '  - 100+ Graph Edges (+20 new connections)';
  RAISE NOTICE '';
  RAISE NOTICE 'FAMOUS QUOTES:';
  RAISE NOTICE '  "I will make no predictions..."';
  RAISE NOTICE '  "It is a challenging book."';
  RAISE NOTICE '  "The gardener plants seeds..."';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Project end_at is NULL because who knows';
  RAISE NOTICE '==============================================';
END$$;

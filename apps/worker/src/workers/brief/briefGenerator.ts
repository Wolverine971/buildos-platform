// worker-queue/src/workers/brief/briefGenerator.ts
import { supabase } from "../../lib/supabase";
import { BriefJobData } from "../shared/queueUtils";

import { format, parseISO } from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import type { Database } from "@buildos/shared-types";
import { getHoliday } from "../../lib/utils/holiday-finder";
import { SmartLLMService } from "../../lib/services/smart-llm-service";
import { DailyBriefAnalysisPrompt, DailyBriefAnalysisProject } from "./prompts";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Note = Database["public"]["Tables"]["notes"]["Row"];
export type Phase = Database["public"]["Tables"]["phases"]["Row"];
export type PhaseTask = Database["public"]["Tables"]["phase_tasks"]["Row"];
export type TaskCalendarEvent =
  Database["public"]["Tables"]["task_calendar_events"]["Row"];

export interface TaskWithCalendarEvent extends Task {
  task_calendar_events?: TaskCalendarEvent[];
}

export interface ProjectWithRelations extends Project {
  tasks: TaskWithCalendarEvent[];
  notes: Note[];
  phases: Phase[];
  phaseTasks: PhaseTask[];
}

// Helper function to get the start and end of a day in a specific timezone
function getDayBoundsInTimezone(
  date: Date | string,
  timezone: string,
): { start: Date; end: Date } {
  // Convert the date to the user's timezone
  const dateInTz = typeof date === "string" ? parseISO(date) : date;
  const zonedDate = utcToZonedTime(dateInTz, timezone);

  // Get start of day in user's timezone (00:00:00)
  const startOfDayInTz = new Date(zonedDate);
  startOfDayInTz.setHours(0, 0, 0, 0);

  // Get end of day in user's timezone (23:59:59.999)
  const endOfDayInTz = new Date(zonedDate);
  endOfDayInTz.setHours(23, 59, 59, 999);

  // Convert back to UTC for database comparison
  return {
    start: zonedTimeToUtc(startOfDayInTz, timezone),
    end: zonedTimeToUtc(endOfDayInTz, timezone),
  };
}

// Convert a UTC timestamp to a date string in the user's timezone
function getDateInTimezone(timestamp: string | Date, timezone: string): string {
  const date = typeof timestamp === "string" ? parseISO(timestamp) : timestamp;
  const zonedDate = utcToZonedTime(date, timezone);
  return format(zonedDate, "yyyy-MM-dd");
}

export async function generateDailyBrief(
  userId: string,
  briefDate: string,
  options: BriefJobData["options"],
  timezone: string,
  jobId?: string,
): Promise<any> {
  // Fetch user's timezone if not provided
  let userTimezone = timezone;
  if (!userTimezone) {
    const { data: preferences } = await supabase
      .from("user_brief_preferences")
      .select("timezone")
      .eq("user_id", userId)
      .single();

    userTimezone = preferences?.timezone || "UTC";
  }

  console.log(
    `📝 Processing daily brief for user ${userId} on ${briefDate} (timezone: ${userTimezone})`,
  );

  // Calculate the actual date in the user's timezone
  const briefDateInUserTz =
    briefDate || getDateInTimezone(new Date(), userTimezone);

  // Atomic create or update using upsert with conflict resolution
  const briefMetadata = {
    queue_job_id: jobId,
    generated_via: "railway_worker",
    timezone: userTimezone,
  };

  // First, try to get existing brief metadata to preserve it
  const { data: existingBrief } = await supabase
    .from("daily_briefs")
    .select("metadata")
    .eq("user_id", userId)
    .eq("brief_date", briefDateInUserTz)
    .single();

  // Merge existing metadata with new metadata
  const mergedMetadata = {
    ...(typeof existingBrief?.metadata === "object" &&
    existingBrief?.metadata !== null
      ? existingBrief.metadata
      : {}),
    ...briefMetadata,
  };

  // Use atomic upsert operation - this handles both create and update cases
  const { data: dailyBrief, error } = await supabase
    .from("daily_briefs")
    .upsert(
      {
        user_id: userId,
        brief_date: briefDateInUserTz,
        summary_content: "", // Will only be set on first creation
        generation_status: "processing",
        generation_started_at: new Date().toISOString(),
        generation_progress: { step: "starting", progress: 0 },
        metadata: mergedMetadata,
      },
      {
        onConflict: "user_id, brief_date",
        ignoreDuplicates: false, // Always update if exists
      },
    )
    .select()
    .single();

  if (error) {
    // Check if error is due to concurrent generation
    if (error.code === "23505") {
      // Unique constraint violation
      throw new Error("Brief generation already in progress for this date");
    }
    throw error;
  }

  try {
    // 1. Get user's active projects with all related data
    await updateProgress(
      dailyBrief.id,
      { step: "fetching_projects", progress: 10 },
      jobId,
    );

    const projects = await getUserProjectsWithData(userId, options);

    if (!projects || projects.length === 0) {
      throw new Error("No active projects found for user");
    }

    console.log(`📊 Found ${projects.length} projects for user ${userId}`);

    // 2. Generate briefs for each project
    await updateProgress(
      dailyBrief.id,
      { step: "generating_project_briefs", progress: 20 },
      jobId,
    );

    const projectBriefs: any[] = [];

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      const progress = 20 + (i / projects.length) * 60; // 20% to 80%

      await updateProgress(
        dailyBrief.id,
        {
          step: `processing_project_${project.name}`,
          progress: Math.round(progress),
        },
        jobId,
      );

      try {
        const projectBrief = await generateProjectBrief(
          project,
          briefDateInUserTz,
          userTimezone,
        );
        projectBriefs.push(projectBrief);
        console.log(`📄 Generated brief for project: ${project.name}`);
      } catch (error) {
        console.warn(
          `⚠️ Failed to generate brief for project ${project.name}:`,
          error,
        );
        // Continue with other projects
      }
    }

    // 3. Consolidate all project briefs into main daily brief
    await updateProgress(
      dailyBrief.id,
      { step: "consolidating_briefs", progress: 85 },
      jobId,
    );

    const mainBriefContent = generateMainBrief(
      projectBriefs,
      briefDateInUserTz,
      userTimezone,
    );
    const priorityActions = extractPriorityActions(mainBriefContent);

    let llmAnalysis: string | null = null;
    const analysisProjects: DailyBriefAnalysisProject[] =
      buildDailyBriefAnalysisProjects(projectBriefs);

    if (analysisProjects.length > 0) {
      await updateProgress(
        dailyBrief.id,
        { step: "llm_analysis", progress: 90 },
        jobId,
      );

      try {
        const llmService = new SmartLLMService({
          httpReferer: "https://build-os.com",
          appName: "BuildOS Daily Brief Worker",
        });

        const analysisPrompt = DailyBriefAnalysisPrompt.buildUserPrompt({
          date: briefDateInUserTz,
          timezone: userTimezone,
          mainBriefMarkdown: trimMarkdownForPrompt(mainBriefContent),
          projects: analysisProjects,
          priorityActions,
        });

        llmAnalysis = await llmService.generateText({
          prompt: analysisPrompt,
          userId,
          profile: "quality",
          temperature: 0.4,
          maxTokens: 2200,
          systemPrompt: DailyBriefAnalysisPrompt.getSystemPrompt(),
        });
      } catch (analysisError) {
        console.error(
          "Failed to generate LLM analysis for daily brief:",
          analysisError,
        );
      }
    }

    // 4. Update the daily brief with final content
    await updateProgress(
      dailyBrief.id,
      { step: "finalizing", progress: 95 },
      jobId,
    );

    const { data: finalBrief, error: updateError } = await supabase
      .from("daily_briefs")
      .update({
        summary_content: mainBriefContent,
        priority_actions: priorityActions,
        project_brief_ids: projectBriefs.map((b) => b.id),
        llm_analysis: llmAnalysis,
        generation_status: "completed",
        generation_completed_at: new Date().toISOString(),
        generation_progress: { step: "completed", progress: 100 },
      })
      .eq("id", dailyBrief.id)
      .select()
      .single();

    if (updateError) throw updateError;

    console.log(`🎉 Daily brief generated successfully for user ${userId}`);
    return finalBrief;
  } catch (error) {
    await supabase
      .from("daily_briefs")
      .update({
        generation_status: "failed",
        generation_error:
          error instanceof Error ? error.message : "Unknown error",
        generation_completed_at: new Date().toISOString(),
      })
      .eq("id", dailyBrief.id);

    throw error;
  }
}

async function getUserProjectsWithData(
  userId: string,
  options?: BriefJobData["options"],
): Promise<ProjectWithRelations[]> {
  // Get user's active projects
  let projectsQuery = supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");

  if (options?.includeProjects?.length) {
    projectsQuery = projectsQuery.in("id", options.includeProjects);
  }

  if (options?.excludeProjects?.length) {
    projectsQuery = projectsQuery.not(
      "id",
      "in",
      `(${options.excludeProjects.join(",")})`,
    );
  }

  const { data: projects, error: projectsError } = await projectsQuery;
  if (projectsError) throw projectsError;

  if (!projects || projects.length === 0) {
    return [];
  }

  const projectIds = projects.map((p) => p.id);

  // Get all related data in parallel (including task_calendar_events)
  const [
    tasksResponse,
    notesResponse,
    phasesResponse,
    phaseTasksResponse,
    calendarEventsResponse,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .in("project_id", projectIds)
      .eq("outdated", false)
      .order("updated_at", { ascending: false }),

    supabase
      .from("notes")
      .select("*")
      .in("project_id", projectIds)
      .order("updated_at", { ascending: false }),

    supabase
      .from("phases")
      .select("*")
      .in("project_id", projectIds)
      .order("order", { ascending: true }),

    supabase.from("phase_tasks").select("*"),

    supabase.from("task_calendar_events").select("*").eq("user_id", userId),
  ]);

  const tasks = tasksResponse.data || [];
  const notes = notesResponse.data || [];
  const phases = phasesResponse.data || [];
  const phaseTasks = phaseTasksResponse.data || [];
  const calendarEvents = calendarEventsResponse.data || [];

  // Attach calendar events to tasks
  const tasksWithCalendarEvents: TaskWithCalendarEvent[] = tasks.map(
    (task) => ({
      ...task,
      task_calendar_events: calendarEvents.filter(
        (event) => event.task_id === task.id,
      ),
    }),
  );

  // Organize data by project
  return projects.map((project) => ({
    ...project,
    tasks: tasksWithCalendarEvents.filter((t) => t.project_id === project.id),
    notes: notes.filter((n) => n.project_id === project.id),
    phases: phases.filter((p) => p.project_id === project.id),
    phaseTasks: phaseTasks.filter((pt) =>
      phases.some(
        (phase) => phase.id === pt.phase_id && phase.project_id === project.id,
      ),
    ),
  }));
}

async function generateProjectBrief(
  project: ProjectWithRelations,
  briefDate: string,
  timezone: string,
) {
  // Get the bounds of "today" in the user's timezone
  const todayBounds = getDayBoundsInTimezone(briefDate, timezone);

  // Get current phase
  const currentPhase = getCurrentPhase(project.phases, briefDate, timezone);

  // Get today's tasks (tasks that start within today in the user's timezone)
  const todaysTasks = project.tasks.filter((task: TaskWithCalendarEvent) => {
    if (!task.start_date || task.outdated || task.status === "done")
      return false;
    const taskStartDate = parseISO(task.start_date);
    return (
      taskStartDate >= todayBounds.start && taskStartDate <= todayBounds.end
    );
  });

  // Get overdue tasks (tasks before today that aren't done)
  const overdueTasks = getOverdueTasks(project.tasks, briefDate, timezone);

  // Get upcoming tasks based on whether project has phases
  let upcomingTasks: TaskWithCalendarEvent[] = [];
  if (currentPhase) {
    // Get tasks in current phase from today forward (limit 10)
    upcomingTasks = getUpcomingPhaseTasksFromToday(
      project.tasks,
      project.phaseTasks,
      currentPhase.id,
      briefDate,
      timezone,
    );
  } else {
    // Get next 10 upcoming tasks for projects without phases
    upcomingTasks = getNext10UpcomingTasks(project.tasks, briefDate, timezone);
  }

  // Get tasks starting within the next 7 days (exclusive of today)
  const nextSevenDaysTasks = getUpcomingTasks(
    project.tasks,
    briefDate,
    timezone,
  );

  // Get recently completed tasks (last 24 hours)
  const recentlyCompletedTasks = getRecentlyCompletedTasks(
    project.tasks,
    briefDate,
    timezone,
  );

  // Get recent notes (last 7 days)
  const recentNotes = getRecentNotes(project.notes, briefDate, timezone);

  // Get all tasks in current phase (for phase display)
  const currentPhaseTasks = currentPhase
    ? getCurrentPhaseTasks(project.tasks, project.phaseTasks, currentPhase.id)
    : [];

  // Generate the brief content
  const briefContent = formatProjectBrief({
    project,
    currentPhase,
    todaysTasks,
    overdueTasks,
    upcomingTasks,
    recentlyCompletedTasks,
    recentNotes,
    currentPhaseTasks,
    phaseTasks: project.phaseTasks || [],
    timezone,
  });

  // Save project brief to database
  const { data: savedBrief, error } = await supabase
    .from("project_daily_briefs")
    .upsert(
      {
        project_id: project.id,
        user_id: project.user_id as string,
        brief_date: briefDate,
        brief_content: briefContent,
        generation_status: "completed",
        generation_started_at: new Date().toISOString(),
        generation_completed_at: new Date().toISOString(),
        metadata: {
          current_phase_name: currentPhase?.name || null,
          current_phase_id: currentPhase?.id,
          todays_task_count: todaysTasks.length,
          overdue_task_count: overdueTasks.length,
          upcoming_task_count: upcomingTasks.length,
          next_seven_days_task_count: nextSevenDaysTasks.length,
          recently_completed_count: recentlyCompletedTasks.length,
          recent_notes_count: recentNotes.length,
        },
      },
      {
        onConflict: "project_id,brief_date",
        ignoreDuplicates: false,
      },
    )
    .select()
    .single();

  if (error) throw error;

  const analysisContext = {
    description: project.description || null,
    current_phase: currentPhase
      ? {
          id: currentPhase.id,
          name: currentPhase.name,
          start_date: currentPhase.start_date,
          end_date: currentPhase.end_date,
        }
      : null,
    todays_tasks: todaysTasks.map((task) =>
      mapTaskForAnalysis(task, project.id, timezone),
    ),
    next_seven_days_tasks: nextSevenDaysTasks.map((task) =>
      mapTaskForAnalysis(task, project.id, timezone),
    ),
    overdue_tasks: overdueTasks.map((task) =>
      mapTaskForAnalysis(task, project.id, timezone),
    ),
    recently_completed_tasks: recentlyCompletedTasks.map((task) =>
      mapTaskForAnalysis(task, project.id, timezone, true),
    ),
    recent_notes: recentNotes.map((note) =>
      mapNoteForAnalysis(note, project.id, timezone),
    ),
  };

  return {
    ...savedBrief,
    project_name: project.name,
    project_id: project.id,
    project_description: project.description || null,
    analysis_context: analysisContext,
  };
}

function getCurrentPhase(phases: Phase[], briefDate: string, timezone: string) {
  if (!phases || phases.length === 0) return null;

  // For phase dates (which are just dates without timezone),
  // we interpret them as being in the user's timezone
  const todayInUserTz = briefDate;

  return (
    phases.find((phase) => {
      if (!phase.start_date || !phase.end_date) return false;
      // Phase dates are simple dates, so direct string comparison works
      return (
        phase.start_date <= todayInUserTz && phase.end_date >= todayInUserTz
      );
    }) || null
  );
}

function getOverdueTasks(
  tasks: TaskWithCalendarEvent[],
  briefDate: string,
  timezone: string,
) {
  const todayBounds = getDayBoundsInTimezone(briefDate, timezone);

  return tasks
    .filter((task: TaskWithCalendarEvent) => {
      if (!task.start_date || task.status === "done" || task.outdated)
        return false;
      const taskStartDate = parseISO(task.start_date);
      // Task starts before today
      return taskStartDate < todayBounds.start;
    })
    .sort((a: TaskWithCalendarEvent, b: TaskWithCalendarEvent) => {
      const dateA = parseISO(a.start_date!);
      const dateB = parseISO(b.start_date!);
      return dateB.getTime() - dateA.getTime(); // Most recent overdue first
    });
}

function getUpcomingPhaseTasksFromToday(
  tasks: TaskWithCalendarEvent[],
  phaseTasks: PhaseTask[],
  phaseId: string,
  briefDate: string,
  timezone: string,
) {
  const todayBounds = getDayBoundsInTimezone(briefDate, timezone);
  const phaseTaskIds = phaseTasks
    .filter((pt) => pt.phase_id === phaseId)
    .map((pt) => pt.task_id);

  return tasks
    .filter((task: TaskWithCalendarEvent) => {
      if (!task.start_date || task.status === "done" || task.outdated)
        return false;
      if (!phaseTaskIds.includes(task.id)) return false;
      const taskStartDate = parseISO(task.start_date);
      // Task starts from today forward
      return taskStartDate >= todayBounds.start;
    })
    .sort((a, b) => {
      const dateA = parseISO(a.start_date!);
      const dateB = parseISO(b.start_date!);
      return dateA.getTime() - dateB.getTime();
    })
    .slice(0, 10); // Limit to 10 tasks
}

function getNext10UpcomingTasks(
  tasks: TaskWithCalendarEvent[],
  briefDate: string,
  timezone: string,
) {
  const todayBounds = getDayBoundsInTimezone(briefDate, timezone);

  return tasks
    .filter((task: TaskWithCalendarEvent) => {
      if (!task.start_date || task.status === "done" || task.outdated)
        return false;
      const taskStartDate = parseISO(task.start_date);
      // Task starts from today forward
      return taskStartDate >= todayBounds.start;
    })
    .sort((a: TaskWithCalendarEvent, b: TaskWithCalendarEvent) => {
      const dateA = parseISO(a.start_date!);
      const dateB = parseISO(b.start_date!);
      return dateA.getTime() - dateB.getTime();
    })
    .slice(0, 10); // Get next 10 tasks
}

function getUpcomingTasks(
  tasks: TaskWithCalendarEvent[],
  briefDate: string,
  timezone: string,
) {
  // Get bounds for today and next 7 days in user's timezone
  const todayBounds = getDayBoundsInTimezone(briefDate, timezone);
  const nextWeekDate = new Date(todayBounds.end);
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);

  return tasks
    .filter((task: TaskWithCalendarEvent) => {
      if (!task.start_date || task.status === "done" || task.outdated)
        return false;
      const taskStartDate = parseISO(task.start_date);
      // Task starts after today but within next 7 days
      return taskStartDate > todayBounds.end && taskStartDate <= nextWeekDate;
    })
    .sort((a: TaskWithCalendarEvent, b: TaskWithCalendarEvent) => {
      const dateA = parseISO(a.start_date!);
      const dateB = parseISO(b.start_date!);
      return dateA.getTime() - dateB.getTime();
    });
}

function getRecentlyCompletedTasks(
  tasks: TaskWithCalendarEvent[],
  briefDate: string,
  timezone: string,
) {
  const todayBounds = getDayBoundsInTimezone(briefDate, timezone);
  const twentyFourHoursAgo = new Date(todayBounds.start);
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  return tasks
    .filter((task: TaskWithCalendarEvent) => {
      if (task.status !== "done" || !task.updated_at) return false;
      const updatedDate = parseISO(task.updated_at);
      return (
        updatedDate >= twentyFourHoursAgo && updatedDate <= todayBounds.end
      );
    })
    .sort((a: TaskWithCalendarEvent, b: TaskWithCalendarEvent) => {
      const dateA = parseISO(a.updated_at!);
      const dateB = parseISO(b.updated_at!);
      return dateB.getTime() - dateA.getTime();
    });
}

function getRecentNotes(notes: Note[], briefDate: string, timezone: string) {
  const todayBounds = getDayBoundsInTimezone(briefDate, timezone);
  const sevenDaysAgo = new Date(todayBounds.start);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return notes
    .filter((note: Note) => {
      const noteDate = parseISO(note.updated_at);
      return noteDate >= sevenDaysAgo;
    })
    .sort((a: Note, b: Note) => {
      const dateA = parseISO(a.updated_at);
      const dateB = parseISO(b.updated_at);
      return dateB.getTime() - dateA.getTime();
    })
    .slice(0, 5);
}

function getCurrentPhaseTasks(
  tasks: TaskWithCalendarEvent[],
  phaseTasks: PhaseTask[],
  phaseId: string,
): TaskWithCalendarEvent[] {
  const phaseTaskIds = phaseTasks
    .filter((pt) => pt.phase_id === phaseId)
    .map((pt) => pt.task_id);

  return tasks
    .filter(
      (task: TaskWithCalendarEvent) =>
        phaseTaskIds.includes(task.id) && !task.outdated,
    )
    .sort((a, b) => {
      // Sort by start_date within the phase
      if (!a.start_date && !b.start_date) return 0;
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return (
        parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime()
      );
    });
}

function formatTaskWithDetails(
  task: TaskWithCalendarEvent,
  projectId: string,
  timezone: string,
  showCompletedDate: boolean = false,
): string {
  const status = getTaskStatusIcon(task);
  let result = `- ${status} [${task.title}](/projects/${projectId}/tasks/${task.id})`;

  if (task.priority && task.priority !== "medium") {
    result += ` (${task.priority} priority)`;
  }

  if (showCompletedDate && task.updated_at) {
    // Show updated_at for completed tasks
    result += ` - Completed ${formatDateInTimezone(task.updated_at, timezone)}`;
  } else if (task.start_date) {
    result += ` - ${formatDateInTimezone(task.start_date, timezone)}`;
  }

  // Add calendar indicator if scheduled
  if (task.task_calendar_events && task.task_calendar_events.length > 0) {
    result += " 📅";
  }

  result += "\n";

  // Add description preview if available
  if (task.description) {
    const preview = trimText(task.description, 225, 295);
    result += `  *Description: ${preview}*\n`;
  }

  // Add details preview if available
  if (task.details) {
    const preview = trimText(task.details, 225, 295);
    result += `  *${preview}*\n`;
  }

  return result;
}

function formatNoteWithPreview(
  note: Note,
  projectId: string,
  timezone: string,
): string {
  let result = `- [${note.title || "Untitled Note"}](/projects/${projectId}/notes/${note.id}) - ${formatDateInTimezone(note.updated_at, timezone, true)}\n`;

  if (note.content) {
    const preview = trimText(note.content, 225, 295);
    result += `  *${preview}*\n`;
  }

  return result;
}

function trimText(text: string, minLength: number, maxLength: number): string {
  if (!text) return "";

  // If text is shorter than minLength, return as is
  if (text.length <= minLength) {
    return text.trim();
  }

  // If text is between minLength and maxLength, look for sentence end
  if (text.length <= maxLength) {
    // Check if text ends with sentence punctuation
    if (text.match(/[.!?]$/)) {
      return text.trim();
    }
  }

  // Look for sentence endings between minLength and maxLength
  const sentenceEnders = /[.!?](?:\s|$)/g;
  let match;
  let lastValidEnd = -1;

  while ((match = sentenceEnders.exec(text)) !== null) {
    if (match.index >= minLength && match.index <= maxLength) {
      lastValidEnd = match.index + 1;
    }
    if (match.index > maxLength) {
      break;
    }
  }

  // If we found a sentence ending in the range, use it
  if (lastValidEnd !== -1) {
    return text.substring(0, lastValidEnd).trim();
  }

  // Otherwise, find the last space before maxLength
  const trimmed = text.substring(0, maxLength);
  const lastSpaceIndex = trimmed.lastIndexOf(" ");

  if (lastSpaceIndex > minLength) {
    return text.substring(0, lastSpaceIndex).trim() + "...";
  }

  // If no good break point, just cut at maxLength
  return trimmed.trim() + "...";
}

function trimMarkdownForPrompt(
  markdown: string,
  maxLength: number = 8000,
): string {
  if (!markdown) return "";
  if (markdown.length <= maxLength) {
    return markdown;
  }
  const truncated = markdown.slice(0, maxLength);
  return `${truncated}\n\n... (content truncated for analysis prompt)`;
}

function formatProjectBrief(data: {
  project: Project;
  currentPhase: Phase | null;
  todaysTasks: TaskWithCalendarEvent[];
  overdueTasks: TaskWithCalendarEvent[];
  upcomingTasks: TaskWithCalendarEvent[];
  recentlyCompletedTasks: TaskWithCalendarEvent[];
  recentNotes: Note[];
  currentPhaseTasks: TaskWithCalendarEvent[];
  phaseTasks: PhaseTask[];
  timezone: string;
}) {
  const {
    project,
    currentPhase,
    todaysTasks,
    overdueTasks,
    upcomingTasks,
    recentlyCompletedTasks,
    recentNotes,
    currentPhaseTasks,
    phaseTasks,
    timezone,
  } = data;

  let brief = `## [${project.name}](/projects/${project.id})\n\n`;

  if (project.description) {
    brief += `${project.description}\n\n`;
  }

  // Today's Tasks (always show first if any)
  if (todaysTasks.length > 0) {
    brief += `### 🎯 Starting Today\n`;
    todaysTasks.forEach((task: TaskWithCalendarEvent) => {
      brief += formatTaskWithDetails(task, project.id, timezone);
    });
    brief += `\n`;
  }

  // Overdue Tasks
  if (overdueTasks.length > 0) {
    brief += `### ⚠️ Overdue Tasks\n`;
    overdueTasks.forEach((task: TaskWithCalendarEvent) => {
      brief += formatTaskWithDetails(task, project.id, timezone);
    });
    brief += `\n`;
  }

  // Project with Phases
  if (currentPhase) {
    brief += `### 🎯 Current Phase: ${currentPhase.name}\n`;
    if (currentPhase.description) {
      brief += `${currentPhase.description}\n`;
    }
    brief += `**Phase Duration:** ${formatDate(currentPhase.start_date)} to ${formatDate(currentPhase.end_date)}\n\n`;

    // Upcoming tasks in this phase (from today forward, max 10)
    if (upcomingTasks.length > 0) {
      brief += `**Upcoming tasks in this phase:**\n`;
      upcomingTasks.forEach((task: TaskWithCalendarEvent) => {
        brief += formatTaskWithDetails(task, project.id, timezone);
      });
      brief += `\n`;
    }
  } else {
    // Project without Phases
    brief += `### 📋 Project Status\n`;
    brief += `*This project doesn't have phases defined.*\n\n`;

    // Next 10 upcoming tasks
    if (upcomingTasks.length > 0) {
      brief += `### 📅 Upcoming Tasks (Next 10)\n`;
      upcomingTasks.forEach((task: TaskWithCalendarEvent) => {
        brief += formatTaskWithDetails(task, project.id, timezone);
      });
      brief += `\n`;
    }
  }

  // Recently Completed Tasks (always show with updated_at)
  if (recentlyCompletedTasks.length > 0) {
    brief += `### ✅ Recently Completed (Last 24 Hours)\n`;
    recentlyCompletedTasks.forEach((task: TaskWithCalendarEvent) => {
      brief += formatTaskWithDetails(task, project.id, timezone, true); // true to show updated_at
    });
    brief += `\n`;
  }

  // Recent Notes
  if (recentNotes.length > 0) {
    brief += `### 📝 Recent Notes\n`;
    recentNotes.forEach((note: Note) => {
      brief += formatNoteWithPreview(note, project.id, timezone);
    });
    brief += `\n`;
  }

  // If no activity, add a note
  if (
    todaysTasks.length === 0 &&
    upcomingTasks.length === 0 &&
    recentNotes.length === 0 &&
    recentlyCompletedTasks.length === 0 &&
    overdueTasks.length === 0
  ) {
    brief += `*No scheduled tasks or recent activity for this project.*\n\n`;
  }

  return brief;
}

function mapTaskForAnalysis(
  task: TaskWithCalendarEvent,
  projectId: string,
  timezone: string,
  showCompletedDate: boolean = false,
) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    start_date: task.start_date,
    start_date_formatted: task.start_date
      ? formatDateInTimezone(task.start_date, timezone)
      : null,
    completed_at: showCompletedDate && task.updated_at ? task.updated_at : null,
    completed_at_formatted:
      showCompletedDate && task.updated_at
        ? formatDateInTimezone(task.updated_at, timezone, true)
        : null,
    link: `/projects/${projectId}/tasks/${task.id}`,
    has_calendar_event: Boolean(
      task.task_calendar_events && task.task_calendar_events.length > 0,
    ),
  };
}

function mapNoteForAnalysis(note: Note, projectId: string, timezone: string) {
  return {
    id: note.id,
    title: note.title || "Untitled Note",
    updated_at: note.updated_at,
    updated_at_formatted: formatDateInTimezone(note.updated_at, timezone, true),
    link: `/projects/${projectId}/notes/${note.id}`,
  };
}

function generateMainBrief(
  projectBriefs: any[],
  briefDate: string,
  timezone: string,
) {
  const formattedDate = formatDate(briefDate);

  let mainBrief = `# 🌅 Daily Brief - ${formattedDate}\n\n`;

  // Check for holidays
  const briefDateObj = parseISO(briefDate + "T00:00:00");
  const holidays = getHoliday(briefDateObj);
  if (holidays && holidays.length > 0) {
    mainBrief += `## 🎉 Today is ${holidays.join(" and ")}\n\n`;
  }

  // Executive Summary
  mainBrief += `## Executive Summary\n\n`;

  const totalProjects = projectBriefs.length;
  const projectsWithTodaysTasks = projectBriefs.filter(
    (brief) => brief.metadata?.todays_task_count > 0,
  ).length;
  const totalTodaysTasks = projectBriefs.reduce(
    (sum, brief) => sum + (brief.metadata?.todays_task_count || 0),
    0,
  );
  const totalOverdueTasks = projectBriefs.reduce(
    (sum, brief) => sum + (brief.metadata?.overdue_task_count || 0),
    0,
  );
  const totalUpcomingTasks = projectBriefs.reduce(
    (sum, brief) => sum + (brief.metadata?.upcoming_task_count || 0),
    0,
  );
  const totalNextSevenDaysTasks = projectBriefs.reduce(
    (sum, brief) => sum + (brief.metadata?.next_seven_days_task_count || 0),
    0,
  );
  const totalRecentlyCompleted = projectBriefs.reduce(
    (sum, brief) => sum + (brief.metadata?.recently_completed_count || 0),
    0,
  );

  mainBrief += `You have **${totalProjects} active projects** with **${totalTodaysTasks} tasks starting today** across **${projectsWithTodaysTasks} projects**. `;

  if (totalOverdueTasks > 0) {
    mainBrief += `**${totalOverdueTasks} tasks are overdue**. `;
  }

  mainBrief += `**${totalUpcomingTasks} tasks** are scheduled upcoming`;
  if (totalNextSevenDaysTasks > 0) {
    mainBrief += `, including **${totalNextSevenDaysTasks} tasks** in the next 7 days`;
  }
  if (totalRecentlyCompleted > 0) {
    mainBrief += ` and **${totalRecentlyCompleted} tasks** were completed in the last 24 hours`;
  }
  mainBrief += `.\n\n`;

  // Overdue Alert (if any)
  if (totalOverdueTasks > 0) {
    mainBrief += `## ⚠️ Overdue Tasks Alert\n\n`;
    projectBriefs.forEach((brief) => {
      if (brief.metadata?.overdue_task_count > 0) {
        mainBrief += `**[${brief.project_name}](/projects/${brief.project_id})**: ${brief.metadata.overdue_task_count} overdue task(s)\n`;
      }
    });
    mainBrief += `\n`;
  }

  // Detailed Project Briefs
  if (projectBriefs.length > 0) {
    mainBrief += `## 📋 Detailed Project Briefs\n\n`;

    projectBriefs.forEach((brief) => {
      mainBrief += brief.brief_content + "\n---\n\n";
    });
  }

  return mainBrief;
}

function buildDailyBriefAnalysisProjects(
  projectBriefs: any[],
): DailyBriefAnalysisProject[] {
  return projectBriefs.map((brief: any) => {
    const context = brief.analysis_context || {};
    const stats = brief.metadata || {};

    return {
      project_id: brief.project_id,
      project_name: brief.project_name,
      project_link: `/projects/${brief.project_id}`,
      description: brief.project_description || context.description || null,
      current_phase: context.current_phase || null,
      stats: {
        todays_task_count:
          stats.todays_task_count ||
          (context.todays_tasks ? context.todays_tasks.length : 0) ||
          0,
        next_seven_days_task_count:
          stats.next_seven_days_task_count ||
          (context.next_seven_days_tasks
            ? context.next_seven_days_tasks.length
            : 0) ||
          0,
        overdue_task_count:
          stats.overdue_task_count ||
          (context.overdue_tasks ? context.overdue_tasks.length : 0) ||
          0,
        recently_completed_count:
          stats.recently_completed_count ||
          (context.recently_completed_tasks
            ? context.recently_completed_tasks.length
            : 0) ||
          0,
      },
      tasks_today: context.todays_tasks || [],
      tasks_next_seven_days: context.next_seven_days_tasks || [],
      overdue_tasks: context.overdue_tasks || [],
      recently_completed_tasks: context.recently_completed_tasks || [],
      recent_notes: context.recent_notes || [],
    };
  });
}

function getTaskStatusIcon(task: TaskWithCalendarEvent): string {
  // Check if task is scheduled (has start_date or calendar event)
  if (
    task.start_date ||
    (task.task_calendar_events && task.task_calendar_events.length > 0)
  ) {
    if (task.status === "done") return "✅";
    if (task.status === "in_progress") return "🔄";
    if (task.status === "blocked") return "🚫";
    return "📅"; // Scheduled
  }

  // Regular status icons
  switch (task.status) {
    case "done":
      return "✅";
    case "in_progress":
      return "🔄";
    case "blocked":
      return "🚫";
    case "backlog":
    default:
      return "📋";
  }
}

// Format a simple date (no time component)
function formatDate(dateStr: string): string {
  const date = parseISO(dateStr + "T00:00:00"); // Add time component for parsing
  return format(date, "MMM d, yyyy");
}

// Format a timestamp in the user's timezone
function formatDateInTimezone(
  timestamp: string,
  timezone: string,
  includeTime: boolean = false,
): string {
  const date = parseISO(timestamp);
  const zonedDate = utcToZonedTime(date, timezone);

  if (includeTime) {
    return format(zonedDate, "MMM d, yyyy h:mm a");
  }
  return format(zonedDate, "MMM d, yyyy");
}

function extractPriorityActions(content: string): string[] {
  const actionsSet = new Set<string>(); // Use Set to avoid duplicates
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Look for tasks starting today or high priority items
    if (
      trimmed.includes("Starting Today") ||
      trimmed.includes("high priority") ||
      trimmed.includes("🎯")
    ) {
      const match = trimmed.match(/\[([^\]]+)\]/);
      if (match && match[1]) {
        actionsSet.add(match[1]);
        if (actionsSet.size >= 5) break;
      }
    }
  }

  return Array.from(actionsSet);
}

async function updateProgress(
  briefId: string,
  progress: { step: string; progress: number },
  jobId?: string,
) {
  // Update daily brief progress
  await supabase
    .from("daily_briefs")
    .update({ generation_progress: progress })
    .eq("id", briefId);

  // Also update job metadata if job ID is provided
  if (jobId) {
    const { data: currentJob } = await supabase
      .from("queue_jobs")
      .select("metadata")
      .eq("queue_job_id", jobId)
      .single();

    const metaData: any = currentJob?.metadata ? currentJob?.metadata : {};
    const updatedMetadata = {
      ...metaData,
      generation_progress: progress,
    };

    await supabase
      .from("queue_jobs")
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("queue_job_id", jobId);
  }
}

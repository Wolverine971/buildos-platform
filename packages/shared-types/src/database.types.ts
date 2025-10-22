export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      admin_analytics: {
        Row: {
          created_at: string
          date: string
          id: string
          metadata: Json | null
          metric_name: string
          metric_value: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_value: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_value?: number
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          granted_at: string | null
          granted_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_at?: string | null
          granted_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted_at?: string | null
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          api_key: string
          created_at: string | null
          id: number
          service_name: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string | null
          id?: number
          service_name: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string | null
          id?: number
          service_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_event_attendance: {
        Row: {
          attended: boolean | null
          created_at: string
          event_feedback: string | null
          event_id: string | null
          event_rating: number | null
          id: string
          joined_at: string | null
          left_at: string | null
          member_id: string | null
          rsvp_at: string | null
          rsvp_status: string | null
          user_id: string | null
        }
        Insert: {
          attended?: boolean | null
          created_at?: string
          event_feedback?: string | null
          event_id?: string | null
          event_rating?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          member_id?: string | null
          rsvp_at?: string | null
          rsvp_status?: string | null
          user_id?: string | null
        }
        Update: {
          attended?: boolean | null
          created_at?: string
          event_feedback?: string | null
          event_id?: string | null
          event_rating?: number | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          member_id?: string | null
          rsvp_at?: string | null
          rsvp_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "beta_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beta_event_attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "beta_members"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_events: {
        Row: {
          agenda: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          event_description: string | null
          event_status: string | null
          event_timezone: string | null
          event_title: string
          event_type: string | null
          id: string
          max_attendees: number | null
          meeting_link: string | null
          meeting_notes: string | null
          recording_url: string | null
          scheduled_at: string
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          event_description?: string | null
          event_status?: string | null
          event_timezone?: string | null
          event_title: string
          event_type?: string | null
          id?: string
          max_attendees?: number | null
          meeting_link?: string | null
          meeting_notes?: string | null
          recording_url?: string | null
          scheduled_at: string
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          event_description?: string | null
          event_status?: string | null
          event_timezone?: string | null
          event_title?: string
          event_type?: string | null
          id?: string
          max_attendees?: number | null
          meeting_link?: string | null
          meeting_notes?: string | null
          recording_url?: string | null
          scheduled_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      beta_feature_votes: {
        Row: {
          created_at: string | null
          feedback_id: string | null
          id: string
          member_id: string | null
          vote_type: string | null
        }
        Insert: {
          created_at?: string | null
          feedback_id?: string | null
          id?: string
          member_id?: string | null
          vote_type?: string | null
        }
        Update: {
          created_at?: string | null
          feedback_id?: string | null
          id?: string
          member_id?: string | null
          vote_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_feature_votes_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "beta_feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beta_feature_votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "beta_members"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_feedback: {
        Row: {
          created_at: string | null
          declined_reason: string | null
          feature_area: string | null
          feedback_description: string
          feedback_priority: string | null
          feedback_status: string | null
          feedback_tags: string[] | null
          feedback_title: string
          feedback_type: string | null
          founder_responded_at: string | null
          founder_response: string | null
          id: string
          implemented_at: string | null
          member_id: string | null
          updated_at: string | null
          upvotes: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          declined_reason?: string | null
          feature_area?: string | null
          feedback_description: string
          feedback_priority?: string | null
          feedback_status?: string | null
          feedback_tags?: string[] | null
          feedback_title: string
          feedback_type?: string | null
          founder_responded_at?: string | null
          founder_response?: string | null
          id?: string
          implemented_at?: string | null
          member_id?: string | null
          updated_at?: string | null
          upvotes?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          declined_reason?: string | null
          feature_area?: string | null
          feedback_description?: string
          feedback_priority?: string | null
          feedback_status?: string | null
          feedback_tags?: string[] | null
          feedback_title?: string
          feedback_type?: string | null
          founder_responded_at?: string | null
          founder_response?: string | null
          id?: string
          implemented_at?: string | null
          member_id?: string | null
          updated_at?: string | null
          upvotes?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_feedback_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "beta_members"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_members: {
        Row: {
          access_level: string | null
          beta_tier: string | null
          company_name: string | null
          created_at: string | null
          deactivated_at: string | null
          deactivation_reason: string | null
          discount_percentage: number | null
          early_access_features: string[] | null
          email: string
          full_name: string
          has_lifetime_pricing: boolean | null
          id: string
          is_active: boolean | null
          job_title: string | null
          joined_at: string | null
          last_active_at: string | null
          signup_id: string | null
          total_calls_attended: number | null
          total_features_requested: number | null
          total_feedback_submitted: number | null
          updated_at: string | null
          user_id: string | null
          user_timezone: string | null
          wants_community_access: boolean | null
          wants_feature_updates: boolean | null
          wants_weekly_calls: boolean | null
        }
        Insert: {
          access_level?: string | null
          beta_tier?: string | null
          company_name?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          discount_percentage?: number | null
          early_access_features?: string[] | null
          email: string
          full_name: string
          has_lifetime_pricing?: boolean | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          joined_at?: string | null
          last_active_at?: string | null
          signup_id?: string | null
          total_calls_attended?: number | null
          total_features_requested?: number | null
          total_feedback_submitted?: number | null
          updated_at?: string | null
          user_id?: string | null
          user_timezone?: string | null
          wants_community_access?: boolean | null
          wants_feature_updates?: boolean | null
          wants_weekly_calls?: boolean | null
        }
        Update: {
          access_level?: string | null
          beta_tier?: string | null
          company_name?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          discount_percentage?: number | null
          early_access_features?: string[] | null
          email?: string
          full_name?: string
          has_lifetime_pricing?: boolean | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          joined_at?: string | null
          last_active_at?: string | null
          signup_id?: string | null
          total_calls_attended?: number | null
          total_features_requested?: number | null
          total_feedback_submitted?: number | null
          updated_at?: string | null
          user_id?: string | null
          user_timezone?: string | null
          wants_community_access?: boolean | null
          wants_feature_updates?: boolean | null
          wants_weekly_calls?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_members_signup_id_fkey"
            columns: ["signup_id"]
            isOneToOne: false
            referencedRelation: "beta_signups"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_signups: {
        Row: {
          approved_at: string | null
          biggest_challenge: string | null
          company_name: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          invited_by: string | null
          ip_address: unknown
          job_title: string | null
          productivity_tools: string[] | null
          referral_source: string | null
          signup_status: string | null
          updated_at: string
          user_agent: string | null
          user_timezone: string | null
          wants_community_access: boolean | null
          wants_weekly_calls: boolean | null
          why_interested: string | null
        }
        Insert: {
          approved_at?: string | null
          biggest_challenge?: string | null
          company_name?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          invited_by?: string | null
          ip_address?: unknown
          job_title?: string | null
          productivity_tools?: string[] | null
          referral_source?: string | null
          signup_status?: string | null
          updated_at?: string
          user_agent?: string | null
          user_timezone?: string | null
          wants_community_access?: boolean | null
          wants_weekly_calls?: boolean | null
          why_interested?: string | null
        }
        Update: {
          approved_at?: string | null
          biggest_challenge?: string | null
          company_name?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          invited_by?: string | null
          ip_address?: unknown
          job_title?: string | null
          productivity_tools?: string[] | null
          referral_source?: string | null
          signup_status?: string | null
          updated_at?: string
          user_agent?: string | null
          user_timezone?: string | null
          wants_community_access?: boolean | null
          wants_weekly_calls?: boolean | null
          why_interested?: string | null
        }
        Relationships: []
      }
      brain_dump_links: {
        Row: {
          brain_dump_id: string
          created_at: string
          id: number
          note_id: string | null
          project_id: string | null
          task_id: string | null
        }
        Insert: {
          brain_dump_id: string
          created_at?: string
          id?: number
          note_id?: string | null
          project_id?: string | null
          task_id?: string | null
        }
        Update: {
          brain_dump_id?: string
          created_at?: string
          id?: number
          note_id?: string | null
          project_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brain_dump_links_brain_dump_id_fkey"
            columns: ["brain_dump_id"]
            isOneToOne: false
            referencedRelation: "brain_dumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_dump_links_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_dump_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_dump_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "brain_dump_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_dumps: {
        Row: {
          ai_insights: string | null
          ai_summary: string | null
          content: string | null
          created_at: string
          id: string
          metaData: Json | null
          parsed_results: Json | null
          project_id: string | null
          status: Database["public"]["Enums"]["brain_dump_status"]
          tags: string[] | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_insights?: string | null
          ai_summary?: string | null
          content?: string | null
          created_at?: string
          id?: string
          metaData?: Json | null
          parsed_results?: Json | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["brain_dump_status"]
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_insights?: string | null
          ai_summary?: string | null
          content?: string | null
          created_at?: string
          id?: string
          metaData?: Json | null
          parsed_results?: Json | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["brain_dump_status"]
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_dumps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_dumps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_analyses: {
        Row: {
          ai_model: string | null
          ai_model_version: string | null
          calendars_analyzed: string[] | null
          completed_at: string | null
          confidence_average: number | null
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          error_message: string | null
          events_analyzed: number | null
          events_excluded: number | null
          id: string
          processing_time_ms: number | null
          projects_created: number | null
          projects_suggested: number | null
          started_at: string | null
          status: string | null
          tasks_created: number | null
          total_tokens_used: number | null
          updated_at: string | null
          user_feedback: string | null
          user_id: string
          user_rating: number | null
        }
        Insert: {
          ai_model?: string | null
          ai_model_version?: string | null
          calendars_analyzed?: string[] | null
          completed_at?: string | null
          confidence_average?: number | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          events_analyzed?: number | null
          events_excluded?: number | null
          id?: string
          processing_time_ms?: number | null
          projects_created?: number | null
          projects_suggested?: number | null
          started_at?: string | null
          status?: string | null
          tasks_created?: number | null
          total_tokens_used?: number | null
          updated_at?: string | null
          user_feedback?: string | null
          user_id: string
          user_rating?: number | null
        }
        Update: {
          ai_model?: string | null
          ai_model_version?: string | null
          calendars_analyzed?: string[] | null
          completed_at?: string | null
          confidence_average?: number | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          events_analyzed?: number | null
          events_excluded?: number | null
          id?: string
          processing_time_ms?: number | null
          projects_created?: number | null
          projects_suggested?: number | null
          started_at?: string | null
          status?: string | null
          tasks_created?: number | null
          total_tokens_used?: number | null
          updated_at?: string | null
          user_feedback?: string | null
          user_id?: string
          user_rating?: number | null
        }
        Relationships: []
      }
      calendar_analysis_events: {
        Row: {
          analysis_id: string
          attendee_count: number | null
          attendee_emails: string[] | null
          calendar_event_id: string
          calendar_id: string
          created_at: string | null
          event_description: string | null
          event_end: string | null
          event_location: string | null
          event_start: string | null
          event_title: string | null
          exclusion_reason: string | null
          id: string
          included_in_analysis: boolean | null
          is_organizer: boolean | null
          is_recurring: boolean | null
          recurrence_pattern: string | null
          suggestion_id: string | null
        }
        Insert: {
          analysis_id: string
          attendee_count?: number | null
          attendee_emails?: string[] | null
          calendar_event_id: string
          calendar_id: string
          created_at?: string | null
          event_description?: string | null
          event_end?: string | null
          event_location?: string | null
          event_start?: string | null
          event_title?: string | null
          exclusion_reason?: string | null
          id?: string
          included_in_analysis?: boolean | null
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          recurrence_pattern?: string | null
          suggestion_id?: string | null
        }
        Update: {
          analysis_id?: string
          attendee_count?: number | null
          attendee_emails?: string[] | null
          calendar_event_id?: string
          calendar_id?: string
          created_at?: string | null
          event_description?: string | null
          event_end?: string | null
          event_location?: string | null
          event_start?: string | null
          event_title?: string | null
          exclusion_reason?: string | null
          id?: string
          included_in_analysis?: boolean | null
          is_organizer?: boolean | null
          is_recurring?: boolean | null
          recurrence_pattern?: string | null
          suggestion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_analysis_events_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "calendar_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_analysis_events_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "calendar_project_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_analysis_preferences: {
        Row: {
          analysis_frequency: string | null
          auto_accept_confidence: number | null
          auto_analyze_on_connect: boolean | null
          create_tasks_from_events: boolean | null
          created_at: string | null
          exclude_all_day_events: boolean | null
          exclude_declined_events: boolean | null
          exclude_personal_events: boolean | null
          exclude_tentative_events: boolean | null
          excluded_calendar_ids: string[] | null
          id: string
          included_calendar_ids: string[] | null
          last_auto_analysis_at: string | null
          minimum_attendees: number | null
          minimum_confidence_to_show: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          analysis_frequency?: string | null
          auto_accept_confidence?: number | null
          auto_analyze_on_connect?: boolean | null
          create_tasks_from_events?: boolean | null
          created_at?: string | null
          exclude_all_day_events?: boolean | null
          exclude_declined_events?: boolean | null
          exclude_personal_events?: boolean | null
          exclude_tentative_events?: boolean | null
          excluded_calendar_ids?: string[] | null
          id?: string
          included_calendar_ids?: string[] | null
          last_auto_analysis_at?: string | null
          minimum_attendees?: number | null
          minimum_confidence_to_show?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          analysis_frequency?: string | null
          auto_accept_confidence?: number | null
          auto_analyze_on_connect?: boolean | null
          create_tasks_from_events?: boolean | null
          created_at?: string | null
          exclude_all_day_events?: boolean | null
          exclude_declined_events?: boolean | null
          exclude_personal_events?: boolean | null
          exclude_tentative_events?: boolean | null
          excluded_calendar_ids?: string[] | null
          id?: string
          included_calendar_ids?: string[] | null
          last_auto_analysis_at?: string | null
          minimum_attendees?: number | null
          minimum_confidence_to_show?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      calendar_project_suggestions: {
        Row: {
          ai_reasoning: string | null
          analysis_id: string
          calendar_event_ids: string[]
          calendar_ids: string[] | null
          confidence_score: number
          created_at: string | null
          created_project_id: string | null
          detected_keywords: string[] | null
          event_count: number | null
          event_patterns: Json | null
          id: string
          rejection_reason: string | null
          status: string | null
          status_changed_at: string | null
          suggested_context: string | null
          suggested_description: string | null
          suggested_name: string
          suggested_priority: string | null
          suggested_tasks: Json | null
          tasks_created_count: number | null
          updated_at: string | null
          user_id: string
          user_modified_context: string | null
          user_modified_description: string | null
          user_modified_name: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          analysis_id: string
          calendar_event_ids: string[]
          calendar_ids?: string[] | null
          confidence_score: number
          created_at?: string | null
          created_project_id?: string | null
          detected_keywords?: string[] | null
          event_count?: number | null
          event_patterns?: Json | null
          id?: string
          rejection_reason?: string | null
          status?: string | null
          status_changed_at?: string | null
          suggested_context?: string | null
          suggested_description?: string | null
          suggested_name: string
          suggested_priority?: string | null
          suggested_tasks?: Json | null
          tasks_created_count?: number | null
          updated_at?: string | null
          user_id: string
          user_modified_context?: string | null
          user_modified_description?: string | null
          user_modified_name?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          analysis_id?: string
          calendar_event_ids?: string[]
          calendar_ids?: string[] | null
          confidence_score?: number
          created_at?: string | null
          created_project_id?: string | null
          detected_keywords?: string[] | null
          event_count?: number | null
          event_patterns?: Json | null
          id?: string
          rejection_reason?: string | null
          status?: string | null
          status_changed_at?: string | null
          suggested_context?: string | null
          suggested_description?: string | null
          suggested_name?: string
          suggested_priority?: string | null
          suggested_tasks?: Json | null
          tasks_created_count?: number | null
          updated_at?: string | null
          user_id?: string
          user_modified_context?: string | null
          user_modified_description?: string | null
          user_modified_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_project_suggestions_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "calendar_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_project_suggestions_created_project_id_fkey"
            columns: ["created_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_themes: {
        Row: {
          color_mappings: Json
          created_at: string | null
          id: string
          is_default: boolean | null
          theme_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          color_mappings?: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          theme_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          color_mappings?: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          theme_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      calendar_webhook_channels: {
        Row: {
          calendar_id: string | null
          channel_id: string
          created_at: string
          expiration: number
          id: string
          resource_id: string | null
          sync_token: string | null
          updated_at: string
          user_id: string
          webhook_token: string
        }
        Insert: {
          calendar_id?: string | null
          channel_id: string
          created_at?: string
          expiration: number
          id?: string
          resource_id?: string | null
          sync_token?: string | null
          updated_at?: string
          user_id: string
          webhook_token: string
        }
        Update: {
          calendar_id?: string | null
          channel_id?: string
          created_at?: string
          expiration?: number
          id?: string
          resource_id?: string | null
          sync_token?: string | null
          updated_at?: string
          user_id?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_webhook_channels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          executed_at: string
          id: string
          job_name: string
          status: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          executed_at: string
          id?: string
          job_name: string
          status: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          executed_at?: string
          id?: string
          job_name?: string
          status?: string
        }
        Relationships: []
      }
      customer_subscriptions: {
        Row: {
          cancel_at: string | null
          canceled_at: string | null
          cancellation_reason: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json | null
          plan_id: string | null
          status: string
          stripe_customer_id: string
          stripe_price_id: string | null
          stripe_subscription_id: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at?: string | null
          canceled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json | null
          plan_id?: string | null
          status: string
          stripe_customer_id: string
          stripe_price_id?: string | null
          stripe_subscription_id: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at?: string | null
          canceled_at?: string | null
          cancellation_reason?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json | null
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_subscriptions_stripe_price_id_fkey"
            columns: ["stripe_price_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["stripe_price_id"]
          },
          {
            foreignKeyName: "customer_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefs: {
        Row: {
          brief_date: string
          created_at: string
          generation_completed_at: string | null
          generation_error: string | null
          generation_progress: Json | null
          generation_started_at: string | null
          generation_status: string
          id: string
          insights: string | null
          llm_analysis: string | null
          metadata: Json | null
          priority_actions: string[] | null
          project_brief_ids: string[] | null
          summary_content: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brief_date: string
          created_at?: string
          generation_completed_at?: string | null
          generation_error?: string | null
          generation_progress?: Json | null
          generation_started_at?: string | null
          generation_status?: string
          id?: string
          insights?: string | null
          llm_analysis?: string | null
          metadata?: Json | null
          priority_actions?: string[] | null
          project_brief_ids?: string[] | null
          summary_content: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brief_date?: string
          created_at?: string
          generation_completed_at?: string | null
          generation_error?: string | null
          generation_progress?: Json | null
          generation_started_at?: string | null
          generation_status?: string
          id?: string
          insights?: string | null
          llm_analysis?: string | null
          metadata?: Json | null
          priority_actions?: string[] | null
          project_brief_ids?: string[] | null
          summary_content?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          discount_type: string
          discount_value: number
          duration: string
          duration_in_months: number | null
          id: string
          is_active: boolean | null
          max_redemptions: number | null
          metadata: Json | null
          stripe_coupon_id: string | null
          times_redeemed: number | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          duration: string
          duration_in_months?: number | null
          id?: string
          is_active?: boolean | null
          max_redemptions?: number | null
          metadata?: Json | null
          stripe_coupon_id?: string | null
          times_redeemed?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          duration?: string
          duration_in_months?: number | null
          id?: string
          is_active?: boolean | null
          max_redemptions?: number | null
          metadata?: Json | null
          stripe_coupon_id?: string | null
          times_redeemed?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      email_attachments: {
        Row: {
          cid: string | null
          content_type: string
          created_at: string | null
          created_by: string
          email_id: string
          file_size: number
          filename: string
          id: string
          image_height: number | null
          image_width: number | null
          is_image: boolean | null
          is_inline: boolean | null
          optimized_versions: Json | null
          original_filename: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          cid?: string | null
          content_type: string
          created_at?: string | null
          created_by: string
          email_id: string
          file_size: number
          filename: string
          id?: string
          image_height?: number | null
          image_width?: number | null
          is_image?: boolean | null
          is_inline?: boolean | null
          optimized_versions?: Json | null
          original_filename: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          cid?: string | null
          content_type?: string
          created_at?: string | null
          created_by?: string
          email_id?: string
          file_size?: number
          filename?: string
          id?: string
          image_height?: number | null
          image_width?: number | null
          is_image?: boolean | null
          is_inline?: boolean | null
          optimized_versions?: Json | null
          original_filename?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          bcc: string[] | null
          body: string
          cc: string[] | null
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          reply_to: string | null
          sent_at: string | null
          status: string
          subject: string
          to_email: string
          user_id: string | null
        }
        Insert: {
          bcc?: string[] | null
          body: string
          cc?: string[] | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          reply_to?: string | null
          sent_at?: string | null
          status: string
          subject: string
          to_email: string
          user_id?: string | null
        }
        Update: {
          bcc?: string[] | null
          body?: string
          cc?: string[] | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          reply_to?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_recipients: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          email_id: string
          error_message: string | null
          id: string
          last_opened_at: string | null
          open_count: number | null
          opened_at: string | null
          recipient_email: string
          recipient_id: string | null
          recipient_name: string | null
          recipient_type: string
          sent_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          email_id: string
          error_message?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number | null
          opened_at?: string | null
          recipient_email: string
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_type?: string
          sent_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          email_id?: string
          error_message?: string | null
          id?: string
          last_opened_at?: string | null
          open_count?: number | null
          opened_at?: string | null
          recipient_email?: string
          recipient_id?: string | null
          recipient_name?: string | null
          recipient_type?: string
          sent_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_recipients_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_tracking_events: {
        Row: {
          clicked_url: string | null
          created_at: string | null
          email_id: string
          event_data: Json | null
          event_type: string
          id: string
          ip_address: unknown
          recipient_id: string | null
          timestamp: string | null
          user_agent: string | null
        }
        Insert: {
          clicked_url?: string | null
          created_at?: string | null
          email_id: string
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          recipient_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
        }
        Update: {
          clicked_url?: string | null
          created_at?: string | null
          email_id?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          recipient_id?: string | null
          timestamp?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_tracking_events_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_tracking_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "email_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          created_by: string
          from_email: string
          from_name: string
          id: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string
          template_data: Json | null
          tracking_enabled: boolean
          tracking_id: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          created_by: string
          from_email?: string
          from_name?: string
          id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_data?: Json | null
          tracking_enabled?: boolean
          tracking_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string
          from_email?: string
          from_name?: string
          id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_data?: Json | null
          tracking_enabled?: boolean
          tracking_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          app_version: string | null
          brain_dump_id: string | null
          browser_info: Json | null
          completion_tokens: number | null
          created_at: string
          endpoint: string | null
          environment: string | null
          error_code: string | null
          error_message: string
          error_stack: string | null
          error_type: string
          http_method: string | null
          id: string
          ip_address: unknown
          llm_max_tokens: number | null
          llm_model: string | null
          llm_provider: string | null
          llm_temperature: number | null
          metadata: Json | null
          operation_payload: Json | null
          operation_type: string | null
          project_id: string | null
          prompt_tokens: number | null
          record_id: string | null
          request_id: string | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          response_time_ms: number | null
          severity: string | null
          table_name: string | null
          total_tokens: number | null
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          brain_dump_id?: string | null
          browser_info?: Json | null
          completion_tokens?: number | null
          created_at?: string
          endpoint?: string | null
          environment?: string | null
          error_code?: string | null
          error_message: string
          error_stack?: string | null
          error_type: string
          http_method?: string | null
          id?: string
          ip_address?: unknown
          llm_max_tokens?: number | null
          llm_model?: string | null
          llm_provider?: string | null
          llm_temperature?: number | null
          metadata?: Json | null
          operation_payload?: Json | null
          operation_type?: string | null
          project_id?: string | null
          prompt_tokens?: number | null
          record_id?: string | null
          request_id?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          response_time_ms?: number | null
          severity?: string | null
          table_name?: string | null
          total_tokens?: number | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          brain_dump_id?: string | null
          browser_info?: Json | null
          completion_tokens?: number | null
          created_at?: string
          endpoint?: string | null
          environment?: string | null
          error_code?: string | null
          error_message?: string
          error_stack?: string | null
          error_type?: string
          http_method?: string | null
          id?: string
          ip_address?: unknown
          llm_max_tokens?: number | null
          llm_model?: string | null
          llm_provider?: string | null
          llm_temperature?: number | null
          metadata?: Json | null
          operation_payload?: Json | null
          operation_type?: string | null
          project_id?: string | null
          prompt_tokens?: number | null
          record_id?: string | null
          request_id?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          response_time_ms?: number | null
          severity?: string | null
          table_name?: string | null
          total_tokens?: number | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_brain_dump_id_fkey"
            columns: ["brain_dump_id"]
            isOneToOne: false
            referencedRelation: "brain_dumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_payments: {
        Row: {
          amount_due: number
          created_at: string | null
          dunning_stage: string | null
          failed_at: string
          id: string
          invoice_id: string
          last_dunning_at: string | null
          last_retry_at: string | null
          resolution_type: string | null
          resolved_at: string | null
          retry_count: number | null
          subscription_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_due: number
          created_at?: string | null
          dunning_stage?: string | null
          failed_at?: string
          id?: string
          invoice_id: string
          last_dunning_at?: string | null
          last_retry_at?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          retry_count?: number | null
          subscription_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_due?: number
          created_at?: string | null
          dunning_stage?: string | null
          failed_at?: string
          id?: string
          invoice_id?: string
          last_dunning_at?: string | null
          last_retry_at?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          retry_count?: number | null
          subscription_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "failed_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "customer_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          enabled_at: string | null
          feature_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          feature_name: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          feature_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          category: string
          created_at: string
          feedback_text: string
          id: string
          rating: number | null
          status: string | null
          updated_at: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_ip: unknown
        }
        Insert: {
          category: string
          created_at?: string
          feedback_text: string
          id?: string
          rating?: number | null
          status?: string | null
          updated_at?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_ip?: unknown
        }
        Update: {
          category?: string
          created_at?: string
          feedback_text?: string
          id?: string
          rating?: number | null
          status?: string | null
          updated_at?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_ip?: unknown
        }
        Relationships: []
      }
      feedback_rate_limit: {
        Row: {
          first_submission: string | null
          id: string
          ip_address: unknown
          is_blocked: boolean | null
          last_submission: string | null
          submission_count: number | null
        }
        Insert: {
          first_submission?: string | null
          id?: string
          ip_address: unknown
          is_blocked?: boolean | null
          last_submission?: string | null
          submission_count?: number | null
        }
        Update: {
          first_submission?: string | null
          id?: string
          ip_address?: unknown
          is_blocked?: boolean | null
          last_submission?: string | null
          submission_count?: number | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string | null
          currency: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_pdf: string | null
          status: string
          stripe_customer_id: string
          stripe_invoice_id: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount_due: number
          amount_paid: number
          created_at?: string | null
          currency?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          status: string
          stripe_customer_id: string
          stripe_invoice_id: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string | null
          currency?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          status?: string
          stripe_customer_id?: string
          stripe_invoice_id?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "customer_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_prompts: {
        Row: {
          id: string
          last_used: string | null
          prompt_text: string | null
          purpose: string | null
          title: string | null
        }
        Insert: {
          id?: string
          last_used?: string | null
          prompt_text?: string | null
          purpose?: string | null
          title?: string | null
        }
        Update: {
          id?: string
          last_used?: string | null
          prompt_text?: string | null
          purpose?: string | null
          title?: string | null
        }
        Relationships: []
      }
      llm_usage_logs: {
        Row: {
          brain_dump_id: string | null
          brief_id: string | null
          completion_tokens: number
          created_at: string
          error_message: string | null
          id: string
          input_cost_usd: number
          max_tokens: number | null
          metadata: Json | null
          model_requested: string
          model_used: string
          openrouter_cache_status: string | null
          openrouter_request_id: string | null
          operation_type: string
          output_cost_usd: number
          profile: string | null
          project_id: string | null
          prompt_tokens: number
          provider: string | null
          rate_limit_remaining: number | null
          request_completed_at: string
          request_started_at: string
          response_time_ms: number
          status: Database["public"]["Enums"]["llm_request_status"]
          streaming: boolean | null
          task_id: string | null
          temperature: number | null
          total_cost_usd: number
          total_tokens: number
          user_id: string
        }
        Insert: {
          brain_dump_id?: string | null
          brief_id?: string | null
          completion_tokens: number
          created_at?: string
          error_message?: string | null
          id?: string
          input_cost_usd: number
          max_tokens?: number | null
          metadata?: Json | null
          model_requested: string
          model_used: string
          openrouter_cache_status?: string | null
          openrouter_request_id?: string | null
          operation_type: string
          output_cost_usd: number
          profile?: string | null
          project_id?: string | null
          prompt_tokens: number
          provider?: string | null
          rate_limit_remaining?: number | null
          request_completed_at: string
          request_started_at: string
          response_time_ms: number
          status?: Database["public"]["Enums"]["llm_request_status"]
          streaming?: boolean | null
          task_id?: string | null
          temperature?: number | null
          total_cost_usd: number
          total_tokens: number
          user_id: string
        }
        Update: {
          brain_dump_id?: string | null
          brief_id?: string | null
          completion_tokens?: number
          created_at?: string
          error_message?: string | null
          id?: string
          input_cost_usd?: number
          max_tokens?: number | null
          metadata?: Json | null
          model_requested?: string
          model_used?: string
          openrouter_cache_status?: string | null
          openrouter_request_id?: string | null
          operation_type?: string
          output_cost_usd?: number
          profile?: string | null
          project_id?: string | null
          prompt_tokens?: number
          provider?: string | null
          rate_limit_remaining?: number | null
          request_completed_at?: string
          request_started_at?: string
          response_time_ms?: number
          status?: Database["public"]["Enums"]["llm_request_status"]
          streaming?: boolean | null
          task_id?: string | null
          temperature?: number | null
          total_cost_usd?: number
          total_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_logs_brain_dump_id_fkey"
            columns: ["brain_dump_id"]
            isOneToOne: false
            referencedRelation: "brain_dumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_usage_logs_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "daily_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_usage_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_usage_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "llm_usage_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_usage_summary: {
        Row: {
          avg_response_time_ms: number | null
          created_at: string
          failed_requests: number
          id: string
          max_response_time_ms: number | null
          min_response_time_ms: number | null
          models_used: Json | null
          operations_breakdown: Json | null
          successful_requests: number
          summary_date: string
          summary_type: string
          total_completion_tokens: number
          total_cost_usd: number
          total_prompt_tokens: number
          total_requests: number
          total_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_response_time_ms?: number | null
          created_at?: string
          failed_requests?: number
          id?: string
          max_response_time_ms?: number | null
          min_response_time_ms?: number | null
          models_used?: Json | null
          operations_breakdown?: Json | null
          successful_requests?: number
          summary_date: string
          summary_type: string
          total_completion_tokens?: number
          total_cost_usd?: number
          total_prompt_tokens?: number
          total_requests?: number
          total_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_response_time_ms?: number | null
          created_at?: string
          failed_requests?: number
          id?: string
          max_response_time_ms?: number | null
          min_response_time_ms?: number | null
          models_used?: Json | null
          operations_breakdown?: Json | null
          successful_requests?: number
          summary_date?: string
          summary_type?: string
          total_completion_tokens?: number
          total_cost_usd?: number
          total_prompt_tokens?: number
          total_requests?: number
          total_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          category: string | null
          content: string | null
          created_at: string
          id: string
          project_id: string | null
          tags: string[] | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string
          id?: string
          project_id?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number | null
          channel: string
          channel_identifier: string | null
          clicked_at: string | null
          correlation_id: string | null
          created_at: string | null
          delivered_at: string | null
          event_id: string | null
          external_id: string | null
          failed_at: string | null
          id: string
          last_error: string | null
          max_attempts: number | null
          opened_at: string | null
          payload: Json
          recipient_user_id: string
          sent_at: string | null
          status: string
          subscription_id: string | null
          tracking_id: string | null
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          channel: string
          channel_identifier?: string | null
          clicked_at?: string | null
          correlation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          event_id?: string | null
          external_id?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number | null
          opened_at?: string | null
          payload?: Json
          recipient_user_id: string
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
          tracking_id?: string | null
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          channel?: string
          channel_identifier?: string | null
          clicked_at?: string | null
          correlation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          event_id?: string | null
          external_id?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number | null
          opened_at?: string | null
          payload?: Json
          recipient_user_id?: string
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
          tracking_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "notification_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          actor_user_id: string | null
          correlation_id: string | null
          created_at: string | null
          event_source: string
          event_type: string
          id: string
          metadata: Json | null
          payload: Json
          target_user_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          event_source: string
          event_type: string
          id?: string
          metadata?: Json | null
          payload?: Json
          target_user_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          event_source?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          payload?: Json
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          correlation_id: string
          created_at: string
          error_stack: string | null
          id: string
          level: string
          message: string
          metadata: Json | null
          namespace: string | null
          notification_delivery_id: string | null
          notification_event_id: string | null
          request_id: string | null
          user_id: string | null
        }
        Insert: {
          correlation_id: string
          created_at?: string
          error_stack?: string | null
          id?: string
          level: string
          message: string
          metadata?: Json | null
          namespace?: string | null
          notification_delivery_id?: string | null
          notification_event_id?: string | null
          request_id?: string | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string
          created_at?: string
          error_stack?: string | null
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          namespace?: string | null
          notification_delivery_id?: string | null
          notification_event_id?: string | null
          request_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_notification_delivery_id_fkey"
            columns: ["notification_delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_notification_event_id_fkey"
            columns: ["notification_event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_subscriptions: {
        Row: {
          admin_only: boolean | null
          created_at: string | null
          created_by: string | null
          event_type: string
          filters: Json | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_only?: boolean | null
          created_at?: string | null
          created_by?: string | null
          event_type: string
          filters?: Json | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_only?: boolean | null
          created_at?: string | null
          created_by?: string | null
          event_type?: string
          filters?: Json | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_tracking_links: {
        Row: {
          click_count: number | null
          created_at: string | null
          delivery_id: string
          destination_url: string
          first_clicked_at: string | null
          id: string
          last_clicked_at: string | null
          metadata: Json | null
          short_code: string
        }
        Insert: {
          click_count?: number | null
          created_at?: string | null
          delivery_id: string
          destination_url: string
          first_clicked_at?: string | null
          id?: string
          last_clicked_at?: string | null
          metadata?: Json | null
          short_code: string
        }
        Update: {
          click_count?: number | null
          created_at?: string | null
          delivery_id?: string
          destination_url?: string
          first_clicked_at?: string | null
          id?: string
          last_clicked_at?: string | null
          metadata?: Json | null
          short_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_tracking_links_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          card_brand: string | null
          card_last4: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          stripe_payment_method_id: string
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          stripe_payment_method_id: string
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          stripe_payment_method_id?: string
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      phase_tasks: {
        Row: {
          assignment_reason: string | null
          created_at: string
          id: string
          order: number
          phase_id: string
          suggested_start_date: string | null
          task_id: string
        }
        Insert: {
          assignment_reason?: string | null
          created_at?: string
          id?: string
          order?: number
          phase_id: string
          suggested_start_date?: string | null
          task_id: string
        }
        Update: {
          assignment_reason?: string | null
          created_at?: string
          id?: string
          order?: number
          phase_id?: string
          suggested_start_date?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phase_tasks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phase_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "phase_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      phases: {
        Row: {
          created_at: string
          description: string | null
          end_date: string
          id: string
          name: string
          order: number
          project_id: string
          scheduling_method: string | null
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          name: string
          order: number
          project_id: string
          scheduling_method?: string | null
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          order?: number
          project_id?: string
          scheduling_method?: string | null
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_brief_templates: {
        Row: {
          context_snapshot: Json | null
          created_at: string | null
          description: string | null
          generated_by: string | null
          generation_model: string | null
          id: string
          in_use: boolean | null
          is_default: boolean | null
          metadata: Json | null
          name: string
          project_id: string | null
          template_content: string
          updated_at: string | null
          user_id: string | null
          variables: Json | null
        }
        Insert: {
          context_snapshot?: Json | null
          created_at?: string | null
          description?: string | null
          generated_by?: string | null
          generation_model?: string | null
          id?: string
          in_use?: boolean | null
          is_default?: boolean | null
          metadata?: Json | null
          name: string
          project_id?: string | null
          template_content: string
          updated_at?: string | null
          user_id?: string | null
          variables?: Json | null
        }
        Update: {
          context_snapshot?: Json | null
          created_at?: string | null
          description?: string | null
          generated_by?: string | null
          generation_model?: string | null
          id?: string
          in_use?: boolean | null
          is_default?: boolean | null
          metadata?: Json | null
          name?: string
          project_id?: string | null
          template_content?: string
          updated_at?: string | null
          user_id?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_brief_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_brief_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_calendars: {
        Row: {
          calendar_id: string
          calendar_name: string
          color_id: string | null
          created_at: string | null
          hex_color: string | null
          id: string
          is_primary: boolean | null
          last_synced_at: string | null
          project_id: string
          sync_enabled: boolean | null
          sync_error: string | null
          sync_status:
            | Database["public"]["Enums"]["calendar_sync_status"]
            | null
          updated_at: string | null
          user_id: string
          visibility: Database["public"]["Enums"]["calendar_visibility"] | null
        }
        Insert: {
          calendar_id: string
          calendar_name: string
          color_id?: string | null
          created_at?: string | null
          hex_color?: string | null
          id?: string
          is_primary?: boolean | null
          last_synced_at?: string | null
          project_id: string
          sync_enabled?: boolean | null
          sync_error?: string | null
          sync_status?:
            | Database["public"]["Enums"]["calendar_sync_status"]
            | null
          updated_at?: string | null
          user_id: string
          visibility?: Database["public"]["Enums"]["calendar_visibility"] | null
        }
        Update: {
          calendar_id?: string
          calendar_name?: string
          color_id?: string | null
          created_at?: string | null
          hex_color?: string | null
          id?: string
          is_primary?: boolean | null
          last_synced_at?: string | null
          project_id?: string
          sync_enabled?: boolean | null
          sync_error?: string | null
          sync_status?:
            | Database["public"]["Enums"]["calendar_sync_status"]
            | null
          updated_at?: string | null
          user_id?: string
          visibility?: Database["public"]["Enums"]["calendar_visibility"] | null
        }
        Relationships: [
          {
            foreignKeyName: "project_calendars_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_daily_briefs: {
        Row: {
          brief_content: string
          brief_date: string
          created_at: string
          generation_completed_at: string | null
          generation_error: string | null
          generation_started_at: string | null
          generation_status: string
          id: string
          metadata: Json | null
          project_id: string
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brief_content: string
          brief_date: string
          created_at?: string
          generation_completed_at?: string | null
          generation_error?: string | null
          generation_started_at?: string | null
          generation_status?: string
          id?: string
          metadata?: Json | null
          project_id: string
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brief_content?: string
          brief_date?: string
          created_at?: string
          generation_completed_at?: string | null
          generation_error?: string | null
          generation_started_at?: string | null
          generation_status?: string
          id?: string
          metadata?: Json | null
          project_id?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_daily_briefs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_daily_briefs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_brief_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_daily_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_questions: {
        Row: {
          answer_brain_dump_id: string | null
          answered_at: string | null
          ask_after: string | null
          category: string | null
          context: string | null
          created_at: string
          expected_outcome: string | null
          id: string
          priority: string | null
          project_id: string | null
          question: string
          shown_to_user_count: number
          source: string | null
          source_field: string | null
          status: string | null
          triggers: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_brain_dump_id?: string | null
          answered_at?: string | null
          ask_after?: string | null
          category?: string | null
          context?: string | null
          created_at?: string
          expected_outcome?: string | null
          id?: string
          priority?: string | null
          project_id?: string | null
          question: string
          shown_to_user_count?: number
          source?: string | null
          source_field?: string | null
          status?: string | null
          triggers?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_brain_dump_id?: string | null
          answered_at?: string | null
          ask_after?: string | null
          category?: string | null
          context?: string | null
          created_at?: string
          expected_outcome?: string | null
          id?: string
          priority?: string | null
          project_id?: string | null
          question?: string
          shown_to_user_count?: number
          source?: string | null
          source_field?: string | null
          status?: string | null
          triggers?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_questions_answer_brain_dump_id_fkey"
            columns: ["answer_brain_dump_id"]
            isOneToOne: false
            referencedRelation: "brain_dumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_synthesis: {
        Row: {
          applied_at: string | null
          created_at: string
          generation_duration_ms: number | null
          generation_model: string | null
          id: string
          insights: string | null
          operations_count: number | null
          project_id: string
          status: string | null
          synthesis_content: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          generation_duration_ms?: number | null
          generation_model?: string | null
          id?: string
          insights?: string | null
          operations_count?: number | null
          project_id: string
          status?: string | null
          synthesis_content: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          generation_duration_ms?: number | null
          generation_model?: string | null
          id?: string
          insights?: string | null
          operations_count?: number | null
          project_id?: string
          status?: string | null
          synthesis_content?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_synthesis_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          calendar_color_id: string | null
          calendar_settings: Json | null
          calendar_sync_enabled: boolean | null
          context: string | null
          core_context_descriptions: Json | null
          core_goals_momentum: string | null
          core_harmony_integration: string | null
          core_integrity_ideals: string | null
          core_meaning_identity: string | null
          core_opportunity_freedom: string | null
          core_people_bonds: string | null
          core_power_resources: string | null
          core_reality_understanding: string | null
          core_trust_safeguards: string | null
          created_at: string
          description: string | null
          end_date: string | null
          executive_summary: string | null
          id: string
          name: string
          slug: string
          source: string | null
          source_metadata: Json | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_color_id?: string | null
          calendar_settings?: Json | null
          calendar_sync_enabled?: boolean | null
          context?: string | null
          core_context_descriptions?: Json | null
          core_goals_momentum?: string | null
          core_harmony_integration?: string | null
          core_integrity_ideals?: string | null
          core_meaning_identity?: string | null
          core_opportunity_freedom?: string | null
          core_people_bonds?: string | null
          core_power_resources?: string | null
          core_reality_understanding?: string | null
          core_trust_safeguards?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          executive_summary?: string | null
          id?: string
          name: string
          slug: string
          source?: string | null
          source_metadata?: Json | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_color_id?: string | null
          calendar_settings?: Json | null
          calendar_sync_enabled?: boolean | null
          context?: string | null
          core_context_descriptions?: Json | null
          core_goals_momentum?: string | null
          core_harmony_integration?: string | null
          core_integrity_ideals?: string | null
          core_meaning_identity?: string | null
          core_opportunity_freedom?: string | null
          core_people_bonds?: string | null
          core_power_resources?: string | null
          core_reality_understanding?: string | null
          core_trust_safeguards?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          executive_summary?: string | null
          id?: string
          name?: string
          slug?: string
          source?: string | null
          source_metadata?: Json | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      projects_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          history_id: string
          is_first_version: boolean | null
          project_data: Json
          project_id: string
          version_number: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          history_id?: string
          is_first_version?: boolean | null
          project_data: Json
          project_id: string
          version_number: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          history_id?: string
          is_first_version?: boolean | null
          project_data?: Json
          project_id?: string
          version_number?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          endpoint: string
          id: string
          is_active: boolean | null
          last_used_at: string | null
          p256dh_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          endpoint: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          p256dh_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          p256dh_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_metrics: {
        Row: {
          brain_dump_length: number | null
          created_at: string | null
          created_project: boolean | null
          created_tasks_count: number | null
          id: string
          presented_at: string
          question_id: string | null
          responded_at: string | null
          response_quality: string | null
          user_id: string | null
        }
        Insert: {
          brain_dump_length?: number | null
          created_at?: string | null
          created_project?: boolean | null
          created_tasks_count?: number | null
          id?: string
          presented_at: string
          question_id?: string | null
          responded_at?: string | null
          response_quality?: string | null
          user_id?: string | null
        }
        Update: {
          brain_dump_length?: number | null
          created_at?: string | null
          created_project?: boolean | null
          created_tasks_count?: number | null
          id?: string
          presented_at?: string
          question_id?: string | null
          responded_at?: string | null
          response_quality?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_metrics_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "project_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_templates: {
        Row: {
          category: string
          conditions: Json | null
          created_at: string | null
          effectiveness_score: number | null
          id: string
          template: string
          updated_at: string | null
          usage_count: number | null
          variables: Json | null
        }
        Insert: {
          category: string
          conditions?: Json | null
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          template: string
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Update: {
          category?: string
          conditions?: Json | null
          created_at?: string | null
          effectiveness_score?: number | null
          id?: string
          template?: string
          updated_at?: string | null
          usage_count?: number | null
          variables?: Json | null
        }
        Relationships: []
      }
      queue_jobs: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string
          dedup_key: string | null
          error_message: string | null
          id: string
          job_type: Database["public"]["Enums"]["queue_type"]
          max_attempts: number | null
          metadata: Json | null
          priority: number | null
          processed_at: string | null
          queue_job_id: string
          result: Json | null
          scheduled_for: string
          started_at: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          dedup_key?: string | null
          error_message?: string | null
          id?: string
          job_type: Database["public"]["Enums"]["queue_type"]
          max_attempts?: number | null
          metadata?: Json | null
          priority?: number | null
          processed_at?: string | null
          queue_job_id: string
          result?: Json | null
          scheduled_for: string
          started_at?: string | null
          status: Database["public"]["Enums"]["queue_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          dedup_key?: string | null
          error_message?: string | null
          id?: string
          job_type?: Database["public"]["Enums"]["queue_type"]
          max_attempts?: number | null
          metadata?: Json | null
          priority?: number | null
          processed_at?: string | null
          queue_job_id?: string
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recurring_task_instances: {
        Row: {
          calendar_event_id: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          instance_date: string
          notes: string | null
          skipped: boolean | null
          status: string | null
          task_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          instance_date: string
          notes?: string | null
          skipped?: boolean | null
          status?: string | null
          task_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          instance_date?: string
          notes?: string | null
          skipped?: boolean | null
          status?: string | null
          task_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_task_instances_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "recurring_task_instances_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_task_migration_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          migration_type: string
          new_calendar_event_id: string | null
          new_recurrence_ends: string | null
          old_calendar_event_id: string | null
          old_recurrence_ends: string | null
          project_id: string | null
          status: string
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          migration_type: string
          new_calendar_event_id?: string | null
          new_recurrence_ends?: string | null
          old_calendar_event_id?: string | null
          old_recurrence_ends?: string | null
          project_id?: string | null
          status?: string
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          migration_type?: string
          new_calendar_event_id?: string | null
          new_recurrence_ends?: string | null
          old_calendar_event_id?: string | null
          old_recurrence_ends?: string | null
          project_id?: string | null
          status?: string
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_task_migration_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_task_migration_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "recurring_task_migration_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_sms_messages: {
        Row: {
          calendar_event_id: string | null
          cancelled_at: string | null
          created_at: string | null
          event_details: Json | null
          event_end: string | null
          event_start: string | null
          event_title: string | null
          generated_via: string | null
          generation_cost_usd: number | null
          id: string
          last_error: string | null
          llm_model: string | null
          max_send_attempts: number | null
          message_content: string
          message_type: string
          scheduled_for: string
          send_attempts: number | null
          sent_at: string | null
          sms_message_id: string | null
          status: string
          timezone: string
          twilio_sid: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          event_details?: Json | null
          event_end?: string | null
          event_start?: string | null
          event_title?: string | null
          generated_via?: string | null
          generation_cost_usd?: number | null
          id?: string
          last_error?: string | null
          llm_model?: string | null
          max_send_attempts?: number | null
          message_content: string
          message_type?: string
          scheduled_for: string
          send_attempts?: number | null
          sent_at?: string | null
          sms_message_id?: string | null
          status?: string
          timezone?: string
          twilio_sid?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          event_details?: Json | null
          event_end?: string | null
          event_start?: string | null
          event_title?: string | null
          generated_via?: string | null
          generation_cost_usd?: number | null
          id?: string
          last_error?: string | null
          llm_model?: string | null
          max_send_attempts?: number | null
          message_content?: string
          message_type?: string
          scheduled_for?: string
          send_attempts?: number | null
          sent_at?: string | null
          sms_message_id?: string | null
          status?: string
          timezone?: string
          twilio_sid?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_sms_messages_sms_message_id_fkey"
            columns: ["sms_message_id"]
            isOneToOne: false
            referencedRelation: "sms_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      security_logs: {
        Row: {
          content: string
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          llm_validation: Json | null
          metadata: Json | null
          regex_patterns: Json | null
          user_agent: string | null
          user_id: string
          was_blocked: boolean
        }
        Insert: {
          content: string
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          llm_validation?: Json | null
          metadata?: Json | null
          regex_patterns?: Json | null
          user_agent?: string | null
          user_id: string
          was_blocked?: boolean
        }
        Update: {
          content?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          llm_validation?: Json | null
          metadata?: Json | null
          regex_patterns?: Json | null
          user_agent?: string | null
          user_id?: string
          was_blocked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "security_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_alert_history: {
        Row: {
          alert_type: string
          id: string
          metadata: Json | null
          metric_value: number
          notification_error: string | null
          notification_sent: boolean
          resolved_at: string | null
          severity: string
          threshold_value: number
          triggered_at: string
        }
        Insert: {
          alert_type: string
          id?: string
          metadata?: Json | null
          metric_value: number
          notification_error?: string | null
          notification_sent?: boolean
          resolved_at?: string | null
          severity: string
          threshold_value: number
          triggered_at?: string
        }
        Update: {
          alert_type?: string
          id?: string
          metadata?: Json | null
          metric_value?: number
          notification_error?: string | null
          notification_sent?: boolean
          resolved_at?: string | null
          severity?: string
          threshold_value?: number
          triggered_at?: string
        }
        Relationships: []
      }
      sms_alert_thresholds: {
        Row: {
          alert_type: string
          cooldown_minutes: number
          created_at: string
          id: string
          is_enabled: boolean
          last_triggered_at: string | null
          notification_channels: string[]
          severity: string
          threshold_value: number
          updated_at: string
        }
        Insert: {
          alert_type: string
          cooldown_minutes?: number
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_triggered_at?: string | null
          notification_channels?: string[]
          severity: string
          threshold_value: number
          updated_at?: string
        }
        Update: {
          alert_type?: string
          cooldown_minutes?: number
          created_at?: string
          id?: string
          is_enabled?: boolean
          last_triggered_at?: string | null
          notification_channels?: string[]
          severity?: string
          threshold_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          attempt_count: number | null
          created_at: string | null
          delivered_at: string | null
          id: string
          max_attempts: number | null
          message_content: string
          metadata: Json | null
          next_retry_at: string | null
          notification_delivery_id: string | null
          phone_number: string
          priority: Database["public"]["Enums"]["sms_priority"]
          project_id: string | null
          queue_job_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["sms_status"]
          task_id: string | null
          template_id: string | null
          template_vars: Json | null
          twilio_error_code: number | null
          twilio_error_message: string | null
          twilio_sid: string | null
          twilio_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attempt_count?: number | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          max_attempts?: number | null
          message_content: string
          metadata?: Json | null
          next_retry_at?: string | null
          notification_delivery_id?: string | null
          phone_number: string
          priority?: Database["public"]["Enums"]["sms_priority"]
          project_id?: string | null
          queue_job_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sms_status"]
          task_id?: string | null
          template_id?: string | null
          template_vars?: Json | null
          twilio_error_code?: number | null
          twilio_error_message?: string | null
          twilio_sid?: string | null
          twilio_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attempt_count?: number | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          max_attempts?: number | null
          message_content?: string
          metadata?: Json | null
          next_retry_at?: string | null
          notification_delivery_id?: string | null
          phone_number?: string
          priority?: Database["public"]["Enums"]["sms_priority"]
          project_id?: string | null
          queue_job_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sms_status"]
          task_id?: string | null
          template_id?: string | null
          template_vars?: Json | null
          twilio_error_code?: number | null
          twilio_error_message?: string | null
          twilio_sid?: string | null
          twilio_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_notification_delivery_id_fkey"
            columns: ["notification_delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_queue_job_id_fkey"
            columns: ["queue_job_id"]
            isOneToOne: false
            referencedRelation: "queue_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "sms_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "sms_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_metrics: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          metric_date: string
          metric_hour: number | null
          metric_type: string
          metric_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          metric_date: string
          metric_hour?: number | null
          metric_type: string
          metric_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          metric_date?: string
          metric_hour?: number | null
          metric_type?: string
          metric_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sms_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          max_length: number | null
          message_template: string
          name: string
          required_vars: Json | null
          template_key: string
          template_vars: Json | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          max_length?: number | null
          message_template: string
          name: string
          required_vars?: Json | null
          template_key: string
          template_vars?: Json | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          max_length?: number | null
          message_template?: string
          name?: string
          required_vars?: Json | null
          template_key?: string
          template_vars?: Json | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          billing_interval: string | null
          created_at: string
          currency: string | null
          description: string | null
          features: Json | null
          id: string
          interval_count: number | null
          is_active: boolean | null
          name: string
          price_cents: number
          stripe_price_id: string
          updated_at: string
        }
        Insert: {
          billing_interval?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          interval_count?: number | null
          is_active?: boolean | null
          name: string
          price_cents: number
          stripe_price_id: string
          updated_at?: string
        }
        Update: {
          billing_interval?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          interval_count?: number | null
          is_active?: boolean | null
          name?: string
          price_cents?: number
          stripe_price_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_metrics: {
        Row: {
          id: string
          metric_description: string | null
          metric_name: string
          metric_unit: string | null
          metric_value: number
          recorded_at: string | null
        }
        Insert: {
          id?: string
          metric_description?: string | null
          metric_name: string
          metric_unit?: string | null
          metric_value: number
          recorded_at?: string | null
        }
        Update: {
          id?: string
          metric_description?: string | null
          metric_name?: string
          metric_unit?: string | null
          metric_value?: number
          recorded_at?: string | null
        }
        Relationships: []
      }
      task_calendar_events: {
        Row: {
          attendees: Json | null
          calendar_event_id: string
          calendar_id: string
          created_at: string | null
          event_end: string | null
          event_link: string | null
          event_start: string | null
          event_title: string | null
          exception_type: string | null
          id: string
          is_exception: boolean | null
          is_master_event: boolean | null
          last_synced_at: string | null
          organizer_display_name: string | null
          organizer_email: string | null
          organizer_self: boolean | null
          original_start_time: string | null
          project_calendar_id: string | null
          recurrence_instance_date: string | null
          recurrence_master_id: string | null
          recurrence_rule: string | null
          series_update_scope: string | null
          sync_error: string | null
          sync_source: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          sync_version: number | null
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attendees?: Json | null
          calendar_event_id: string
          calendar_id: string
          created_at?: string | null
          event_end?: string | null
          event_link?: string | null
          event_start?: string | null
          event_title?: string | null
          exception_type?: string | null
          id?: string
          is_exception?: boolean | null
          is_master_event?: boolean | null
          last_synced_at?: string | null
          organizer_display_name?: string | null
          organizer_email?: string | null
          organizer_self?: boolean | null
          original_start_time?: string | null
          project_calendar_id?: string | null
          recurrence_instance_date?: string | null
          recurrence_master_id?: string | null
          recurrence_rule?: string | null
          series_update_scope?: string | null
          sync_error?: string | null
          sync_source?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          sync_version?: number | null
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attendees?: Json | null
          calendar_event_id?: string
          calendar_id?: string
          created_at?: string | null
          event_end?: string | null
          event_link?: string | null
          event_start?: string | null
          event_title?: string | null
          exception_type?: string | null
          id?: string
          is_exception?: boolean | null
          is_master_event?: boolean | null
          last_synced_at?: string | null
          organizer_display_name?: string | null
          organizer_email?: string | null
          organizer_self?: boolean | null
          original_start_time?: string | null
          project_calendar_id?: string | null
          recurrence_instance_date?: string | null
          recurrence_master_id?: string | null
          recurrence_rule?: string | null
          series_update_scope?: string | null
          sync_error?: string | null
          sync_source?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          sync_version?: number | null
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_calendar_events_project_calendar_id_fkey"
            columns: ["project_calendar_id"]
            isOneToOne: false
            referencedRelation: "project_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_calendar_events_recurrence_master_id_fkey"
            columns: ["recurrence_master_id"]
            isOneToOne: false
            referencedRelation: "task_calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_calendar_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          dependencies: string[] | null
          description: string | null
          details: string | null
          duration_minutes: number | null
          id: string
          outdated: boolean | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string | null
          recurrence_end_source:
            | Database["public"]["Enums"]["recurrence_end_reason"]
            | null
          recurrence_ends: string | null
          recurrence_pattern:
            | Database["public"]["Enums"]["recurrence_pattern"]
            | null
          source: string | null
          source_calendar_event_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_steps: string | null
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          dependencies?: string[] | null
          description?: string | null
          details?: string | null
          duration_minutes?: number | null
          id?: string
          outdated?: boolean | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          recurrence_end_source?:
            | Database["public"]["Enums"]["recurrence_end_reason"]
            | null
          recurrence_ends?: string | null
          recurrence_pattern?:
            | Database["public"]["Enums"]["recurrence_pattern"]
            | null
          source?: string | null
          source_calendar_event_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_steps?: string | null
          task_type?: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          dependencies?: string[] | null
          description?: string | null
          details?: string | null
          duration_minutes?: number | null
          id?: string
          outdated?: boolean | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          recurrence_end_source?:
            | Database["public"]["Enums"]["recurrence_end_reason"]
            | null
          recurrence_ends?: string | null
          recurrence_pattern?:
            | Database["public"]["Enums"]["recurrence_pattern"]
            | null
          source?: string | null
          source_calendar_event_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_steps?: string | null
          task_type?: Database["public"]["Enums"]["task_type"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          ai_suggestions: Json | null
          block_type: string
          calendar_event_id: string | null
          calendar_event_link: string | null
          created_at: string
          duration_minutes: number
          end_time: string
          id: string
          last_synced_at: string | null
          project_id: string | null
          start_time: string
          suggestions_generated_at: string | null
          suggestions_model: string | null
          suggestions_summary: string | null
          sync_source: string | null
          sync_status: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_suggestions?: Json | null
          block_type?: string
          calendar_event_id?: string | null
          calendar_event_link?: string | null
          created_at?: string
          duration_minutes: number
          end_time: string
          id?: string
          last_synced_at?: string | null
          project_id?: string | null
          start_time: string
          suggestions_generated_at?: string | null
          suggestions_model?: string | null
          suggestions_summary?: string | null
          sync_source?: string | null
          sync_status?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_suggestions?: Json | null
          block_type?: string
          calendar_event_id?: string | null
          calendar_event_link?: string | null
          created_at?: string
          duration_minutes?: number
          end_time?: string
          id?: string
          last_synced_at?: string | null
          project_id?: string | null
          start_time?: string
          suggestions_generated_at?: string | null
          suggestions_model?: string | null
          suggestions_summary?: string | null
          sync_source?: string | null
          sync_status?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_reminders: {
        Row: {
          created_at: string | null
          id: string
          reminder_type: string
          sent_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reminder_type: string
          sent_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reminder_type?: string
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          activity_data: Json | null
          activity_type: string
          created_at: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          activity_data?: Json | null
          activity_type: string
          created_at?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          activity_data?: Json | null
          activity_type?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_brief_preferences: {
        Row: {
          created_at: string
          day_of_week: number | null
          frequency: string | null
          id: string
          is_active: boolean | null
          time_of_day: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          time_of_day?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          time_of_day?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_calendar_preferences: {
        Row: {
          created_at: string
          default_task_duration_minutes: number | null
          exclude_holidays: boolean | null
          holiday_country_code: string | null
          id: string
          max_task_duration_minutes: number | null
          min_task_duration_minutes: number | null
          prefer_morning_for_important_tasks: boolean | null
          updated_at: string
          user_id: string
          work_end_time: string | null
          work_start_time: string | null
          working_days: number[] | null
        }
        Insert: {
          created_at?: string
          default_task_duration_minutes?: number | null
          exclude_holidays?: boolean | null
          holiday_country_code?: string | null
          id?: string
          max_task_duration_minutes?: number | null
          min_task_duration_minutes?: number | null
          prefer_morning_for_important_tasks?: boolean | null
          updated_at?: string
          user_id: string
          work_end_time?: string | null
          work_start_time?: string | null
          working_days?: number[] | null
        }
        Update: {
          created_at?: string
          default_task_duration_minutes?: number | null
          exclude_holidays?: boolean | null
          holiday_country_code?: string | null
          id?: string
          max_task_duration_minutes?: number | null
          min_task_duration_minutes?: number | null
          prefer_morning_for_important_tasks?: boolean | null
          updated_at?: string
          user_id?: string
          work_end_time?: string | null
          work_start_time?: string | null
          working_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "user_calendar_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendar_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expiry_date: number | null
          google_email: string | null
          google_user_id: string | null
          id: string
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expiry_date?: number | null
          google_email?: string | null
          google_user_id?: string | null
          id?: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expiry_date?: number | null
          google_email?: string | null
          google_user_id?: string | null
          id?: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_calendar_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_context: {
        Row: {
          active_projects: string | null
          background: string | null
          blockers: string | null
          collaboration_needs: string | null
          communication_style: string | null
          created_at: string
          focus_areas: string | null
          goals_overview: string | null
          habits: string | null
          help_priorities: string | null
          id: string
          input_challenges: string | null
          input_help_focus: string | null
          input_projects: string | null
          input_work_style: string | null
          last_parsed_input_challenges: string | null
          last_parsed_input_help_focus: string | null
          last_parsed_input_projects: string | null
          last_parsed_input_work_style: string | null
          onboarding_completed_at: string | null
          onboarding_version: number | null
          organization_method: string | null
          preferred_work_hours: string | null
          priorities: string | null
          productivity_challenges: string | null
          schedule_preferences: string | null
          skill_gaps: string | null
          tools: string | null
          updated_at: string
          user_id: string
          work_style: string | null
          workflows: string | null
        }
        Insert: {
          active_projects?: string | null
          background?: string | null
          blockers?: string | null
          collaboration_needs?: string | null
          communication_style?: string | null
          created_at?: string
          focus_areas?: string | null
          goals_overview?: string | null
          habits?: string | null
          help_priorities?: string | null
          id?: string
          input_challenges?: string | null
          input_help_focus?: string | null
          input_projects?: string | null
          input_work_style?: string | null
          last_parsed_input_challenges?: string | null
          last_parsed_input_help_focus?: string | null
          last_parsed_input_projects?: string | null
          last_parsed_input_work_style?: string | null
          onboarding_completed_at?: string | null
          onboarding_version?: number | null
          organization_method?: string | null
          preferred_work_hours?: string | null
          priorities?: string | null
          productivity_challenges?: string | null
          schedule_preferences?: string | null
          skill_gaps?: string | null
          tools?: string | null
          updated_at?: string
          user_id: string
          work_style?: string | null
          workflows?: string | null
        }
        Update: {
          active_projects?: string | null
          background?: string | null
          blockers?: string | null
          collaboration_needs?: string | null
          communication_style?: string | null
          created_at?: string
          focus_areas?: string | null
          goals_overview?: string | null
          habits?: string | null
          help_priorities?: string | null
          id?: string
          input_challenges?: string | null
          input_help_focus?: string | null
          input_projects?: string | null
          input_work_style?: string | null
          last_parsed_input_challenges?: string | null
          last_parsed_input_help_focus?: string | null
          last_parsed_input_projects?: string | null
          last_parsed_input_work_style?: string | null
          onboarding_completed_at?: string | null
          onboarding_version?: number | null
          organization_method?: string | null
          preferred_work_hours?: string | null
          priorities?: string | null
          productivity_challenges?: string | null
          schedule_preferences?: string | null
          skill_gaps?: string | null
          tools?: string | null
          updated_at?: string
          user_id?: string
          work_style?: string | null
          workflows?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_context_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_discounts: {
        Row: {
          applied_at: string | null
          discount_code_id: string
          expires_at: string | null
          id: string
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          discount_code_id: string
          expires_at?: string | null
          id?: string
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          discount_code_id?: string
          expires_at?: string | null
          id?: string
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_discounts_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_discounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          batch_enabled: boolean
          batch_interval_minutes: number | null
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          max_per_day: number | null
          max_per_hour: number | null
          priority: string
          push_enabled: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          should_email_daily_brief: boolean
          should_sms_daily_brief: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_enabled?: boolean
          batch_interval_minutes?: number | null
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          max_per_day?: number | null
          max_per_hour?: number | null
          priority?: string
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          should_email_daily_brief?: boolean
          should_sms_daily_brief?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_enabled?: boolean
          batch_interval_minutes?: number | null
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          max_per_day?: number | null
          max_per_hour?: number | null
          priority?: string
          push_enabled?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          should_email_daily_brief?: boolean
          should_sms_daily_brief?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences_backup: {
        Row: {
          batch_enabled: boolean | null
          batch_interval_minutes: number | null
          created_at: string | null
          email_enabled: boolean | null
          event_type: string | null
          id: string | null
          in_app_enabled: boolean | null
          max_per_day: number | null
          max_per_hour: number | null
          priority: string | null
          push_enabled: boolean | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          should_email_daily_brief: boolean | null
          should_sms_daily_brief: boolean | null
          sms_enabled: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          batch_enabled?: boolean | null
          batch_interval_minutes?: number | null
          created_at?: string | null
          email_enabled?: boolean | null
          event_type?: string | null
          id?: string | null
          in_app_enabled?: boolean | null
          max_per_day?: number | null
          max_per_hour?: number | null
          priority?: string | null
          push_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          should_email_daily_brief?: boolean | null
          should_sms_daily_brief?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          batch_enabled?: boolean | null
          batch_interval_minutes?: number | null
          created_at?: string | null
          email_enabled?: boolean | null
          event_type?: string | null
          id?: string | null
          in_app_enabled?: boolean | null
          max_per_day?: number | null
          max_per_hour?: number | null
          priority?: string | null
          push_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          should_email_daily_brief?: boolean | null
          should_sms_daily_brief?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          dismissed_at: string | null
          event_type: string | null
          expires_at: string | null
          id: string
          message: string
          priority: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          dismissed_at?: string | null
          event_type?: string | null
          expires_at?: string | null
          id?: string
          message: string
          priority?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          dismissed_at?: string | null
          event_type?: string | null
          expires_at?: string | null
          id?: string
          message?: string
          priority?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sms_preferences: {
        Row: {
          created_at: string | null
          daily_count_reset_at: string | null
          daily_sms_count: number | null
          daily_sms_limit: number | null
          evening_recap_enabled: boolean | null
          event_reminder_lead_time_minutes: number | null
          event_reminders_enabled: boolean | null
          id: string
          morning_kickoff_enabled: boolean | null
          morning_kickoff_time: string | null
          opt_out_reason: string | null
          opted_out: boolean | null
          opted_out_at: string | null
          phone_number: string | null
          phone_verified: boolean | null
          phone_verified_at: string | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string | null
          urgent_alerts: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_count_reset_at?: string | null
          daily_sms_count?: number | null
          daily_sms_limit?: number | null
          evening_recap_enabled?: boolean | null
          event_reminder_lead_time_minutes?: number | null
          event_reminders_enabled?: boolean | null
          id?: string
          morning_kickoff_enabled?: boolean | null
          morning_kickoff_time?: string | null
          opt_out_reason?: string | null
          opted_out?: boolean | null
          opted_out_at?: string | null
          phone_number?: string | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          urgent_alerts?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_count_reset_at?: string | null
          daily_sms_count?: number | null
          daily_sms_limit?: number | null
          evening_recap_enabled?: boolean | null
          event_reminder_lead_time_minutes?: number | null
          event_reminders_enabled?: boolean | null
          id?: string
          morning_kickoff_enabled?: boolean | null
          morning_kickoff_time?: string | null
          opt_out_reason?: string | null
          opted_out?: boolean | null
          opted_out_at?: string | null
          phone_number?: string | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          urgent_alerts?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sms_preferences_user_id_fkey1"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          access_restricted: boolean | null
          access_restricted_at: string | null
          bio: string | null
          completed_onboarding: boolean | null
          created_at: string
          email: string
          id: string
          is_admin: boolean
          is_beta_user: boolean | null
          last_visit: string | null
          name: string | null
          onboarding_v2_completed_at: string | null
          onboarding_v2_skipped_calendar: boolean | null
          onboarding_v2_skipped_sms: boolean | null
          productivity_challenges: Json | null
          stripe_customer_id: string | null
          subscription_plan_id: string | null
          subscription_status: string | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string
          usage_archetype: string | null
        }
        Insert: {
          access_restricted?: boolean | null
          access_restricted_at?: string | null
          bio?: string | null
          completed_onboarding?: boolean | null
          created_at?: string
          email: string
          id: string
          is_admin?: boolean
          is_beta_user?: boolean | null
          last_visit?: string | null
          name?: string | null
          onboarding_v2_completed_at?: string | null
          onboarding_v2_skipped_calendar?: boolean | null
          onboarding_v2_skipped_sms?: boolean | null
          productivity_challenges?: Json | null
          stripe_customer_id?: string | null
          subscription_plan_id?: string | null
          subscription_status?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          usage_archetype?: string | null
        }
        Update: {
          access_restricted?: boolean | null
          access_restricted_at?: string | null
          bio?: string | null
          completed_onboarding?: boolean | null
          created_at?: string
          email?: string
          id?: string
          is_admin?: boolean
          is_beta_user?: boolean | null
          last_visit?: string | null
          name?: string | null
          onboarding_v2_completed_at?: string | null
          onboarding_v2_skipped_calendar?: boolean | null
          onboarding_v2_skipped_sms?: boolean | null
          productivity_challenges?: Json | null
          stripe_customer_id?: string | null
          subscription_plan_id?: string | null
          subscription_status?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          usage_archetype?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      visitors: {
        Row: {
          created_at: string
          id: number
          ip_address: unknown
          updated_at: string
          user_agent: string | null
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          ip_address?: unknown
          updated_at?: string
          user_agent?: string | null
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: number
          ip_address?: unknown
          updated_at?: string
          user_agent?: string | null
          visitor_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json | null
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          event_id: string
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_llm_cost_analytics: {
        Row: {
          avg_response_time: number | null
          date: string | null
          failed_requests: number | null
          model_used: string | null
          operation_type: string | null
          successful_requests: number | null
          total_cost: number | null
          total_requests: number | null
          total_tokens: number | null
          unique_users: number | null
        }
        Relationships: []
      }
      admin_user_llm_costs: {
        Row: {
          avg_response_time: number | null
          email: string | null
          last_usage: string | null
          name: string | null
          total_cost: number | null
          total_requests: number | null
          total_tokens: number | null
          user_id: string | null
        }
        Relationships: []
      }
      brief_email_stats: {
        Row: {
          avg_send_time_seconds: number | null
          date: string | null
          failed_count: number | null
          opened_count: number | null
          pending_count: number | null
          sent_count: number | null
          total_emails: number | null
        }
        Relationships: []
      }
      error_summary: {
        Row: {
          affected_projects: number | null
          affected_users: number | null
          avg_response_time_ms: number | null
          error_count: number | null
          error_type: string | null
          first_occurrence: string | null
          last_occurrence: string | null
          resolved_count: number | null
          severity: string | null
        }
        Relationships: []
      }
      project_kept_versions: {
        Row: {
          created_at: string | null
          created_by: string | null
          current_name: string | null
          history_id: string | null
          is_first_version: boolean | null
          project_data: Json | null
          project_id: string | null
          version_name: string | null
          version_number: number | null
          version_status: string | null
          version_type: string | null
        }
        Relationships: []
      }
      queue_jobs_stats: {
        Row: {
          avg_duration_seconds: number | null
          count: number | null
          job_type: string | null
          newest_job: string | null
          oldest_job: string | null
          status: string | null
        }
        Relationships: []
      }
      recurring_task_summary: {
        Row: {
          completed_instances: number | null
          exception_count: number | null
          last_completed_at: string | null
          next_occurrence: string | null
          recurrence_ends: string | null
          recurrence_pattern:
            | Database["public"]["Enums"]["recurrence_pattern"]
            | null
          skipped_instances: number | null
          start_date: string | null
          task_id: string | null
          title: string | null
          total_instances: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_metrics_daily: {
        Row: {
          active_users: number | null
          avg_delivery_time_ms: number | null
          avg_generation_time_ms: number | null
          cancelled_count: number | null
          daily_limit_hit_count: number | null
          delivered_count: number | null
          delivery_rate_percent: number | null
          delivery_success_rate: number | null
          failed_count: number | null
          llm_cost_usd: number | null
          llm_success_count: number | null
          llm_success_rate: number | null
          llm_success_rate_percent: number | null
          metric_date: string | null
          opt_out_count: number | null
          quiet_hours_skip_count: number | null
          scheduled_count: number | null
          sent_count: number | null
          sms_cost_usd: number | null
          template_fallback_count: number | null
        }
        Relationships: []
      }
      trial_statistics: {
        Row: {
          active_subscriptions: number | null
          active_trials: number | null
          avg_trial_length_days: number | null
          beta_users: number | null
          expired_trials: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_queue_job: {
        Args: {
          p_dedup_key?: string
          p_job_type: string
          p_metadata: Json
          p_priority?: number
          p_scheduled_for?: string
          p_user_id: string
        }
        Returns: string
      }
      approve_generated_phases: {
        Args: { p_generation_id: string; p_phase_ids?: string[] }
        Returns: {
          created_phase_id: string
          generated_phase_id: string
          phase_name: string
        }[]
      }
      batch_update_phase_dates: {
        Args: { p_project_id: string; p_updates: Json }
        Returns: {
          end_date: string
          id: string
          start_date: string
          updated_at: string
        }[]
      }
      batch_update_phase_orders: {
        Args: { p_project_id: string; p_updates: Json }
        Returns: {
          id: string
          order_position: number
          updated_at: string
        }[]
      }
      brain_dump_cleanup_preview: {
        Args: never
        Returns: {
          draft_to_keep_id: string
          draft_to_keep_size: number
          drafts_to_delete: number
          exact_duplicates: number
          prefix_matches: number
          project_name: string
          user_email: string
        }[]
      }
      brain_dump_cleanup_report: {
        Args: never
        Returns: {
          metric: string
          value: number
        }[]
      }
      brain_dump_cleanup_with_report: {
        Args: { execute_delete?: boolean }
        Returns: {
          details: Json
          report_type: string
        }[]
      }
      cancel_brief_jobs_for_date: {
        Args: {
          p_brief_date: string
          p_exclude_job_id?: string
          p_user_id: string
        }
        Returns: {
          cancelled_count: number
          cancelled_job_ids: string[]
        }[]
      }
      cancel_job_with_reason: {
        Args: {
          p_allow_processing?: boolean
          p_job_id: string
          p_reason: string
        }
        Returns: boolean
      }
      cancel_jobs_atomic: {
        Args: {
          p_allowed_statuses?: string[]
          p_job_type: string
          p_metadata_filter?: Json
          p_user_id: string
        }
        Returns: {
          id: string
          job_type: string
          queue_job_id: string
          status: string
        }[]
      }
      cancel_jobs_in_time_window: {
        Args: {
          p_exclude_job_id?: string
          p_job_type: string
          p_user_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: number
      }
      cancel_scheduled_sms_for_event: {
        Args: { p_calendar_event_id: string; p_user_id?: string }
        Returns: {
          cancelled_count: number
          message_ids: string[]
        }[]
      }
      check_feedback_rate_limit: {
        Args: { client_ip: unknown }
        Returns: boolean
      }
      check_onboarding_complete: {
        Args: { user_id_param: string }
        Returns: boolean
      }
      claim_pending_jobs: {
        Args: { p_batch_size?: number; p_job_types: string[] }
        Returns: {
          attempts: number
          completed_at: string
          created_at: string
          error_message: string
          id: string
          job_type: string
          max_attempts: number
          metadata: Json
          priority: number
          queue_job_id: string
          scheduled_for: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      cleanup_duplicate_brain_dump_drafts: {
        Args: never
        Returns: {
          affected_projects: number
          affected_users: number
          deleted_count: number
        }[]
      }
      cleanup_old_brief_jobs: { Args: never; Returns: undefined }
      cleanup_old_tracking_links: {
        Args: { p_days_old?: number }
        Returns: number
      }
      cleanup_project_history: {
        Args: { target_project_id: string }
        Returns: undefined
      }
      cleanup_stale_brief_generations: {
        Args: { p_timeout_minutes?: number; p_user_id: string }
        Returns: {
          brief_date: string
          id: string
        }[]
      }
      complete_queue_job: {
        Args: { p_job_id: string; p_result?: Json }
        Returns: boolean
      }
      complete_recurring_instance: {
        Args: { p_instance_date: string; p_task_id: string; p_user_id: string }
        Returns: boolean
      }
      create_manual_project_version: {
        Args: { created_by_user?: string; target_project_id: string }
        Returns: number
      }
      create_tracking_link: {
        Args: { p_delivery_id: string; p_destination_url: string }
        Returns: string
      }
      decrement_phase_order: {
        Args: { p_order_threshold: number; p_project_id: string }
        Returns: undefined
      }
      emit_notification_event: {
        Args: {
          p_actor_user_id?: string
          p_event_source?: string
          p_event_type: string
          p_metadata?: Json
          p_payload?: Json
          p_scheduled_for?: string
          p_target_user_id?: string
        }
        Returns: string
      }
      fail_queue_job: {
        Args: { p_error_message: string; p_job_id: string; p_retry?: boolean }
        Returns: boolean
      }
      generate_recurring_instances: {
        Args: { p_end_date: string; p_start_date: string; p_task_id: string }
        Returns: {
          instance_date: string
        }[]
      }
      generate_short_code: { Args: { length?: number }; Returns: string }
      get_admin_model_breakdown: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          avg_response_time: number
          model: string
          requests: number
          success_rate: number
          total_cost: number
          total_tokens: number
        }[]
      }
      get_admin_operation_breakdown: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          avg_response_time: number
          operation: string
          requests: number
          success_rate: number
          total_cost: number
          total_tokens: number
        }[]
      }
      get_admin_top_users: {
        Args: { p_end_date: string; p_limit?: number; p_start_date: string }
        Returns: {
          avg_response_time: number
          email: string
          last_usage: string
          name: string
          requests: number
          total_cost: number
          total_tokens: number
          user_id: string
        }[]
      }
      get_brief_email_status: {
        Args: { p_brief_id: string }
        Returns: {
          email_id: string
          open_count: number
          opened_at: string
          recipient_email: string
          recipient_status: string
          sent_at: string
          status: string
        }[]
      }
      get_brief_generation_stats: {
        Args: { end_date: string; start_date: string }
        Returns: {
          avg_briefs_per_user: number
          date: string
          total_briefs: number
          unique_users: number
        }[]
      }
      get_calendar_analysis_stats: {
        Args: { p_user_id: string }
        Returns: {
          average_confidence: number
          completed_analyses: number
          last_analysis_at: string
          total_analyses: number
          total_projects_created: number
          total_tasks_created: number
        }[]
      }
      get_daily_active_users: {
        Args: { end_date: string; start_date: string }
        Returns: {
          active_users: number
          date: string
        }[]
      }
      get_daily_visitors: {
        Args: { end_date: string; start_date: string }
        Returns: {
          date: string
          visitor_count: number
        }[]
      }
      get_dashboard_data: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_timezone?: string
          p_today?: string
          p_user_id: string
        }
        Returns: Json
      }
      get_engagement_analytics: {
        Args: never
        Returns: {
          active_users: number
          avg_days_inactive: number
          briefs_sent_today: number
          briefs_sent_week: number
          cooling_off_users: number
          inactive_10_31_days: number
          inactive_31_plus_days: number
          inactive_4_10_days: number
          total_users: number
        }[]
      }
      get_link_click_stats: {
        Args: { p_days_back?: number; p_delivery_id?: string }
        Returns: {
          click_through_rate: number
          total_clicks: number
          total_links: number
          unique_clicked_links: number
        }[]
      }
      get_notification_active_subscriptions: {
        Args: never
        Returns: {
          email: string
          email_enabled: boolean
          in_app_enabled: boolean
          last_notification_sent: string
          name: string
          push_enabled: boolean
          sms_enabled: boolean
          subscribed_events: string[]
          user_id: string
        }[]
      }
      get_notification_channel_performance: {
        Args: { p_interval?: string }
        Returns: {
          avg_delivery_time_ms: number
          channel: string
          click_rate: number
          clicked: number
          delivered: number
          delivery_rate: number
          failed: number
          open_rate: number
          opened: number
          sent: number
          success_rate: number
          total_sent: number
        }[]
      }
      get_notification_delivery_timeline: {
        Args: { p_granularity?: string; p_interval?: string }
        Returns: {
          clicked: number
          delivered: number
          failed: number
          opened: number
          sent: number
          time_bucket: string
        }[]
      }
      get_notification_event_performance: {
        Args: { p_interval?: string }
        Returns: {
          avg_delivery_time_seconds: number
          click_rate: number
          event_type: string
          open_rate: number
          total_deliveries: number
          total_events: number
          unique_subscribers: number
        }[]
      }
      get_notification_failed_deliveries: {
        Args: { p_interval?: string; p_limit?: number }
        Returns: {
          attempts: number
          channel: string
          created_at: string
          delivery_id: string
          event_id: string
          event_type: string
          failed_at: string
          last_error: string
          max_attempts: number
          recipient_email: string
          recipient_user_id: string
        }[]
      }
      get_notification_overview_metrics: {
        Args: { p_interval?: string; p_offset?: string }
        Returns: {
          avg_click_rate: number
          avg_open_rate: number
          delivery_success_rate: number
          total_sent: number
        }[]
      }
      get_onboarding_v2_progress: { Args: { p_user_id: string }; Returns: Json }
      get_pending_brief_emails: {
        Args: { p_limit?: number }
        Returns: {
          brief_date: string
          brief_id: string
          created_at: string
          email_id: string
          subject: string
          user_id: string
        }[]
      }
      get_pending_calendar_suggestions: {
        Args: { p_user_id: string }
        Returns: {
          confidence_score: number
          created_at: string
          event_count: number
          suggested_description: string
          suggested_name: string
          suggestion_id: string
        }[]
      }
      get_project_history: {
        Args: { target_project_id: string }
        Returns: {
          created_at: string
          created_by: string
          is_first_version: boolean
          project_data: Json
          version_number: number
          version_type: string
        }[]
      }
      get_project_phases_hierarchy: {
        Args: { p_project_id: string; p_user_id?: string }
        Returns: Json
      }
      get_project_statistics: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: Json
      }
      get_project_version: {
        Args: { target_project_id: string; target_version: number }
        Returns: Json
      }
      get_projects_with_stats: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_user_id: string
        }
        Returns: Json
      }
      get_revenue_metrics: {
        Args: never
        Returns: {
          average_revenue_per_user: number
          churn_rate: number
          current_mrr: number
          lifetime_value: number
          mrr_growth: number
          previous_mrr: number
          total_revenue: number
        }[]
      }
      get_scheduled_sms_for_user: {
        Args: {
          p_end_date?: string
          p_start_date?: string
          p_status?: string
          p_user_id: string
        }
        Returns: {
          calendar_event_id: string
          created_at: string
          event_start: string
          event_title: string
          generated_via: string
          id: string
          message_content: string
          message_type: string
          scheduled_for: string
          status: string
        }[]
      }
      get_sms_daily_metrics: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          active_users: number
          avg_delivery_time_ms: number
          avg_generation_time_ms: number
          cancelled_count: number
          daily_limit_hit_count: number
          delivered_count: number
          delivery_rate_percent: number
          delivery_success_rate: number
          failed_count: number
          llm_cost_usd: number
          llm_success_count: number
          llm_success_rate: number
          llm_success_rate_percent: number
          metric_date: string
          opt_out_count: number
          quiet_hours_skip_count: number
          scheduled_count: number
          sent_count: number
          sms_cost_usd: number
          template_fallback_count: number
        }[]
      }
      get_sms_notification_stats: {
        Args: never
        Returns: {
          avg_sms_delivery_time_seconds: number
          opt_out_rate: number
          phone_verification_rate: number
          sms_adoption_rate: number
          sms_delivery_rate_24h: number
          total_sms_sent_24h: number
          total_users_with_phone: number
          users_opted_out: number
          users_phone_verified: number
          users_sms_enabled: number
        }[]
      }
      get_subscription_changes: {
        Args: { p_timeframe?: string }
        Returns: {
          cancellations: number
          date: string
          net_change: number
          new_subscriptions: number
        }[]
      }
      get_subscription_overview: {
        Args: never
        Returns: {
          active_subscriptions: number
          arr: number
          canceled_subscriptions: number
          mrr: number
          paused_subscriptions: number
          total_subscribers: number
          trial_subscriptions: number
        }[]
      }
      get_user_active_generations: {
        Args: { p_user_id: string }
        Returns: {
          brief_date: string
          brief_id: string
          generation_progress: Json
          generation_started_at: string
          generation_status: string
        }[]
      }
      get_user_engagement_metrics: {
        Args: never
        Returns: {
          active_users_30d: number
          active_users_7d: number
          avg_brief_length: number
          top_active_users: Json
          total_briefs: number
          total_users: number
        }[]
      }
      get_user_failed_payments_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_llm_usage: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: {
          avg_response_time: number
          by_model: Json
          by_operation: Json
          total_cost: number
          total_requests: number
          total_tokens: number
        }[]
      }
      get_user_sms_channel_info: {
        Args: { p_user_id: string }
        Returns: {
          has_sms_available: boolean
          opted_out: boolean
          phone_number: string
          phone_verified: boolean
          phone_verified_at: string
        }[]
      }
      get_user_sms_metrics: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          delivered_count: number
          delivery_rate: number
          failed_count: number
          llm_cost_usd: number
          metric_date: string
          scheduled_count: number
          sent_count: number
        }[]
      }
      get_user_subscription_status: {
        Args: { user_uuid: string }
        Returns: {
          current_period_end: string
          has_subscription: boolean
          is_beta_user: boolean
          subscription_status: string
        }[]
      }
      get_user_trial_status: {
        Args: { p_user_id: string }
        Returns: {
          days_until_trial_end: number
          has_active_subscription: boolean
          is_in_grace_period: boolean
          is_in_trial: boolean
          is_read_only: boolean
          is_trial_expired: boolean
          trial_end_date: string
        }[]
      }
      get_visitor_overview: {
        Args: never
        Returns: {
          total_visitors: number
          unique_visitors_today: number
          visitors_30d: number
          visitors_7d: number
        }[]
      }
      has_active_subscription: { Args: { user_uuid: string }; Returns: boolean }
      increment_question_display_count: {
        Args: { question_ids: string[] }
        Returns: undefined
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { user_id: string }; Returns: boolean }
      log_notification_event: {
        Args: {
          p_context?: Json
          p_correlation_id?: string
          p_delivery_id?: string
          p_event_id?: string
          p_level: string
          p_message: string
          p_metadata?: Json
          p_namespace?: string
          p_user_id?: string
        }
        Returns: undefined
      }
      normalize_queue_job_metadata: {
        Args: never
        Returns: {
          details: string
          error_count: number
          fixed_count: number
          skipped_count: number
        }[]
      }
      queue_sms_message: {
        Args: {
          p_message: string
          p_metadata?: Json
          p_phone_number: string
          p_priority?: Database["public"]["Enums"]["sms_priority"]
          p_scheduled_for?: string
          p_user_id: string
        }
        Returns: string
      }
      record_sms_metric: {
        Args: {
          p_metadata?: Json
          p_metric_date: string
          p_metric_hour: number
          p_metric_type: string
          p_metric_value: number
          p_user_id: string
        }
        Returns: undefined
      }
      refresh_sms_metrics_daily: { Args: never; Returns: undefined }
      refresh_system_metrics: { Args: never; Returns: undefined }
      reorder_phases_with_tasks: {
        Args: {
          p_affected_task_ids?: string[]
          p_clear_task_dates?: boolean
          p_phase_updates: Json
          p_project_id: string
        }
        Returns: Json
      }
      reset_stalled_jobs: {
        Args: { p_stall_timeout?: string }
        Returns: number
      }
      restore_deleted_task: {
        Args: { task_id_param: string }
        Returns: boolean
      }
      search_all_content: {
        Args: {
          current_user_id: string
          items_per_category?: number
          search_query: string
        }
        Returns: {
          created_at: string
          description: string
          is_completed: boolean
          is_deleted: boolean
          item_id: string
          item_type: string
          matched_fields: string[]
          project_id: string
          relevance_score: number
          status: string
          tags: string[]
          title: string
          updated_at: string
        }[]
      }
      search_all_similar: {
        Args: { query_embedding: string; similarity_threshold?: number }
        Returns: {
          content: string
          id: string
          similarity: number
          table_name: string
        }[]
      }
      search_by_type: {
        Args: {
          current_user_id: string
          page_limit?: number
          page_offset?: number
          search_query: string
          search_type: string
        }
        Returns: {
          created_at: string
          description: string
          is_completed: boolean
          is_deleted: boolean
          item_id: string
          matched_fields: string[]
          project_id: string
          relevance_score: number
          status: string
          tags: string[]
          title: string
          updated_at: string
        }[]
      }
      search_similar_items: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
          table_name: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_daily_brief_generation: {
        Args: { p_brief_date?: string; p_user_id: string }
        Returns: Json
      }
      start_or_resume_brief_generation: {
        Args: {
          p_brief_date: string
          p_force_regenerate?: boolean
          p_user_id: string
        }
        Returns: {
          brief_id: string
          message: string
          started: boolean
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_brief_generation_progress: {
        Args: {
          p_brief_id: string
          p_life_goals_completed: number
          p_projects_completed: number
          p_total_life_goals: number
          p_total_projects: number
        }
        Returns: undefined
      }
      update_llm_usage_summary: {
        Args: { p_date: string; p_user_id: string }
        Returns: undefined
      }
      update_scheduled_sms_send_time: {
        Args: {
          p_message_id: string
          p_new_event_end?: string
          p_new_event_start?: string
          p_new_scheduled_for: string
        }
        Returns: boolean
      }
      update_sms_status_atomic: {
        Args: {
          p_error_code?: number
          p_error_message?: string
          p_mapped_status: string
          p_message_id: string
          p_twilio_sid: string
          p_twilio_status: string
        }
        Returns: {
          attempt_count: number
          delivered_at: string
          max_attempts: number
          notification_delivery_id: string
          priority: string
          sent_at: string
          updated_delivery: boolean
          updated_sms: boolean
          user_id: string
        }[]
      }
      update_user_notification_preferences: {
        Args: {
          p_email_enabled?: boolean
          p_event_type: string
          p_in_app_enabled?: boolean
          p_push_enabled?: boolean
          p_quiet_hours_enabled?: boolean
          p_quiet_hours_end?: string
          p_quiet_hours_start?: string
          p_sms_enabled?: boolean
          p_timezone?: string
          p_user_id: string
        }
        Returns: undefined
      }
      user_has_payment_issues: { Args: { p_user_id: string }; Returns: boolean }
      validate_all_queue_jobs: {
        Args: { p_fix?: boolean }
        Returns: {
          fixed: boolean
          is_valid: boolean
          issue: string
          job_id: string
          job_type: string
          status: string
        }[]
      }
    }
    Enums: {
      brain_dump_status: "pending" | "parsed" | "saved" | "parsed_and_deleted"
      calendar_sync_status: "active" | "paused" | "error"
      calendar_visibility: "public" | "private" | "shared"
      llm_operation_type:
        | "brain_dump"
        | "brain_dump_short"
        | "brain_dump_context"
        | "brain_dump_tasks"
        | "daily_brief"
        | "project_brief"
        | "phase_generation"
        | "task_scheduling"
        | "calendar_analysis"
        | "project_synthesis"
        | "email_generation"
        | "question_generation"
        | "embedding"
        | "other"
      llm_request_status:
        | "success"
        | "failure"
        | "timeout"
        | "rate_limited"
        | "invalid_response"
      priority_level: "low" | "medium" | "high"
      project_status: "active" | "paused" | "completed" | "archived"
      queue_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
        | "retrying"
      queue_type:
        | "generate_daily_brief"
        | "generate_phases"
        | "sync_calendar"
        | "process_brain_dump"
        | "send_email"
        | "update_recurring_tasks"
        | "cleanup_old_data"
        | "onboarding_analysis"
        | "other"
        | "send_sms"
        | "generate_brief_email"
        | "send_notification"
        | "schedule_daily_sms"
      recurrence_end_reason:
        | "indefinite"
        | "project_inherited"
        | "user_specified"
        | "user_action"
        | "project_end"
        | "max_occurrences"
        | "end_date"
        | "task_deleted"
      recurrence_pattern:
        | "daily"
        | "weekdays"
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "yearly"
      sms_priority: "low" | "normal" | "high" | "urgent"
      sms_status:
        | "pending"
        | "queued"
        | "sending"
        | "sent"
        | "delivered"
        | "failed"
        | "undelivered"
        | "scheduled"
        | "cancelled"
      sync_status: "pending" | "synced" | "failed" | "cancelled"
      task_status: "backlog" | "in_progress" | "done" | "blocked"
      task_type: "one_off" | "recurring"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      brain_dump_status: ["pending", "parsed", "saved", "parsed_and_deleted"],
      calendar_sync_status: ["active", "paused", "error"],
      calendar_visibility: ["public", "private", "shared"],
      llm_operation_type: [
        "brain_dump",
        "brain_dump_short",
        "brain_dump_context",
        "brain_dump_tasks",
        "daily_brief",
        "project_brief",
        "phase_generation",
        "task_scheduling",
        "calendar_analysis",
        "project_synthesis",
        "email_generation",
        "question_generation",
        "embedding",
        "other",
      ],
      llm_request_status: [
        "success",
        "failure",
        "timeout",
        "rate_limited",
        "invalid_response",
      ],
      priority_level: ["low", "medium", "high"],
      project_status: ["active", "paused", "completed", "archived"],
      queue_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "retrying",
      ],
      queue_type: [
        "generate_daily_brief",
        "generate_phases",
        "sync_calendar",
        "process_brain_dump",
        "send_email",
        "update_recurring_tasks",
        "cleanup_old_data",
        "onboarding_analysis",
        "other",
        "send_sms",
        "generate_brief_email",
        "send_notification",
        "schedule_daily_sms",
      ],
      recurrence_end_reason: [
        "indefinite",
        "project_inherited",
        "user_specified",
        "user_action",
        "project_end",
        "max_occurrences",
        "end_date",
        "task_deleted",
      ],
      recurrence_pattern: [
        "daily",
        "weekdays",
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "yearly",
      ],
      sms_priority: ["low", "normal", "high", "urgent"],
      sms_status: [
        "pending",
        "queued",
        "sending",
        "sent",
        "delivered",
        "failed",
        "undelivered",
        "scheduled",
        "cancelled",
      ],
      sync_status: ["pending", "synced", "failed", "cancelled"],
      task_status: ["backlog", "in_progress", "done", "blocked"],
      task_type: ["one_off", "recurring"],
    },
  },
} as const

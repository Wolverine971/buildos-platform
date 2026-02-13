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
        Relationships: [
          {
            foreignKeyName: "admin_users_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      agent_chat_messages: {
        Row: {
          agent_session_id: string
          content: string
          created_at: string
          id: string
          model_used: string | null
          parent_user_session_id: string
          role: Database["public"]["Enums"]["message_role"]
          sender_agent_id: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          tokens_used: number | null
          tool_call_id: string | null
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          agent_session_id: string
          content: string
          created_at?: string
          id?: string
          model_used?: string | null
          parent_user_session_id: string
          role: Database["public"]["Enums"]["message_role"]
          sender_agent_id?: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
          tokens_used?: number | null
          tool_call_id?: string | null
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          agent_session_id?: string
          content?: string
          created_at?: string
          id?: string
          model_used?: string | null
          parent_user_session_id?: string
          role?: Database["public"]["Enums"]["message_role"]
          sender_agent_id?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
          tokens_used?: number | null
          tool_call_id?: string | null
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_messages_parent_user_session_id_fkey"
            columns: ["parent_user_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_messages_sender"
            columns: ["sender_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_messages_session"
            columns: ["agent_session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_messages_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_chat_sessions: {
        Row: {
          completed_at: string | null
          context_type: string | null
          created_at: string
          entity_id: string | null
          executor_agent_id: string | null
          id: string
          initial_context: Json
          message_count: number
          parent_session_id: string
          plan_id: string | null
          planner_agent_id: string
          session_type: Database["public"]["Enums"]["agent_session_type"]
          status: Database["public"]["Enums"]["agent_status"]
          step_number: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          context_type?: string | null
          created_at?: string
          entity_id?: string | null
          executor_agent_id?: string | null
          id?: string
          initial_context: Json
          message_count?: number
          parent_session_id: string
          plan_id?: string | null
          planner_agent_id: string
          session_type: Database["public"]["Enums"]["agent_session_type"]
          status?: Database["public"]["Enums"]["agent_status"]
          step_number?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          context_type?: string | null
          created_at?: string
          entity_id?: string | null
          executor_agent_id?: string | null
          id?: string
          initial_context?: Json
          message_count?: number
          parent_session_id?: string
          plan_id?: string | null
          planner_agent_id?: string
          session_type?: Database["public"]["Enums"]["agent_session_type"]
          status?: Database["public"]["Enums"]["agent_status"]
          step_number?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_sessions_parent_session_id_fkey"
            columns: ["parent_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_sessions_executor"
            columns: ["executor_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_sessions_plan"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "agent_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_sessions_planner"
            columns: ["planner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_sessions_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_executions: {
        Row: {
          agent_session_id: string
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          executor_agent_id: string
          id: string
          message_count: number | null
          plan_id: string
          result: Json | null
          status: Database["public"]["Enums"]["execution_status"]
          step_number: number
          success: boolean
          task: Json
          tokens_used: number | null
          tool_calls_made: number | null
          tools_available: Json
          user_id: string
        }
        Insert: {
          agent_session_id: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          executor_agent_id: string
          id?: string
          message_count?: number | null
          plan_id: string
          result?: Json | null
          status?: Database["public"]["Enums"]["execution_status"]
          step_number: number
          success?: boolean
          task: Json
          tokens_used?: number | null
          tool_calls_made?: number | null
          tools_available?: Json
          user_id: string
        }
        Update: {
          agent_session_id?: string
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          executor_agent_id?: string
          id?: string
          message_count?: number | null
          plan_id?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["execution_status"]
          step_number?: number
          success?: boolean
          task?: Json
          tokens_used?: number | null
          tool_calls_made?: number | null
          tools_available?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_executions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_executions_executor"
            columns: ["executor_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_executions_plan"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "agent_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_executions_session"
            columns: ["agent_session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_executions_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_plans: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          metadata: Json | null
          planner_agent_id: string
          session_id: string
          status: Database["public"]["Enums"]["execution_status"]
          steps: Json
          strategy: Database["public"]["Enums"]["planning_strategy"]
          updated_at: string
          user_id: string
          user_message: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          planner_agent_id: string
          session_id: string
          status?: Database["public"]["Enums"]["execution_status"]
          steps?: Json
          strategy: Database["public"]["Enums"]["planning_strategy"]
          updated_at?: string
          user_id: string
          user_message: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          planner_agent_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["execution_status"]
          steps?: Json
          strategy?: Database["public"]["Enums"]["planning_strategy"]
          updated_at?: string
          user_id?: string
          user_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_plans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_plans_planner"
            columns: ["planner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agent_plans_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          available_tools: Json | null
          completed_at: string | null
          created_at: string
          created_for_plan: string | null
          created_for_session: string
          id: string
          model_preference: string
          name: string
          permissions: Database["public"]["Enums"]["agent_permission"]
          status: Database["public"]["Enums"]["agent_status"]
          system_prompt: string
          type: Database["public"]["Enums"]["agent_type"]
          user_id: string
        }
        Insert: {
          available_tools?: Json | null
          completed_at?: string | null
          created_at?: string
          created_for_plan?: string | null
          created_for_session: string
          id?: string
          model_preference: string
          name: string
          permissions: Database["public"]["Enums"]["agent_permission"]
          status?: Database["public"]["Enums"]["agent_status"]
          system_prompt: string
          type: Database["public"]["Enums"]["agent_type"]
          user_id: string
        }
        Update: {
          available_tools?: Json | null
          completed_at?: string | null
          created_at?: string
          created_for_plan?: string | null
          created_for_session?: string
          id?: string
          model_preference?: string
          name?: string
          permissions?: Database["public"]["Enums"]["agent_permission"]
          status?: Database["public"]["Enums"]["agent_status"]
          system_prompt?: string
          type?: Database["public"]["Enums"]["agent_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_created_for_session_fkey"
            columns: ["created_for_session"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agents_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "beta_event_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
        Relationships: [
          {
            foreignKeyName: "beta_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
          {
            foreignKeyName: "beta_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "beta_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
        Relationships: [
          {
            foreignKeyName: "beta_signups_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "calendar_analyses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "calendar_analysis_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
          {
            foreignKeyName: "calendar_project_suggestions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
        Relationships: [
          {
            foreignKeyName: "calendar_themes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
      chat_compressions: {
        Row: {
          compressed_message_count: number
          compressed_tokens: number
          compression_ratio: number | null
          created_at: string | null
          first_message_id: string | null
          id: string
          key_points: Json | null
          last_message_id: string | null
          original_message_count: number
          original_tokens: number
          session_id: string
          summary: string
          tool_usage_summary: Json | null
        }
        Insert: {
          compressed_message_count: number
          compressed_tokens: number
          compression_ratio?: number | null
          created_at?: string | null
          first_message_id?: string | null
          id?: string
          key_points?: Json | null
          last_message_id?: string | null
          original_message_count: number
          original_tokens: number
          session_id: string
          summary: string
          tool_usage_summary?: Json | null
        }
        Update: {
          compressed_message_count?: number
          compressed_tokens?: number
          compression_ratio?: number | null
          created_at?: string | null
          first_message_id?: string | null
          id?: string
          key_points?: Json | null
          last_message_id?: string | null
          original_message_count?: number
          original_tokens?: number
          session_id?: string
          summary?: string
          tool_usage_summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_compressions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_context_cache: {
        Row: {
          abbreviated_context: Json
          abbreviated_tokens: number
          access_count: number | null
          accessed_at: string | null
          cache_key: string | null
          context_type: string
          created_at: string | null
          entity_id: string | null
          expires_at: string
          full_context_available: boolean | null
          full_tokens_estimate: number | null
          id: string
          metadata: Json | null
          related_entity_ids: string[] | null
          user_id: string
        }
        Insert: {
          abbreviated_context: Json
          abbreviated_tokens: number
          access_count?: number | null
          accessed_at?: string | null
          cache_key?: string | null
          context_type: string
          created_at?: string | null
          entity_id?: string | null
          expires_at?: string
          full_context_available?: boolean | null
          full_tokens_estimate?: number | null
          id?: string
          metadata?: Json | null
          related_entity_ids?: string[] | null
          user_id: string
        }
        Update: {
          abbreviated_context?: Json
          abbreviated_tokens?: number
          access_count?: number | null
          accessed_at?: string | null
          cache_key?: string | null
          context_type?: string
          created_at?: string | null
          entity_id?: string | null
          expires_at?: string
          full_context_available?: boolean | null
          full_tokens_estimate?: number | null
          id?: string
          metadata?: Json | null
          related_entity_ids?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_context_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          completion_tokens: number | null
          content: string
          created_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          message_type: string | null
          metadata: Json | null
          operation_ids: string[] | null
          prompt_tokens: number | null
          role: string
          session_id: string
          tool_call_id: string | null
          tool_calls: Json | null
          tool_name: string | null
          tool_result: Json | null
          total_tokens: number | null
          user_id: string
        }
        Insert: {
          completion_tokens?: number | null
          content: string
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          operation_ids?: string[] | null
          prompt_tokens?: number | null
          role: string
          session_id: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          total_tokens?: number | null
          user_id: string
        }
        Update: {
          completion_tokens?: number | null
          content?: string
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          operation_ids?: string[] | null
          prompt_tokens?: number | null
          role?: string
          session_id?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
          tool_name?: string | null
          tool_result?: Json | null
          total_tokens?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_operations: {
        Row: {
          after_data: Json | null
          batch_id: string | null
          before_data: Json | null
          chat_session_id: string
          conditions: Json | null
          created_at: string | null
          data: Json
          duration_ms: number | null
          enabled: boolean | null
          entity_id: string | null
          error_message: string | null
          executed_at: string | null
          id: string
          operation_type: string
          reasoning: string | null
          ref: string | null
          result: Json | null
          search_query: string | null
          sequence_number: number | null
          status: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chat_session_id: string
          conditions?: Json | null
          created_at?: string | null
          data: Json
          duration_ms?: number | null
          enabled?: boolean | null
          entity_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          operation_type: string
          reasoning?: string | null
          ref?: string | null
          result?: Json | null
          search_query?: string | null
          sequence_number?: number | null
          status?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          after_data?: Json | null
          batch_id?: string | null
          before_data?: Json | null
          chat_session_id?: string
          conditions?: Json | null
          created_at?: string | null
          data?: Json
          duration_ms?: number | null
          enabled?: boolean | null
          entity_id?: string | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          operation_type?: string
          reasoning?: string | null
          ref?: string | null
          result?: Json | null
          search_query?: string | null
          sequence_number?: number | null
          status?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_operations_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_operations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          agent_metadata: Json | null
          archived_at: string | null
          auto_accept_operations: boolean | null
          auto_title: string | null
          chat_topics: string[] | null
          chat_type: string | null
          compressed_at: string | null
          context_type: string
          created_at: string | null
          entity_id: string | null
          id: string
          last_classified_at: string | null
          last_message_at: string | null
          message_count: number | null
          preferences: Json | null
          status: string
          summary: string | null
          title: string | null
          tool_call_count: number | null
          total_tokens_used: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_metadata?: Json | null
          archived_at?: string | null
          auto_accept_operations?: boolean | null
          auto_title?: string | null
          chat_topics?: string[] | null
          chat_type?: string | null
          compressed_at?: string | null
          context_type: string
          created_at?: string | null
          entity_id?: string | null
          id?: string
          last_classified_at?: string | null
          last_message_at?: string | null
          message_count?: number | null
          preferences?: Json | null
          status?: string
          summary?: string | null
          title?: string | null
          tool_call_count?: number | null
          total_tokens_used?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_metadata?: Json | null
          archived_at?: string | null
          auto_accept_operations?: boolean | null
          auto_title?: string | null
          chat_topics?: string[] | null
          chat_type?: string | null
          compressed_at?: string | null
          context_type?: string
          created_at?: string | null
          entity_id?: string | null
          id?: string
          last_classified_at?: string | null
          last_message_at?: string | null
          message_count?: number | null
          preferences?: Json | null
          status?: string
          summary?: string | null
          title?: string | null
          tool_call_count?: number | null
          total_tokens_used?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions_daily_briefs: {
        Row: {
          chat_session_id: string
          daily_brief_id: string
          id: string
          linked_at: string | null
        }
        Insert: {
          chat_session_id: string
          daily_brief_id: string
          id?: string
          linked_at?: string | null
        }
        Update: {
          chat_session_id?: string
          daily_brief_id?: string
          id?: string
          linked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_daily_briefs_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_daily_briefs_daily_brief_id_fkey"
            columns: ["daily_brief_id"]
            isOneToOne: false
            referencedRelation: "daily_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions_projects: {
        Row: {
          chat_session_id: string
          id: string
          linked_at: string | null
          project_id: string
        }
        Insert: {
          chat_session_id: string
          id?: string
          linked_at?: string | null
          project_id: string
        }
        Update: {
          chat_session_id?: string
          id?: string
          linked_at?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_projects_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions_tasks: {
        Row: {
          chat_session_id: string
          id: string
          linked_at: string | null
          task_id: string
        }
        Insert: {
          chat_session_id: string
          id?: string
          linked_at?: string | null
          task_id: string
        }
        Update: {
          chat_session_id?: string
          id?: string
          linked_at?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_tasks_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "chat_sessions_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_tool_executions: {
        Row: {
          arguments: Json
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          message_id: string | null
          requires_user_action: boolean | null
          result: Json | null
          session_id: string
          success: boolean
          tokens_consumed: number | null
          tool_category: string | null
          tool_name: string
        }
        Insert: {
          arguments: Json
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          message_id?: string | null
          requires_user_action?: boolean | null
          result?: Json | null
          session_id: string
          success?: boolean
          tokens_consumed?: number | null
          tool_category?: string | null
          tool_name: string
        }
        Update: {
          arguments?: Json
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          message_id?: string | null
          requires_user_action?: boolean | null
          result?: Json | null
          session_id?: string
          success?: boolean
          tokens_consumed?: number | null
          tool_category?: string | null
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_tool_executions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_tool_executions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
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
      draft_tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          deleted_at: string | null
          dependencies: string[] | null
          description: string | null
          details: string | null
          draft_project_id: string
          duration_minutes: number | null
          finalized_task_id: string | null
          id: string
          outdated: boolean | null
          parent_task_id: string | null
          priority: string | null
          recurrence_end_source: string | null
          recurrence_ends: string | null
          recurrence_pattern: string | null
          source: string | null
          source_calendar_event_id: string | null
          start_date: string | null
          status: string | null
          task_steps: Json | null
          task_type: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          dependencies?: string[] | null
          description?: string | null
          details?: string | null
          draft_project_id: string
          duration_minutes?: number | null
          finalized_task_id?: string | null
          id?: string
          outdated?: boolean | null
          parent_task_id?: string | null
          priority?: string | null
          recurrence_end_source?: string | null
          recurrence_ends?: string | null
          recurrence_pattern?: string | null
          source?: string | null
          source_calendar_event_id?: string | null
          start_date?: string | null
          status?: string | null
          task_steps?: Json | null
          task_type?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          dependencies?: string[] | null
          description?: string | null
          details?: string | null
          draft_project_id?: string
          duration_minutes?: number | null
          finalized_task_id?: string | null
          id?: string
          outdated?: boolean | null
          parent_task_id?: string | null
          priority?: string | null
          recurrence_end_source?: string | null
          recurrence_ends?: string | null
          recurrence_pattern?: string | null
          source?: string | null
          source_calendar_event_id?: string | null
          start_date?: string | null
          status?: string | null
          task_steps?: Json | null
          task_type?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_tasks_draft_project_id_fkey"
            columns: ["draft_project_id"]
            isOneToOne: false
            referencedRelation: "project_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_tasks_finalized_task_id_fkey"
            columns: ["finalized_task_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_summary"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "draft_tasks_finalized_task_id_fkey"
            columns: ["finalized_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "draft_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "email_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
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
        Relationships: [
          {
            foreignKeyName: "emails_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
          {
            foreignKeyName: "error_logs_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
      homework_run_events: {
        Row: {
          created_at: string
          event: Json
          id: string
          iteration: number
          run_id: string
          seq: number
        }
        Insert: {
          created_at?: string
          event: Json
          id?: string
          iteration: number
          run_id: string
          seq: number
        }
        Update: {
          created_at?: string
          event?: Json
          id?: string
          iteration?: number
          run_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "homework_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "homework_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_run_iterations: {
        Row: {
          artifacts: Json | null
          branch_id: string | null
          created_at: string
          ended_at: string | null
          error: string | null
          error_fingerprint: string | null
          id: string
          iteration: number
          metrics: Json
          progress_delta: Json | null
          run_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["homework_iteration_status"]
          summary: string | null
        }
        Insert: {
          artifacts?: Json | null
          branch_id?: string | null
          created_at?: string
          ended_at?: string | null
          error?: string | null
          error_fingerprint?: string | null
          id?: string
          iteration: number
          metrics?: Json
          progress_delta?: Json | null
          run_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["homework_iteration_status"]
          summary?: string | null
        }
        Update: {
          artifacts?: Json | null
          branch_id?: string | null
          created_at?: string
          ended_at?: string | null
          error?: string | null
          error_fingerprint?: string | null
          id?: string
          iteration?: number
          metrics?: Json
          progress_delta?: Json | null
          run_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["homework_iteration_status"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_run_iterations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "homework_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_runs: {
        Row: {
          budgets: Json
          chat_session_id: string | null
          completed_at: string | null
          completion_criteria: Json | null
          created_at: string
          duration_ms: number | null
          id: string
          iteration: number
          last_error_fingerprint: string | null
          max_iterations: number | null
          metrics: Json
          objective: string
          project_ids: string[] | null
          report: Json | null
          scope: string
          started_at: string | null
          status: Database["public"]["Enums"]["homework_run_status"]
          stop_reason: Json | null
          updated_at: string
          user_id: string
          workspace_document_id: string | null
          workspace_project_id: string | null
        }
        Insert: {
          budgets?: Json
          chat_session_id?: string | null
          completed_at?: string | null
          completion_criteria?: Json | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          iteration?: number
          last_error_fingerprint?: string | null
          max_iterations?: number | null
          metrics?: Json
          objective: string
          project_ids?: string[] | null
          report?: Json | null
          scope?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["homework_run_status"]
          stop_reason?: Json | null
          updated_at?: string
          user_id: string
          workspace_document_id?: string | null
          workspace_project_id?: string | null
        }
        Update: {
          budgets?: Json
          chat_session_id?: string | null
          completed_at?: string | null
          completion_criteria?: Json | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          iteration?: number
          last_error_fingerprint?: string | null
          max_iterations?: number | null
          metrics?: Json
          objective?: string
          project_ids?: string[] | null
          report?: Json | null
          scope?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["homework_run_status"]
          stop_reason?: Json | null
          updated_at?: string
          user_id?: string
          workspace_document_id?: string | null
          workspace_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_runs_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "homework_runs_workspace_document_id_fkey"
            columns: ["workspace_document_id"]
            isOneToOne: false
            referencedRelation: "onto_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_runs_workspace_document_id_fkey"
            columns: ["workspace_document_id"]
            isOneToOne: false
            referencedRelation: "task_documents"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "homework_runs_workspace_project_id_fkey"
            columns: ["workspace_project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
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
      legacy_entity_mappings: {
        Row: {
          checksum: string | null
          id: number
          legacy_id: string
          legacy_table: string
          metadata: Json
          migrated_at: string
          onto_id: string
          onto_table: string
        }
        Insert: {
          checksum?: string | null
          id?: number
          legacy_id: string
          legacy_table: string
          metadata?: Json
          migrated_at?: string
          onto_id: string
          onto_table: string
        }
        Update: {
          checksum?: string | null
          id?: number
          legacy_id?: string
          legacy_table?: string
          metadata?: Json
          migrated_at?: string
          onto_id?: string
          onto_table?: string
        }
        Relationships: []
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
          agent_execution_id: string | null
          agent_plan_id: string | null
          agent_session_id: string | null
          brain_dump_id: string | null
          brief_id: string | null
          chat_session_id: string | null
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
          agent_execution_id?: string | null
          agent_plan_id?: string | null
          agent_session_id?: string | null
          brain_dump_id?: string | null
          brief_id?: string | null
          chat_session_id?: string | null
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
          agent_execution_id?: string | null
          agent_plan_id?: string | null
          agent_session_id?: string | null
          brain_dump_id?: string | null
          brief_id?: string | null
          chat_session_id?: string | null
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
            foreignKeyName: "llm_usage_logs_agent_execution_id_fkey"
            columns: ["agent_execution_id"]
            isOneToOne: false
            referencedRelation: "agent_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_usage_logs_agent_plan_id_fkey"
            columns: ["agent_plan_id"]
            isOneToOne: false
            referencedRelation: "agent_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_usage_logs_agent_session_id_fkey"
            columns: ["agent_session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "llm_usage_logs_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
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
          {
            foreignKeyName: "llm_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
        Relationships: [
          {
            foreignKeyName: "llm_usage_summary_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      migration_log: {
        Row: {
          batch_id: string | null
          created_at: string
          entity_type: string
          error_category: string | null
          error_message: string | null
          id: number
          last_retry_at: string | null
          legacy_id: string | null
          legacy_table: string | null
          metadata: Json
          onto_id: string | null
          onto_table: string | null
          operation: string
          org_id: string | null
          retry_count: number | null
          run_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          entity_type: string
          error_category?: string | null
          error_message?: string | null
          id?: number
          last_retry_at?: string | null
          legacy_id?: string | null
          legacy_table?: string | null
          metadata?: Json
          onto_id?: string | null
          onto_table?: string | null
          operation?: string
          org_id?: string | null
          retry_count?: number | null
          run_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          entity_type?: string
          error_category?: string | null
          error_message?: string | null
          id?: number
          last_retry_at?: string | null
          legacy_id?: string | null
          legacy_table?: string | null
          metadata?: Json
          onto_id?: string | null
          onto_table?: string | null
          operation?: string
          org_id?: string | null
          retry_count?: number | null
          run_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      migration_platform_lock: {
        Row: {
          expires_at: string | null
          id: number
          locked_at: string | null
          locked_by: string | null
          run_id: string | null
        }
        Insert: {
          expires_at?: string | null
          id?: number
          locked_at?: string | null
          locked_by?: string | null
          run_id?: string | null
        }
        Update: {
          expires_at?: string | null
          id?: number
          locked_at?: string | null
          locked_by?: string | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_platform_lock_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
      onto_actors: {
        Row: {
          created_at: string
          email: string | null
          id: string
          kind: Database["public"]["Enums"]["onto_actor_kind"]
          metadata: Json
          name: string
          org_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          kind: Database["public"]["Enums"]["onto_actor_kind"]
          metadata?: Json
          name: string
          org_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["onto_actor_kind"]
          metadata?: Json
          name?: string
          org_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onto_actors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_assignments: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          object_id: string
          object_kind: string
          role_key: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          object_id: string
          object_kind: string
          role_key: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          object_id?: string
          object_kind?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_assignments_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_braindumps: {
        Row: {
          chat_session_id: string | null
          content: string
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          processed_at: string | null
          status: Database["public"]["Enums"]["onto_braindump_status"]
          summary: string | null
          title: string | null
          topics: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_session_id?: string | null
          content: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          status?: Database["public"]["Enums"]["onto_braindump_status"]
          summary?: string | null
          title?: string | null
          topics?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_session_id?: string | null
          content?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          status?: Database["public"]["Enums"]["onto_braindump_status"]
          summary?: string | null
          title?: string | null
          topics?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_braindumps_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_braindumps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      onto_comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          mentioned_user_id: string
          notification_id: string | null
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          mentioned_user_id: string
          notification_id?: string | null
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          mentioned_user_id?: string
          notification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onto_comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "onto_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_comment_mentions_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "user_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_comment_read_states: {
        Row: {
          actor_id: string
          entity_id: string
          entity_type: string
          id: string
          last_read_at: string
          last_read_comment_id: string | null
          project_id: string
          root_id: string
          updated_at: string
        }
        Insert: {
          actor_id: string
          entity_id: string
          entity_type: string
          id?: string
          last_read_at?: string
          last_read_comment_id?: string | null
          project_id: string
          root_id: string
          updated_at?: string
        }
        Update: {
          actor_id?: string
          entity_id?: string
          entity_type?: string
          id?: string
          last_read_at?: string
          last_read_comment_id?: string | null
          project_id?: string
          root_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_comment_read_states_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_comment_read_states_last_read_comment_id_fkey"
            columns: ["last_read_comment_id"]
            isOneToOne: false
            referencedRelation: "onto_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_comment_read_states_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_comment_read_states_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "onto_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_comments: {
        Row: {
          body: string
          body_format: string
          created_at: string
          created_by: string
          deleted_at: string | null
          edited_at: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          parent_id: string | null
          project_id: string
          root_id: string
          updated_at: string
        }
        Insert: {
          body: string
          body_format?: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          edited_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          parent_id?: string | null
          project_id: string
          root_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          body_format?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          edited_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          parent_id?: string | null
          project_id?: string
          root_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "onto_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_comments_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "onto_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_decisions: {
        Row: {
          created_at: string
          created_by: string
          decision_at: string | null
          deleted_at: string | null
          description: string | null
          id: string
          outcome: string | null
          project_id: string
          props: Json
          rationale: string | null
          search_vector: unknown
          state_key: string
          title: string
          type_key: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          decision_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          outcome?: string | null
          project_id: string
          props?: Json
          rationale?: string | null
          search_vector?: unknown
          state_key?: string
          title: string
          type_key?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          decision_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          outcome?: string | null
          project_id?: string
          props?: Json
          rationale?: string | null
          search_vector?: unknown
          state_key?: string
          title?: string
          type_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onto_decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_document_versions: {
        Row: {
          created_at: string
          created_by: string
          document_id: string
          embedding: string | null
          id: string
          number: number
          props: Json
          storage_uri: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id: string
          embedding?: string | null
          id?: string
          number: number
          props?: Json
          storage_uri: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string
          embedding?: string | null
          id?: string
          number?: number
          props?: Json
          storage_uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "onto_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "task_documents"
            referencedColumns: ["document_id"]
          },
        ]
      }
      onto_documents: {
        Row: {
          children: Json | null
          content: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          id: string
          project_id: string
          props: Json
          search_vector: unknown
          state_key: Database["public"]["Enums"]["document_state"]
          title: string
          type_key: string
          updated_at: string
        }
        Insert: {
          children?: Json | null
          content?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          project_id: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["document_state"]
          title: string
          type_key: string
          updated_at?: string
        }
        Update: {
          children?: Json | null
          content?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          project_id?: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["document_state"]
          title?: string
          type_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_edges: {
        Row: {
          created_at: string
          dst_id: string
          dst_kind: string
          id: string
          project_id: string
          props: Json
          rel: string
          src_id: string
          src_kind: string
        }
        Insert: {
          created_at?: string
          dst_id: string
          dst_kind: string
          id?: string
          project_id: string
          props?: Json
          rel: string
          src_id: string
          src_kind: string
        }
        Update: {
          created_at?: string
          dst_id?: string
          dst_kind?: string
          id?: string
          project_id?: string
          props?: Json
          rel?: string
          src_id?: string
          src_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_edges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_event_sync: {
        Row: {
          calendar_id: string
          created_at: string
          event_id: string
          external_event_id: string
          id: string
          last_synced_at: string | null
          provider: string
          sync_error: string | null
          sync_status: string
          sync_token: string | null
          updated_at: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          event_id: string
          external_event_id: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          sync_error?: string | null
          sync_status?: string
          sync_token?: string | null
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          event_id?: string
          external_event_id?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          sync_error?: string | null
          sync_status?: string
          sync_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_event_sync_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "project_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_event_sync_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "onto_events"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          end_at: string | null
          external_link: string | null
          facet_context: string | null
          facet_scale: string | null
          facet_stage: string | null
          id: string
          last_synced_at: string | null
          location: string | null
          org_id: string | null
          owner_entity_id: string | null
          owner_entity_type: string
          project_id: string | null
          props: Json
          recurrence: Json
          start_at: string
          state_key: string
          sync_error: string | null
          sync_status: string
          timezone: string | null
          title: string
          type_key: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          end_at?: string | null
          external_link?: string | null
          facet_context?: string | null
          facet_scale?: string | null
          facet_stage?: string | null
          id?: string
          last_synced_at?: string | null
          location?: string | null
          org_id?: string | null
          owner_entity_id?: string | null
          owner_entity_type: string
          project_id?: string | null
          props?: Json
          recurrence?: Json
          start_at: string
          state_key?: string
          sync_error?: string | null
          sync_status?: string
          timezone?: string | null
          title: string
          type_key: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          end_at?: string | null
          external_link?: string | null
          facet_context?: string | null
          facet_scale?: string | null
          facet_stage?: string | null
          id?: string
          last_synced_at?: string | null
          location?: string | null
          org_id?: string | null
          owner_entity_id?: string | null
          owner_entity_type?: string
          project_id?: string | null
          props?: Json
          recurrence?: Json
          start_at?: string
          state_key?: string
          sync_error?: string | null
          sync_status?: string
          timezone?: string | null
          title?: string
          type_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_facet_definitions: {
        Row: {
          allowed_values: Json
          applies_to: string[]
          created_at: string
          description: string | null
          is_multi_value: boolean | null
          is_required: boolean | null
          key: string
          name: string
        }
        Insert: {
          allowed_values: Json
          applies_to?: string[]
          created_at?: string
          description?: string | null
          is_multi_value?: boolean | null
          is_required?: boolean | null
          key: string
          name: string
        }
        Update: {
          allowed_values?: Json
          applies_to?: string[]
          created_at?: string
          description?: string | null
          is_multi_value?: boolean | null
          is_required?: boolean | null
          key?: string
          name?: string
        }
        Relationships: []
      }
      onto_facet_values: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          facet_key: string
          icon: string | null
          id: string
          label: string
          parent_value_id: string | null
          sort_order: number | null
          value: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          facet_key: string
          icon?: string | null
          id?: string
          label: string
          parent_value_id?: string | null
          sort_order?: number | null
          value: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          facet_key?: string
          icon?: string | null
          id?: string
          label?: string
          parent_value_id?: string | null
          sort_order?: number | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_facet_values_facet_key_fkey"
            columns: ["facet_key"]
            isOneToOne: false
            referencedRelation: "onto_facet_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "onto_facet_values_parent_value_id_fkey"
            columns: ["parent_value_id"]
            isOneToOne: false
            referencedRelation: "onto_facet_values"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_goals: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          goal: string | null
          id: string
          name: string
          project_id: string
          props: Json
          search_vector: unknown
          state_key: Database["public"]["Enums"]["goal_state"]
          target_date: string | null
          type_key: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          goal?: string | null
          id?: string
          name: string
          project_id: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["goal_state"]
          target_date?: string | null
          type_key?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          goal?: string | null
          id?: string
          name?: string
          project_id?: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["goal_state"]
          target_date?: string | null
          type_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onto_goals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_insights: {
        Row: {
          created_at: string
          derived_from_signal_id: string | null
          id: string
          project_id: string
          props: Json
          title: string
        }
        Insert: {
          created_at?: string
          derived_from_signal_id?: string | null
          id?: string
          project_id: string
          props?: Json
          title: string
        }
        Update: {
          created_at?: string
          derived_from_signal_id?: string | null
          id?: string
          project_id?: string
          props?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_insights_derived_from_signal_id_fkey"
            columns: ["derived_from_signal_id"]
            isOneToOne: false
            referencedRelation: "onto_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_insights_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_metric_points: {
        Row: {
          created_at: string
          id: string
          metric_id: string
          numeric_value: number
          props: Json
          ts: string
        }
        Insert: {
          created_at?: string
          id?: string
          metric_id: string
          numeric_value: number
          props?: Json
          ts: string
        }
        Update: {
          created_at?: string
          id?: string
          metric_id?: string
          numeric_value?: number
          props?: Json
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_metric_points_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "onto_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_metrics: {
        Row: {
          created_at: string
          created_by: string
          definition: string | null
          id: string
          name: string
          project_id: string
          props: Json
          type_key: string | null
          unit: string
        }
        Insert: {
          created_at?: string
          created_by: string
          definition?: string | null
          id?: string
          name: string
          project_id: string
          props?: Json
          type_key?: string | null
          unit: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string | null
          id?: string
          name?: string
          project_id?: string
          props?: Json
          type_key?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_metrics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          due_at: string | null
          id: string
          milestone: string | null
          project_id: string
          props: Json
          search_vector: unknown
          state_key: Database["public"]["Enums"]["milestone_state"]
          title: string
          type_key: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          milestone?: string | null
          project_id: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["milestone_state"]
          title: string
          type_key?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          milestone?: string | null
          project_id?: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["milestone_state"]
          title?: string
          type_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onto_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_permissions: {
        Row: {
          access: string
          actor_id: string | null
          created_at: string
          id: string
          object_id: string
          object_kind: string
          role_key: string | null
        }
        Insert: {
          access: string
          actor_id?: string | null
          created_at?: string
          id?: string
          object_id: string
          object_kind: string
          role_key?: string | null
        }
        Update: {
          access?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          object_id?: string
          object_kind?: string
          role_key?: string | null
        }
        Relationships: []
      }
      onto_plans: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          facet_context: string | null
          facet_scale: string | null
          facet_stage: string | null
          id: string
          name: string
          plan: string | null
          project_id: string
          props: Json
          search_vector: unknown
          state_key: Database["public"]["Enums"]["plan_state"]
          type_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          facet_context?: string | null
          facet_scale?: string | null
          facet_stage?: string | null
          id?: string
          name: string
          plan?: string | null
          project_id: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["plan_state"]
          type_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          facet_context?: string | null
          facet_scale?: string | null
          facet_stage?: string | null
          id?: string
          name?: string
          plan?: string | null
          project_id?: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["plan_state"]
          type_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_project_invites: {
        Row: {
          accepted_at: string | null
          accepted_by_actor_id: string | null
          access: string
          created_at: string
          expires_at: string
          id: string
          invited_by_actor_id: string | null
          invitee_email: string
          project_id: string
          role_key: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_actor_id?: string | null
          access: string
          created_at?: string
          expires_at: string
          id?: string
          invited_by_actor_id?: string | null
          invitee_email: string
          project_id: string
          role_key: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_actor_id?: string | null
          access?: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by_actor_id?: string | null
          invitee_email?: string
          project_id?: string
          role_key?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_project_invites_accepted_by_actor_id_fkey"
            columns: ["accepted_by_actor_id"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_project_invites_invited_by_actor_id_fkey"
            columns: ["invited_by_actor_id"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_project_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          change_source: string | null
          changed_by: string
          changed_by_actor_id: string | null
          chat_session_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          project_id: string
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          change_source?: string | null
          changed_by: string
          changed_by_actor_id?: string | null
          chat_session_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          project_id: string
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          change_source?: string | null
          changed_by?: string
          changed_by_actor_id?: string | null
          chat_session_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_project_logs_changed_by_actor_id_fkey"
            columns: ["changed_by_actor_id"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_project_logs_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "onto_project_logs_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_project_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_project_members: {
        Row: {
          access: string
          actor_id: string
          added_by_actor_id: string | null
          created_at: string
          id: string
          project_id: string
          removed_at: string | null
          removed_by_actor_id: string | null
          role_description: string | null
          role_key: string
          role_name: string | null
        }
        Insert: {
          access: string
          actor_id: string
          added_by_actor_id?: string | null
          created_at?: string
          id?: string
          project_id: string
          removed_at?: string | null
          removed_by_actor_id?: string | null
          role_description?: string | null
          role_key: string
          role_name?: string | null
        }
        Update: {
          access?: string
          actor_id?: string
          added_by_actor_id?: string | null
          created_at?: string
          id?: string
          project_id?: string
          removed_at?: string | null
          removed_by_actor_id?: string | null
          role_description?: string | null
          role_key?: string
          role_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onto_project_members_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_project_members_added_by_actor_id_fkey"
            columns: ["added_by_actor_id"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_project_members_removed_by_actor_id_fkey"
            columns: ["removed_by_actor_id"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_project_structure_history: {
        Row: {
          change_type: string
          changed_at: string | null
          changed_by: string | null
          doc_structure: Json
          id: string
          project_id: string
          version: number
        }
        Insert: {
          change_type: string
          changed_at?: string | null
          changed_by?: string | null
          doc_structure: Json
          id?: string
          project_id: string
          version: number
        }
        Update: {
          change_type?: string
          changed_at?: string | null
          changed_by?: string | null
          doc_structure?: Json
          id?: string
          project_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "onto_project_structure_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onto_project_structure_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_projects: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          doc_structure: Json | null
          end_at: string | null
          facet_context: string | null
          facet_scale: string | null
          facet_stage: string | null
          id: string
          is_public: boolean | null
          name: string
          next_step_long: string | null
          next_step_short: string | null
          next_step_source: string | null
          next_step_updated_at: string | null
          org_id: string | null
          props: Json
          start_at: string | null
          state_key: Database["public"]["Enums"]["project_state"]
          type_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          doc_structure?: Json | null
          end_at?: string | null
          facet_context?: string | null
          facet_scale?: string | null
          facet_stage?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          next_step_long?: string | null
          next_step_short?: string | null
          next_step_source?: string | null
          next_step_updated_at?: string | null
          org_id?: string | null
          props?: Json
          start_at?: string | null
          state_key?: Database["public"]["Enums"]["project_state"]
          type_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          doc_structure?: Json | null
          end_at?: string | null
          facet_context?: string | null
          facet_scale?: string | null
          facet_stage?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          next_step_long?: string | null
          next_step_short?: string | null
          next_step_source?: string | null
          next_step_updated_at?: string | null
          org_id?: string | null
          props?: Json
          start_at?: string | null
          state_key?: Database["public"]["Enums"]["project_state"]
          type_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      onto_requirements: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          priority: number | null
          project_id: string
          props: Json
          search_vector: unknown
          text: string
          type_key: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          priority?: number | null
          project_id: string
          props?: Json
          search_vector?: unknown
          text: string
          type_key?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          priority?: number | null
          project_id?: string
          props?: Json
          search_vector?: unknown
          text?: string
          type_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onto_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_risks: {
        Row: {
          content: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          impact: string
          mitigated_at: string | null
          probability: number | null
          project_id: string
          props: Json
          search_vector: unknown
          state_key: Database["public"]["Enums"]["risk_state"]
          title: string
          type_key: string | null
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          impact?: string
          mitigated_at?: string | null
          probability?: number | null
          project_id: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["risk_state"]
          title: string
          type_key?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          impact?: string
          mitigated_at?: string | null
          probability?: number | null
          project_id?: string
          props?: Json
          search_vector?: unknown
          state_key?: Database["public"]["Enums"]["risk_state"]
          title?: string
          type_key?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onto_risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_signals: {
        Row: {
          channel: string
          created_at: string
          id: string
          payload: Json
          project_id: string
          ts: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          payload: Json
          project_id: string
          ts?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          payload?: Json
          project_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_signals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_sources: {
        Row: {
          captured_at: string | null
          created_at: string
          created_by: string
          id: string
          project_id: string
          props: Json
          snapshot_uri: string | null
          uri: string
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          props?: Json
          snapshot_uri?: string | null
          uri: string
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          props?: Json
          snapshot_uri?: string | null
          uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          due_at: string | null
          facet_scale: string | null
          id: string
          priority: number | null
          project_id: string
          props: Json
          search_vector: unknown
          start_at: string | null
          state_key: Database["public"]["Enums"]["task_state"]
          title: string
          type_key: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          facet_scale?: string | null
          id?: string
          priority?: number | null
          project_id: string
          props?: Json
          search_vector?: unknown
          start_at?: string | null
          state_key?: Database["public"]["Enums"]["task_state"]
          title: string
          type_key?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          facet_scale?: string | null
          id?: string
          priority?: number | null
          project_id?: string
          props?: Json
          search_vector?: unknown
          start_at?: string | null
          state_key?: Database["public"]["Enums"]["task_state"]
          title?: string
          type_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onto_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      onto_tools: {
        Row: {
          capability_key: string
          config: Json
          created_at: string
          id: string
          name: string
        }
        Insert: {
          capability_key: string
          config?: Json
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          capability_key?: string
          config?: Json
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      ontology_brief_entities: {
        Row: {
          created_at: string
          daily_brief_id: string
          entity_id: string
          entity_kind: string
          id: string
          project_id: string | null
          role: string | null
        }
        Insert: {
          created_at?: string
          daily_brief_id: string
          entity_id: string
          entity_kind: string
          id?: string
          project_id?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string
          daily_brief_id?: string
          entity_id?: string
          entity_kind?: string
          id?: string
          project_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ontology_brief_entities_daily_brief_id_fkey"
            columns: ["daily_brief_id"]
            isOneToOne: false
            referencedRelation: "ontology_daily_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ontology_brief_entities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ontology_daily_briefs: {
        Row: {
          actor_id: string
          brief_date: string
          created_at: string
          executive_summary: string
          generation_completed_at: string | null
          generation_error: string | null
          generation_started_at: string | null
          generation_status: string
          id: string
          llm_analysis: string | null
          metadata: Json
          priority_actions: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_id: string
          brief_date: string
          created_at?: string
          executive_summary?: string
          generation_completed_at?: string | null
          generation_error?: string | null
          generation_started_at?: string | null
          generation_status?: string
          id?: string
          llm_analysis?: string | null
          metadata?: Json
          priority_actions?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_id?: string
          brief_date?: string
          created_at?: string
          executive_summary?: string
          generation_completed_at?: string | null
          generation_error?: string | null
          generation_started_at?: string | null
          generation_status?: string
          id?: string
          llm_analysis?: string | null
          metadata?: Json
          priority_actions?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ontology_daily_briefs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "onto_actors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ontology_daily_briefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ontology_project_briefs: {
        Row: {
          brief_content: string
          created_at: string
          daily_brief_id: string
          id: string
          metadata: Json
          project_id: string
          updated_at: string
        }
        Insert: {
          brief_content: string
          created_at?: string
          daily_brief_id: string
          id?: string
          metadata?: Json
          project_id: string
          updated_at?: string
        }
        Update: {
          brief_content?: string
          created_at?: string
          daily_brief_id?: string
          id?: string
          metadata?: Json
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ontology_project_briefs_daily_brief_id_fkey"
            columns: ["daily_brief_id"]
            isOneToOne: false
            referencedRelation: "ontology_daily_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ontology_project_briefs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
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
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_calendars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      project_context_snapshot: {
        Row: {
          compute_ms: number | null
          computed_at: string
          created_at: string
          project_id: string
          snapshot: Json
          snapshot_version: number
          source_updated_at: string | null
          updated_at: string
        }
        Insert: {
          compute_ms?: number | null
          computed_at?: string
          created_at?: string
          project_id: string
          snapshot: Json
          snapshot_version?: number
          source_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          compute_ms?: number | null
          computed_at?: string
          created_at?: string
          project_id?: string
          snapshot?: Json
          snapshot_version?: number
          source_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_context_snapshot_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_context_snapshot_metrics: {
        Row: {
          computed_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          project_id: string
          queue_job_id: string | null
          snapshot_version: number
          status: string
        }
        Insert: {
          computed_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          project_id: string
          queue_job_id?: string | null
          snapshot_version?: number
          status?: string
        }
        Update: {
          computed_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          project_id?: string
          queue_job_id?: string | null
          snapshot_version?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_context_snapshot_metrics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
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
      project_drafts: {
        Row: {
          calendar_color_id: string | null
          calendar_settings: Json | null
          calendar_sync_enabled: boolean | null
          chat_session_id: string | null
          completed_at: string | null
          context: string | null
          core_goals_momentum: string | null
          core_harmony_integration: string | null
          core_integrity_ideals: string | null
          core_meaning_identity: string | null
          core_opportunity_freedom: string | null
          core_people_bonds: string | null
          core_power_resources: string | null
          core_reality_understanding: string | null
          core_trust_safeguards: string | null
          created_at: string | null
          description: string | null
          dimensions_covered: string[] | null
          end_date: string | null
          executive_summary: string | null
          finalized_project_id: string | null
          id: string
          name: string | null
          question_count: number | null
          slug: string | null
          source: string | null
          source_metadata: Json | null
          start_date: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_color_id?: string | null
          calendar_settings?: Json | null
          calendar_sync_enabled?: boolean | null
          chat_session_id?: string | null
          completed_at?: string | null
          context?: string | null
          core_goals_momentum?: string | null
          core_harmony_integration?: string | null
          core_integrity_ideals?: string | null
          core_meaning_identity?: string | null
          core_opportunity_freedom?: string | null
          core_people_bonds?: string | null
          core_power_resources?: string | null
          core_reality_understanding?: string | null
          core_trust_safeguards?: string | null
          created_at?: string | null
          description?: string | null
          dimensions_covered?: string[] | null
          end_date?: string | null
          executive_summary?: string | null
          finalized_project_id?: string | null
          id?: string
          name?: string | null
          question_count?: number | null
          slug?: string | null
          source?: string | null
          source_metadata?: Json | null
          start_date?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_color_id?: string | null
          calendar_settings?: Json | null
          calendar_sync_enabled?: boolean | null
          chat_session_id?: string | null
          completed_at?: string | null
          context?: string | null
          core_goals_momentum?: string | null
          core_harmony_integration?: string | null
          core_integrity_ideals?: string | null
          core_meaning_identity?: string | null
          core_opportunity_freedom?: string | null
          core_people_bonds?: string | null
          core_power_resources?: string | null
          core_reality_understanding?: string | null
          core_trust_safeguards?: string | null
          created_at?: string | null
          description?: string | null
          dimensions_covered?: string[] | null
          end_date?: string | null
          executive_summary?: string | null
          finalized_project_id?: string | null
          id?: string
          name?: string | null
          question_count?: number | null
          slug?: string | null
          source?: string | null
          source_metadata?: Json | null
          start_date?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_drafts_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: true
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_drafts_finalized_project_id_fkey"
            columns: ["finalized_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_drafts_user_id_fkey"
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
          {
            foreignKeyName: "project_synthesis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
        Relationships: [
          {
            foreignKeyName: "brief_generation_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
          {
            foreignKeyName: "recurring_task_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "recurring_task_migration_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      research_artifact_refs: {
        Row: {
          created_at: string
          id: string
          importance: number | null
          ref: Json
          ref_type: string
          session_id: string
          snippet: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          importance?: number | null
          ref: Json
          ref_type: string
          session_id: string
          snippet?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          importance?: number | null
          ref?: Json
          ref_type?: string
          session_id?: string
          snippet?: string | null
        }
        Relationships: []
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
          {
            foreignKeyName: "scheduled_sms_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
          {
            foreignKeyName: "sms_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
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
        Relationships: [
          {
            foreignKeyName: "sms_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "sms_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
          suggestions_state: Json | null
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
          suggestions_state?: Json | null
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
          suggestions_state?: Json | null
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
      timing_metrics: {
        Row: {
          agent_plan_id: string | null
          clarification_ms: number | null
          context_build_ms: number | null
          context_type: string | null
          created_at: string
          first_event_at: string | null
          first_response_at: string | null
          id: string
          message_length: number | null
          message_received_at: string
          metadata: Json
          plan_completed_at: string | null
          plan_created_at: string | null
          plan_creation_ms: number | null
          plan_execution_ms: number | null
          plan_execution_started_at: string | null
          plan_status: string | null
          plan_step_count: number | null
          planner_agent_id: string | null
          session_id: string | null
          time_to_first_event_ms: number | null
          time_to_first_response_ms: number | null
          tool_selection_ms: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_plan_id?: string | null
          clarification_ms?: number | null
          context_build_ms?: number | null
          context_type?: string | null
          created_at?: string
          first_event_at?: string | null
          first_response_at?: string | null
          id?: string
          message_length?: number | null
          message_received_at?: string
          metadata?: Json
          plan_completed_at?: string | null
          plan_created_at?: string | null
          plan_creation_ms?: number | null
          plan_execution_ms?: number | null
          plan_execution_started_at?: string | null
          plan_status?: string | null
          plan_step_count?: number | null
          planner_agent_id?: string | null
          session_id?: string | null
          time_to_first_event_ms?: number | null
          time_to_first_response_ms?: number | null
          tool_selection_ms?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_plan_id?: string | null
          clarification_ms?: number | null
          context_build_ms?: number | null
          context_type?: string | null
          created_at?: string
          first_event_at?: string | null
          first_response_at?: string | null
          id?: string
          message_length?: number | null
          message_received_at?: string
          metadata?: Json
          plan_completed_at?: string | null
          plan_created_at?: string | null
          plan_creation_ms?: number | null
          plan_execution_ms?: number | null
          plan_execution_started_at?: string | null
          plan_status?: string | null
          plan_step_count?: number | null
          planner_agent_id?: string | null
          session_id?: string | null
          time_to_first_event_ms?: number | null
          time_to_first_response_ms?: number | null
          tool_selection_ms?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timing_metrics_agent_plan_id_fkey"
            columns: ["agent_plan_id"]
            isOneToOne: false
            referencedRelation: "agent_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timing_metrics_planner_agent_id_fkey"
            columns: ["planner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timing_metrics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timing_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_agent_artifacts: {
        Row: {
          artifact_type: Database["public"]["Enums"]["tree_agent_artifact_type"]
          created_at: string
          document_id: string | null
          id: string
          is_primary: boolean
          json_payload: Json | null
          label: string
          node_id: string
          run_id: string
        }
        Insert: {
          artifact_type: Database["public"]["Enums"]["tree_agent_artifact_type"]
          created_at?: string
          document_id?: string | null
          id?: string
          is_primary?: boolean
          json_payload?: Json | null
          label?: string
          node_id: string
          run_id: string
        }
        Update: {
          artifact_type?: Database["public"]["Enums"]["tree_agent_artifact_type"]
          created_at?: string
          document_id?: string | null
          id?: string
          is_primary?: boolean
          json_payload?: Json | null
          label?: string
          node_id?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tree_agent_artifacts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "onto_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_agent_artifacts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "task_documents"
            referencedColumns: ["document_id"]
          },
          {
            foreignKeyName: "tree_agent_artifacts_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "tree_agent_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_agent_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tree_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_agent_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          node_id: string
          payload: Json
          run_id: string
          seq: number | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          node_id: string
          payload?: Json
          run_id: string
          seq?: number | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          node_id?: string
          payload?: Json
          run_id?: string
          seq?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tree_agent_events_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "tree_agent_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_agent_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tree_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_agent_nodes: {
        Row: {
          band_index: number
          context: Json
          created_at: string
          depth: number
          ended_at: string | null
          id: string
          parent_node_id: string | null
          reason: string
          result: Json | null
          role_state: Database["public"]["Enums"]["tree_agent_role_state"]
          run_id: string
          scratchpad_doc_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["tree_agent_node_status"]
          step_index: number
          success_criteria: Json
          title: string
          updated_at: string
        }
        Insert: {
          band_index?: number
          context?: Json
          created_at?: string
          depth?: number
          ended_at?: string | null
          id?: string
          parent_node_id?: string | null
          reason?: string
          result?: Json | null
          role_state?: Database["public"]["Enums"]["tree_agent_role_state"]
          run_id: string
          scratchpad_doc_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tree_agent_node_status"]
          step_index?: number
          success_criteria?: Json
          title: string
          updated_at?: string
        }
        Update: {
          band_index?: number
          context?: Json
          created_at?: string
          depth?: number
          ended_at?: string | null
          id?: string
          parent_node_id?: string | null
          reason?: string
          result?: Json | null
          role_state?: Database["public"]["Enums"]["tree_agent_role_state"]
          run_id?: string
          scratchpad_doc_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tree_agent_node_status"]
          step_index?: number
          success_criteria?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tree_agent_nodes_parent_node_id_fkey"
            columns: ["parent_node_id"]
            isOneToOne: false
            referencedRelation: "tree_agent_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_agent_nodes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tree_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_agent_nodes_scratchpad_doc_id_fkey"
            columns: ["scratchpad_doc_id"]
            isOneToOne: false
            referencedRelation: "onto_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_agent_nodes_scratchpad_doc_id_fkey"
            columns: ["scratchpad_doc_id"]
            isOneToOne: false
            referencedRelation: "task_documents"
            referencedColumns: ["document_id"]
          },
        ]
      }
      tree_agent_plans: {
        Row: {
          created_at: string
          id: string
          node_id: string
          plan_json: Json
          run_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          node_id: string
          plan_json: Json
          run_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          node_id?: string
          plan_json?: Json
          run_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tree_agent_plans_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "tree_agent_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_agent_plans_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "tree_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_agent_runs: {
        Row: {
          budgets: Json
          completed_at: string | null
          created_at: string
          id: string
          metrics: Json
          objective: string
          root_node_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["tree_agent_run_status"]
          updated_at: string
          user_id: string
          workspace_project_id: string | null
        }
        Insert: {
          budgets?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          metrics?: Json
          objective: string
          root_node_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tree_agent_run_status"]
          updated_at?: string
          user_id: string
          workspace_project_id?: string | null
        }
        Update: {
          budgets?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          metrics?: Json
          objective?: string
          root_node_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["tree_agent_run_status"]
          updated_at?: string
          user_id?: string
          workspace_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tree_agent_runs_root_node_fkey"
            columns: ["root_node_id"]
            isOneToOne: false
            referencedRelation: "tree_agent_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_agent_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tree_agent_runs_workspace_project_id_fkey"
            columns: ["workspace_project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
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
        Relationships: [
          {
            foreignKeyName: "user_brief_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
          show_events: boolean
          show_task_due: boolean
          show_task_scheduled: boolean
          show_task_start: boolean
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
          show_events?: boolean
          show_task_due?: boolean
          show_task_scheduled?: boolean
          show_task_start?: boolean
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
          show_events?: boolean
          show_task_due?: boolean
          show_task_scheduled?: boolean
          show_task_start?: boolean
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
          data: Json | null
          delivery_id: string | null
          dismissed_at: string | null
          event_id: string | null
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
          data?: Json | null
          delivery_id?: string | null
          dismissed_at?: string | null
          event_id?: string | null
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
          data?: Json | null
          delivery_id?: string | null
          dismissed_at?: string | null
          event_id?: string | null
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
            foreignKeyName: "user_notifications_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "user_sms_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
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
          preferences: Json | null
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
          preferences?: Json | null
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
          preferences?: Json | null
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
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
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
      voice_note_groups: {
        Row: {
          chat_session_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          linked_entity_id: string | null
          linked_entity_type: string | null
          metadata: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_session_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_session_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          metadata?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_note_groups_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_note_groups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_notes: {
        Row: {
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          file_size_bytes: number
          group_id: string | null
          id: string
          linked_entity_id: string | null
          linked_entity_type: string | null
          metadata: Json
          mime_type: string
          recorded_at: string | null
          segment_index: number | null
          storage_bucket: string
          storage_path: string
          transcript: string | null
          transcription_error: string | null
          transcription_model: string | null
          transcription_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_size_bytes: number
          group_id?: string | null
          id?: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          metadata?: Json
          mime_type: string
          recorded_at?: string | null
          segment_index?: number | null
          storage_bucket?: string
          storage_path: string
          transcript?: string | null
          transcription_error?: string | null
          transcription_model?: string | null
          transcription_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number
          group_id?: string | null
          id?: string
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          metadata?: Json
          mime_type?: string
          recorded_at?: string | null
          segment_index?: number | null
          storage_bucket?: string
          storage_path?: string
          transcript?: string | null
          transcription_error?: string | null
          transcription_model?: string | null
          transcription_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_notes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "voice_note_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      web_page_visits: {
        Row: {
          bytes: number | null
          canonical_url: string | null
          content_hash: string | null
          content_type: string | null
          created_at: string
          error_message: string | null
          excerpt: string | null
          final_url: string
          first_visited_at: string
          id: string
          last_fetch_ms: number | null
          last_llm_model: string | null
          last_llm_ms: number | null
          last_visited_at: string
          llm_completion_tokens: number | null
          llm_prompt_tokens: number | null
          llm_total_tokens: number | null
          markdown: string | null
          meta: Json | null
          normalized_url: string
          status_code: number
          title: string | null
          updated_at: string
          url: string
          visit_count: number
        }
        Insert: {
          bytes?: number | null
          canonical_url?: string | null
          content_hash?: string | null
          content_type?: string | null
          created_at?: string
          error_message?: string | null
          excerpt?: string | null
          final_url: string
          first_visited_at?: string
          id?: string
          last_fetch_ms?: number | null
          last_llm_model?: string | null
          last_llm_ms?: number | null
          last_visited_at?: string
          llm_completion_tokens?: number | null
          llm_prompt_tokens?: number | null
          llm_total_tokens?: number | null
          markdown?: string | null
          meta?: Json | null
          normalized_url: string
          status_code: number
          title?: string | null
          updated_at?: string
          url: string
          visit_count?: number
        }
        Update: {
          bytes?: number | null
          canonical_url?: string | null
          content_hash?: string | null
          content_type?: string | null
          created_at?: string
          error_message?: string | null
          excerpt?: string | null
          final_url?: string
          first_visited_at?: string
          id?: string
          last_fetch_ms?: number | null
          last_llm_model?: string | null
          last_llm_ms?: number | null
          last_visited_at?: string
          llm_completion_tokens?: number | null
          llm_prompt_tokens?: number | null
          llm_total_tokens?: number | null
          markdown?: string | null
          meta?: Json | null
          normalized_url?: string
          status_code?: number
          title?: string | null
          updated_at?: string
          url?: string
          visit_count?: number
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
        Relationships: [
          {
            foreignKeyName: "llm_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_migration_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
      global_migration_progress: {
        Row: {
          data_errors: number | null
          failed_projects: number | null
          failed_tasks: number | null
          fatal_errors: number | null
          migrated_projects: number | null
          migrated_tasks: number | null
          recoverable_errors: number | null
          total_errors: number | null
          total_projects: number | null
          total_tasks: number | null
          total_users: number | null
          users_with_projects: number | null
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
      task_documents: {
        Row: {
          content: string | null
          doc_type: string | null
          document_id: string | null
          document_state: string | null
          document_title: string | null
          document_type: string | null
          edge_props: Json | null
          linked_at: string | null
          project_id: string | null
          task_id: string | null
          task_title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onto_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "onto_projects"
            referencedColumns: ["id"]
          },
        ]
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
      user_calendar_items: {
        Row: {
          all_day: boolean | null
          calendar_item_id: string | null
          created_at: string | null
          end_at: string | null
          event_id: string | null
          item_kind: string | null
          item_type: string | null
          owner_entity_id: string | null
          owner_entity_type: string | null
          project_id: string | null
          props: Json | null
          source_table: string | null
          start_at: string | null
          state_key: string | null
          task_id: string | null
          timezone: string | null
          title: string | null
          type_key: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      user_migration_stats: {
        Row: {
          avatar_url: string | null
          email: string | null
          failed_projects: number | null
          last_migration_at: string | null
          migrated_projects: number | null
          migrated_tasks: number | null
          migration_status: string | null
          name: string | null
          pending_projects: number | null
          percent_complete: number | null
          total_projects: number | null
          total_tasks: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_project_invite: {
        Args: { p_actor_id: string; p_token_hash: string; p_user_email: string }
        Returns: {
          access: string
          project_id: string
          role_key: string
        }[]
      }
      accept_project_invite_by_id: {
        Args: { p_invite_id: string }
        Returns: {
          access: string
          project_id: string
          role_key: string
        }[]
      }
      acquire_migration_platform_lock: {
        Args: {
          p_duration_minutes?: number
          p_locked_by: string
          p_run_id: string
        }
        Returns: {
          acquired: boolean
          existing_expires_at: string
          existing_locked_at: string
          existing_locked_by: string
          existing_run_id: string
        }[]
      }
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
      apply_graph_reorg_changes: {
        Args: {
          p_deletes: Json
          p_inserts: Json
          p_project_id: string
          p_updates: Json
        }
        Returns: Json
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
        Args: { p_user_id: string }
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
      cleanup_structure_history: { Args: never; Returns: undefined }
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
      current_actor_has_project_access: {
        Args: { p_project_id: string; p_required_access?: string }
        Returns: boolean
      }
      current_actor_id: { Args: never; Returns: string }
      current_actor_is_project_member: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      decline_project_invite: {
        Args: { p_invite_id: string }
        Returns: {
          invite_id: string
          status: string
        }[]
      }
      decrement_phase_order: {
        Args: { p_order_threshold: number; p_project_id: string }
        Returns: undefined
      }
      delete_onto_project: {
        Args: { p_project_id: string }
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
      ensure_actor_for_user: { Args: { p_user_id: string }; Returns: string }
      fail_queue_job: {
        Args: { p_error_message: string; p_job_id: string; p_retry?: boolean }
        Returns: boolean
      }
      finalize_draft_project: {
        Args: { p_draft_id: string; p_user_id: string }
        Returns: string
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
      get_latest_ontology_daily_briefs: {
        Args: { user_ids: string[] }
        Returns: {
          brief_date: string
          generation_completed_at: string
          user_id: string
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
      get_migration_platform_lock_status: {
        Args: never
        Returns: {
          expires_at: string
          is_locked: boolean
          locked_at: string
          locked_by: string
          locked_by_email: string
          run_id: string
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
      get_project_full: {
        Args: { p_actor_id: string; p_project_id: string }
        Returns: Json
      }
      get_project_invite_preview: {
        Args: { p_token_hash: string }
        Returns: {
          access: string
          created_at: string
          expires_at: string
          invite_id: string
          invited_by_actor_id: string
          invited_by_email: string
          invited_by_name: string
          invitee_email: string
          project_id: string
          project_name: string
          role_key: string
          status: string
        }[]
      }
      get_project_notification_settings: {
        Args: { p_project_id: string }
        Returns: {
          can_manage_default: boolean
          effective_enabled: boolean
          is_shared_project: boolean
          member_count: number
          member_enabled: boolean
          member_overridden: boolean
          project_default_enabled: boolean
          project_id: string
        }[]
      }
      get_project_phases_hierarchy: {
        Args: { p_project_id: string; p_user_id?: string }
        Returns: Json
      }
      get_project_skeleton: {
        Args: { p_actor_id: string; p_project_id: string }
        Returns: Json
      }
      get_project_statistics: {
        Args: { p_project_id: string; p_user_id: string }
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
      increment_chat_session_metrics: {
        Args: {
          p_message_increment?: number
          p_session_id: string
          p_token_increment?: number
          p_tool_increment?: number
        }
        Returns: undefined
      }
      increment_migration_retry_count: {
        Args: { row_id: number }
        Returns: undefined
      }
      increment_question_display_count: {
        Args: { question_ids: string[] }
        Returns: undefined
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { user_id: string }; Returns: boolean }
      list_calendar_items: {
        Args: {
          p_end: string
          p_include_events?: boolean
          p_include_task_due?: boolean
          p_include_task_range?: boolean
          p_include_task_start?: boolean
          p_limit?: number
          p_project_ids?: string[]
          p_start: string
        }
        Returns: {
          all_day: boolean
          calendar_item_id: string
          created_at: string
          end_at: string
          event_id: string
          item_kind: string
          item_type: string
          owner_entity_id: string
          owner_entity_type: string
          project_id: string
          props: Json
          source_table: string
          start_at: string
          state_key: string
          task_id: string
          timezone: string
          title: string
          type_key: string
          updated_at: string
        }[]
      }
      list_pending_project_invites: {
        Args: never
        Returns: {
          access: string
          created_at: string
          expires_at: string
          invite_id: string
          invited_by_actor_id: string
          invited_by_email: string
          invited_by_name: string
          project_id: string
          project_name: string
          role_key: string
          status: string
        }[]
      }
      load_fastchat_context: {
        Args: {
          p_context_type: string
          p_focus_entity_id?: string
          p_focus_type?: string
          p_project_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      load_project_graph_context: {
        Args: { p_project_id: string }
        Returns: Json
      }
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
      onto_check_guard: {
        Args: { p_entity: Json; p_guard: Json }
        Returns: boolean
      }
      onto_comment_validate_target: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_project_id: string
        }
        Returns: boolean
      }
      onto_jsonb_extract: {
        Args: { p_json: Json; p_path: string }
        Returns: Json
      }
      onto_jsonb_extract_text: {
        Args: { p_json: Json; p_path: string }
        Returns: string
      }
      onto_jsonb_has_value: {
        Args: { p_json: Json; p_path: string }
        Returns: boolean
      }
      onto_search_entities: {
        Args: {
          p_actor_id: string
          p_limit?: number
          p_project_id?: string
          p_query: string
          p_types?: string[]
        }
        Returns: {
          id: string
          project_id: string
          project_name: string
          score: number
          snippet: string
          title: string
          type: string
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
      refresh_user_migration_stats: {
        Args: never
        Returns: {
          duration_ms: number
          refreshed: boolean
          row_count: number
        }[]
      }
      release_migration_platform_lock: {
        Args: { p_run_id: string }
        Returns: boolean
      }
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
      set_project_notification_settings: {
        Args: {
          p_member_enabled?: boolean
          p_project_default_enabled?: boolean
          p_project_id: string
        }
        Returns: {
          can_manage_default: boolean
          effective_enabled: boolean
          is_shared_project: boolean
          member_count: number
          member_enabled: boolean
          member_overridden: boolean
          project_default_enabled: boolean
          project_id: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_onto_project: {
        Args: { p_project_id: string }
        Returns: undefined
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
      task_series_delete: {
        Args: { p_force?: boolean; p_series_id: string }
        Returns: {
          deleted_instances: number
          deleted_master: number
        }[]
      }
      task_series_enable: {
        Args: {
          p_instance_rows: Json
          p_master_props: Json
          p_series_id: string
          p_task_id: string
        }
        Returns: undefined
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_agent_plan_step: {
        Args: { p_plan_id: string; p_step_number: number; p_step_update: Json }
        Returns: Json
      }
      update_llm_usage_summary: {
        Args: { p_date: string; p_user_id: string }
        Returns: undefined
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
      upsert_legacy_entity_mapping: {
        Args: {
          p_legacy_id: string
          p_legacy_table: string
          p_metadata?: Json
          p_onto_id: string
          p_onto_table: string
        }
        Returns: undefined
      }
      validate_facet_values: {
        Args: { p_facets: Json; p_scope: string }
        Returns: {
          error: string
          facet_key: string
          provided_value: string
        }[]
      }
    }
    Enums: {
      agent_permission: "read_only" | "read_write"
      agent_session_type: "planner_thinking" | "planner_executor"
      agent_status: "active" | "completed" | "failed"
      agent_type: "planner" | "executor"
      brain_dump_status: "pending" | "parsed" | "saved" | "parsed_and_deleted"
      calendar_sync_status: "active" | "paused" | "error"
      calendar_visibility: "public" | "private" | "shared"
      document_state:
        | "draft"
        | "review"
        | "published"
        | "in_review"
        | "ready"
        | "archived"
      execution_status: "pending" | "executing" | "completed" | "failed"
      goal_state: "draft" | "active" | "achieved" | "abandoned"
      homework_iteration_status: "success" | "failed" | "waiting_on_user"
      homework_run_status:
        | "queued"
        | "running"
        | "waiting_on_user"
        | "completed"
        | "stopped"
        | "canceled"
        | "failed"
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
      message_role: "system" | "user" | "assistant" | "tool"
      message_sender_type: "planner" | "executor" | "system"
      milestone_state: "pending" | "in_progress" | "completed" | "missed"
      onto_actor_kind: "human" | "agent"
      onto_braindump_status: "pending" | "processing" | "processed" | "failed"
      output_state: "draft" | "in_progress" | "review" | "published"
      plan_state: "draft" | "active" | "completed"
      planning_strategy:
        | "planner_stream"
        | "ask_clarifying_questions"
        | "project_creation"
      priority_level: "low" | "medium" | "high"
      project_state: "planning" | "active" | "completed" | "cancelled"
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
        | "classify_chat_session"
        | "process_onto_braindump"
        | "transcribe_voice_note"
        | "buildos_homework"
        | "buildos_tree_agent"
        | "build_project_context_snapshot"
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
      risk_state: "identified" | "mitigated" | "occurred" | "closed"
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
      task_state: "todo" | "in_progress" | "blocked" | "done"
      task_status: "backlog" | "in_progress" | "done" | "blocked"
      task_type: "one_off" | "recurring"
      tree_agent_artifact_type: "document" | "json" | "summary" | "other"
      tree_agent_node_status:
        | "planning"
        | "delegating"
        | "executing"
        | "waiting"
        | "aggregating"
        | "completed"
        | "failed"
        | "blocked"
      tree_agent_role_state: "planner" | "executor"
      tree_agent_run_status:
        | "queued"
        | "running"
        | "waiting_on_user"
        | "completed"
        | "stopped"
        | "canceled"
        | "failed"
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
      agent_permission: ["read_only", "read_write"],
      agent_session_type: ["planner_thinking", "planner_executor"],
      agent_status: ["active", "completed", "failed"],
      agent_type: ["planner", "executor"],
      brain_dump_status: ["pending", "parsed", "saved", "parsed_and_deleted"],
      calendar_sync_status: ["active", "paused", "error"],
      calendar_visibility: ["public", "private", "shared"],
      document_state: [
        "draft",
        "review",
        "published",
        "in_review",
        "ready",
        "archived",
      ],
      execution_status: ["pending", "executing", "completed", "failed"],
      goal_state: ["draft", "active", "achieved", "abandoned"],
      homework_iteration_status: ["success", "failed", "waiting_on_user"],
      homework_run_status: [
        "queued",
        "running",
        "waiting_on_user",
        "completed",
        "stopped",
        "canceled",
        "failed",
      ],
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
      message_role: ["system", "user", "assistant", "tool"],
      message_sender_type: ["planner", "executor", "system"],
      milestone_state: ["pending", "in_progress", "completed", "missed"],
      onto_actor_kind: ["human", "agent"],
      onto_braindump_status: ["pending", "processing", "processed", "failed"],
      output_state: ["draft", "in_progress", "review", "published"],
      plan_state: ["draft", "active", "completed"],
      planning_strategy: [
        "planner_stream",
        "ask_clarifying_questions",
        "project_creation",
      ],
      priority_level: ["low", "medium", "high"],
      project_state: ["planning", "active", "completed", "cancelled"],
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
        "classify_chat_session",
        "process_onto_braindump",
        "transcribe_voice_note",
        "buildos_homework",
        "buildos_tree_agent",
        "build_project_context_snapshot",
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
      risk_state: ["identified", "mitigated", "occurred", "closed"],
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
      task_state: ["todo", "in_progress", "blocked", "done"],
      task_status: ["backlog", "in_progress", "done", "blocked"],
      task_type: ["one_off", "recurring"],
      tree_agent_artifact_type: ["document", "json", "summary", "other"],
      tree_agent_node_status: [
        "planning",
        "delegating",
        "executing",
        "waiting",
        "aggregating",
        "completed",
        "failed",
        "blocked",
      ],
      tree_agent_role_state: ["planner", "executor"],
      tree_agent_run_status: [
        "queued",
        "running",
        "waiting_on_user",
        "completed",
        "stopped",
        "canceled",
        "failed",
      ],
    },
  },
} as const

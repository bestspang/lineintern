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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          action_taken: string | null
          created_at: string
          details: Json | null
          group_id: string
          id: string
          matched_rules: string[] | null
          message_id: string | null
          resolved: boolean | null
          resolved_at: string | null
          risk_score: number | null
          severity: Database["public"]["Enums"]["alert_severity"]
          source_user_id: string | null
          summary: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          details?: Json | null
          group_id: string
          id?: string
          matched_rules?: string[] | null
          message_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          risk_score?: number | null
          severity: Database["public"]["Enums"]["alert_severity"]
          source_user_id?: string | null
          summary: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          details?: Json | null
          group_id?: string
          id?: string
          matched_rules?: string[] | null
          message_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          risk_score?: number | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          source_user_id?: string | null
          summary?: string
          type?: Database["public"]["Enums"]["alert_type"]
        }
        Relationships: [
          {
            foreignKeyName: "alerts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_source_user_id_fkey"
            columns: ["source_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          default_language: string | null
          default_mode: Database["public"]["Enums"]["group_mode"] | null
          environment_name: string | null
          id: string
          max_summary_messages: number | null
          openai_model: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_language?: string | null
          default_mode?: Database["public"]["Enums"]["group_mode"] | null
          environment_name?: string | null
          id?: string
          max_summary_messages?: number | null
          openai_model?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_language?: string | null
          default_mode?: Database["public"]["Enums"]["group_mode"] | null
          environment_name?: string | null
          id?: string
          max_summary_messages?: number | null
          openai_model?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      attendance_logs: {
        Row: {
          branch_id: string | null
          created_at: string | null
          device_info: Json | null
          device_time: string | null
          employee_id: string
          event_type: string
          flag_reason: string | null
          id: string
          is_flagged: boolean | null
          latitude: number | null
          line_message_id: string | null
          longitude: number | null
          photo_url: string | null
          server_time: string
          source: string | null
          timezone: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          device_info?: Json | null
          device_time?: string | null
          employee_id: string
          event_type: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          latitude?: number | null
          line_message_id?: string | null
          longitude?: number | null
          photo_url?: string | null
          server_time?: string
          source?: string | null
          timezone?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          device_info?: Json | null
          device_time?: string | null
          employee_id?: string
          event_type?: string
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          latitude?: number | null
          line_message_id?: string | null
          longitude?: number | null
          photo_url?: string | null
          server_time?: string
          source?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_settings: {
        Row: {
          branch_id: string | null
          created_at: string | null
          daily_summary_enabled: boolean | null
          daily_summary_time: string | null
          employee_id: string | null
          enable_attendance: boolean | null
          id: string
          require_location: boolean | null
          require_photo: boolean | null
          scope: string
          standard_start_time: string | null
          time_zone: string | null
          token_validity_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          daily_summary_enabled?: boolean | null
          daily_summary_time?: string | null
          employee_id?: string | null
          enable_attendance?: boolean | null
          id?: string
          require_location?: boolean | null
          require_photo?: boolean | null
          scope: string
          standard_start_time?: string | null
          time_zone?: string | null
          token_validity_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          daily_summary_enabled?: boolean | null
          daily_summary_time?: string | null
          employee_id?: string | null
          enable_attendance?: boolean | null
          id?: string
          require_location?: boolean | null
          require_photo?: boolean | null
          scope?: string
          standard_start_time?: string | null
          time_zone?: string | null
          token_validity_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_settings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_tokens: {
        Row: {
          created_at: string | null
          employee_id: string
          expires_at: string
          id: string
          status: string | null
          type: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          expires_at: string
          id?: string
          status?: string | null
          type: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          expires_at?: string
          id?: string
          status?: string | null
          type?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_tokens_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_commands: {
        Row: {
          available_in_dm: boolean | null
          available_in_group: boolean | null
          category: string | null
          command_key: string
          created_at: string | null
          description_en: string
          description_th: string | null
          display_name_en: string
          display_name_th: string | null
          display_order: number | null
          icon_name: string | null
          id: string
          is_enabled: boolean | null
          require_mention_in_group: boolean | null
          updated_at: string | null
          usage_example_en: string | null
          usage_example_th: string | null
        }
        Insert: {
          available_in_dm?: boolean | null
          available_in_group?: boolean | null
          category?: string | null
          command_key: string
          created_at?: string | null
          description_en: string
          description_th?: string | null
          display_name_en: string
          display_name_th?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_enabled?: boolean | null
          require_mention_in_group?: boolean | null
          updated_at?: string | null
          usage_example_en?: string | null
          usage_example_th?: string | null
        }
        Update: {
          available_in_dm?: boolean | null
          available_in_group?: boolean | null
          category?: string | null
          command_key?: string
          created_at?: string | null
          description_en?: string
          description_th?: string | null
          display_name_en?: string
          display_name_th?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_enabled?: boolean | null
          require_mention_in_group?: boolean | null
          updated_at?: string | null
          usage_example_en?: string | null
          usage_example_th?: string | null
        }
        Relationships: []
      }
      bot_triggers: {
        Row: {
          available_in_dm: boolean | null
          available_in_group: boolean | null
          case_sensitive: boolean | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          is_primary: boolean | null
          language: string | null
          last_used_at: string | null
          match_type: string | null
          trigger_text: string
          trigger_type: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          available_in_dm?: boolean | null
          available_in_group?: boolean | null
          case_sensitive?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          is_primary?: boolean | null
          language?: string | null
          last_used_at?: string | null
          match_type?: string | null
          trigger_text: string
          trigger_type: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          available_in_dm?: boolean | null
          available_in_group?: boolean | null
          case_sensitive?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          is_primary?: boolean | null
          language?: string | null
          last_used_at?: string | null
          match_type?: string | null
          trigger_text?: string
          trigger_type?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          created_at: string | null
          id: string
          latitude: number | null
          line_group_id: string | null
          longitude: number | null
          name: string
          photo_required: boolean | null
          radius_meters: number | null
          standard_start_time: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          id?: string
          latitude?: number | null
          line_group_id?: string | null
          longitude?: number | null
          name: string
          photo_required?: boolean | null
          radius_meters?: number | null
          standard_start_time?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          id?: string
          latitude?: number | null
          line_group_id?: string | null
          longitude?: number | null
          name?: string
          photo_required?: boolean | null
          radius_meters?: number | null
          standard_start_time?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chat_summaries: {
        Row: {
          action_items: Json | null
          created_at: string
          created_by_user_id: string | null
          decisions: Json | null
          from_message_id: string | null
          from_time: string
          group_id: string
          id: string
          main_topics: string[] | null
          message_count: number | null
          open_questions: string[] | null
          summary_text: string
          to_message_id: string | null
          to_time: string
        }
        Insert: {
          action_items?: Json | null
          created_at?: string
          created_by_user_id?: string | null
          decisions?: Json | null
          from_message_id?: string | null
          from_time: string
          group_id: string
          id?: string
          main_topics?: string[] | null
          message_count?: number | null
          open_questions?: string[] | null
          summary_text: string
          to_message_id?: string | null
          to_time: string
        }
        Update: {
          action_items?: Json | null
          created_at?: string
          created_by_user_id?: string | null
          decisions?: Json | null
          from_message_id?: string | null
          from_time?: string
          group_id?: string
          id?: string
          main_topics?: string[] | null
          message_count?: number | null
          open_questions?: string[] | null
          summary_text?: string
          to_message_id?: string | null
          to_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_summaries_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_summaries_from_message_id_fkey"
            columns: ["from_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_summaries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_summaries_to_message_id_fkey"
            columns: ["to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      command_aliases: {
        Row: {
          alias_text: string
          case_sensitive: boolean | null
          command_id: string
          created_at: string | null
          id: string
          is_prefix: boolean | null
          is_primary: boolean | null
          language: string | null
          last_used_at: string | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          alias_text: string
          case_sensitive?: boolean | null
          command_id: string
          created_at?: string | null
          id?: string
          is_prefix?: boolean | null
          is_primary?: boolean | null
          language?: string | null
          last_used_at?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          alias_text?: string
          case_sensitive?: boolean | null
          command_id?: string
          created_at?: string | null
          id?: string
          is_prefix?: boolean | null
          is_primary?: boolean | null
          language?: string | null
          last_used_at?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "command_aliases_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "bot_commands"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_threads: {
        Row: {
          created_at: string | null
          group_id: string
          id: string
          last_message_at: string
          message_count: number | null
          participants: Json | null
          started_at: string
          started_by_user_id: string | null
          status: string | null
          summary: string | null
          tags: string[] | null
          thread_title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          last_message_at: string
          message_count?: number | null
          participants?: Json | null
          started_at: string
          started_by_user_id?: string | null
          status?: string | null
          summary?: string | null
          tags?: string[] | null
          thread_title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          last_message_at?: string
          message_count?: number | null
          participants?: Json | null
          started_at?: string
          started_by_user_id?: string | null
          status?: string | null
          summary?: string | null
          tags?: string[] | null
          thread_title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_threads_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_threads_started_by_user_id_fkey"
            columns: ["started_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_attendance_summaries: {
        Row: {
          absent_count: number | null
          branch_id: string
          checked_in: number | null
          checked_out: number | null
          created_at: string | null
          flagged_count: number | null
          id: string
          late_count: number | null
          line_message_id: string | null
          sent_at: string | null
          summary_date: string
          summary_text: string
          total_employees: number | null
        }
        Insert: {
          absent_count?: number | null
          branch_id: string
          checked_in?: number | null
          checked_out?: number | null
          created_at?: string | null
          flagged_count?: number | null
          id?: string
          late_count?: number | null
          line_message_id?: string | null
          sent_at?: string | null
          summary_date: string
          summary_text: string
          total_employees?: number | null
        }
        Update: {
          absent_count?: number | null
          branch_id?: string
          checked_in?: number | null
          checked_out?: number | null
          created_at?: string | null
          flagged_count?: number | null
          id?: string
          late_count?: number | null
          line_message_id?: string | null
          sent_at?: string | null
          summary_date?: string
          summary_text?: string
          total_employees?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_summaries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          announcement_group_line_id: string | null
          branch_id: string | null
          code: string
          created_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          line_user_id: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          announcement_group_line_id?: string | null
          branch_id?: string | null
          code: string
          created_at?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          line_user_id?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          announcement_group_line_id?: string | null
          branch_id?: string | null
          code?: string
          created_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          line_user_id?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      faq_logs: {
        Row: {
          answer: string
          created_at: string | null
          feedback_text: string | null
          group_id: string | null
          id: string
          knowledge_item_ids: string[] | null
          language: string | null
          question: string
          rating: number | null
          response_time_ms: number | null
          user_id: string | null
          was_helpful: boolean | null
        }
        Insert: {
          answer: string
          created_at?: string | null
          feedback_text?: string | null
          group_id?: string | null
          id?: string
          knowledge_item_ids?: string[] | null
          language?: string | null
          question: string
          rating?: number | null
          response_time_ms?: number | null
          user_id?: string | null
          was_helpful?: boolean | null
        }
        Update: {
          answer?: string
          created_at?: string | null
          feedback_text?: string | null
          group_id?: string | null
          id?: string
          knowledge_item_ids?: string[] | null
          language?: string | null
          question?: string
          rating?: number | null
          response_time_ms?: number | null
          user_id?: string | null
          was_helpful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "faq_logs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faq_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          left_at: string | null
          role: Database["public"]["Enums"]["member_role"] | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"] | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: Database["public"]["Enums"]["member_role"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          alert_thresholds: Json | null
          avatar_url: string | null
          created_at: string
          display_name: string
          features: Json | null
          id: string
          joined_at: string
          language: string | null
          last_activity_at: string | null
          line_group_id: string
          member_count: number | null
          mode: Database["public"]["Enums"]["group_mode"]
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string
        }
        Insert: {
          alert_thresholds?: Json | null
          avatar_url?: string | null
          created_at?: string
          display_name: string
          features?: Json | null
          id?: string
          joined_at?: string
          language?: string | null
          last_activity_at?: string | null
          line_group_id: string
          member_count?: number | null
          mode?: Database["public"]["Enums"]["group_mode"]
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
        }
        Update: {
          alert_thresholds?: Json | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          features?: Json | null
          id?: string
          joined_at?: string
          language?: string | null
          last_activity_at?: string | null
          line_group_id?: string
          member_count?: number | null
          mode?: Database["public"]["Enums"]["group_mode"]
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_items: {
        Row: {
          category: string
          content: string
          created_at: string
          group_id: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          scope: Database["public"]["Enums"]["knowledge_scope"]
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          scope: Database["public"]["Enums"]["knowledge_scope"]
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          scope?: Database["public"]["Enums"]["knowledge_scope"]
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_items: {
        Row: {
          access_count: number | null
          category: string
          content: string
          created_at: string | null
          group_id: string | null
          id: string
          importance_score: number
          is_deleted: boolean | null
          keywords: string[] | null
          last_reinforced_at: string | null
          last_used_at: string | null
          memory_strength: number | null
          pinned: boolean | null
          related_thread_ids: string[] | null
          scope: string
          source_message_ids: string[] | null
          source_type: string
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_count?: number | null
          category: string
          content: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          importance_score?: number
          is_deleted?: boolean | null
          keywords?: string[] | null
          last_reinforced_at?: string | null
          last_used_at?: string | null
          memory_strength?: number | null
          pinned?: boolean | null
          related_thread_ids?: string[] | null
          scope: string
          source_message_ids?: string[] | null
          source_type: string
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_count?: number | null
          category?: string
          content?: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          importance_score?: number
          is_deleted?: boolean | null
          keywords?: string[] | null
          last_reinforced_at?: string | null
          last_used_at?: string | null
          memory_strength?: number | null
          pinned?: boolean | null
          related_thread_ids?: string[] | null
          scope?: string
          source_message_ids?: string[] | null
          source_type?: string
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_settings: {
        Row: {
          auto_decay_enabled: boolean | null
          created_at: string | null
          decay_threshold_days: number | null
          group_id: string | null
          id: string
          max_items: number | null
          max_items_per_group: number | null
          max_items_per_user: number | null
          memory_enabled: boolean | null
          passive_learning_enabled: boolean | null
          scope: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_decay_enabled?: boolean | null
          created_at?: string | null
          decay_threshold_days?: number | null
          group_id?: string | null
          id?: string
          max_items?: number | null
          max_items_per_group?: number | null
          max_items_per_user?: number | null
          memory_enabled?: boolean | null
          passive_learning_enabled?: boolean | null
          scope: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_decay_enabled?: boolean | null
          created_at?: string | null
          decay_threshold_days?: number | null
          group_id?: string | null
          id?: string
          max_items?: number | null
          max_items_per_group?: number | null
          max_items_per_user?: number | null
          memory_enabled?: boolean | null
          passive_learning_enabled?: boolean | null
          scope?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_settings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          created_at: string | null
          id: string
          is_thread_starter: boolean | null
          message_id: string
          position_in_thread: number | null
          thread_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_thread_starter?: boolean | null
          message_id: string
          position_in_thread?: number | null
          thread_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_thread_starter?: boolean | null
          message_id?: string
          position_in_thread?: number | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          command_type: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          group_id: string
          has_url: boolean | null
          id: string
          risk_score: number | null
          sent_at: string
          sentiment: string | null
          text: string
          user_id: string | null
        }
        Insert: {
          command_type?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          group_id: string
          has_url?: boolean | null
          id?: string
          risk_score?: number | null
          sent_at?: string
          sentiment?: string | null
          text: string
          user_id?: string | null
        }
        Update: {
          command_type?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          group_id?: string
          has_url?: boolean | null
          id?: string
          risk_score?: number | null
          sent_at?: string
          sentiment?: string | null
          text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mood_history: {
        Row: {
          created_at: string
          energy_level: number
          group_id: string
          id: string
          mood: string
          recorded_at: string
        }
        Insert: {
          created_at?: string
          energy_level: number
          group_id: string
          id?: string
          mood: string
          recorded_at?: string
        }
        Update: {
          created_at?: string
          energy_level?: number
          group_id?: string
          id?: string
          mood?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mood_history_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      personality_state: {
        Row: {
          created_at: string
          current_interests: Json | null
          energy_level: number
          group_id: string
          id: string
          last_mood_change: string | null
          mood: string
          personality_traits: Json | null
          recent_topics: Json | null
          relationship_map: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_interests?: Json | null
          energy_level?: number
          group_id: string
          id?: string
          last_mood_change?: string | null
          mood?: string
          personality_traits?: Json | null
          recent_topics?: Json | null
          relationship_map?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_interests?: Json | null
          energy_level?: number
          group_id?: string
          id?: string
          last_mood_change?: string | null
          mood?: string
          personality_traits?: Json | null
          recent_topics?: Json | null
          relationship_map?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personality_state_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          data: Json
          from_date: string
          group_id: string
          id: string
          period: Database["public"]["Enums"]["report_period"]
          summary_text: string | null
          to_date: string
        }
        Insert: {
          created_at?: string
          data: Json
          from_date: string
          group_id: string
          id?: string
          period: Database["public"]["Enums"]["report_period"]
          summary_text?: string | null
          to_date: string
        }
        Update: {
          created_at?: string
          data?: Json
          from_date?: string
          group_id?: string
          id?: string
          period?: Database["public"]["Enums"]["report_period"]
          summary_text?: string | null
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_rules: {
        Row: {
          action: string
          created_at: string | null
          description: string | null
          group_id: string | null
          id: string
          is_enabled: boolean | null
          last_matched_at: string | null
          match_count: number | null
          name: string
          pattern: string
          rule_type: string
          scope: string
          severity: string
          updated_at: string | null
        }
        Insert: {
          action?: string
          created_at?: string | null
          description?: string | null
          group_id?: string | null
          id?: string
          is_enabled?: boolean | null
          last_matched_at?: string | null
          match_count?: number | null
          name: string
          pattern: string
          rule_type: string
          scope?: string
          severity: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string | null
          group_id?: string | null
          id?: string
          is_enabled?: boolean | null
          last_matched_at?: string | null
          match_count?: number | null
          name?: string
          pattern?: string
          rule_type?: string
          scope?: string
          severity?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_rules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string
          created_by_user_id: string | null
          description: string | null
          due_at: string
          group_id: string
          id: string
          is_recurring: boolean | null
          mention_all: boolean | null
          next_occurrence_at: string | null
          parent_task_id: string | null
          recurrence_day_of_month: number | null
          recurrence_day_of_week: number | null
          recurrence_end_date: string | null
          recurrence_interval: number | null
          recurrence_pattern: string | null
          recurrence_time: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at: string
          work_metadata: Json | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          due_at: string
          group_id: string
          id?: string
          is_recurring?: boolean | null
          mention_all?: boolean | null
          next_occurrence_at?: string | null
          parent_task_id?: string | null
          recurrence_day_of_month?: number | null
          recurrence_day_of_week?: number | null
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_pattern?: string | null
          recurrence_time?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title: string
          updated_at?: string
          work_metadata?: Json | null
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          due_at?: string
          group_id?: string
          id?: string
          is_recurring?: boolean | null
          mention_all?: boolean | null
          next_occurrence_at?: string | null
          parent_task_id?: string | null
          recurrence_day_of_month?: number | null
          recurrence_day_of_week?: number | null
          recurrence_end_date?: string | null
          recurrence_interval?: number | null
          recurrence_pattern?: string | null
          recurrence_time?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"] | null
          title?: string
          updated_at?: string
          work_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      training_requests: {
        Row: {
          created_at: string | null
          extracted_items: Json | null
          group_id: string | null
          id: string
          notes: string | null
          requested_by_user_id: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          source_content: string | null
          source_type: string
          source_url: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          extracted_items?: Json | null
          group_id?: string | null
          id?: string
          notes?: string | null
          requested_by_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          source_content?: string | null
          source_type: string
          source_url?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          extracted_items?: Json | null
          group_id?: string | null
          id?: string
          notes?: string | null
          requested_by_user_id?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          source_content?: string | null
          source_type?: string
          source_url?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_requests_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_requests_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          behavioral_patterns: Json | null
          confidence_scores: Json | null
          created_at: string | null
          group_id: string
          id: string
          inferred_age_range: string | null
          inferred_gender: string | null
          inferred_occupation: string | null
          last_updated_at: string | null
          observation_count: number | null
          personality_traits: Json | null
          preferences: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          behavioral_patterns?: Json | null
          confidence_scores?: Json | null
          created_at?: string | null
          group_id: string
          id?: string
          inferred_age_range?: string | null
          inferred_gender?: string | null
          inferred_occupation?: string | null
          last_updated_at?: string | null
          observation_count?: number | null
          personality_traits?: Json | null
          preferences?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          behavioral_patterns?: Json | null
          confidence_scores?: Json | null
          created_at?: string | null
          group_id?: string
          id?: string
          inferred_age_range?: string | null
          inferred_gender?: string | null
          inferred_occupation?: string | null
          last_updated_at?: string | null
          observation_count?: number | null
          personality_traits?: Json | null
          preferences?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_relationships: {
        Row: {
          communication_style: Json | null
          confidence_score: number | null
          created_at: string | null
          first_interaction_at: string | null
          group_id: string
          id: string
          inferred_data: Json | null
          interaction_count: number | null
          last_interaction_at: string | null
          relationship_type: string | null
          updated_at: string | null
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          communication_style?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          first_interaction_at?: string | null
          group_id: string
          id?: string
          inferred_data?: Json | null
          interaction_count?: number | null
          last_interaction_at?: string | null
          relationship_type?: string | null
          updated_at?: string | null
          user_a_id: string
          user_b_id: string
        }
        Update: {
          communication_style?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          first_interaction_at?: string | null
          group_id?: string
          id?: string
          inferred_data?: Json | null
          interaction_count?: number | null
          last_interaction_at?: string | null
          relationship_type?: string | null
          updated_at?: string | null
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_relationships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_relationships_user_a_id_fkey"
            columns: ["user_a_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_relationships_user_b_id_fkey"
            columns: ["user_b_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          last_seen_at: string | null
          line_user_id: string
          memory_opt_out: boolean | null
          memory_preferences: Json | null
          primary_language: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id?: string
          last_seen_at?: string | null
          line_user_id: string
          memory_opt_out?: boolean | null
          memory_preferences?: Json | null
          primary_language?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          last_seen_at?: string | null
          line_user_id?: string
          memory_opt_out?: boolean | null
          memory_preferences?: Json | null
          primary_language?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      work_progress: {
        Row: {
          ai_feedback: string | null
          check_in_date: string
          created_at: string
          group_id: string
          id: string
          progress_percentage: number | null
          progress_text: string
          quality_score: string | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_feedback?: string | null
          check_in_date?: string
          created_at?: string
          group_id: string
          id?: string
          progress_percentage?: number | null
          progress_text: string
          quality_score?: string | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_feedback?: string | null
          check_in_date?: string
          created_at?: string
          group_id?: string
          id?: string
          progress_percentage?: number | null
          progress_text?: string
          quality_score?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_progress_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_progress_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      working_memory: {
        Row: {
          content: string
          conversation_thread_id: string | null
          created_at: string | null
          expires_at: string
          group_id: string
          id: string
          importance_score: number | null
          memory_type: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          content: string
          conversation_thread_id?: string | null
          created_at?: string | null
          expires_at: string
          group_id: string
          id?: string
          importance_score?: number | null
          memory_type: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          content?: string
          conversation_thread_id?: string | null
          created_at?: string | null
          expires_at?: string
          group_id?: string
          id?: string
          importance_score?: number | null
          memory_type?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "working_memory_conversation_thread_id_fkey"
            columns: ["conversation_thread_id"]
            isOneToOne: false
            referencedRelation: "conversation_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_memory_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_memory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_distance_meters: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      find_or_create_thread: {
        Args: {
          p_group_id: string
          p_message_text: string
          p_message_timestamp: string
          p_user_id: string
        }
        Returns: string
      }
      get_cron_history: {
        Args: { limit_count?: number }
        Returns: {
          end_time: string
          jobid: number
          jobname: string
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      get_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          command: string
          jobid: number
          jobname: string
          schedule: string
        }[]
      }
      get_effective_attendance_settings: {
        Args: { p_employee_id: string }
        Returns: {
          enable_attendance: boolean
          require_location: boolean
          require_photo: boolean
          token_validity_minutes: number
        }[]
      }
      get_overdue_work_tasks: {
        Args: never
        Returns: {
          assignee_display_name: string
          assignee_line_user_id: string
          assignee_user_id: string
          assigner_display_name: string
          check_in_count: number
          days_overdue: number
          group_id: string
          group_line_id: string
          last_progress_text: string
          task_due_at: string
          task_id: string
          task_title: string
        }[]
      }
      get_pending_work_tasks: {
        Args: never
        Returns: {
          assignee_display_name: string
          assignee_line_user_id: string
          assignee_user_id: string
          assigner_display_name: string
          check_in_count: number
          days_remaining: number
          group_id: string
          group_line_id: string
          last_check_in_date: string
          task_due_at: string
          task_id: string
          task_title: string
        }[]
      }
      get_thread_context: {
        Args: { p_limit?: number; p_thread_id: string }
        Returns: {
          direction: Database["public"]["Enums"]["message_direction"]
          message_id: string
          position_in_thread: number
          sent_at: string
          text: string
          user_display_name: string
          user_id: string
        }[]
      }
      get_working_memory_context: {
        Args: { p_group_id: string; p_limit?: number; p_thread_id?: string }
        Returns: {
          content: string
          created_at: string
          importance_score: number
          memory_type: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      retry_cron_job: { Args: { job_id: number }; Returns: Json }
      search_memories_by_keywords: {
        Args: {
          p_group_id?: string
          p_keywords: string[]
          p_limit?: number
          p_user_id?: string
        }
        Returns: {
          category: string
          content: string
          id: string
          importance_score: number
          memory_strength: number
          relevance_score: number
          title: string
        }[]
      }
    }
    Enums: {
      alert_severity: "low" | "medium" | "high"
      alert_type:
        | "scam_link"
        | "spam_burst"
        | "error"
        | "rate_limit"
        | "failed_reply"
      app_role: "admin" | "moderator" | "user"
      group_mode: "helper" | "faq" | "report" | "fun" | "safety" | "magic"
      group_status: "active" | "left" | "error" | "pending"
      knowledge_scope: "global" | "group"
      member_role: "member" | "admin" | "owner"
      message_direction: "human" | "bot"
      report_period: "daily" | "weekly" | "custom"
      task_status: "pending" | "completed" | "cancelled"
      task_type: "todo" | "work_assignment" | "recurring"
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
      alert_severity: ["low", "medium", "high"],
      alert_type: [
        "scam_link",
        "spam_burst",
        "error",
        "rate_limit",
        "failed_reply",
      ],
      app_role: ["admin", "moderator", "user"],
      group_mode: ["helper", "faq", "report", "fun", "safety", "magic"],
      group_status: ["active", "left", "error", "pending"],
      knowledge_scope: ["global", "group"],
      member_role: ["member", "admin", "owner"],
      message_direction: ["human", "bot"],
      report_period: ["daily", "weekly", "custom"],
      task_status: ["pending", "completed", "cancelled"],
      task_type: ["todo", "work_assignment", "recurring"],
    },
  },
} as const

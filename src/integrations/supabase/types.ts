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
      bot_commands: {
        Row: {
          available_in_dm: boolean | null
          available_in_group: boolean | null
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
          category: string
          content: string
          created_at: string | null
          group_id: string | null
          id: string
          importance_score: number
          is_deleted: boolean | null
          last_used_at: string | null
          pinned: boolean | null
          scope: string
          source_message_ids: string[] | null
          source_type: string
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          importance_score?: number
          is_deleted?: boolean | null
          last_used_at?: string | null
          pinned?: boolean | null
          scope: string
          source_message_ids?: string[] | null
          source_type: string
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          importance_score?: number
          is_deleted?: boolean | null
          last_used_at?: string | null
          pinned?: boolean | null
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
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          due_at: string
          group_id: string
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          due_at?: string
          group_id?: string
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
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
          primary_language?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
    },
  },
} as const

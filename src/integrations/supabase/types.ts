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
          created_at: string
          details: Json | null
          group_id: string
          id: string
          message_id: string | null
          resolved: boolean | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          summary: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Insert: {
          created_at?: string
          details?: Json | null
          group_id: string
          id?: string
          message_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          summary: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Update: {
          created_at?: string
          details?: Json | null
          group_id?: string
          id?: string
          message_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
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
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          last_seen_at: string | null
          line_user_id: string
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
      [_ in never]: never
    }
    Enums: {
      alert_severity: "low" | "medium" | "high"
      alert_type:
        | "scam_link"
        | "spam_burst"
        | "error"
        | "rate_limit"
        | "failed_reply"
      group_mode: "helper" | "faq" | "report" | "fun" | "safety"
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
      group_mode: ["helper", "faq", "report", "fun", "safety"],
      group_status: ["active", "left", "error", "pending"],
      knowledge_scope: ["global", "group"],
      member_role: ["member", "admin", "owner"],
      message_direction: ["human", "bot"],
      report_period: ["daily", "weekly", "custom"],
      task_status: ["pending", "completed", "cancelled"],
    },
  },
} as const

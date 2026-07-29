export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          board_id: string
          created_at: string
          id: string
          mime_type: string
          original_filename: string
          owner_id: string
          reservation_expires_at: string | null
          size_bytes: number
          state: string
          storage_path: string
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          mime_type: string
          original_filename: string
          owner_id: string
          reservation_expires_at?: string | null
          size_bytes: number
          state?: string
          storage_path: string
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          mime_type?: string
          original_filename?: string
          owner_id?: string
          reservation_expires_at?: string | null
          size_bytes?: number
          state?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_board_owner_fk"
            columns: ["board_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      boards: {
        Row: {
          allow_indexing: boolean
          content_markdown: string
          created_at: string
          id: string
          owner_id: string
          published_at: string | null
          revision: number
          slug: string
          status: string
          summary: string
          template: string
          theme: Json
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          allow_indexing?: boolean
          content_markdown?: string
          created_at?: string
          id?: string
          owner_id: string
          published_at?: string | null
          revision?: number
          slug: string
          status?: string
          summary?: string
          template: string
          theme?: Json
          title?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          allow_indexing?: boolean
          content_markdown?: string
          created_at?: string
          id?: string
          owner_id?: string
          published_at?: string | null
          revision?: number
          slug?: string
          status?: string
          summary?: string
          template?: string
          theme?: Json
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          storage_bytes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          storage_bytes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          storage_bytes?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_board_image_cancellation: {
        Args: { p_attachment_id: string; p_board_id: string }
        Returns: {
          id: string
          owner_id: string
          state: string
          storage_path: string
        }[]
      }
      clear_password_failures_for_server: {
        Args: { p_anonymous_key_hash: string; p_board_id: string }
        Returns: undefined
      }
      complete_board_image_cancellation: {
        Args: {
          p_attachment_id: string
          p_board_id: string
          p_owner_id: string
        }
        Returns: undefined
      }
      delete_board_image_record: {
        Args: { p_attachment_id: string }
        Returns: boolean
      }
      finalize_board_image: {
        Args: {
          p_actual_size_bytes: number
          p_attachment_id: string
          p_mime_type: string
        }
        Returns: {
          id: string
          mime_type: string
          original_filename: string
          reservation_expires_at: string
          size_bytes: number
          state: string
          storage_path: string
        }[]
      }
      get_password_board_for_server: {
        Args: { p_slug: string }
        Returns: {
          board_id: string
          content_markdown: string
          password_hash: string
          published_at: string
          secret_version: string
          slug: string
          summary: string
          template: string
          theme: Json
          title: string
          updated_at: string
        }[]
      }
      get_password_lock_for_server: {
        Args: { p_anonymous_key_hash: string; p_board_id: string }
        Returns: {
          locked_until: string
        }[]
      }
      publish_board_with_password: {
        Args: {
          p_board_id: string
          p_password_hash: string
          p_revision: number
        }
        Returns: {
          revision: number
          updated_at: string
        }[]
      }
      record_password_failure_for_server: {
        Args: { p_anonymous_key_hash: string; p_board_id: string }
        Returns: {
          failed_count: number
          locked_until: string
        }[]
      }
      reserve_board_image: {
        Args: {
          p_board_id: string
          p_mime_type: string
          p_original_filename: string
          p_size_bytes: number
        }
        Returns: {
          id: string
          mime_type: string
          original_filename: string
          reservation_expires_at: string
          size_bytes: number
          storage_path: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

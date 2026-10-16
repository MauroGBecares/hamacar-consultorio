export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      attachments: {
        Row: {
          bucket: string;
          created_at: string;
          draft_id: string | null;
          id: string;
          mime_type: string;
          name: string;
          owner_id: string;
          path: string;
          patient_id: string | null;
          purpose: string;
          record_id: string | null;
          settlement_id: string | null;
          sha256: string | null;
          size: number;
          state: string;
          transfer_id: string | null;
          validated_at: string | null;
          visibility: string | null;
        };
        Insert: {
          bucket: string;
          created_at?: string;
          draft_id?: string | null;
          id?: string;
          mime_type: string;
          name: string;
          owner_id: string;
          path: string;
          patient_id?: string | null;
          purpose: string;
          record_id?: string | null;
          settlement_id?: string | null;
          sha256?: string | null;
          size: number;
          state?: string;
          transfer_id?: string | null;
          validated_at?: string | null;
          visibility?: string | null;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          draft_id?: string | null;
          id?: string;
          mime_type?: string;
          name?: string;
          owner_id?: string;
          path?: string;
          patient_id?: string | null;
          purpose?: string;
          record_id?: string | null;
          settlement_id?: string | null;
          sha256?: string | null;
          size?: number;
          state?: string;
          transfer_id?: string | null;
          validated_at?: string | null;
          visibility?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attachments_draft_id_fkey';
            columns: ['draft_id'];
            isOneToOne: false;
            referencedRelation: 'clinical_drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attachments_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attachments_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attachments_record_id_fkey';
            columns: ['record_id'];
            isOneToOne: false;
            referencedRelation: 'clinical_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attachments_settlement_id_fkey';
            columns: ['settlement_id'];
            isOneToOne: false;
            referencedRelation: 'settlements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attachments_transfer_id_fkey';
            columns: ['transfer_id'];
            isOneToOne: false;
            referencedRelation: 'transfers';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_entries: {
        Row: {
          action: string;
          actor: string;
          actor_id: string | null;
          after_data: Json | null;
          area: string;
          at: string;
          before_data: Json | null;
          changes: Json;
          entity_id: string;
          id: string;
          origin: string;
          owner_id: string | null;
          patient_id: string | null;
          visibility: string;
        };
        Insert: {
          action: string;
          actor: string;
          actor_id?: string | null;
          after_data?: Json | null;
          area: string;
          at?: string;
          before_data?: Json | null;
          changes?: Json;
          entity_id: string;
          id?: string;
          origin: string;
          owner_id?: string | null;
          patient_id?: string | null;
          visibility?: string;
        };
        Update: {
          action?: string;
          actor?: string;
          actor_id?: string | null;
          after_data?: Json | null;
          area?: string;
          at?: string;
          before_data?: Json | null;
          changes?: Json;
          entity_id?: string;
          id?: string;
          origin?: string;
          owner_id?: string | null;
          patient_id?: string | null;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_entries_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_entries_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      booking_exceptions: {
        Row: {
          cancelled: boolean;
          date: string | null;
          from_time: string | null;
          original_date: string;
          room: number | null;
          series_id: string;
          to_time: string | null;
        };
        Insert: {
          cancelled?: boolean;
          date?: string | null;
          from_time?: string | null;
          original_date: string;
          room?: number | null;
          series_id: string;
          to_time?: string | null;
        };
        Update: {
          cancelled?: boolean;
          date?: string | null;
          from_time?: string | null;
          original_date?: string;
          room?: number | null;
          series_id?: string;
          to_time?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_exceptions_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'booking_series';
            referencedColumns: ['id'];
          },
        ];
      };
      booking_series: {
        Row: {
          created_at: string;
          every: number;
          from_time: string;
          id: string;
          patient_id: string;
          professional_id: string;
          room: number;
          start_date: string;
          to_time: string;
          until_date: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          every: number;
          from_time: string;
          id?: string;
          patient_id: string;
          professional_id: string;
          room: number;
          start_date: string;
          to_time: string;
          until_date?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          every?: number;
          from_time?: string;
          id?: string;
          patient_id?: string;
          professional_id?: string;
          room?: number;
          start_date?: string;
          to_time?: string;
          until_date?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_series_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_series_professional_id_fkey';
            columns: ['professional_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      clinical_drafts: {
        Row: {
          author_id: string;
          date: string;
          id: string;
          patient_id: string;
          text: string;
          updated_at: string;
          version: number;
          visibility: string;
        };
        Insert: {
          author_id: string;
          date: string;
          id?: string;
          patient_id: string;
          text?: string;
          updated_at?: string;
          version?: number;
          visibility: string;
        };
        Update: {
          author_id?: string;
          date?: string;
          id?: string;
          patient_id?: string;
          text?: string;
          updated_at?: string;
          version?: number;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clinical_drafts_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clinical_drafts_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
        ];
      };
      clinical_records: {
        Row: {
          author_id: string;
          correction_reason: string | null;
          corrects_record_id: string | null;
          date: string;
          id: string;
          patient_id: string;
          published_at: string;
          text: string;
          visibility: string;
        };
        Insert: {
          author_id: string;
          correction_reason?: string | null;
          corrects_record_id?: string | null;
          date: string;
          id?: string;
          patient_id: string;
          published_at?: string;
          text: string;
          visibility: string;
        };
        Update: {
          author_id?: string;
          correction_reason?: string | null;
          corrects_record_id?: string | null;
          date?: string;
          id?: string;
          patient_id?: string;
          published_at?: string;
          text?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clinical_records_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clinical_records_corrects_record_id_fkey';
            columns: ['corrects_record_id'];
            isOneToOne: false;
            referencedRelation: 'clinical_records';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clinical_records_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
        ];
      };
      collections: {
        Row: {
          cancelled: boolean;
          contribution_cents: number;
          coverage: string;
          created_at: string;
          date: string;
          discipline: string;
          id: string;
          mode: string;
          patient_name: string;
          period_id: string;
          professional_id: string;
          received_cents: number | null;
          sessions_paid: number;
          settlement_id: string | null;
          version: number;
        };
        Insert: {
          cancelled?: boolean;
          contribution_cents: number;
          coverage: string;
          created_at?: string;
          date: string;
          discipline: string;
          id?: string;
          mode: string;
          patient_name: string;
          period_id: string;
          professional_id: string;
          received_cents?: number | null;
          sessions_paid: number;
          settlement_id?: string | null;
          version?: number;
        };
        Update: {
          cancelled?: boolean;
          contribution_cents?: number;
          coverage?: string;
          created_at?: string;
          date?: string;
          discipline?: string;
          id?: string;
          mode?: string;
          patient_name?: string;
          period_id?: string;
          professional_id?: string;
          received_cents?: number | null;
          sessions_paid?: number;
          settlement_id?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'collections_period_id_fkey';
            columns: ['period_id'];
            isOneToOne: false;
            referencedRelation: 'service_periods';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'collections_professional_id_fkey';
            columns: ['professional_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'collections_settlement_id_fkey';
            columns: ['settlement_id'];
            isOneToOne: false;
            referencedRelation: 'settlements';
            referencedColumns: ['id'];
          },
        ];
      };
      patient_team: {
        Row: {
          patient_id: string;
          professional_id: string;
        };
        Insert: {
          patient_id: string;
          professional_id: string;
        };
        Update: {
          patient_id?: string;
          professional_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'patient_team_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'patient_team_professional_id_fkey';
            columns: ['professional_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      patients: {
        Row: {
          admission: string;
          birth_date: string | null;
          close_reason: string | null;
          closed_at: string | null;
          created_at: string;
          created_by: string;
          data: Json;
          id: string;
          name: string;
          status: string;
          version: number;
        };
        Insert: {
          admission: string;
          birth_date?: string | null;
          close_reason?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by: string;
          data?: Json;
          id?: string;
          name: string;
          status?: string;
          version?: number;
        };
        Update: {
          admission?: string;
          birth_date?: string | null;
          close_reason?: string | null;
          closed_at?: string | null;
          created_at?: string;
          created_by?: string;
          data?: Json;
          id?: string;
          name?: string;
          status?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'patients_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          discipline: string;
          full_name: string;
          id: string;
          role: string;
          version: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          discipline?: string;
          full_name?: string;
          id: string;
          role?: string;
          version?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          discipline?: string;
          full_name?: string;
          id?: string;
          role?: string;
          version?: number;
        };
        Relationships: [];
      };
      service_periods: {
        Row: {
          complete: boolean;
          coverage: string;
          cud: string;
          declared: boolean;
          id: string;
          mode: string | null;
          month: string;
          no_service: boolean;
          notes: Json;
          patient_id: string;
          patient_name: string;
          performed: number;
          professional_id: string;
          sessions_paid: number;
          version: number;
        };
        Insert: {
          complete?: boolean;
          coverage: string;
          cud: string;
          declared?: boolean;
          id?: string;
          mode?: string | null;
          month: string;
          no_service?: boolean;
          notes?: Json;
          patient_id: string;
          patient_name: string;
          performed?: number;
          professional_id: string;
          sessions_paid?: number;
          version?: number;
        };
        Update: {
          complete?: boolean;
          coverage?: string;
          cud?: string;
          declared?: boolean;
          id?: string;
          mode?: string | null;
          month?: string;
          no_service?: boolean;
          notes?: Json;
          patient_id?: string;
          patient_name?: string;
          performed?: number;
          professional_id?: string;
          sessions_paid?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'service_periods_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'patients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_periods_professional_id_fkey';
            columns: ['professional_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      settlements: {
        Row: {
          id: string;
          month: string;
          notes: Json;
          professional_id: string;
          version: number;
        };
        Insert: {
          id?: string;
          month: string;
          notes?: Json;
          professional_id: string;
          version?: number;
        };
        Update: {
          id?: string;
          month?: string;
          notes?: Json;
          professional_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'settlements_professional_id_fkey';
            columns: ['professional_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      transfers: {
        Row: {
          amount_cents: number;
          created_at: string;
          date: string;
          id: string;
          notes: Json;
          receipt_id: string;
          replaces_id: string | null;
          settlement_id: string;
          state: string;
          verified_at: string | null;
          verified_by: string | null;
          version: number;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          date: string;
          id?: string;
          notes?: Json;
          receipt_id: string;
          replaces_id?: string | null;
          settlement_id: string;
          state?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          version?: number;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          date?: string;
          id?: string;
          notes?: Json;
          receipt_id?: string;
          replaces_id?: string | null;
          settlement_id?: string;
          state?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'transfers_receipt_id_fkey';
            columns: ['receipt_id'];
            isOneToOne: true;
            referencedRelation: 'attachments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transfers_replaces_id_fkey';
            columns: ['replaces_id'];
            isOneToOne: true;
            referencedRelation: 'transfers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transfers_settlement_id_fkey';
            columns: ['settlement_id'];
            isOneToOne: false;
            referencedRelation: 'settlements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transfers_verified_by_fkey';
            columns: ['verified_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      agenda_command: {
        Args: { p_action: string; p_input: Json; p_operation: string };
        Returns: Json;
      };
      agenda_next: { Args: { p_patient: string }; Returns: Json };
      agenda_read: {
        Args: {
          p_from: string;
          p_professional?: string;
          p_room?: number;
          p_to: string;
        };
        Returns: Json;
      };
      audit_page: {
        Args: { p_area: string; p_cursor?: string; p_id: string };
        Returns: Json;
      };
      clinical_command: {
        Args: { p_action: string; p_input: Json; p_operation: string };
        Returns: Json;
      };
      clinical_page: { Args: { p_query: Json }; Returns: Json };
      finance_command: {
        Args: { p_action: string; p_input: Json; p_operation: string };
        Returns: Json;
      };
      finance_dashboard: { Args: { p_month: string }; Returns: Json };
      finance_page: { Args: { p_query?: Json }; Returns: Json };
      finance_scope: { Args: { p_query: Json }; Returns: Json };
      finance_slots: {
        Args: {
          p_cursor?: string;
          p_limit?: number;
          p_month: string;
          p_professional?: string;
        };
        Returns: Json;
      };
      finance_summary: {
        Args: { p_from: string; p_professional?: string; p_to: string };
        Returns: Json;
      };
      home_summary: { Args: { p_month: string }; Returns: Json };
      patient_command: {
        Args: { p_action: string; p_input: Json; p_operation: string };
        Returns: Json;
      };
      patient_duplicates: {
        Args: { p_except?: string; p_name: string };
        Returns: Json;
      };
      patient_page: { Args: { p_query?: Json }; Returns: Json };
      session_activity: { Args: never; Returns: string };
      session_close: { Args: never; Returns: undefined };
      session_open: {
        Args: never;
        Returns: {
          active: boolean;
          created_at: string;
          discipline: string;
          full_name: string;
          id: string;
          role: string;
          version: number;
        };
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      session_status: { Args: never; Returns: Json };
      upload_check: { Args: { p_id: string }; Returns: Json };
      upload_cleanup_claim: {
        Args: never;
        Returns: {
          bucket: string;
          created_at: string;
          draft_id: string | null;
          id: string;
          mime_type: string;
          name: string;
          owner_id: string;
          path: string;
          patient_id: string | null;
          purpose: string;
          record_id: string | null;
          settlement_id: string | null;
          sha256: string | null;
          size: number;
          state: string;
          transfer_id: string | null;
          validated_at: string | null;
          visibility: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'attachments';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      upload_cleanup_done: { Args: { p_id: string }; Returns: undefined };
      upload_finalize: {
        Args: {
          p_id: string;
          p_owner: string;
          p_session: string;
          p_sha256: string;
          p_size: number;
          p_type: string;
        };
        Returns: Json;
      };
      upload_reserve: {
        Args: { p_input: Json; p_operation: string };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;

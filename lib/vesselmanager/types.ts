export type AppointmentStatus =
  | "EN ROUTE"
  | "ANCHORED OUTER ROADS"
  | "IN PORT"
  | "ALONGSIDE"
  | "SAILED"
  | "CLOSED";

export type Appointment = {
  id: string;
  vessel_name: string;
  role: string;
  appointed_by: string;
  port: string | null;
  terminal: string | null;
  cargo_operation: string | null;
  cargo_grade: string | null;
  cargo_qty: number | null;
  holds: number | null;
  appointment_datetime: string | null;
  charterer_agent: string | null;
  thanks_to: string | null;
  shiftreporter_link: string | null;
  other_agents: string | null;
  other_agents_role: string | null;
  sub_agent_id?: string | null;
  notify_eta_suppliers: boolean | null;
  notify_eta_agents_terminals: boolean | null;
  notify_none: boolean | null;
  needs_daily_prospect: boolean | null;
  accounting_reference?: string | null;
  nomination_received_on?: string | null;
  roe?: number | null;
  pda_sent_on?: string | null;
  pda_not_required?: boolean | null;
  ada_created_on?: string | null;
  ada_sent_on?: string | null;
  fda_created_on?: string | null;
  fda_sent_on?: string | null;
  status: AppointmentStatus;
  created_by: string | null;
  created_at: string;
};

export type AppointmentRecipient = {
  id?: string;
  appointment_id?: string;
  category:
    | "cgnees_shippers_terminal"
    | "charterers_agent"
    | "principal_dpr"
    | "dpr_for_1"
    | "dpr_for_2"
    | "dpr_for_3"
    | "additional_party"
    // Legacy category values kept for backward compatibility with existing rows.
    | "service_provider"
    | "chart_agent_terminal_impoexpo_other"
    | "charterer"
    | "principal";
  name: string | null;
  email: string;
  is_onetimer?: boolean;
};

export type AppointmentTimelineRow = {
  id: string;
  appointment_id: string;
  event_type: TimelineEventCode;
  eta: string | null;
  ata: string | null;
  event_date?: string | null;
  event_time_text?: string | null;
};

export type TimelineEventCode =
  | "ETA_OUTER_ROADS"
  | "EPOB"
  | "ETA_RIVER"
  | "ETHI"
  | "ETB"
  | "COMMENCE_OPS"
  | "COMPLETE_OPS"
  | "ET_COSP"
  | "ETD";

export type CreateAppointmentInput = {
  vessel_name: string;
  role: string;
  appointed_by?: string;
  port?: string;
  terminal?: string;
  cargo_operation?: string;
  cargo_grade?: string;
  cargo_qty?: number;
  holds?: number;
  appointment_datetime?: string;
  charterer_agent?: string;
  thanks_to?: string;
  shiftreporter_link?: string;
  other_agents?: string;
  other_agents_role?: string;
  sub_agent_id?: string | null;
  notify_eta_suppliers?: boolean;
  notify_eta_agents_terminals?: boolean;
  notify_none?: boolean;
  needs_daily_prospect?: boolean;
  accounting_reference?: string;
  nomination_received_on?: string;
  pda_sent_on?: string;
  pda_not_required?: boolean;
  ada_created_on?: string;
  ada_sent_on?: string;
  fda_created_on?: string;
  fda_sent_on?: string;
  status?: AppointmentStatus;
  recipients?: AppointmentRecipient[];
  eta_notice?: EtaNoticeSettings;
};

export type SubAgent = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
};

export type EtaNoticeLine = {
  id?: string;
  appointment_id?: string;
  supplier_name: string;
  supplier_emails: string;
  service_name: string;
  in_mode: "none" | "yes" | "qty";
  in_qty?: number | null;
  out_mode: "none" | "yes" | "qty";
  out_qty?: number | null;
  trigger_eta_eosp: boolean;
  trigger_epob: boolean;
  trigger_etb: boolean;
  trigger_etd: boolean;
  trigger_eta_bunker: boolean;
  is_active?: boolean;
};

export type EtaNoticeSettings = {
  appointment_id?: string;
  enabled: boolean;
  first_service_starts_at?: string | null;
  last_service_ends_at?: string | null;
  lines: EtaNoticeLine[];
};

export type CreateTimelineInput = {
  appointment_id: string;
  event_type: TimelineEventCode;
  eta?: string;
  ata?: string;
  event_date?: string | null;
  event_time_text?: string | null;
};

export type AppointmentDocumentType = "SOF" | "ITC" | "SHIP_PART" | "OTHER_DOX";

export type AppointmentDocument = {
  id: string;
  appointment_id: string;
  document_type: AppointmentDocumentType;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
};


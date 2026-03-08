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
  notify_eta_suppliers: boolean | null;
  notify_eta_agents_terminals: boolean | null;
  notify_none: boolean | null;
  needs_daily_prospect: boolean | null;
  status: AppointmentStatus;
  created_by: string | null;
  created_at: string;
};

export type AppointmentRecipient = {
  id?: string;
  appointment_id?: string;
  category: "service_provider" | "chart_agent_terminal_impoexpo_other" | "charterer" | "principal" | "additional_party";
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
  notify_eta_suppliers?: boolean;
  notify_eta_agents_terminals?: boolean;
  notify_none?: boolean;
  needs_daily_prospect?: boolean;
  status?: AppointmentStatus;
  recipients?: AppointmentRecipient[];
};

export type CreateTimelineInput = {
  appointment_id: string;
  event_type: TimelineEventCode;
  eta?: string;
  ata?: string;
  event_date?: string | null;
  event_time_text?: string | null;
};


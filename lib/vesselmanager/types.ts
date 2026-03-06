export type AppointmentStatus =
  | "PROSPECT"
  | "EN_ROUTE"
  | "OUTER_ROADS"
  | "IN_PORT"
  | "ALONGSIDE"
  | "SAILING"
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
  status: AppointmentStatus;
  created_by: string | null;
  created_at: string;
};

export type AppointmentTimelineRow = {
  id: string;
  appointment_id: string;
  event_type: TimelineEventCode;
  eta: string | null;
  ata: string | null;
};

export type TimelineEventCode =
  | "ETA_OUTER_ROADS"
  | "EPOB"
  | "ETA_RIVER"
  | "ETB"
  | "COMMENCE_OPS"
  | "COMPLETE_OPS"
  | "ETD";

export type CreateAppointmentInput = {
  vessel_name: string;
  role: string;
  appointed_by: string;
  port?: string;
  terminal?: string;
  cargo_operation?: string;
  cargo_grade?: string;
  cargo_qty?: number;
  status?: AppointmentStatus;
};

export type CreateTimelineInput = {
  appointment_id: string;
  event_type: TimelineEventCode;
  eta?: string;
  ata?: string;
};

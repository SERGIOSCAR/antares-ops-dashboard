export type OperationType = "LOAD" | "DISCHARGE";

export type Vessel = {
  id: string;
  appointment_id?: string | null;
  short_id: string;
  name: string;
  port: string;
  terminal: string;
  operation_type: OperationType;
  shift_type: string;
  holds: number;
  cargo_grades: string[];
  default_recipients: string[];
  commenced_at: string | null;
};

export type StowRow = {
  hold: number;
  grade: string;
  total_mt: number;
  condition?: string;
};

export type DelayRow = {
  from: string;
  to?: string;
  reason: string;
};

export type ShiftLinePayload = {
  hold: number;
  grade: string;
  thisShiftMT: number;
  accumulatedMT?: number;
  remainingMT?: number;
  condition?: string;
};

export type ShiftPayload = {
  vesselId: string;
  shiftStart: string;
  shiftEnd: string;
  shiftType?: string;
  notes?: string;
  lines: ShiftLinePayload[];
  delays: DelayRow[];
  recipients: string[];
  isRevised?: boolean;
};

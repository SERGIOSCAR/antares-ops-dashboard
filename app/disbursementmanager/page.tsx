import { supabaseServer } from "@/lib/supabase/server";
import DisbursementBoardClient from "./board-client";
import type { DisbursementBoardRow } from "@/lib/disbursementmanager/types";

async function fetchBoard(): Promise<DisbursementBoardRow[]> {
  const supabase = await supabaseServer();
  let result: any = await supabase
    .from("v_appointment_accounting_board")
    .select(
      "appointment_id,vessel_name,role,port,terminal,client_name,cargo_operation,other_agents,other_agents_role,shiftreporter_link,thanks_to,appointment_status,accounting_reference,nomination_received_on,departure_date,days_since_nomination,accounting_reference_status,roe,pda_due_days_override,pda_sent_on,pda_status,ada_attention_days_override,ada_urgent_days_override,ada_created_on,ada_sent_on,ada_status,ada_priority,fda_attention_days_override,fda_urgent_days_override,fda_created_on,fda_sent_on,fda_status,fda_priority,comments,berth,days_count,operator_initials",
    )
    .order("accounting_reference_status", { ascending: false })
    .order("days_since_nomination", { ascending: false });

  if (result.error) {
    result = await supabase
      .from("v_appointment_accounting_board")
      .select(
        "appointment_id,vessel_name,port,terminal,client_name,cargo_operation,appointment_status,accounting_reference,nomination_received_on,departure_date,days_since_nomination,accounting_reference_status,roe,pda_sent_on,pda_status,ada_created_on,ada_sent_on,ada_status,ada_priority,fda_created_on,fda_sent_on,fda_status,fda_priority,comments,berth,days_count,operator_initials",
      )
      .order("accounting_reference_status", { ascending: false })
      .order("days_since_nomination", { ascending: false });
  }

  if (result.error) {
    return [];
  }

  return (result.data ?? []) as DisbursementBoardRow[];
}

export default async function DisbursementManagerPage() {
  const rows = await fetchBoard();
  return <DisbursementBoardClient initialRows={rows} />;
}

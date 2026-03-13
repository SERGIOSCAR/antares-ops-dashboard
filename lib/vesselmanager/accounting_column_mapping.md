## Accounting Column Mapping

Source workbook: `col to add closed.xlsx`

Approach:
- Keep shared operational fields in existing tables.
- Store new accounting inputs in `public.appointment_accounting`.
- Compute spreadsheet-style status/priority fields in a SQL view.

| Excel Col | Workbook Header | Target | Column | Type | Action | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A | Numero | `public.appointment_accounting` | `accounting_reference` | `text` | add | Accounting reference / case number. Stored as text to avoid format issues. |
| B | Buques | `public.appointments` | `vessel_name` | `text` | existing | Already in schema. |
| C | Puerto | `public.appointments` | `port` | `text` | existing | Already in schema. |
| D | Cliente | `public.appointments` | `appointed_by` | `text` | existing | Already in schema. |
| E | Operacion | `public.appointments` | `cargo_operation` | `text` | existing | Already in schema. |
| F | Fecha Nomin. | `public.appointment_accounting` | `nomination_received_on` | `date` | add | Appointment/nomination received date. |
| G | PDA | `public.v_appointment_accounting_board` | `pda_status` | computed | derive | `NO` / `SI` / `PENDIENTE`. |
| H | Fecha Envio pda | `public.appointment_accounting` | `pda_sent_on` | `date` | add | PDA sent date. |
| I | Fecha Zarpada | `public.v_appointment_accounting_board` | `departure_date` | computed | derive | Pulled from `appointment_timeline` `ETD` first, fallback to stored override. |
| J | ROE | `public.appointment_accounting` | `roe` | `numeric(12,4)` | add | Accounting exchange rate. |
| K | ADA | `public.v_appointment_accounting_board` | `ada_status` | computed | derive | `NO` / `SI` / `PENDIENTE`. |
| L | Fecha Confecc. | `public.appointment_accounting` | `ada_created_on` | `date` | add | ADA created date. |
| M | Fecha Envio | `public.appointment_accounting` | `ada_sent_on` | `date` | add | ADA sent date. |
| N | Prioridad | `public.v_appointment_accounting_board` | `ada_priority` | computed | derive | `NO ENVIADO` / `ENVIADO` / `URGENTE` / `ATENCION` / `OK`. |
| O | FDA | `public.v_appointment_accounting_board` | `fda_status` | computed | derive | `NO` / `SI` / empty string. |
| P | Fecha Confecc. | `public.appointment_accounting` | `fda_created_on` | `date` | add | FDA created date. |
| Q | Fecha Envio | `public.appointment_accounting` | `fda_sent_on` | `date` | add | FDA sent date. |
| R | Prioridad | `public.v_appointment_accounting_board` | `fda_priority` | computed | derive | `NO ENVIADO` / `ENVIADO` / `URGENTE` / `ATENCION` / `OK`. |
| S | Comentarios | `public.appointment_accounting` | `comments` | `text` | add | Free-text accounting notes. |
| T | Berth | `public.appointment_accounting` | `berth` | `text` | add | Distinct from terminal. |
| U | Days | `public.appointment_accounting` | `days_count` | `integer` | add | Keep as manual/source field initially. |
| V | OPERADOR | `public.appointment_accounting` | `operator_initials` | `text` | add | Can be backfilled from `profiles.username` in the view. |

Additional implementation fields:

| Column | Target | Type | Reason |
| --- | --- | --- | --- |
| `departure_override_on` | `public.appointment_accounting` | `date` | Lets accounting override the departure date if timeline is incomplete. |
| `pda_not_required` | `public.appointment_accounting` | `boolean` | Preserves the workbook's explicit `NO` state for PDA. |
| `ada_not_required` | `public.appointment_accounting` | `boolean` | Preserves the workbook's explicit `x/NO` state for ADA. |
| `fda_not_required` | `public.appointment_accounting` | `boolean` | Preserves the workbook's explicit `x/NO` state for FDA. |

Formula translation:

- `PDA`:
  - `NO` when `pda_not_required = true`
  - `SI` when `pda_sent_on is not null`
  - `PENDIENTE` otherwise
- `ADA`:
  - `SI` when `ada_created_on is not null`
  - `NO` when `ada_not_required = true`
  - `SI` when `ada_sent_on is not null`
  - `PENDIENTE` otherwise
- `ADA Prioridad`:
  - `NO ENVIADO` when `ada_not_required = true`
  - `ENVIADO` when `ada_sent_on is not null`
  - `OK` when no departure date exists
  - `URGENTE` when `current_date - departure_date >= 11`
  - `ATENCION` when `current_date - departure_date between 6 and 10`
  - `OK` otherwise
- `FDA`:
  - `NO` when `fda_not_required = true`
  - `SI` when `fda_sent_on is not null`
  - empty string otherwise
- `FDA Prioridad`:
  - `NO ENVIADO` when `fda_not_required = true`
  - `ENVIADO` when `fda_sent_on is not null`
  - `OK` when no departure date exists
  - `URGENTE` when `current_date - departure_date >= 45`
  - `ATENCION` when `current_date - departure_date between 30 and 44`
  - `OK` otherwise

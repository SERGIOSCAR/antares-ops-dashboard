ALTER TABLE appointment_timeline
ADD COLUMN event_date DATE,
ADD COLUMN event_time_text TEXT;

UPDATE appointment_timeline
SET event_date = event_time::date;

ALTER TABLE appointment_timeline
DROP COLUMN event_time;

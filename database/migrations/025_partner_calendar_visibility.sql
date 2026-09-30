-- Existing and newly created groups retain the current cross-project calendar behavior.
ALTER TABLE study_groups
  ADD COLUMN partner_calendar_visible BOOLEAN NOT NULL DEFAULT TRUE;

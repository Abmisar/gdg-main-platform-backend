BEGIN;
ALTER TABLE committee_point_entry ADD COLUMN operation_id UUID, ADD COLUMN recipient_name_encrypted TEXT;
CREATE UNIQUE INDEX committee_point_entry_operation_id_key ON committee_point_entry(operation_id);
ALTER TABLE global_point_entry ADD COLUMN operation_id UUID, ADD COLUMN recipient_name_encrypted TEXT;
CREATE UNIQUE INDEX global_point_entry_operation_id_key ON global_point_entry(operation_id);
COMMIT;

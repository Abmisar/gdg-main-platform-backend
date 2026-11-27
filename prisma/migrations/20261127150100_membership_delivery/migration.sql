BEGIN;
CREATE TABLE membership_decision_delivery (
  id SERIAL PRIMARY KEY,
  committee_decision_id INTEGER UNIQUE REFERENCES membership_request_committee(membership_request_committee_id) ON DELETE CASCADE,
  global_decision_id INTEGER UNIQUE REFERENCES membership_request_global_role(membership_request_global_role_id) ON DELETE CASCADE,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ(3),
  CHECK (num_nonnulls(committee_decision_id, global_decision_id) = 1)
);
CREATE INDEX membership_decision_delivery_sent_at_available_at_idx ON membership_decision_delivery(sent_at, available_at);
COMMIT;

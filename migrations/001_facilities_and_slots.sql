-- Development database only; apply manually after approval.
-- Migration history/runner will be added before further migrations.
BEGIN;
CREATE SCHEMA booking;
REVOKE ALL ON SCHEMA booking FROM PUBLIC;

CREATE TABLE booking.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_issuer text NOT NULL,
  auth_subject text NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_issuer, auth_subject)
);
CREATE TABLE booking.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  sport text NOT NULL CHECK (sport IN ('golf','baseball')),
  region text NOT NULL,
  address text NOT NULL,
  description text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE booking.facility_operators (
  facility_id uuid REFERENCES booking.facilities(id) ON DELETE RESTRICT,
  member_id uuid REFERENCES booking.members(id) ON DELETE RESTRICT,
  PRIMARY KEY (facility_id, member_id)
);
CREATE TABLE booking.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES booking.facilities(id) ON DELETE RESTRICT,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('golf_course','baseball_field')),
  published boolean NOT NULL DEFAULT false
);
CREATE TABLE booking.slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES booking.resources(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  booking_deadline timestamptz NOT NULL,
  price_krw integer NOT NULL CHECK (price_krw >= 0),
  published boolean NOT NULL DEFAULT false,
  CHECK (ends_at > starts_at),
  CHECK (booking_deadline <= starts_at),
  UNIQUE (resource_id, starts_at, ends_at)
);
CREATE TABLE booking.golf_slot_details (
  slot_id uuid PRIMARY KEY REFERENCES booking.slots(id) ON DELETE RESTRICT,
  tee_time timestamptz NOT NULL,
  player_count smallint NOT NULL CHECK (player_count > 0),
  cart_option text NOT NULL DEFAULT '',
  caddie_option text NOT NULL DEFAULT ''
);
CREATE TABLE booking.baseball_slot_details (
  slot_id uuid PRIMARY KEY REFERENCES booking.slots(id) ON DELETE RESTRICT,
  lighting_option text NOT NULL DEFAULT ''
);
CREATE INDEX slots_resource_time ON booking.slots(resource_id, starts_at);
CREATE INDEX resources_facility ON booking.resources(facility_id);

-- No browser grants and no permissive policies. Server role is provisioned
-- separately with least privileges. This also blocks exposed Data API access.
ALTER TABLE booking.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.facility_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.golf_slot_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.baseball_slot_details ENABLE ROW LEVEL SECURITY;
COMMIT;

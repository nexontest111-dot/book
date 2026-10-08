-- Apply once after 001 in the development SQL Editor.
-- This role cannot log in until a password is set privately in the dashboard.
BEGIN;
CREATE ROLE book_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA booking TO book_reader;
GRANT SELECT ON booking.facilities, booking.resources, booking.slots,
  booking.golf_slot_details, booking.baseball_slot_details TO book_reader;
CREATE POLICY reader_facilities ON booking.facilities FOR SELECT TO book_reader
  USING (published);
CREATE POLICY reader_resources ON booking.resources FOR SELECT TO book_reader
  USING (published AND EXISTS (
    SELECT 1 FROM booking.facilities f WHERE f.id = facility_id AND f.published));
CREATE POLICY reader_slots ON booking.slots FOR SELECT TO book_reader
  USING (published AND EXISTS (
    SELECT 1 FROM booking.resources r WHERE r.id = resource_id AND r.published));
CREATE POLICY reader_golf_details ON booking.golf_slot_details FOR SELECT TO book_reader
  USING (EXISTS (SELECT 1 FROM booking.slots s WHERE s.id = slot_id AND s.published));
CREATE POLICY reader_baseball_details ON booking.baseball_slot_details FOR SELECT TO book_reader
  USING (EXISTS (SELECT 1 FROM booking.slots s WHERE s.id = slot_id AND s.published));
COMMIT;

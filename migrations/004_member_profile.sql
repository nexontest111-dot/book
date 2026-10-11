-- Apply once after 001/002, in development SQL Editor. Does not depend on 003.
-- Adds member profile maintenance (updated_at, display_name hygiene) and a
-- SECURITY DEFINER entry point for the Worker. No direct table grants.
BEGIN;
ALTER TABLE booking.members
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
-- Existing rows (if any) never changed after insert; align with created_at.
UPDATE booking.members SET updated_at = created_at;

-- No leading/trailing whitespace (same set JavaScript String.prototype.trim removes)
-- and no C0/C1 control characters anywhere. Validated immediately: if an existing
-- row violates it the whole transaction rolls back (see notes for the pre-check).
ALTER TABLE booking.members
 ADD CONSTRAINT members_display_name_trimmed CHECK (display_name !~
  '^[\u0009-\u000D \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]|[\u0009-\u000D \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]$'),
 ADD CONSTRAINT members_display_name_no_control CHECK (display_name !~ '[\u0001-\u001F\u007F-\u009F]');

REVOKE ALL ON booking.members FROM PUBLIC,anon,authenticated,service_role,book_reader;

-- Accessible ONLY by trusted Worker DB credentials.
-- Worker supplies issuer/subject from validated getUser, never a request body.
CREATE FUNCTION booking.member_profile(p_issuer text,p_subject text,p_action text,p_display_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_row booking.members%ROWTYPE; v_created boolean := false; v_member jsonb;
BEGIN
 IF p_issuer IS NULL OR p_subject IS NULL
  OR char_length(p_issuer) NOT BETWEEN 1 AND 2048
  OR char_length(p_subject) NOT BETWEEN 1 AND 255
  OR p_issuer <> btrim(p_issuer) OR p_subject <> btrim(p_subject) THEN
  RAISE EXCEPTION 'INVALID_IDENTITY' USING ERRCODE='22023';
 END IF;
 IF p_action IS NULL OR p_action NOT IN ('get','upsert') THEN
  RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE='22023';
 END IF;

 IF p_action = 'get' THEN
  SELECT * INTO v_row FROM booking.members
   WHERE auth_issuer = p_issuer AND auth_subject = p_subject;
  IF NOT FOUND THEN RETURN NULL; END IF;  -- SQL NULL, not jsonb 'null'
 ELSE
  IF p_display_name IS NULL
   OR char_length(p_display_name) NOT BETWEEN 1 AND 80
   OR p_display_name ~ '^[\u0009-\u000D \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]|[\u0009-\u000D \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]$'
   OR p_display_name ~ '[\u0001-\u001F\u007F-\u009F]' THEN
   RAISE EXCEPTION 'INVALID_DISPLAY_NAME' USING ERRCODE='22023';
  END IF;
  -- Concurrent first requests: the unique index serialises them; the loser
  -- falls through to the UPDATE below, so exactly one row exists.
  INSERT INTO booking.members(auth_issuer,auth_subject,display_name)
   VALUES(p_issuer,p_subject,p_display_name)
   ON CONFLICT (auth_issuer,auth_subject) DO NOTHING
   RETURNING * INTO v_row;
  IF FOUND THEN
   v_created := true;
  ELSE
   -- Same name: no write, updated_at stays unchanged.
   UPDATE booking.members SET display_name = p_display_name, updated_at = now()
    WHERE auth_issuer = p_issuer AND auth_subject = p_subject
     AND display_name IS DISTINCT FROM p_display_name
    RETURNING * INTO v_row;
   IF NOT FOUND THEN
    SELECT * INTO v_row FROM booking.members
     WHERE auth_issuer = p_issuer AND auth_subject = p_subject;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   END IF;
  END IF;
 END IF;

 v_member := jsonb_build_object(
  'id', v_row.id,
  'displayName', v_row.display_name,
  'createdAt', to_char(v_row.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'updatedAt', to_char(v_row.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 IF p_action = 'get' THEN RETURN v_member; END IF;
 RETURN jsonb_build_object('created', v_created, 'member', v_member);
END;
$$;
REVOKE ALL ON FUNCTION booking.member_profile(text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION booking.member_profile(text,text,text,text) TO book_reader;
COMMIT;

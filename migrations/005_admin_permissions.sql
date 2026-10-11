-- Apply once after 001/002/003/004, in development SQL Editor.
-- Adds service admin / facility operator management through one SECURITY DEFINER
-- entry point for the Worker, plus a permission audit table. No direct table grants.
-- Does not modify booking.admin_facilities (003).
BEGIN;
-- Existing rows (if any) receive the time this migration runs.
ALTER TABLE booking.facility_operators
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE booking.permission_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK (action IN ('grant_admin','revoke_admin','grant_operator','revoke_operator')),
 target_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 facility_id uuid REFERENCES booking.facilities(id) ON DELETE RESTRICT,
 member_id uuid REFERENCES booking.members(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT permission_audit_shape CHECK (
  (action IN ('grant_admin','revoke_admin')
    AND target_user_id IS NOT NULL AND facility_id IS NULL AND member_id IS NULL)
  OR (action IN ('grant_operator','revoke_operator')
    AND facility_id IS NOT NULL AND member_id IS NOT NULL))
);
CREATE INDEX permission_audit_created ON booking.permission_audit(created_at);

ALTER TABLE booking.permission_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking.permission_audit,booking.facility_operators
 FROM PUBLIC,anon,authenticated,service_role,book_reader;

-- Accessible ONLY by trusted Worker DB credentials.
-- Worker supplies actor (getUser id) and issuer (SUPABASE_URL origin + /auth/v1),
-- never a request body. Target IDs come from URL path parameters only.
CREATE FUNCTION booking.admin_permissions(p_actor uuid,p_issuer text,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 c_uuid constant text := '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$';
 c_ts constant text := 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';
 v_email text; v_uid uuid; v_target uuid; v_facility uuid; v_member uuid;
 v_ids uuid[]; v_changed boolean := false; v_obj jsonb; v_rows jsonb;
BEGIN
 -- 1. Actor must be an enabled service admin. grant_admin/revoke_admin take no lock
 --    here; they re-check the actor below while holding row locks on every enabled
 --    admin (same lock order for both, so they never deadlock with each other).
 IF p_action IS NULL OR p_action NOT IN ('grant_admin','revoke_admin') THEN
  PERFORM 1 FROM booking.service_admins WHERE auth_user_id=p_actor AND enabled FOR SHARE;
 ELSE
  PERFORM 1 FROM booking.service_admins WHERE auth_user_id=p_actor AND enabled;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;

 IF p_action IS NULL OR p_action NOT IN
  ('list_admins','grant_admin','revoke_admin','list_operators','grant_operator','revoke_operator') THEN
  RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE='22023';
 END IF;
 IF p_issuer IS NULL OR char_length(p_issuer) NOT BETWEEN 1 AND 2048 OR p_issuer <> btrim(p_issuer) THEN
  RAISE EXCEPTION 'INVALID_ISSUER' USING ERRCODE='22023';
 END IF;

 -- 2. Read-only actions.
 IF p_action='list_admins' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'authUserId',a.auth_user_id,'email',u.email,'displayName',m.display_name,
    'createdAt',to_char(a.created_at AT TIME ZONE 'UTC',c_ts),'isSelf',a.auth_user_id=p_actor)
    ORDER BY a.created_at,a.auth_user_id),'[]'::jsonb)
   INTO v_rows
   FROM booking.service_admins a
   JOIN auth.users u ON u.id=a.auth_user_id
   LEFT JOIN booking.members m ON m.auth_issuer=p_issuer AND m.auth_subject=a.auth_user_id::text
   WHERE a.enabled;
  RETURN jsonb_build_object('data',v_rows);
 END IF;

 IF p_action='list_operators' THEN
  -- Missing key or JSON null: all facilities.
  IF coalesce(jsonb_typeof(p_data->'facilityId'),'null')<>'null' THEN
   IF jsonb_typeof(p_data->'facilityId')<>'string' OR (p_data->>'facilityId') !~ c_uuid THEN
    RAISE EXCEPTION 'INVALID_ID' USING ERRCODE='22023';
   END IF;
   v_facility := (p_data->>'facilityId')::uuid;
   PERFORM 1 FROM booking.facilities WHERE id=v_facility;
   IF NOT FOUND THEN RAISE EXCEPTION 'FACILITY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t) - 'ord_name' - 'ord_ts' ORDER BY t.ord_name,t."facilityId",t.ord_ts,t."memberId"),'[]'::jsonb)
   INTO v_rows FROM (
    SELECT fo.facility_id AS "facilityId",f.name AS "facilityName",fo.member_id AS "memberId",
     u.id AS "authUserId",u.email AS "email",m.display_name AS "displayName",
     to_char(fo.created_at AT TIME ZONE 'UTC',c_ts) AS "createdAt",
     f.name AS ord_name,fo.created_at AS ord_ts
    FROM booking.facility_operators fo
    JOIN booking.facilities f ON f.id=fo.facility_id
    JOIN booking.members m ON m.id=fo.member_id
    LEFT JOIN auth.users u ON m.auth_issuer=p_issuer
     AND u.id=CASE WHEN m.auth_subject ~ c_uuid THEN m.auth_subject::uuid END
    WHERE v_facility IS NULL OR fo.facility_id=v_facility
    ORDER BY f.name,fo.facility_id,fo.created_at,fo.member_id
    LIMIT 200
   ) t;
  RETURN jsonb_build_object('data',v_rows);
 END IF;

 -- 3. Grants: resolve the target account by exact lower(email) match.
 IF p_action IN ('grant_admin','grant_operator') THEN
  IF p_action='grant_operator' THEN
   IF jsonb_typeof(p_data->'facilityId') IS DISTINCT FROM 'string' OR (p_data->>'facilityId') !~ c_uuid THEN
    RAISE EXCEPTION 'INVALID_ID' USING ERRCODE='22023';
   END IF;
   v_facility := (p_data->>'facilityId')::uuid;
  END IF;
  IF jsonb_typeof(p_data->'email') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE='22023';
  END IF;
  v_email := p_data->>'email';
  IF char_length(v_email) NOT BETWEEN 3 AND 254 OR v_email <> btrim(v_email)
   OR position('@' IN v_email)=0 THEN
   RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE='22023';
  END IF;
  IF p_action='grant_operator' THEN
   PERFORM 1 FROM booking.facilities WHERE id=v_facility;
   IF NOT FOUND THEN RAISE EXCEPTION 'FACILITY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;
  -- Zero or several confirmed, non-deleted accounts with that address: refuse.
  -- Never pick one of several, since that could hand privileges to the wrong person.
  SELECT array_agg(u.id) INTO v_ids FROM auth.users u
   WHERE lower(u.email)=lower(v_email) AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL;
  IF coalesce(cardinality(v_ids),0)<>1 THEN
   RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  v_uid := v_ids[1];

  IF p_action='grant_admin' THEN
   -- Same admin-set lock as revoke_admin. Grants and revokes serialise here, so an
   -- enabled target stays enabled (row locked) until this transaction commits, and
   -- a target revoked just before is seen as disabled and re-enabled (changed=true).
   SELECT coalesce(array_agg(s.auth_user_id),'{}'::uuid[]) INTO v_ids FROM (
    SELECT auth_user_id FROM booking.service_admins WHERE enabled
     ORDER BY auth_user_id FOR UPDATE) s;
   IF NOT (p_actor = ANY(v_ids)) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';
   END IF;
   IF NOT (v_uid = ANY(v_ids)) THEN
    INSERT INTO booking.service_admins(auth_user_id,enabled) VALUES(v_uid,true)
     ON CONFLICT (auth_user_id) DO UPDATE SET enabled=true WHERE NOT booking.service_admins.enabled
     RETURNING auth_user_id INTO v_target;
    v_changed := FOUND;
   END IF;
   IF v_changed THEN
    INSERT INTO booking.permission_audit(actor_id,action,target_user_id) VALUES(p_actor,'grant_admin',v_uid);
   END IF;
   SELECT jsonb_build_object(
     'authUserId',a.auth_user_id,'email',u.email,'displayName',m.display_name,
     'createdAt',to_char(a.created_at AT TIME ZONE 'UTC',c_ts),'isSelf',a.auth_user_id=p_actor)
    INTO v_obj
    FROM booking.service_admins a
    JOIN auth.users u ON u.id=a.auth_user_id
    LEFT JOIN booking.members m ON m.auth_issuer=p_issuer AND m.auth_subject=a.auth_user_id::text
    WHERE a.auth_user_id=v_uid AND a.enabled;
   -- Unreachable while the row is locked; never report a non-admin as an admin.
   IF v_obj IS NULL THEN RAISE EXCEPTION 'CONCURRENT_UPDATE' USING ERRCODE='40001'; END IF;
   RETURN jsonb_build_object('changed',v_changed,'admin',v_obj);
  END IF;

  -- grant_operator
  SELECT id INTO v_member FROM booking.members WHERE auth_issuer=p_issuer AND auth_subject=v_uid::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_REGISTERED' USING ERRCODE='P0001'; END IF;
  -- Insert, or lock the existing row so a concurrent revoke_operator cannot delete
  -- it before we read it back. If a revoke deleted it in between, insert again.
  FOR i IN 1..3 LOOP
   INSERT INTO booking.facility_operators(facility_id,member_id) VALUES(v_facility,v_member)
    ON CONFLICT (facility_id,member_id) DO NOTHING
    RETURNING member_id INTO v_target;
   IF FOUND THEN v_changed := true; EXIT; END IF;
   PERFORM 1 FROM booking.facility_operators
    WHERE facility_id=v_facility AND member_id=v_member FOR SHARE;
   IF FOUND THEN EXIT; END IF;
  END LOOP;
  IF v_changed THEN
   INSERT INTO booking.permission_audit(actor_id,action,target_user_id,facility_id,member_id)
    VALUES(p_actor,'grant_operator',v_uid,v_facility,v_member);
  END IF;
  SELECT jsonb_build_object(
    'facilityId',fo.facility_id,'facilityName',f.name,'memberId',fo.member_id,
    'authUserId',v_uid,'email',u.email,'displayName',m.display_name,
    'createdAt',to_char(fo.created_at AT TIME ZONE 'UTC',c_ts))
   INTO v_obj
   FROM booking.facility_operators fo
   JOIN booking.facilities f ON f.id=fo.facility_id
   JOIN booking.members m ON m.id=fo.member_id
   JOIN auth.users u ON u.id=v_uid
   WHERE fo.facility_id=v_facility AND fo.member_id=v_member;
  -- Only if three insert/delete races in a row were lost; never return a null operator.
  IF v_obj IS NULL THEN RAISE EXCEPTION 'CONCURRENT_UPDATE' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('changed',v_changed,'operator',v_obj);
 END IF;

 -- 4. revoke_admin
 IF p_action='revoke_admin' THEN
  IF jsonb_typeof(p_data->'authUserId') IS DISTINCT FROM 'string' OR (p_data->>'authUserId') !~ c_uuid THEN
   RAISE EXCEPTION 'INVALID_ID' USING ERRCODE='22023';
  END IF;
  v_target := (p_data->>'authUserId')::uuid;
  IF v_target=p_actor THEN RAISE EXCEPTION 'SELF_REVOKE' USING ERRCODE='P0001'; END IF;
  -- Lock every enabled admin row in a fixed order. Two admins revoking each other
  -- serialise here; the second one re-reads rows after the first commits, no longer
  -- sees its own row as enabled and fails with ADMIN_REQUIRED.
  SELECT coalesce(array_agg(s.auth_user_id),'{}'::uuid[]) INTO v_ids FROM (
   SELECT auth_user_id FROM booking.service_admins WHERE enabled
    ORDER BY auth_user_id FOR UPDATE) s;
  IF NOT (p_actor = ANY(v_ids)) THEN
   RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NOT (v_target = ANY(v_ids)) THEN
   RETURN jsonb_build_object('changed',false);
  END IF;
  IF cardinality(v_ids)<=1 THEN
   RAISE EXCEPTION 'LAST_ADMIN' USING ERRCODE='P0001';
  END IF;
  UPDATE booking.service_admins SET enabled=false WHERE auth_user_id=v_target AND enabled;
  INSERT INTO booking.permission_audit(actor_id,action,target_user_id) VALUES(p_actor,'revoke_admin',v_target);
  RETURN jsonb_build_object('changed',true);
 END IF;

 -- 5. revoke_operator
 IF jsonb_typeof(p_data->'facilityId') IS DISTINCT FROM 'string' OR (p_data->>'facilityId') !~ c_uuid
  OR jsonb_typeof(p_data->'memberId') IS DISTINCT FROM 'string' OR (p_data->>'memberId') !~ c_uuid THEN
  RAISE EXCEPTION 'INVALID_ID' USING ERRCODE='22023';
 END IF;
 v_facility := (p_data->>'facilityId')::uuid;
 v_member := (p_data->>'memberId')::uuid;
 DELETE FROM booking.facility_operators WHERE facility_id=v_facility AND member_id=v_member
  RETURNING member_id INTO v_target;
 IF NOT FOUND THEN RETURN jsonb_build_object('changed',false); END IF;
 SELECT u.id INTO v_uid FROM booking.members m
  JOIN auth.users u ON m.auth_issuer=p_issuer
   AND u.id=CASE WHEN m.auth_subject ~ c_uuid THEN m.auth_subject::uuid END
  WHERE m.id=v_member;
 INSERT INTO booking.permission_audit(actor_id,action,target_user_id,facility_id,member_id)
  VALUES(p_actor,'revoke_operator',v_uid,v_facility,v_member);
 RETURN jsonb_build_object('changed',true);
END;
$$;
REVOKE ALL ON FUNCTION booking.admin_permissions(uuid,text,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION booking.admin_permissions(uuid,text,text,jsonb) TO book_reader;
-- No direct table grants. The first administrator is still assigned manually (docs/facility-admin.md).
COMMIT;

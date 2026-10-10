-- Apply once after 001/002, in development SQL Editor.
BEGIN;
ALTER TABLE booking.facilities
 ADD COLUMN image_url text NOT NULL DEFAULT '',
 ADD COLUMN pin_order integer CHECK (pin_order BETWEEN 1 AND 1000),
 ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
 ADD CONSTRAINT facilities_image_url CHECK (image_url = '' OR (char_length(image_url) <= 2048 AND image_url LIKE 'https://%')),
 ADD CONSTRAINT facilities_region_length CHECK (char_length(region) BETWEEN 1 AND 80),
 ADD CONSTRAINT facilities_address_length CHECK (char_length(address) BETWEEN 1 AND 300),
 ADD CONSTRAINT facilities_description_length CHECK (char_length(description) <= 3000);
CREATE TABLE booking.service_admins (
 auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE booking.facility_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 facility_id uuid NOT NULL REFERENCES booking.facilities(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK (action IN ('create','update')),
 before_data jsonb, after_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE booking.service_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.facility_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking.service_admins,booking.facility_audit FROM PUBLIC,anon,authenticated,service_role,book_reader;

-- Accessible ONLY by trusted Worker DB credentials.
-- Worker supplies the actor from validated getUser, never a request body.
CREATE FUNCTION booking.admin_facilities(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_before booking.facilities%ROWTYPE; v_after booking.facilities%ROWTYPE;
 v_rows jsonb; v_total bigint; v_page integer; v_query text; v_sport text;
BEGIN
 PERFORM 1 FROM booking.service_admins WHERE auth_user_id=p_actor AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_action='list' THEN
  v_page:=(p_data->>'page')::integer;
  v_query:=coalesce(p_data->>'q','');
  v_sport:=p_data->>'sport';
  IF v_page IS NULL OR v_page<0 OR v_page>10000 OR char_length(v_query)>160 OR
   (v_sport IS NOT NULL AND v_sport NOT IN ('golf','baseball')) THEN
   RAISE EXCEPTION 'INVALID_FILTER' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_total FROM booking.facilities f
   WHERE (v_sport IS NULL OR f.sport=v_sport)
    AND (v_query='' OR f.name ILIKE '%'||v_query||'%' OR f.region ILIKE '%'||v_query||'%');
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.pin_order ASC NULLS LAST,t.name,t.id),'[]'::jsonb)
   INTO v_rows FROM (
    SELECT * FROM booking.facilities f
     WHERE (v_sport IS NULL OR f.sport=v_sport)
      AND (v_query='' OR f.name ILIKE '%'||v_query||'%' OR f.region ILIKE '%'||v_query||'%')
     ORDER BY f.pin_order ASC NULLS LAST,f.name,f.id LIMIT 50 OFFSET v_page*50
   ) t;
  RETURN jsonb_build_object('data',v_rows,'total',v_total,'page',v_page,'pageSize',50);
 END IF;
 IF p_action NOT IN ('create','update') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_data->'published') IS DISTINCT FROM 'boolean'
  OR coalesce(p_data->>'sport','') NOT IN ('golf','baseball')
  OR char_length(coalesce(p_data->>'name','')) NOT BETWEEN 1 AND 160
  OR char_length(coalesce(p_data->>'region','')) NOT BETWEEN 1 AND 80
  OR char_length(coalesce(p_data->>'address','')) NOT BETWEEN 1 AND 300
  OR jsonb_typeof(p_data->'description') IS DISTINCT FROM 'string'
  OR jsonb_typeof(p_data->'image_url') IS DISTINCT FROM 'string' THEN
  RAISE EXCEPTION 'INVALID_FACILITY' USING ERRCODE='22023';
 END IF;
 IF p_action='create' THEN
  INSERT INTO booking.facilities(name,sport,region,address,description,published,image_url,pin_order)
   VALUES(p_data->>'name',p_data->>'sport',p_data->>'region',p_data->>'address',
    p_data->>'description',(p_data->>'published')::boolean,p_data->>'image_url',(p_data->>'pin_order')::integer)
   RETURNING * INTO v_after;
 ELSE
  SELECT * INTO v_before FROM booking.facilities WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FACILITY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF p_version IS NULL OR v_before.version<>p_version THEN
   RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF v_before.sport<>p_data->>'sport' AND EXISTS(SELECT 1 FROM booking.resources WHERE facility_id=p_id) THEN
   RAISE EXCEPTION 'SPORT_HAS_RESOURCES' USING ERRCODE='23514';
  END IF;
  UPDATE booking.facilities SET name=p_data->>'name',sport=p_data->>'sport',
   region=p_data->>'region',address=p_data->>'address',description=p_data->>'description',
   published=(p_data->>'published')::boolean,image_url=p_data->>'image_url',
   pin_order=(p_data->>'pin_order')::integer,version=version+1,updated_at=now()
   WHERE id=p_id RETURNING * INTO v_after;
 END IF;
 INSERT INTO booking.facility_audit(actor_id,facility_id,action,before_data,after_data)
  VALUES(p_actor,v_after.id,p_action,
   CASE WHEN p_action='create' THEN NULL ELSE to_jsonb(v_before) END,to_jsonb(v_after));
 RETURN jsonb_build_object('data',to_jsonb(v_after));
END;
$$;
REVOKE ALL ON FUNCTION booking.admin_facilities(uuid,text,uuid,integer,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION booking.admin_facilities(uuid,text,uuid,integer,jsonb) TO book_reader;
-- No direct table write grant and no administrator is assigned by this file.
COMMIT;

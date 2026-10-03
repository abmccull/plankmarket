-- Candidate only: drizzle/0044_role_provider_writes.sql.
-- No rewrite of the already applied local 0042 migration.
CREATE TABLE public.role_provider_writes (
  id uuid PRIMARY KEY,
  version integer NOT NULL CHECK (version > 0),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  auth_id uuid NOT NULL,
  expected_role public.user_role NOT NULL,
  activation_marker uuid,
  purpose text NOT NULL CHECK (purpose IN ('seller_activation','seller_activation_cleanup','admin_role','admin_role_repair','registration')),
  source_id uuid,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  confirmed_at timestamptz,
  CHECK (confirmed_at IS NULL OR confirmed_at >= issued_at),
  UNIQUE (user_id, version)
);
CREATE UNIQUE INDEX role_provider_one_unconfirmed_user_idx ON public.role_provider_writes(user_id) WHERE confirmed_at IS NULL;
CREATE UNIQUE INDEX role_provider_one_unconfirmed_auth_idx ON public.role_provider_writes(auth_id) WHERE confirmed_at IS NULL;
CREATE INDEX role_provider_latest_user_idx ON public.role_provider_writes(user_id, version DESC);

CREATE FUNCTION public.guard_role_provider_write() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE current_auth text; current_version integer;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Role write history cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'Role write must start unconfirmed'; END IF;
    SELECT auth_id INTO current_auth FROM public.users WHERE id=NEW.user_id FOR UPDATE;
    IF current_auth IS NULL OR current_auth<>NEW.auth_id::text THEN RAISE EXCEPTION 'Role write identity changed'; END IF;
    SELECT coalesce(max(version),0) INTO current_version FROM public.role_provider_writes WHERE user_id=NEW.user_id;
    IF NEW.version<>current_version+1 THEN RAISE EXCEPTION 'Role write version changed'; END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW)-'confirmed_at') IS DISTINCT FROM (to_jsonb(OLD)-'confirmed_at')
     OR OLD.confirmed_at IS NOT NULL OR NEW.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Role write payload is immutable; only first confirmation is allowed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER role_provider_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.role_provider_writes
FOR EACH ROW EXECUTE FUNCTION public.guard_role_provider_write();
REVOKE ALL ON FUNCTION public.guard_role_provider_write() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.role_provider_writes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.role_provider_writes FROM PUBLIC, anon, authenticated;
-- Supabase default privileges can grant ALL to service_role at CREATE TABLE.
-- Reset that ACL before narrowing it; a GRANT alone cannot remove DELETE etc.
REVOKE ALL ON public.role_provider_writes FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.role_provider_writes TO service_role;
-- Deliberately no automatic expiry, cancellation or deletion. A negative
-- read does not prove an issued remote write cannot apply later.

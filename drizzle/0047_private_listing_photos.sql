-- Additive private listing photo lifecycle. Storage bucket/policy provisioning is separate.
ALTER TABLE public.listing_form_drafts ADD CONSTRAINT listing_form_drafts_photo_lineage_unique UNIQUE(id,seller_id,generation);
CREATE TABLE public.listing_photo_uploads (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 draft_id uuid NOT NULL,
 draft_generation integer NOT NULL,
 file_name varchar(255) NOT NULL,
 file_size integer NOT NULL,
 mime_type varchar(100) NOT NULL,
 incoming_path text NOT NULL,
 frozen_path text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 ready_media_id uuid,
 ready_at timestamptz,
 content_sha256 text,
 completed_revision integer,
 deletion_requested_at timestamptz,
 deleted_at timestamptz,
 residue_last_attempt_at timestamptz,
 residue_last_success_at timestamptz,
 CONSTRAINT listing_photo_uploads_draft_owner_fk FOREIGN KEY(draft_id,owner_id,draft_generation)
  REFERENCES public.listing_form_drafts(id,seller_id,generation) ON DELETE RESTRICT,
 CONSTRAINT listing_photo_uploads_ready_media_fk FOREIGN KEY(ready_media_id) REFERENCES public.media(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT listing_photo_uploads_metadata_check CHECK(length(file_name)>0 AND file_size BETWEEN 1 AND 4194304 AND mime_type IN ('image/jpeg','image/png','image/webp')),
 CONSTRAINT listing_photo_uploads_paths_check CHECK(
  incoming_path=owner_id::text||'/incoming/'||draft_id::text||'/'||draft_generation::text||'/'||id::text
  AND frozen_path=owner_id::text||'/frozen/'||draft_id::text||'/'||draft_generation::text||'/'||id::text),
 CONSTRAINT listing_photo_uploads_expiry_check CHECK(expires_at=created_at+interval '2 hours'),
 CONSTRAINT listing_photo_uploads_ready_check CHECK(num_nonnulls(ready_media_id,ready_at,content_sha256,completed_revision)=0 OR
  (num_nonnulls(ready_media_id,ready_at,content_sha256,completed_revision)=4 AND content_sha256 ~ '^[0-9a-f]{64}$' AND completed_revision>1 AND ready_at>=created_at AND ready_at<=expires_at)),
 CONSTRAINT listing_photo_uploads_deletion_check CHECK((deletion_requested_at IS NULL AND deleted_at IS NULL) OR
  (deletion_requested_at>=created_at AND (deleted_at IS NULL OR deleted_at>=deletion_requested_at))),
 CONSTRAINT listing_photo_uploads_residue_check CHECK((residue_last_attempt_at IS NULL AND residue_last_success_at IS NULL) OR
  (deleted_at IS NOT NULL AND residue_last_attempt_at>=deleted_at AND (residue_last_success_at IS NULL OR residue_last_success_at>=deleted_at)))
);
CREATE UNIQUE INDEX listing_photo_uploads_ready_media_unique ON public.listing_photo_uploads(ready_media_id) WHERE ready_media_id IS NOT NULL;
CREATE INDEX listing_photo_uploads_owner_created_idx ON public.listing_photo_uploads(owner_id,created_at);
CREATE INDEX listing_photo_uploads_draft_outstanding_idx ON public.listing_photo_uploads(draft_id) WHERE deleted_at IS NULL;
CREATE INDEX listing_photo_uploads_cleanup_idx ON public.listing_photo_uploads(created_at,id) WHERE deleted_at IS NULL;
CREATE INDEX listing_photo_uploads_residue_idx ON public.listing_photo_uploads(residue_last_attempt_at ASC NULLS FIRST,deleted_at,id) WHERE deleted_at IS NOT NULL;
ALTER TABLE public.media ADD COLUMN storage_provider text NOT NULL DEFAULT 'uploadthing', ADD COLUMN listing_photo_upload_id uuid;
ALTER TABLE public.media ADD CONSTRAINT media_listing_photo_upload_fk FOREIGN KEY(listing_photo_upload_id) REFERENCES public.listing_photo_uploads(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.media ADD CONSTRAINT media_storage_provider_check CHECK(
 (storage_provider='uploadthing' AND listing_photo_upload_id IS NULL)
 OR (storage_provider='supabase_listing' AND listing_photo_upload_id IS NOT NULL AND key IS NULL AND buyer_request_id IS NULL AND url='/api/listing-photos/'||id::text));
CREATE UNIQUE INDEX media_listing_photo_upload_unique ON public.media(listing_photo_upload_id) WHERE listing_photo_upload_id IS NOT NULL;

CREATE FUNCTION public.guard_listing_photo_upload() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Private photo recovery ledger cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF num_nonnulls(NEW.ready_media_id,NEW.ready_at,NEW.content_sha256,NEW.completed_revision,NEW.deletion_requested_at,NEW.deleted_at,NEW.residue_last_attempt_at,NEW.residue_last_success_at)>0
   OR NEW.created_at>clock_timestamp() THEN RAISE EXCEPTION 'New photo upload must be pending' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.listing_form_drafts d JOIN public.users u ON u.id=d.seller_id
   WHERE d.id=NEW.draft_id AND d.seller_id=NEW.owner_id AND d.generation=NEW.draft_generation AND d.state='editing'
    AND u.active AND u.role IN ('seller','admin') AND NOT EXISTS(SELECT 1 FROM public.listing_form_drafts x WHERE x.seller_id=d.seller_id AND x.generation>d.generation))
   THEN RAISE EXCEPTION 'Photo requires current owned editing draft' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.deleted_at IS NOT NULL THEN
  IF (to_jsonb(NEW)-ARRAY['residue_last_attempt_at','residue_last_success_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['residue_last_attempt_at','residue_last_success_at'])
   THEN RAISE EXCEPTION 'Photo tombstone is immutable' USING ERRCODE='23514'; END IF;
  IF NEW.residue_last_attempt_at IS DISTINCT FROM OLD.residue_last_attempt_at THEN
   IF NEW.residue_last_attempt_at IS NULL OR NEW.residue_last_attempt_at<OLD.deleted_at OR NEW.residue_last_attempt_at>clock_timestamp()
    OR (OLD.residue_last_attempt_at IS NOT NULL AND NEW.residue_last_attempt_at<=OLD.residue_last_attempt_at)
    OR (OLD.residue_last_success_at IS NOT NULL AND NEW.residue_last_attempt_at<OLD.residue_last_success_at)
    OR NEW.residue_last_success_at IS DISTINCT FROM OLD.residue_last_success_at THEN RAISE EXCEPTION 'Photo residual attempt must advance separately' USING ERRCODE='23514'; END IF;
  ELSIF NEW.residue_last_success_at IS DISTINCT FROM OLD.residue_last_success_at THEN
   IF NEW.residue_last_success_at IS NULL OR NEW.residue_last_success_at IS DISTINCT FROM OLD.residue_last_attempt_at OR NEW.residue_last_success_at>clock_timestamp()
    OR (OLD.residue_last_success_at IS NOT NULL AND NEW.residue_last_success_at<=OLD.residue_last_success_at)
    THEN RAISE EXCEPTION 'Photo residual receipt needs current exact attempt' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.residue_last_attempt_at IS NOT NULL OR NEW.residue_last_success_at IS NOT NULL THEN RAISE EXCEPTION 'Photo residual work requires tombstone' USING ERRCODE='23514'; END IF;
 IF OLD.deletion_requested_at IS NOT NULL THEN
  IF (to_jsonb(NEW)-'deleted_at') IS DISTINCT FROM (to_jsonb(OLD)-'deleted_at') OR (NEW.deleted_at IS NOT NULL AND NEW.deleted_at>clock_timestamp())
   THEN RAISE EXCEPTION 'Photo deletion intent is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.deletion_requested_at IS NOT NULL THEN
  IF (to_jsonb(NEW)-'deletion_requested_at') IS DISTINCT FROM (to_jsonb(OLD)-'deletion_requested_at') OR NEW.deletion_requested_at>clock_timestamp()
   THEN RAISE EXCEPTION 'Photo intent cannot rewrite content' USING ERRCODE='23514'; END IF;
  -- No parent locks here: callers lock draft, then media, then this ledger.
  IF EXISTS(SELECT 1 FROM public.media m WHERE m.id=OLD.ready_media_id AND (m.listing_id IS NOT NULL OR m.buyer_request_id IS NOT NULL))
   OR EXISTS(SELECT 1 FROM public.dispute_evidence e WHERE e.media_id=OLD.ready_media_id)
   OR EXISTS(SELECT 1 FROM public.listing_form_drafts d WHERE d.id=OLD.draft_id AND d.state IN ('editing','published') AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.snapshot->'uploadedMediaIds') selected(value) WHERE lower(selected.value)=OLD.ready_media_id::text))
   THEN RAISE EXCEPTION 'Retained private photo prevents deletion intent' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Photo deletion requires prior intent' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['ready_media_id','ready_at','content_sha256','completed_revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['ready_media_id','ready_at','content_sha256','completed_revision'])
  OR (OLD.ready_media_id IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Photo identity and ready receipt are immutable' USING ERRCODE='23514'; END IF;
 IF NEW.ready_at IS NOT NULL AND (NEW.ready_at>clock_timestamp() OR clock_timestamp()>OLD.expires_at) THEN RAISE EXCEPTION 'Photo completion expired' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER listing_photo_uploads_guard BEFORE INSERT OR UPDATE OR DELETE ON public.listing_photo_uploads FOR EACH ROW EXECUTE FUNCTION public.guard_listing_photo_upload();

CREATE FUNCTION public.guard_private_listing_media() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE u public.listing_photo_uploads%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.storage_provider='supabase_listing' THEN RAISE EXCEPTION 'Private media recovery metadata cannot be deleted' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.storage_provider IS DISTINCT FROM OLD.storage_provider OR NEW.listing_photo_upload_id IS DISTINCT FROM OLD.listing_photo_upload_id)
  THEN RAISE EXCEPTION 'Media storage identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.storage_provider<>'supabase_listing' THEN RETURN NEW; END IF;
 SELECT * INTO u FROM public.listing_photo_uploads WHERE id=NEW.listing_photo_upload_id FOR SHARE;
 IF NOT FOUND OR NEW.uploader_id IS DISTINCT FROM u.owner_id OR NEW.file_name IS DISTINCT FROM u.file_name OR NEW.file_size IS DISTINCT FROM u.file_size OR NEW.mime_type IS DISTINCT FROM u.mime_type
  THEN RAISE EXCEPTION 'Private media must match owned upload metadata' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['listing_id','sort_order','alt_text','deletion_claim_token','deletion_claimed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['listing_id','sort_order','alt_text','deletion_claim_token','deletion_claimed_at'])
  THEN RAISE EXCEPTION 'Private media content is immutable' USING ERRCODE='23514'; END IF;
 IF u.deletion_requested_at IS NOT NULL OR u.deleted_at IS NOT NULL THEN
  IF TG_OP='INSERT' OR (to_jsonb(NEW)-ARRAY['deletion_claim_token','deletion_claimed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['deletion_claim_token','deletion_claimed_at'])
   THEN RAISE EXCEPTION 'Deleting private media cannot be adopted' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.deletion_claim_token IS NOT NULL AND NEW.deletion_claim_token<>u.id::text THEN RAISE EXCEPTION 'Private media claim must use upload identity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_listing_photo_guard BEFORE INSERT OR UPDATE OR DELETE ON public.media FOR EACH ROW EXECUTE FUNCTION public.guard_private_listing_media();

CREATE FUNCTION public.check_listing_photo_consistency() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE u public.listing_photo_uploads%ROWTYPE; m public.media%ROWTYPE; d public.listing_form_drafts%ROWTYPE; first_ready boolean:=false;
BEGIN
 IF TG_TABLE_NAME='media' THEN
  IF NEW.storage_provider<>'supabase_listing' THEN RETURN NEW; END IF;
  SELECT * INTO u FROM public.listing_photo_uploads WHERE id=NEW.listing_photo_upload_id;
 ELSE
  SELECT * INTO u FROM public.listing_photo_uploads WHERE id=NEW.id;
  IF TG_OP='UPDATE' THEN first_ready:=OLD.ready_media_id IS NULL AND NEW.ready_media_id IS NOT NULL; END IF;
 END IF;
 IF u.ready_media_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.media WHERE listing_photo_upload_id=u.id) THEN RAISE EXCEPTION 'Pending upload cannot have ready media' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO m FROM public.media WHERE id=u.ready_media_id;
 IF NOT FOUND OR m.storage_provider<>'supabase_listing' OR m.listing_photo_upload_id IS DISTINCT FROM u.id OR m.uploader_id IS DISTINCT FROM u.owner_id
  OR m.file_name IS DISTINCT FROM u.file_name OR m.file_size IS DISTINCT FROM u.file_size OR m.mime_type IS DISTINCT FROM u.mime_type
  OR m.deletion_claim_token IS DISTINCT FROM (CASE WHEN u.deletion_requested_at IS NULL THEN NULL ELSE u.id::text END)
  OR m.deletion_claimed_at IS DISTINCT FROM u.deletion_requested_at THEN RAISE EXCEPTION 'Private photo receipt and media must agree' USING ERRCODE='23514'; END IF;
 SELECT * INTO d FROM public.listing_form_drafts WHERE id=u.draft_id;
 IF first_ready THEN
  IF d.state<>'editing' OR d.revision<>u.completed_revision OR d.last_save_operation_id<>u.id
   OR NOT (EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.snapshot->'uploadedMediaIds') selected(value) WHERE lower(selected.value)=m.id::text))
   OR EXISTS(SELECT 1 FROM public.listing_form_drafts x WHERE x.seller_id=u.owner_id AND x.generation>u.draft_generation)
   OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=u.owner_id AND active AND role IN ('seller','admin'))
   THEN RAISE EXCEPTION 'Ready receipt requires atomic original draft attachment' USING ERRCODE='23514'; END IF;
 END IF;
 IF m.listing_id IS NOT NULL AND (d.state<>'published' OR d.published_listing_id IS DISTINCT FROM m.listing_id OR NOT(EXISTS(SELECT 1 FROM jsonb_array_elements_text(d.snapshot->'uploadedMediaIds') selected(value) WHERE lower(selected.value)=m.id::text)))
  THEN RAISE EXCEPTION 'Private media listing must match original published selection' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER listing_photo_ready_consistency AFTER INSERT OR UPDATE ON public.listing_photo_uploads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_listing_photo_consistency();
CREATE CONSTRAINT TRIGGER media_listing_photo_consistency AFTER INSERT OR UPDATE ON public.media DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_listing_photo_consistency();

CREATE FUNCTION public.guard_listing_draft_private_photos() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE m public.media%ROWTYPE; u public.listing_photo_uploads%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.listing_photo_uploads WHERE draft_id=OLD.id) THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.generation IS DISTINCT FROM OLD.generation OR NEW.created_at IS DISTINCT FROM OLD.created_at
   THEN RAISE EXCEPTION 'Photo draft identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state='published' AND (to_jsonb(NEW)-ARRAY['revision','next_draft_id','advance_operation_id','advance_fingerprint','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','next_draft_id','advance_operation_id','advance_fingerprint','updated_at'])
   THEN RAISE EXCEPTION 'Original published photo snapshot is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 -- Deterministic media -> ledger locks serialize new retention against intent.
 FOR m IN SELECT * FROM public.media WHERE storage_provider='supabase_listing'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.snapshot->'uploadedMediaIds') selected(value) WHERE lower(selected.value)=media.id::text) ORDER BY id FOR SHARE LOOP
  SELECT * INTO u FROM public.listing_photo_uploads WHERE id=m.listing_photo_upload_id FOR SHARE;
  IF u.owner_id IS DISTINCT FROM NEW.seller_id OR u.draft_id IS DISTINCT FROM NEW.id OR u.draft_generation IS DISTINCT FROM NEW.generation
   OR u.ready_media_id IS DISTINCT FROM m.id OR u.deletion_requested_at IS NOT NULL OR u.deleted_at IS NOT NULL OR m.deletion_claim_token IS NOT NULL
   THEN RAISE EXCEPTION 'Draft selection requires its own available private photo' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER listing_drafts_private_photo_guard BEFORE INSERT OR UPDATE ON public.listing_form_drafts FOR EACH ROW EXECUTE FUNCTION public.guard_listing_draft_private_photos();

CREATE FUNCTION public.guard_dispute_private_listing_photo() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE m public.media%ROWTYPE; u public.listing_photo_uploads%ROWTYPE;
BEGIN
 SELECT * INTO m FROM public.media WHERE id=NEW.media_id FOR SHARE;
 IF m.storage_provider='supabase_listing' THEN
  SELECT * INTO u FROM public.listing_photo_uploads WHERE id=m.listing_photo_upload_id FOR SHARE;
  IF u.ready_media_id IS DISTINCT FROM m.id OR u.deletion_requested_at IS NOT NULL OR u.deleted_at IS NOT NULL OR m.deletion_claim_token IS NOT NULL
   THEN RAISE EXCEPTION 'Unavailable private photo cannot become evidence' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dispute_evidence_private_photo_guard BEFORE INSERT OR UPDATE OF media_id ON public.dispute_evidence FOR EACH ROW EXECUTE FUNCTION public.guard_dispute_private_listing_photo();
ALTER TABLE public.listing_photo_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_photo_uploads FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_listing_photo_upload(),public.guard_private_listing_media(),public.check_listing_photo_consistency(),public.guard_listing_draft_private_photos(),public.guard_dispute_private_listing_photo() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON public.listing_photo_uploads FROM %I',r);
  EXECUTE format('REVOKE ALL ON FUNCTION public.guard_listing_photo_upload(),public.guard_private_listing_media(),public.check_listing_photo_consistency(),public.guard_listing_draft_private_photos(),public.guard_dispute_private_listing_photo() FROM %I',r);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT SELECT,INSERT,UPDATE ON public.listing_photo_uploads TO service_role; END IF;
END $$;
COMMENT ON TABLE public.listing_photo_uploads IS 'Private listing photo intent, immutable ready receipt and durable late-byte cleanup metadata; service only.';
COMMENT ON TABLE public.listing_form_drafts IS 'Private seller forms and immutable published snapshots for private photo lineage. Selected private photos are retention claims; legacy UploadThing references retain existing behavior.';

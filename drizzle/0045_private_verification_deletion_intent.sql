-- Durable recovery metadata only. Do not backfill or delete existing evidence.
ALTER TABLE public.verification_documents ADD COLUMN deletion_requested_at timestamptz;
ALTER TABLE public.verification_documents ADD CONSTRAINT verification_documents_deletion_time_check
 CHECK (deletion_requested_at IS NULL OR (deletion_requested_at >= created_at AND (deleted_at IS NULL OR deleted_at >= deletion_requested_at)));
CREATE INDEX verification_documents_pending_deletion_idx ON public.verification_documents(deletion_requested_at)
 WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL;

-- Document-only lock path. Attachment/refresh writers take SHARE on this row;
-- eligibility reads must never lock users, drafts, applications or certificates.
CREATE FUNCTION public.protect_private_verification_deletion() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE canonical_reference text;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Private document recovery metadata cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.deletion_requested_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'New private documents cannot start in deletion state' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
  RAISE EXCEPTION 'Private document tombstone is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.deletion_requested_at IS NOT NULL THEN
  IF NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at
   OR (to_jsonb(NEW)-'deleted_at') IS DISTINCT FROM (to_jsonb(OLD)-'deleted_at') THEN
   RAISE EXCEPTION 'Private document deletion intent and content metadata are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND (NEW.deleted_at IS NULL OR NEW.deleted_at>clock_timestamp()) THEN
   RAISE EXCEPTION 'Private document tombstone must record confirmed deletion time' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.deletion_requested_at IS NOT NULL THEN
  IF OLD.deleted_at IS NOT NULL OR NEW.deletion_requested_at>clock_timestamp()
   OR (to_jsonb(NEW)-'deletion_requested_at') IS DISTINCT FROM (to_jsonb(OLD)-'deletion_requested_at') THEN
   RAISE EXCEPTION 'Deletion intent must preserve the current undeleted document' USING ERRCODE='23514';
  END IF;
  canonical_reference:='verification-document:'||OLD.id::text;
  IF EXISTS(SELECT 1 FROM public.resale_certificates WHERE document_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.users WHERE lower(verification_doc_url)=canonical_reference
    AND (verification_data_purge_after IS NULL OR verification_data_purge_after>now()))
   OR EXISTS(SELECT 1 FROM public.verification_drafts WHERE lower(verification_doc_url)=canonical_reference
    AND (purge_after IS NULL OR purge_after>now()))
   OR EXISTS(SELECT 1 FROM public.seller_activation_requests WHERE document_id=OLD.id
    AND (purge_after>now() OR NOT (status IN ('stale','rejected') OR status='approved' AND sync_state='complete'))) THEN
   RAISE EXCEPTION 'A retained private reference prevents deletion intent' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
  RAISE EXCEPTION 'Private document deletion requires an existing durable intent' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER verification_documents_deletion_intent_guard BEFORE INSERT OR UPDATE OR DELETE
 ON public.verification_documents FOR EACH ROW EXECUTE FUNCTION public.protect_private_verification_deletion();

-- Keep the established user/draft ownership guard and SHARE lock. Every accepted
-- case-insensitive private reference now also requires no deletion intent.
CREATE OR REPLACE FUNCTION public.enforce_private_verification_document() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE document_id uuid; owner_id uuid; matched uuid;
BEGIN
 IF NEW.verification_doc_url IS NULL OR NEW.verification_doc_url NOT ILIKE 'verification-document:%' THEN RETURN NEW; END IF;
 IF NEW.verification_doc_url !~* '^verification-document:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Invalid private verification document reference' USING ERRCODE='23514';
 END IF;
 document_id:=substring(NEW.verification_doc_url from 23)::uuid;
 IF TG_TABLE_NAME='users' THEN owner_id:=NEW.id; ELSE owner_id:=NEW.user_id; END IF;
 SELECT id INTO matched FROM public.verification_documents
 WHERE id=document_id AND user_id=owner_id AND ready_at IS NOT NULL AND deleted_at IS NULL AND deletion_requested_at IS NULL FOR SHARE;
 IF matched IS NULL THEN
  RAISE EXCEPTION 'Private verification document unavailable or owner mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;

-- These triggers sort AFTER the existing retention-default BEFORE triggers.
-- Inspect effective deadlines, including EIN and updated_at driven refreshes.
CREATE FUNCTION public.prevent_private_verification_retention_refresh() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE evidence record; document_id uuid; old_deadline timestamptz; new_deadline timestamptz;
BEGIN
 IF NEW.verification_doc_url IS NULL OR NEW.verification_doc_url !~* '^verification-document:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NEW; END IF;
 document_id:=substring(NEW.verification_doc_url from 23)::uuid;
 SELECT deletion_requested_at INTO evidence FROM public.verification_documents WHERE id=document_id FOR SHARE;
 IF NOT FOUND OR evidence.deletion_requested_at IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  RAISE EXCEPTION 'Deleting private documents cannot be attached' USING ERRCODE='23514';
 END IF;
 IF lower(NEW.verification_doc_url) IS DISTINCT FROM lower(OLD.verification_doc_url) THEN
  RAISE EXCEPTION 'Deleting private documents cannot be attached' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='users' THEN
  old_deadline:=OLD.verification_data_purge_after; new_deadline:=NEW.verification_data_purge_after;
 ELSE
  old_deadline:=OLD.purge_after; new_deadline:=NEW.purge_after;
 END IF;
 IF old_deadline IS NULL OR new_deadline IS NULL OR new_deadline>old_deadline OR new_deadline>now()
  OR (NEW.ein_tax_id IS NOT NULL AND NEW.ein_tax_id IS DISTINCT FROM OLD.ein_tax_id) THEN
  RAISE EXCEPTION 'Deleting private evidence cannot be refreshed or retained longer' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER zz_users_private_verification_deletion_intent BEFORE INSERT OR UPDATE ON public.users
 FOR EACH ROW EXECUTE FUNCTION public.prevent_private_verification_retention_refresh();
CREATE TRIGGER zz_verification_drafts_private_verification_deletion_intent BEFORE INSERT OR UPDATE ON public.verification_drafts
 FOR EACH ROW EXECUTE FUNCTION public.prevent_private_verification_retention_refresh();

-- Supplemental guards avoid replacing the independent activation state machine.
CREATE FUNCTION public.assert_private_document_not_deleting() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE intent_at timestamptz;
BEGIN
 IF NEW.document_id IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='seller_activation_requests' AND TG_OP='UPDATE' THEN
  IF NEW.document_id IS NOT DISTINCT FROM OLD.document_id
   AND NOT (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('pending','approved'))
   AND NOT (NEW.status='approved' AND NEW.sync_state='complete' AND OLD.sync_state<>'complete') THEN RETURN NEW; END IF;
 END IF;
 SELECT deletion_requested_at INTO intent_at FROM public.verification_documents WHERE id=NEW.document_id FOR SHARE;
 IF intent_at IS NOT NULL THEN
  RAISE EXCEPTION 'Deleting private documents cannot be attached or approved' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER seller_activation_deletion_intent_guard BEFORE INSERT OR UPDATE ON public.seller_activation_requests
 FOR EACH ROW EXECUTE FUNCTION public.assert_private_document_not_deleting();
CREATE TRIGGER resale_certificate_deletion_intent_guard BEFORE INSERT OR UPDATE ON public.resale_certificates
 FOR EACH ROW EXECUTE FUNCTION public.assert_private_document_not_deleting();

-- Referenced activation content stays immutable. The only extra transitions are
-- eligible marker creation and its later tombstone; the general guard checks all
-- reference kinds and forbids any simultaneous content/identity mutation.
CREATE OR REPLACE FUNCTION public.protect_activation_document_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_activation_requests WHERE document_id=OLD.id) THEN
  IF TG_OP='UPDATE' AND OLD.deleted_at IS NULL
   AND (to_jsonb(NEW)-ARRAY['deleted_at','deletion_requested_at'])=(to_jsonb(OLD)-ARRAY['deleted_at','deletion_requested_at'])
   AND ((OLD.deletion_requested_at IS NULL AND NEW.deletion_requested_at IS NOT NULL AND NEW.deleted_at IS NULL)
    OR (OLD.deletion_requested_at IS NOT NULL AND NEW.deletion_requested_at=OLD.deletion_requested_at AND NEW.deleted_at IS NOT NULL AND NEW.deleted_at<=clock_timestamp()))
   AND NOT EXISTS(SELECT 1 FROM public.seller_activation_requests WHERE document_id=OLD.id
    AND (purge_after>now() OR NOT (status IN ('stale','rejected') OR status='approved' AND sync_state='complete'))) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Referenced seller activation evidence permits only its due deletion intent and tombstone' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_private_verification_deletion(), public.prevent_private_verification_retention_refresh(), public.assert_private_document_not_deleting(), public.enforce_private_verification_document(), public.protect_activation_document_reference() FROM PUBLIC,anon,authenticated;

-- Revisit bytes arriving after a tombstone without reopening private evidence.
-- Existing rows keep null operational receipts; no data backfill or intent reset.
ALTER TABLE public.verification_documents
 ADD COLUMN residue_last_attempt_at timestamptz,
 ADD COLUMN residue_last_success_at timestamptz;
ALTER TABLE public.verification_documents ADD CONSTRAINT verification_documents_residue_state_check
 CHECK ((residue_last_attempt_at IS NULL AND residue_last_success_at IS NULL)
  OR (deleted_at IS NOT NULL AND residue_last_attempt_at IS NOT NULL AND residue_last_attempt_at>=deleted_at
   AND (residue_last_success_at IS NULL OR residue_last_success_at>=deleted_at)));
CREATE INDEX verification_documents_residue_queue_idx
 ON public.verification_documents(residue_last_attempt_at ASC NULLS FIRST,deleted_at,id)
 WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_private_verification_deletion() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE canonical_reference text;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Private document recovery metadata cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.deletion_requested_at IS NOT NULL OR NEW.deleted_at IS NOT NULL
   OR NEW.residue_last_attempt_at IS NOT NULL OR NEW.residue_last_success_at IS NOT NULL THEN
   RAISE EXCEPTION 'New private documents cannot start in deletion state' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 -- Only operational receipts can change on an existing tombstone, including
 -- legacy tombstones which correctly have no fabricated deletion intent.
 IF OLD.deleted_at IS NOT NULL THEN
  IF (to_jsonb(NEW)-ARRAY['residue_last_attempt_at','residue_last_success_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['residue_last_attempt_at','residue_last_success_at']) THEN
   RAISE EXCEPTION 'Private document tombstone and content metadata are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.residue_last_attempt_at IS DISTINCT FROM OLD.residue_last_attempt_at THEN
   IF NEW.residue_last_attempt_at IS NULL OR NEW.residue_last_attempt_at<OLD.deleted_at
    OR NEW.residue_last_attempt_at>clock_timestamp()
    OR (OLD.residue_last_attempt_at IS NOT NULL AND NEW.residue_last_attempt_at<=OLD.residue_last_attempt_at)
    OR (OLD.residue_last_success_at IS NOT NULL AND NEW.residue_last_attempt_at<OLD.residue_last_success_at)
    OR NEW.residue_last_success_at IS DISTINCT FROM OLD.residue_last_success_at THEN
    RAISE EXCEPTION 'Residual deletion attempt must advance separately from its receipt' USING ERRCODE='23514';
   END IF;
  ELSIF NEW.residue_last_success_at IS DISTINCT FROM OLD.residue_last_success_at THEN
   IF OLD.residue_last_attempt_at IS NULL OR NEW.residue_last_success_at IS NULL
    OR NEW.residue_last_success_at<OLD.residue_last_attempt_at
    OR NEW.residue_last_success_at>clock_timestamp()
    OR (OLD.residue_last_success_at IS NOT NULL AND NEW.residue_last_success_at<=OLD.residue_last_success_at) THEN
    RAISE EXCEPTION 'Residual deletion receipt requires a current unchanged attempt' USING ERRCODE='23514';
   END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.residue_last_attempt_at IS NOT NULL OR NEW.residue_last_success_at IS NOT NULL THEN
  RAISE EXCEPTION 'Residual deletion receipts require an existing tombstone' USING ERRCODE='23514';
 END IF;
 -- The original0045 live-document deletion protocol is preserved below.
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

CREATE OR REPLACE FUNCTION public.protect_activation_document_reference() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
 -- The general document guard validates monotonic operational timestamps.
 -- This exception preserves every other field and takes no parent row lock.
 IF TG_OP='UPDATE' AND OLD.deleted_at IS NOT NULL
  AND (to_jsonb(NEW)-ARRAY['residue_last_attempt_at','residue_last_success_at'])
   IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['residue_last_attempt_at','residue_last_success_at']) THEN RETURN NEW; END IF;
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
REVOKE ALL ON FUNCTION public.protect_private_verification_deletion(), public.protect_activation_document_reference() FROM PUBLIC,anon,authenticated;

-- Additive seller activation evidence and receipts. No existing user authority changes.
ALTER TABLE public.verification_documents DROP CONSTRAINT verification_documents_purpose_check;
ALTER TABLE public.verification_documents ADD CONSTRAINT verification_documents_purpose_check
 CHECK (purpose IN ('business_verification','resale_certificate','seller_activation'));

CREATE TABLE public.seller_activation_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 revision integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'draft',
 sync_state text NOT NULL DEFAULT 'none',
 policy_version text NOT NULL DEFAULT 'seller-activation-v1',
 create_fingerprint text NOT NULL,
 last_save_fingerprint text NOT NULL,
 business_website text,
 ein_tax_id text,
 document_id uuid REFERENCES public.verification_documents(id) ON DELETE RESTRICT,
 identity_snapshot jsonb,
 identity_fingerprint text,
 submission_fingerprint text,
 source_verification_submission_id uuid,
 submitted_at timestamptz,
 submitted_revision integer,
 ein_last_4 varchar(4),
 reviewed_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
 reviewed_at timestamptz,
 review_request_id uuid,
 review_fingerprint text,
 review_note text,
 review_decision text,
 reviewed_revision integer,
 activation_operation_id uuid,
 claim_token uuid,
 claim_expires_at timestamptz,
 attempt_count integer NOT NULL DEFAULT 0,
 last_error_code varchar(100),
 activated_at timestamptz,
 purge_after timestamptz NOT NULL DEFAULT (now()+interval '30 days'),
 evidence_purged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT seller_activation_revision_check CHECK (revision>0 AND attempt_count>=0 AND (submitted_revision IS NULL OR submitted_revision>0 AND submitted_revision<revision) AND (reviewed_revision IS NULL OR reviewed_revision>submitted_revision AND reviewed_revision<revision)),
 CONSTRAINT seller_activation_state_check CHECK (status IN ('draft','pending','approved','rejected','stale') AND sync_state IN ('none','pending','in_progress','uncertain','complete','blocked','cancelled')
  AND (status NOT IN ('draft','pending','rejected') OR sync_state='none')
  AND (status<>'approved' OR sync_state<>'none')),
 CONSTRAINT seller_activation_fingerprint_check CHECK (create_fingerprint ~ '^[0-9a-f]{64}$' AND last_save_fingerprint ~ '^[0-9a-f]{64}$'
  AND (identity_fingerprint IS NULL OR identity_fingerprint ~ '^[0-9a-f]{64}$') AND (submission_fingerprint IS NULL OR submission_fingerprint ~ '^[0-9a-f]{64}$')
  AND (review_fingerprint IS NULL OR review_fingerprint ~ '^[0-9a-f]{64}$') AND length(trim(policy_version)) BETWEEN 1 AND 64),
 CONSTRAINT seller_activation_draft_fields_check CHECK ((business_website IS NULL OR length(business_website)<=2048) AND (ein_tax_id IS NULL OR length(ein_tax_id)<=11) AND (ein_last_4 IS NULL OR ein_last_4 ~ '^[0-9]{4}$') AND (last_error_code IS NULL OR last_error_code ~ '^[A-Za-z][A-Za-z0-9_.:-]{0,99}$')),
 CONSTRAINT seller_activation_submission_check CHECK (coalesce(
  (num_nonnulls(submitted_at,submitted_revision,identity_snapshot,identity_fingerprint,submission_fingerprint)=0 AND status IN ('draft','stale') AND source_verification_submission_id IS NULL)
  OR (num_nonnulls(submitted_at,submitted_revision,identity_snapshot,identity_fingerprint,submission_fingerprint)=5 AND status<>'draft' AND length(trim(business_website))>0),false)),
 CONSTRAINT seller_activation_identity_snapshot_check CHECK (identity_snapshot IS NULL OR coalesce(
  jsonb_typeof(identity_snapshot)='object'
  AND identity_snapshot ?& ARRAY['businessName','businessAddress','businessCity','businessState','businessZip','authId','sourceVerificationSubmissionId']
  AND identity_snapshot-ARRAY['businessName','businessAddress','businessCity','businessState','businessZip','authId','sourceVerificationSubmissionId']='{}'::jsonb
  AND jsonb_typeof(identity_snapshot->'businessName')='string' AND length(trim(identity_snapshot->>'businessName')) BETWEEN 2 AND 255
  AND jsonb_typeof(identity_snapshot->'businessAddress')='string' AND length(trim(identity_snapshot->>'businessAddress')) BETWEEN 1 AND 500
  AND jsonb_typeof(identity_snapshot->'businessCity')='string' AND length(trim(identity_snapshot->>'businessCity')) BETWEEN 1 AND 100
  AND jsonb_typeof(identity_snapshot->'businessState')='string' AND length(identity_snapshot->>'businessState')=2
  AND jsonb_typeof(identity_snapshot->'businessZip')='string' AND length(identity_snapshot->>'businessZip') BETWEEN 5 AND 10
  AND jsonb_typeof(identity_snapshot->'authId')='string' AND (identity_snapshot->>'authId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND identity_snapshot->'sourceVerificationSubmissionId'=coalesce(to_jsonb(source_verification_submission_id),'null'::jsonb)
  AND octet_length(identity_snapshot::text)<=8192,false)),
 CONSTRAINT seller_activation_review_check CHECK (coalesce(
  (num_nonnulls(reviewed_by,reviewed_at,review_request_id,review_fingerprint,review_note,review_decision,reviewed_revision)=0 AND status IN ('draft','pending','stale'))
  OR (num_nonnulls(reviewed_by,reviewed_at,review_request_id,review_fingerprint,review_note,review_decision,reviewed_revision)=7 AND submitted_at IS NOT NULL AND reviewed_by<>user_id AND length(trim(review_note))>0
   AND ((review_decision='approved' AND status IN ('approved','stale')) OR (review_decision='rejected' AND status='rejected'))),false)),
 CONSTRAINT seller_activation_sync_check CHECK (coalesce(
  ((activation_operation_id IS NULL AND sync_state='none') OR (activation_operation_id IS NOT NULL AND review_decision='approved' AND status IN ('approved','stale') AND sync_state<>'none'))
  AND ((sync_state='in_progress' AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL AND attempt_count>0) OR (sync_state<>'in_progress' AND claim_token IS NULL AND claim_expires_at IS NULL))
  AND ((sync_state='complete' AND status='approved' AND activated_at IS NOT NULL) OR (sync_state<>'complete' AND activated_at IS NULL))
  AND (sync_state<>'cancelled' OR status='stale' AND review_decision='approved' AND activation_operation_id IS NOT NULL AND claim_token IS NULL AND claim_expires_at IS NULL AND activated_at IS NULL),false)),
 CONSTRAINT seller_activation_time_check CHECK (updated_at>=created_at AND purge_after>=created_at AND purge_after<=created_at+interval '30 days'
  AND (submitted_at IS NULL OR submitted_at>=created_at) AND (reviewed_at IS NULL OR reviewed_at>=submitted_at)
  AND (activated_at IS NULL OR activated_at>=reviewed_at) AND (claim_expires_at IS NULL OR claim_expires_at>=reviewed_at)
  AND (evidence_purged_at IS NULL OR evidence_purged_at>=purge_after)),
 CONSTRAINT seller_activation_purged_fields_check CHECK (evidence_purged_at IS NULL OR (ein_tax_id IS NULL AND ein_last_4 IS NULL AND document_id IS NULL AND (status IN ('rejected','stale') OR status='approved' AND sync_state='complete')))
);
CREATE UNIQUE INDEX seller_activation_user_request_idx ON public.seller_activation_requests(user_id,request_id);
CREATE UNIQUE INDEX seller_activation_one_outstanding_idx ON public.seller_activation_requests(user_id)
 WHERE status IN ('draft','pending') OR status='approved' AND sync_state<>'complete' OR status='stale' AND sync_state IN ('pending','in_progress','uncertain','blocked');
CREATE UNIQUE INDEX seller_activation_review_request_idx ON public.seller_activation_requests(reviewed_by,review_request_id) WHERE review_request_id IS NOT NULL;
CREATE UNIQUE INDEX seller_activation_operation_idx ON public.seller_activation_requests(activation_operation_id) WHERE activation_operation_id IS NOT NULL;
CREATE INDEX seller_activation_queue_idx ON public.seller_activation_requests(status,sync_state,created_at);
CREATE INDEX seller_activation_user_created_idx ON public.seller_activation_requests(user_id,created_at);
CREATE INDEX seller_activation_purge_idx ON public.seller_activation_requests(purge_after) WHERE evidence_purged_at IS NULL;
CREATE INDEX seller_activation_document_idx ON public.seller_activation_requests(document_id) WHERE document_id IS NOT NULL;
ALTER TABLE public.seller_activation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.seller_activation_requests FROM PUBLIC;
DO $$ DECLARE target_role text; BEGIN
 FOR target_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES ON public.seller_activation_requests FROM %I',target_role);
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  REVOKE ALL PRIVILEGES ON public.seller_activation_requests FROM service_role;
  GRANT SELECT,INSERT,UPDATE ON public.seller_activation_requests TO service_role;
 END IF;
END $$;

CREATE FUNCTION public.protect_seller_activation_request() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE purge_transition boolean:=false; content_changed boolean; evidence record; prior_deadline timestamptz;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Seller activation history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.sync_state<>'none' OR NEW.revision<>1 OR NEW.attempt_count<>0 OR NEW.evidence_purged_at IS NOT NULL THEN
   RAISE EXCEPTION 'A new seller activation must start as a draft' USING ERRCODE='23514';
  END IF;
 ELSE
  IF (NEW.id,NEW.user_id,NEW.request_id,NEW.created_at,NEW.create_fingerprint,NEW.policy_version) IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.request_id,OLD.created_at,OLD.create_fingerprint,OLD.policy_version) THEN
   RAISE EXCEPTION 'Seller activation identity and create receipt are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.purge_after>OLD.purge_after THEN RAISE EXCEPTION 'Seller activation evidence retention cannot be extended' USING ERRCODE='23514'; END IF;
  IF OLD.evidence_purged_at IS NOT NULL AND (NEW.evidence_purged_at,NEW.ein_tax_id,NEW.ein_last_4,NEW.document_id) IS DISTINCT FROM (OLD.evidence_purged_at,OLD.ein_tax_id,OLD.ein_last_4,OLD.document_id) THEN
   RAISE EXCEPTION 'Purged seller activation evidence cannot be restored or rewritten' USING ERRCODE='23514';
  END IF;
  purge_transition:=OLD.evidence_purged_at IS NULL AND NEW.evidence_purged_at IS NOT NULL;
  IF purge_transition AND (OLD.purge_after>now() OR NEW.evidence_purged_at<OLD.purge_after OR NEW.evidence_purged_at>clock_timestamp() OR NEW.ein_tax_id IS NOT NULL OR NEW.ein_last_4 IS NOT NULL OR NEW.document_id IS NOT NULL
    OR (OLD.status IN ('draft','pending') AND NEW.status<>'stale')
    OR (OLD.status='approved' AND OLD.sync_state<>'complete' AND (NEW.status<>'stale' OR NEW.sync_state<>'blocked' OR NEW.claim_token IS NOT NULL OR NEW.claim_expires_at IS NOT NULL))
    OR (OLD.status='approved' AND OLD.sync_state='complete' AND (NEW.status<>'approved' OR NEW.sync_state<>'complete'))) THEN
   RAISE EXCEPTION 'Evidence purge requires due state and preserves the decision' USING ERRCODE='23514';
  END IF;
  IF purge_transition AND (NEW.business_website,NEW.last_save_fingerprint,NEW.identity_snapshot,NEW.identity_fingerprint,NEW.submission_fingerprint,NEW.source_verification_submission_id,NEW.submitted_at,NEW.submitted_revision,NEW.reviewed_by,NEW.reviewed_at,NEW.review_request_id,NEW.review_fingerprint,NEW.review_note,NEW.review_decision,NEW.reviewed_revision,NEW.activation_operation_id,NEW.attempt_count,NEW.activated_at,NEW.last_error_code)
   IS DISTINCT FROM (OLD.business_website,OLD.last_save_fingerprint,OLD.identity_snapshot,OLD.identity_fingerprint,OLD.submission_fingerprint,OLD.source_verification_submission_id,OLD.submitted_at,OLD.submitted_revision,OLD.reviewed_by,OLD.reviewed_at,OLD.review_request_id,OLD.review_fingerprint,OLD.review_note,OLD.review_decision,OLD.reviewed_revision,OLD.activation_operation_id,OLD.attempt_count,OLD.activated_at,OLD.last_error_code) THEN
   RAISE EXCEPTION 'Purge cannot rewrite non-sensitive history' USING ERRCODE='23514';
  END IF;
  IF OLD.submitted_at IS NOT NULL THEN
   IF (NEW.business_website,NEW.identity_snapshot,NEW.identity_fingerprint,NEW.submission_fingerprint,NEW.source_verification_submission_id,NEW.submitted_at,NEW.submitted_revision,NEW.last_save_fingerprint)
    IS DISTINCT FROM (OLD.business_website,OLD.identity_snapshot,OLD.identity_fingerprint,OLD.submission_fingerprint,OLD.source_verification_submission_id,OLD.submitted_at,OLD.submitted_revision,OLD.last_save_fingerprint)
    OR (NOT purge_transition AND (NEW.ein_tax_id,NEW.ein_last_4,NEW.document_id) IS DISTINCT FROM (OLD.ein_tax_id,OLD.ein_last_4,OLD.document_id)) THEN
    RAISE EXCEPTION 'Submitted seller activation evidence is immutable' USING ERRCODE='23514';
   END IF;
  END IF;
  IF OLD.reviewed_at IS NOT NULL AND (NEW.reviewed_by,NEW.reviewed_at,NEW.review_request_id,NEW.review_fingerprint,NEW.review_note,NEW.review_decision,NEW.reviewed_revision)
   IS DISTINCT FROM (OLD.reviewed_by,OLD.reviewed_at,OLD.review_request_id,OLD.review_fingerprint,OLD.review_note,OLD.review_decision,OLD.reviewed_revision) THEN
   RAISE EXCEPTION 'Seller activation review receipt is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.activation_operation_id IS NOT NULL AND NEW.activation_operation_id IS DISTINCT FROM OLD.activation_operation_id THEN RAISE EXCEPTION 'Activation operation is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.activated_at IS NOT NULL AND (NEW.status,NEW.sync_state,NEW.activated_at) IS DISTINCT FROM (OLD.status,OLD.sync_state,OLD.activated_at) THEN RAISE EXCEPTION 'Completed activation cannot be reopened' USING ERRCODE='23514'; END IF;
  IF OLD.sync_state IN ('complete','cancelled') AND NEW.sync_state<>OLD.sync_state THEN RAISE EXCEPTION 'Terminal synchronization cannot be reopened' USING ERRCODE='23514'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='draft' AND NEW.status IN ('pending','stale')) OR (OLD.status='pending' AND NEW.status IN ('approved','rejected','stale')) OR (OLD.status='approved' AND OLD.sync_state<>'complete' AND NEW.status='stale')) THEN
   RAISE EXCEPTION 'Invalid seller activation status transition' USING ERRCODE='23514';
  END IF;
  IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at AND (OLD.status<>'draft' OR NEW.status<>'pending' OR NEW.submitted_revision<>OLD.revision) THEN RAISE EXCEPTION 'Submission receipt requires the accepted draft revision' USING ERRCODE='23514'; END IF;
  IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at AND (OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected') OR NEW.reviewed_revision<>OLD.revision) THEN RAISE EXCEPTION 'Review receipt requires the accepted pending revision' USING ERRCODE='23514'; END IF;
  IF NEW.attempt_count<OLD.attempt_count THEN RAISE EXCEPTION 'Sync attempt count cannot decrease' USING ERRCODE='23514'; END IF;
  IF NEW.claim_token IS DISTINCT FROM OLD.claim_token AND NEW.claim_token IS NOT NULL THEN
   IF NEW.sync_state<>'in_progress' OR NEW.claim_expires_at<=now() OR NEW.attempt_count<>OLD.attempt_count+1 OR (OLD.claim_token IS NOT NULL AND OLD.claim_expires_at>now()) THEN RAISE EXCEPTION 'Invalid or overlapping activation claim' USING ERRCODE='23514'; END IF;
  ELSIF NEW.attempt_count<>OLD.attempt_count THEN RAISE EXCEPTION 'Only a new fenced claim advances attempts' USING ERRCODE='23514'; END IF;
  IF NEW.claim_token IS NOT DISTINCT FROM OLD.claim_token AND NEW.claim_expires_at IS DISTINCT FROM OLD.claim_expires_at THEN RAISE EXCEPTION 'A claim deadline cannot be rewritten' USING ERRCODE='23514'; END IF;
  IF NEW.sync_state IN ('complete','cancelled') AND OLD.sync_state<>NEW.sync_state AND (OLD.sync_state<>'in_progress' OR OLD.claim_token IS NULL OR OLD.claim_expires_at<=now()) THEN RAISE EXCEPTION 'Terminal synchronization requires a current fenced claim' USING ERRCODE='23514'; END IF;
  IF NEW.status='approved' AND (NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.sync_state='complete' AND OLD.sync_state<>'complete') AND (NEW.purge_after<=now() OR NEW.evidence_purged_at IS NOT NULL OR NEW.document_id IS NULL OR NEW.ein_last_4 IS NULL) THEN
   RAISE EXCEPTION 'Approval and activation require current unpurged evidence' USING ERRCODE='23514';
  END IF;
  content_changed:=(NEW.status,NEW.business_website,NEW.last_save_fingerprint,NEW.identity_snapshot,NEW.identity_fingerprint,NEW.submission_fingerprint,NEW.source_verification_submission_id,NEW.submitted_at,NEW.submitted_revision,NEW.reviewed_by,NEW.reviewed_at,NEW.review_request_id,NEW.review_fingerprint,NEW.review_note,NEW.review_decision,NEW.reviewed_revision)
   IS DISTINCT FROM (OLD.status,OLD.business_website,OLD.last_save_fingerprint,OLD.identity_snapshot,OLD.identity_fingerprint,OLD.submission_fingerprint,OLD.source_verification_submission_id,OLD.submitted_at,OLD.submitted_revision,OLD.reviewed_by,OLD.reviewed_at,OLD.review_request_id,OLD.review_fingerprint,OLD.review_note,OLD.review_decision,OLD.reviewed_revision)
   OR (NOT purge_transition AND (NEW.ein_tax_id,NEW.ein_last_4,NEW.document_id) IS DISTINCT FROM (OLD.ein_tax_id,OLD.ein_last_4,OLD.document_id));
  IF NEW.revision<>OLD.revision+(CASE WHEN content_changed THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Content revision does not match the transition' USING ERRCODE='23514'; END IF;
 END IF;

 IF NEW.document_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('pending','approved')) THEN
  SELECT d.id,d.user_id,d.object_path,d.purpose,d.created_at,u.verification_data_purge_after INTO evidence
  FROM public.verification_documents d JOIN public.users u ON u.id=NEW.user_id
  WHERE d.id=NEW.document_id AND d.user_id=NEW.user_id AND d.ready_at IS NOT NULL AND d.deleted_at IS NULL AND d.purpose IN ('business_verification','seller_activation') FOR SHARE OF d;
  IF NOT FOUND OR (evidence.purpose='seller_activation' AND evidence.object_path<>NEW.user_id||'/ready/'||NEW.id||'/'||NEW.document_id) THEN RAISE EXCEPTION 'Seller activation document unavailable or origin mismatch' USING ERRCODE='23514'; END IF;
  prior_deadline:=evidence.created_at+interval '30 days';
  IF evidence.purpose='business_verification' AND evidence.verification_data_purge_after IS NOT NULL THEN prior_deadline:=least(prior_deadline,evidence.verification_data_purge_after); END IF;
  IF prior_deadline<=now() OR NEW.purge_after<=now() THEN RAISE EXCEPTION 'Seller activation document evidence expired' USING ERRCODE='23514'; END IF;
  NEW.purge_after:=least(NEW.purge_after,prior_deadline);
 END IF;
 IF NEW.status='pending' AND (TG_OP='INSERT' OR OLD.status='draft') AND (NEW.document_id IS NULL OR NEW.ein_last_4 IS NULL OR NEW.purge_after<=now()
  OR NEW.ein_tax_id IS NOT NULL AND (NEW.ein_tax_id !~ '^[0-9]{2}-[0-9]{7}$' OR right(NEW.ein_tax_id,4)<>NEW.ein_last_4)) THEN
  RAISE EXCEPTION 'Complete current seller evidence is required at submission' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER seller_activation_request_guard BEFORE INSERT OR UPDATE OR DELETE ON public.seller_activation_requests FOR EACH ROW EXECUTE FUNCTION public.protect_seller_activation_request();

CREATE FUNCTION public.protect_activation_document_reference() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.seller_activation_requests WHERE document_id=OLD.id) THEN
  -- The document row is already locked. Read references without reverse row locks.
  -- Retention removes provider bytes before this tombstone and then clears raw references.
  IF TG_OP='UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
   AND NEW.deleted_at<=clock_timestamp()
   AND (to_jsonb(NEW)-'deleted_at')=(to_jsonb(OLD)-'deleted_at')
   AND NOT EXISTS(SELECT 1 FROM public.seller_activation_requests
    WHERE document_id=OLD.id AND (purge_after>now() OR NOT (status IN ('stale','rejected') OR status='approved' AND sync_state='complete'))) THEN
   RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Referenced seller activation evidence permits only its due retention tombstone' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER verification_documents_activation_guard BEFORE UPDATE OR DELETE ON public.verification_documents FOR EACH ROW EXECUTE FUNCTION public.protect_activation_document_reference();

CREATE FUNCTION public.invalidate_seller_activation_on_user_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
 -- users is already locked by the caller; preserve the user -> application lock order.
 IF (NEW.auth_id,NEW.role,NEW.active,NEW.verified,NEW.verification_status,NEW.verification_submission_id,NEW.business_name,NEW.business_address,NEW.business_city,NEW.business_state,NEW.business_zip)
  IS DISTINCT FROM (OLD.auth_id,OLD.role,OLD.active,OLD.verified,OLD.verification_status,OLD.verification_submission_id,OLD.business_name,OLD.business_address,OLD.business_city,OLD.business_state,OLD.business_zip) THEN
  UPDATE public.seller_activation_requests SET status='stale',revision=revision+1,
   sync_state=CASE WHEN status='approved' THEN 'blocked' ELSE sync_state END,
   claim_token=NULL,claim_expires_at=NULL,updated_at=greatest(updated_at,clock_timestamp())
  WHERE user_id=NEW.id AND (status IN ('draft','pending') OR status='approved' AND sync_state<>'complete');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER users_seller_activation_invalidation AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.invalidate_seller_activation_on_user_change();
REVOKE ALL ON FUNCTION public.protect_seller_activation_request(), public.protect_activation_document_reference(), public.invalidate_seller_activation_on_user_change() FROM PUBLIC;
DO $$ DECLARE target_role text; BEGIN
 FOR target_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.protect_seller_activation_request(), public.protect_activation_document_reference(), public.invalidate_seller_activation_on_user_change() FROM %I',target_role);
 END LOOP;
END $$;
COMMENT ON TABLE public.seller_activation_requests IS 'Private seller supplement on an existing account; immutable submission/review/activation receipts with bounded raw-evidence retention. No application row grants authority by itself.';

-- No jurisdiction is enabled automatically. Admin policy setup precedes use.
ALTER TABLE public.verification_documents ADD COLUMN purpose text NOT NULL DEFAULT 'business_verification'
 CHECK (purpose IN ('business_verification','resale_certificate'));
CREATE TABLE public.resale_rules (
 state text PRIMARY KEY CHECK (state ~ '^[A-Z]{2}$'), enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0), policy_reference text NOT NULL CHECK (length(trim(policy_reference)) > 0),
 recipient_name text NOT NULL CHECK (length(trim(recipient_name)) > 0), recipient_address text NOT NULL CHECK (length(trim(recipient_address)) > 0),
 freight_exempt boolean NOT NULL DEFAULT false, electronic_texas boolean NOT NULL DEFAULT false CHECK (NOT electronic_texas OR state='TX'),
 updated_by uuid NOT NULL REFERENCES public.users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.resale_certificates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL, input_fingerprint text NOT NULL,
 state text NOT NULL REFERENCES public.resale_rules(state), rule_revision integer NOT NULL CHECK (rule_revision > 0),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
 format text NOT NULL CHECK (format IN ('upload','texas_electronic')),
 document_id uuid REFERENCES public.verification_documents(id) ON DELETE RESTRICT,
 buyer_identity_fingerprint text NOT NULL, data jsonb NOT NULL,
 review_note text, reviewed_by uuid REFERENCES public.users(id), reviewed_at timestamptz,
 valid_from timestamptz, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((format='upload' AND document_id IS NOT NULL) OR (format='texas_electronic' AND document_id IS NULL AND state='TX')),
 CHECK (status <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND valid_from IS NOT NULL AND length(trim(review_note)) > 0)),
 CHECK (expires_at IS NULL OR valid_from IS NULL OR expires_at > valid_from)
);
CREATE UNIQUE INDEX resale_certificate_request_idx ON public.resale_certificates(buyer_id,request_id);
CREATE INDEX resale_certificate_buyer_state_idx ON public.resale_certificates(buyer_id,state);
CREATE INDEX resale_certificate_queue_idx ON public.resale_certificates(status,created_at);
ALTER TABLE public.orders ADD COLUMN resale_decision jsonb;
ALTER TABLE public.resale_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resale_certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resale_rules, public.resale_certificates FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.resale_rules, public.resale_certificates TO service_role;

CREATE FUNCTION public.protect_resale_certificate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE matched uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Resale certificates are retained as tax evidence'; END IF;
 IF TG_OP='UPDATE' AND (NEW.buyer_id,NEW.request_id,NEW.input_fingerprint,NEW.state,NEW.format,NEW.document_id,NEW.buyer_identity_fingerprint,NEW.data,NEW.created_at)
 IS DISTINCT FROM (OLD.buyer_id,OLD.request_id,OLD.input_fingerprint,OLD.state,OLD.format,OLD.document_id,OLD.buyer_identity_fingerprint,OLD.data,OLD.created_at)
 THEN RAISE EXCEPTION 'Signed certificate evidence is immutable; submit a replacement'; END IF;
 IF NEW.document_id IS NOT NULL THEN
  SELECT id INTO matched FROM public.verification_documents WHERE id=NEW.document_id AND user_id=NEW.buyer_id AND purpose='resale_certificate' AND ready_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF matched IS NULL THEN RAISE EXCEPTION 'Certificate document unavailable or ownership mismatch'; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER resale_certificate_evidence BEFORE INSERT OR UPDATE OR DELETE ON public.resale_certificates FOR EACH ROW EXECUTE FUNCTION public.protect_resale_certificate();
CREATE FUNCTION public.protect_order_resale_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.resale_decision IS DISTINCT FROM OLD.resale_decision THEN RAISE EXCEPTION 'Order resale decision is immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER order_resale_evidence BEFORE UPDATE OF resale_decision ON public.orders FOR EACH ROW EXECUTE FUNCTION public.protect_order_resale_decision();
REVOKE ALL ON FUNCTION public.protect_resale_certificate(), public.protect_order_resale_decision() FROM PUBLIC,anon,authenticated;

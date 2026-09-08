-- Additive application metadata only. Provision the private bucket separately;
-- see docs/private-verification-storage.md. Do not expose this table to Data API clients.
CREATE TABLE IF NOT EXISTS public.verification_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 object_path text NOT NULL UNIQUE,
 file_name text NOT NULL,
 mime_type text NOT NULL,
 file_size integer NOT NULL CONSTRAINT verification_documents_size_check CHECK (file_size > 0 AND file_size <= 10485760),
 ready_at timestamptz,
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_documents_user_idx ON public.verification_documents(user_id);
ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verification_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.verification_documents TO service_role;

-- Keep private evidence attachment and provider deletion serialized. Legacy URL
-- references remain readable; all new private references must match ownership.
CREATE OR REPLACE FUNCTION public.enforce_private_verification_document() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE document_id uuid; owner_id uuid; matched uuid;
BEGIN
 IF NEW.verification_doc_url IS NULL OR NEW.verification_doc_url NOT LIKE 'verification-document:%' THEN RETURN NEW; END IF;
 document_id := substring(NEW.verification_doc_url from 23)::uuid;
 IF TG_TABLE_NAME = 'users' THEN owner_id := NEW.id; ELSE owner_id := NEW.user_id; END IF;
 SELECT id INTO matched FROM public.verification_documents
 WHERE id=document_id AND user_id=owner_id AND ready_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
 IF matched IS NULL THEN RAISE EXCEPTION 'Private verification document unavailable or owner mismatch'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS users_private_verification_document ON public.users;
CREATE TRIGGER users_private_verification_document BEFORE INSERT OR UPDATE OF verification_doc_url ON public.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_private_verification_document();
DROP TRIGGER IF EXISTS drafts_private_verification_document ON public.verification_drafts;
CREATE TRIGGER drafts_private_verification_document BEFORE INSERT OR UPDATE OF verification_doc_url ON public.verification_drafts
FOR EACH ROW EXECUTE FUNCTION public.enforce_private_verification_document();
REVOKE ALL ON FUNCTION public.enforce_private_verification_document() FROM PUBLIC,anon,authenticated;

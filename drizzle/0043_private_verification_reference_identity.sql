-- Preserve stored references and existing document ownership. Accept the same
-- case-insensitive private-reference grammar as the application parser, and run
-- the ownership/readiness lock for every accepted spelling.
CREATE OR REPLACE FUNCTION public.enforce_private_verification_document() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE document_id uuid; owner_id uuid; matched uuid;
BEGIN
 IF NEW.verification_doc_url IS NULL OR NEW.verification_doc_url NOT ILIKE 'verification-document:%' THEN RETURN NEW; END IF;
 IF NEW.verification_doc_url !~* '^verification-document:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Invalid private verification document reference' USING ERRCODE='23514';
 END IF;
 document_id := substring(NEW.verification_doc_url from 23)::uuid;
 IF TG_TABLE_NAME = 'users' THEN owner_id := NEW.id; ELSE owner_id := NEW.user_id; END IF;
 SELECT id INTO matched FROM public.verification_documents
 WHERE id=document_id AND user_id=owner_id AND ready_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
 IF matched IS NULL THEN
  RAISE EXCEPTION 'Private verification document unavailable or owner mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_private_verification_document() FROM PUBLIC,anon,authenticated;

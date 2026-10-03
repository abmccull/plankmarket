-- Preserve the existing channels for saved profiles. New profiles use in-app
-- matching by default; email is an explicit choice in Buying preferences.
ALTER TABLE public.user_preferences
  ADD COLUMN buyer_match_in_app_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN buyer_match_email_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_preferences
  ALTER COLUMN buyer_match_email_enabled SET DEFAULT false;

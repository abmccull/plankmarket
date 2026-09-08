-- Additive: historical listings remain unknown; no inferred specifications.
ALTER TABLE public.listings
 ADD COLUMN packaging_type text NOT NULL DEFAULT 'unknown' CHECK (packaging_type IN ('unknown','sealed_cartons','open_cartons','loose_boards','mixed')),
 ADD COLUMN installation_method text NOT NULL DEFAULT 'unknown' CHECK (installation_method IN ('unknown','click_lock','glue_down','nail_down','staple_down','floating','multiple')),
 ADD COLUMN lot_number varchar(100),
 ADD COLUMN water_resistance text NOT NULL DEFAULT 'unknown' CHECK (water_resistance IN ('unknown','not_waterproof','water_resistant','waterproof')),
 ADD COLUMN specification_provenance text NOT NULL DEFAULT 'unknown' CHECK (specification_provenance IN ('unknown','seller_declared','evidence_reviewed')),
 ADD COLUMN specification_evidence_id uuid REFERENCES public.media(id) ON DELETE SET NULL,
 ADD COLUMN specification_reviewed_at timestamptz,
 ADD COLUMN specification_reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

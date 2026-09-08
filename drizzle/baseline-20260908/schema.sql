--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: ai_draft_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ai_draft_status AS ENUM (
    'pending',
    'processing',
    'ready',
    'applied',
    'failed'
);


--
-- Name: audit_actor_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.audit_actor_type AS ENUM (
    'user',
    'admin',
    'system',
    'provider'
);


--
-- Name: buyer_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.buyer_request_status AS ENUM (
    'open',
    'matched',
    'closed',
    'expired'
);


--
-- Name: condition_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.condition_type AS ENUM (
    'new_overstock',
    'discontinued',
    'slight_damage',
    'returns',
    'seconds',
    'remnants',
    'closeout',
    'other'
);


--
-- Name: dispute_evidence_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_evidence_type AS ENUM (
    'photo',
    'bol',
    'delivery_receipt',
    'invoice',
    'correspondence',
    'other'
);


--
-- Name: dispute_reason_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_reason_code AS ENUM (
    'freight_damage',
    'quantity_shortage',
    'wrong_item',
    'quality_mismatch',
    'condition_mismatch',
    'missing_documentation',
    'other'
);


--
-- Name: dispute_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_source AS ENUM (
    'buyer',
    'admin',
    'stripe'
);


--
-- Name: dispute_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dispute_status AS ENUM (
    'open',
    'under_review',
    'resolved_buyer',
    'resolved_seller',
    'closed'
);


--
-- Name: finish_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.finish_type AS ENUM (
    'matte',
    'semi_gloss',
    'gloss',
    'wire_brushed',
    'hand_scraped',
    'distressed',
    'smooth',
    'textured',
    'oiled',
    'unfinished',
    'other'
);


--
-- Name: followup_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.followup_status AS ENUM (
    'pending',
    'completed',
    'cancelled'
);


--
-- Name: freight_payment_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.freight_payment_mode AS ENUM (
    'buyer_pays',
    'seller_pays'
);


--
-- Name: grade_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.grade_type AS ENUM (
    'select',
    '1_common',
    '2_common',
    '3_common',
    'cabin',
    'character',
    'rustic',
    'premium',
    'standard',
    'economy',
    'other'
);


--
-- Name: inventory_ingest_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_ingest_status AS ENUM (
    'processing',
    'completed',
    'failed'
);


--
-- Name: inventory_reconciliation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_reconciliation_status AS ENUM (
    'open',
    'resolved',
    'dismissed'
);


--
-- Name: inventory_source_auth_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_source_auth_mode AS ENUM (
    'bearer',
    'signed'
);


--
-- Name: inventory_source_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_source_status AS ENUM (
    'active',
    'paused',
    'revoked'
);


--
-- Name: listing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.listing_status AS ENUM (
    'draft',
    'active',
    'sold',
    'expired',
    'archived'
);


--
-- Name: material_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.material_type AS ENUM (
    'hardwood',
    'engineered',
    'laminate',
    'vinyl_lvp',
    'bamboo',
    'tile',
    'other'
);


--
-- Name: moq_unit; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.moq_unit AS ENUM (
    'pallets',
    'sqft'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'order_confirmed',
    'order_shipped',
    'order_delivered',
    'new_offer',
    'listing_match',
    'listing_expiring',
    'payment_received',
    'review_received',
    'system'
);


--
-- Name: offer_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.offer_event_type AS ENUM (
    'initial_offer',
    'counter',
    'accept',
    'reject',
    'withdraw',
    'expire'
);


--
-- Name: offer_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.offer_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'countered',
    'withdrawn',
    'expired'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'refunded'
);


--
-- Name: promotion_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.promotion_tier AS ENUM (
    'spotlight',
    'featured',
    'premium'
);


--
-- Name: reason_code; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reason_code AS ENUM (
    'overproduction',
    'color_change',
    'line_discontinuation',
    'warehouse_clearance',
    'customer_return',
    'slight_defect',
    'packaging_damage',
    'end_of_season',
    'other'
);


--
-- Name: reconciliation_case_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reconciliation_case_event_type AS ENUM (
    'opened',
    'status_changed',
    'assigned',
    'note',
    'attempt',
    'provider_update',
    'resolved',
    'reopened'
);


--
-- Name: reconciliation_case_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reconciliation_case_severity AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


--
-- Name: reconciliation_case_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reconciliation_case_source AS ENUM (
    'system',
    'admin',
    'stripe',
    'priority1',
    'resend',
    'inngest',
    'supabase',
    'other'
);


--
-- Name: reconciliation_case_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reconciliation_case_status AS ENUM (
    'open',
    'in_progress',
    'waiting_external',
    'resolved',
    'dismissed'
);


--
-- Name: reconciliation_case_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reconciliation_case_type AS ENUM (
    'payment_mismatch',
    'payout_failure',
    'refund_failure',
    'shipment_ambiguity',
    'provider_failure',
    'webhook_failure',
    'email_delivery',
    'promotion_refund',
    'dispute_resolution',
    'data_integrity',
    'other'
);


--
-- Name: request_response_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_response_status AS ENUM (
    'sent',
    'viewed',
    'accepted',
    'declined'
);


--
-- Name: review_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.review_direction AS ENUM (
    'buyer_to_seller',
    'seller_to_buyer'
);


--
-- Name: sample_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sample_request_status AS ENUM (
    'requested',
    'approved',
    'declined',
    'cancelled',
    'shipped',
    'delivered'
);


--
-- Name: selling_territory_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.selling_territory_mode AS ENUM (
    'unrestricted',
    'allowed_states'
);


--
-- Name: shipment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipment_status AS ENUM (
    'pending',
    'dispatched',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'exception',
    'cancelled'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'buyer',
    'seller',
    'admin'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
    revoke trigger on cron.job_run_details from postgres;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
begin
    if not exists (
        select 1
        from pg_catalog.pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8.0', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
            set search_path to ''
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: enforce_order_financial_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_order_financial_snapshot() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."quantity_sq_ft" <= 0
     OR NEW."price_per_sq_ft" < 0
     OR NEW."subtotal" < 0
     OR NEW."buyer_fee" < 0
     OR NEW."seller_fee" < 0
     OR NEW."total_price" < 0
     OR NEW."stripe_processing_fee" < 0
     OR NEW."seller_stripe_fee" < 0
     OR NEW."platform_stripe_fee" < 0
     OR NEW."original_seller_payout" < 0
     OR NEW."seller_payout" < 0
     OR NEW."tax_amount" < 0
     OR NEW."taxable_inventory_amount" < 0
     OR NEW."taxable_freight_amount" < 0
     OR NEW."taxable_buyer_fee_amount" < 0
     OR COALESCE(NEW."refunded_amount", 0) < 0
     OR NEW."transfer_reversed_amount" < 0 THEN
    RAISE EXCEPTION 'order financial amounts must be nonnegative';
  END IF;

  IF NEW."total_price"
     <> NEW."subtotal"
        + NEW."buyer_freight_charge"
        + NEW."buyer_fee"
        + NEW."tax_amount" THEN
    RAISE EXCEPTION 'order buyer charge arithmetic is inconsistent';
  END IF;
  IF NEW."original_seller_payout"
     <> NEW."subtotal" - NEW."seller_fee" - NEW."seller_stripe_fee"
        - NEW."seller_freight_contribution" THEN
    RAISE EXCEPTION 'order original seller payout arithmetic is inconsistent';
  END IF;
  IF NEW."stripe_processing_fee"
     <> NEW."seller_stripe_fee" + NEW."platform_stripe_fee" THEN
    RAISE EXCEPTION 'order processing fee allocation is inconsistent';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: ensure_listing_published_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_listing_published_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."status" = 'active' THEN
    NEW."published_at" := coalesce(NEW."published_at", now());
  ELSIF TG_OP = 'UPDATE'
    AND NEW."status" = 'active'
    AND OLD."status" IS DISTINCT FROM 'active'
  THEN
    NEW."published_at" := now();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: prevent_audit_event_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_audit_event_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;


--
-- Name: prevent_evidence_attachment_to_deleting_media(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_evidence_attachment_to_deleting_media() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."media_id" IS NOT NULL AND EXISTS (
    SELECT 1
    FROM "media"
    WHERE "media"."id" = NEW."media_id"
      AND "media"."deletion_claim_token" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'media deletion is already in progress';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: prevent_inventory_adjustment_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_inventory_adjustment_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'inventory_adjustments is append-only';
END;
$$;


--
-- Name: prevent_order_commercial_snapshot_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_order_commercial_snapshot_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."quantity_sq_ft" IS DISTINCT FROM OLD."quantity_sq_ft"
     OR NEW."price_per_sq_ft" IS DISTINCT FROM OLD."price_per_sq_ft"
     OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
     OR NEW."buyer_fee" IS DISTINCT FROM OLD."buyer_fee"
     OR NEW."seller_fee" IS DISTINCT FROM OLD."seller_fee"
     OR NEW."total_price" IS DISTINCT FROM OLD."total_price"
     OR NEW."stripe_processing_fee" IS DISTINCT FROM OLD."stripe_processing_fee"
     OR NEW."seller_stripe_fee" IS DISTINCT FROM OLD."seller_stripe_fee"
     OR NEW."platform_stripe_fee" IS DISTINCT FROM OLD."platform_stripe_fee"
     OR NEW."original_seller_payout"
        IS DISTINCT FROM OLD."original_seller_payout"
     OR NEW."carrier_rate" IS DISTINCT FROM OLD."carrier_rate"
     OR NEW."shipping_margin" IS DISTINCT FROM OLD."shipping_margin"
     OR NEW."commercial_policy_snapshot"
        IS DISTINCT FROM OLD."commercial_policy_snapshot" THEN
    RAISE EXCEPTION
      'order commercial snapshots are immutable (order_id=%)',
      OLD."id";
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_order_freight_funding_snapshot_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_order_freight_funding_snapshot_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."shipping_price" IS DISTINCT FROM OLD."shipping_price"
     OR NEW."freight_funding_mode" IS DISTINCT FROM OLD."freight_funding_mode"
     OR NEW."buyer_freight_charge" IS DISTINCT FROM OLD."buyer_freight_charge"
     OR NEW."seller_freight_contribution" IS DISTINCT FROM OLD."seller_freight_contribution" THEN
    RAISE EXCEPTION
      'order freight funding snapshots are immutable (order_id=%)',
      OLD."id";
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: prevent_order_tax_evidence_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_order_tax_evidence_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."tax_policy_snapshot" IS DISTINCT FROM OLD."tax_policy_snapshot"
     OR NEW."tax_liability" IS DISTINCT FROM OLD."tax_liability"
     OR NEW."tax_amount" IS DISTINCT FROM OLD."tax_amount"
     OR NEW."taxable_inventory_amount"
        IS DISTINCT FROM OLD."taxable_inventory_amount"
     OR NEW."taxable_freight_amount"
        IS DISTINCT FROM OLD."taxable_freight_amount"
     OR NEW."taxable_buyer_fee_amount"
        IS DISTINCT FROM OLD."taxable_buyer_fee_amount"
     OR NEW."stripe_tax_calculation_id"
        IS DISTINCT FROM OLD."stripe_tax_calculation_id"
     OR NEW."stripe_tax_account_id"
        IS DISTINCT FROM OLD."stripe_tax_account_id"
     OR NEW."tax_jurisdiction_summary"
        IS DISTINCT FROM OLD."tax_jurisdiction_summary"
     OR NEW."tax_calculation_evidence"
        IS DISTINCT FROM OLD."tax_calculation_evidence"
     OR NEW."tax_calculated_at" IS DISTINCT FROM OLD."tax_calculated_at" THEN
    RAISE EXCEPTION
      'order tax calculation snapshots are immutable (order_id=%)',
      OLD."id";
  END IF;

  IF OLD."stripe_tax_transaction_id" IS NOT NULL
     AND NEW."stripe_tax_transaction_id"
       IS DISTINCT FROM OLD."stripe_tax_transaction_id" THEN
    RAISE EXCEPTION
      'order tax transaction evidence cannot be changed or cleared (order_id=%)',
      OLD."id";
  END IF;
  IF OLD."tax_committed_at" IS NOT NULL
     AND NEW."tax_committed_at" IS DISTINCT FROM OLD."tax_committed_at" THEN
    RAISE EXCEPTION
      'order tax commitment timestamp cannot be changed or cleared (order_id=%)',
      OLD."id";
  END IF;

  IF jsonb_typeof(NEW."stripe_tax_reversal_transaction_ids") <> 'array'
     OR NOT (
       NEW."stripe_tax_reversal_transaction_ids"
       @> OLD."stripe_tax_reversal_transaction_ids"
     )
     OR jsonb_typeof(NEW."tax_reversal_evidence") <> 'array'
     OR NOT (
       NEW."tax_reversal_evidence" @> OLD."tax_reversal_evidence"
     ) THEN
    RAISE EXCEPTION
      'order tax reversal evidence is append-only (order_id=%)',
      OLD."id";
  END IF;

  IF NOT (
    (OLD."tax_status" = 'disabled'
      AND NEW."tax_status" = 'disabled')
    OR (OLD."tax_status" = 'calculated'
      AND NEW."tax_status" IN (
        'calculated',
        'committed',
        'reconciliation_required'
      ))
    OR (OLD."tax_status" = 'committed'
      AND NEW."tax_status" IN ('committed', 'reconciliation_required'))
    OR (OLD."tax_status" = 'reconciliation_required'
      AND NEW."tax_status" IN ('reconciliation_required', 'committed'))
  ) THEN
    RAISE EXCEPTION
      'invalid order tax status transition % -> % (order_id=%)',
      OLD."tax_status",
      NEW."tax_status",
      OLD."id";
  END IF;

  IF NOT (
    (OLD."tax_reversal_status" = 'not_required'
      AND NEW."tax_reversal_status" IN (
        'not_required',
        'pending',
        'reconciliation_required'
      ))
    OR (OLD."tax_reversal_status" = 'pending'
      AND NEW."tax_reversal_status" IN (
        'pending',
        'partially_reversed',
        'reversed',
        'reconciliation_required'
      ))
    OR (OLD."tax_reversal_status" = 'partially_reversed'
      AND NEW."tax_reversal_status" IN (
        'partially_reversed',
        'pending',
        'reversed',
        'reconciliation_required'
      ))
    OR (OLD."tax_reversal_status" = 'reversed'
      AND NEW."tax_reversal_status" IN (
        'reversed',
        'reconciliation_required'
      ))
    OR (OLD."tax_reversal_status" = 'reconciliation_required'
      AND NEW."tax_reversal_status" IN (
        'reconciliation_required',
        'pending',
        'partially_reversed',
        'reversed'
      ))
  ) THEN
    RAISE EXCEPTION
      'invalid order tax reversal status transition % -> % (order_id=%)',
      OLD."tax_reversal_status",
      NEW."tax_reversal_status",
      OLD."id";
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_legacy_order_freight_funding_defaults(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_legacy_order_freight_funding_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."freight_funding_mode" = 'buyer_pays'
     AND NEW."buyer_freight_charge" = 0
     AND NEW."seller_freight_contribution" = 0
     AND COALESCE(NEW."shipping_price", 0) <> 0 THEN
    NEW."buyer_freight_charge" := COALESCE(NEW."shipping_price", 0);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: set_order_original_seller_payout(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_order_original_seller_payout() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW."original_seller_payout" IS NULL THEN
    NEW."original_seller_payout" := NEW."seller_payout";
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_sample_request_retention_defaults(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sample_request_retention_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  terminal_at timestamptz;
BEGIN
  IF NEW."status" IN ('declined', 'cancelled', 'delivered')
    AND NEW."pii_purged_at" IS NULL
  THEN
    terminal_at := CASE
      WHEN NEW."status" = 'declined' THEN coalesce(NEW."declined_at", NEW."updated_at", now())
      WHEN NEW."status" = 'cancelled' THEN coalesce(NEW."cancelled_at", NEW."updated_at", now())
      ELSE coalesce(NEW."delivered_at", NEW."updated_at", now())
    END;
    NEW."retention_purge_after" := coalesce(
      NEW."retention_purge_after",
      terminal_at + interval '180 days'
    );
  ELSIF NEW."pii_purged_at" IS NULL THEN
    NEW."retention_purge_after" := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: set_shipping_address_retention_defaults(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_shipping_address_retention_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW."last_used_at" := coalesce(NEW."last_used_at", NEW."updated_at", now());
  NEW."retention_purge_after" := NEW."last_used_at" + interval '365 days';
  RETURN NEW;
END;
$$;


--
-- Name: set_user_verification_retention_defaults(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_verification_retention_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW."ein_tax_id" := nullif(btrim(NEW."ein_tax_id"), '');
  NEW."verification_doc_url" := nullif(btrim(NEW."verification_doc_url"), '');
  NEW."ein_last_4" := CASE
    WHEN NEW."ein_tax_id" IS NULL THEN NULL
    ELSE right(regexp_replace(NEW."ein_tax_id", '\D', '', 'g'), 4)
  END;

  IF NEW."ein_tax_id" IS NOT NULL OR NEW."verification_doc_url" IS NOT NULL THEN
    IF TG_OP = 'INSERT'
      OR NEW."ein_tax_id" IS DISTINCT FROM OLD."ein_tax_id"
      OR NEW."verification_doc_url" IS DISTINCT FROM OLD."verification_doc_url"
    THEN
      NEW."verification_data_purge_after" := coalesce(NEW."updated_at", now()) + interval '30 days';
      NEW."verification_evidence_purged_at" := NULL;
    END IF;
  ELSE
    NEW."verification_data_purge_after" := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: set_verification_draft_retention_defaults(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_verification_draft_retention_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  base_timestamp timestamptz;
BEGIN
  NEW."business_website" := nullif(btrim(NEW."business_website"), '');
  NEW."ein_tax_id" := nullif(btrim(NEW."ein_tax_id"), '');
  NEW."verification_doc_url" := nullif(btrim(NEW."verification_doc_url"), '');
  NEW."business_address" := nullif(btrim(NEW."business_address"), '');
  NEW."business_city" := nullif(btrim(NEW."business_city"), '');
  NEW."business_state" := nullif(upper(btrim(NEW."business_state")), '');
  NEW."business_zip" := nullif(btrim(NEW."business_zip"), '');

  base_timestamp := coalesce(NEW."updated_at", now());
  NEW."expires_at" := base_timestamp + interval '30 days';
  NEW."purge_after" := base_timestamp + interval '30 days';

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_claims_allowlist text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: agent_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action_type character varying(50) NOT NULL,
    related_id uuid,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: agent_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    offer_auto_enabled boolean DEFAULT false NOT NULL,
    offer_accept_above real,
    offer_counter_at real,
    offer_reject_below real,
    offer_counter_message text,
    offer_reject_message text,
    monitor_enabled boolean DEFAULT false NOT NULL,
    monitor_auto_offer boolean DEFAULT false NOT NULL,
    monitor_max_price numeric(12,4),
    monitor_budget_monthly numeric(12,4),
    monitor_budget_used numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    repricing_enabled boolean DEFAULT false NOT NULL,
    repricing_drop_percent real,
    repricing_stale_after_days integer,
    repricing_floor_percent real,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_type public.audit_actor_type NOT NULL,
    actor_id uuid,
    action character varying(120) NOT NULL,
    entity_type character varying(80) NOT NULL,
    entity_id character varying(255),
    idempotency_key character varying(255),
    request_id character varying(255),
    summary text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_events_action_nonempty_check CHECK ((NULLIF(TRIM(BOTH FROM action), ''::text) IS NOT NULL)),
    CONSTRAINT audit_events_actor_identity_check CHECK (((actor_type = ANY (ARRAY['system'::public.audit_actor_type, 'provider'::public.audit_actor_type])) OR (actor_id IS NOT NULL))),
    CONSTRAINT audit_events_entity_type_nonempty_check CHECK ((NULLIF(TRIM(BOTH FROM entity_type), ''::text) IS NOT NULL)),
    CONSTRAINT audit_events_summary_nonempty_check CHECK ((NULLIF(TRIM(BOTH FROM summary), ''::text) IS NOT NULL))
);


--
-- Name: TABLE audit_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_events IS 'Append-only security and financial audit ledger.';


--
-- Name: buyer_request_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_request_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    listing_id uuid,
    message text NOT NULL,
    status public.request_response_status DEFAULT 'sent'::public.request_response_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: buyer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    status public.buyer_request_status DEFAULT 'open'::public.buyer_request_status NOT NULL,
    material_types jsonb NOT NULL,
    min_total_sq_ft real NOT NULL,
    max_total_sq_ft real,
    price_max_per_sq_ft real NOT NULL,
    price_min_per_sq_ft real,
    destination_zip character varying(10) NOT NULL,
    pickup_ok boolean DEFAULT false NOT NULL,
    pickup_radius_miles integer,
    shipping_ok boolean DEFAULT true NOT NULL,
    specs jsonb,
    notes text,
    urgency character varying(20) DEFAULT 'flexible'::character varying NOT NULL,
    response_count integer DEFAULT 0 NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    buyer_last_read_at timestamp with time zone,
    seller_last_read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dispute_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispute_id uuid NOT NULL,
    media_id uuid NOT NULL,
    uploader_id uuid NOT NULL,
    evidence_type public.dispute_evidence_type NOT NULL,
    description character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dispute_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispute_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dispute_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE dispute_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dispute_messages IS 'Messages within dispute threads';


--
-- Name: disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    initiator_id uuid NOT NULL,
    reason character varying(255) NOT NULL,
    description text NOT NULL,
    status public.dispute_status DEFAULT 'open'::public.dispute_status NOT NULL,
    resolution text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reason_code public.dispute_reason_code DEFAULT 'other'::public.dispute_reason_code NOT NULL,
    source public.dispute_source DEFAULT 'buyer'::public.dispute_source NOT NULL,
    delivery_occurred_at timestamp with time zone,
    reporting_deadline_at timestamp with time zone,
    reporting_window_override_reason text,
    reported_late boolean DEFAULT false NOT NULL,
    damage_visible_at_delivery boolean,
    bol_damage_noted boolean,
    bol_notes text,
    resolved_refund_amount_cents integer,
    payout_requeued_at timestamp with time zone
);


--
-- Name: TABLE disputes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.disputes IS 'Order disputes and resolution tracking';


--
-- Name: email_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key character varying(256) NOT NULL,
    provider_message_id character varying(255),
    category character varying(100) NOT NULL,
    payload_fingerprint character varying(64) NOT NULL,
    from_address text NOT NULL,
    recipient_emails text[] NOT NULL,
    subject text NOT NULL,
    status character varying(32) DEFAULT 'sending'::character varying NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    accepted_at timestamp with time zone,
    delivered_at timestamp with time zone,
    failed_at timestamp with time zone,
    provider_status_at timestamp with time zone,
    last_attempt_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_deliveries_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT email_deliveries_status_check CHECK (((status)::text = ANY ((ARRAY['sending'::character varying, 'acceptance_unknown'::character varying, 'accepted'::character varying, 'scheduled'::character varying, 'sent'::character varying, 'delivered'::character varying, 'delivery_delayed'::character varying, 'bounced'::character varying, 'complained'::character varying, 'failed'::character varying, 'suppressed'::character varying])::text[])))
);


--
-- Name: email_recipient_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_recipient_suppressions (
    email character varying(320) NOT NULL,
    reason character varying(32) NOT NULL,
    source_delivery_id uuid,
    provider_message_id character varying(255),
    suppressed_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_recipient_suppressions_reason_check CHECK (((reason)::text = ANY ((ARRAY['bounced'::character varying, 'complained'::character varying, 'suppressed'::character varying])::text[])))
);


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    page character varying(255),
    type character varying(50) NOT NULL,
    message text NOT NULL,
    rating integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE feedback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feedback IS 'User feedback and bug reports for the platform';


--
-- Name: followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    buyer_id uuid,
    conversation_id uuid,
    title character varying(255) NOT NULL,
    due_at timestamp with time zone NOT NULL,
    status public.followup_status DEFAULT 'pending'::public.followup_status NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    source_id uuid,
    source_item_id uuid,
    ingest_batch_id uuid,
    previous_quantity real NOT NULL,
    new_quantity real NOT NULL,
    delta_quantity real NOT NULL,
    reason character varying(80) NOT NULL,
    actor_type character varying(20) NOT NULL,
    actor_user_id uuid,
    idempotency_key character varying(255) NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_adjustments_actor_type_check CHECK (((actor_type)::text = ANY ((ARRAY['feed'::character varying, 'seller'::character varying, 'admin'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT inventory_adjustments_quantities_check CHECK (((previous_quantity >= (0)::double precision) AND (new_quantity >= (0)::double precision) AND (abs(((new_quantity - previous_quantity) - delta_quantity)) < (0.0001)::double precision))),
    CONSTRAINT inventory_adjustments_reason_check CHECK (((reason)::text = ANY ((ARRAY['feed_sync'::character varying, 'manual_reconciliation'::character varying])::text[])))
);


--
-- Name: TABLE inventory_adjustments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_adjustments IS 'Append-only evidence ledger for marketplace quantity changes.';


--
-- Name: inventory_ingest_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_ingest_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    idempotency_key character varying(128) NOT NULL,
    request_hash character varying(64) NOT NULL,
    status public.inventory_ingest_status DEFAULT 'processing'::public.inventory_ingest_status NOT NULL,
    item_count integer NOT NULL,
    applied_count integer DEFAULT 0 NOT NULL,
    unchanged_count integer DEFAULT 0 NOT NULL,
    mismatch_count integer DEFAULT 0 NOT NULL,
    unbound_count integer DEFAULT 0 NOT NULL,
    result jsonb,
    error_code character varying(80),
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_ingest_batches_counts_check CHECK ((((item_count >= 1) AND (item_count <= 100)) AND (applied_count >= 0) AND (unchanged_count >= 0) AND (mismatch_count >= 0) AND (unbound_count >= 0))),
    CONSTRAINT inventory_ingest_batches_request_hash_check CHECK ((length((request_hash)::text) = 64))
);


--
-- Name: inventory_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reconciliation_key character varying(255) NOT NULL,
    seller_id uuid NOT NULL,
    source_id uuid NOT NULL,
    source_item_id uuid NOT NULL,
    listing_id uuid,
    ingest_batch_id uuid,
    status public.inventory_reconciliation_status DEFAULT 'open'::public.inventory_reconciliation_status NOT NULL,
    reason character varying(80) NOT NULL,
    reported_quantity real NOT NULL,
    marketplace_quantity real,
    reserved_quantity real DEFAULT 0 NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    resolution text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_reconciliations_quantities_check CHECK (((reported_quantity >= (0)::double precision) AND ((marketplace_quantity IS NULL) OR (marketplace_quantity >= (0)::double precision)) AND (reserved_quantity >= (0)::double precision))),
    CONSTRAINT inventory_reconciliations_reason_check CHECK (((reason)::text = ANY ((ARRAY['unbound_item'::character varying, 'binding_conflict'::character varying, 'listing_not_owned'::character varying, 'active_reservation'::character varying, 'stale_observation'::character varying, 'invalid_observation_time'::character varying])::text[])))
);


--
-- Name: TABLE inventory_reconciliations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_reconciliations IS 'Feed observations that require seller or operator review before stock changes.';


--
-- Name: inventory_source_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_source_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    listing_id uuid,
    external_item_id character varying(128) NOT NULL,
    last_reported_quantity real,
    last_observed_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_source_items_quantity_check CHECK (((last_reported_quantity IS NULL) OR (last_reported_quantity >= (0)::double precision)))
);


--
-- Name: inventory_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    external_source_id character varying(128) NOT NULL,
    auth_mode public.inventory_source_auth_mode DEFAULT 'bearer'::public.inventory_source_auth_mode NOT NULL,
    status public.inventory_source_status DEFAULT 'active'::public.inventory_source_status NOT NULL,
    api_key_hash character varying(64) NOT NULL,
    api_key_hint character varying(32) NOT NULL,
    stale_after_minutes integer DEFAULT 1440 NOT NULL,
    last_ingested_at timestamp with time zone,
    last_successful_ingest_at timestamp with time zone,
    last_error_at timestamp with time zone,
    last_error_code character varying(80),
    key_rotated_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_sources_api_key_hash_check CHECK ((length((api_key_hash)::text) = 64)),
    CONSTRAINT inventory_sources_stale_after_check CHECK (((stale_after_minutes >= 15) AND (stale_after_minutes <= 43200)))
);


--
-- Name: TABLE inventory_sources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_sources IS 'Seller-owned inventory feed configuration; credentials are stored only as one-way hashes.';


--
-- Name: listing_drafts_ai; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_drafts_ai (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    raw_input_text text NOT NULL,
    extracted_fields jsonb,
    confidence jsonb,
    status public.ai_draft_status DEFAULT 'pending'::public.ai_draft_status NOT NULL,
    error_message text,
    applied_to_listing_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    tier public.promotion_tier NOT NULL,
    duration_days integer NOT NULL,
    price_paid numeric(12,4) NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    stripe_payment_intent_id character varying(255),
    payment_status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    refund_amount_cents integer,
    refund_idempotency_key character varying(255),
    stripe_refund_id character varying(255),
    refund_attempt_count integer DEFAULT 0 NOT NULL,
    refund_requested_at timestamp with time zone,
    refund_last_attempt_at timestamp with time zone,
    refund_next_attempt_at timestamp with time zone,
    refund_last_error text,
    refunded_at timestamp with time zone
);


--
-- Name: listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    status public.listing_status DEFAULT 'draft'::public.listing_status NOT NULL,
    material_type public.material_type NOT NULL,
    species character varying(100),
    finish public.finish_type,
    grade public.grade_type,
    color character varying(100),
    color_family character varying(50),
    thickness real,
    width real,
    length real,
    brand character varying(255),
    model_number character varying(255),
    sq_ft_per_box real,
    boxes_per_pallet integer,
    total_sq_ft real NOT NULL,
    total_pallets integer,
    moq real,
    location_city character varying(100),
    location_state character varying(2),
    location_zip character varying(10),
    ask_price_per_sq_ft numeric(12,4) NOT NULL,
    buy_now_price numeric(12,4),
    allow_offers boolean DEFAULT true NOT NULL,
    floor_price numeric(12,4),
    condition public.condition_type NOT NULL,
    reason_code public.reason_code,
    certifications jsonb DEFAULT '[]'::jsonb,
    views_count integer DEFAULT 0 NOT NULL,
    watchlist_count integer DEFAULT 0 NOT NULL,
    offer_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    sold_at timestamp with time zone,
    wear_layer real,
    original_total_sq_ft real,
    location_lat real,
    location_lng real,
    promotion_tier public.promotion_tier,
    promotion_expires_at timestamp with time zone,
    pallet_weight real,
    pallet_length real,
    pallet_width real,
    pallet_height real,
    freight_class character varying(10),
    slug text,
    quality_score integer DEFAULT 0,
    ship_ready boolean DEFAULT false,
    moq_unit public.moq_unit DEFAULT 'sqft'::public.moq_unit,
    nmfc_code character varying(20),
    original_ask_price_per_sq_ft numeric(12,4),
    last_confirmed_at timestamp with time zone,
    confirmation_due_at timestamp with time zone,
    full_lot_only boolean DEFAULT false NOT NULL,
    partial_quantity_markup_percent real,
    automatic_markdown_enabled boolean DEFAULT false NOT NULL,
    automatic_markdown_floor_percent real,
    automatic_markdown_interval_days integer,
    automatic_markdown_started_at timestamp with time zone,
    automatic_markdown_current_step integer DEFAULT 0 NOT NULL,
    automatic_markdown_last_applied_at timestamp with time zone,
    pricing_rules_version integer DEFAULT 1 NOT NULL,
    allow_sample_requests boolean DEFAULT false NOT NULL,
    territory_mode public.selling_territory_mode DEFAULT 'unrestricted'::public.selling_territory_mode NOT NULL,
    allowed_destination_states jsonb DEFAULT '[]'::jsonb,
    freight_payment_mode public.freight_payment_mode DEFAULT 'buyer_pays'::public.freight_payment_mode NOT NULL,
    seller_freight_states jsonb DEFAULT '[]'::jsonb,
    freight_drop_charge numeric(12,4),
    stripe_tax_code character varying(64),
    tax_code_status character varying(32) DEFAULT 'unassigned'::character varying NOT NULL,
    tax_code_verified_at timestamp with time zone,
    tax_code_verified_by uuid,
    search_document text GENERATED ALWAYS AS (((((((lower((COALESCE(title, ''::character varying))::text) || ''::text) || lower(COALESCE(description, ''::text))) || ''::text) || lower((COALESCE(brand, ''::character varying))::text)) || ''::text) || lower((COALESCE(species, ''::character varying))::text))) STORED,
    published_at timestamp with time zone
);


--
-- Name: COLUMN listings.stripe_tax_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.stripe_tax_code IS 'Admin-reviewed Stripe Tax product code; sellers cannot self-verify.';


--
-- Name: COLUMN listings.search_document; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.search_document IS 'Lowercased generated search surface for substring search across title, description, brand, and species. Unit-separator boundaries preserve current single-field matching semantics.';


--
-- Name: media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    url text NOT NULL,
    key character varying(500),
    file_name character varying(255),
    file_size integer,
    mime_type character varying(100),
    alt_text character varying(255),
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    buyer_request_id uuid,
    uploader_id uuid,
    deletion_claim_token character varying(64),
    deletion_claimed_at timestamp with time zone,
    CONSTRAINT media_deletion_claim_consistency_check CHECK (((deletion_claim_token IS NULL) = (deletion_claimed_at IS NULL)))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.notification_type NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: offer_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    offer_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    event_type public.offer_event_type NOT NULL,
    price_per_sq_ft real,
    quantity_sq_ft real,
    total_price real,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    offer_price_per_sq_ft numeric(12,4) NOT NULL,
    quantity_sq_ft numeric(12,4) NOT NULL,
    total_price numeric(12,4) NOT NULL,
    counter_price_per_sq_ft numeric(12,4),
    status public.offer_status DEFAULT 'pending'::public.offer_status NOT NULL,
    message text,
    counter_message text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_round integer DEFAULT 1 NOT NULL,
    last_actor_id uuid,
    order_id uuid
);


--
-- Name: TABLE offers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.offers IS 'Price negotiation offers from buyers to sellers';


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number character varying(20) NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    quantity_sq_ft numeric(12,4) NOT NULL,
    price_per_sq_ft numeric(12,4) NOT NULL,
    subtotal numeric(12,4) NOT NULL,
    buyer_fee numeric(12,4) NOT NULL,
    seller_fee numeric(12,4) NOT NULL,
    total_price numeric(12,4) NOT NULL,
    seller_payout numeric(12,4) NOT NULL,
    stripe_payment_intent_id character varying(255),
    stripe_transfer_id character varying(255),
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    shipping_name character varying(255),
    shipping_address text,
    shipping_city character varying(100),
    shipping_state character varying(2),
    shipping_zip character varying(10),
    shipping_phone character varying(20),
    tracking_number character varying(255),
    carrier character varying(100),
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    escrow_status character varying(20) DEFAULT 'none'::character varying NOT NULL,
    shipping_price numeric(12,4),
    carrier_rate numeric(12,4),
    shipping_margin numeric(12,4),
    selected_quote_id character varying(255),
    selected_carrier character varying(255),
    estimated_transit_days integer,
    quote_expires_at timestamp with time zone,
    refunded_at timestamp with time zone,
    refunded_amount numeric(12,4),
    stripe_refund_id character varying(255),
    transfer_failed_at timestamp with time zone,
    transfer_error text,
    stripe_processing_fee numeric(12,4) DEFAULT 0 NOT NULL,
    offer_id uuid,
    seller_stripe_fee numeric(12,4) DEFAULT 0 NOT NULL,
    platform_stripe_fee numeric(12,4) DEFAULT 0 NOT NULL,
    inventory_released_at timestamp with time zone,
    stripe_transfer_reversal_id character varying(255),
    transfer_reversed_amount numeric(12,4) DEFAULT 0 NOT NULL,
    shipping_booking_snapshot jsonb,
    freight_funding_mode character varying(32) DEFAULT 'buyer_pays'::character varying NOT NULL,
    buyer_freight_charge numeric(12,4) DEFAULT 0 NOT NULL,
    seller_freight_contribution numeric(12,4) DEFAULT 0 NOT NULL,
    commercial_policy_snapshot jsonb DEFAULT '{"version": 1, "capturedAt": "1970-01-01T00:00:00.000Z", "shippingMarkupBps": 2500, "buyerMarketplaceFeeBps": 500, "sellerMarketplaceFeeBps": 500, "paymentProcessingRateBps": 290, "paymentProcessingFixedFeeCents": 30}'::jsonb NOT NULL,
    original_seller_payout numeric(12,4) NOT NULL,
    tax_policy_snapshot jsonb DEFAULT '{"mode": "disabled", "version": 1, "capturedAt": "1970-01-01T00:00:00.000Z", "liabilityOwner": "none", "buyerFeeTaxCode": null, "shippingTaxCode": null, "buyerFeeTreatment": "undecided", "legalDecisionReference": null, "legalDecisionAcknowledged": false, "connectedAccountFlowStatus": "not_applicable"}'::jsonb NOT NULL,
    tax_liability character varying(32) DEFAULT 'none'::character varying NOT NULL,
    tax_status character varying(32) DEFAULT 'disabled'::character varying NOT NULL,
    tax_amount numeric(12,4) DEFAULT 0 NOT NULL,
    taxable_inventory_amount numeric(12,4) DEFAULT 0 NOT NULL,
    taxable_freight_amount numeric(12,4) DEFAULT 0 NOT NULL,
    taxable_buyer_fee_amount numeric(12,4) DEFAULT 0 NOT NULL,
    stripe_tax_calculation_id character varying(255),
    stripe_tax_transaction_id character varying(255),
    stripe_tax_account_id character varying(255),
    tax_jurisdiction_summary jsonb DEFAULT '[]'::jsonb NOT NULL,
    tax_calculation_evidence jsonb,
    tax_calculated_at timestamp with time zone,
    tax_committed_at timestamp with time zone,
    tax_reversal_status character varying(32) DEFAULT 'not_required'::character varying NOT NULL,
    stripe_tax_reversal_transaction_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    tax_reversal_evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    payment_intent_claim_token character varying(64),
    payment_intent_claimed_at timestamp with time zone,
    CONSTRAINT orders_buyer_pays_has_no_seller_contribution_check CHECK ((((freight_funding_mode)::text <> 'buyer_pays'::text) OR (seller_freight_contribution = (0)::numeric))),
    CONSTRAINT orders_freight_funding_amounts_nonnegative_check CHECK (((buyer_freight_charge >= (0)::numeric) AND (seller_freight_contribution >= (0)::numeric))),
    CONSTRAINT orders_freight_funding_mode_check CHECK (((freight_funding_mode)::text = ANY ((ARRAY['buyer_pays'::character varying, 'seller_pays'::character varying, 'seller_pays_selected_states'::character varying])::text[]))),
    CONSTRAINT orders_freight_funding_split_check CHECK (((buyer_freight_charge + seller_freight_contribution) = COALESCE(shipping_price, (0)::numeric))),
    CONSTRAINT orders_payment_intent_claim_consistency_check CHECK (((payment_intent_claim_token IS NULL) = (payment_intent_claimed_at IS NULL)))
);


--
-- Name: COLUMN orders.escrow_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.escrow_status IS 'Payment escrow status: none, held, released, refunded';


--
-- Name: COLUMN orders.shipping_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.shipping_price IS 'Immutable full booked freight, including marketplace margin.';


--
-- Name: COLUMN orders.freight_funding_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.freight_funding_mode IS 'Applied order-time freight funding mode; immutable after insert.';


--
-- Name: COLUMN orders.buyer_freight_charge; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.buyer_freight_charge IS 'Freight included in the buyer charge; immutable after insert.';


--
-- Name: COLUMN orders.seller_freight_contribution; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.seller_freight_contribution IS 'Freight deducted from seller payout; immutable after insert.';


--
-- Name: COLUMN orders.commercial_policy_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.commercial_policy_snapshot IS 'Immutable versioned rates applied when the order was created.';


--
-- Name: COLUMN orders.tax_policy_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.tax_policy_snapshot IS 'Immutable tax-liability and treatment policy captured at order creation.';


--
-- Name: COLUMN orders.tax_calculation_evidence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.tax_calculation_evidence IS 'Immutable provider calculation inputs and jurisdiction evidence.';


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(100) NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: promotion_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_credits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(12,4) NOT NULL,
    used_amount numeric(12,4) DEFAULT '0'::numeric NOT NULL,
    source character varying(30) DEFAULT 'subscription'::character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stripe_invoice_id character varying(255)
);


--
-- Name: reconciliation_case_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_case_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_id uuid NOT NULL,
    actor_id uuid,
    event_type public.reconciliation_case_event_type NOT NULL,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reconciliation_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliation_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    case_key character varying(255) NOT NULL,
    type public.reconciliation_case_type NOT NULL,
    source public.reconciliation_case_source NOT NULL,
    status public.reconciliation_case_status DEFAULT 'open'::public.reconciliation_case_status NOT NULL,
    severity public.reconciliation_case_severity DEFAULT 'medium'::public.reconciliation_case_severity NOT NULL,
    title character varying(255) NOT NULL,
    summary text NOT NULL,
    order_id uuid,
    dispute_id uuid,
    external_reference character varying(255),
    amount_cents integer,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    assigned_to uuid,
    created_by uuid,
    resolution text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    first_detected_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reconciliation_cases_amount_nonnegative_check CHECK (((amount_cents IS NULL) OR (amount_cents >= 0))),
    CONSTRAINT reconciliation_cases_attempt_count_nonnegative_check CHECK ((attempt_count >= 0))
);


--
-- Name: TABLE reconciliation_cases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reconciliation_cases IS 'Durable operator queue for money, provider, and data-integrity exceptions.';


--
-- Name: resend_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resend_webhook_events (
    id character varying(255) NOT NULL,
    event_type character varying(100) NOT NULL,
    provider_message_id character varying(255) NOT NULL,
    event_created_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb NOT NULL
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    rating integer NOT NULL,
    title character varying(200),
    comment text,
    communication_rating integer,
    accuracy_rating integer,
    shipping_rating integer,
    seller_response text,
    seller_responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewee_id uuid NOT NULL,
    direction public.review_direction NOT NULL
);


--
-- Name: TABLE reviews; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reviews IS 'Customer reviews for completed orders';


--
-- Name: sample_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sample_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    status public.sample_request_status DEFAULT 'requested'::public.sample_request_status NOT NULL,
    buyer_message text,
    shipping_name character varying(255) NOT NULL,
    shipping_address_1 text NOT NULL,
    shipping_address_2 text,
    shipping_city character varying(100) NOT NULL,
    shipping_state character varying(2) NOT NULL,
    shipping_zip character varying(10) NOT NULL,
    shipping_phone character varying(20),
    buyer_consented_to_share_address_at timestamp with time zone,
    carrier character varying(100),
    tracking_number character varying(120),
    approved_at timestamp with time zone,
    declined_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    last_action_reason text,
    audit_log jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    retention_purge_after timestamp with time zone,
    pii_purged_at timestamp with time zone
);


--
-- Name: TABLE sample_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sample_requests IS 'Server-only sample workflow containing buyer address data revealed to sellers only after approval and consent.';


--
-- Name: saved_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    filters jsonb NOT NULL,
    alert_enabled boolean DEFAULT true NOT NULL,
    last_alert_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    alert_frequency character varying(20) DEFAULT 'instant'::character varying NOT NULL,
    alert_channels jsonb DEFAULT '["email"]'::jsonb NOT NULL
);


--
-- Name: seller_buyer_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_buyer_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seller_buyer_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_buyer_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    tag character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    quote_id character varying(255),
    priority1_shipment_id character varying(255),
    pro_number character varying(255),
    carrier_name character varying(255),
    carrier_scac character varying(10),
    status public.shipment_status DEFAULT 'pending'::public.shipment_status NOT NULL,
    bol_url text,
    label_url text,
    delivery_receipt_url text,
    tracking_events jsonb DEFAULT '[]'::jsonb,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dispatched_at timestamp with time zone,
    delivered_at timestamp with time zone,
    pickup_date timestamp with time zone,
    is_dry_run boolean DEFAULT true NOT NULL,
    dispatch_attempted_at timestamp with time zone,
    cancellation_requested_at timestamp with time zone,
    cancellation_claim_token character varying(64),
    cancellation_claimed_at timestamp with time zone,
    bol_number character varying(255),
    CONSTRAINT shipments_cancellation_claim_consistency_check CHECK (((cancellation_claim_token IS NULL) = (cancellation_claimed_at IS NULL)))
);


--
-- Name: shipping_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    address text NOT NULL,
    city character varying(100) NOT NULL,
    state character varying(2) NOT NULL,
    zip character varying(10) NOT NULL,
    phone character varying(20),
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    retention_purge_after timestamp with time zone
);


--
-- Name: TABLE shipping_addresses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shipping_addresses IS 'Server-only saved shipping destinations containing buyer address data.';


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_webhook_events (
    id character varying(255) NOT NULL,
    event_type character varying(100) NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    processing_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    last_error text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    event_created_at timestamp with time zone,
    payload jsonb,
    CONSTRAINT stripe_webhook_events_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT stripe_webhook_events_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role character varying(10) NOT NULL,
    preferred_zip character varying(10),
    preferred_radius_miles integer DEFAULT 100,
    preferred_material_types jsonb,
    preferred_species jsonb,
    preferred_use_case character varying(50),
    min_lot_size_sq_ft real,
    max_lot_size_sq_ft real,
    price_min_per_sq_ft real,
    price_max_per_sq_ft real,
    preferred_shipping_mode character varying(20),
    urgency character varying(20),
    preferred_install_types jsonb,
    min_thickness_mm real,
    min_wear_layer_mil real,
    preferred_certifications jsonb,
    waterproof_required boolean DEFAULT false,
    origin_zip character varying(10),
    ship_capable boolean DEFAULT false,
    lead_time_days_min integer,
    lead_time_days_max integer,
    typical_material_types jsonb,
    min_lot_sq_ft real,
    avg_lot_sq_ft real,
    can_split_lots boolean DEFAULT false,
    preferred_buyer_radius_miles integer,
    pricing_style character varying(20),
    palletization_capable boolean DEFAULT true,
    inventory_source jsonb,
    profile_complete boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    partial_quantity_markup_percent real,
    automatic_markdown_enabled boolean DEFAULT false NOT NULL,
    automatic_markdown_floor_percent real,
    automatic_markdown_interval_days integer,
    default_allow_offers boolean DEFAULT true NOT NULL,
    allow_sample_requests boolean DEFAULT false NOT NULL,
    selling_territory_mode character varying(20) DEFAULT 'unrestricted'::character varying NOT NULL,
    allowed_destination_states jsonb DEFAULT '[]'::jsonb NOT NULL,
    freight_payment_mode character varying(20) DEFAULT 'buyer_pays'::character varying NOT NULL,
    seller_freight_states jsonb DEFAULT '[]'::jsonb NOT NULL,
    freight_drop_charge numeric(12,4),
    tax_registered_states jsonb DEFAULT '[]'::jsonb NOT NULL,
    analytics_tracking_enabled boolean,
    analytics_consent_updated_at timestamp with time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_id text NOT NULL,
    email character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(20),
    role public.user_role DEFAULT 'buyer'::public.user_role NOT NULL,
    business_name character varying(255),
    business_address text,
    business_city character varying(100),
    business_state character varying(2),
    business_zip character varying(10),
    avatar_url text,
    stripe_account_id character varying(255),
    stripe_onboarding_complete boolean DEFAULT false NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    verification_status character varying(20) DEFAULT 'unverified'::character varying NOT NULL,
    verification_doc_url text,
    verification_requested_at timestamp with time zone,
    verification_notes text,
    zip_code character varying(5),
    lat real,
    lng real,
    business_website text,
    ein_tax_id text,
    ai_verification_score real,
    ai_verification_notes text,
    pro_status character varying(20) DEFAULT 'free'::character varying NOT NULL,
    stripe_customer_id character varying(255),
    stripe_subscription_id character varying(255),
    pro_started_at timestamp with time zone,
    pro_expires_at timestamp with time zone,
    verification_submission_id uuid,
    stripe_subscription_event_created_at timestamp with time zone,
    ein_last_4 character varying(4),
    verification_data_purge_after timestamp with time zone,
    verification_evidence_purged_at timestamp with time zone,
    CONSTRAINT users_verification_state_consistent_check CHECK ((verified = ((verification_status)::text = 'verified'::text))),
    CONSTRAINT users_verification_status_check CHECK (((verification_status)::text = ANY ((ARRAY['unverified'::character varying, 'pending'::character varying, 'verified'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: COLUMN users.verification_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.verification_status IS 'Seller verification status: unverified, pending, verified, rejected';


--
-- Name: COLUMN users.verification_doc_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.verification_doc_url IS 'URL to uploaded verification document';


--
-- Name: COLUMN users.verification_requested_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.verification_requested_at IS 'When seller requested verification';


--
-- Name: COLUMN users.verification_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.verification_notes IS 'Admin notes on verification decision';


--
-- Name: verification_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_drafts (
    user_id uuid NOT NULL,
    current_step integer DEFAULT 1 NOT NULL,
    business_website text,
    ein_tax_id text,
    verification_doc_url text,
    business_address text,
    business_city character varying(100),
    business_state character varying(2),
    business_zip character varying(10),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    purge_after timestamp with time zone,
    CONSTRAINT verification_drafts_current_step_check CHECK (((current_step >= 1) AND (current_step <= 3)))
);


--
-- Name: TABLE verification_drafts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.verification_drafts IS 'Sensitive business verification work in progress; server access only.';


--
-- Name: watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: agent_actions agent_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_actions
    ADD CONSTRAINT agent_actions_pkey PRIMARY KEY (id);


--
-- Name: agent_configs agent_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_configs
    ADD CONSTRAINT agent_configs_pkey PRIMARY KEY (id);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: buyer_request_responses buyer_request_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_request_responses
    ADD CONSTRAINT buyer_request_responses_pkey PRIMARY KEY (id);


--
-- Name: buyer_requests buyer_requests_id_buyer_idx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_requests
    ADD CONSTRAINT buyer_requests_id_buyer_idx UNIQUE (id, buyer_id);


--
-- Name: buyer_requests buyer_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_requests
    ADD CONSTRAINT buyer_requests_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_listing_buyer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_listing_buyer_unique UNIQUE (listing_id, buyer_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: dispute_evidence dispute_evidence_media_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_evidence
    ADD CONSTRAINT dispute_evidence_media_id_key UNIQUE (media_id);


--
-- Name: dispute_evidence dispute_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_evidence
    ADD CONSTRAINT dispute_evidence_pkey PRIMARY KEY (id);


--
-- Name: dispute_messages dispute_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_messages
    ADD CONSTRAINT dispute_messages_pkey PRIMARY KEY (id);


--
-- Name: disputes disputes_late_admin_override_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.disputes
    ADD CONSTRAINT disputes_late_admin_override_check CHECK (((NOT reported_late) OR ((source = 'admin'::public.dispute_source) AND (NULLIF(TRIM(BOTH FROM reporting_window_override_reason), ''::text) IS NOT NULL)))) NOT VALID;


--
-- Name: disputes disputes_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_order_id_unique UNIQUE (order_id);


--
-- Name: disputes disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);


--
-- Name: disputes disputes_resolved_refund_nonnegative_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.disputes
    ADD CONSTRAINT disputes_resolved_refund_nonnegative_check CHECK (((resolved_refund_amount_cents IS NULL) OR (resolved_refund_amount_cents >= 0))) NOT VALID;


--
-- Name: email_deliveries email_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_deliveries
    ADD CONSTRAINT email_deliveries_pkey PRIMARY KEY (id);


--
-- Name: email_recipient_suppressions email_recipient_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipient_suppressions
    ADD CONSTRAINT email_recipient_suppressions_pkey PRIMARY KEY (email);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: followups followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_pkey PRIMARY KEY (id);


--
-- Name: inventory_adjustments inventory_adjustments_idempotency_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_idempotency_key_unique UNIQUE (idempotency_key);


--
-- Name: inventory_adjustments inventory_adjustments_ingest_batch_requires_source_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_ingest_batch_requires_source_check CHECK (((ingest_batch_id IS NULL) OR (source_id IS NOT NULL))) NOT VALID;


--
-- Name: inventory_adjustments inventory_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_pkey PRIMARY KEY (id);


--
-- Name: inventory_adjustments inventory_adjustments_source_item_requires_source_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_source_item_requires_source_check CHECK (((source_item_id IS NULL) OR (source_id IS NOT NULL))) NOT VALID;


--
-- Name: inventory_ingest_batches inventory_ingest_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_ingest_batches
    ADD CONSTRAINT inventory_ingest_batches_pkey PRIMARY KEY (id);


--
-- Name: inventory_reconciliations inventory_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: inventory_reconciliations inventory_reconciliations_reconciliation_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_reconciliation_key_unique UNIQUE (reconciliation_key);


--
-- Name: inventory_source_items inventory_source_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_source_items
    ADD CONSTRAINT inventory_source_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_sources inventory_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_sources
    ADD CONSTRAINT inventory_sources_pkey PRIMARY KEY (id);


--
-- Name: listing_drafts_ai listing_drafts_ai_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_drafts_ai
    ADD CONSTRAINT listing_drafts_ai_pkey PRIMARY KEY (id);


--
-- Name: listing_promotions listing_promotions_payment_status_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.listing_promotions
    ADD CONSTRAINT listing_promotions_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'refund_pending'::character varying, 'refunded'::character varying, 'reconciliation_required'::character varying])::text[]))) NOT VALID;


--
-- Name: listing_promotions listing_promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_promotions
    ADD CONSTRAINT listing_promotions_pkey PRIMARY KEY (id);


--
-- Name: listing_promotions listing_promotions_refund_amount_nonnegative; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.listing_promotions
    ADD CONSTRAINT listing_promotions_refund_amount_nonnegative CHECK (((refund_amount_cents IS NULL) OR (refund_amount_cents >= 0))) NOT VALID;


--
-- Name: listing_promotions listing_promotions_refund_attempt_count_nonnegative; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.listing_promotions
    ADD CONSTRAINT listing_promotions_refund_attempt_count_nonnegative CHECK ((refund_attempt_count >= 0)) NOT VALID;


--
-- Name: listings listings_id_seller_idx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_id_seller_idx UNIQUE (id, seller_id);


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: listings listings_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_slug_key UNIQUE (slug);


--
-- Name: listings listings_stripe_tax_code_format_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.listings
    ADD CONSTRAINT listings_stripe_tax_code_format_check CHECK (((stripe_tax_code IS NULL) OR ((stripe_tax_code)::text ~ '^txcd_[0-9]+$'::text))) NOT VALID;


--
-- Name: listings listings_tax_code_status_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.listings
    ADD CONSTRAINT listings_tax_code_status_check CHECK (((tax_code_status)::text = ANY ((ARRAY['unassigned'::character varying, 'pending_review'::character varying, 'verified'::character varying])::text[]))) NOT VALID;


--
-- Name: listings listings_total_sq_ft_nonnegative_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.listings
    ADD CONSTRAINT listings_total_sq_ft_nonnegative_check CHECK ((total_sq_ft >= (0)::double precision)) NOT VALID;


--
-- Name: listings listings_verified_tax_code_evidence_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.listings
    ADD CONSTRAINT listings_verified_tax_code_evidence_check CHECK ((((tax_code_status)::text <> 'verified'::text) OR ((stripe_tax_code IS NOT NULL) AND (tax_code_verified_at IS NOT NULL) AND (tax_code_verified_by IS NOT NULL)))) NOT VALID;


--
-- Name: media media_one_parent_max_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.media
    ADD CONSTRAINT media_one_parent_max_check CHECK ((num_nonnulls(listing_id, buyer_request_id) <= 1)) NOT VALID;


--
-- Name: media media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_pkey PRIMARY KEY (id);


--
-- Name: media media_uploader_required_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.media
    ADD CONSTRAINT media_uploader_required_check CHECK ((uploader_id IS NOT NULL)) NOT VALID;


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offer_events offer_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_events
    ADD CONSTRAINT offer_events_pkey PRIMARY KEY (id);


--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (id);


--
-- Name: orders orders_calculated_tax_evidence_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_calculated_tax_evidence_check CHECK ((((tax_status)::text = 'disabled'::text) OR (((tax_liability)::text <> 'none'::text) AND (stripe_tax_calculation_id IS NOT NULL) AND (tax_calculation_evidence IS NOT NULL) AND (tax_calculated_at IS NOT NULL)))) NOT VALID;


--
-- Name: orders orders_committed_tax_evidence_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_committed_tax_evidence_check CHECK ((((tax_status)::text <> 'committed'::text) OR ((stripe_tax_transaction_id IS NOT NULL) AND (tax_committed_at IS NOT NULL)))) NOT VALID;


--
-- Name: orders orders_connected_tax_checkout_incomplete_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_connected_tax_checkout_incomplete_check CHECK (((tax_liability)::text <> 'connected_account'::text)) NOT VALID;


--
-- Name: orders orders_disabled_tax_consistency_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_disabled_tax_consistency_check CHECK ((((tax_status)::text <> 'disabled'::text) OR (((tax_liability)::text = 'none'::text) AND (tax_amount = (0)::numeric) AND (stripe_tax_calculation_id IS NULL) AND (stripe_tax_transaction_id IS NULL) AND (tax_calculation_evidence IS NULL)))) NOT VALID;


--
-- Name: orders orders_financial_amounts_nonnegative_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_financial_amounts_nonnegative_check CHECK (((quantity_sq_ft > (0)::numeric) AND (price_per_sq_ft >= (0)::numeric) AND (subtotal >= (0)::numeric) AND (buyer_fee >= (0)::numeric) AND (seller_fee >= (0)::numeric) AND (total_price >= (0)::numeric) AND (stripe_processing_fee >= (0)::numeric) AND (seller_stripe_fee >= (0)::numeric) AND (platform_stripe_fee >= (0)::numeric) AND (original_seller_payout >= (0)::numeric) AND (seller_payout >= (0)::numeric) AND (tax_amount >= (0)::numeric) AND (taxable_inventory_amount >= (0)::numeric) AND (taxable_freight_amount >= (0)::numeric) AND (taxable_buyer_fee_amount >= (0)::numeric) AND (COALESCE(refunded_amount, (0)::numeric) >= (0)::numeric) AND (transfer_reversed_amount >= (0)::numeric))) NOT VALID;


--
-- Name: orders orders_order_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);


--
-- Name: orders orders_payment_hold_status_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_hold_status_check CHECK (((escrow_status)::text = ANY ((ARRAY['none'::character varying, 'held'::character varying, 'released'::character varying, 'refunded'::character varying, 'disputed'::character varying])::text[]))) NOT VALID;


--
-- Name: orders orders_payment_status_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'reconciliation_required'::character varying, 'refund_pending'::character varying, 'partially_refunded'::character varying, 'refunded'::character varying, 'paid'::character varying])::text[]))) NOT VALID;


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_tax_liability_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_tax_liability_check CHECK (((tax_liability)::text = ANY ((ARRAY['none'::character varying, 'platform'::character varying, 'connected_account'::character varying])::text[]))) NOT VALID;


--
-- Name: orders orders_tax_reversal_status_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_tax_reversal_status_check CHECK (((tax_reversal_status)::text = ANY ((ARRAY['not_required'::character varying, 'pending'::character varying, 'partially_reversed'::character varying, 'reversed'::character varying, 'reconciliation_required'::character varying])::text[]))) NOT VALID;


--
-- Name: orders orders_tax_status_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_tax_status_check CHECK (((tax_status)::text = ANY ((ARRAY['disabled'::character varying, 'calculated'::character varying, 'committed'::character varying, 'reconciliation_required'::character varying])::text[]))) NOT VALID;


--
-- Name: orders orders_total_price_arithmetic_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.orders
    ADD CONSTRAINT orders_total_price_arithmetic_check CHECK ((total_price = (((subtotal + buyer_freight_charge) + buyer_fee) + tax_amount))) NOT VALID;


--
-- Name: platform_settings platform_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_key_unique UNIQUE (key);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: promotion_credits promotion_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_credits
    ADD CONSTRAINT promotion_credits_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_case_events reconciliation_case_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_case_events
    ADD CONSTRAINT reconciliation_case_events_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_cases reconciliation_cases_case_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_cases
    ADD CONSTRAINT reconciliation_cases_case_key_key UNIQUE (case_key);


--
-- Name: reconciliation_cases reconciliation_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_cases
    ADD CONSTRAINT reconciliation_cases_pkey PRIMARY KEY (id);


--
-- Name: resend_webhook_events resend_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resend_webhook_events
    ADD CONSTRAINT resend_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_order_direction_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_direction_unique UNIQUE (order_id, direction);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: sample_requests sample_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_requests
    ADD CONSTRAINT sample_requests_pkey PRIMARY KEY (id);


--
-- Name: saved_searches saved_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);


--
-- Name: seller_buyer_notes seller_buyer_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_buyer_notes
    ADD CONSTRAINT seller_buyer_notes_pkey PRIMARY KEY (id);


--
-- Name: seller_buyer_tags seller_buyer_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_buyer_tags
    ADD CONSTRAINT seller_buyer_tags_pkey PRIMARY KEY (id);


--
-- Name: shipments shipments_order_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_unique UNIQUE (order_id);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: shipping_addresses shipping_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_addresses
    ADD CONSTRAINT shipping_addresses_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: users users_auth_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_id_unique UNIQUE (auth_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verification_drafts verification_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_drafts
    ADD CONSTRAINT verification_drafts_pkey PRIMARY KEY (user_id);


--
-- Name: watchlist watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_pkey PRIMARY KEY (id);


--
-- Name: watchlist watchlist_user_listing_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_listing_unique UNIQUE (user_id, listing_id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: agent_actions_action_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_actions_action_type_idx ON public.agent_actions USING btree (action_type);


--
-- Name: agent_actions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_actions_created_at_idx ON public.agent_actions USING btree (created_at);


--
-- Name: agent_actions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_actions_user_id_idx ON public.agent_actions USING btree (user_id);


--
-- Name: agent_configs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_configs_user_id_idx ON public.agent_configs USING btree (user_id);


--
-- Name: audit_events_action_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_action_created_idx ON public.audit_events USING btree (action, created_at);


--
-- Name: audit_events_actor_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_actor_created_idx ON public.audit_events USING btree (actor_id, created_at);


--
-- Name: audit_events_entity_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_entity_created_idx ON public.audit_events USING btree (entity_type, entity_id, created_at);


--
-- Name: audit_events_idempotency_key_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX audit_events_idempotency_key_unique_idx ON public.audit_events USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: buyer_request_responses_one_accepted_per_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX buyer_request_responses_one_accepted_per_request_idx ON public.buyer_request_responses USING btree (request_id) WHERE (status = 'accepted'::public.request_response_status);


--
-- Name: buyer_request_responses_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_request_responses_request_id_idx ON public.buyer_request_responses USING btree (request_id);


--
-- Name: buyer_request_responses_request_seller_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX buyer_request_responses_request_seller_unique_idx ON public.buyer_request_responses USING btree (request_id, seller_id);


--
-- Name: buyer_request_responses_seller_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_request_responses_seller_created_idx ON public.buyer_request_responses USING btree (seller_id, created_at DESC);


--
-- Name: buyer_request_responses_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_request_responses_seller_id_idx ON public.buyer_request_responses USING btree (seller_id);


--
-- Name: buyer_requests_buyer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_requests_buyer_id_idx ON public.buyer_requests USING btree (buyer_id);


--
-- Name: buyer_requests_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_requests_created_at_idx ON public.buyer_requests USING btree (created_at);


--
-- Name: buyer_requests_destination_zip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_requests_destination_zip_idx ON public.buyer_requests USING btree (destination_zip);


--
-- Name: buyer_requests_material_types_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_requests_material_types_gin_idx ON public.buyer_requests USING gin (material_types);


--
-- Name: buyer_requests_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_requests_status_created_idx ON public.buyer_requests USING btree (status, created_at DESC);


--
-- Name: buyer_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX buyer_requests_status_idx ON public.buyer_requests USING btree (status);


--
-- Name: conversations_buyer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_buyer_id_idx ON public.conversations USING btree (buyer_id);


--
-- Name: conversations_buyer_last_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_buyer_last_message_idx ON public.conversations USING btree (buyer_id, last_message_at DESC);


--
-- Name: conversations_last_message_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_last_message_at_idx ON public.conversations USING btree (last_message_at);


--
-- Name: conversations_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_listing_id_idx ON public.conversations USING btree (listing_id);


--
-- Name: conversations_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_seller_id_idx ON public.conversations USING btree (seller_id);


--
-- Name: conversations_seller_last_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_seller_last_message_idx ON public.conversations USING btree (seller_id, last_message_at DESC);


--
-- Name: dispute_evidence_dispute_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispute_evidence_dispute_id_idx ON public.dispute_evidence USING btree (dispute_id);


--
-- Name: dispute_evidence_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispute_evidence_type_idx ON public.dispute_evidence USING btree (evidence_type);


--
-- Name: dispute_evidence_uploader_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispute_evidence_uploader_id_idx ON public.dispute_evidence USING btree (uploader_id);


--
-- Name: dispute_messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispute_messages_created_at_idx ON public.dispute_messages USING btree (created_at);


--
-- Name: dispute_messages_dispute_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispute_messages_dispute_id_idx ON public.dispute_messages USING btree (dispute_id);


--
-- Name: dispute_messages_sender_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dispute_messages_sender_id_idx ON public.dispute_messages USING btree (sender_id);


--
-- Name: disputes_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX disputes_created_at_idx ON public.disputes USING btree (created_at);


--
-- Name: disputes_initiator_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX disputes_initiator_id_idx ON public.disputes USING btree (initiator_id);


--
-- Name: disputes_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX disputes_order_id_idx ON public.disputes USING btree (order_id);


--
-- Name: disputes_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX disputes_status_idx ON public.disputes USING btree (status);


--
-- Name: email_deliveries_idempotency_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_deliveries_idempotency_key_uidx ON public.email_deliveries USING btree (idempotency_key);


--
-- Name: email_deliveries_provider_message_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_deliveries_provider_message_id_uidx ON public.email_deliveries USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: email_deliveries_recipient_emails_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_deliveries_recipient_emails_gin_idx ON public.email_deliveries USING gin (recipient_emails);


--
-- Name: email_deliveries_status_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_deliveries_status_updated_idx ON public.email_deliveries USING btree (status, updated_at);


--
-- Name: email_recipient_suppressions_reason_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_recipient_suppressions_reason_idx ON public.email_recipient_suppressions USING btree (reason);


--
-- Name: feedback_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_created_at_idx ON public.feedback USING btree (created_at);


--
-- Name: feedback_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_type_idx ON public.feedback USING btree (type);


--
-- Name: feedback_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_user_id_idx ON public.feedback USING btree (user_id);


--
-- Name: followups_due_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX followups_due_at_idx ON public.followups USING btree (due_at);


--
-- Name: followups_pending_due_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX followups_pending_due_id_idx ON public.followups USING btree (due_at, id) WHERE (status = 'pending'::public.followup_status);


--
-- Name: followups_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX followups_seller_id_idx ON public.followups USING btree (seller_id);


--
-- Name: followups_seller_status_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX followups_seller_status_due_idx ON public.followups USING btree (seller_id, status, due_at);


--
-- Name: followups_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX followups_status_idx ON public.followups USING btree (status);


--
-- Name: idx_listings_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_slug ON public.listings USING btree (slug);


--
-- Name: inventory_adjustments_listing_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_adjustments_listing_created_idx ON public.inventory_adjustments USING btree (listing_id, created_at);


--
-- Name: inventory_adjustments_source_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_adjustments_source_created_idx ON public.inventory_adjustments USING btree (source_id, created_at);


--
-- Name: inventory_ingest_batches_id_source_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_ingest_batches_id_source_seller_idx ON public.inventory_ingest_batches USING btree (id, source_id, seller_id);


--
-- Name: inventory_ingest_batches_seller_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_ingest_batches_seller_created_idx ON public.inventory_ingest_batches USING btree (seller_id, created_at);


--
-- Name: inventory_ingest_batches_source_idempotency_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_ingest_batches_source_idempotency_uidx ON public.inventory_ingest_batches USING btree (source_id, idempotency_key);


--
-- Name: inventory_ingest_batches_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_ingest_batches_status_idx ON public.inventory_ingest_batches USING btree (status);


--
-- Name: inventory_reconciliations_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_reconciliations_listing_idx ON public.inventory_reconciliations USING btree (listing_id);


--
-- Name: inventory_reconciliations_seller_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_reconciliations_seller_status_idx ON public.inventory_reconciliations USING btree (seller_id, status, detected_at);


--
-- Name: inventory_reconciliations_source_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_reconciliations_source_status_idx ON public.inventory_reconciliations USING btree (source_id, status);


--
-- Name: inventory_source_items_id_source_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_source_items_id_source_seller_idx ON public.inventory_source_items USING btree (id, source_id, seller_id);


--
-- Name: inventory_source_items_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_source_items_listing_idx ON public.inventory_source_items USING btree (listing_id);


--
-- Name: inventory_source_items_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_source_items_seller_idx ON public.inventory_source_items USING btree (seller_id);


--
-- Name: inventory_source_items_source_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_source_items_source_external_uidx ON public.inventory_source_items USING btree (source_id, external_item_id);


--
-- Name: inventory_source_items_source_listing_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_source_items_source_listing_uidx ON public.inventory_source_items USING btree (source_id, listing_id) WHERE (listing_id IS NOT NULL);


--
-- Name: inventory_sources_api_key_hash_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_sources_api_key_hash_uidx ON public.inventory_sources USING btree (api_key_hash);


--
-- Name: inventory_sources_id_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_sources_id_seller_idx ON public.inventory_sources USING btree (id, seller_id);


--
-- Name: inventory_sources_seller_external_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_sources_seller_external_uidx ON public.inventory_sources USING btree (seller_id, external_source_id);


--
-- Name: inventory_sources_seller_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_sources_seller_status_idx ON public.inventory_sources USING btree (seller_id, status);


--
-- Name: inventory_sources_staleness_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_sources_staleness_idx ON public.inventory_sources USING btree (status, last_successful_ingest_at);


--
-- Name: listing_drafts_ai_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_drafts_ai_seller_id_idx ON public.listing_drafts_ai USING btree (seller_id);


--
-- Name: listing_drafts_ai_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_drafts_ai_status_idx ON public.listing_drafts_ai USING btree (status);


--
-- Name: listing_promotions_refund_idempotency_key_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX listing_promotions_refund_idempotency_key_unique_idx ON public.listing_promotions USING btree (refund_idempotency_key) WHERE (refund_idempotency_key IS NOT NULL);


--
-- Name: listing_promotions_refund_retry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_promotions_refund_retry_idx ON public.listing_promotions USING btree (refund_next_attempt_at) WHERE ((payment_status)::text = 'refund_pending'::text);


--
-- Name: listing_promotions_stripe_refund_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX listing_promotions_stripe_refund_id_unique_idx ON public.listing_promotions USING btree (stripe_refund_id) WHERE (stripe_refund_id IS NOT NULL);


--
-- Name: listings_ask_price_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_ask_price_idx ON public.listings USING btree (ask_price_per_sq_ft);


--
-- Name: listings_certifications_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_certifications_gin_idx ON public.listings USING gin (COALESCE(certifications, '[]'::jsonb));


--
-- Name: listings_condition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_condition_idx ON public.listings USING btree (condition);


--
-- Name: listings_confirmation_due_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_confirmation_due_at_idx ON public.listings USING btree (confirmation_due_at);


--
-- Name: listings_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_created_at_idx ON public.listings USING btree (created_at);


--
-- Name: listings_location_lat_lng_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_location_lat_lng_idx ON public.listings USING btree (location_lat, location_lng);


--
-- Name: listings_location_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_location_state_idx ON public.listings USING btree (location_state);


--
-- Name: listings_material_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_material_type_idx ON public.listings USING btree (material_type);


--
-- Name: listings_public_browse_due_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_public_browse_due_created_idx ON public.listings USING btree (confirmation_due_at, created_at DESC) WHERE ((status = 'active'::public.listing_status) AND (last_confirmed_at IS NOT NULL) AND (confirmation_due_at IS NOT NULL));


--
-- Name: listings_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_published_at_idx ON public.listings USING btree (published_at DESC) WHERE (published_at IS NOT NULL);


--
-- Name: listings_search_document_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_search_document_trgm_idx ON public.listings USING gin (search_document public.gin_trgm_ops);


--
-- Name: listings_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_seller_id_idx ON public.listings USING btree (seller_id);


--
-- Name: listings_seller_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_seller_status_created_idx ON public.listings USING btree (seller_id, status, created_at DESC);


--
-- Name: listings_seller_views_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_seller_views_idx ON public.listings USING btree (seller_id, views_count DESC);


--
-- Name: listings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_status_idx ON public.listings USING btree (status);


--
-- Name: listings_tax_code_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_tax_code_status_idx ON public.listings USING btree (tax_code_status);


--
-- Name: listings_total_sq_ft_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_total_sq_ft_idx ON public.listings USING btree (total_sq_ft);


--
-- Name: media_buyer_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_buyer_request_id_idx ON public.media USING btree (buyer_request_id);


--
-- Name: media_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_listing_id_idx ON public.media USING btree (listing_id);


--
-- Name: media_pending_deletion_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_pending_deletion_claim_idx ON public.media USING btree (deletion_claimed_at) WHERE (deletion_claim_token IS NOT NULL);


--
-- Name: media_sort_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_sort_order_idx ON public.media USING btree (listing_id, sort_order);


--
-- Name: media_uploader_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_uploader_id_idx ON public.media USING btree (uploader_id);


--
-- Name: media_uploadthing_key_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX media_uploadthing_key_unique_idx ON public.media USING btree (key) WHERE (key IS NOT NULL);


--
-- Name: messages_conversation_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conversation_created_idx ON public.messages USING btree (conversation_id, created_at DESC);


--
-- Name: messages_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conversation_id_idx ON public.messages USING btree (conversation_id);


--
-- Name: messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_created_at_idx ON public.messages USING btree (created_at);


--
-- Name: messages_sender_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_sender_id_idx ON public.messages USING btree (sender_id);


--
-- Name: notifications_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at);


--
-- Name: notifications_read_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_read_idx ON public.notifications USING btree (user_id, read);


--
-- Name: notifications_user_created_desc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_created_desc_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: notifications_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id);


--
-- Name: notifications_user_unread_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_unread_created_idx ON public.notifications USING btree (user_id, created_at DESC) WHERE (read = false);


--
-- Name: offer_events_actor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offer_events_actor_id_idx ON public.offer_events USING btree (actor_id);


--
-- Name: offer_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offer_events_created_at_idx ON public.offer_events USING btree (created_at);


--
-- Name: offer_events_offer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offer_events_offer_id_idx ON public.offer_events USING btree (offer_id);


--
-- Name: offers_buyer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offers_buyer_id_idx ON public.offers USING btree (buyer_id);


--
-- Name: offers_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offers_created_at_idx ON public.offers USING btree (created_at);


--
-- Name: offers_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offers_expires_at_idx ON public.offers USING btree (expires_at);


--
-- Name: offers_id_buyer_seller_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX offers_id_buyer_seller_listing_idx ON public.offers USING btree (id, buyer_id, seller_id, listing_id);


--
-- Name: offers_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offers_listing_id_idx ON public.offers USING btree (listing_id);


--
-- Name: offers_seller_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offers_seller_created_idx ON public.offers USING btree (seller_id, created_at DESC);


--
-- Name: offers_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offers_seller_id_idx ON public.offers USING btree (seller_id);


--
-- Name: offers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX offers_status_idx ON public.offers USING btree (status);


--
-- Name: orders_buyer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_buyer_id_idx ON public.orders USING btree (buyer_id);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at);


--
-- Name: orders_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_listing_id_idx ON public.orders USING btree (listing_id);


--
-- Name: orders_open_inventory_reservation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_open_inventory_reservation_idx ON public.orders USING btree (listing_id) WHERE ((inventory_released_at IS NULL) AND (status = ANY (ARRAY['pending'::public.order_status, 'confirmed'::public.order_status, 'processing'::public.order_status, 'shipped'::public.order_status, 'cancelled'::public.order_status])));


--
-- Name: orders_order_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_order_number_idx ON public.orders USING btree (order_number);


--
-- Name: orders_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_seller_id_idx ON public.orders USING btree (seller_id);


--
-- Name: orders_seller_payment_confirmed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_seller_payment_confirmed_idx ON public.orders USING btree (seller_id, payment_status, confirmed_at DESC) WHERE (confirmed_at IS NOT NULL);


--
-- Name: orders_seller_refunded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_seller_refunded_at_idx ON public.orders USING btree (seller_id, refunded_at DESC) WHERE (refunded_at IS NOT NULL);


--
-- Name: orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_status_idx ON public.orders USING btree (status);


--
-- Name: orders_stripe_tax_calculation_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_stripe_tax_calculation_id_unique_idx ON public.orders USING btree (stripe_tax_calculation_id) WHERE (stripe_tax_calculation_id IS NOT NULL);


--
-- Name: orders_stripe_tax_transaction_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_stripe_tax_transaction_id_unique_idx ON public.orders USING btree (stripe_tax_transaction_id) WHERE (stripe_tax_transaction_id IS NOT NULL);


--
-- Name: promotion_credits_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotion_credits_expires_at_idx ON public.promotion_credits USING btree (expires_at);


--
-- Name: promotion_credits_stripe_invoice_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX promotion_credits_stripe_invoice_id_unique_idx ON public.promotion_credits USING btree (stripe_invoice_id);


--
-- Name: promotion_credits_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotion_credits_user_id_idx ON public.promotion_credits USING btree (user_id);


--
-- Name: promotions_active_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotions_active_expires_idx ON public.listing_promotions USING btree (is_active, expires_at);


--
-- Name: promotions_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotions_listing_id_idx ON public.listing_promotions USING btree (listing_id);


--
-- Name: promotions_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotions_seller_id_idx ON public.listing_promotions USING btree (seller_id);


--
-- Name: promotions_tier_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promotions_tier_active_idx ON public.listing_promotions USING btree (tier, is_active);


--
-- Name: reconciliation_case_events_actor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_case_events_actor_id_idx ON public.reconciliation_case_events USING btree (actor_id);


--
-- Name: reconciliation_case_events_case_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_case_events_case_created_idx ON public.reconciliation_case_events USING btree (case_id, created_at);


--
-- Name: reconciliation_cases_assigned_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_cases_assigned_to_idx ON public.reconciliation_cases USING btree (assigned_to);


--
-- Name: reconciliation_cases_dispute_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_cases_dispute_id_idx ON public.reconciliation_cases USING btree (dispute_id);


--
-- Name: reconciliation_cases_next_retry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_cases_next_retry_idx ON public.reconciliation_cases USING btree (next_retry_at) WHERE (status = ANY (ARRAY['open'::public.reconciliation_case_status, 'in_progress'::public.reconciliation_case_status, 'waiting_external'::public.reconciliation_case_status]));


--
-- Name: reconciliation_cases_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_cases_order_id_idx ON public.reconciliation_cases USING btree (order_id);


--
-- Name: reconciliation_cases_status_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reconciliation_cases_status_severity_idx ON public.reconciliation_cases USING btree (status, severity);


--
-- Name: resend_webhook_events_message_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resend_webhook_events_message_created_idx ON public.resend_webhook_events USING btree (provider_message_id, event_created_at);


--
-- Name: reviews_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_created_at_idx ON public.reviews USING btree (created_at);


--
-- Name: reviews_direction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_direction_idx ON public.reviews USING btree (direction);


--
-- Name: reviews_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_order_id_idx ON public.reviews USING btree (order_id);


--
-- Name: reviews_rating_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_rating_idx ON public.reviews USING btree (rating);


--
-- Name: reviews_reviewee_direction_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_reviewee_direction_created_idx ON public.reviews USING btree (reviewee_id, direction, created_at DESC);


--
-- Name: reviews_reviewee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_reviewee_id_idx ON public.reviews USING btree (reviewee_id);


--
-- Name: reviews_reviewer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_reviewer_id_idx ON public.reviews USING btree (reviewer_id);


--
-- Name: reviews_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_seller_id_idx ON public.reviews USING btree (seller_id);


--
-- Name: sample_requests_buyer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_requests_buyer_id_idx ON public.sample_requests USING btree (buyer_id);


--
-- Name: sample_requests_listing_buyer_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sample_requests_listing_buyer_open_idx ON public.sample_requests USING btree (listing_id, buyer_id) WHERE (status = ANY (ARRAY['requested'::public.sample_request_status, 'approved'::public.sample_request_status, 'shipped'::public.sample_request_status]));


--
-- Name: sample_requests_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_requests_listing_id_idx ON public.sample_requests USING btree (listing_id);


--
-- Name: sample_requests_retention_purge_after_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_requests_retention_purge_after_idx ON public.sample_requests USING btree (retention_purge_after);


--
-- Name: sample_requests_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_requests_seller_id_idx ON public.sample_requests USING btree (seller_id);


--
-- Name: sample_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_requests_status_idx ON public.sample_requests USING btree (status, created_at);


--
-- Name: saved_searches_alert_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_searches_alert_enabled_idx ON public.saved_searches USING btree (alert_enabled);


--
-- Name: saved_searches_due_alerts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_searches_due_alerts_idx ON public.saved_searches USING btree (alert_frequency, COALESCE(last_alert_at, created_at), id) WHERE (alert_enabled = true);


--
-- Name: saved_searches_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_searches_user_id_idx ON public.saved_searches USING btree (user_id);


--
-- Name: seller_buyer_notes_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_buyer_notes_created_at_idx ON public.seller_buyer_notes USING btree (created_at);


--
-- Name: seller_buyer_notes_seller_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_buyer_notes_seller_buyer_idx ON public.seller_buyer_notes USING btree (seller_id, buyer_id);


--
-- Name: seller_buyer_tags_buyer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_buyer_tags_buyer_id_idx ON public.seller_buyer_tags USING btree (buyer_id);


--
-- Name: seller_buyer_tags_seller_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_buyer_tags_seller_id_idx ON public.seller_buyer_tags USING btree (seller_id);


--
-- Name: seller_buyer_tags_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX seller_buyer_tags_unique_idx ON public.seller_buyer_tags USING btree (seller_id, buyer_id, tag);


--
-- Name: shipments_cancellation_requested_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_cancellation_requested_idx ON public.shipments USING btree (cancellation_requested_at, id) WHERE ((cancellation_requested_at IS NOT NULL) AND (status <> 'cancelled'::public.shipment_status));


--
-- Name: shipments_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_order_id_idx ON public.shipments USING btree (order_id);


--
-- Name: shipments_priority1_shipment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_priority1_shipment_id_idx ON public.shipments USING btree (priority1_shipment_id);


--
-- Name: shipments_pro_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_pro_number_idx ON public.shipments USING btree (pro_number);


--
-- Name: shipments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_status_idx ON public.shipments USING btree (status);


--
-- Name: shipments_status_updated_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_status_updated_id_idx ON public.shipments USING btree (status, updated_at, id);


--
-- Name: shipping_addresses_retention_purge_after_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipping_addresses_retention_purge_after_idx ON public.shipping_addresses USING btree (retention_purge_after);


--
-- Name: shipping_addresses_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipping_addresses_user_id_idx ON public.shipping_addresses USING btree (user_id);


--
-- Name: stripe_webhook_events_pending_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stripe_webhook_events_pending_received_idx ON public.stripe_webhook_events USING btree (status, received_at, id);


--
-- Name: stripe_webhook_events_processed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stripe_webhook_events_processed_at_idx ON public.stripe_webhook_events USING btree (processed_at);


--
-- Name: stripe_webhook_events_status_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stripe_webhook_events_status_started_idx ON public.stripe_webhook_events USING btree (status, processing_started_at);


--
-- Name: user_preferences_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_preferences_role_idx ON public.user_preferences USING btree (role);


--
-- Name: user_preferences_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_preferences_user_id_idx ON public.user_preferences USING btree (user_id);


--
-- Name: users_stripe_account_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_stripe_account_id_unique_idx ON public.users USING btree (stripe_account_id) WHERE (stripe_account_id IS NOT NULL);


--
-- Name: users_stripe_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_stripe_customer_id_idx ON public.users USING btree (stripe_customer_id);


--
-- Name: users_verification_data_purge_after_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_verification_data_purge_after_idx ON public.users USING btree (verification_data_purge_after);


--
-- Name: users_verification_submission_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_verification_submission_id_idx ON public.users USING btree (verification_submission_id);


--
-- Name: verification_drafts_purge_after_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_drafts_purge_after_idx ON public.verification_drafts USING btree (purge_after);


--
-- Name: watchlist_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX watchlist_listing_id_idx ON public.watchlist USING btree (listing_id);


--
-- Name: watchlist_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX watchlist_user_id_idx ON public.watchlist USING btree (user_id);


--
-- Name: audit_events audit_events_prevent_update_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_events_prevent_update_delete BEFORE DELETE OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_event_mutation();


--
-- Name: dispute_evidence dispute_evidence_block_deleting_media; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dispute_evidence_block_deleting_media BEFORE INSERT OR UPDATE OF media_id ON public.dispute_evidence FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_attachment_to_deleting_media();


--
-- Name: inventory_adjustments inventory_adjustments_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_adjustments_append_only BEFORE DELETE OR UPDATE ON public.inventory_adjustments FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_adjustment_mutation();


--
-- Name: listings listings_set_published_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_set_published_at BEFORE INSERT OR UPDATE OF status ON public.listings FOR EACH ROW EXECUTE FUNCTION public.ensure_listing_published_at();


--
-- Name: orders orders_00_set_original_seller_payout; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_00_set_original_seller_payout BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_order_original_seller_payout();


--
-- Name: orders orders_enforce_financial_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_enforce_financial_snapshot BEFORE INSERT OR UPDATE OF quantity_sq_ft, price_per_sq_ft, subtotal, buyer_fee, seller_fee, total_price, stripe_processing_fee, seller_stripe_fee, platform_stripe_fee, original_seller_payout, seller_payout, buyer_freight_charge, seller_freight_contribution, tax_amount, taxable_inventory_amount, taxable_freight_amount, taxable_buyer_fee_amount, refunded_amount, transfer_reversed_amount ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_order_financial_snapshot();


--
-- Name: orders orders_prevent_commercial_snapshot_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_prevent_commercial_snapshot_update BEFORE UPDATE OF quantity_sq_ft, price_per_sq_ft, subtotal, buyer_fee, seller_fee, total_price, stripe_processing_fee, seller_stripe_fee, platform_stripe_fee, original_seller_payout, carrier_rate, shipping_margin, commercial_policy_snapshot ON public.orders FOR EACH ROW EXECUTE FUNCTION public.prevent_order_commercial_snapshot_update();


--
-- Name: orders orders_prevent_freight_funding_snapshot_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_prevent_freight_funding_snapshot_update BEFORE UPDATE OF shipping_price, freight_funding_mode, buyer_freight_charge, seller_freight_contribution ON public.orders FOR EACH ROW EXECUTE FUNCTION public.prevent_order_freight_funding_snapshot_update();


--
-- Name: orders orders_prevent_tax_evidence_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_prevent_tax_evidence_mutation BEFORE UPDATE OF tax_policy_snapshot, tax_liability, tax_status, tax_amount, taxable_inventory_amount, taxable_freight_amount, taxable_buyer_fee_amount, stripe_tax_calculation_id, stripe_tax_transaction_id, stripe_tax_account_id, tax_jurisdiction_summary, tax_calculation_evidence, tax_calculated_at, tax_committed_at, tax_reversal_status, stripe_tax_reversal_transaction_ids, tax_reversal_evidence ON public.orders FOR EACH ROW EXECUTE FUNCTION public.prevent_order_tax_evidence_mutation();


--
-- Name: orders orders_set_legacy_freight_funding_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_set_legacy_freight_funding_defaults BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_legacy_order_freight_funding_defaults();


--
-- Name: sample_requests sample_requests_set_retention_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sample_requests_set_retention_defaults BEFORE INSERT OR UPDATE ON public.sample_requests FOR EACH ROW EXECUTE FUNCTION public.set_sample_request_retention_defaults();


--
-- Name: shipping_addresses shipping_addresses_set_retention_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shipping_addresses_set_retention_defaults BEFORE INSERT OR UPDATE ON public.shipping_addresses FOR EACH ROW EXECUTE FUNCTION public.set_shipping_address_retention_defaults();


--
-- Name: users users_set_verification_retention_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_set_verification_retention_defaults BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_user_verification_retention_defaults();


--
-- Name: verification_drafts verification_drafts_set_retention_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER verification_drafts_set_retention_defaults BEFORE INSERT OR UPDATE ON public.verification_drafts FOR EACH ROW EXECUTE FUNCTION public.set_verification_draft_retention_defaults();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_actions agent_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_actions
    ADD CONSTRAINT agent_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: agent_configs agent_configs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_configs
    ADD CONSTRAINT agent_configs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: audit_events audit_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: buyer_request_responses buyer_request_responses_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_request_responses
    ADD CONSTRAINT buyer_request_responses_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: buyer_request_responses buyer_request_responses_listing_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_request_responses
    ADD CONSTRAINT buyer_request_responses_listing_seller_lineage_fk FOREIGN KEY (listing_id, seller_id) REFERENCES public.listings(id, seller_id) ON DELETE SET NULL (listing_id) NOT VALID;


--
-- Name: buyer_request_responses buyer_request_responses_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_request_responses
    ADD CONSTRAINT buyer_request_responses_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.buyer_requests(id) ON DELETE CASCADE;


--
-- Name: buyer_request_responses buyer_request_responses_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_request_responses
    ADD CONSTRAINT buyer_request_responses_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: buyer_requests buyer_requests_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_requests
    ADD CONSTRAINT buyer_requests_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_buyer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_buyer_id_users_id_fk FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: conversations conversations_listing_id_listings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_listing_id_listings_id_fk FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_listing_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_listing_seller_lineage_fk FOREIGN KEY (listing_id, seller_id) REFERENCES public.listings(id, seller_id) ON DELETE CASCADE NOT VALID;


--
-- Name: conversations conversations_seller_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_seller_id_users_id_fk FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: dispute_evidence dispute_evidence_dispute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_evidence
    ADD CONSTRAINT dispute_evidence_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.disputes(id) ON DELETE CASCADE;


--
-- Name: dispute_evidence dispute_evidence_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_evidence
    ADD CONSTRAINT dispute_evidence_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE RESTRICT;


--
-- Name: dispute_evidence dispute_evidence_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_evidence
    ADD CONSTRAINT dispute_evidence_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: dispute_messages dispute_messages_dispute_id_disputes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_messages
    ADD CONSTRAINT dispute_messages_dispute_id_disputes_id_fk FOREIGN KEY (dispute_id) REFERENCES public.disputes(id) ON DELETE CASCADE;


--
-- Name: dispute_messages dispute_messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispute_messages
    ADD CONSTRAINT dispute_messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: disputes disputes_initiator_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_initiator_id_users_id_fk FOREIGN KEY (initiator_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: disputes disputes_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- Name: disputes disputes_resolved_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disputes
    ADD CONSTRAINT disputes_resolved_by_users_id_fk FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_recipient_suppressions email_recipient_suppressions_source_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_recipient_suppressions
    ADD CONSTRAINT email_recipient_suppressions_source_delivery_id_fkey FOREIGN KEY (source_delivery_id) REFERENCES public.email_deliveries(id) ON DELETE SET NULL;


--
-- Name: feedback feedback_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: followups followups_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: followups followups_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: followups followups_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: inventory_adjustments inventory_adjustments_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_adjustments inventory_adjustments_ingest_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_ingest_batch_id_fkey FOREIGN KEY (ingest_batch_id) REFERENCES public.inventory_ingest_batches(id) ON DELETE RESTRICT;


--
-- Name: inventory_adjustments inventory_adjustments_ingest_batch_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_ingest_batch_lineage_fk FOREIGN KEY (ingest_batch_id, source_id, seller_id) REFERENCES public.inventory_ingest_batches(id, source_id, seller_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: inventory_adjustments inventory_adjustments_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE RESTRICT;


--
-- Name: inventory_adjustments inventory_adjustments_listing_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_listing_seller_lineage_fk FOREIGN KEY (listing_id, seller_id) REFERENCES public.listings(id, seller_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: inventory_adjustments inventory_adjustments_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: inventory_adjustments inventory_adjustments_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.inventory_sources(id) ON DELETE RESTRICT;


--
-- Name: inventory_adjustments inventory_adjustments_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.inventory_source_items(id) ON DELETE RESTRICT;


--
-- Name: inventory_adjustments inventory_adjustments_source_item_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_source_item_lineage_fk FOREIGN KEY (source_item_id, source_id, seller_id) REFERENCES public.inventory_source_items(id, source_id, seller_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: inventory_adjustments inventory_adjustments_source_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_adjustments
    ADD CONSTRAINT inventory_adjustments_source_seller_lineage_fk FOREIGN KEY (source_id, seller_id) REFERENCES public.inventory_sources(id, seller_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: inventory_ingest_batches inventory_ingest_batches_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_ingest_batches
    ADD CONSTRAINT inventory_ingest_batches_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: inventory_ingest_batches inventory_ingest_batches_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_ingest_batches
    ADD CONSTRAINT inventory_ingest_batches_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.inventory_sources(id) ON DELETE RESTRICT;


--
-- Name: inventory_ingest_batches inventory_ingest_batches_source_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_ingest_batches
    ADD CONSTRAINT inventory_ingest_batches_source_seller_lineage_fk FOREIGN KEY (source_id, seller_id) REFERENCES public.inventory_sources(id, seller_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: inventory_reconciliations inventory_reconciliations_ingest_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_ingest_batch_id_fkey FOREIGN KEY (ingest_batch_id) REFERENCES public.inventory_ingest_batches(id) ON DELETE RESTRICT;


--
-- Name: inventory_reconciliations inventory_reconciliations_ingest_batch_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_ingest_batch_lineage_fk FOREIGN KEY (ingest_batch_id, source_id, seller_id) REFERENCES public.inventory_ingest_batches(id, source_id, seller_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: inventory_reconciliations inventory_reconciliations_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: inventory_reconciliations inventory_reconciliations_listing_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_listing_seller_lineage_fk FOREIGN KEY (listing_id, seller_id) REFERENCES public.listings(id, seller_id) ON DELETE SET NULL (listing_id) NOT VALID;


--
-- Name: inventory_reconciliations inventory_reconciliations_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_reconciliations inventory_reconciliations_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: inventory_reconciliations inventory_reconciliations_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.inventory_sources(id) ON DELETE RESTRICT;


--
-- Name: inventory_reconciliations inventory_reconciliations_source_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.inventory_source_items(id) ON DELETE RESTRICT;


--
-- Name: inventory_reconciliations inventory_reconciliations_source_item_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_source_item_lineage_fk FOREIGN KEY (source_item_id, source_id, seller_id) REFERENCES public.inventory_source_items(id, source_id, seller_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: inventory_reconciliations inventory_reconciliations_source_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reconciliations
    ADD CONSTRAINT inventory_reconciliations_source_seller_lineage_fk FOREIGN KEY (source_id, seller_id) REFERENCES public.inventory_sources(id, seller_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: inventory_source_items inventory_source_items_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_source_items
    ADD CONSTRAINT inventory_source_items_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: inventory_source_items inventory_source_items_listing_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_source_items
    ADD CONSTRAINT inventory_source_items_listing_seller_lineage_fk FOREIGN KEY (listing_id, seller_id) REFERENCES public.listings(id, seller_id) ON DELETE SET NULL (listing_id) NOT VALID;


--
-- Name: inventory_source_items inventory_source_items_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_source_items
    ADD CONSTRAINT inventory_source_items_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: inventory_source_items inventory_source_items_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_source_items
    ADD CONSTRAINT inventory_source_items_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.inventory_sources(id) ON DELETE CASCADE;


--
-- Name: inventory_source_items inventory_source_items_source_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_source_items
    ADD CONSTRAINT inventory_source_items_source_seller_lineage_fk FOREIGN KEY (source_id, seller_id) REFERENCES public.inventory_sources(id, seller_id) ON DELETE CASCADE NOT VALID;


--
-- Name: inventory_sources inventory_sources_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_sources
    ADD CONSTRAINT inventory_sources_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: listing_drafts_ai listing_drafts_ai_applied_to_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_drafts_ai
    ADD CONSTRAINT listing_drafts_ai_applied_to_listing_id_fkey FOREIGN KEY (applied_to_listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: listing_drafts_ai listing_drafts_ai_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_drafts_ai
    ADD CONSTRAINT listing_drafts_ai_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: listing_promotions listing_promotions_listing_id_listings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_promotions
    ADD CONSTRAINT listing_promotions_listing_id_listings_id_fk FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_promotions listing_promotions_seller_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_promotions
    ADD CONSTRAINT listing_promotions_seller_id_users_id_fk FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: listings listings_seller_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_seller_id_users_id_fk FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: listings listings_tax_code_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_tax_code_verified_by_fkey FOREIGN KEY (tax_code_verified_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: media media_buyer_request_id_buyer_requests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_buyer_request_id_buyer_requests_id_fk FOREIGN KEY (buyer_request_id) REFERENCES public.buyer_requests(id) ON DELETE CASCADE;


--
-- Name: media media_buyer_request_owner_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_buyer_request_owner_lineage_fk FOREIGN KEY (buyer_request_id, uploader_id) REFERENCES public.buyer_requests(id, buyer_id) ON DELETE CASCADE NOT VALID;


--
-- Name: media media_listing_id_listings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_listing_id_listings_id_fk FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: media media_listing_owner_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_listing_owner_lineage_fk FOREIGN KEY (listing_id, uploader_id) REFERENCES public.listings(id, seller_id) ON DELETE CASCADE NOT VALID;


--
-- Name: media media_uploader_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media
    ADD CONSTRAINT media_uploader_id_users_id_fk FOREIGN KEY (uploader_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_conversations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_conversations_id_fk FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: offer_events offer_events_actor_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_events
    ADD CONSTRAINT offer_events_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: offer_events offer_events_offer_id_offers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer_events
    ADD CONSTRAINT offer_events_offer_id_offers_id_fk FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;


--
-- Name: offers offers_buyer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_buyer_id_users_id_fk FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: offers offers_last_actor_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_last_actor_id_users_id_fk FOREIGN KEY (last_actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: offers offers_listing_id_listings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_listing_id_listings_id_fk FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: offers offers_listing_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_listing_seller_lineage_fk FOREIGN KEY (listing_id, seller_id) REFERENCES public.listings(id, seller_id) ON DELETE CASCADE NOT VALID;


--
-- Name: offers offers_seller_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_seller_id_users_id_fk FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: orders orders_buyer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_buyer_id_users_id_fk FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: orders orders_listing_id_listings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_listing_id_listings_id_fk FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE RESTRICT;


--
-- Name: orders orders_listing_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_listing_seller_lineage_fk FOREIGN KEY (listing_id, seller_id) REFERENCES public.listings(id, seller_id) ON DELETE RESTRICT NOT VALID;


--
-- Name: orders orders_offer_id_offers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_offer_id_offers_id_fk FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;


--
-- Name: orders orders_offer_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_offer_lineage_fk FOREIGN KEY (offer_id, buyer_id, seller_id, listing_id) REFERENCES public.offers(id, buyer_id, seller_id, listing_id) NOT VALID;


--
-- Name: orders orders_seller_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_seller_id_users_id_fk FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: platform_settings platform_settings_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: promotion_credits promotion_credits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_credits
    ADD CONSTRAINT promotion_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reconciliation_case_events reconciliation_case_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_case_events
    ADD CONSTRAINT reconciliation_case_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reconciliation_case_events reconciliation_case_events_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_case_events
    ADD CONSTRAINT reconciliation_case_events_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.reconciliation_cases(id) ON DELETE CASCADE;


--
-- Name: reconciliation_cases reconciliation_cases_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_cases
    ADD CONSTRAINT reconciliation_cases_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reconciliation_cases reconciliation_cases_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_cases
    ADD CONSTRAINT reconciliation_cases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reconciliation_cases reconciliation_cases_dispute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_cases
    ADD CONSTRAINT reconciliation_cases_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.disputes(id) ON DELETE SET NULL;


--
-- Name: reconciliation_cases reconciliation_cases_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_cases
    ADD CONSTRAINT reconciliation_cases_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- Name: reconciliation_cases reconciliation_cases_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliation_cases
    ADD CONSTRAINT reconciliation_cases_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reviews reviews_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_reviewee_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewee_id_users_id_fk FOREIGN KEY (reviewee_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: reviews reviews_reviewer_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewer_id_users_id_fk FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: reviews reviews_seller_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_seller_id_users_id_fk FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: sample_requests sample_requests_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_requests
    ADD CONSTRAINT sample_requests_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sample_requests sample_requests_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_requests
    ADD CONSTRAINT sample_requests_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: sample_requests sample_requests_listing_seller_lineage_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_requests
    ADD CONSTRAINT sample_requests_listing_seller_lineage_fk FOREIGN KEY (listing_id, seller_id) REFERENCES public.listings(id, seller_id) ON DELETE CASCADE NOT VALID;


--
-- Name: sample_requests sample_requests_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_requests
    ADD CONSTRAINT sample_requests_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_searches saved_searches_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seller_buyer_notes seller_buyer_notes_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_buyer_notes
    ADD CONSTRAINT seller_buyer_notes_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seller_buyer_notes seller_buyer_notes_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_buyer_notes
    ADD CONSTRAINT seller_buyer_notes_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seller_buyer_tags seller_buyer_tags_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_buyer_tags
    ADD CONSTRAINT seller_buyer_tags_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seller_buyer_tags seller_buyer_tags_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_buyer_tags
    ADD CONSTRAINT seller_buyer_tags_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shipments shipments_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;


--
-- Name: shipping_addresses shipping_addresses_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_addresses
    ADD CONSTRAINT shipping_addresses_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: verification_drafts verification_drafts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_drafts
    ADD CONSTRAINT verification_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_listing_id_listings_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_listing_id_listings_id_fk FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: watchlist watchlist_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watchlist
    ADD CONSTRAINT watchlist_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_request_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_request_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: dispute_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: email_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: email_recipient_suppressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_recipient_suppressions ENABLE ROW LEVEL SECURITY;

--
-- Name: followups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_ingest_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_ingest_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_source_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_source_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_drafts_ai; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_drafts_ai ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: reconciliation_case_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reconciliation_case_events ENABLE ROW LEVEL SECURITY;

--
-- Name: reconciliation_cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reconciliation_cases ENABLE ROW LEVEL SECURITY;

--
-- Name: resend_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resend_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: sample_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sample_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_buyer_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_buyer_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_buyer_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_buyer_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: shipments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

--
-- Name: shipping_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipping_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: verification_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verification_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO dashboard_user;
GRANT USAGE ON SCHEMA auth TO postgres;


--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT ALL ON SCHEMA extensions TO dashboard_user;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.email() TO dashboard_user;


--
-- Name: FUNCTION jwt(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.jwt() TO postgres;
GRANT ALL ON FUNCTION auth.jwt() TO dashboard_user;


--
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.role() TO dashboard_user;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.uid() TO dashboard_user;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.grant_pg_cron_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_net_access(); Type: ACL; Schema: extensions; Owner: -
--

REVOKE ALL ON FUNCTION extensions.grant_pg_net_access() FROM supabase_admin;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO supabase_admin WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;


--
-- Name: FUNCTION pgrst_ddl_watch(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_drop_watch(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: ACL; Schema: extensions; Owner: -
--

GRANT ALL ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION enforce_order_financial_snapshot(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_order_financial_snapshot() TO service_role;


--
-- Name: FUNCTION ensure_listing_published_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_listing_published_at() TO service_role;


--
-- Name: FUNCTION prevent_audit_event_mutation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_audit_event_mutation() TO service_role;


--
-- Name: FUNCTION prevent_evidence_attachment_to_deleting_media(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_evidence_attachment_to_deleting_media() TO service_role;


--
-- Name: FUNCTION prevent_inventory_adjustment_mutation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_inventory_adjustment_mutation() TO service_role;


--
-- Name: FUNCTION prevent_order_commercial_snapshot_update(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_order_commercial_snapshot_update() TO service_role;


--
-- Name: FUNCTION prevent_order_freight_funding_snapshot_update(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_order_freight_funding_snapshot_update() TO service_role;


--
-- Name: FUNCTION prevent_order_tax_evidence_mutation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_order_tax_evidence_mutation() TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION set_legacy_order_freight_funding_defaults(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_legacy_order_freight_funding_defaults() TO service_role;


--
-- Name: FUNCTION set_order_original_seller_payout(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_order_original_seller_payout() TO service_role;


--
-- Name: FUNCTION set_sample_request_retention_defaults(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_sample_request_retention_defaults() TO service_role;


--
-- Name: FUNCTION set_shipping_address_retention_defaults(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_shipping_address_retention_defaults() TO service_role;


--
-- Name: FUNCTION set_user_verification_retention_defaults(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_user_verification_retention_defaults() TO service_role;


--
-- Name: FUNCTION set_verification_draft_retention_defaults(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_verification_draft_retention_defaults() TO service_role;


--
-- Name: TABLE audit_log_entries; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.audit_log_entries TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.audit_log_entries TO postgres;
GRANT SELECT ON TABLE auth.audit_log_entries TO postgres WITH GRANT OPTION;


--
-- Name: TABLE custom_oauth_providers; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.custom_oauth_providers TO postgres;
GRANT ALL ON TABLE auth.custom_oauth_providers TO dashboard_user;


--
-- Name: TABLE flow_state; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.flow_state TO postgres;
GRANT SELECT ON TABLE auth.flow_state TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.flow_state TO dashboard_user;


--
-- Name: TABLE identities; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.identities TO postgres;
GRANT SELECT ON TABLE auth.identities TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.identities TO dashboard_user;


--
-- Name: TABLE instances; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.instances TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.instances TO postgres;
GRANT SELECT ON TABLE auth.instances TO postgres WITH GRANT OPTION;


--
-- Name: TABLE mfa_amr_claims; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_amr_claims TO postgres;
GRANT SELECT ON TABLE auth.mfa_amr_claims TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_amr_claims TO dashboard_user;


--
-- Name: TABLE mfa_challenges; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_challenges TO postgres;
GRANT SELECT ON TABLE auth.mfa_challenges TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_challenges TO dashboard_user;


--
-- Name: TABLE mfa_factors; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.mfa_factors TO postgres;
GRANT SELECT ON TABLE auth.mfa_factors TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.mfa_factors TO dashboard_user;


--
-- Name: TABLE oauth_authorizations; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_authorizations TO postgres;
GRANT ALL ON TABLE auth.oauth_authorizations TO dashboard_user;


--
-- Name: TABLE oauth_client_states; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_client_states TO postgres;
GRANT ALL ON TABLE auth.oauth_client_states TO dashboard_user;


--
-- Name: TABLE oauth_clients; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_clients TO postgres;
GRANT ALL ON TABLE auth.oauth_clients TO dashboard_user;


--
-- Name: TABLE oauth_consents; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.oauth_consents TO postgres;
GRANT ALL ON TABLE auth.oauth_consents TO dashboard_user;


--
-- Name: TABLE one_time_tokens; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.one_time_tokens TO postgres;
GRANT SELECT ON TABLE auth.one_time_tokens TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.one_time_tokens TO dashboard_user;


--
-- Name: TABLE refresh_tokens; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.refresh_tokens TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.refresh_tokens TO postgres;
GRANT SELECT ON TABLE auth.refresh_tokens TO postgres WITH GRANT OPTION;


--
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;
GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;


--
-- Name: TABLE saml_providers; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_providers TO postgres;
GRANT SELECT ON TABLE auth.saml_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_providers TO dashboard_user;


--
-- Name: TABLE saml_relay_states; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.saml_relay_states TO postgres;
GRANT SELECT ON TABLE auth.saml_relay_states TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.saml_relay_states TO dashboard_user;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: auth; Owner: -
--

GRANT SELECT ON TABLE auth.schema_migrations TO postgres WITH GRANT OPTION;


--
-- Name: TABLE sessions; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sessions TO postgres;
GRANT SELECT ON TABLE auth.sessions TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sessions TO dashboard_user;


--
-- Name: TABLE sso_domains; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_domains TO postgres;
GRANT SELECT ON TABLE auth.sso_domains TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_domains TO dashboard_user;


--
-- Name: TABLE sso_providers; Type: ACL; Schema: auth; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.sso_providers TO postgres;
GRANT SELECT ON TABLE auth.sso_providers TO postgres WITH GRANT OPTION;
GRANT ALL ON TABLE auth.sso_providers TO dashboard_user;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.users TO dashboard_user;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE auth.users TO postgres;
GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;


--
-- Name: TABLE webauthn_challenges; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.webauthn_challenges TO postgres;
GRANT ALL ON TABLE auth.webauthn_challenges TO dashboard_user;


--
-- Name: TABLE webauthn_credentials; Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON TABLE auth.webauthn_credentials TO postgres;
GRANT ALL ON TABLE auth.webauthn_credentials TO dashboard_user;


--
-- Name: TABLE agent_actions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_actions TO service_role;


--
-- Name: TABLE agent_configs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_configs TO service_role;


--
-- Name: TABLE audit_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_events TO service_role;


--
-- Name: TABLE buyer_request_responses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.buyer_request_responses TO service_role;


--
-- Name: TABLE buyer_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.buyer_requests TO service_role;


--
-- Name: TABLE conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversations TO service_role;


--
-- Name: TABLE dispute_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dispute_evidence TO service_role;


--
-- Name: TABLE dispute_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dispute_messages TO service_role;


--
-- Name: TABLE disputes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.disputes TO service_role;


--
-- Name: TABLE email_deliveries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_deliveries TO service_role;


--
-- Name: TABLE email_recipient_suppressions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_recipient_suppressions TO service_role;


--
-- Name: TABLE feedback; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.feedback TO service_role;


--
-- Name: TABLE followups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.followups TO service_role;


--
-- Name: TABLE inventory_adjustments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_adjustments TO service_role;


--
-- Name: TABLE inventory_ingest_batches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_ingest_batches TO service_role;


--
-- Name: TABLE inventory_reconciliations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_reconciliations TO service_role;


--
-- Name: TABLE inventory_source_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_source_items TO service_role;


--
-- Name: TABLE inventory_sources; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_sources TO service_role;


--
-- Name: TABLE listing_drafts_ai; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.listing_drafts_ai TO service_role;


--
-- Name: TABLE listing_promotions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.listing_promotions TO service_role;


--
-- Name: TABLE listings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.listings TO service_role;


--
-- Name: TABLE media; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.media TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE offer_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.offer_events TO service_role;


--
-- Name: TABLE offers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.offers TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE platform_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.platform_settings TO service_role;


--
-- Name: TABLE promotion_credits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promotion_credits TO service_role;


--
-- Name: TABLE reconciliation_case_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reconciliation_case_events TO service_role;


--
-- Name: TABLE reconciliation_cases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reconciliation_cases TO service_role;


--
-- Name: TABLE resend_webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resend_webhook_events TO service_role;


--
-- Name: TABLE reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reviews TO service_role;


--
-- Name: TABLE sample_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sample_requests TO service_role;


--
-- Name: TABLE saved_searches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.saved_searches TO service_role;


--
-- Name: TABLE seller_buyer_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.seller_buyer_notes TO service_role;


--
-- Name: TABLE seller_buyer_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.seller_buyer_tags TO service_role;


--
-- Name: TABLE shipments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shipments TO service_role;


--
-- Name: TABLE shipping_addresses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shipping_addresses TO service_role;


--
-- Name: TABLE stripe_webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stripe_webhook_events TO service_role;


--
-- Name: TABLE user_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_preferences TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE verification_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.verification_drafts TO service_role;


--
-- Name: TABLE watchlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.watchlist TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: extensions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON SEQUENCES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: extensions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON FUNCTIONS TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: extensions; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON TABLES TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT MAINTAIN ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT MAINTAIN ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


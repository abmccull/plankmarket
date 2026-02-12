# Database Migration Summary

**Date**: 2026-02-12
**Migration File**: `/Users/tsc-001/plankmarket/drizzle/migration.sql`
**Status**: ✅ Successfully Executed

## Overview

This migration brings the PostgreSQL database in sync with the Drizzle schema definitions. All changes were executed successfully with proper foreign keys, constraints, and indexes.

## Changes Applied

### 1. New Enum Types Created

- **`offer_status`**: `pending`, `accepted`, `rejected`, `countered`, `withdrawn`, `expired`
- **`dispute_status`**: `open`, `under_review`, `resolved_buyer`, `resolved_seller`, `closed`

### 2. New Columns Added to Existing Tables

#### `users` table
- `verification_status` (VARCHAR(20), NOT NULL, DEFAULT 'unverified')
- `verification_doc_url` (TEXT)
- `verification_requested_at` (TIMESTAMP WITH TIME ZONE)
- `verification_notes` (TEXT)

#### `orders` table
- `escrow_status` (VARCHAR(20), NOT NULL, DEFAULT 'none')

### 3. New Tables Created

#### `reviews`
Customer reviews for completed orders with:
- One-to-one relationship with orders (unique order_id)
- References to reviewer (buyer) and seller
- Overall rating (1-5, validated)
- Optional detailed ratings (communication, accuracy, shipping)
- Title and comment fields
- Seller response capability
- Proper indexes on all foreign keys, rating, and timestamps

#### `offers`
Price negotiation offers with:
- References to listing, buyer, and seller
- Offer pricing details (price per sq ft, quantity, total)
- Counter-offer support
- Status tracking using `offer_status` enum
- Message and counter-message fields
- Expiration timestamp
- Proper indexes on foreign keys, status, and timestamps

#### `disputes`
Order disputes and resolution tracking with:
- One-to-one relationship with orders (unique order_id)
- References to initiator and resolver
- Reason and description fields
- Status tracking using `dispute_status` enum
- Resolution details (text, resolver, timestamp)
- Proper indexes on foreign keys, status, and timestamps

#### `dispute_messages`
Messages within dispute threads with:
- Reference to dispute (cascade on delete)
- Reference to sender
- Message text
- Timestamp for chronological ordering
- Proper indexes on foreign keys and timestamps

#### `feedback`
User feedback and bug reports with:
- Optional reference to user (nullable for anonymous feedback)
- Page context field
- Type field (bug, feature, general)
- Message text
- Optional rating (1-5)
- Proper indexes on user_id, type, and timestamp

### 4. Indexes Created

All foreign key columns are indexed for optimal query performance:

**reviews**: 7 indexes (including primary key and unique constraint)
**offers**: 7 indexes
**disputes**: 6 indexes (including primary key and unique constraint)
**dispute_messages**: 4 indexes
**feedback**: 4 indexes

### 5. Data Integrity Constraints

- All foreign keys use appropriate `ON DELETE` actions:
  - `CASCADE` for dependent data (reviews, offers, dispute_messages)
  - `RESTRICT` for important relationships (users in most cases)
  - `SET NULL` for optional relationships (feedback user_id, dispute resolver)
- Check constraints on rating fields (1-5)
- Unique constraints where appropriate (order_id in reviews and disputes)
- NOT NULL constraints on required fields

## Verification

All changes were verified post-migration:
- ✅ All 5 new tables created
- ✅ All 5 new columns added (4 on users, 1 on orders)
- ✅ Both new enums created
- ✅ All 28 indexes created successfully
- ✅ All foreign key constraints established
- ✅ All check constraints applied

## Database State

The database now contains these tables:
- dispute_messages
- disputes
- feedback
- listings
- media
- notifications
- offers
- orders
- reviews
- saved_searches
- users
- watchlist

## Notes

- Migration uses `IF NOT EXISTS` and `DO $$ BEGIN ... EXCEPTION` patterns to be idempotent
- All timestamps use `WITH TIME ZONE` for proper timezone handling
- UUID primary keys use `gen_random_uuid()` for generation
- Comments added to tables and important columns for documentation
- The migration can be safely re-run without causing errors

## Next Steps

The database schema is now fully synchronized with the Drizzle schema definitions. The following features are now supported:

1. **Reviews System**: Buyers can review completed orders with detailed ratings
2. **Offer System**: Buyers can make offers and sellers can counter-offer
3. **Dispute System**: Order disputes with threaded messaging
4. **Feedback System**: Users can submit feedback and bug reports
5. **Seller Verification**: Sellers can request verification with document upload

All tRPC routers and API endpoints that depend on these tables should now function correctly.

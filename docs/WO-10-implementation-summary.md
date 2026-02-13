# WO-10: Listing Detail Page - Contact Seller & Make Offer Implementation

## Overview
Successfully implemented Contact Seller and Make Offer functionality on the listing detail page, enabling buyers to communicate with sellers and submit offers directly from the listing.

## Components Created

### 1. MakeOfferModal Component
**Location:** `/src/components/offers/make-offer-modal.tsx`

**Features:**
- Price per sq ft input with validation (positive, max $1000)
- Quantity input with validation (positive, max 1,000,000 sq ft)
- Optional message field (max 1000 characters)
- Real-time calculation of subtotal, buyer fee (3%), and total
- Warning when quantity is below MOQ
- Displays asking price and minimum order for reference
- Proper loading states during submission
- Full form validation with error messages
- Success redirect to offer detail page

**Accessibility:**
- All inputs have associated labels
- ARIA attributes for errors (`aria-invalid`, `aria-describedby`)
- Error messages use `role="alert"`
- Keyboard accessible (Tab, Enter to submit, Escape to close)
- Loading spinner with proper ARIA attributes

### 2. Updated Listing Detail Page
**Location:** `/src/app/(marketplace)/listings/[id]/page.tsx`

**New Features Added:**

#### Contact Seller Button
- MessageSquare icon from lucide-react
- Calls `trpc.message.getOrCreateConversation` mutation
- Redirects to `/messages/[conversationId]` on success
- Shows loading spinner during conversation creation
- Toast notifications for success/error states
- Auth-gated: redirects to login if not authenticated

#### Make Offer Button
- HandCoins icon from lucide-react
- Opens MakeOfferModal dialog
- Only visible when `listing.allowOffers === true`
- Auth-gated: redirects to login if not authenticated

#### Button Hierarchy & Layout
Three distinct layouts based on user state:

**1. Authenticated Buyer (not listing owner):**
- **Primary**: Buy Now button (or Purchase if no buyNowPrice)
- **Secondary**: Make Offer + Contact Seller (grid layout)
  - If `allowOffers === true`: 2-column grid with both buttons
  - If `allowOffers === false`: Contact Seller takes full width

**2. Unauthenticated User:**
- All buttons visible but redirect to login with return URL
- Preserves context: `/login?redirect=/listings/[id]`

**3. Seller Viewing Own Listing:**
- Edit Listing button (primary)
- View as Buyer button (disabled placeholder)
- No buyer action buttons (Contact/Offer) shown

## State Management

### New State Variables
```typescript
const [showMakeOfferModal, setShowMakeOfferModal] = useState(false);
const [isContactingLoading, setIsContactingLoading] = useState(false);
```

### New tRPC Mutation
```typescript
const getOrCreateConversation = trpc.message.getOrCreateConversation.useMutation();
```

## Handler Functions

### handleContactSeller()
1. Check authentication → redirect if not authenticated
2. Set loading state
3. Call `getOrCreateConversation.mutateAsync({ listingId })`
4. On success: show toast, navigate to `/messages/[conversationId]`
5. On error: show error toast
6. Clear loading state

### handleMakeOfferClick()
1. Check authentication → redirect if not authenticated
2. Open MakeOfferModal
3. Modal handles offer submission and success navigation

### isOwnListing Check
```typescript
const isOwnListing = user && listing?.sellerId === user.id;
```

## Responsive Design

### Desktop Layout
- Buy Now button: full width
- Make Offer + Contact Seller: 2-column grid (sm:grid-cols-2)
- Clear visual hierarchy with proper spacing

### Mobile Layout
- All buttons stack vertically
- Full width for better touch targets
- Contact Seller takes full width when no Make Offer button

## Testing

### MakeOfferModal Tests
**Location:** `/src/components/offers/__tests__/make-offer-modal.test.tsx`

**Coverage:**
- ✅ Modal rendering (open/closed states)
- ✅ Default values (10% below asking, full lot quantity)
- ✅ Price and quantity calculations
- ✅ MOQ warning display
- ✅ Form validation (required fields, constraints)
- ✅ Successful offer submission
- ✅ Error handling
- ✅ Loading states
- ✅ Cancel functionality
- ✅ Accessibility attributes
- ✅ Optional message handling

### Listing Actions Tests
**Location:** `/src/app/(marketplace)/listings/[id]/__tests__/listing-actions.test.tsx`

**Coverage:**
- ✅ Button rendering for authenticated buyers
- ✅ Contact Seller functionality
- ✅ Make Offer modal opening
- ✅ Loading states
- ✅ Error handling
- ✅ Unauthenticated user redirects
- ✅ Seller viewing own listing
- ✅ Button layout and hierarchy
- ✅ Conditional rendering (allowOffers)
- ✅ Accessibility (ARIA labels, icons)

## Files Modified

1. **Created:**
   - `/src/components/offers/make-offer-modal.tsx` (329 lines)
   - `/src/components/offers/__tests__/make-offer-modal.test.tsx` (467 lines)
   - `/src/app/(marketplace)/listings/[id]/__tests__/listing-actions.test.tsx` (520 lines)

2. **Modified:**
   - `/src/app/(marketplace)/listings/[id]/page.tsx`
     - Added imports: `MakeOfferModal`, `MessageSquare`, `HandCoins`
     - Added state: `showMakeOfferModal`, `isContactingLoading`, `user` from auth store
     - Added mutation: `getOrCreateConversation`
     - Added handlers: `handleContactSeller`, `handleMakeOfferClick`
     - Updated action buttons section with new layout and conditional rendering
     - Added MakeOfferModal component at bottom

## Integration Points

### tRPC Procedures Used
1. **`trpc.message.getOrCreateConversation`**
   - Input: `{ listingId: string }`
   - Output: `{ id: string }` (conversation ID)

2. **`trpc.offer.createOffer`**
   - Input: `{ listingId, offerPricePerSqFt, quantitySqFt, message? }`
   - Output: `{ id: string }` (offer ID)

### Validation Schema
Uses `createOfferSchema` from `/src/lib/validators/offer.ts`:
- `offerPricePerSqFt`: number, positive, max 1000
- `quantitySqFt`: number, positive, max 1,000,000
- `message`: string, max 1000 chars, optional

## User Flow

### Making an Offer
1. Buyer views listing detail page
2. Clicks "Make Offer" button
3. Modal opens with pre-filled values (90% of ask, full lot)
4. Buyer adjusts price, quantity, adds optional message
5. Real-time calculation shows subtotal, fee, total
6. Clicks "Submit Offer"
7. Loading state → API call
8. Success → Toast notification + Redirect to `/offers/[offerId]`
9. Error → Toast error, modal stays open

### Contacting Seller
1. Buyer views listing detail page
2. Clicks "Contact Seller" button
3. Button shows loading state ("Connecting...")
4. API creates/retrieves conversation
5. Success → Toast notification + Redirect to `/messages/[conversationId]`
6. Error → Toast error, button returns to normal state

## Edge Cases Handled

1. **Unauthenticated users**: Redirect to login with return URL
2. **Seller viewing own listing**: Show Edit/View as Buyer instead
3. **Quantity below MOQ**: Warning message (still allows submission)
4. **No offers allowed**: Hide Make Offer button, show Contact Seller only
5. **Form validation errors**: Clear error messages with proper ARIA
6. **API errors**: Toast notifications, no navigation
7. **Loading states**: Disabled inputs/buttons, visual feedback
8. **Modal dismiss during loading**: Prevented
9. **Empty message field**: Handled as optional, transforms to undefined

## Accessibility Features

### Semantic HTML
- `<button>` for all interactive actions
- `<label>` for all form inputs
- `<dialog>` for modal (via shadcn/ui Dialog)

### ARIA Attributes
- `aria-label` on icon-only buttons: "Make an offer on this listing", "Contact the seller"
- `aria-hidden="true"` on decorative icons
- `aria-invalid` on form fields with errors
- `aria-describedby` links inputs to error messages
- `role="alert"` on validation errors

### Keyboard Navigation
- All buttons accessible via Tab
- Enter/Space to activate buttons
- Escape to close modal
- Form submission via Enter key

### Focus Management
- Modal traps focus when open
- Focus returns to trigger on close
- Loading states disable inputs but remain focusable

## Design Decisions

1. **Default offer values**: Set to 90% of asking price and full lot quantity to speed up common use case
2. **Button hierarchy**: Buy Now as primary (larger, more prominent), Offer/Contact as secondary (outline style)
3. **Grid layout**: 2-column on desktop for secondary actions, stack on mobile
4. **Loading state**: Inline spinner in button rather than separate overlay
5. **Toast position**: Default (bottom-right) for non-intrusive feedback
6. **Redirect on success**: Immediate navigation to offer/message page for clear next action
7. **Own listing check**: Prevents sellers from contacting themselves or making offers on their own listings

## Next Steps / Future Enhancements

1. **Quick offer templates**: "5% below ask", "10% below ask", etc.
2. **Recent offers display**: Show previous offers on this listing (if any)
3. **Seller response time indicator**: Average response time badge
4. **In-page messaging**: Embedded chat instead of redirect
5. **Bulk actions**: Make offers on multiple listings at once
6. **Save draft offers**: Persist form state to localStorage
7. **View as Buyer**: Actually implement the feature (currently disabled)

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive (iOS Safari, Chrome Android)
- Requires JavaScript enabled
- Uses native `<dialog>` element via Radix UI primitives

## Performance Considerations

- Form state managed by react-hook-form (no unnecessary re-renders)
- Calculations memoized via `watch()` hook
- tRPC mutations use optimistic updates where appropriate
- Images lazy-loaded (existing implementation)
- Modal only renders when open

## Security Considerations

- All inputs validated client-side AND server-side (tRPC schema)
- No sensitive data in URLs or toast messages
- Auth tokens managed via Supabase (httpOnly cookies)
- XSS protection via React's automatic escaping
- CSRF protection via tRPC's built-in safeguards

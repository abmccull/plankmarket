/**
 * Content filter patterns for PlankMarket anti-circumvention system
 *
 * CONTEXT: PlankMarket is a B2B wholesale flooring marketplace.
 * These patterns must NOT flag legitimate flooring content like dimensions,
 * prices, product IDs, square footage, etc.
 */

export type DetectionLevel = "high" | "medium";

export interface Detection {
  level: DetectionLevel;
  type: string; // e.g., "phone", "email", "url", "social_handle", "intent_phrase"
  match: string;
  index: number;
}

/**
 * Whitelist patterns - these are legitimate flooring-related content
 * that should NEVER trigger detections
 */
export const WHITELIST_PATTERNS = [
  // Prices: $2.50, $6,250.00, 2.50/sq ft, $2.50/sqft
  /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*\/\s*(?:sq\s*ft|sqft|square\s*foot))?/gi,

  // Square footage: 2,500 sq ft, 500sqft, 2500 square feet
  /\d{1,3}(?:,\d{3})*\s*(?:sq\s*ft|sqft|square\s*feet?)/gi,

  // Dimensions with quotes: 48" x 40", 3/4" x 5", 12"x12"
  /\d+(?:\/\d+)?"\s*x\s*\d+(?:\/\d+)?"/gi,

  // Dimensions without quotes: 48x40, 12x12, 3x5
  /\b\d+\s*x\s*\d+(?:\s*x\s*\d+)?\b/gi,

  // Product IDs/SKUs: SKU #555-1234, Model 555-1234, SKU-12345, SKU: 12345
  /\b(?:SKU|Model|Item|Part)\s*[:#]?\s*[\w-]+/gi,

  // Order/reference numbers: PM-XXXXXXXX, ORD-12345, #12345
  /\b(?:PM|ORD|REF|INV)-[\w-]+\b/gi,
  /\b#\d{4,}\b/g,

  // ZIP codes: 5-digit standalone (not preceded by phone-like patterns)
  /(?<!\d{3}[-.\s])\b\d{5}\b(?![-.\s]\d{4})/g,

  // Thickness measurements: 3/4", 1/2", 0.5"
  /\b\d+\/\d+"\b/g,
  /\b\d+\.\d+"\b/g,
];

/**
 * HIGH-CONFIDENCE patterns - these should BLOCK content
 */

// US phone numbers - all common formats
export const PHONE_PATTERNS = [
  // (555) 123-4567
  /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/g,

  // 555-123-4567, 555.123.4567, 555 123 4567
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,

  // 5551234567 (10 digits together)
  /\b\d{10}\b/g,

  // +1-555-123-4567, +1 (555) 123-4567
  /\+1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,

  // 1-800-555-1234, 1-888-555-1234 (toll-free)
  /\b1[-.\s]?[8][0][0][-.\s]?\d{3}[-.\s]?\d{4}\b/g,
];

// Email addresses
export const EMAIL_PATTERNS = [
  // Standard email pattern: name@domain.com
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
];

// URLs and domain names
export const URL_PATTERNS = [
  // Full URLs: http://example.com, https://example.com
  /\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?\b/g,

  // Bare domains: example.com, example.net, example.org, example.io, example.co
  /\b[a-zA-Z0-9-]+\.(?:com|net|org|io|co|biz|info)\b/gi,
];

/**
 * MEDIUM-CONFIDENCE patterns - flag for admin review, don't block
 */

// Social handles: @username (but not email @)
export const SOCIAL_HANDLE_PATTERNS = [
  // @username (not preceded by alphanumeric, not followed by domain)
  /(?<![a-zA-Z0-9])@[a-zA-Z0-9_]{3,}(?!\.[a-zA-Z]{2,})/g,
];

// "at/dot" email obfuscation: "name at domain dot com"
export const EMAIL_SUBSTITUTION_PATTERNS = [
  /\b[\w.-]+\s+(?:at|AT|@)\s+[\w.-]+\s+(?:dot|DOT|\.)\s+(?:com|net|org|io|co)\b/gi,
];

// Intent phrases indicating desire to share contact info
export const INTENT_PHRASE_PATTERNS = [
  /\b(?:call|text|email|contact|reach)\s+(?:me|us)\s+(?:at|on|@)/gi,
  /\bmy\s+(?:phone|number|email|cell)\s+(?:is|:)/gi,
  /\breach\s+(?:me|us)\s+at\b/gi,
  /\bget\s+in\s+touch\s+(?:at|via)\b/gi,
  /\bmessage\s+me\s+(?:at|on)\b/gi,
];

/**
 * Helper to strip whitelisted content from text before analysis
 */
export function stripWhitelistedContent(text: string): string {
  let cleaned = text;

  for (const pattern of WHITELIST_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  return cleaned;
}

/**
 * Run all high-confidence patterns and return detections
 */
export function detectHighConfidence(text: string): Detection[] {
  const detections: Detection[] = [];

  // Phone numbers
  for (const pattern of PHONE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      detections.push({
        level: "high",
        type: "phone",
        match: match[0],
        index: match.index!,
      });
    }
  }

  // Email addresses
  for (const pattern of EMAIL_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      detections.push({
        level: "high",
        type: "email",
        match: match[0],
        index: match.index!,
      });
    }
  }

  // URLs
  for (const pattern of URL_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      detections.push({
        level: "high",
        type: "url",
        match: match[0],
        index: match.index!,
      });
    }
  }

  return detections;
}

/**
 * Run all medium-confidence patterns and return detections
 */
export function detectMediumConfidence(text: string): Detection[] {
  const detections: Detection[] = [];

  // Social handles
  for (const pattern of SOCIAL_HANDLE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      detections.push({
        level: "medium",
        type: "social_handle",
        match: match[0],
        index: match.index!,
      });
    }
  }

  // Email substitution patterns
  for (const pattern of EMAIL_SUBSTITUTION_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      detections.push({
        level: "medium",
        type: "email_substitution",
        match: match[0],
        index: match.index!,
      });
    }
  }

  // Intent phrases
  for (const pattern of INTENT_PHRASE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      detections.push({
        level: "medium",
        type: "intent_phrase",
        match: match[0],
        index: match.index!,
      });
    }
  }

  return detections;
}

/**
 * Run all patterns (high and medium confidence) and return all detections
 */
export function detectAllPatterns(text: string): Detection[] {
  const cleaned = stripWhitelistedContent(text);

  const highConfidence = detectHighConfidence(cleaned);
  const mediumConfidence = detectMediumConfidence(cleaned);

  return [...highConfidence, ...mediumConfidence];
}

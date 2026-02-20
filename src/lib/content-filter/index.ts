/**
 * Core content filtering logic for PlankMarket anti-circumvention system
 */

import {
  type Detection,
  stripWhitelistedContent,
  detectHighConfidence,
  detectMediumConfidence,
} from "./patterns";

export interface ContentFilterResult {
  allowed: boolean; // true if no high-confidence detections
  detections: Detection[];
  highConfidenceDetections: Detection[];
  mediumConfidenceDetections: Detection[];
}

/**
 * Analyze content for contact information and circumvention attempts
 *
 * @param text - The text content to analyze (listing description, message, offer note, etc.)
 * @returns ContentFilterResult with detections and allowed status
 *
 * Process:
 * 1. Strip whitelisted patterns (prices, dimensions, SKUs, etc.)
 * 2. Run high-confidence patterns (phone, email, URL)
 * 3. Run medium-confidence patterns (social handles, intent phrases)
 * 4. Return results (blocked if any high-confidence detections found)
 */
export function analyzeContent(text: string): ContentFilterResult {
  // Strip whitelisted flooring-related content first
  const cleanedText = stripWhitelistedContent(text);

  // Detect high-confidence violations (phone, email, URL)
  const highConfidenceDetections = detectHighConfidence(cleanedText);

  // Detect medium-confidence patterns (social handles, intent phrases)
  const mediumConfidenceDetections = detectMediumConfidence(cleanedText);

  // Combine all detections
  const allDetections = [...highConfidenceDetections, ...mediumConfidenceDetections];

  // Content is blocked if ANY high-confidence detections are found
  const allowed = highConfidenceDetections.length === 0;

  return {
    allowed,
    detections: allDetections,
    highConfidenceDetections,
    mediumConfidenceDetections,
  };
}

/**
 * Detect self-referencing identity information in text.
 * Checks if a user mentions their own business name or full name,
 * which could be used to enable off-platform discovery (e.g., Googling).
 *
 * This is context-aware (requires user data) so it runs in the router layer,
 * separate from the static Zod-based pattern matching.
 */
export function detectSelfReference(
  text: string,
  user: { name?: string | null; businessName?: string | null }
): Detection[] {
  const detections: Detection[] = [];
  const normalizedText = text.toLowerCase();

  // Check business name (high-confidence if full match, min 4 chars to avoid false positives)
  if (user.businessName && user.businessName.length >= 4) {
    const normalizedBizName = user.businessName.toLowerCase().trim();
    const index = normalizedText.indexOf(normalizedBizName);
    if (index !== -1) {
      detections.push({
        level: "high",
        type: "business_name",
        match: text.slice(index, index + normalizedBizName.length),
        index,
      });
    }
  }

  // Check full name (first + last, medium-confidence — first names alone are too common)
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      const fullNameLower = user.name.toLowerCase().trim();
      const index = normalizedText.indexOf(fullNameLower);
      if (index !== -1) {
        detections.push({
          level: "medium",
          type: "full_name",
          match: text.slice(index, index + fullNameLower.length),
          index,
        });
      }
    }
  }

  return detections;
}

/**
 * Helper to format detection type as user-friendly string
 */
export function formatDetectionType(type: string): string {
  switch (type) {
    case "phone":
      return "phone number";
    case "email":
      return "email address";
    case "url":
      return "website URL";
    case "social_handle":
      return "social media handle";
    case "email_substitution":
      return "email address";
    case "intent_phrase":
      return "contact information request";
    case "business_name":
      return "business name";
    case "full_name":
      return "personal name";
    default:
      return "contact information";
  }
}

/**
 * Get user-friendly error message for blocked content
 */
export function getBlockedContentMessage(
  fieldName: string,
  detections: Detection[]
): string {
  if (detections.length === 0) {
    return `Your ${fieldName} appears to contain contact information. For your security, all communication must stay on PlankMarket.`;
  }

  // Get unique detection types
  const types = [...new Set(detections.map((d) => formatDetectionType(d.type)))];

  if (types.length === 1) {
    return `Your ${fieldName} appears to contain a ${types[0]}. For your security, all communication must stay on PlankMarket.`;
  }

  // Multiple types detected
  const typeList = types.slice(0, -1).join(", ") + " or " + types[types.length - 1];
  return `Your ${fieldName} appears to contain ${typeList}. For your security, all communication must stay on PlankMarket.`;
}

// Re-export types and patterns for convenience
export type { Detection, DetectionLevel } from "./patterns";

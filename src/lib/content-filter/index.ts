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

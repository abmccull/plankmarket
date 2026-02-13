import Anthropic from "@anthropic-ai/sdk";

interface VerificationResult {
  score: number; // 0-100 confidence
  approved: boolean; // score >= 90
  reasoning: string; // Human-readable explanation
  checks: {
    einFormat: { pass: boolean; note: string };
    websiteAnalysis: { pass: boolean; note: string };
    documentAnalysis: { pass: boolean; note: string };
    crossReference: { pass: boolean; note: string };
    redFlags: { found: boolean; note: string };
  };
}

interface VerificationParams {
  businessName: string;
  einTaxId: string;
  businessWebsite: string | null;
  businessLicenseUrl: string | null;
  role: string;
  name: string | null;
  email: string;
  businessAddress?: string | null;
}

/**
 * Sanitizes user input before interpolating into AI prompts
 * Prevents prompt injection by removing newlines and special markdown characters
 */
function sanitizeForPrompt(input: string): string {
  return input
    .replace(/[\n\r]/g, " ")
    .replace(/[#*`]/g, "")
    .trim()
    .slice(0, 500);
}

/**
 * Fetches an image URL and converts to base64 for Anthropic API
 * Returns null if fetch fails or content is not an image
 */
async function fetchImageAsBase64(
  url: string,
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PlankMarket-VerificationBot/1.0",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    // Map content type to Anthropic's supported media types
    let mediaType: string;
    if (contentType.includes("png")) {
      mediaType = "image/png";
    } else if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      mediaType = "image/jpeg";
    } else if (contentType.includes("gif")) {
      mediaType = "image/gif";
    } else if (contentType.includes("webp")) {
      mediaType = "image/webp";
    } else {
      return null;
    }

    return { base64, mediaType };
  } catch (error) {
    console.error("Failed to fetch image:", error);
    return null;
  }
}

/**
 * Verifies a business using Claude AI
 * Analyzes business information for legitimacy and compliance
 */
export async function verifyBusiness(
  params: VerificationParams,
): Promise<VerificationResult> {
  const {
    businessName,
    einTaxId,
    businessWebsite,
    businessLicenseUrl,
    role,
    name,
    email,
    businessAddress,
  } = params;

  try {
    const apiKey =
      process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      throw new Error("Anthropic API key not configured");
    }

    const anthropic = new Anthropic({ apiKey });

    // Build the prompt content
    const promptText = `You are a B2B marketplace compliance reviewer for PlankMarket, a flooring industry marketplace connecting sellers and buyers.

Your task is to analyze a business verification submission and determine if this is a legitimate business that should be approved for the platform.

## Submission Data:
- Business Name: ${sanitizeForPrompt(businessName)}
- EIN/Tax ID: ${sanitizeForPrompt(einTaxId)}
- Business Website: ${businessWebsite ? sanitizeForPrompt(businessWebsite) : "Not provided"}
- Role: ${sanitizeForPrompt(role)}
- Contact Name: ${name ? sanitizeForPrompt(name) : "Not provided"}
- Contact Email: ${sanitizeForPrompt(email)}
- Business Address: ${businessAddress ? sanitizeForPrompt(businessAddress) : "Not provided"}

## Your Analysis Should:

1. **EIN Format Check**: Verify the EIN follows the format XX-XXXXXXX (two digits, hyphen, seven digits). This is required for US businesses.

2. **Website Analysis**: If a website is provided, assess whether it appears to be a legitimate business website related to flooring, construction, lumber, interior design, or related B2B industries. Consider:
   - Does the domain suggest a real business?
   - Is it related to the flooring/construction industry?

3. **Document Analysis**: ${businessLicenseUrl ? "A business license/document image is attached. Analyze it for authenticity, professionalism, and relevance. Does it appear to be a legitimate business document? Does it match the submitted business name?" : "No business license document was provided. This significantly reduces confidence in verification."}

4. **Cross-Reference**: Check if the business name, EIN, website, and address appear consistent with each other. Look for mismatches or discrepancies.

5. **Red Flags**: Identify any suspicious indicators:
   - Generic email addresses (gmail, yahoo, hotmail) for business contact
   - Mismatched information across fields
   - Obvious placeholder or fake data
   - URL patterns suggesting scams or temporary domains

## Scoring Guidelines:
- **90-100**: Clearly legitimate business with consistent, verifiable information
- **70-89**: Likely legitimate but with minor issues (e.g., missing optional info, newer domain)
- **50-69**: Uncertain - significant issues or incomplete information requiring human review
- **Below 50**: Suspicious submission with multiple red flags

## Output Format:
Return ONLY valid JSON matching this exact structure (no markdown, no additional text):

{
  "score": <number 0-100>,
  "approved": <boolean, true if score >= 90>,
  "reasoning": "<2-3 sentence summary of your decision>",
  "checks": {
    "einFormat": {
      "pass": <boolean>,
      "note": "<brief explanation>"
    },
    "websiteAnalysis": {
      "pass": <boolean>,
      "note": "<brief explanation>"
    },
    "documentAnalysis": {
      "pass": <boolean>,
      "note": "<brief explanation>"
    },
    "crossReference": {
      "pass": <boolean>,
      "note": "<brief explanation>"
    },
    "redFlags": {
      "found": <boolean>,
      "note": "<list any red flags or 'None found'>"
    }
  }
}`;

    // Build content blocks
    const contentBlocks: Anthropic.MessageParam["content"] = [
      {
        type: "text",
        text: promptText,
      },
    ];

    // Try to fetch and attach the business license document if provided
    if (businessLicenseUrl) {
      const imageData = await fetchImageAsBase64(businessLicenseUrl);
      if (imageData) {
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: imageData.mediaType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: imageData.base64,
          },
        });
      } else {
        // Update prompt to note document fetch failure
        contentBlocks[0] = {
          type: "text",
          text: promptText.replace(
            "A business license/document image is attached.",
            "A business license URL was provided but could not be fetched for analysis. This reduces confidence.",
          ),
        };
      }
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: contentBlocks,
        },
      ],
    });

    // Extract the text response
    const responseText =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    if (!responseText) {
      throw new Error("Empty response from Claude API");
    }

    // Parse JSON response
    const result: VerificationResult = JSON.parse(responseText);

    // Validate the response structure
    if (
      typeof result.score !== "number" ||
      typeof result.approved !== "boolean" ||
      !result.checks
    ) {
      throw new Error("Invalid response structure from Claude API");
    }

    return result;
  } catch (error) {
    console.error("AI verification failed:", error);

    // Return a safe fallback result
    return {
      score: 0,
      approved: false,
      reasoning:
        error instanceof Error
          ? `Verification system error: ${error.message}`
          : "Verification system encountered an unexpected error",
      checks: {
        einFormat: {
          pass: false,
          note: "Could not verify due to system error",
        },
        websiteAnalysis: {
          pass: false,
          note: "Could not verify due to system error",
        },
        documentAnalysis: {
          pass: false,
          note: "Could not verify due to system error",
        },
        crossReference: {
          pass: false,
          note: "Could not verify due to system error",
        },
        redFlags: {
          found: true,
          note: "System error prevented verification",
        },
      },
    };
  }
}

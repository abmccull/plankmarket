import Anthropic from "@anthropic-ai/sdk";
import type {
  ExtractedListingFields,
  FieldConfidence,
} from "@/server/db/schema/listing-drafts-ai";

const EXTRACTION_PROMPT = `You are a flooring product data extraction assistant for PlankMarket, a B2B flooring marketplace.

Extract structured product information from the provided text (spec sheet, invoice, product description, etc.).

Return a JSON object with two keys:
- "fields": extracted product data
- "confidence": per-field confidence ("high", "medium", or "low")

Extractable fields and their types/allowed values:
- materialType: one of ["hardwood", "engineered", "laminate", "vinyl_lvp", "bamboo", "tile", "other"]
- species: string (e.g., "Oak", "Hickory", "Maple", "Walnut")
- finish: one of ["matte", "semi_gloss", "gloss", "wire_brushed", "hand_scraped", "distressed", "smooth", "textured", "oiled", "unfinished", "other"]
- grade: one of ["select", "1_common", "2_common", "3_common", "cabin", "character", "rustic", "premium", "standard", "economy", "other"]
- color: string (e.g., "Autumn Bronze", "Natural Oak")
- colorFamily: one of ["light", "medium", "dark", "gray", "white", "blonde", "brown", "red", "ebony", "natural", "multi"]
- thickness: number in INCHES (convert from mm: divide by 25.4)
- width: number in INCHES (convert from mm: divide by 25.4, from cm: divide by 2.54)
- length: number in INCHES (convert accordingly)
- wearLayer: number in MM (for vinyl/LVP: convert from mil by multiplying by 0.0254)
- brand: string
- modelNumber: string
- totalSqFt: number
- sqFtPerBox: number
- boxesPerPallet: number
- totalPallets: number
- condition: one of ["new_overstock", "discontinued", "slight_damage", "returns", "seconds", "remnants", "closeout", "other"]
- certifications: array of strings from ["FSC", "FloorScore", "GreenGuard", "GreenGuard Gold", "CARB2", "LEED", "NAUF"]

Rules:
- Only extract fields you can identify with reasonable confidence
- Do NOT guess or hallucinate values
- Return ONLY valid JSON, no markdown formatting or code blocks
- If you cannot determine a field, omit it entirely`;

export async function extractListingFields(rawText: string): Promise<{
  fields: Partial<ExtractedListingFields>;
  confidence: FieldConfidence;
}> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2000,
    system: EXTRACTION_PROMPT,
    messages: [
      {
        role: "user",
        content: `Extract product data from this text:\n\n${rawText.slice(0, 8000)}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      fields: parsed.fields || {},
      confidence: parsed.confidence || {},
    };
  } catch {
    // Retry with explicit JSON request
    const retryResponse = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\nExtract product data from:\n${rawText.slice(0, 8000)}`,
        },
        { role: "assistant", content: text },
        {
          role: "user",
          content:
            "That was not valid JSON. Please return ONLY a valid JSON object with 'fields' and 'confidence' keys, no markdown.",
        },
      ],
    });

    const retryText =
      retryResponse.content[0].type === "text"
        ? retryResponse.content[0].text
        : "";

    const retryParsed = JSON.parse(retryText);
    return {
      fields: retryParsed.fields || {},
      confidence: retryParsed.confidence || {},
    };
  }
}

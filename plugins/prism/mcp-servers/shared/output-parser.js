/**
 * Parse Codex JSONL output into structured events.
 */
export function parseCodexJsonl(raw) {
  const lines = raw.trim().split("\n").filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Skip non-JSON lines (progress output, etc.)
    }
  }
  return events;
}

/**
 * Extract the final agent response from Codex JSONL events.
 */
export function extractCodexResponse(events) {
  // Look for the last message with role "assistant"
  for (let i = events.length - 1; i >= 0; i--) {
    const evt = events[i];
    if (evt.type === "message" && evt.role === "assistant") {
      return evt.content || evt.text || JSON.stringify(evt);
    }
    // Also handle turn.completed events
    if (evt.type === "turn.completed" && evt.output) {
      return typeof evt.output === "string" ? evt.output : JSON.stringify(evt.output);
    }
  }
  // Fallback: return all events as JSON
  return JSON.stringify(events, null, 2);
}

/**
 * Parse Gemini CLI JSON output.
 */
export function parseGeminiJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    // Gemini --output-format json returns a conversation object
    if (parsed.candidates) {
      const parts = parsed.candidates[0]?.content?.parts || [];
      return parts.map((p) => p.text || JSON.stringify(p)).join("\n");
    }
    // Direct text response
    if (parsed.text) return parsed.text;
    if (parsed.response) return parsed.response;
    return JSON.stringify(parsed, null, 2);
  } catch {
    // If not valid JSON, return raw output (Gemini sometimes outputs plain text)
    return raw.trim();
  }
}

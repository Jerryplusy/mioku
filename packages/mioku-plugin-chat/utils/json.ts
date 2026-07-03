// Extract the first {...} block from free-form model output and JSON.parse it.
// Returns undefined when no block is found; throws on a malformed block (same
// as JSON.parse) so callers' existing error handling stays intact.
export function extractJsonObject<T = any>(text: string): T | undefined {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  return JSON.parse(match[0]) as T;
}

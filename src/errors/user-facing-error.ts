/**
 * Marker base class for errors whose `message` is safe to surface to the user (host LLM or
 * operator) verbatim.
 *
 * `formatToolError` renders any `UserFacingError` as `"<prefix>: <message>"` without emitting an
 * operator warning; anything that does not extend this class is treated as an unexpected bug and
 * warned. New domain errors opt in by extending this class rather than being appended to a
 * hand-maintained `instanceof` list.
 */
export class UserFacingError extends Error {}

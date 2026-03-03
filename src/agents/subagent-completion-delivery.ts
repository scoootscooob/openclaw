/**
 * Resolve whether a spawned subagent should send completion messages directly
 * to the user's channel. Returns false when config completionDelivery is
 * "internal" or when the caller explicitly opts out.
 */
export function resolveExpectsCompletionMessage(
  callerParam: boolean | undefined,
  completionDeliveryConfig: "internal" | "user" | undefined,
): boolean {
  if (completionDeliveryConfig === "internal") {
    return false;
  }
  return callerParam !== false;
}

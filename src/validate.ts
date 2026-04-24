import type { OrderComponents, ValidationResult } from "./types";

/**
 * Validate order components client-side before submission.
 *
 * NOTE: This performs structural validation only (amounts, timing, required
 * fields). It does not validate address fields — callers are responsible for
 * ensuring offerer, zone, token, and recipient addresses are well-formed.
 *
 * @param components - The order components to validate.
 * @returns A result indicating validity, with a reason string on failure.
 */
export function validateOrderComponents(
  components: OrderComponents,
): ValidationResult {
  if (!components.offer || components.offer.length === 0) {
    return { valid: false, reason: "Order must have at least one offer item" };
  }

  for (const item of components.offer) {
    if (item.startAmount <= 0n || item.endAmount <= 0n) {
      return { valid: false, reason: "Offer amounts must be greater than 0" };
    }
  }

  if (!components.consideration || components.consideration.length === 0) {
    return {
      valid: false,
      reason: "Order must have at least one consideration item",
    };
  }

  for (const item of components.consideration) {
    if (item.startAmount <= 0n || item.endAmount <= 0n) {
      return {
        valid: false,
        reason: "Consideration amounts must be greater than 0",
      };
    }
  }

  if (components.startTime >= components.endTime) {
    return {
      valid: false,
      reason: "Start time must be before end time",
    };
  }

  return { valid: true };
}

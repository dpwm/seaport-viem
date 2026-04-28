/**
 * Base error for all Seaport-related errors.
 * Consumers can catch SeaportError to handle any known error type from this library.
 */
export class SeaportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeaportError";
  }
}

/**
 * Thrown when input validation fails.
 *
 * Covers:
 * - `validateOrderComponents` / `validateSeaportContext` failures
 * - Invalid or missing parameters to builder functions (e.g. empty order arrays)
 * - Bulk order input validation (e.g. invalid height, index out of range)
 * - Unknown event topic
 *
 * Catch with `if (err instanceof SeaportValidationError)`.
 */
export class SeaportValidationError extends SeaportError {
  constructor(message: string) {
    super(message);
    this.name = "SeaportValidationError";
  }
}

/**
 * Thrown when an encoding operation fails.
 *
 * Covers:
 * - `checkUint120` overflow (numerator/denominator out of range)
 * - Malformed inputs that prevent ABI encoding
 *
 * Catch with `if (err instanceof SeaportEncodingError)`.
 */
export class SeaportEncodingError extends SeaportError {
  constructor(message: string) {
    super(message);
    this.name = "SeaportEncodingError";
  }
}

/**
 * Thrown when an on-chain call via `safeCall` fails.
 *
 * Covers:
 * - RPC errors / contract reverts (wrapped from viem `BaseError`)
 * - Empty return data from the contract
 * - Any unexpected thrown value during the call
 *
 * Catch with `if (err instanceof SeaportCallError)`.
 */
export class SeaportCallError extends SeaportError {
  constructor(message: string) {
    super(message);
    this.name = "SeaportCallError";
  }
}

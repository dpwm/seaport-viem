import type { PublicClient } from "viem";
import { BaseError } from "viem";
import { SeaportCallError } from "./errors";

/**
 * Perform a static call via a viem `PublicClient` with standardized error
 * wrapping for Seaport on-chain reads.
 *
 * Handles three common failure modes:
 * - The call returns no data (`undefined` or `"0x"`) — looks like a no-op or
 *   nonexistent contract at the address.
 * - viem `BaseError` (RPC errors, contract reverts, network failures) — wraps
 *   the short message with the caller's context.
 * - Any other thrown value — stringified and wrapped.
 *
 * The caller provides human-readable labels so that every error message
 * identifies the Seaport address, the function being called, and the argument
 * value that caused the failure.
 *
 * @param client - A viem PublicClient.
 * @param params - Static call parameters (`to` address and encoded `data`).
 * @param fnLabel - Short name of the contract function, e.g. `"getCounter"`.
 *   Used in the "returned no data" error message.
 * @param actionLabel - Human-readable action phrase, e.g. `"fetch counter"`.
 *   Used in the "Failed to" error message.
 * @param details - Descriptive suffix appended to both error message variants,
 *   e.g. `"for offerer 0x... at Seaport 0x..."`.
 * @returns The raw result data as hex.
 */
export async function safeCall(
  client: PublicClient,
  params: { to: `0x${string}`; data: `0x${string}` },
  fnLabel: string,
  actionLabel: string,
  details: string,
): Promise<`0x${string}`> {
  try {
    const result = await client.call(params);
    if (result.data === undefined || result.data === "0x") {
      throw new SeaportCallError(`${fnLabel} returned no data ${details}`);
    }
    return result.data;
  } catch (error: unknown) {
    // Re-throw errors we already enriched so they aren't wrapped again.
    if (error instanceof Error && error.message.startsWith(`${fnLabel} returned no data`)) {
      throw error;
    }
    if (error instanceof BaseError) {
      throw new SeaportCallError(
        `Failed to ${actionLabel} ${details}: ${error.shortMessage ?? error.message}`,
      );
    }
    throw new SeaportCallError(
      `Failed to ${actionLabel} ${details}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

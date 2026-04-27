import type { PublicClient } from "viem";
import { decodeFunctionResult, BaseError } from "viem";
import type { SeaportContext } from "./types";
import { seaportAbi } from "./constants";
import { encodeGetCounter } from "./encode";
import { validateSeaportContext } from "./validate";

/**
 * Fetch an offerer's current order counter from the Seaport contract.
 *
 * Wraps network and contract errors with a descriptive message including the
 * Seaport address and offerer address for easier debugging.
 *
 * @param client - A viem PublicClient for on-chain reads.
 * @param ctx - Seaport deployment context (address and EIP-712 domain).
 * @param offerer - The offerer address to query.
 * @returns The offerer's current counter value.
 * @throws If the RPC call fails, the contract reverts, or the address is not a Seaport instance.
 */
export async function getCounter(
  client: PublicClient,
  ctx: SeaportContext,
  offerer: `0x${string}`,
): Promise<bigint> {
  const ctxValid = validateSeaportContext(ctx);
  if (!ctxValid.valid) {
    throw new Error(ctxValid.reason);
  }

  const data = encodeGetCounter(offerer);
  try {
    const result = await client.call({
      to: ctx.address,
      data,
    });
    if (result.data === undefined || result.data === "0x") {
      throw new Error(
        `getCounter returned no data for offerer ${offerer} at Seaport ${ctx.address}`,
      );
    }
    return decodeFunctionResult({
      abi: seaportAbi,
      functionName: "getCounter",
      data: result.data,
    });
  } catch (error: unknown) {
    // If the error already carries our context, rethrow it.
    if (error instanceof Error && error.message.startsWith("getCounter returned no data")) {
      throw error;
    }
    // Wrap viem BaseErrors (RPC errors, contract reverts, etc.) with context.
    if (error instanceof BaseError) {
      throw new Error(
        `Failed to fetch counter for offerer ${offerer} from Seaport at ${ctx.address}: ${error.shortMessage ?? error.message}`,
      );
    }
    // Wrap infrastructure errors (e.g., TypeError, RangeError, or thrown strings).
    throw new Error(
      `Failed to fetch counter for offerer ${offerer} from Seaport at ${ctx.address}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

import { encodeFunctionData } from "viem";
import type { OrderComponents, BasicOrderParameters } from "./types";
import { seaportAbi } from "./constants";

/**
 * Encode calldata for Seaport's getCounter(address) function.
 * @param offerer - The offerer address to query the counter for.
 * @returns ABI-encoded function call data.
 */
export function encodeGetCounter(offerer: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "getCounter",
    args: [offerer],
  });
}

/**
 * Encode calldata for Seaport's getOrderHash(OrderComponents) function.
 * @param orderComponents - The order components to hash.
 * @returns ABI-encoded function call data.
 */
export function encodeGetOrderHash(
  orderComponents: OrderComponents,
): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "getOrderHash",
    args: [orderComponents],
  });
}

/**
 * Encode calldata for Seaport's fulfillBasicOrder(BasicOrderParameters) function.
 * @param params - The flattened basic order parameters.
 * @returns ABI-encoded function call data.
 */
export function encodeFulfillBasicOrder(
  params: BasicOrderParameters,
): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "fulfillBasicOrder",
    args: [params],
  });
}

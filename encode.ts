import { encodeFunctionData } from "viem";
import type { OrderComponents, BasicOrderParameters } from "./types";
import { seaportAbi } from "./constants";

/** Encode calldata for Seaport's getCounter(address) function. */
export function encodeGetCounter(offerer: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "getCounter",
    args: [offerer],
  });
}

/** Encode calldata for Seaport's getOrderHash(OrderComponents) function. */
export function encodeGetOrderHash(
  orderComponents: OrderComponents,
): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "getOrderHash",
    args: [orderComponents],
  });
}

/** Encode calldata for Seaport's fulfillBasicOrder(BasicOrderParameters) function. */
export function encodeFulfillBasicOrder(
  params: BasicOrderParameters,
): `0x${string}` {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "fulfillBasicOrder",
    args: [params],
  });
}

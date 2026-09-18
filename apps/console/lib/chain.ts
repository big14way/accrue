"use client";
import { Accrue } from "@accrue/sdk";
import { deployment, RPC } from "./config";

let _ro: Accrue | undefined;
/** Read-only SDK instance (no signer). Every number in the console comes from here or Envio. */
export function readOnly(): Accrue {
  if (!_ro) _ro = new Accrue({ deployment, rpcUrl: RPC });
  return _ro;
}

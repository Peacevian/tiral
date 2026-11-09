import { createPublicClient, http, isAddress, type Address } from "viem"
import { celo } from "viem/chains"
import { identityExpiry, isZeroAddress } from "@/lib/identity"

// Production GoodDollar identity on Celo. A whitelisted root is the wallet
// itself. A different root means the face lives on another wallet.
export const IDENTITY_CONTRACT = "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42" as const

const identityAbi = [
  {
    type: "function",
    name: "getWhitelistedRoot",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "lastAuthenticated",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "authenticationPeriod",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const

const client = createPublicClient({ chain: celo, transport: http() })

export type ChainIdentity = {
  /** Lowercase whitelisted root, or null when this wallet has none. */
  root: string | null
  /** True when the root is this wallet. A different root is someone else's face. */
  self: boolean
  expiresAt: Date | null
}

export async function readChainIdentity(wallet: string): Promise<ChainIdentity> {
  if (!isAddress(wallet)) throw new Error("Wallet address is not valid")
  const account = wallet as Address
  const [root, lastAuthenticated, authPeriod] = await Promise.all([
    client.readContract({
      address: IDENTITY_CONTRACT,
      abi: identityAbi,
      functionName: "getWhitelistedRoot",
      args: [account]
    }),
    client.readContract({
      address: IDENTITY_CONTRACT,
      abi: identityAbi,
      functionName: "lastAuthenticated",
      args: [account]
    }),
    client.readContract({
      address: IDENTITY_CONTRACT,
      abi: identityAbi,
      functionName: "authenticationPeriod"
    })
  ])
  const normalized = root.toLowerCase()
  if (isZeroAddress(normalized)) return { root: null, self: false, expiresAt: null }
  return {
    root: normalized,
    self: normalized === wallet.toLowerCase(),
    expiresAt: identityExpiry(lastAuthenticated, authPeriod)
  }
}

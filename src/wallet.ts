import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Hex,
  type LocalAccount,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { Turnkey } from "@turnkey/sdk-server";
import { createAccount } from "@turnkey/viem";

export type SepoliaAccount = HDAccount | LocalAccount;

export type SepoliaWallet = {
  account: SepoliaAccount;
  address: Hex;
  publicClient: PublicClient<Transport, Chain>;
  walletClient: WalletClient<Transport, Chain, SepoliaAccount>;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name} — set it in the MCP server .env or in mcp.json env.`,
    );
  }
  return value;
}

function sepoliaTransport() {
  const rpcUrl =
    process.env.SEPOLIA_RPC_URL?.trim() ||
    "https://ethereum-sepolia-rpc.publicnode.com";
  return http(rpcUrl);
}

function clientsFor(account: SepoliaAccount) {
  const transport = sepoliaTransport();

  const publicClient = createPublicClient({
    chain: sepolia,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });

  return { publicClient, walletClient };
}

/** First HD account from BIP-39 mnemonic (path m/44'/60'/0'/0/0). */
function createMnemonicWallet(): SepoliaWallet {
  const mnemonic = requireEnv("MNEMONIC");
  const account = mnemonicToAccount(mnemonic);
  const { publicClient, walletClient } = clientsFor(account);

  return {
    account,
    address: account.address,
    publicClient,
    walletClient,
  };
}

/**
 * Account backed by a Turnkey remote signer. The private key never leaves
 * Turnkey's infrastructure — signTransaction() makes an authenticated API
 * call (signed with the server's Turnkey API key pair) and gets a signature
 * back, so a compromised MCP host can request signatures but never exfiltrate
 * the key itself. TURNKEY_SIGN_WITH is the wallet address, private key ID,
 * or wallet account ID to sign with, scoped under TURNKEY_ORGANIZATION_ID.
 */
async function createTurnkeyWallet(): Promise<SepoliaWallet> {
  const apiPublicKey = requireEnv("TURNKEY_API_PUBLIC_KEY");
  const apiPrivateKey = requireEnv("TURNKEY_API_PRIVATE_KEY");
  const organizationId = requireEnv("TURNKEY_ORGANIZATION_ID");
  const signWith = requireEnv("TURNKEY_SIGN_WITH");
  const apiBaseUrl =
    process.env.TURNKEY_API_BASE_URL?.trim() || "https://api.turnkey.com";

  const turnkey = new Turnkey({
    apiBaseUrl,
    apiPublicKey,
    apiPrivateKey,
    defaultOrganizationId: organizationId,
  });

  const account = await createAccount({
    client: turnkey.apiClient(),
    organizationId,
    signWith,
  });

  const { publicClient, walletClient } = clientsFor(account);

  return {
    account,
    address: account.address,
    publicClient,
    walletClient,
  };
}

/**
 * Uses the Turnkey remote signer when TURNKEY_API_PUBLIC_KEY is set,
 * otherwise falls back to the local MNEMONIC-derived HD account.
 */
export function createSepoliaWalletFromEnv(): Promise<SepoliaWallet> {
  if (process.env.TURNKEY_API_PUBLIC_KEY?.trim()) {
    return createTurnkeyWallet();
  }
  return Promise.resolve(createMnemonicWallet());
}

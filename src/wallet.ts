import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";

export type SepoliaWallet = {
  account: HDAccount;
  address: Hex;
  publicClient: PublicClient<Transport, Chain>;
  walletClient: WalletClient<Transport, Chain, HDAccount>;
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

/** First HD account from BIP-39 mnemonic (path m/44'/60'/0'/0/0). */
export function createSepoliaWalletFromEnv(): SepoliaWallet {
  const mnemonic = requireEnv("MNEMONIC");
  const rpcUrl =
    process.env.SEPOLIA_RPC_URL?.trim() || "https://ethereum-sepolia-rpc.publicnode.com";

  const account = mnemonicToAccount(mnemonic);
  const transport = http(rpcUrl);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });

  return {
    account,
    address: account.address,
    publicClient,
    walletClient,
  };
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Hex } from "viem";

import { fetchPayCalldata } from "./request-network.js";
import { createSepoliaWalletFromEnv, type SepoliaWallet } from "./wallet.js";

const MCP_SERVER_INSTRUCTIONS = `# Sepolia Request Network payer MCP

Pays an existing Request Network Secure Payment using a wallet derived from MNEMONIC (first HD address).

Flow:
1. LLM provides the secure payment \`token\` (ULID) or full pay URL
2. MCP calls GET /v2/secure-payments/:token/pay with the wallet address
3. MCP signs and broadcasts each returned transaction on Ethereum Sepolia

Required: MNEMONIC and RN_CLIENT_ID in the MCP server .env (never via mcp.json headers).
Optional: SEPOLIA_RPC_URL, RN_API_BASE (default staging API), RN_API_KEY.

Auth: RN_CLIENT_ID must belong to the same Request Network account that
created the Secure Payment. A different Client ID gets HTTP 401
on GET /v2/secure-payments/:token/pay — having the token alone is not enough.
`;

async function broadcastCalldata(
  wallet: SepoliaWallet,
  transactions: { to: Hex; data: Hex; value: bigint }[],
): Promise<{ hashes: Hex[]; receipts: unknown[] }> {
  const hashes: Hex[] = [];
  const receipts: unknown[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]!;
    const hash = await wallet.walletClient.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value,
      chain: wallet.walletClient.chain,
      account: wallet.account,
    });
    hashes.push(hash);

    const receipt = await wallet.publicClient.waitForTransactionReceipt({
      hash,
    });
    receipts.push({
      index: i,
      hash,
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      to: receipt.to,
    });

    if (receipt.status !== "success") {
      throw new Error(
        `Transaction ${i + 1}/${transactions.length} reverted: ${hash}`,
      );
    }
  }

  return { hashes, receipts };
}

export function createSepoliaPayMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "mcp-sepolia",
      version: "1.0.0",
    },
    {
      instructions: MCP_SERVER_INSTRUCTIONS,
    },
  );

  server.tool(
    "get_wallet_address",
    "Returns the Sepolia EVM address derived from MNEMONIC (first HD account). Use this to fund the wallet with ETH (gas) and FAU before paying.",
    {},
    async () => {
      try {
        const wallet = createSepoliaWalletFromEnv();
        const balance = await wallet.publicClient.getBalance({
          address: wallet.address,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  address: wallet.address,
                  chain: "sepolia",
                  chainId: 11155111,
                  ethBalanceWei: balance.toString(),
                  explorer: `https://sepolia.etherscan.io/address/${wallet.address}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "pay_secure_payment",
    "Pay a Request Network Secure Payment on Ethereum Sepolia. Pass the secure payment token (ULID) or full pay URL. Fetches calldata via GET /v2/secure-payments/:token/pay, then signs and broadcasts with the MNEMONIC wallet (first address).",
    {
      token: z
        .string()
        .min(1)
        .describe(
          "Request Network secure payment token (ULID) or full URL containing ?token=…",
        ),
    },
    async ({ token }) => {
      try {
        const wallet = createSepoliaWalletFromEnv();
        const pay = await fetchPayCalldata({
          token,
          wallet: wallet.address,
        });

        if (pay.metadata?.hasEnoughBalance === false) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error:
                      "Wallet has insufficient token balance for this payment",
                    wallet: wallet.address,
                    metadata: pay.metadata,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (pay.metadata?.hasEnoughGas === false) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "Wallet has insufficient ETH for gas on Sepolia",
                    wallet: wallet.address,
                    metadata: pay.metadata,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const { hashes, receipts } = await broadcastCalldata(
          wallet,
          pay.transactions,
        );

        const payload = {
          ok: true,
          wallet: wallet.address,
          chain: "sepolia",
          chainId: 11155111,
          transactionCount: hashes.length,
          transactionHashes: hashes,
          receipts,
          explorers: hashes.map(
            (h) => `https://sepolia.etherscan.io/tx/${h}`,
          ),
          metadata: pay.metadata,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  return server;
}

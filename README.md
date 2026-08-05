# Sepolia Request Network Payer MCP

MCP server that **pays** an existing [Request Network](https://request.network/) Secure Payment on **Ethereum Sepolia**.

Flow:

1. LLM provides the secure payment `token` (or full pay URL)
2. MCP fetches executable calldata: `GET /v2/secure-payments/:token/pay`
3. MCP signs and broadcasts the transaction(s) on Sepolia using a wallet derived from `MNEMONIC` (**first HD address**, path `m/44'/60'/0'/0/0`)

## Tools

| Tool | Description |
|------|-------------|
| `pay_secure_payment` | Pay a Secure Payment token on Sepolia |
| `get_wallet_address` | Show the derived payer address + ETH balance |

## Requirements

- Node.js 20+
- A Request Network **Client ID** or **API key** (staging or production)
- A BIP-39 **mnemonic** funded on Sepolia (ETH for gas + FAU / payment token)
- A Secure Payment whose destination is on Sepolia (e.g. `FAU-sepolia`)

### Auth constraint (important)

`GET /v2/secure-payments/:token/pay` is scoped to the credentials that **created** the Secure Payment. Using another account’s Client ID returns **401**, even if you have the token.

Use the **same** `RN_CLIENT_ID` (or API key) as `mcp-request-network` / the merchant that created the link — not a separate “payer” Client ID.

## Install

```bash
npm install
npm run build
```

## Environment

Create `.env` in this directory (or pass via mcp.json `env`):

| Variable | Required | Purpose |
|----------|----------|---------|
| `MNEMONIC` | yes | BIP-39 phrase — first address is the payer wallet |
| `RN_CLIENT_ID` | one of | Client ID that **created** the Secure Payment (`x-client-id`) |
| `RN_API_KEY` | one of | API key of the same account that created the payment |
| `SEPOLIA_RPC_URL` | no | Sepolia RPC (default: publicnode) |
| `RN_API_BASE` | no | API base (default: `https://api.stage.request.network`) |

Example `.env`:

```env
MNEMONIC="test test test test test test test test test test test junk"
RN_CLIENT_ID=cli_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# RN_API_BASE=https://api.request.network
# SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

Never commit `.env` or share the mnemonic.

## Cursor / Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "mcp-sepolia": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-sepolia/build/index.js"],
      "env": {
        "MNEMONIC": "your twelve or twenty four word phrase here",
        "RN_CLIENT_ID": "cli_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

See [`mcp.json.example`](mcp.json.example).

## Usage (from an agent)

1. Call `get_wallet_address` and fund that address on Sepolia.
2. Create a Secure Payment with a Sepolia destination, using the **same** Client ID configured here.
3. Call `pay_secure_payment` with the returned `token` or `securePaymentUrl`.

```text
pay_secure_payment token=01KJRA0M9QG8MA4X887908T8A4
```

or

```text
pay_secure_payment token=https://pay.request.network/?token=01KJRA0M9QG8MA4X887908T8A4
```

## Security

- Testnet only by design (hardcoded Sepolia chain).
- The mnemonic can spend funds on that wallet — treat it as a secret.
- Prefer a dedicated throwaway Sepolia mnemonic, not a mainnet seed.

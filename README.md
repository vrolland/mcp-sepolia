# Sepolia Request Network Payer MCP

MCP server that **pays** an existing [Request Network](https://request.network/) Secure Payment on **Ethereum Sepolia**.

Flow:

1. LLM provides the secure payment `token` (or full pay URL)
2. MCP fetches executable calldata: `GET /v2/secure-payments/:token/pay`
3. MCP signs and broadcasts the transaction(s) on Sepolia using either a local `MNEMONIC`-derived wallet or a [Turnkey](https://turnkey.com) remote signer (see [Wallet backends](#wallet-backends))

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

Use the **same** Client ID (or API key) as `mcp-request-network` / the merchant that created the link — not a separate “payer” Client ID.

## Install

```bash
npm install
npm run build
```

## Wallet backends

`get_wallet_address` / `pay_secure_payment` pick the signer at call time based on which env vars are set (see [`src/wallet.ts`](src/wallet.ts)):

- **Turnkey remote signer** — used when `TURNKEY_API_PUBLIC_KEY` is set (takes priority). The private key lives in Turnkey's infrastructure (HSM/policy-gated), never on this host; each transaction is signed via an authenticated API call using the server's Turnkey API key pair.
- **Local mnemonic** — fallback. `MNEMONIC` is a BIP-39 phrase held in the server process; the first HD address (`m/44'/60'/0'/0/0`) signs directly with viem.

### Turnkey setup

1. Create a Turnkey organization and a wallet/private key on Sepolia (or import one) at [turnkey.com](https://turnkey.com).
2. Create an API key pair for this server (`turnkey_api_public_key` / `turnkey_api_private_key`) scoped to sign with that wallet.
3. Set `TURNKEY_SIGN_WITH` to the wallet's Ethereum address, or the private key/wallet account ID.

## Environment

Server `.env` (loaded by the process):

| Variable | Required | Purpose |
|----------|----------|---------|
| `MNEMONIC` | if no Turnkey vars | BIP-39 phrase — first address is the payer wallet (**server-only**, never in HTTP headers) |
| `TURNKEY_API_PUBLIC_KEY` | for Turnkey | Turnkey API key pair public half; presence switches the wallet backend to Turnkey |
| `TURNKEY_API_PRIVATE_KEY` | for Turnkey | Turnkey API key pair private half (**server-only**, keep secret) |
| `TURNKEY_ORGANIZATION_ID` | for Turnkey | Organization (or sub-organization) that owns the signing wallet |
| `TURNKEY_SIGN_WITH` | for Turnkey | Wallet address / private key ID / wallet account ID to sign with |
| `TURNKEY_API_BASE_URL` | no | Turnkey API base (default: `https://api.turnkey.com`) |
| `RN_CLIENT_ID` | for http | Client ID that created the Secure Payment |
| `SEPOLIA_RPC_URL` | no | Sepolia RPC (default: publicnode) |
| `RN_API_BASE` | no | API base (default: `https://api.stage.request.network`) |
| `MCP_HTTP_PORT` | no | HTTP port (default `3101`) |

\* For HTTP mode, prefer passing Client ID / API key via mcp.json `headers` instead of the server `.env`.

Example `.env` (local mnemonic):

```env
MNEMONIC="test test test test test test test test test test test junk"
# RN_CLIENT_ID=cli_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# RN_API_BASE=https://api.request.network
# SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
# MCP_HTTP_PORT=3101
```

Example `.env` (Turnkey):

```env
TURNKEY_API_PUBLIC_KEY=...
TURNKEY_API_PRIVATE_KEY=...
TURNKEY_ORGANIZATION_ID=...
TURNKEY_SIGN_WITH=0xYourWalletAddress
# RN_CLIENT_ID=cli_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Never commit `.env` or share the mnemonic / Turnkey private API key.

## Install as a Claude Desktop extension (recommended for end users)

Packages the server as a single `.mcpb` file. Claude Desktop shows a config form on install (mnemonic / Turnkey fields), masks and stores secrets in the OS keychain (Keychain / Credential Manager / Secret Service), and injects them into the server process only — no `.env`, no editing `mcp.json` by hand.

```bash
npm install
npm run mcpb:pack
```

This produces `mcp-sepolia.mcpb`. Send it to the user (or distribute privately); they double-click it (or drag it into Claude Desktop, or Settings → Extensions → Advanced settings → Install Extension…) to install.

See [`manifest.json`](manifest.json) for the declared config fields. `mcpb pack` respects `.gitignore`, so `.env` is never bundled — verified by packing with a dummy `.env` present and confirming it's excluded from the archive.

## Run modes

### HTTP

Starts a Streamable HTTP MCP endpoint on port `3101` (override with `MCP_HTTP_PORT`).

```bash
npm run mcp:http
```

Configure the MCP client with the URL and per-client headers (not the mnemonic):

```json
{
  "mcpServers": {
    "mcp-sepolia-http": {
      "url": "http://localhost:3101/mcp",
      "headers": {
        "x-client-id": "cli_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

- `x-client-id` — Request Network Client ID that **created** the Secure Payment
- `x-api-key` — alternative to Client ID
- `MNEMONIC` stays in the **server** `.env`

### Stdio

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
- The mnemonic (or Turnkey API private key) can spend funds on that wallet — treat it as a secret; keep it in the server `.env`, never in client headers.
- Prefer a dedicated throwaway Sepolia mnemonic, not a mainnet seed, when using the local-mnemonic backend.
- Turnkey lets you scope the API key to a policy (e.g. Sepolia-only, spend limits) instead of holding an unrestricted key on this host.

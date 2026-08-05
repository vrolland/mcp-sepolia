import type { Hex } from "viem";

const DEFAULT_API_BASE = "https://api.stage.request.network";

export type CalldataTx = {
  to: Hex;
  data: Hex;
  value: bigint;
};

export type PayCalldataResult = {
  transactions: CalldataTx[];
  raw: unknown;
  metadata?: Record<string, unknown>;
};

function apiBase(): string {
  return process.env.RN_API_BASE?.trim() || DEFAULT_API_BASE;
}

function buildAuthHeaders(): Record<string, string> {
  const apiKey = process.env.RN_API_KEY?.trim();
  const clientId = process.env.RN_CLIENT_ID?.trim();

  if (apiKey) {
    return { "x-api-key": apiKey };
  }
  if (clientId) {
    return { "x-client-id": clientId };
  }
  throw new Error(
    "Missing Request Network auth — set RN_CLIENT_ID or RN_API_KEY in env.",
  );
}

/** Accept a bare ULID token or a full pay.request.network URL. */
export function extractSecurePaymentToken(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("token is required");
  }

  try {
    if (trimmed.includes("://") || trimmed.startsWith("http")) {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get("token")?.trim();
      if (fromQuery) return fromQuery;
    }
  } catch {
    // not a URL — treat as raw token
  }

  const queryMatch = trimmed.match(/[?&]token=([A-Za-z0-9]+)/);
  if (queryMatch?.[1]) {
    return queryMatch[1];
  }

  return trimmed;
}

function toHexData(value: unknown): Hex {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`Invalid calldata data field: ${String(value)}`);
  }
  return value as Hex;
}

function toAddress(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid calldata to field: ${String(value)}`);
  }
  return value as Hex;
}

function toValue(value: unknown): bigint {
  if (value === undefined || value === null) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid calldata value: ${value}`);
    }
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s || s === "0x" || s === "0x0") return 0n;
    return BigInt(s);
  }
  throw new Error(`Unsupported calldata value type: ${typeof value}`);
}

function normalizeTx(raw: Record<string, unknown>): CalldataTx {
  return {
    to: toAddress(raw.to),
    data: toHexData(raw.data),
    value: toValue(raw.value),
  };
}

/**
 * Normalize GET /v2/secure-payments/:token/pay responses into an ordered tx list.
 * Supports single (`transactions[]`) and batch (`ERC20ApprovalTransactions` + `batchPaymentTransaction`) shapes.
 */
export function normalizePayResponse(data: unknown): PayCalldataResult {
  if (!data || typeof data !== "object") {
    throw new Error(`Unexpected /pay response: ${JSON.stringify(data)}`);
  }

  const body = data as Record<string, unknown>;
  const metadata =
    body.metadata && typeof body.metadata === "object"
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  if (Array.isArray(body.transactions) && body.transactions.length > 0) {
    return {
      transactions: body.transactions.map((tx) =>
        normalizeTx(tx as Record<string, unknown>),
      ),
      raw: data,
      metadata,
    };
  }

  const approvals = Array.isArray(body.ERC20ApprovalTransactions)
    ? body.ERC20ApprovalTransactions
    : [];
  const batch = body.batchPaymentTransaction;

  if (batch && typeof batch === "object") {
    return {
      transactions: [
        ...approvals.map((tx) => normalizeTx(tx as Record<string, unknown>)),
        normalizeTx(batch as Record<string, unknown>),
      ],
      raw: data,
      metadata,
    };
  }

  throw new Error(
    `No executable transactions in /pay response: ${JSON.stringify(data)}`,
  );
}

export async function fetchPayCalldata(params: {
  token: string;
  wallet: string;
}): Promise<PayCalldataResult> {
  const token = extractSecurePaymentToken(params.token);
  const qs = new URLSearchParams({ wallet: params.wallet });
  const path = `/v2/secure-payments/${encodeURIComponent(token)}/pay?${qs}`;

  const response = await fetch(`${apiBase()}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://pay.stage.request.network",
      ...buildAuthHeaders(),
    },
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const hint =
      response.status === 401
        ? " — RN_CLIENT_ID / RN_API_KEY must be the same credentials that created this Secure Payment (another Client ID is rejected even with a valid token)."
        : "";
    throw new Error(
      `Request Network GET ${path} failed (${response.status}): ${text.slice(0, 800)}${hint}`,
    );
  }

  return normalizePayResponse(data);
}

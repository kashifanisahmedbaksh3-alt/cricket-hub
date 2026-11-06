import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Server-only payment-link codec. A link contains an encrypted, authenticated
 * snapshot, not an editable payment amount or a publicly queryable player ID. */
export type PaymentSnapshot = {
  v: 1;
  sessionId: string;
  sessionName: string;
  sessionDate: string;
  sessionPlayerId: string;
  playerName: string;
  total: number;
  playerCount: number;
  share: number;
  paid: number;
  due: number;
  expenses: { label: string; amount: number }[];
  issuedAt: number;
  expiresAt: number;
};

function getKey(): Buffer {
  const secret = process.env.PAYMENT_LINK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("PAYMENT_LINK_SECRET must be configured (minimum 32 characters)");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function createPaymentToken(snapshot: PaymentSnapshot): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encoded = Buffer.from(JSON.stringify(snapshot), "utf8");
  const ciphertext = Buffer.concat([cipher.update(encoded), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

export function parsePaymentToken(token: string): PaymentSnapshot | null {
  if (!token.startsWith("v1.") || token.length > 10000 || token.length < 40) return null;
  try {
    const raw = Buffer.from(token.slice(3), "base64url");
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const payload = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(authTag);
    const text = Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") return null;
    const p = value as PaymentSnapshot;
    if (
      p.v !== 1 ||
      typeof p.sessionId !== "string" ||
      typeof p.playerName !== "string" ||
      typeof p.sessionName !== "string" ||
      typeof p.sessionDate !== "string" ||
      !Number.isFinite(p.due) || p.due < 0 || p.due > 1000000 ||
      !Number.isFinite(p.share) || !Number.isFinite(p.paid) ||
      !Number.isFinite(p.total) ||
      !Number.isInteger(p.playerCount) || p.playerCount < 1 ||
      !Array.isArray(p.expenses) || p.expenses.length > 30 ||
      !Number.isFinite(p.expiresAt) ||
      p.expiresAt < Date.now() ||
      p.issuedAt > Date.now() + 60000
    ) return null;
    return p;
  } catch {
    return null;
  }
}

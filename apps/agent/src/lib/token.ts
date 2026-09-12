import { randomBytes } from "node:crypto";

export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

import path from "node:path";
import picomatch from "picomatch";
import { RpcError } from "./rpc-error.js";
import type { CodeAgentConfig } from "./workspace-config.js";

/** Sentinel `root` value marking the synthetic "computer" workspace — not
 * anchored to any single directory (Windows has no common ancestor of
 * C:\ and D:\), so callers pass a full absolute path (with drive letter)
 * instead of a path relative to a workspace root. */
export const WHOLE_MACHINE_ROOT = "*";

/**
 * Resolves `relPath` against `workspaceRoot` and enforces the workspace's
 * .code-agent.json sandbox. Blocked patterns are checked before allowed
 * patterns so a blocked path is rejected even if it also matches an allow
 * pattern (e.g. an allow pattern of `**` must not defeat `.env*`).
 *
 * `requireAllowed: false` is used for read-only directory listing, where we
 * still enforce traversal + blockedPaths but don't require an exact
 * allowedPaths match (allow patterns are file globs like "src/**", which
 * don't necessarily match intermediate directory names).
 *
 * When `workspaceRoot === WHOLE_MACHINE_ROOT`, `relPath` must itself be an
 * absolute path (e.g. "C:\\Users\\Admin\\file.txt" or "D:\\project\\x") —
 * there's no root to resolve it against, and no traversal check applies
 * since the whole machine IS the boundary. blockedPaths are still enforced.
 */
export function resolveSafePath(
  workspaceRoot: string,
  relPath: string,
  config: CodeAgentConfig,
  opts: { requireAllowed?: boolean } = {},
): string {
  const requireAllowed = opts.requireAllowed ?? true;

  if (workspaceRoot === WHOLE_MACHINE_ROOT) {
    if (!path.isAbsolute(relPath)) {
      throw new RpcError(
        "INVALID_PARAMS",
        `workspace "computer" requires an absolute path with drive letter (e.g. "C:\\Users\\...\\file.txt"), got: ${relPath}`,
      );
    }
    const abs = path.resolve(relPath);
    // picomatch treats "/" as the path separator by default — normalize the
    // Windows backslash-separated absolute path before matching, same as
    // the per-workspace branch below already does for relFromRoot.
    checkPatterns(abs.replace(/\\/g, "/"), config, requireAllowed);
    return abs;
  }

  const normalizedRel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const rootResolved = path.resolve(workspaceRoot);
  const abs = path.resolve(rootResolved, normalizedRel);
  const relFromRoot = path.relative(rootResolved, abs).replace(/\\/g, "/");

  if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) {
    throw new RpcError("PATH_NOT_ALLOWED", `path escapes workspace root: ${relPath}`);
  }

  const check = relFromRoot === "" ? "." : relFromRoot;
  checkPatterns(check, config, requireAllowed);
  return abs;
}

function checkPatterns(check: string, config: CodeAgentConfig, requireAllowed: boolean): void {
  const isBlocked = config.blockedPaths.some((pattern) => picomatch.isMatch(check, pattern, { dot: true }));
  if (isBlocked) {
    throw new RpcError("PATH_NOT_ALLOWED", `path is blocked by .code-agent.json: ${check}`);
  }

  if (requireAllowed) {
    const isAllowed = config.allowedPaths.some((pattern) => picomatch.isMatch(check, pattern, { dot: true }));
    if (!isAllowed) {
      throw new RpcError("PATH_NOT_ALLOWED", `path is not in allowedPaths: ${check}`);
    }
  }
}

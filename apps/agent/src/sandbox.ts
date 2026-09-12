import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { RpcError } from "./rpc-error.js";
import type { CodeAgentConfig } from "./workspace-config.js";

/**
 * Resolve symlinks on the longest existing prefix of `abs` (the target itself
 * may not exist yet, e.g. for file_create). Returns the fully symlink-resolved
 * absolute path. This is what defeats a symlink-escape: a link inside the
 * workspace that points outside it resolves to its real out-of-root target,
 * which the caller then re-checks against the root and the block/allow lists.
 */
function realpathResolved(abs: string): string {
  let existing = abs;
  const tail: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break; // reached the filesystem root
    tail.unshift(path.basename(existing));
    existing = parent;
  }
  let real: string;
  try {
    real = fs.realpathSync.native(existing);
  } catch {
    real = path.resolve(existing);
  }
  return tail.length > 0 ? path.join(real, ...tail) : real;
}

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
    // Resolve symlinks so blockedPaths match the REAL target, not an
    // innocuously-named link pointing at (e.g.) ~/.ssh.
    const abs = realpathResolved(path.resolve(relPath));
    // picomatch treats "/" as the path separator by default — normalize the
    // Windows backslash-separated absolute path before matching, same as
    // the per-workspace branch below already does for relFromRoot.
    checkPatterns(abs.replace(/\\/g, "/"), config, requireAllowed);
    return abs;
  }

  const normalizedRel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const rootResolved = fs.realpathSync.native(path.resolve(workspaceRoot));
  // Resolve symlinks BEFORE the traversal check: a link inside the root that
  // points outside must be rejected, not silently followed.
  const abs = realpathResolved(path.resolve(rootResolved, normalizedRel));
  const relFromRoot = path.relative(rootResolved, abs).replace(/\\/g, "/");

  if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) {
    throw new RpcError("PATH_NOT_ALLOWED", `path escapes workspace root (symlink or traversal): ${relPath}`);
  }

  const check = relFromRoot === "" ? "." : relFromRoot;
  checkPatterns(check, config, requireAllowed);
  return abs;
}

/**
 * Non-throwing sandbox check for a workspace-relative path, used by code_search
 * to filter ripgrep matches. Returns true only if the path is not blocked and
 * (when required) is within allowedPaths.
 */
export function isRelPathAllowed(
  relFromRoot: string,
  config: CodeAgentConfig,
  requireAllowed = true,
): boolean {
  const check = relFromRoot.replace(/\\/g, "/") || ".";
  if (config.blockedPaths.some((p) => picomatch.isMatch(check, p, { dot: true }))) return false;
  if (requireAllowed && !config.allowedPaths.some((p) => picomatch.isMatch(check, p, { dot: true }))) return false;
  return true;
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

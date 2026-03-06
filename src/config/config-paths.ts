import { isPlainObject } from "../utils.js";
import { isBlockedObjectKey } from "./prototype-keys.js";

type PathNode = Record<string, unknown>;

/**
 * Parse a config path string into an array of key segments.
 *
 * Supports dot notation (`foo.bar`) and bracket notation for keys that
 * contain periods or other special characters:
 *   `models.providers["llama.cpp"].baseUrl`  →  ["models", "providers", "llama.cpp", "baseUrl"]
 *
 * Both single and double quotes are accepted inside brackets.
 */
export function parseConfigPath(raw: string): {
  ok: boolean;
  path?: string[];
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      error:
        'Invalid path. Use dot notation (e.g. foo.bar) or bracket notation for keys with periods (e.g. providers["llama.cpp"]).',
    };
  }

  // Fast path: if no bracket notation, use the simple split.
  if (!trimmed.includes("[")) {
    const parts = trimmed.split(".").map((part) => part.trim());
    if (parts.some((part) => !part)) {
      return {
        ok: false,
        error:
          'Invalid path. Use dot notation (e.g. foo.bar) or bracket notation for keys with periods (e.g. providers["llama.cpp"]).',
      };
    }
    if (parts.some((part) => isBlockedObjectKey(part))) {
      return { ok: false, error: "Invalid path segment." };
    }
    return { ok: true, path: parts };
  }

  // Bracket-aware parser.
  const parts: string[] = [];
  let i = 0;
  let segment = "";

  while (i < trimmed.length) {
    const ch = trimmed[i];

    if (ch === ".") {
      const key = segment.trim();
      if (!key && parts.length > 0) {
        return {
          ok: false,
          error:
            'Invalid path. Use dot notation (e.g. foo.bar) or bracket notation for keys with periods (e.g. providers["llama.cpp"]).',
        };
      }
      if (key) {
        parts.push(key);
      }
      segment = "";
      i += 1;
      continue;
    }

    if (ch === "[") {
      // Flush any accumulated dot-separated segment.
      const key = segment.trim();
      if (key) {
        parts.push(key);
      }
      segment = "";

      const quoteChar = trimmed[i + 1];
      if (quoteChar !== '"' && quoteChar !== "'") {
        return {
          ok: false,
          error: 'Bracket notation requires quotes (e.g. ["llama.cpp"]).',
        };
      }
      const closeQuote = trimmed.indexOf(quoteChar, i + 2);
      if (closeQuote < 0 || trimmed[closeQuote + 1] !== "]") {
        return {
          ok: false,
          error: 'Unterminated bracket notation (e.g. ["llama.cpp"]).',
        };
      }
      const bracketKey = trimmed.slice(i + 2, closeQuote);
      if (!bracketKey) {
        return { ok: false, error: "Empty bracket key." };
      }
      parts.push(bracketKey);
      // Skip past the closing `]` (and an optional following `.`).
      i = closeQuote + 2;
      if (i < trimmed.length) {
        if (trimmed[i] === ".") {
          i += 1;
        } else if (trimmed[i] !== "[") {
          return {
            ok: false,
            error: 'Missing separator after bracket notation. Use a dot (e.g. ["key"].next).',
          };
        }
      }
      continue;
    }

    segment += ch;
    i += 1;
  }

  // Flush trailing segment.
  const trailing = segment.trim();
  if (trailing) {
    parts.push(trailing);
  }

  if (parts.length === 0) {
    return {
      ok: false,
      error:
        'Invalid path. Use dot notation (e.g. foo.bar) or bracket notation for keys with periods (e.g. providers["llama.cpp"]).',
    };
  }
  if (parts.some((part) => isBlockedObjectKey(part))) {
    return { ok: false, error: "Invalid path segment." };
  }
  return { ok: true, path: parts };
}

export function setConfigValueAtPath(root: PathNode, path: string[], value: unknown): void {
  let cursor: PathNode = root;
  for (let idx = 0; idx < path.length - 1; idx += 1) {
    const key = path[idx];
    const next = cursor[key];
    if (!isPlainObject(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as PathNode;
  }
  cursor[path[path.length - 1]] = value;
}

export function unsetConfigValueAtPath(root: PathNode, path: string[]): boolean {
  const stack: Array<{ node: PathNode; key: string }> = [];
  let cursor: PathNode = root;
  for (let idx = 0; idx < path.length - 1; idx += 1) {
    const key = path[idx];
    const next = cursor[key];
    if (!isPlainObject(next)) {
      return false;
    }
    stack.push({ node: cursor, key });
    cursor = next;
  }
  const leafKey = path[path.length - 1];
  if (!(leafKey in cursor)) {
    return false;
  }
  delete cursor[leafKey];
  for (let idx = stack.length - 1; idx >= 0; idx -= 1) {
    const { node, key } = stack[idx];
    const child = node[key];
    if (isPlainObject(child) && Object.keys(child).length === 0) {
      delete node[key];
    } else {
      break;
    }
  }
  return true;
}

export function getConfigValueAtPath(root: PathNode, path: string[]): unknown {
  let cursor: unknown = root;
  for (const key of path) {
    if (!isPlainObject(cursor)) {
      return undefined;
    }
    cursor = cursor[key];
  }
  return cursor;
}

/**
 * Shared config normalization helpers for hardware adapter plugins.
 *
 * Mirrors `channel-config-helpers.ts` for channels. These utilities
 * eliminate repeated normalizer functions across hardware extensions.
 */

/** Trim a string value, returning undefined if empty or non-string. */
export function normalizeConfigString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Normalize a numeric config value with optional bounds. */
export function normalizeConfigNumber(
  value: unknown,
  opts?: { min?: number; max?: number; fallback?: number },
): number | undefined {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) {
    return opts?.fallback;
  }
  if (opts?.min !== undefined && num < opts.min) {
    return opts.fallback ?? opts.min;
  }
  if (opts?.max !== undefined && num > opts.max) {
    return opts.fallback ?? opts.max;
  }
  return num;
}

/** Normalize a boolean config value. */
export function normalizeConfigBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  return fallback;
}

/** Safely cast unknown to a Record, returning empty object if invalid. */
export function normalizeConfigObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Normalize a string array from unknown input. */
export function normalizeConfigStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return result.length > 0 ? result : undefined;
}

/**
 * Check if a hardware adapter config has the required fields to operate.
 * Pass the field names that must be non-empty strings.
 */
export function hasRequiredConfigFields(
  config: Record<string, unknown>,
  ...fields: string[]
): boolean {
  return fields.every((field) => {
    const value = config[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

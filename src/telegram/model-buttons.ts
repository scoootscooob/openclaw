/**
 * Telegram inline button utilities for model selection.
 *
 * Callback data patterns (max 64 bytes for Telegram):
 * - mdl_prov              - show providers list
 * - mdl_list_{prov}_{pg}  - show models for provider (page N, 1-indexed)
 * - mdl_sel_{provider/id} - select model (when under 64 bytes)
 * - mdl_h_{hash}          - select model via hash lookup (when full ID exceeds 64 bytes)
 * - mdl_back              - back to providers list
 */

import { createHash } from "node:crypto";

export type ButtonRow = Array<{ text: string; callback_data: string }>;

export type ParsedModelCallback =
  | { type: "providers" }
  | { type: "list"; provider: string; page: number }
  | { type: "select"; provider: string; model: string }
  | { type: "back" };

export type ProviderInfo = {
  id: string;
  count: number;
};

export type ModelsKeyboardParams = {
  provider: string;
  models: readonly string[];
  currentModel?: string;
  currentPage: number;
  totalPages: number;
  pageSize?: number;
};

const MODELS_PAGE_SIZE = 8;
const MAX_CALLBACK_DATA_BYTES = 64;

/**
 * Maps short hash keys to their full "provider/model" references so that
 * models with callback_data exceeding 64 bytes can still be selected.
 * Entries are added when building keyboards and read when parsing callbacks.
 * The map is bounded: older entries are evicted when the cap is reached.
 */
const callbackHashMap = new Map<string, string>();
const HASH_MAP_MAX_SIZE = 512;

function modelRefToHash(modelRef: string): string {
  return createHash("sha256").update(modelRef).digest("hex").slice(0, 12);
}

function storeHashAlias(hash: string, modelRef: string): void {
  if (callbackHashMap.size >= HASH_MAP_MAX_SIZE) {
    // Evict oldest entry (first inserted)
    const firstKey = callbackHashMap.keys().next().value;
    if (firstKey) {
      callbackHashMap.delete(firstKey);
    }
  }
  callbackHashMap.set(hash, modelRef);
}

/**
 * Parse a model callback_data string into a structured object.
 * Returns null if the data doesn't match a known pattern.
 */
export function parseModelCallbackData(data: string): ParsedModelCallback | null {
  const trimmed = data.trim();
  if (!trimmed.startsWith("mdl_")) {
    return null;
  }

  if (trimmed === "mdl_prov" || trimmed === "mdl_back") {
    return { type: trimmed === "mdl_prov" ? "providers" : "back" };
  }

  // mdl_list_{provider}_{page}
  const listMatch = trimmed.match(/^mdl_list_([a-z0-9_-]+)_(\d+)$/i);
  if (listMatch) {
    const [, provider, pageStr] = listMatch;
    const page = Number.parseInt(pageStr ?? "1", 10);
    if (provider && Number.isFinite(page) && page >= 1) {
      return { type: "list", provider, page };
    }
  }

  // mdl_h_{hash} — hashed model reference for long IDs
  const hashMatch = trimmed.match(/^mdl_h_([0-9a-f]{12})$/);
  if (hashMatch) {
    const hash = hashMatch[1];
    const modelRef = hash ? callbackHashMap.get(hash) : undefined;
    if (modelRef) {
      const slashIndex = modelRef.indexOf("/");
      if (slashIndex > 0 && slashIndex < modelRef.length - 1) {
        return {
          type: "select",
          provider: modelRef.slice(0, slashIndex),
          model: modelRef.slice(slashIndex + 1),
        };
      }
    }
    return null;
  }

  // mdl_sel_{provider/model}
  const selMatch = trimmed.match(/^mdl_sel_(.+)$/);
  if (selMatch) {
    const modelRef = selMatch[1];
    if (modelRef) {
      const slashIndex = modelRef.indexOf("/");
      if (slashIndex > 0 && slashIndex < modelRef.length - 1) {
        return {
          type: "select",
          provider: modelRef.slice(0, slashIndex),
          model: modelRef.slice(slashIndex + 1),
        };
      }
    }
  }

  return null;
}

/**
 * Build provider selection keyboard with 2 providers per row.
 */
export function buildProviderKeyboard(providers: ProviderInfo[]): ButtonRow[] {
  if (providers.length === 0) {
    return [];
  }

  const rows: ButtonRow[] = [];
  let currentRow: ButtonRow = [];

  for (const provider of providers) {
    const button = {
      text: `${provider.id} (${provider.count})`,
      callback_data: `mdl_list_${provider.id}_1`,
    };

    currentRow.push(button);

    if (currentRow.length === 2) {
      rows.push(currentRow);
      currentRow = [];
    }
  }

  // Push any remaining button
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Build model list keyboard with pagination and back button.
 */
export function buildModelsKeyboard(params: ModelsKeyboardParams): ButtonRow[] {
  const { provider, models, currentModel, currentPage, totalPages } = params;
  const pageSize = params.pageSize ?? MODELS_PAGE_SIZE;

  if (models.length === 0) {
    return [[{ text: "<< Back", callback_data: "mdl_back" }]];
  }

  const rows: ButtonRow[] = [];

  // Calculate page slice
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, models.length);
  const pageModels = models.slice(startIndex, endIndex);

  // Model buttons - one per row
  const currentModelId = currentModel?.includes("/")
    ? currentModel.split("/").slice(1).join("/")
    : currentModel;

  for (const model of pageModels) {
    const modelRef = `${provider}/${model}`;
    let callbackData = `mdl_sel_${modelRef}`;
    // Fall back to a short hash when the full callback_data would exceed
    // Telegram's 64-byte limit (common with long Bedrock model IDs).
    if (Buffer.byteLength(callbackData, "utf8") > MAX_CALLBACK_DATA_BYTES) {
      const hash = modelRefToHash(modelRef);
      storeHashAlias(hash, modelRef);
      callbackData = `mdl_h_${hash}`;
    }

    const isCurrentModel = model === currentModelId;
    const displayText = truncateModelId(model, 38);
    const text = isCurrentModel ? `${displayText} ✓` : displayText;

    rows.push([
      {
        text,
        callback_data: callbackData,
      },
    ]);
  }

  // Pagination row
  if (totalPages > 1) {
    const paginationRow: ButtonRow = [];

    if (currentPage > 1) {
      paginationRow.push({
        text: "◀ Prev",
        callback_data: `mdl_list_${provider}_${currentPage - 1}`,
      });
    }

    paginationRow.push({
      text: `${currentPage}/${totalPages}`,
      callback_data: `mdl_list_${provider}_${currentPage}`, // noop
    });

    if (currentPage < totalPages) {
      paginationRow.push({
        text: "Next ▶",
        callback_data: `mdl_list_${provider}_${currentPage + 1}`,
      });
    }

    rows.push(paginationRow);
  }

  // Back button
  rows.push([{ text: "<< Back", callback_data: "mdl_back" }]);

  return rows;
}

/**
 * Build "Browse providers" button for /model summary.
 */
export function buildBrowseProvidersButton(): ButtonRow[] {
  return [[{ text: "Browse providers", callback_data: "mdl_prov" }]];
}

/**
 * Truncate model ID for display, preserving end if too long.
 */
function truncateModelId(modelId: string, maxLen: number): string {
  if (modelId.length <= maxLen) {
    return modelId;
  }
  // Show last part with ellipsis prefix
  return `…${modelId.slice(-(maxLen - 1))}`;
}

/**
 * Get page size for model list pagination.
 */
export function getModelsPageSize(): number {
  return MODELS_PAGE_SIZE;
}

/**
 * Calculate total pages for a model list.
 */
export function calculateTotalPages(totalModels: number, pageSize?: number): number {
  const size = pageSize ?? MODELS_PAGE_SIZE;
  return size > 0 ? Math.ceil(totalModels / size) : 1;
}

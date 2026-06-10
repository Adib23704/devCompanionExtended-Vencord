/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ToolCallResult } from "./types";

export const RESOURCE_MAX_AGE_MS = 5 * 60 * 1000;
export const RESOURCE_MAX_ENTRIES = 200;

export const resourceStore = new Map<
  string,
  { mimeType: string; text: string; createdAt: number }
>();

export function storeResource(text: string, mimeType: string): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  resourceStore.set(id, { mimeType, text, createdAt: Date.now() });
  pruneResources();
  return id;
}

export function updateResource(
  id: string,
  text: string,
  mimeType: string,
): void {
  const entry = resourceStore.get(id);
  if (entry) {
    entry.text = text;
    entry.mimeType = mimeType;
    entry.createdAt = Date.now();
    return;
  }
  resourceStore.set(id, { mimeType, text, createdAt: Date.now() });
  pruneResources();
}

export function readResource(id: string, offset?: number, length?: number) {
  const entry = resourceStore.get(id);
  if (!entry) {
    throw new Error(`Resource not found: ${id}`);
  }
  const start = Math.max(0, offset ?? 0);
  const end = length ? start + Math.max(0, length) : entry.text.length;
  const slice = entry.text.slice(start, end);
  return {
    mimeType: entry.mimeType,
    text: slice,
    truncated: end < entry.text.length,
    total: entry.text.length,
    raw: true,
  };
}

export function pruneResources() {
  const now = Date.now();
  for (const [id, entry] of resourceStore.entries()) {
    if (now - entry.createdAt > RESOURCE_MAX_AGE_MS) {
      resourceStore.delete(id);
    }
  }
  if (resourceStore.size > RESOURCE_MAX_ENTRIES) {
    const oldest = [...resourceStore.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );
    for (let i = 0; i < oldest.length - RESOURCE_MAX_ENTRIES; i++) {
      resourceStore.delete(oldest[i][0]);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function summarizeValue(value: unknown) {
  if (Array.isArray(value)) {
    return { type: "array", count: value.length };
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    const arrayCounts: Record<string, number> = {};
    const stringLengths: Record<string, number> = {};
    for (const key of keys) {
      const entry = value[key];
      if (Array.isArray(entry)) arrayCounts[key] = entry.length;
      else if (typeof entry === "string") stringLengths[key] = entry.length;
    }
    return {
      type: "object",
      keys,
      arrayCounts,
      stringLengths,
    };
  }
  return { type: typeof value };
}

export function buildResourceResponse(
  data: unknown,
  mimeType = "application/json",
  previewLength = 800,
): ToolCallResult {
  if (
    data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).raw === true
  ) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (text.length <= previewLength * 4) {
    return { content: [{ type: "text", text }] };
  }
  const resourceId = storeResource(text, mimeType);
  const preview = text.slice(0, previewLength) + "...";
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            resourceId,
            preview,
            totalBytes: text.length,
            mimeType,
            summary: summarizeValue(data),
          },
          null,
          2,
        ),
      },
    ],
  };
}

function getErrorHint(message: string): string | null {
  if (/required/.test(message)) return "Check required fields in the request.";
  if (/Expected exactly 1 match/.test(message))
    return "Refine the find pattern or run patch.unique first.";
  if (/had no effect/.test(message))
    return "Match did not apply; check pattern and preview context.";
  if (/Pattern not found/.test(message))
    return "Find string did not exist in the target module.";
  if (/timed out|timeout/i.test(message))
    return "Retry after Discord finishes loading.";
  return null;
}

export function buildErrorResponse(
  message: string,
  where?: string,
): ToolCallResult {
  const hint = getErrorHint(message);
  const payload: Record<string, unknown> = { error: message };
  if (where) payload.where = where;
  if (hint) payload.hint = hint;
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

function trimTopLevel(value: unknown, maxItems?: number, maxChars?: number) {
  const truncation: Record<
    string,
    { total?: number; returned?: number; length?: number; truncated?: boolean }
  > = {};
  if (Array.isArray(value)) {
    if (
      typeof maxItems === "number" &&
      maxItems >= 0 &&
      value.length > maxItems
    ) {
      const trimmed = value.slice(0, maxItems);
      return {
        value: { items: trimmed, total: value.length, truncated: true },
        truncation: {
          __root__: {
            total: value.length,
            returned: trimmed.length,
            truncated: true,
          },
        },
      };
    }
    return { value, truncation };
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = { ...value };
    for (const [key, entry] of Object.entries(result)) {
      if (
        Array.isArray(entry) &&
        typeof maxItems === "number" &&
        maxItems >= 0 &&
        entry.length > maxItems
      ) {
        result[key] = entry.slice(0, maxItems);
        truncation[key] = {
          total: entry.length,
          returned: (result[key] as unknown[]).length,
          truncated: true,
        };
      } else if (
        typeof entry === "string" &&
        typeof maxChars === "number" &&
        maxChars >= 0 &&
        entry.length > maxChars
      ) {
        result[key] = entry.slice(0, Math.max(0, maxChars - 3)) + "...";
        truncation[key] = { length: entry.length, truncated: true };
      }
    }
    return { value: result, truncation };
  }
  if (
    typeof value === "string" &&
    typeof maxChars === "number" &&
    maxChars >= 0 &&
    value.length > maxChars
  ) {
    return {
      value: value.slice(0, Math.max(0, maxChars - 3)) + "...",
      truncation: { __root__: { length: value.length, truncated: true } },
    };
  }
  return { value, truncation };
}

export function buildToolResponse(
  result: unknown,
  args?: Record<string, unknown>,
): ToolCallResult {
  const summary = Boolean(args?.summary);
  const maxItems =
    typeof args?.maxItems === "number" ? Number(args.maxItems) : undefined;
  const maxChars =
    typeof args?.maxChars === "number" ? Number(args.maxChars) : undefined;
  if (!summary && maxItems === undefined && maxChars === undefined) {
    return buildResourceResponse(result);
  }
  const defaults = summary
    ? {
        maxItems: maxItems ?? 10,
        maxChars: maxChars ?? 200,
      }
    : { maxItems, maxChars };
  const trimmed = trimTopLevel(result, defaults.maxItems, defaults.maxChars);
  const payload = summary
    ? {
        summary: summarizeValue(result),
        truncation: Object.keys(trimmed.truncation).length
          ? trimmed.truncation
          : undefined,
        data: trimmed.value,
      }
    : Object.keys(trimmed.truncation).length
      ? { data: trimmed.value, truncation: trimmed.truncation }
      : trimmed.value;
  return buildResourceResponse(payload);
}

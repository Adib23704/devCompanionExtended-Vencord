/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { canonicalizeMatch } from "@utils/patches";

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseRegex(pattern: string, flags: string): RegExp {
  return new RegExp(pattern, flags);
}

export function parseRegexArg(
  arg: string | { pattern: string; flags: string },
): string | RegExp {
  if (typeof arg === "object" && arg && "pattern" in arg) {
    return parseRegex(arg.pattern, arg.flags);
  }
  if (
    typeof arg === "string" &&
    arg.startsWith("/") &&
    arg.lastIndexOf("/") > 0
  ) {
    const lastSlash = arg.lastIndexOf("/");
    const pattern = arg.substring(1, lastSlash);
    const flags = arg.substring(lastSlash + 1);
    try {
      return parseRegex(pattern, flags);
    } catch {
      return arg;
    }
  }
  return arg;
}

export function parseRegexString(
  arg: string,
):
  | { type: "string"; value: string }
  | { type: "regex"; value: { pattern: string; flags: string } } {
  if (arg.startsWith("/")) {
    const lastSlash = arg.lastIndexOf("/");
    if (lastSlash > 0) {
      const pattern = arg.substring(1, lastSlash);
      const flags = arg.substring(lastSlash + 1);
      return { type: "regex", value: { pattern, flags } };
    }
  }
  return { type: "string", value: arg };
}

export function parsePotentialRegex(
  query: string,
  isRegex: boolean,
): { regex: RegExp | null; patternString: string | null } {
  if (!isRegex && query.startsWith("/") && query.lastIndexOf("/") > 0) {
    const lastSlash = query.lastIndexOf("/");
    const body = query.substring(1, lastSlash);
    const flags = query.substring(lastSlash + 1);
    try {
      return { regex: new RegExp(body, flags), patternString: null };
    } catch {
      /* fall through */
    }
  }
  if (isRegex) {
    try {
      return { regex: new RegExp(query), patternString: null };
    } catch {
      /* ignore */
    }
  }
  return { regex: null, patternString: query };
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function toOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function truncatePayload(payload: unknown, maxChars?: number) {
  if (!maxChars || !Number.isFinite(maxChars)) return payload;
  const limit = Math.max(200, Math.min(20000, Number(maxChars)));
  const text = JSON.stringify(payload);
  if (text.length <= limit) return payload;
  return { truncated: true, preview: text.slice(0, limit), maxChars: limit };
}

export function truncatePayloadDepth(
  payload: unknown,
  maxDepth?: number | null,
  depth = 0,
): unknown {
  if (!maxDepth || !Number.isFinite(maxDepth)) return payload;
  const limit = Math.max(1, Math.min(10, Number(maxDepth)));
  if (payload === null || payload === undefined) return payload;
  if (typeof payload !== "object") return payload;
  if (depth >= limit) return { truncated: true, depth: limit };
  if (Array.isArray(payload)) {
    return payload.map((value) =>
      truncatePayloadDepth(value, limit, depth + 1),
    );
  }
  const record = payload as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    next[key] = truncatePayloadDepth(value, limit, depth + 1);
  }
  return next;
}

export function safeSerialize(value: unknown): unknown {
  const seen = new WeakSet<object>();
  const MAX_DEPTH = 6;
  const MAX_KEYS = 40;
  const MAX_ARRAY = 100;
  const MAX_STRING = 10000;

  const serialize = (val: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) return "[Max Depth]";
    if (val === null || val === undefined) return val;
    if (typeof val === "bigint") return val.toString();
    if (typeof val === "function") {
      const source = val.toString();
      return source.length > MAX_STRING
        ? source.slice(0, MAX_STRING) + "..."
        : source;
    }
    if (typeof val === "string") {
      return val.length > MAX_STRING ? val.slice(0, MAX_STRING) + "..." : val;
    }
    if (typeof val !== "object") return val;

    if (seen.has(val as object)) return "[Circular]";
    seen.add(val as object);

    if (val instanceof Map) {
      return serialize(Object.fromEntries(val), depth + 1);
    }
    if (val instanceof Set) {
      return serialize(Array.from(val), depth + 1);
    }
    if (val instanceof RegExp) return val.toString();
    if (val instanceof Error) {
      return { error: val.message, stack: val.stack };
    }
    if (Array.isArray(val)) {
      return val.slice(0, MAX_ARRAY).map((item) => serialize(item, depth + 1));
    }

    const obj: Record<string, unknown> = {};
    for (const key of Object.keys(val as object).slice(0, MAX_KEYS)) {
      obj[key] = serialize((val as Record<string, unknown>)[key], depth + 1);
    }
    return obj;
  };

  try {
    return serialize(value, 0);
  } catch {
    return String(value);
  }
}

export const SENSITIVE_KEY_REGEX =
  /token|authorization|cookie|password|pass|email|phone|secret/i;
export const TOKEN_VALUE_REGEX =
  /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{10,}/g;

export function filterFields(
  value: unknown,
  fields?: string[] | null,
): unknown {
  if (!fields || fields.length === 0) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in record) filtered[key] = record[key];
  }
  return filtered;
}

export function ensureBaseFields(
  entry: Record<string, unknown>,
  base: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(base)) {
    if (!(key in entry)) entry[key] = value;
  }
  return entry;
}

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 4) return value;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (TOKEN_VALUE_REGEX.test(value)) {
      TOKEN_VALUE_REGEX.lastIndex = 0;
      return value.replace(TOKEN_VALUE_REGEX, "[redacted]");
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((item) => redactSensitive(item, depth + 1));

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = redactSensitive(val, depth + 1);
  }
  return result;
}

export function trimPreviewText(value: string, maxLength = 160) {
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 3)) + "...";
}

export function normalizeRegex(pattern: string | RegExp) {
  const regex =
    pattern instanceof RegExp ? pattern : new RegExp(escapeRegex(pattern), "g");
  const flags = regex.flags.replace("g", "");
  return new RegExp(regex.source, flags);
}

export function getLineColumn(text: string, index: number) {
  const safeIndex = Math.max(0, Math.min(text.length, index));
  const before = text.slice(0, safeIndex);
  const lines = before.split("\n");
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

export function getLineContext(
  text: string,
  index: number,
  contextLines: number,
) {
  const { line } = getLineColumn(text, index);
  const lines = text.split("\n");
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line - 1 + contextLines + 1);
  const before = lines.slice(start, line - 1);
  const current = lines[line - 1] ?? "";
  const after = lines.slice(line, end);
  return { before, current, after, line };
}

type MatchContextResult =
  | { found: false }
  | {
      found: true;
      index: number;
      line: number;
      column: number;
      match: string;
      matchLength: number;
      snippet: string;
      context: ReturnType<typeof getLineContext>;
    };

export function getMatchContext(
  text: string,
  pattern: string | RegExp,
  contextLines = 2,
  radius = 120,
): MatchContextResult {
  const safePattern = normalizeRegex(pattern);
  const matcher = canonicalizeMatch(safePattern);
  const match = matcher.exec(text);
  if (!match || typeof match.index !== "number") {
    return { found: false };
  }
  const { index } = match;
  const { line, column } = getLineColumn(text, index);
  const snippet = text.slice(
    Math.max(0, index - radius),
    Math.min(text.length, index + match[0].length + radius),
  );
  const matchLength = match[0]?.length ?? 0;
  return {
    found: true,
    index,
    line,
    column,
    match: match[0],
    matchLength,
    snippet,
    context: getLineContext(text, index, contextLines),
  };
}

export function findLookbehindAnchor(text: string, pattern: string | RegExp) {
  const safePattern = normalizeRegex(pattern);
  const matcher = canonicalizeMatch(safePattern);
  const match = matcher.exec(text);
  if (!match) return null;
  const lastGroup = match.length > 1 ? match[match.length - 1] : "";
  if (!lastGroup) return null;
  const anchorIndex = text.indexOf(lastGroup, match.index ?? 0);
  return anchorIndex >= 0 ? anchorIndex : null;
}

export function sliceSnippets(
  text: string,
  matches: RegExpMatchArray[] | null,
  limit: number,
  radius = 60,
): string[] {
  if (!matches) return [];
  const snippets: string[] = [];
  for (let i = 0; i < matches.length && snippets.length < limit; i++) {
    const m = matches[i];
    if (typeof m.index !== "number") continue;
    const start = Math.max(0, m.index - radius);
    const end = Math.min(text.length, m.index + (m[0]?.length || 0) + radius);
    snippets.push(text.slice(start, end).replace(/\s+/g, " "));
  }
  return snippets;
}

export function collectPatchWarnings(
  text: string,
  replacements: Array<{
    match: string | { pattern: string; flags: string };
    replace: string;
  }>,
) {
  const warnings: string[] = [];
  const invalidChildrenArrow = /children:[A-Za-z_$][\w$]*\([^)]*\)=>/;
  if (invalidChildrenArrow.test(text)) {
    warnings.push(
      "Detected children:<call>(...)=> pattern; this usually means a replacement hit the render-prop argument instead of the inner children value.",
    );
  }
  if (/,\s*,/.test(text)) {
    warnings.push(
      "Detected consecutive commas; this often means a replacement appended a comma after an existing comma.",
    );
  }
  if (replacements.length > 1) {
    warnings.push(
      "Patch has multiple replacements; consider simplifying to reduce break risk.",
    );
  }
  const selfRefs = new Set<string>();
  for (const replacement of replacements) {
    if (typeof replacement.replace !== "string") continue;
    for (const match of replacement.replace.matchAll(
      /\$self\.([A-Za-z_$][\w$]*)/g,
    )) {
      selfRefs.add(match[1]);
    }
  }
  if (selfRefs.size) {
    warnings.push(
      `Patch references $self.${Array.from(selfRefs).join(", ")}; ensure these methods are exported on the plugin object.`,
    );
  }
  return warnings;
}

export function analyzePatternQuality(pattern: string) {
  const warnings: string[] = [];
  const anchors: string[] = [];
  let score = 5;
  const captureGroups = (pattern.match(/\((?!\?)/g) ?? []).length;

  if (/#\{intl::/.test(pattern)) {
    anchors.push("intl");
    score += 3;
  }
  if (/"[^"]{3,}"/.test(pattern) || /'[^']{3,}'/.test(pattern)) {
    anchors.push("string-literal");
    score += 2;
  }
  if (/[A-Za-z_$][\w$]*:/.test(pattern)) {
    anchors.push("prop-name");
    score += 2;
  }
  if (/\\i/.test(pattern)) {
    anchors.push("identifier");
    score += 1;
  }

  if (/\b(function|return|if|for|while|const|let)\b/.test(pattern)) {
    warnings.push(
      "Anchored on generic keywords; prefer stable strings or props.",
    );
    score -= 2;
  }
  if (/\.\+\?|\.\*\?|\.\+|\.\*/.test(pattern)) {
    warnings.push("Uses unbounded wildcards; prefer explicit .{0,N} limits.");
    score -= 1;
  }
  if (pattern.length > 200) {
    warnings.push("Pattern is long; consider a shorter, more stable anchor.");
    score -= 1;
  }
  if (captureGroups > 3) {
    warnings.push(
      "Many capture groups; consider reducing captures to simplify the patch.",
    );
    score -= 1;
  }
  if (!anchors.length) {
    warnings.push(
      "No strong anchors detected; consider an intl key or unique string.",
    );
    score -= 1;
  }

  score = Math.max(1, Math.min(10, score));
  return {
    score,
    anchors,
    warnings,
    captureGroups,
    anchorCount: anchors.length,
  };
}

export function extractAnchorCandidates(snippet: string) {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };

  for (const match of snippet.matchAll(/#\{intl::[A-Z0-9_]+\}/g)) {
    push(match[0]);
  }
  for (const match of snippet.matchAll(/(["'])([^"'\\]{4,60})\1/g)) {
    const value = match[0];
    if (value.includes(" ")) continue;
    push(value);
  }
  for (const match of snippet.matchAll(/\b[A-Za-z_$][\w$]*:/g)) {
    push(match[0]);
  }

  return candidates.slice(0, 6);
}

export function extractStringLiterals(
  source: string,
  minLength = 4,
  maxLength = 80,
  limit = 20,
) {
  const counts = new Map<string, number>();
  const regex = /(["'])([^"'\\]{4,80})\1/g;
  for (const match of source.matchAll(regex)) {
    const value = match[2];
    if (value.length < minLength || value.length > maxLength) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const items = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
  return { items, totalUnique: counts.size };
}

// DOM utility functions
export type DomNodeSummary = {
  tag: string;
  id?: string;
  classes: string[];
  text?: string;
  attrs?: Record<string, string>;
  childCount: number;
  children?: DomNodeSummary[];
};

export function normalizeText(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length > maxLength) {
    return clean.slice(0, maxLength) + "...";
  }
  return clean;
}

export function collectAttributes(
  el: Element,
  max = 10,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes).slice(0, max)) {
    attrs[attr.name] = attr.value;
  }
  return attrs;
}

export function elementPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 10) {
    const tag = node.tagName.toLowerCase();
    const id = node.id ? `#${node.id}` : "";
    const classes = node.classList.length
      ? "." + Array.from(node.classList).slice(0, 2).join(".")
      : "";
    const parent = node.parentElement;
    let nth = "";
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(node);
      nth = `:nth-child(${index + 1})`;
    }
    parts.unshift(`${tag}${id}${classes}${nth}`);
    node = parent;
    depth++;
  }
  return parts.join(" > ");
}

export function summarizeNode(
  el: Element,
  includeText: boolean,
  includeAttrs: boolean,
  maxTextLength: number,
): DomNodeSummary {
  const text = includeText
    ? normalizeText(el.textContent || "", maxTextLength)
    : undefined;
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: Array.from(el.classList),
    text: text && text.length > 0 ? text : undefined,
    attrs: includeAttrs ? collectAttributes(el) : undefined,
    childCount: el.childElementCount,
  };
}

export function buildTree(
  el: Element,
  depth: number,
  breadth: number,
  includeText: boolean,
  maxTextLength: number,
): DomNodeSummary {
  const node = summarizeNode(el, includeText, false, maxTextLength);
  if (depth <= 0) {
    return node;
  }
  const children: Element[] = Array.from(el.children).slice(0, breadth);
  if (children.length > 0) {
    node.children = children.map((child) =>
      buildTree(child, depth - 1, breadth, includeText, maxTextLength),
    );
  }
  return node;
}

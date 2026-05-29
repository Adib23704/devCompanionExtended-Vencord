/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { wreq } from "@webpack";

import { logger, settings } from "..";
import { stableStringify } from "./utils";

export const CACHE_TTL = 10000;
export const STORE_CACHE_TTL_MS = 120000;
export const PATCHED_CACHE_TTL_MS = 60000;
export const TOOL_CACHE_TTL_MS = 10000;
export const ANALYTICS_TARGET_CACHE_TTL_MS = 30000;
export const TOOL_CACHE_MAX_ENTRIES = 300;
export const TOOL_CACHE_OVERRIDES = new Map<string, number>([
    ["store", STORE_CACHE_TTL_MS],
    ["patch", PATCHED_CACHE_TTL_MS],
    ["search", 30000],
    ["module", 30000]
]);

export const moduleCache = new Map<string, { code: string; timestamp: number; }>();
export const toolResponseCache = new Map<string, { timestamp: number; ttlMs: number; value: unknown; }>();
export const toolResponseInFlight = new Map<string, Promise<unknown>>();
export let toolCacheHits = 0;
export let toolCacheStores = 0;
export const storeCache: { timestamp: number; data: Record<string, { found: boolean; moduleId?: number; source?: string; }> | null; } = {
    timestamp: 0,
    data: null
};
export const patchedModulesCache = new Map<string, { timestamp: number; result: { patches: Array<{ moduleId: number; pluginName: string; find: string; replacements: number; }>; totalFound: number; offset: number; limit: number; hasMore: boolean; }; }>();
export const patchedModulesInFlight = new Map<string, Promise<{ patches: Array<{ moduleId: number; pluginName: string; find: string; replacements: number; }>; totalFound: number; offset: number; limit: number; hasMore: boolean; }>>();
export const exportModuleIdCache = new WeakMap<object, number>();
export const componentNameCache = new Map<number, { name: string; source: string; confidence: number; } | null>();

export function isCacheableTool(name: string, args?: unknown): boolean {
    if ([
        "reloadDiscord",
        "evaluateCode",
        "batch_tools",
        "analytics"
    ].includes(name)) {
        return false;
    }

    const params = (args && typeof args === "object") ? (args as Record<string, unknown>) : {};
    const action = typeof params.action === "string" ? params.action : undefined;

    if (name === "dom") return action !== "modify";
    if (name === "flux") return action !== "dispatch";
    if (name === "discord") return action !== "api";
    if (name === "store") return action !== "call" && action !== "diff";
    if (name === "plugin") {
        if (action === "toggle") return false;
        if (action === "settings" && "values" in params) return false;
        return true;
    }
    return true;
}

export function shouldCacheResult(value: unknown): boolean {
    if (!value || typeof value !== "object") return true;
    const record = value as Record<string, unknown>;
    if ("error" in record) return false;
    if (record.isError === true) return false;
    if (record.cached === true) return false;
    return true;
}

export function getToolCacheTtlMs(name: string): number {
    if (!settings.store.cacheEnabled) return 0;
    return TOOL_CACHE_OVERRIDES.get(name) ?? settings.store.cacheTtlMs ?? TOOL_CACHE_TTL_MS;
}

export function cleanupToolCache(): void {
    const maxEntries = settings.store.cacheMaxEntries ?? TOOL_CACHE_MAX_ENTRIES;
    if (toolResponseCache.size <= maxEntries) return;
    const entries = Array.from(toolResponseCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < entries.length - maxEntries; i++) {
        toolResponseCache.delete(entries[i][0]);
    }
}

export async function executeWithCache<T>(name: string, args: unknown, compute: () => Promise<T>): Promise<T> {
    if (!settings.store.cacheEnabled || !isCacheableTool(name, args)) return compute();

    const cacheKey = `${name}:${stableStringify(args ?? {})}`;
    const baseTtlMs = getToolCacheTtlMs(name);
    if (baseTtlMs <= 0) return compute();
    const now = Date.now();
    const cached = toolResponseCache.get(cacheKey);
    if (cached && now - cached.timestamp < cached.ttlMs) {
        toolCacheHits++;
        if (cached.value && typeof cached.value === "object") {
            if (Array.isArray(cached.value)) {
                return { cached: true, result: cached.value } as T;
            }
            return { ...(cached.value as Record<string, unknown>), cached: true } as T;
        }
        return { cached: true, result: cached.value } as T;
    }

    const inflight = toolResponseInFlight.get(cacheKey) as Promise<T> | undefined;
    if (inflight) return inflight;

    const task = (async () => {
        const startTime = performance.now();
        const value = await compute();
        const durationMs = Math.max(0, performance.now() - startTime);
        if (shouldCacheResult(value)) {
            const cachedValue = value && typeof value === "object" && "cached" in (value as Record<string, unknown>)
                ? { ...(value as Record<string, unknown>), cached: false }
                : value;
            const adaptiveTtlMs = Math.min(
                120000,
                Math.max(baseTtlMs, Math.round(durationMs * 15))
            );
            toolResponseCache.set(cacheKey, { timestamp: Date.now(), ttlMs: adaptiveTtlMs, value: cachedValue });
            toolCacheStores++;
            cleanupToolCache();
            return cachedValue as T;
        }
        return value;
    })();

    toolResponseInFlight.set(cacheKey, task);
    try {
        return await task;
    } finally {
        toolResponseInFlight.delete(cacheKey);
    }
}

export async function* asyncIterateModules<T>(
    processor: (id: string, code: string) => T | null,
    filter?: (id: string) => boolean
): AsyncGenerator<T, void, unknown> {
    const modules = Object.keys(wreq.m);
    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < modules.length; i += batchSize) {
        const batch = modules.slice(i, Math.min(i + batchSize, modules.length));

        await new Promise(resolve => setTimeout(resolve, 0));

        for (const id of batch) {
            if (filter && !filter(id)) continue;

            const code = wreq.m[id].toString();
            const result = processor(id, code);

            if (result !== null) {
                yield result;
            }

            processed++;

            if (processed % 100 === 0) {
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }
    }
}

function debugInfo(message: string) {
    if (settings.store.debugMode) {
        logger.info(message);
    }
}

export class ModuleSearchEngine {
    private static codeCache = new Map<string, { code: string; hash: number; }>();
    private static searchIndex = new Map<string, { ids: Set<string>; timestamp: number; }>();
    private static literalCache = new Map<string, { timestamp: number; matches: Array<{ id: number; preview: string; occurrences: number; offsets: number[]; snippets: string[]; }>; }>();
    private static tokenIndex = new Map<string, Set<string>>();
    private static tokenIndexReady = false;
    private static tokenIndexInFlight: Promise<void> | null = null;
    private static tokenIndexDisabled = false;
    private static tokenIndexLoggedHit = false;
    private static readonly INDEX_TTL_MS = 60000;
    private static readonly LITERAL_TTL_MS = 30000;
    private static readonly TOKEN_INDEX_LIMIT = 200000;
    private static readonly TOKEN_MAX_PER_MODULE = 200;
    private static readonly TOKEN_REGEX = /[A-Za-z_][A-Za-z0-9_]{2,}/g;

    static hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < Math.min(str.length, 1000); i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    static getModuleCode(id: string): string {
        const cached = this.codeCache.get(id);
        if (cached) return cached.code;

        const code = wreq.m[id].toString();
        this.codeCache.set(id, { code, hash: this.hashCode(code) });

        if (this.codeCache.size > 500) {
            const firstKey = this.codeCache.keys().next().value;
            if (firstKey) {
                this.codeCache.delete(firstKey);
            }
        }

        return code;
    }

    static async* searchPattern(pattern: string | RegExp): AsyncGenerator<{ id: string; code: string; }, void, unknown> {
        const isRegex = pattern instanceof RegExp;
        const searchStr = isRegex ? "" : pattern;

        if (!isRegex && searchStr.length > 3) {
            const candidates = await this.getIndexedCandidates(searchStr);
            if (candidates) {
                for (const id of candidates) {
                    const code = this.getModuleCode(id);
                    if (isRegex ? pattern.test(code) : code.includes(searchStr)) {
                        yield { id, code };
                    }
                }
                return;
            }
        }

        if (!isRegex && searchStr.length > 3) {
            const key = searchStr.substring(0, 3);
            const indexed = this.searchIndex.get(key);
            if (indexed && Date.now() - indexed.timestamp < this.INDEX_TTL_MS) {
                for (const id of indexed.ids) {
                    const code = this.getModuleCode(id);
                    if (isRegex ? pattern.test(code) : code.includes(searchStr)) {
                        yield { id, code };
                    }
                }
                return;
            }
        }

        yield* asyncIterateModules((id, code) => {
            const matches = isRegex ? pattern.test(code) : code.includes(searchStr);
            if (matches) {
                if (!isRegex && searchStr.length > 3) {
                    const key = searchStr.substring(0, 3);
                    if (!this.searchIndex.has(key)) {
                        this.searchIndex.set(key, { ids: new Set(), timestamp: Date.now() });
                    }
                    const entry = this.searchIndex.get(key)!;
                    entry.ids.add(id);
                    entry.timestamp = Date.now();
                }
                return { id, code };
            }
            return null;
        });
    }

    static clearCache() {
        this.codeCache.clear();
        this.searchIndex.clear();
        this.patternCache.clear();
        this.literalCache.clear();
        this.tokenIndex.clear();
        this.tokenIndexReady = false;
        this.tokenIndexDisabled = false;
        this.tokenIndexInFlight = null;
    }

    private static patternCache = new Map<string, Array<{ id: string; code: string; }>>();

    static getCachedResults(pattern: string | RegExp): Array<{ id: string; code: string; }> {
        const key = pattern instanceof RegExp ? pattern.toString() : pattern;
        return this.patternCache.get(key) || [];
    }

    static addToCache(pattern: string | RegExp, id: string, code: string): void {
        const key = pattern instanceof RegExp ? pattern.toString() : pattern;
        if (!this.patternCache.has(key)) {
            this.patternCache.set(key, []);
        }
        const cached = this.patternCache.get(key)!;
        if (cached.length >= 20) return;
        if (!cached.some(item => item.id === id)) {
            cached.push({ id, code: code.substring(0, 500) });
        }
        if (this.patternCache.size > 50) {
            const keys = Array.from(this.patternCache.keys());
            for (let i = 0; i < 25; i++) {
                this.patternCache.delete(keys[i]);
            }
        }
    }

    static getLiteralCache(query: string): Array<{ id: number; preview: string; occurrences: number; offsets: number[]; snippets: string[]; }> | null {
        const entry = this.literalCache.get(query);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this.LITERAL_TTL_MS) {
            this.literalCache.delete(query);
            return null;
        }
        return entry.matches;
    }

    static setLiteralCache(query: string, matches: Array<{ id: number; preview: string; occurrences: number; offsets: number[]; snippets: string[]; }>) {
        this.literalCache.set(query, { timestamp: Date.now(), matches });
        if (this.literalCache.size > 50) {
            const keys = Array.from(this.literalCache.keys());
            for (let i = 0; i < 25; i++) {
                this.literalCache.delete(keys[i]);
            }
        }
    }

    private static extractTokens(text: string): string[] {
        const matches = text.match(this.TOKEN_REGEX);
        if (!matches) return [];
        const unique = new Set<string>();
        for (const token of matches) {
            unique.add(token.toLowerCase());
            if (unique.size >= this.TOKEN_MAX_PER_MODULE) break;
        }
        return Array.from(unique);
    }

    private static addToken(token: string, moduleId: string): boolean {
        let entry = this.tokenIndex.get(token);
        if (!entry) {
            if (this.tokenIndex.size >= this.TOKEN_INDEX_LIMIT) {
                return false;
            }
            entry = new Set();
            this.tokenIndex.set(token, entry);
        }
        entry.add(moduleId);
        return true;
    }

    static async ensureTokenIndex(): Promise<void> {
        if (!settings.store.prebuildSearchIndex || this.tokenIndexDisabled) return;
        if (this.tokenIndexReady) return;
        if (this.tokenIndexInFlight) return this.tokenIndexInFlight;

        this.tokenIndexInFlight = (async () => {
            const moduleIds = Object.keys(wreq.m);
            const batchSize = 10;
            let processed = 0;
            debugInfo(`Building search index for ${moduleIds.length} modules...`);

            for (let i = 0; i < moduleIds.length; i += batchSize) {
                const batch = moduleIds.slice(i, Math.min(i + batchSize, moduleIds.length));
                await new Promise(resolve => setTimeout(resolve, 0));

                for (const id of batch) {
                    const code = wreq.m[id].toString();
                    const tokens = this.extractTokens(code);
                    for (const token of tokens) {
                        if (!this.addToken(token, id)) {
                            this.tokenIndexDisabled = true;
                            this.tokenIndex.clear();
                            logger.warn("Prebuilt search index disabled: token limit exceeded");
                            return;
                        }
                    }
                    processed++;
                    if (processed % 100 === 0) {
                        await new Promise(resolve => requestAnimationFrame(resolve));
                    }
                }
            }

            this.tokenIndexReady = true;
            debugInfo(`Search index ready: ${processed} modules, ${this.tokenIndex.size} tokens`);
        })().finally(() => {
            this.tokenIndexInFlight = null;
        });

        return this.tokenIndexInFlight;
    }

    static async getIndexedCandidates(query: string): Promise<Set<string> | null> {
        if (!settings.store.prebuildSearchIndex || this.tokenIndexDisabled) return null;
        await this.ensureTokenIndex();
        if (!this.tokenIndexReady) return null;

        const tokens = this.extractTokens(query);
        if (!tokens.length) return null;

        let best: Set<string> | null = null;
        for (const token of tokens) {
            const candidates = this.tokenIndex.get(token);
            if (!candidates) continue;
            if (!best || candidates.size < best.size) {
                best = candidates;
            }
        }

        if (best && !this.tokenIndexLoggedHit) {
            this.tokenIndexLoggedHit = true;
            debugInfo(`Search index hit: ${best.size} candidate modules`);
        }
        return best;
    }
}

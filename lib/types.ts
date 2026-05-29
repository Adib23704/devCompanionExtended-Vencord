/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface WSMessage {
    type: "tool_call";
    data: { name: string; arguments?: Record<string, unknown>; raw?: boolean; };
    nonce: number;
}

export interface RegexNode {
    type: "regex";
    value: { pattern: string; flags: string; };
}

export interface StringNode {
    type: "string";
    value: string;
}

export type ArgNode = RegexNode | StringNode;

export interface SearchRequest {
    findType: string;
    args: ArgNode[];
}

export interface FindByPropsRequest {
    props: string[];
}

export interface FindByCodeRequest {
    code: string[];
}

export interface FindStoreRequest {
    name: string;
}

export interface FindComponentByCodeRequest {
    code: string[];
}

export interface FindAllRequest {
    props: string[];
    limit?: number;
}

export interface GetModuleIdsRequest {
    limit?: number;
}

export interface GetFluxEventsRequest {
    filter?: string;
}

export interface GetIntlKeysRequest {
    filter?: string;
    limit?: number;
}

export interface ExtractRequest {
    moduleId: PropertyKey;
    usePatched?: boolean;
    maxLength?: number;
}

export interface DiffRequest {
    moduleId: PropertyKey;
}

export interface TestPatchRequest {
    find: string | { pattern: string; flags: string; };
    replacements: Array<{
        match: string | { pattern: string; flags: string; };
        replace: string;
    }>;
    preview?: boolean;
    previewMode?: "compact" | "full" | "context-only";
    contextLines?: number;
    radius?: number;
}

export interface PatchLintRequest {
    find: string | { pattern: string; flags: string; };
    replacements: Array<{
        match: string | { pattern: string; flags: string; };
        replace: string;
    }>;
    moduleId?: number;
}

export interface PluginToggleRequest {
    pluginName: string;
    enabled: boolean;
}

export interface BulkSearchRequest {
    queries: Array<{
        name?: string;
        findType: string;
        args: ArgNode[];
    }>;
}

export interface QueryDomRequest {
    selector: string;
    limit?: number;
    includeText?: boolean;
    includeAttrs?: boolean;
    maxTextLength?: number;
}

export interface InspectDomPathRequest {
    selector: string;
    index?: number;
    depth?: number;
    breadth?: number;
    includeText?: boolean;
    maxTextLength?: number;
}

export interface ListDomClassesRequest {
    maxNodes?: number;
    maxClasses?: number;
}

export interface FindTextNodesRequest {
    query: string;
    isRegex?: boolean;
    maxResults?: number;
    maxTextLength?: number;
}

export interface SearchLiteralRequest {
    query: string;
    isRegex?: boolean;
    limit?: number;
    offset?: number;
    preset?: "compact" | "full" | "minimal";
}

export interface SearchContextRequest {
    pattern: string;
    isRegex?: boolean;
    limit?: number;
    matchLimit?: number;
    radius?: number;
    contextLines?: number;
}

export interface ComponentLocatorRequest {
    query: string;
    isRegex?: boolean;
    limit?: number;
}

export interface DispatcherActionsRequest {
    filter?: string;
    isRegex?: boolean;
}

export interface EventListenerAuditRequest {
    event?: string;
    limit?: number;
}

export interface EvaluateCodeRequest {
    code: string;
    async?: boolean;
    expression?: boolean;
    timeoutMs?: number;
    maxOutputChars?: number;
}

export interface CallRestApiRequest {
    method: "get" | "post" | "put" | "patch" | "del";
    url: string;
    body?: unknown;
    query?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
}

export interface GetStoreStateRequest {
    storeName: string;
}

export interface GetStoreSubscriptionsRequest {
    storeName: string;
    limit?: number;
}

export interface GetEndpointsRequest {
    filter?: string;
}

export interface DispatchFluxRequest {
    action: Record<string, unknown>;
}

export interface FindEnumRequest {
    query: string;
    limit?: number;
    includeMembers?: boolean;
}

export interface FindExportValueRequest {
    moduleId: number;
    exportName: string;
}

export interface GetPrototypeMethodsRequest {
    moduleId: number;
    exportName?: string;
}

export interface CanonicalizeIntlRequest {
    text: string;
}

export interface ReverseIntlHashRequest {
    hashedKey: string;
}

export interface SearchIntlInModuleRequest {
    moduleId: number;
}

export interface PluginSettingsRequest {
    pluginId: string;
    action: "get" | "set" | "dry-run";
    values?: Record<string, unknown>;
}

export interface StoreFindRequest {
    name: string;
}

export interface StoreMethodsRequest {
    storeName: string;
}

export interface StoreDiffRequest {
    storeName: string;
    limit?: number;
}

export interface TraceRequest {
    action: "events" | "handlers" | "storeEvents" | "start" | "get" | "stop" | "store" | "status" | "clear";
    event?: string;
    filter?: string;
    isRegex?: boolean;
    storeName?: string;
    limit?: number;
    offset?: number;
    maxEntries?: number;
    redact?: boolean;
    fields?: string[];
    sampleRate?: number;
    matchPayload?: string;
    maxPayloadChars?: number;
    maxPayloadDepth?: number;
}

export interface InterceptRequest {
    action: "set" | "get" | "stop" | "status";
    moduleId?: number;
    exportName?: string;
    path?: string;
    id?: string;
    limit?: number;
    offset?: number;
    maxEntries?: number;
    sampleRate?: number;
    matchArgs?: string;
    matchResult?: string;
    isRegex?: boolean;
}

export interface GetCurrentContextResult {
    wsPorts: number[];
    connections: number;
    user: { id: string; username: string; discriminator?: string; globalName?: string | null; } | null;
    channel: { id: string; name: string; type: number; } | null;
    guild: { id: string; name: string; ownerId: string; } | null;
    buildNumber: number | null;
    locale: string | null;
    moduleCount: number;
    guildCount: number;
}

export type MessageHandler = (data: unknown) => unknown | Promise<unknown>;

export type MCPRequest = {
    jsonrpc: "2.0";
    id?: number | string;
    method: string;
    params?: Record<string, unknown>;
};

export type MCPResponse = {
    jsonrpc: "2.0";
    id: number | string | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown; };
};

export type ToolCallResult = {
    content: Array<{ type: "text"; text: string; }>;
    isError?: boolean;
};

export type FindNode = { type: "string"; value: string; } | { type: "regex"; value: { pattern: string; flags: string; }; };

export type BatchToolRequest = {
    id?: string;
    tool?: string;
    arguments?: Record<string, unknown>;
    timeoutMs?: number;
};

export type PatchIndexEntry = { moduleId: number; patchedBy: string[]; };

/**
 * @fileoverview Defines `window.performance.measureUserAgentSpecificMemory`.
 *
 * These types are inferred from looking at:
 * https://web.dev/articles/monitor-total-page-memory-usage#example
 *
 * Actual runtime shape may be different.
 */

// Extend existing global `window.performance` object.
declare global {
    interface Performance {
        measureUserAgentSpecificMemory?(): Promise<MemoryMeasurement>;
    }
}

interface MemoryMeasurement {
    readonly bytes: number;
    readonly breakdown: readonly MemoryBreakdown[];
}

interface MemoryBreakdown {
    readonly bytes: number;
    readonly types: string[];
    readonly attribute: readonly MemoryAttribution[];
}

interface MemoryAttribution {
    readonly url: string;
    readonly scope: string;
    readonly container?: MemoryAttributionContainer;
}

interface MemoryAttributionContainer {
    readonly id: string;
    readonly src: string;
}

export {}; // Treat this file as a module, even though it only exports a global.

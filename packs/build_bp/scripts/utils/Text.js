// @ts-nocheck
export function t(key, ...args) {
    if (args.length === 0) return { translate: key };

    const hasObjects = args.some(a => typeof a === "object" && a !== null);
    if (hasObjects) {
        return {
            translate: key,
            with: { rawtext: args.map(a => typeof a === "object" && a !== null ? a : { text: String(a) }) },
        };
    }
    return { translate: key, with: args.map(String) };
}

export function rawtext(...parts) {
    return {
        rawtext: parts.map(p => (typeof p === "string" ? { text: p } : p)),
    };
}

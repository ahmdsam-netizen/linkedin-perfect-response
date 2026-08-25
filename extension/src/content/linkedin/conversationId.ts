/**
 * content/linkedin/conversationId.ts
 * Extracts the LinkedIn conversation/thread ID with a 3-level fallback strategy:
 *   1. URL path regex:       /messaging/thread/{threadId}/
 *   2. DOM attribute:        [data-thread-id], [data-conversation-id], [data-entity-urn]
 *   3. Stable hash fallback: djb2(pathname + contactProfileId)
 */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extracts or derives a stable LinkedIn conversation ID.
 *
 * @param contactProfileId - Optional LinkedIn profile ID/slug of the contact,
 *   used as part of the hash fallback so the ID stays stable across sessions.
 * @returns A non-empty string that uniquely identifies the conversation.
 */
export function extractLinkedInConversationId(contactProfileId?: string): string {
    // 1. URL path: /messaging/thread/{threadId}/
    const fromUrl = extractFromUrl();
    if (fromUrl) return fromUrl;

    // 2. DOM attribute on conversation containers
    const fromDom = extractFromDom();
    if (fromDom) return fromDom;

    // 3. Stable djb2 hash fallback
    return hashFallback(contactProfileId);
}

// ─── Strategy 1: URL path ─────────────────────────────────────────────────────

function extractFromUrl(): string | null {
    const path = window.location.pathname;
    // Matches /messaging/thread/2-abc123/ or /messaging/thread/2-abc123
    const match = path.match(/\/messaging\/thread\/([^/?#]+)/i);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

// ─── Strategy 2: DOM attribute ────────────────────────────────────────────────

/** Ordered list of conversation container selectors to probe for URN attributes. */
const CONVERSATION_CONTAINER_SELECTORS = [
    ".msg-thread",
    ".msg-convo-wrapper",
    ".msg-s-message-list-container",
    ".msg-overlay-conversation-bubble",
    "[data-view-name*='message']",
];

/** Ordered list of attribute names to look for on matched containers. */
const URN_ATTRIBUTES = [
    "data-thread-id",
    "data-conversation-id",
    "data-entity-urn",
];

function extractFromDom(): string | null {
    for (const selector of CONVERSATION_CONTAINER_SELECTORS) {
        const containers = document.querySelectorAll<HTMLElement>(selector);
        for (const container of Array.from(containers)) {
            for (const attr of URN_ATTRIBUTES) {
                const value = container.getAttribute(attr);
                if (value && value.trim()) {
                    // Sanitise URNs like urn:li:messagingThread:2-abc123 → 2-abc123
                    return sanitiseUrn(value.trim());
                }
            }

            // Also probe descendants (some LinkedIn layouts nest the attributes)
            const descendant = container.querySelector<HTMLElement>(
                URN_ATTRIBUTES.map((a) => `[${a}]`).join(", ")
            );
            if (descendant) {
                for (const attr of URN_ATTRIBUTES) {
                    const value = descendant.getAttribute(attr);
                    if (value && value.trim()) {
                        return sanitiseUrn(value.trim());
                    }
                }
            }
        }
    }
    return null;
}

/**
 * Strip common LinkedIn URN prefixes so we return only the meaningful ID part.
 * e.g. "urn:li:messagingThread:2-abc123" → "2-abc123"
 */
function sanitiseUrn(raw: string): string {
    const colonIdx = raw.lastIndexOf(":");
    if (colonIdx !== -1 && colonIdx < raw.length - 1) {
        const suffix = raw.slice(colonIdx + 1);
        // Only strip prefix when suffix looks like a real ID (not empty / all colons)
        if (suffix && /[a-zA-Z0-9]/.test(suffix)) {
            return suffix;
        }
    }
    return raw;
}

// ─── Strategy 3: djb2 hash fallback ──────────────────────────────────────────

function hashFallback(contactProfileId?: string): string {
    const input = window.location.pathname + (contactProfileId ? `::${contactProfileId}` : "");
    return `hash-${djb2(input)}`;
}

/**
 * Classic djb2 hash — fast, simple, good distribution for short strings.
 * Returns an unsigned 32-bit integer as a decimal string.
 */
function djb2(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        // hash = hash * 33 ^ charCode  (keep within 32-bit range with >>> 0)
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        hash = hash >>> 0;
    }
    return hash.toString();
}

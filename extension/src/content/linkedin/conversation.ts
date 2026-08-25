/**
 * content/linkedin/conversation.ts
 * Extract the current conversation thread from LinkedIn's DOM.
 * Returns Message[] sorted chronologically.
 */

import type { Message } from "../../shared/types.ts";
import { SELECTORS } from "./selectors.ts";

/**
 * Extract all messages from the active LinkedIn conversation.
 */
export function extractConversation(scope?: Element | null, myName?: string, recipientName?: string): Message[] {
    const root = findConversationRoot(scope);
    const messageList = root.querySelector(SELECTORS.messageList) || root;
    if (!messageList) return [];

    const messages: Message[] = [];
    const seenMessageKeys = new Set<string>();

    // Target individual message body elements directly
    const bodyElements = Array.from(
        messageList.querySelectorAll<HTMLElement>(
            "p.msg-s-event-listitem__body, .msg-s-event-listitem__body"
        )
    );

    bodyElements.forEach((bodyEl) => {
        const text = extractCleanText(bodyEl);
        if (!text) return;

        const groupEl = bodyEl.closest(".msg-s-event-listitem, .msg-s-message-list__event, .msg-s-message-group") || bodyEl;
        const sender = determineSender(bodyEl, groupEl, myName, recipientName);
        const timestamp = extractTimestamp(groupEl);

        const key = `${sender}::${text}::${timestamp || ""}`;
        if (!seenMessageKeys.has(key)) {
            seenMessageKeys.add(key);
            messages.push({ sender, text, timestamp });
        }
    });

    return messages;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findConversationRoot(scope?: Element | null): Element | Document {
    if (scope) {
        const container = scope.closest(".msg-convo-wrapper, .msg-s-message-list-container, .msg-overlay-conversation-bubble, .msg-thread, div[data-view-name*='message']");
        if (container) return container;
    }
    return document.querySelector(".msg-thread, .msg-convo-wrapper, .msg-s-message-list-container, .msg-overlay-conversation-bubble") || document;
}

/**
 * Determine if a message belongs to the current user ("me") or the recipient ("them").
 */
function determineSender(
    bodyEl: HTMLElement,
    groupEl: Element,
    myName?: string,
    recipientName?: string
): "me" | "them" {
    // 1. Look for the sender name in the message group or event item
    const messageGroup = bodyEl.closest(".msg-s-message-group, .msg-s-event-listitem, .msg-s-message-list__event") || groupEl;
    const senderNameEl =
        messageGroup.querySelector(".msg-s-message-group__name, .msg-s-event-listitem__name, .msg-s-message-group__profile-link, [class*='message-group__name']") ||
        messageGroup.closest(".msg-s-message-group")?.querySelector(".msg-s-message-group__name, [class*='message-group__name']");

    const senderText = senderNameEl?.textContent?.trim() || "";
    if (senderText) {
        const lower = senderText.toLowerCase();

        if (lower === "you" || lower.includes("(you)")) {
            return "me";
        }

        // Compare with provided user name (skip check if no name given — rely on CSS classes below)
        const myTokens = (myName || "").toLowerCase().split(/\s+/).filter((t) => t.length > 2);
        if (myTokens.length > 0 && myTokens.some((t) => lower.includes(t))) {
            return "me";
        }

        // Compare with recipient name (skip check if no name given — rely on CSS classes below)
        const recipTokens = (recipientName || "").toLowerCase().split(/\s+/).filter((t) => t.length > 2);
        if (recipTokens.length > 0 && recipTokens.some((t) => lower.includes(t))) {
            return "them";
        }
    }

    // 2. Check self modifier classes on the body, group, or parent list items
    const isSelfContainer =
        bodyEl.closest(".msg-s-message-list__event--self, .msg-s-event-listitem--self, .msg-s-message-group--self, [class*='--self']") !== null ||
        groupEl.classList.contains("msg-s-message-list__event--self") ||
        groupEl.classList.contains("msg-s-event-listitem--self") ||
        groupEl.classList.contains("msg-s-message-group--self");

    if (isSelfContainer) return "me";

    // 3. Check for explicit "other" modifier classes
    const isOtherContainer =
        bodyEl.closest(".msg-s-message-list__event--other, .msg-s-event-listitem--other, .msg-s-message-group--other, [class*='--other']") !== null ||
        groupEl.classList.contains("msg-s-message-list__event--other") ||
        groupEl.classList.contains("msg-s-event-listitem--other");

    if (isOtherContainer) return "them";

    // 4. Check avatar link
    const avatarLink = groupEl.querySelector<HTMLAnchorElement>("a.msg-s-event-listitem__link, a.msg-s-message-group__profile-link");
    if (avatarLink?.href) {
        if (avatarLink.href.includes("/in/me") || (myName && avatarLink.href.includes(myName.toLowerCase().split(" ")[0]))) {
            return "me";
        }
    }

    return "them";
}

/**
 * Extract clean plain text from a message body, stripping reaction bars, hover menus, and icons.
 */
function extractCleanText(bubble: Element): string {
    const clone = bubble.cloneNode(true) as Element;

    // Remove any reaction emojis, action toolbars, timestamps, buttons, svgs
    clone.querySelectorAll(
        ".msg-reactions-v2, .msg-s-event-listitem__reaction-bar, .msg-s-reactions, .reactions-menu, .artdeco-hoverable-content, .msg-s-event-listitem__hover-actions, .msg-s-message-group__timestamp, time, .msg-s-event-listitem__options, button, svg"
    ).forEach((el) => el.remove());

    let raw = clone.textContent || "";

    // Strip common reaction emoji sequences (e.g. "👏 👍 😊 ❤️ 💡 🎉")
    raw = raw.replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]+/gu, "");

    return raw
        .replace(/[\n\r\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

/**
 * Try to extract a timestamp string from the group element.
 */
function extractTimestamp(groupEl: Element): string | undefined {
    const timeEl = groupEl.querySelector("time, .msg-s-message-group__timestamp, .msg-s-event-listitem__time-stamp");
    return timeEl?.textContent?.trim() ?? undefined;
}

/**
 * Best-effort extraction of data-event-urn / data-id attributes from message DOM elements.
 * Returns a Map keyed by the first 50 characters of each message's text, valued by its URN.
 * Used as deduplication hints when syncing messages with the V2 backend.
 * May return an empty Map if no annotated elements are found.
 */
export function extractLinkedInMessageIds(): Map<string, string> {
    const map = new Map<string, string>();
    document.querySelectorAll<HTMLElement>("[data-event-urn], [data-id]").forEach((el) => {
        const urn = el.getAttribute("data-event-urn") || el.getAttribute("data-id") || "";
        const text = el.textContent?.trim() || "";
        if (urn && text) map.set(text.substring(0, 50), urn);
    });
    return map;
}

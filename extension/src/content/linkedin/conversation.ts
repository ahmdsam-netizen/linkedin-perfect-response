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
export function extractConversation(scope?: Element | null): Message[] {
    const root = findConversationRoot(scope);
    const messageList = root.querySelector(SELECTORS.messageList) || root;
    if (!messageList) return [];

    const messages: Message[] = [];

    // LinkedIn groups messages by sender. Each group contains one or more bubbles.
    // Structure: .msg-s-event-listitem (group) > .msg-s-message-group__name + .msg-s-message-group__message[]
    const groups = messageList.querySelectorAll(SELECTORS.messageItem);

    groups.forEach((group) => {
        const senderNameEl = group.querySelector(".msg-s-message-group__name");
        const senderName = senderNameEl?.textContent?.trim() ?? "";

        // Determine if this group is "me" or "them"
        const sender = determineSender(group, senderName);

        // Each message bubble within the group
        const bubbles = group.querySelectorAll(".msg-s-event-listitem__body");
        bubbles.forEach((bubble) => {
            const text = extractBubbleText(bubble);
            if (text) {
                const timestamp = extractTimestamp(group);
                messages.push({ sender, text, timestamp });
            }
        });
    });

    return messages;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findConversationRoot(scope?: Element | null): Element | Document {
    if (scope) {
        const container = scope.closest(".msg-convo-wrapper, .msg-s-message-list-container, .msg-overlay-conversation-bubble, .msg-thread");
        if (container) return container;
    }
    return document;
}

/**
 * Determine if a message group belongs to the current user or the recipient.
 * LinkedIn marks self messages with a specific CSS class.
 */
function determineSender(
    groupEl: Element,
    _senderName: string
): "me" | "them" {
    // LinkedIn adds a modifier class to the user's own messages
    if (
        groupEl.classList.contains("msg-s-message-list__event--self") ||
        groupEl.querySelector(".msg-s-event-listitem--self")
    ) {
        return "me";
    }
    return "them";
}

/**
 * Extract plain text from a message bubble, stripping HTML.
 */
function extractBubbleText(bubble: Element): string {
    // Clone to manipulate without affecting the page
    const clone = bubble.cloneNode(true) as Element;

    // Remove any reaction emoji spans
    clone.querySelectorAll(".msg-s-event-listitem__reaction-bar").forEach((el) => el.remove());

    return clone.textContent?.trim() ?? "";
}

/**
 * Try to extract a timestamp string from the group element.
 */
function extractTimestamp(groupEl: Element): string | undefined {
    const timeEl = groupEl.querySelector("time, .msg-s-message-group__timestamp");
    return timeEl?.textContent?.trim() ?? undefined;
}

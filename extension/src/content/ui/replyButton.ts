/**
 * content/ui/replyButton.ts
 * Inject the 'Generate Reply' button into the LinkedIn composer area.
 * Handles click -> message -> reply insertion workflow.
 */

import { extractRecipient } from "../linkedin/profile.ts";
import { extractConversation } from "../linkedin/conversation.ts";
import { insertReplyIntoComposer, isComposerAvailable } from "../linkedin/composer.ts";
import type { BackgroundToContentMessage, ContentToBackgroundMessage } from "../../shared/messages.ts";
import type { ConversationContext } from "../../shared/types.ts";

const BUTTON_ID = "linkedin-ai-reply-btn";
const BUTTON_CONTAINER_ID = "linkedin-ai-reply-container";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inject the Generate Reply button into the LinkedIn composer footer.
 * Safe to call multiple times — will not inject duplicates.
 */
export function injectReplyButton(): void {
    if (document.getElementById(BUTTON_CONTAINER_ID)) return;
    if (!isComposerAvailable()) return;

    const footer = findComposerFooter();
    if (!footer) return;

    const container = createButtonContainer();
    footer.appendChild(container);
}

/**
 * Remove the injected button (e.g. when navigating away).
 */
export function removeReplyButton(): void {
    document.getElementById(BUTTON_CONTAINER_ID)?.remove();
}

// ─── DOM Creation ─────────────────────────────────────────────────────────────

function createButtonContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.id = BUTTON_CONTAINER_ID;
    container.style.cssText = [
        "display: flex",
        "align-items: center",
        "padding: 6px 8px",
        "gap: 6px",
    ].join("; ");

    const button = createButton();
    container.appendChild(button);

    return container;
}

function createButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "✨ Generate Reply";
    btn.title = "Generate an AI reply based on the conversation";

    applyButtonStyles(btn, "idle");

    btn.addEventListener("click", handleButtonClick);

    return btn;
}

function applyButtonStyles(
    btn: HTMLButtonElement,
    state: "idle" | "loading" | "error"
): void {
    const baseStyles = [
        "display: inline-flex",
        "align-items: center",
        "gap: 6px",
        "padding: 6px 14px",
        "border-radius: 16px",
        "font-size: 13px",
        "font-weight: 600",
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        "cursor: pointer",
        "border: 1.5px solid",
        "transition: all 0.2s ease",
        "white-space: nowrap",
    ];

    const stateStyles: Record<string, string[]> = {
        idle: [
            "background: #0073b1",
            "color: #ffffff",
            "border-color: #0073b1",
        ],
        loading: [
            "background: #e8f4fd",
            "color: #0073b1",
            "border-color: #0073b1",
            "cursor: not-allowed",
        ],
        error: [
            "background: #fff0f0",
            "color: #c0392b",
            "border-color: #c0392b",
        ],
    };

    btn.style.cssText = [...baseStyles, ...(stateStyles[state] ?? stateStyles.idle)].join("; ");
}

// ─── Event Handling ───────────────────────────────────────────────────────────

async function handleButtonClick(): Promise<void> {
    const btn = document.getElementById(BUTTON_ID) as HTMLButtonElement | null;
    if (!btn) return;

    // Set loading state
    btn.disabled = true;
    btn.textContent = "⏳ Generating...";
    applyButtonStyles(btn, "loading");

    try {
        const context = buildConversationContext();

        const message: ContentToBackgroundMessage = {
            type: "GENERATE_REPLY",
            payload: context,
        };

        const response = await chrome.runtime.sendMessage<
            ContentToBackgroundMessage,
            BackgroundToContentMessage
        >(message);

        if (response.type === "REPLY_GENERATED") {
            insertReplyIntoComposer(response.payload.text);
            btn.textContent = "✅ Reply inserted";
            applyButtonStyles(btn, "idle");

            // Reset after 2 seconds
            setTimeout(() => {
                btn.textContent = "✨ Generate Reply";
                btn.disabled = false;
            }, 2000);
        } else if (response.type === "REPLY_ERROR") {
            btn.textContent = "❌ Error — try again";
            applyButtonStyles(btn, "error");
            btn.disabled = false;
            console.error("[LinkedIn AI] Reply error:", response.error);
        }
    } catch (err) {
        btn.textContent = "❌ Error — try again";
        applyButtonStyles(btn, "error");
        btn.disabled = false;
        console.error("[LinkedIn AI] Unexpected error:", err);
    }
}

// ─── Context Building ─────────────────────────────────────────────────────────

function buildConversationContext(): ConversationContext {
    const recipient = extractRecipient();
    const messages = extractConversation();

    return { recipient, messages };
}

// ─── Footer Detection ─────────────────────────────────────────────────────────

function findComposerFooter(): Element | null {
    return (
        document.querySelector(".msg-form__footer") ??
        document.querySelector(".msg-form__left-actions") ??
        document.querySelector(".msg-form__send-button")?.parentElement ??
        null
    );
}

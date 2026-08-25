/**
 * content/ui/replyButton.ts
 * Injects the '✨ Generate Reply' button into every active LinkedIn message composer
 * (supporting both full-page messaging and floating chat bubbles).
 */

import { extractRecipient } from "../linkedin/profile.ts";
import { extractConversation } from "../linkedin/conversation.ts";
import { SELECTORS } from "../linkedin/selectors.ts";
import type { ConversationContext } from "../../shared/types.ts";
import type { ContentToBackgroundMessage } from "../../shared/messages.ts";

const BUTTON_CLASS = "linkedin-ai-reply-btn";
const CONTAINER_CLASS = "linkedin-ai-reply-container";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Injects Generate Reply buttons into all message composers on the page.
 * Safe to call repeatedly — will never inject duplicates.
 */
export function injectReplyButton(): void {
    // Locate all message forms / composers on page (full page + overlay bubbles)
    const forms = findMessageForms();

    forms.forEach((form) => {
        // Skip if already injected
        if (form.querySelector(`.${CONTAINER_CLASS}`)) return;

        const targetContainer = findInjectionTarget(form);
        if (!targetContainer) return;

        const buttonContainer = createButtonContainer(form);
        
        // If target is left-actions, prepend or append cleanly
        targetContainer.appendChild(buttonContainer);
    });
}

/**
 * Remove all injected buttons.
 */
export function removeReplyButton(): void {
    document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach((el) => el.remove());
}

// ─── Target Finders ───────────────────────────────────────────────────────────

function findMessageForms(): HTMLElement[] {
    const matched = new Set<HTMLElement>();

    // 1. Match explicit form elements
    document.querySelectorAll<HTMLElement>(SELECTORS.messageForm).forEach((el) => matched.add(el));

    // 2. Match through contenteditable elements if forms weren't matched
    document.querySelectorAll<HTMLElement>(SELECTORS.composer).forEach((composer) => {
        const parentForm = composer.closest<HTMLElement>("form, .msg-form, .msg-convo-wrapper, .msg-overlay-conversation-bubble");
        if (parentForm) {
            matched.add(parentForm);
        } else if (composer.parentElement) {
            matched.add(composer.parentElement);
        }
    });

    return Array.from(matched);
}

function findInjectionTarget(form: HTMLElement): Element | null {
    // Preferred targets in priority order:
    return (
        form.querySelector(".msg-form__left-actions") ??
        form.querySelector("footer.msg-form__footer") ??
        form.querySelector(".msg-form__footer") ??
        form.querySelector(".msg-form__actions") ??
        form.querySelector(".msg-form__right-actions") ??
        form.querySelector(".msg-form__send-button")?.parentElement ??
        form
    );
}

// ─── DOM Element Creation ─────────────────────────────────────────────────────

function createButtonContainer(form: HTMLElement): HTMLDivElement {
    const container = document.createElement("div");
    container.className = CONTAINER_CLASS;
    container.style.cssText = [
        "display: inline-flex",
        "align-items: center",
        "margin: 2px 6px",
        "vertical-align: middle",
        "z-index: 10",
    ].join("; ");

    const button = createButton(form);
    container.appendChild(button);

    return container;
}

function createButton(form: HTMLElement): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = BUTTON_CLASS;
    btn.type = "button";
    btn.textContent = "✨ Generate Reply";
    btn.title = "Generate an AI reply (or open extension popup for custom styles & prompts)";

    applyButtonStyles(btn, "idle");

    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleButtonClick(btn, form);
    });

    return btn;
}

function applyButtonStyles(
    btn: HTMLButtonElement,
    state: "idle" | "loading" | "error" | "success"
): void {
    const baseStyles = [
        "display: inline-flex",
        "align-items: center",
        "gap: 5px",
        "padding: 4px 12px",
        "border-radius: 16px",
        "font-size: 12px",
        "font-weight: 600",
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        "cursor: pointer",
        "border: 1.5px solid transparent",
        "transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "white-space: nowrap",
        "box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08)",
        "line-height: 18px",
    ];

    const stateStyles: Record<string, string[]> = {
        idle: [
            "background: #0a66c2",
            "color: #ffffff",
            "border-color: #0a66c2",
        ],
        loading: [
            "background: #e8f4fd",
            "color: #0a66c2",
            "border-color: #0a66c2",
            "cursor: wait",
        ],
        success: [
            "background: #057642",
            "color: #ffffff",
            "border-color: #057642",
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

async function handleButtonClick(btn: HTMLButtonElement, form: HTMLElement): Promise<void> {
    btn.disabled = true;
    btn.textContent = "⏳ Opening...";
    applyButtonStyles(btn, "loading");

    try {
        const context = await buildConversationContext(form);

        // Save the active conversation context for the popup
        await chrome.storage.local.set({ activeConversationContext: context });

        // Request background service worker to open the extension popup
        await chrome.runtime.sendMessage<ContentToBackgroundMessage>({
            type: "OPEN_POPUP",
        });

        btn.textContent = "✨ Generate Reply";
        btn.title = "Configure and generate your AI reply in the extension popup";
        applyButtonStyles(btn, "idle");
        btn.disabled = false;
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn("[LinkedIn AI] Open popup notice:", errorMsg);
        btn.textContent = "✨ Generate Reply";
        btn.title = "Click extension icon in your browser toolbar to generate reply!";
        applyButtonStyles(btn, "idle");
        btn.disabled = false;
    }
}

export async function buildConversationContext(form?: HTMLElement | null): Promise<ConversationContext> {
    const recipient = await extractRecipient(form);
    const stored = await chrome.storage.local.get("userProfile");
    const myName: string = stored.userProfile?.name || "";
    const messages = extractConversation(form, myName, recipient.name);

    return { recipient, messages };
}

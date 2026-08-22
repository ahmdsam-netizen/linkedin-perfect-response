/**
 * content/linkedin/composer.ts
 * Insert a generated reply into LinkedIn's message composer.
 * Does NOT automatically send — the user reviews and clicks Send.
 */

import { SELECTORS } from "./selectors.ts";

/**
 * Insert text into the LinkedIn composer box.
 * Focuses the composer and triggers React's synthetic events so LinkedIn
 * enables the Send button and recognizes the text.
 */
export function insertReplyIntoComposer(text: string, scope?: Element | null): boolean {
    const composer = findComposerElement(scope);
    if (!composer) {
        console.warn("[LinkedIn AI] Composer element not found");
        return false;
    }

    try {
        // 1. Scroll into view & focus composer
        composer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        composer.focus();

        // 2. Locate or create inner paragraph tag (LinkedIn's Lexical/DraftJS structure)
        let pTag = composer.querySelector("p");
        if (!pTag) {
            pTag = document.createElement("p");
            composer.appendChild(pTag);
        }

        // 3. Format text with <br> for newlines
        const formattedHtml = escapeHtml(text).replace(/\r?\n/g, "<br>");
        pTag.innerHTML = formattedHtml;

        // 4. Place selection/cursor inside the pTag at the end
        setSelectionAtEnd(pTag);

        // 5. Try document.execCommand as primary trigger if possible
        try {
            document.execCommand("selectAll", false);
            document.execCommand("insertHTML", false, formattedHtml);
        } catch {
            // execCommand fails if window lost focus — innerHTML fallback (step 3) handles it
        }

        // Ensure innerHTML is maintained after execCommand
        if (!composer.innerText?.includes(text.slice(0, 15))) {
            pTag.innerHTML = formattedHtml;
        }

        // 6. Dispatch full suite of React synthetic input events
        dispatchReactEvents(composer, text);

        // 7. Enable LinkedIn's Send button in the DOM
        enableSendButton(composer);

        // 8. Final cursor placement at the end
        setSelectionAtEnd(pTag);

        console.log("[LinkedIn AI] ✅ Reply inserted into composer successfully!");
        return true;
    } catch (err) {
        console.error("[LinkedIn AI] Insert reply error:", err);
        return false;
    }
}

/**
 * Check if a composer is currently available in the document or scope.
 */
export function isComposerAvailable(scope?: Element | null): boolean {
    return findComposerElement(scope) !== null;
}

/**
 * Robust helper to locate the active composer inside a given scope or globally.
 */
export function findComposerElement(scope?: Element | null): HTMLElement | null {
    if (scope) {
        const localComposer = scope.querySelector<HTMLElement>(SELECTORS.composer);
        if (localComposer && isVisible(localComposer)) return localComposer;

        const form = scope.closest("form, .msg-form, .msg-convo-wrapper, .msg-overlay-conversation-bubble");
        const formComposer = form?.querySelector<HTMLElement>(SELECTORS.composer);
        if (formComposer && isVisible(formComposer)) return formComposer;
    }

    // 1. Check currently active element if it's contenteditable
    const active = document.activeElement as HTMLElement | null;
    if (active && active.isContentEditable && isVisible(active)) {
        return active;
    }

    // 2. Active open overlay conversation bubble (bottom right popups)
    const activeBubbleComposer = document.querySelector<HTMLElement>(
        ".msg-overlay-conversation-bubble:not(.msg-overlay-conversation-bubble--is-minimized) div[contenteditable='true'], .msg-overlay-conversation-bubble--is-active div[contenteditable='true']"
    );
    if (activeBubbleComposer && isVisible(activeBubbleComposer)) {
        return activeBubbleComposer;
    }

    // 3. Full page messaging composer
    const threadComposer = document.querySelector<HTMLElement>(
        ".msg-thread div[contenteditable='true'], form.msg-form div[contenteditable='true'], .msg-form__contenteditable"
    );
    if (threadComposer && isVisible(threadComposer)) {
        return threadComposer;
    }

    // 4. Any visible contenteditable on page
    const allContentEditables = Array.from(
        document.querySelectorAll<HTMLElement>("div[contenteditable='true'], div[role='textbox']")
    );
    return allContentEditables.find(isVisible) || null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVisible(el: HTMLElement): boolean {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setSelectionAtEnd(el: HTMLElement): void {
    try {
        const range = document.createRange();
        const selection = window.getSelection();
        if (!selection) return;

        range.selectNodeContents(el);
        range.collapse(false); // collapse to end
        selection.removeAllRanges();
        selection.addRange(range);
    } catch {
        // Ignore selection errors if detached
    }
}

function dispatchReactEvents(composer: HTMLElement, text: string): void {
    // 1. Dispatch beforeinput
    try {
        composer.dispatchEvent(
            new InputEvent("beforeinput", {
                bubbles: true,
                cancelable: true,
                inputType: "insertText",
                data: text,
            })
        );
    } catch {}

    // 2. Dispatch input
    try {
        composer.dispatchEvent(
            new InputEvent("input", {
                bubbles: true,
                cancelable: true,
                inputType: "insertText",
                data: text,
            })
        );
    } catch {}

    // 3. Dispatch change & keyboard events to trigger LinkedIn state manager
    composer.dispatchEvent(new Event("change", { bubbles: true }));
    composer.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
    composer.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
}

function enableSendButton(composer: HTMLElement): void {
    const form = composer.closest("form, .msg-form, .msg-convo-wrapper, .msg-overlay-conversation-bubble, body");
    if (!form) return;

    const sendBtn = form.querySelector<HTMLButtonElement>(
        ".msg-form__send-button, button[type='submit'].msg-form__send-button, button[type='submit']"
    );

    if (sendBtn) {
        sendBtn.removeAttribute("disabled");
        sendBtn.disabled = false;
        sendBtn.classList.remove("artdeco-button--disabled", "msg-form__send-button--disabled");
    }
}

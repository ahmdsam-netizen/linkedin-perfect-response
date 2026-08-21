/**
 * content/linkedin/composer.ts
 * Insert a generated reply into LinkedIn's message composer.
 * Does NOT automatically send — the user reviews and clicks Send.
 */

import { SELECTORS } from "./selectors.ts";

/**
 * Insert text into the LinkedIn composer box.
 * Focuses the composer and triggers React's synthetic events so LinkedIn
 * enables the Send button.
 */
export function insertReplyIntoComposer(text: string, scope?: Element | null): boolean {
    const composer = findComposerElement(scope);
    if (!composer) {
        console.warn("[LinkedIn AI] Composer element not found");
        return false;
    }

    // Focus first
    composer.focus();

    // Clear existing content
    composer.textContent = "";

    // Use execCommand to insert text so LinkedIn's listeners fire
    // (setting textContent directly doesn't trigger React/LinkedIn events)
    try {
        document.execCommand("insertText", false, text);
    } catch {
        // Fallback for newer browser restrictions
    }

    // Fallback: if execCommand didn't work, set directly and dispatch events
    if (!composer.textContent?.includes(text)) {
        composer.textContent = text;
        composer.dispatchEvent(new Event("input", { bubbles: true }));
        composer.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Move cursor to end
    moveCursorToEnd(composer);

    return true;
}

/**
 * Check if a composer is currently available in the document or scope.
 */
export function isComposerAvailable(scope?: Element | null): boolean {
    return findComposerElement(scope) !== null;
}

/**
 * Helper to locate composer inside a given scope or globally.
 */
export function findComposerElement(scope?: Element | null): HTMLElement | null {
    if (scope) {
        const localComposer = scope.querySelector<HTMLElement>(SELECTORS.composer);
        if (localComposer) return localComposer;

        // Search closest form or conversation container
        const form = scope.closest("form, .msg-form, .msg-convo-wrapper, .msg-overlay-conversation-bubble");
        const formComposer = form?.querySelector<HTMLElement>(SELECTORS.composer);
        if (formComposer) return formComposer;
    }

    return document.querySelector<HTMLElement>(SELECTORS.composer);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function moveCursorToEnd(el: HTMLElement): void {
    const range = document.createRange();
    const selection = window.getSelection();
    if (!selection) return;

    range.selectNodeContents(el);
    range.collapse(false); // collapse to end
    selection.removeAllRanges();
    selection.addRange(range);
}

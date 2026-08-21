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
export function insertReplyIntoComposer(text: string): boolean {
    const composer = document.querySelector<HTMLElement>(SELECTORS.composer);
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
    document.execCommand("insertText", false, text);

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
 * Check if the composer is currently available on the page.
 */
export function isComposerAvailable(): boolean {
    return document.querySelector(SELECTORS.composer) !== null;
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

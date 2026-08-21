/**
 * content/content.ts
 * Entry point for the LinkedIn AI Reply extension.
 * Coordinates LinkedIn page interaction via sub-modules.
 * Uses MutationObserver to handle LinkedIn's SPA navigation.
 */

import { injectReplyButton, removeReplyButton } from "./ui/replyButton.ts";

// ─── Init ─────────────────────────────────────────────────────────────────────

console.log("[LinkedIn AI] Extension loaded on:", window.location.href);

init();

function init(): void {
    // Try to inject immediately (in case page is already loaded)
    tryInject();

    // Watch for DOM changes (LinkedIn is a SPA — URL changes without page reload)
    setupMutationObserver();
}

// ─── Injection ────────────────────────────────────────────────────────────────

function tryInject(): void {
    // Only inject on messaging pages
    if (!isMessagingPage()) return;

    // Retry until the composer is available (LinkedIn loads it asynchronously)
    waitForComposer(() => {
        injectReplyButton();
    });
}

function isMessagingPage(): boolean {
    return (
        window.location.pathname.startsWith("/messaging") ||
        window.location.pathname.startsWith("/in/") ||
        document.querySelector(".msg-overlay-list-bubble") !== null ||
        document.querySelector(".msg-thread") !== null
    );
}

function waitForComposer(callback: () => void, maxAttempts = 20): void {
    let attempts = 0;

    const poll = setInterval(() => {
        attempts++;

        const composer = document.querySelector(".msg-form__contenteditable, div[contenteditable][aria-label]");

        if (composer) {
            clearInterval(poll);
            callback();
        } else if (attempts >= maxAttempts) {
            clearInterval(poll);
            console.warn("[LinkedIn AI] Composer not found after polling");
        }
    }, 500);
}

// ─── SPA Navigation Observer ──────────────────────────────────────────────────

let currentUrl = window.location.href;

function setupMutationObserver(): void {
    const observer = new MutationObserver(() => {
        const newUrl = window.location.href;

        if (newUrl !== currentUrl) {
            currentUrl = newUrl;
            onNavigate();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function onNavigate(): void {
    console.log("[LinkedIn AI] Navigation detected:", currentUrl);

    // Remove old button (it may have been removed from DOM by SPA re-render)
    removeReplyButton();

    // Re-attempt injection on new page
    tryInject();
}

/**
 * content/content.ts
 * Entry point for the LinkedIn AI Reply extension.
 *
 * Responsibilities:
 *  1. Inject "✨ Generate Reply" button into every message composer found
 *  2. Sync the USER's own profile data into chrome.storage
 *  3. Handle on-demand sync & conversation extraction requests from the popup
 *  4. Handle reply insertion requests from the popup
 *  5. Re-run all of the above on SPA navigation
 */

import { injectReplyButton, buildConversationContext } from "./ui/replyButton.ts";
import { syncUserProfileFromDOM } from "./linkedin/userProfile.ts";
import { insertReplyIntoComposer } from "./linkedin/composer.ts";
import type { ExtensionMessage } from "../shared/messages.ts";

// ─── Initialization ───────────────────────────────────────────────────────────

console.log("[LinkedIn AI] Extension loaded on:", window.location.href);

// Small delay so LinkedIn's React has time to render before we read the DOM
setTimeout(init, 800);

function init(): void {
    // 1. Sync OWN profile data from DOM (name, role, skills for popup prefill)
    syncUserProfileFromDOM();

    // 2. Inject reply button into any visible message composer
    injectReplyButton();

    // 3. Listen for popup messages (on-demand sync, active convo extract, insertion)
    setupMessageListener();

    // 4. Watch for DOM mutations (new chat bubbles, SPA navigation)
    setupMutationObserver();

    // 5. Heartbeat — catches chat windows that open after page load
    setInterval(injectReplyButton, 1500);
}

// ─── Popup Messaging ──────────────────────────────────────────────────────────

function setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
        (
            message: ExtensionMessage,
            _sender,
            sendResponse: (response: unknown) => void
        ) => {
            if (message.type === "EXTRACT_PAGE_PROFILE") {
                syncUserProfileFromDOM().then((profile) => {
                    sendResponse({ type: "PAGE_PROFILE_EXTRACTED", payload: profile });
                });
                return true;
            }

            if (message.type === "EXTRACT_ACTIVE_CONVERSATION") {
                buildConversationContext().then((context) => {
                    sendResponse({ type: "CONVERSATION_EXTRACTED", payload: context });
                });
                return true;
            }

            if (message.type === "INSERT_REPLY_TEXT") {
                const success = insertReplyIntoComposer(message.payload.text);
                sendResponse({ type: "REPLY_INSERTED", success });
                return true;
            }

            return false;
        }
    );
}

// ─── SPA Navigation Observer ──────────────────────────────────────────────────

let currentUrl = window.location.href;

function setupMutationObserver(): void {
    const observer = new MutationObserver(() => {
        // Always try injecting (handles new chat bubbles opening)
        injectReplyButton();

        // Check for URL change (SPA navigation)
        const newUrl = window.location.href;
        if (newUrl !== currentUrl) {
            currentUrl = newUrl;
            onNavigate();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function onNavigate(): void {
    console.log("[LinkedIn AI] Navigation:", currentUrl);

    // Wait for React to render new page content, then sync
    setTimeout(() => {
        syncUserProfileFromDOM();
        injectReplyButton();
    }, 800);
}

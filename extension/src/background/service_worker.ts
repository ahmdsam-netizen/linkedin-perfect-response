/**
 * background/service_worker.ts
 * Communication hub between content script and FastAPI backend.
 *
 * Flow:
 *   content.ts -> GENERATE_REPLY -> service_worker -> FastAPI -> content.ts
 */

import type {
    BackgroundToContentMessage,
    ContentToBackgroundMessage,
} from "../shared/messages.ts";
import type { GenerateReplyRequest, ConversationContext } from "../shared/types.ts";
import { getUserProfile } from "../shared/storage.ts";

// Backend URL — update when deploying
const API_BASE_URL = "http://localhost:8000";

// ─── Message Listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
    (
        message: ContentToBackgroundMessage,
        _sender,
        sendResponse: (response: BackgroundToContentMessage) => void
    ) => {
        if (message.type === "GENERATE_REPLY") {
            // Must return true to keep the message channel open for async response
            handleGenerateReply(message.payload).then(sendResponse);
            return true;
        }

        if (message.type === "GET_USER_PROFILE") {
            getUserProfile().then((profile) => {
                sendResponse({ type: "USER_PROFILE_RESULT", payload: profile });
            });
            return true;
        }

        return false;
    }
);

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleGenerateReply(
    context: ConversationContext
): Promise<BackgroundToContentMessage> {
    try {
        const userProfile = await getUserProfile();

        if (!userProfile || !userProfile.name) {
            return {
                type: "REPLY_ERROR",
                error:
                    "No user profile configured. Please open the extension popup and fill in your profile first.",
            };
        }

        const requestBody: GenerateReplyRequest = {
            context,
            userProfile,
        };

        const response = await fetch(`${API_BASE_URL}/api/generate-reply`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                type: "REPLY_ERROR",
                error: `API error ${response.status}: ${errorText}`,
            };
        }

        const data = await response.json() as { reply: string; confidence?: number };

        return {
            type: "REPLY_GENERATED",
            payload: {
                text: data.reply,
                confidence: data.confidence,
            },
        };
    } catch (err) {
        const message =
            err instanceof Error ? err.message : "Unknown error occurred";

        // Distinguish network errors (backend not running) from other errors
        const isNetworkError =
            message.includes("Failed to fetch") ||
            message.includes("NetworkError");

        return {
            type: "REPLY_ERROR",
            error: isNetworkError
                ? "Cannot reach backend. Is the FastAPI server running on localhost:8000?"
                : message,
        };
    }
}

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
            handleGenerateReply(message.payload)
                .then(sendResponse)
                .catch((err) => {
                    sendResponse({
                        type: "REPLY_ERROR",
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            return true;
        }

        if (message.type === "GET_USER_PROFILE") {
            getUserProfile()
                .then((profile) => {
                    sendResponse({ type: "USER_PROFILE_RESULT", payload: profile });
                })
                .catch(() => {
                    sendResponse({ type: "USER_PROFILE_RESULT", payload: null });
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
        let userProfile = await getUserProfile();

        // If no user profile configured, use a sensible default instead of failing
        if (!userProfile || !userProfile.name) {
            userProfile = {
                name: "LinkedIn User",
                role: "Professional",
                skills: [],
                background: "",
                style: "professional",
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

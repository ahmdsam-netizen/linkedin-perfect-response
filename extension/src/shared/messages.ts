/**
 * shared/messages.ts
 * Strongly-typed message contracts for chrome.runtime messaging.
 */

import type {
    CommunicationStyle,
    ConversationContext,
    GeneratedReplyResponse,
    SyncPayload,
    UserProfile,
} from "./types.ts";

// ── Outbound: Content/Popup -> Background ─────────────────────────────────────

export type ContentToBackgroundMessage =
    | {
          type: "SYNC_AND_GENERATE_REPLY";
          payload: {
              syncPayload: SyncPayload;
              instruction?: string;
              tone?: string;
              style?: CommunicationStyle;
          };
      }
    | {
          type: "GET_USER_PROFILE";
      }
    | {
          type: "SYNC_USER_PROFILE";
          payload: Partial<UserProfile>;
      }
    | {
          type: "FETCH_OWN_PROFILE_BACKGROUND";
      }
    | {
          type: "OPEN_POPUP";
      };

// ── Inbound: Background -> Content/Popup ──────────────────────────────────────

export type BackgroundToContentMessage =
    | {
          type: "REPLY_GENERATED";
          payload: GeneratedReplyResponse;
      }
    | {
          type: "REPLY_ERROR";
          error: string;
      }
    | {
          type: "USER_PROFILE_RESULT";
          payload: UserProfile | null;
      };

// ── Tab: Popup <-> Content ───────────────────────────────────────────────────

export type PopupToContentMessage =
    | {
          type: "EXTRACT_PAGE_PROFILE";
      }
    | {
          type: "EXTRACT_ACTIVE_CONVERSATION";
      }
    | {
          type: "INSERT_REPLY_TEXT";
          payload: { text: string };
      };

export type ContentToPopupMessage =
    | {
          type: "PAGE_PROFILE_EXTRACTED";
          payload: Partial<UserProfile> | null;
      }
    | {
          type: "CONVERSATION_EXTRACTED";
          payload: ConversationContext | null;
      }
    | {
          type: "REPLY_INSERTED";
          success: boolean;
      };

// ── Union ─────────────────────────────────────────────────────────────────────

export type ExtensionMessage =
    | ContentToBackgroundMessage
    | BackgroundToContentMessage
    | PopupToContentMessage
    | ContentToPopupMessage;

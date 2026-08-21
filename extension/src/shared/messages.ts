/**
 * shared/messages.ts
 * Typed message contracts for chrome.runtime messaging.
 * All extension communication MUST use these types - no raw strings.
 */

import type { CommunicationStyle, ConversationContext, GeneratedReply, UserProfile } from "./types.ts";

export interface GenerateReplyPayload {
    context: ConversationContext;
    myName?: string;
    recipientName?: string;
    relationship?: string;
    style?: CommunicationStyle;
    userPrompt?: string;
}

// Outbound (content/popup -> background)

export type ContentToBackgroundMessage =
    | {
          type: "GENERATE_REPLY";
          payload: GenerateReplyPayload;
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

// Inbound (background -> content/popup)

export type BackgroundToContentMessage =
    | {
          type: "REPLY_GENERATED";
          payload: GeneratedReply;
      }
    | {
          type: "REPLY_ERROR";
          error: string;
      }
    | {
          type: "USER_PROFILE_RESULT";
          payload: UserProfile | null;
      };

// Popup <-> Content messaging

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

// Union (all directions)

export type ExtensionMessage =
    | ContentToBackgroundMessage
    | BackgroundToContentMessage
    | PopupToContentMessage
    | ContentToPopupMessage;


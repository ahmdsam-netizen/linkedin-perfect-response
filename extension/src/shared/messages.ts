/**
 * shared/messages.ts
 * Typed message contracts for chrome.runtime messaging.
 * All extension communication MUST use these types - no raw strings.
 */

import type { ConversationContext, GeneratedReply, UserProfile } from "./types.ts";

// Outbound (content -> background)

export type ContentToBackgroundMessage =
    | {
          type: "GENERATE_REPLY";
          payload: ConversationContext;
      }
    | {
          type: "GET_USER_PROFILE";
      }
    | {
          type: "SYNC_USER_PROFILE";
          payload: Partial<UserProfile>;
      };

// Inbound (background -> content)

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
      };

export type ContentToPopupMessage =
    | {
          type: "PAGE_PROFILE_EXTRACTED";
          payload: Partial<UserProfile> | null;
      };

// Union (all directions)

export type ExtensionMessage =
    | ContentToBackgroundMessage
    | BackgroundToContentMessage
    | PopupToContentMessage
    | ContentToPopupMessage;


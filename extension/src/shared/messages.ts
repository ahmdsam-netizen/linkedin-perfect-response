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

// Union (either direction)

export type ExtensionMessage =
    | ContentToBackgroundMessage
    | BackgroundToContentMessage;

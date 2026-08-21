/**
 * content/linkedin/selectors.ts
 * Centralized LinkedIn DOM selectors.
 * When LinkedIn updates its DOM, update ONLY this file.
 */

export const SELECTORS = {
    // Messaging conversation panel
    conversationPanel: ".msg-convo-wrapper, .msg-s-message-list-container",

    // Individual message list items
    messageList: ".msg-s-message-list",
    messageItem: ".msg-s-event-listitem, .msg-s-message-list-content",

    // Message bubble (contains the text)
    messageBubble: ".msg-s-event-listitem__message-bubble, .msg-s-message-group__message",

    // Message sender name within a group
    messageSenderName: ".msg-s-message-group__name",

    // Timestamp within a message item
    messageTimestamp: ".msg-s-message-group__timestamp",

    // The text within a message bubble
    messageText: ".msg-s-event-listitem__body",

    // Full conversation thread
    conversationThread: ".msg-s-message-list__event",

    // Recipient name in conversation header
    recipientName: ".msg-entity-lockup__entity-title, .msg-title-bar .app-aware-link",

    // Recipient headline / subtitle
    recipientHeadline: ".msg-entity-lockup__subtitle",

    // Conversation header (contains recipient info)
    conversationHeader: ".msg-thread .msg-entity-lockup, .msg-s-event-listitem",

    // Message composer (the text input)
    composer: ".msg-form__contenteditable, div[contenteditable][aria-label]",

    // Composer form footer area (where we inject our button)
    composerFooter: ".msg-form__footer, .msg-form__left-actions",

    // The "Send" button in the composer
    sendButton: ".msg-form__send-button",

    // My own name (shown in top nav)
    myName: ".global-nav__me-photo, .nav-item__profile-member-photo",

    // Messaging page indicator (are we on messaging?)
    messagingPage: ".msg-overlay-list-bubble, .msg-thread, .messages-container",
} as const;

export type SelectorKey = keyof typeof SELECTORS;

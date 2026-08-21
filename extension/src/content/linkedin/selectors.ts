/**
 * content/linkedin/selectors.ts
 * Centralized LinkedIn DOM selectors.
 * When LinkedIn updates its DOM, update ONLY this file.
 */

export const SELECTORS = {
    // Messaging forms and containers
    messageForm:
        "form.msg-form, .msg-form, .msg-form__container, .msg-overlay-conversation-bubble form",

    // Messaging conversation panel / wrapper
    conversationPanel:
        ".msg-convo-wrapper, .msg-s-message-list-container, .msg-overlay-conversation-bubble, .msg-thread",

    // Individual message list items
    messageList:
        ".msg-s-message-list, ul.msg-s-message-list, .msg-s-message-list-container",
    messageItem:
        ".msg-s-event-listitem, .msg-s-message-list__event",

    // Message bubble (contains the text)
    messageBubble:
        ".msg-s-event-listitem__body, .msg-s-event-listitem__message-bubble, .msg-s-message-group__message, .msg-s-message-group__message-bubble",

    // Message sender name within a group
    messageSenderName:
        ".msg-s-message-group__name, .msg-s-message-group__meta, .msg-s-event-listitem__name",

    // Timestamp within a message item
    messageTimestamp:
        ".msg-s-message-group__timestamp, time, .msg-s-event-listitem__time-stamp",

    // The text within a message bubble
    messageText:
        ".msg-s-event-listitem__body, .msg-s-event-listitem__message-bubble, .msg-s-message-group__message-bubble",

    // Full conversation thread
    conversationThread:
        ".msg-s-message-list__event, .msg-s-event-listitem",

    // Recipient name in conversation header
    recipientName:
        ".msg-entity-lockup__entity-title, .msg-entity-lockup__title, .msg-title-bar .app-aware-link, .msg-overlay-bubble-header__title, .msg-title-bar__title, .msg-entity-lockup__name, .artdeco-entity-lockup__title, [class*='entity-title'], .msg-thread__topcard-headline",

    // Recipient headline / subtitle
    recipientHeadline:
        ".msg-entity-lockup__entity-subtitle, .msg-entity-lockup__subtitle, .artdeco-entity-lockup__subtitle, .msg-overlay-bubble-header__subtitle, .msg-thread__topcard-subline, .msg-entity-lockup__occupation, [class*='entity-subtitle'], .msg-thread__topcard p, div.msg-thread__topcard-desc, [data-view-name*='conversation-header'] [class*='subtitle'], .msg-thread__topcard-subline-wrapper",

    // Conversation header (contains recipient info)
    conversationHeader:
        ".msg-thread .msg-entity-lockup, .msg-overlay-bubble-header, .msg-title-bar, .msg-conversation-header, [data-view-name*='conversation-header'], .msg-entity-lockup",

    // Message composer (the text input)
    composer:
        "div.msg-form__contenteditable, div[contenteditable='true'], div[role='textbox'], .msg-form__message-text-editor, div[aria-label*='message' i], div[aria-label*='Write' i]",

    // Composer form footer area (where we inject our button)
    composerFooter:
        "footer.msg-form__footer, .msg-form__footer, .msg-form__left-actions, .msg-form__actions, .msg-form__right-actions, .msg-form__hover-card",

    // The "Send" button in the composer
    sendButton:
        ".msg-form__send-button, button[type='submit'].msg-form__send-button",

    // My own name (shown in top nav)
    myName: ".global-nav__me-photo, .nav-item__profile-member-photo",

    // Messaging page indicator (are we on messaging?)
    messagingPage: ".msg-overlay-list-bubble, .msg-thread, .messages-container",

    // ─── Profile Page Selectors (works on OWN and OTHER profiles) ─────────────

    // Profile page indicator (any /in/ page)
    isProfilePage:
        "main section.pv-top-card, .profile-view-grid, section.artdeco-card.pv-top-card, main .profile-background-image",

    // Own profile indicator (edit pencils / buttons only visible on own profile)
    ownProfileIndicator:
        "button[aria-label*='edit' i], a[href*='add-edit-profile-section'], a[href*='overlay/edit/'], .profile-topcard-actions--edit, .pv-top-card__edit-photo, .pvs-profile-actions__action--edit, button[data-control-name*='edit' i]",

    // Name on any profile page
    profileName:
        "h1.text-heading-xlarge, h1.inline.t-24.t-black.t-normal, main h1, .pv-top-card--list h1",

    // Headline on any profile page
    profileHeadline:
        ".text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium, div.pv-text-details__left-panel .text-body-medium",

    // ─── About / Summary ──────────────────────────────────────────────────────
    // LinkedIn renders about text inside a show-more span with aria-hidden='true'
    // Multiple selector fallbacks for different LinkedIn versions:
    aboutText: [
        // Most common (2024-2026): section with "About" h2 contains inline-show-more-text
        ".pv-shared-text-with-see-more .visually-hidden",
        ".pv-shared-text-with-see-more .inline-show-more-text span[aria-hidden='true']",
        "section div[data-generated-suggestion-target] .inline-show-more-text",
        ".pv-about-section .lt-line-clamp__raw-line",
        ".pv-about__summary-text",
        "#about ~ div span[aria-hidden='true']",
        "section:has(#about) .inline-show-more-text span[aria-hidden='true']",
    ].join(", "),

    // ─── Skills ───────────────────────────────────────────────────────────────
    skillItems:
        "section:has(#skills) .pvs-list__paged-list-item, #skills ~ .pvs-list .pvs-list__paged-list-item, section[data-view-name='profile-card']:has([id*='skill']) .pvs-list__paged-list-item, div[data-view-name*='skill']",

    // The actual skill name text inside each list item
    skillTitle:
        ".pv-skill-categories-section__top-skill span[aria-hidden='true'], div[data-view-name*='skill-entity'] span.visually-hidden, .hoverable-link-text span[aria-hidden='true'], a[data-field='skill_card_skill_topic'] span[aria-hidden='true'], .mr1.hoverable-link-text span[aria-hidden='true'], div[data-view-name*='skill'] span[aria-hidden='true']",

    // ─── Posts & Activity ─────────────────────────────────────────────────────
    activitySection:
        "section:has(#content_collections), section[data-view-name='profile-activity-section']",

    activityPostItems:
        "section:has(#content_collections) .pvs-list__paged-list-item, section[data-view-name='profile-activity-section'] .pvs-list__paged-list-item",

    // Post text content (on feed AND profile activity)
    postDescription:
        ".feed-shared-update-v2__description-wrapper .update-components-text span[aria-hidden='true'], .feed-shared-inline-show-more-text span[aria-hidden='true'], .update-components-text .break-words span[aria-hidden='true'], .feed-shared-text .break-words span[aria-hidden='true']",

    // ─── Feed Identity (left rail on feed, not profile page) ─────────────────
    feedIdentityModule:
        ".feed-identity-module, [data-view-name='feed-identity-module'], .identity-headline, .identity-module",
    feedUserName:
        ".feed-identity-module__actor-meta a, .identity-module__name, .feed-identity-module .t-16",
    feedUserHeadline:
        ".feed-identity-module__headline, .feed-identity-module .t-12, .identity-headline, .identity-module__headline",

    // ─── Global Nav ────────────────────────────────────────────────────────────
    navMeButton:
        ".global-nav__me, button.global-nav__primary-link-me-menu-trigger, button[aria-label*='Me']",
    navMePhotoImg:
        ".global-nav__me-photo, img.global-nav__me-photo",
} as const;

export type SelectorKey = keyof typeof SELECTORS;

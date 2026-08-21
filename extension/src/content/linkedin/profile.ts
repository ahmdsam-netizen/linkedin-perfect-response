/**
 * content/linkedin/profile.ts
 * Extract the RECIPIENT's profile info when in a messaging conversation.
 *
 * Resolves the recipient's profile URL across all LinkedIn messaging layouts
 * (full-page messaging, floating chat bubbles, profile chat overlays)
 * and fetches their full profile data (About, Skills, Posts) in the background.
 */

import type { LinkedInPerson } from "../../shared/types.ts";
import { fetchProfileInBackground } from "./profileFetcher.ts";
import { SELECTORS } from "./selectors.ts";

/**
 * Extract the recipient's profile from the current messaging conversation.
 */
export async function extractRecipient(scope?: Element | null): Promise<LinkedInPerson> {
    const container = findConversationContainer(scope);
    let name = extractName(container);
    let headline = extractHeadline(container);
    let profileUrl = extractProfileUrl(container);

    console.log(`[LinkedIn AI] 🔍 Initial DOM extract for recipient:`, { name, headline, profileUrl });

    const { company, position } = parseHeadline(headline);

    const base: LinkedInPerson = {
        name,
        headline,
        company,
        position,
        profileUrl,
    };

    // If we have a profile URL, silently fetch rich data in the background
    if (profileUrl) {
        try {
            const fetched = await fetchProfileInBackground(profileUrl);
            if (fetched) {
                base.name = base.name === "Unknown" || !base.name ? fetched.name : base.name;
                base.headline = base.headline || fetched.headline;
                base.about = fetched.about;
                base.skills = fetched.skills.length > 0 ? fetched.skills : undefined;
                base.recentPosts = fetched.recentPosts.length > 0 ? fetched.recentPosts : undefined;

                if (!base.company || !base.position) {
                    const parsed = parseHeadline(fetched.headline);
                    base.company = base.company || parsed.company;
                    base.position = base.position || parsed.position;
                }

                console.log(`[LinkedIn AI] 🎯 Enriched recipient context for "${base.name}":`, {
                    about: base.about ? "Found" : "None",
                    skills: base.skills?.length || 0,
                    posts: base.recentPosts?.length || 0,
                });
            }
        } catch (err) {
            console.warn("[LinkedIn AI] Background fetch error:", err);
        }
    } else {
        console.warn("[LinkedIn AI] Could not find recipient profile URL in this conversation.");
    }

    return base;
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function findConversationContainer(scope?: Element | null): Element | Document {
    if (scope) {
        const container = scope.closest(
            ".msg-convo-wrapper, .msg-s-message-list-container, .msg-overlay-conversation-bubble, .msg-thread, div[data-view-name*='message']"
        );
        if (container) return container;
    }
    return document;
}

function extractName(root: Element | Document): string {
    // 1. Try explicit recipient name selectors
    const el = root.querySelector(SELECTORS.recipientName);
    const text = el?.textContent?.trim();
    if (text && text.length > 1) return text;

    // 2. If viewing on someone's profile page directly, use page H1
    if (window.location.pathname.startsWith("/in/")) {
        const h1 = document.querySelector("h1.text-heading-xlarge, main h1");
        if (h1?.textContent) return h1.textContent.trim();
    }

    // 3. Look inside conversation title bar or header links
    const titleLink = root.querySelector<HTMLAnchorElement>(
        ".msg-title-bar a, .msg-entity-lockup a, a.msg-thread__link-to-profile"
    );
    if (titleLink?.textContent?.trim()) {
        return titleLink.textContent.trim();
    }

    // 4. Look for the first non-self message sender name
    const sender = root.querySelector(".msg-s-message-group:not(.msg-s-message-group--self) .msg-s-message-group__name");
    if (sender?.textContent?.trim()) {
        return sender.textContent.trim();
    }

    return "Unknown";
}

function extractHeadline(root: Element | Document): string | undefined {
    const el = root.querySelector(SELECTORS.recipientHeadline);
    if (el?.textContent?.trim()) return el.textContent.trim();

    if (window.location.pathname.startsWith("/in/")) {
        const pageHeadline = document.querySelector(".text-body-medium.break-words");
        if (pageHeadline?.textContent?.trim()) return pageHeadline.textContent.trim();
    }

    return undefined;
}

function extractProfileUrl(root: Element | Document): string | undefined {
    // 1. If we are on someone's profile page and messaging them via overlay:
    if (window.location.pathname.startsWith("/in/")) {
        return window.location.href;
    }

    // 2. Search inside conversation header / title bar
    const header = root.querySelector(
        ".msg-entity-lockup, .msg-overlay-bubble-header, .msg-title-bar, .msg-thread__topcard, .msg-conversation-header, [data-view-name*='conversation-header'], .msg-overlay-conversation-bubble__header"
    ) || document.querySelector(".msg-title-bar, .msg-entity-lockup");

    if (header) {
        const link = header.querySelector<HTMLAnchorElement>("a[href*='/in/'], a[href*='linkedin.com/in/']");
        if (link?.href) return link.href;
    }

    // 3. Search in message list (avatar links of non-self messages)
    const otherMsgLink = root.querySelector<HTMLAnchorElement>(
        ".msg-s-message-group:not(.msg-s-message-group--self) a[href*='/in/'], .msg-s-event-listitem__link[href*='/in/'], .msg-s-message-group__profile-link"
    );
    if (otherMsgLink?.href) return otherMsgLink.href;

    // 4. In /messaging, check the selected conversation on the left rail
    const selectedConvo = document.querySelector<HTMLAnchorElement>(
        ".msg-conversations-container__convo-item--selected a[href*='/in/'], .msg-conversation-listitem--active a[href*='/in/'], [aria-selected='true'] a[href*='/in/']"
    );
    if (selectedConvo?.href) return selectedConvo.href;

    // 5. Any link matching /in/ in the conversation root
    const anyLink = root.querySelector<HTMLAnchorElement>("a[href*='/in/']");
    if (anyLink?.href) return anyLink.href;

    return undefined;
}

function parseHeadline(headline?: string): { company?: string; position?: string } {
    if (!headline) return {};
    const atMatch = /^(.+?)\s+at\s+(.+)$/i.exec(headline);
    if (atMatch) return { position: atMatch[1].trim(), company: atMatch[2].trim() };
    const pipeMatch = /^(.+?)\s*\|\s*(.+)$/.exec(headline);
    if (pipeMatch) return { position: pipeMatch[1].trim(), company: pipeMatch[2].trim() };
    return { position: headline };
}

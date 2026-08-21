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
    const name = extractName(container);
    const headline = extractHeadline(container);
    const profileUrl = extractProfileUrl(container);

    console.log(`[LinkedIn AI] 🔍 Initial DOM extract for recipient:`, { name, headline, profileUrl });

    const parsedHeadline = parseHeadline(headline);

    const base: LinkedInPerson = {
        name: (name && name !== "Unknown") ? name : "Recipient",
        headline: headline || undefined,
        company: parsedHeadline.company,
        position: parsedHeadline.position,
        profileUrl,
    };

    // If we have a profile URL, silently fetch rich data in the background
    if (profileUrl) {
        try {
            const fetched = await fetchProfileInBackground(profileUrl);
            if (fetched) {
                if (fetched.name && fetched.name !== "me" && !fetched.name.startsWith("ACoA") && base.name === "Recipient") {
                    base.name = fetched.name;
                }
                base.headline = base.headline || fetched.headline;
                base.about = fetched.about || base.about;
                base.skills = (fetched.skills && fetched.skills.length > 0) ? fetched.skills : base.skills;
                base.recentPosts = (fetched.recentPosts && fetched.recentPosts.length > 0) ? fetched.recentPosts : base.recentPosts;

                if (!base.company || !base.position) {
                    const parsed = parseHeadline(base.headline || fetched.headline);
                    base.company = base.company || parsed.company;
                    base.position = base.position || parsed.position;
                }

                console.log(`[LinkedIn AI] 🎯 Enriched recipient context for "${base.name}":`, {
                    headline: base.headline || "None",
                    position: base.position || "None",
                    company: base.company || "None",
                    about: base.about ? "Found" : "None",
                    skills: base.skills?.length || 0,
                    posts: base.recentPosts?.length || 0,
                });
            }
        } catch (err) {
            console.warn("[LinkedIn AI] Background fetch error:", err);
        }
    }

    return base;
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function findConversationContainer(scope?: Element | null): Element | Document {
    if (scope) {
        const container = scope.closest(
            ".msg-thread, .msg-overlay-conversation-bubble, .msg-overlay-container, .msg-convo-wrapper, main"
        );
        if (container) return container;
    }
    return document.querySelector(".msg-thread, .msg-overlay-conversation-bubble, .msg-convo-wrapper") || document;
}

function extractName(root: Element | Document): string {
    // 1. Try explicit recipient name selectors
    const el = root.querySelector(SELECTORS.recipientName) || document.querySelector(SELECTORS.recipientName);
    const text = el?.textContent?.trim();
    if (text && text.length > 1 && !text.toLowerCase().includes("messaging")) return cleanHeadlineText(text);

    // 2. If viewing on someone's profile page directly, use page H1
    if (window.location.pathname.startsWith("/in/")) {
        const h1 = document.querySelector("h1.text-heading-xlarge, main h1");
        if (h1?.textContent) return cleanHeadlineText(h1.textContent);
    }

    // 3. Look inside conversation title bar or header links
    const titleLink = document.querySelector<HTMLAnchorElement>(
        ".msg-title-bar a, .msg-entity-lockup a, a.msg-thread__link-to-profile, .msg-overlay-bubble-header__title a"
    );
    if (titleLink?.textContent?.trim()) {
        const t = cleanHeadlineText(titleLink.textContent);
        if (t && !t.toLowerCase().includes("messaging")) return t;
    }

    // 4. In /messaging, check the selected conversation on the left rail
    const activeConvoName = document.querySelector(
        ".msg-conversation-listitem--active .msg-conversation-listitem__participant-names, [aria-selected='true'] .msg-conversation-listitem__participant-names"
    );
    if (activeConvoName?.textContent?.trim()) {
        return cleanHeadlineText(activeConvoName.textContent);
    }

    // 5. Look for the first non-self message sender name
    const sender = document.querySelector(".msg-s-message-group:not(.msg-s-message-group--self) .msg-s-message-group__name, .msg-s-event-listitem:not(.msg-s-event-listitem--self) .msg-s-event-listitem__name");
    if (sender?.textContent?.trim()) {
        return cleanHeadlineText(sender.textContent);
    }

    return "Unknown";
}

function extractHeadline(root: Element | Document): string | undefined {
    // 1. Check all explicit subtitle and occupation candidate elements in root and document
    const candidates = [
        ...Array.from(root.querySelectorAll(".msg-entity-lockup__entity-subtitle, .artdeco-entity-lockup__subtitle, .msg-thread__topcard-subline, .msg-overlay-bubble-header__subtitle, [class*='entity-subtitle'], [class*='topcard-subline'], [class*='occupation']")),
        ...Array.from(document.querySelectorAll(".msg-entity-lockup__entity-subtitle, .artdeco-entity-lockup__subtitle, .msg-thread__topcard-subline, .msg-overlay-bubble-header__subtitle, [class*='entity-subtitle'], [class*='topcard-subline'], [class*='occupation']")),
    ];

    for (const el of candidates) {
        const text = cleanHeadlineText(el.textContent || "");
        if (isValidHeadline(text)) return text;
    }

    // 2. Look in conversation topcard container (top of the message list)
    const topcard = document.querySelector(".msg-thread__topcard, .msg-s-message-list__topcard, section.msg-thread__topcard, div.msg-thread__topcard");
    if (topcard) {
        const pOrSpan = topcard.querySelector("p, .artdeco-entity-lockup__subtitle, .artdeco-entity-lockup__caption, span.t-14, .msg-thread__topcard-subline");
        const topText = pOrSpan?.textContent ? cleanHeadlineText(pOrSpan.textContent) : "";
        if (isValidHeadline(topText)) return topText;
    }

    // 3. Check the active conversation item on the left rail
    const activeConvo = document.querySelector(".msg-conversation-listitem--active, .msg-conversations-container__convo-item--selected, [aria-selected='true']");
    if (activeConvo) {
        const sub = activeConvo.querySelector(".artdeco-entity-lockup__subtitle, .msg-conversation-listitem__headline, .msg-conversation-card__row");
        const subText = sub?.textContent ? cleanHeadlineText(sub.textContent) : "";
        if (isValidHeadline(subText)) return subText;
    }

    // 4. If viewing directly on someone's profile page
    if (window.location.pathname.startsWith("/in/")) {
        const pageHeadline = document.querySelector(".text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium, [data-anonymize='headline']");
        const pageText = pageHeadline?.textContent ? cleanHeadlineText(pageHeadline.textContent) : "";
        if (isValidHeadline(pageText)) return pageText;
    }

    return undefined;
}

function isValidHeadline(text: string): boolean {
    if (!text || text.length < 3 || text.length > 200) return false;
    const lower = text.toLowerCase();
    return !(
        lower === "active now" ||
        lower === "online" ||
        lower === "typing..." ||
        lower.startsWith("active ") ||
        lower.startsWith("you:") ||
        lower.startsWith("you: ") ||
        lower.includes("unread message") ||
        lower.includes("view profile") ||
        lower.includes("linkedin member")
    );
}

function cleanHeadlineText(text: string): string {
    return text
        .replace(/[\n\r\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .replace(/^•\s*/, "")
        .trim();
}

function extractProfileUrl(root: Element | Document): string | undefined {
    // 1. If we are on someone's profile page and messaging them via overlay:
    if (window.location.pathname.startsWith("/in/")) {
        const slug = window.location.pathname.split("/")[2];
        if (slug && slug !== "me") {
            return `https://www.linkedin.com/in/${slug}/`;
        }
    }

    // 2. Search inside conversation header / title bar / topcard
    const header = root.querySelector(
        ".msg-entity-lockup, .msg-overlay-bubble-header, .msg-title-bar, .msg-thread__topcard, .msg-conversation-header, [data-view-name*='conversation-header'], .msg-overlay-conversation-bubble__header, .msg-thread__link-to-profile"
    ) || document.querySelector(".msg-title-bar, .msg-entity-lockup");

    if (header) {
        const link = header.querySelector<HTMLAnchorElement>("a[href*='/in/'], a[href*='linkedin.com/in/']");
        if (link?.href) return link.href;

        // Check if header itself is an anchor or has an anchor child
        const parentAnchor = header.closest<HTMLAnchorElement>("a[href*='/in/']");
        if (parentAnchor?.href) return parentAnchor.href;
    }

    // 3. Search in message list (avatar links of non-self messages)
    const otherMsgLinks = root.querySelectorAll<HTMLAnchorElement>(
        ".msg-s-message-group:not(.msg-s-message-group--self) a[href*='/in/'], .msg-s-event-listitem__link[href*='/in/'], .msg-s-message-group__profile-link, .presence-entity a[href*='/in/'], .msg-facepile-grid a[href*='/in/']"
    );
    for (const link of Array.from(otherMsgLinks)) {
        if (link.href && !link.href.includes("/in/me")) {
            return link.href;
        }
    }

    // 4. In /messaging, check the selected conversation on the left rail
    const selectedConvo = document.querySelector<HTMLAnchorElement>(
        ".msg-conversations-container__convo-item--selected a[href*='/in/'], .msg-conversation-listitem--active a[href*='/in/'], [aria-selected='true'] a[href*='/in/']"
    );
    if (selectedConvo?.href) return selectedConvo.href;

    // 5. Any link matching /in/ in the conversation root (excluding /in/me)
    const anyLinks = root.querySelectorAll<HTMLAnchorElement>("a[href*='/in/']");
    for (const link of Array.from(anyLinks)) {
        if (link.href && !link.href.includes("/in/me")) {
            return link.href;
        }
    }

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

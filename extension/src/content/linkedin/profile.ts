/**
 * content/linkedin/profile.ts
 * Extract the recipient's profile info from the LinkedIn DOM.
 * Returns a LinkedInPerson — knows nothing about LangChain or the API.
 */

import type { LinkedInPerson } from "../../shared/types.ts";
import { SELECTORS } from "./selectors.ts";

/**
 * Extract the recipient LinkedIn profile from the current conversation.
 */
export function extractRecipient(): LinkedInPerson {
    const name = extractRecipientName();
    const headline = extractRecipientHeadline();
    const profileUrl = extractProfileUrl();
    const { company, position } = parseHeadline(headline);

    return {
        name,
        headline,
        company,
        position,
        profileUrl,
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractRecipientName(): string {
    const el = document.querySelector(SELECTORS.recipientName);
    return el?.textContent?.trim() ?? "Unknown";
}

function extractRecipientHeadline(): string | undefined {
    const el = document.querySelector(SELECTORS.recipientHeadline);
    return el?.textContent?.trim() ?? undefined;
}

function extractProfileUrl(): string | undefined {
    // Try to find a profile link in the conversation header
    const headerEl = document.querySelector(".msg-entity-lockup");
    const link = headerEl?.querySelector<HTMLAnchorElement>("a[href*='linkedin.com/in/']");
    return link?.href ?? undefined;
}

/**
 * Parse "Position at Company" style headlines into separate fields.
 */
function parseHeadline(headline?: string): {
    company?: string;
    position?: string;
} {
    if (!headline) return {};

    // Common patterns: "Software Engineer at Google", "CEO | Apple"
    const atPattern = /^(.+?)\s+at\s+(.+)$/i;
    const pipePattern = /^(.+?)\s*\|\s*(.+)$/;

    const atMatch = atPattern.exec(headline);
    if (atMatch) {
        return { position: atMatch[1].trim(), company: atMatch[2].trim() };
    }

    const pipeMatch = pipePattern.exec(headline);
    if (pipeMatch) {
        return { position: pipeMatch[1].trim(), company: pipeMatch[2].trim() };
    }

    // Can't parse — just put it all in position
    return { position: headline };
}

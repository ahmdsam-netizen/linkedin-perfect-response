/**
 * content/linkedin/anyProfile.ts
 *
 * Extracts profile data from ANY live LinkedIn /in/ profile page
 * (combining embedded hydration JSON + live DOM) and stores it in the local profile cache.
 */

import type { CachedProfile } from "../../shared/profileCache.ts";
import { saveProfileToCache, currentPageSlug } from "../../shared/profileCache.ts";
import { extractFromEmbeddedJson, isValidSkill } from "./profileFetcher.ts";

export function isAnyProfilePage(): boolean {
    return window.location.pathname.startsWith("/in/");
}

export async function captureAndCacheCurrentProfile(): Promise<CachedProfile | null> {
    if (!isAnyProfilePage()) return null;

    const slug = currentPageSlug();
    if (!slug) return null;

    // 1. Extract from live document embedded JSON
    const jsonExtracted = extractFromEmbeddedJson(document);

    // 2. Extract from live DOM
    const domName = extractName();
    const domHeadline = extractHeadline();
    const domAbout = extractAbout();
    const domSkills = extractSkills();
    const domPosts = extractRecentPosts();

    // 3. Combine results
    const name = jsonExtracted.name || domName || slug;
    const headline = jsonExtracted.headline || domHeadline;
    const about = jsonExtracted.about || domAbout;
    const skills = Array.from(new Set([...(jsonExtracted.skills || []), ...domSkills])).slice(0, 50);
    const recentPosts = Array.from(new Set([...(jsonExtracted.recentPosts || []), ...domPosts])).slice(0, 5);

    const profile: CachedProfile = {
        slug,
        name,
        headline,
        about,
        skills,
        recentPosts,
        cachedAt: Date.now(),
    };

    await saveProfileToCache(profile);

    console.log(
        `[LinkedIn AI] 📌 Live cached profile for "${slug}":`,
        `Name="${name}", Headline="${headline || "none"}", About=${about ? "yes" : "no"}, Skills=${skills.length} [${skills.slice(0, 5).join(", ")}], Posts=${recentPosts.length}`
    );

    return profile;
}

// ─── Extraction Helpers ────────────────────────────────────────────────────────

function extractName(): string | null {
    const h1 = document.querySelector<HTMLElement>("h1.text-heading-xlarge, main h1, .pv-top-card h1");
    const name = h1?.innerText?.trim() ?? h1?.textContent?.trim();
    if (name && name.length > 1) return name;
    return null;
}

function extractHeadline(): string | undefined {
    const el = document.querySelector<HTMLElement>(
        ".text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium"
    );
    return el?.innerText?.trim() ?? el?.textContent?.trim() ?? undefined;
}

function extractAbout(): string | undefined {
    // 1. By #about anchor
    const aboutAnchor = document.getElementById("about");
    if (aboutAnchor) {
        const sec = aboutAnchor.closest("section, div.artdeco-card");
        if (sec) {
            const text = findSubstantiveText(sec as HTMLElement);
            if (text) return cleanAbout(text);
        }
    }

    // 2. By section heading "About"
    const aboutSec = findSectionByHeading(["about", "summary", "about me"]);
    if (aboutSec) {
        const text = findSubstantiveText(aboutSec);
        if (text) return cleanAbout(text);
    }

    // 3. By shared-text class
    const sharedText = document.querySelector<HTMLElement>(".pv-shared-text-with-see-more, .inline-show-more-text");
    if (sharedText) {
        const text = sharedText.innerText?.trim() ?? sharedText.textContent?.trim();
        if (text && text.length > 30) return cleanAbout(text);
    }

    return undefined;
}

function extractSkills(): string[] {
    const skills = new Set<string>();

    // 1. By #skills anchor
    const skillsAnchor = document.getElementById("skills");
    if (skillsAnchor) {
        const sec = skillsAnchor.closest("section, div.artdeco-card");
        if (sec) {
            sec.querySelectorAll<HTMLElement>(
                "a[data-field='skill_card_skill_topic'] span[aria-hidden='true'], .hoverable-link-text span[aria-hidden='true'], li span[aria-hidden='true']"
            ).forEach((el) => {
                const text = el.innerText?.trim() ?? el.textContent?.trim();
                if (text && isValidSkill(text)) skills.add(cleanText(text));
            });
        }
    }

    // 2. By section heading "Skills"
    if (skills.size === 0) {
        const skillsSec = findSectionByHeading(["skills", "skills & endorsements", "top skills"]);
        if (skillsSec) {
            skillsSec.querySelectorAll<HTMLElement>(
                "a[data-field='skill_card_skill_topic'] span[aria-hidden='true'], .hoverable-link-text span[aria-hidden='true'], li span[aria-hidden='true']"
            ).forEach((el) => {
                const text = el.innerText?.trim() ?? el.textContent?.trim();
                if (text && isValidSkill(text)) skills.add(cleanText(text));
            });
        }
    }

    return Array.from(skills).slice(0, 50);
}

function extractRecentPosts(): string[] {
    const posts: string[] = [];

    const activityAnchor = document.getElementById("content_collections");
    const activitySec = activityAnchor
        ? activityAnchor.closest("section")
        : findSectionByHeading(["activity", "posts"]);

    if (activitySec) {
        activitySec.querySelectorAll<HTMLElement>(
            ".update-components-text span[aria-hidden='true'], .feed-shared-update-v2__description"
        ).forEach((el) => {
            const text = el.innerText?.trim() ?? el.textContent?.trim();
            if (text && text.length > 20 && !posts.includes(text)) {
                posts.push(cleanText(text).slice(0, 300));
            }
        });
    }

    return posts.slice(0, 5);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findSectionByHeading(keywords: string[]): HTMLElement | null {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("section, div.artdeco-card"));
    for (const sec of sections) {
        const h2 = sec.querySelector("h2, h3, div.pvs-header__title");
        const title = h2?.textContent?.toLowerCase().trim() || "";
        if (keywords.some((kw) => title.includes(kw))) {
            return sec;
        }
    }
    return null;
}

function findSubstantiveText(container: HTMLElement): string | null {
    const spans = Array.from(container.querySelectorAll<HTMLElement>("span[aria-hidden='true'], .inline-show-more-text, p"));
    for (const span of spans) {
        const text = span.textContent?.trim();
        if (text && text.length > 25 && !text.toLowerCase().includes("about")) {
            return text;
        }
    }
    return null;
}

function cleanText(text: string): string {
    return text
        .replace(/[\n\r\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function cleanAbout(text: string): string {
    return text
        .replace(/…\s*see more/gi, "")
        .replace(/\.\.\.\s*see more/gi, "")
        .replace(/[\n\r\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}


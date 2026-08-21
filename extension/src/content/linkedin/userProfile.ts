/**
 * content/linkedin/userProfile.ts
 * Extracts the logged-in user's own profile information (Name, Role, Skills, Background)
 * directly from LinkedIn DOM/embedded hydration JSON or via background fetch of /in/me/.
 */

import type { UserProfile } from "../../shared/types.ts";
import { mergeUserProfile, getUserProfile } from "../../shared/storage.ts";
import { fetchOwnProfileDirectly, extractFromEmbeddedJson, isValidSkill } from "./profileFetcher.ts";
import { SELECTORS } from "./selectors.ts";

/**
 * Automatically inspects the page DOM/JSON or fetches /in/me/ to sync the user's profile.
 * Merges discovered fields with existing saved profile in chrome.storage.local.
 */
export async function syncUserProfileFromDOM(): Promise<Partial<UserProfile> | null> {
    let extracted: Partial<UserProfile> | null = isOwnProfilePage()
        ? extractFullOwnProfile()
        : extractMiniProfile();

    // If local profile is missing skills or background, auto-fetch /in/me/ in background
    const existing = await getUserProfile();
    const needsEnrichment =
        !existing?.skills?.length ||
        !existing?.background ||
        !extracted?.skills?.length ||
        (extracted.skills.length < 3 && !existing?.skills?.length);

    if (needsEnrichment) {
        const fetched = await fetchOwnProfileDirectly();
        if (fetched) {
            const combinedSkills = Array.from(
                new Set([...(extracted?.skills || []), ...(fetched.skills || [])])
            );
            extracted = {
                ...extracted,
                name: extracted?.name || fetched.name,
                role: extracted?.role || fetched.headline,
                skills: combinedSkills.length > 0 ? combinedSkills : extracted?.skills,
                background: extracted?.background || fetched.about,
            };
        }
    }

    if (extracted && (extracted.name || extracted.role || (extracted.skills && extracted.skills.length > 0))) {
        await mergeUserProfile(extracted);
        console.log("[LinkedIn AI] 💾 Merged and saved own profile:", extracted);
        return extracted;
    }

    return null;
}

/**
 * Checks if the current page is the user's OWN profile page.
 */
export function isOwnProfilePage(): boolean {
    if (!window.location.pathname.startsWith("/in/")) {
        return false;
    }

    if (window.location.pathname.startsWith("/in/me")) {
        return true;
    }

    // Check for any edit buttons / controls present only on own profile
    const hasOwnIndicator = document.querySelector(
        "button[aria-label*='edit' i], a[href*='add-edit-profile-section'], a[href*='overlay/edit/'], a[href*='edit/forms/'], .profile-topcard-actions--edit, .pv-top-card__edit-photo, .pvs-profile-actions__action--edit, button[data-control-name*='edit' i], div[data-view-name*='profile-edit']"
    ) !== null;

    return hasOwnIndicator;
}

/**
 * Extracts complete profile information when on the user's own profile page.
 */
export function extractFullOwnProfile(): Partial<UserProfile> {
    const data: Partial<UserProfile> = {};

    // 1. Extract from embedded hydration JSON on live document
    const jsonExtracted = extractFromEmbeddedJson(document);
    if (jsonExtracted.name) data.name = jsonExtracted.name;
    if (jsonExtracted.headline) data.role = jsonExtracted.headline;
    if (jsonExtracted.about) data.background = jsonExtracted.about;

    // 2. DOM fallback
    const nameEl = document.querySelector(SELECTORS.profileName);
    if (nameEl?.textContent && !data.name) {
        data.name = cleanText(nameEl.textContent);
    }

    const headlineEl = document.querySelector(SELECTORS.profileHeadline);
    if (headlineEl?.textContent && !data.role) {
        data.role = cleanText(headlineEl.textContent);
    }

    // About extraction
    const aboutSec = findSectionByHeading(["about", "summary", "about me"]) || document.querySelector("section:has(#about), #about ~ div, div[data-view-name*='about']");
    if (aboutSec && !data.background) {
        const text = findSubstantiveText(aboutSec as HTMLElement);
        if (text) data.background = cleanAbout(text);
    }

    // Skills extraction
    const domSkills: string[] = [];
    const skillsSec = findSectionByHeading(["skills", "skills & endorsements", "top skills"]) || document.querySelector("section:has(#skills), #skills ~ div");
    const skillRoots = skillsSec ? [skillsSec] : [document.body];
    
    skillRoots.forEach((root) => {
        root.querySelectorAll<HTMLElement>(
            "a[data-field='skill_card_skill_topic'] span[aria-hidden='true'], .hoverable-link-text span[aria-hidden='true'], div[data-view-name*='skill'] span[aria-hidden='true'], .pvs-list__paged-list-item .mr1.hoverable-link-text span[aria-hidden='true'], .pvs-list__paged-list-item div.t-bold span[aria-hidden='true'], div[data-field='skill_card_skill_topic'] span[aria-hidden='true']"
        ).forEach((el) => {
            const text = cleanText(el.textContent || "");
            if (isValidSkill(text) && !domSkills.includes(text)) {
                domSkills.push(text);
            }
        });
    });

    const combinedSkills = Array.from(new Set([...(jsonExtracted.skills || []), ...domSkills])).filter(isValidSkill).slice(0, 50);
    if (combinedSkills.length > 0) {
        data.skills = combinedSkills;
    }

    return data;
}

/**
 * Extracts basic profile info from the feed identity widget or global nav.
 */
export function extractMiniProfile(): Partial<UserProfile> {
    const data: Partial<UserProfile> = {};

    const feedName = document.querySelector(SELECTORS.feedUserName)?.textContent;
    const feedHeadline = document.querySelector(SELECTORS.feedUserHeadline)?.textContent;

    if (feedName) {
        data.name = cleanText(feedName);
    }
    if (feedHeadline) {
        data.role = cleanText(feedHeadline);
    }

    if (!data.name) {
        const navImg = document.querySelector<HTMLImageElement>(SELECTORS.navMePhotoImg);
        if (navImg?.alt && navImg.alt.trim().length > 1 && !navImg.alt.toLowerCase().includes("photo")) {
            data.name = cleanText(navImg.alt);
        }
    }

    return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findSectionByHeading(keywords: string[]): HTMLElement | null {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("section, div.artdeco-card, div[data-view-name='profile-card']"));
    for (const sec of sections) {
        const h2 = sec.querySelector("h2, h3, div.pvs-header__title, .pvs-header__title");
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


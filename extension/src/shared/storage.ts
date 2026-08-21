/**
 * shared/storage.ts
 * Typed wrappers around chrome.storage.local.
 * Use these instead of calling chrome.storage directly.
 */

import type { UserProfile } from "./types.ts";

const STORAGE_KEYS = {
    USER_PROFILE: "userProfile",
} as const;

// User Profile

export async function saveUserProfile(profile: UserProfile): Promise<void> {
    await chrome.storage.local.set({
        [STORAGE_KEYS.USER_PROFILE]: profile,
    });
}

export function isCleanSkill(t: unknown): boolean {
    if (!t || typeof t !== "string") return false;
    const clean = t.trim();
    if (clean.length < 2 || clean.length > 50) return false;
    if (
        clean.startsWith("com.") ||
        clean.startsWith("org.") ||
        clean.startsWith("net.") ||
        clean.includes("linkedin.") ||
        clean.includes("voyager.") ||
        clean.includes("recipe.") ||
        clean.includes("dash.deco") ||
        clean.includes("Anon") ||
        clean.startsWith("urn:li:") ||
        clean.startsWith("http") ||
        clean.includes("://") ||
        clean.includes("/") ||
        clean.includes("\\") ||
        clean.includes("{") ||
        clean.includes("}") ||
        clean.includes("$") ||
        /^[a-z0-9_.-]+\.[a-z0-9_.-]+$/i.test(clean) ||
        /^\d+$/.test(clean)
    ) {
        return false;
    }
    const lower = clean.toLowerCase();
    return !(
        lower.includes("endorsement") ||
        lower.includes("experience across") ||
        lower.includes("experiences across") ||
        lower.includes("see all") ||
        lower.includes("show all") ||
        lower.startsWith("passed") ||
        lower.startsWith("badge") ||
        lower.startsWith("skill badge") ||
        lower.includes("skill assessment") ||
        lower === "fullpaging" ||
        lower === "vectorartifact" ||
        lower === "locale" ||
        lower === "industry" ||
        lower === "date" ||
        lower === "daterange" ||
        lower === "minischool" ||
        lower === "minicompany" ||
        lower === "coordinate2dfull" ||
        lower === "vectorimage"
    );
}

export async function getUserProfile(): Promise<UserProfile | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.USER_PROFILE);
    const profile = result[STORAGE_KEYS.USER_PROFILE] as UserProfile | undefined;
    const defaults = getDefaultUserProfile();
    if (!profile) return defaults;
    const cleanSkills = Array.isArray(profile.skills)
        ? profile.skills.map((s) => (typeof s === "string" ? s.trim() : "")).filter(isCleanSkill)
        : [];
    return {
        ...defaults,
        ...profile,
        name: (profile.name && profile.name.trim()) ? profile.name.trim() : defaults.name,
        role: (profile.role && profile.role.trim()) ? profile.role.trim() : defaults.role,
        skills: cleanSkills,
        background: (profile.background && profile.background.trim()) ? profile.background.trim() : defaults.background,
    };
}

export async function mergeUserProfile(partial: Partial<UserProfile>): Promise<UserProfile> {
    const current = (await getUserProfile()) ?? getDefaultUserProfile();

    // Deduplicate and combine clean skills
    const existingSkills = Array.isArray(current.skills) ? current.skills : [];
    const newSkills = Array.isArray(partial.skills) ? partial.skills : [];
    const mergedSkills = Array.from(
        new Set([...existingSkills, ...newSkills].map((s) => (typeof s === "string" ? s.trim() : "")).filter(isCleanSkill))
    );

    const updated: UserProfile = {
        name: (partial.name && partial.name.trim()) ? partial.name.trim() : current.name,
        role: (partial.role && partial.role.trim()) ? partial.role.trim() : current.role,
        skills: mergedSkills,
        background: (partial.background && partial.background.trim()) ? partial.background.trim() : current.background,
        ...(partial.style || current.style ? { style: partial.style || current.style } : {}),
    };

    await saveUserProfile(updated);
    return updated;
}

export async function clearUserProfile(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.USER_PROFILE);
}

// Default profile

export function getDefaultUserProfile(): UserProfile {
    return {
        name: "",
        role: "",
        skills: [],
        background: "",
    };
}


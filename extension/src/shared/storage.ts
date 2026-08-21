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

export async function getUserProfile(): Promise<UserProfile | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.USER_PROFILE);
    const profile = result[STORAGE_KEYS.USER_PROFILE] as UserProfile | undefined;
    if (!profile) return null;
    return {
        ...getDefaultUserProfile(),
        ...profile,
        skills: Array.isArray(profile.skills)
            ? profile.skills.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
            : [],
    };
}

export async function mergeUserProfile(partial: Partial<UserProfile>): Promise<UserProfile> {
    const current = (await getUserProfile()) ?? getDefaultUserProfile();

    // Deduplicate and combine skills
    const existingSkills = Array.isArray(current.skills) ? current.skills : [];
    const newSkills = Array.isArray(partial.skills) ? partial.skills : [];
    const mergedSkills = Array.from(
        new Set([...existingSkills, ...newSkills].map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean))
    );

    const updated: UserProfile = {
        name: (partial.name && partial.name.trim()) ? partial.name.trim() : current.name,
        role: (partial.role && partial.role.trim()) ? partial.role.trim() : current.role,
        skills: mergedSkills,
        background: (partial.background && partial.background.trim()) ? partial.background.trim() : current.background,
        style: partial.style || current.style || "professional",
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
        style: "professional",
    };
}


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
    return (result[STORAGE_KEYS.USER_PROFILE] as UserProfile) ?? null;
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

/**
 * shared/types.ts
 * Core type definitions shared across content script, popup, and background.
 */

// ─── LinkedIn Data ───────────────────────────────────────────────────────────

export interface LinkedInPerson {
    name: string;
    headline?: string;
    company?: string;
    position?: string;
    profileUrl?: string;
    about?: string;
    skills?: string[];
    recentPosts?: string[];
}

export interface Message {
    sender: "me" | "them";
    text: string;
    timestamp?: string;
}

export interface ConversationContext {
    recipient: LinkedInPerson;
    messages: Message[];
}

// ─── User Configuration ──────────────────────────────────────────────────────

export type CommunicationStyle =
    | "professional"
    | "casual"
    | "concise"
    | "detailed";

export interface UserProfile {
    name: string;
    role: string;
    skills: string[];
    background: string;
    style: CommunicationStyle;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export interface GenerateReplyRequest {
    context: ConversationContext;
    userProfile: UserProfile;
}

export interface GeneratedReply {
    text: string;
    confidence?: number;
}

export interface ApiError {
    message: string;
    code?: string;
}

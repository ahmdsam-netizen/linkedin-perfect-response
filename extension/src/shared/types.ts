/**
 * shared/types.ts
 * Core type definitions for LinkedIn AI Reply Extension.
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

// ─── User Profile ────────────────────────────────────────────────────────────

export type CommunicationStyle =
    | "professional"
    | "casual"
    | "concise"
    | "detailed"
    | "friendly"
    | "persuasive"
    | "enthusiastic"
    | string;

export interface UserProfile {
    name: string;
    role: string;
    skills: string[];
    background: string;
    style?: CommunicationStyle;
}

// ─── Sync & Memory API DTOs ──────────────────────────────────────────────────

export interface SyncMessagePayload {
    senderType: "USER" | "CONTACT";
    content: string;
}

export interface SyncPayload {
    user: {
        linkedinId: string;
        name: string;
    };
    contact: {
        linkedinProfileId: string;
        name: string;
        headline?: string;
    };
    conversation: {
        linkedinConversationId: string;
    };
    messages: SyncMessagePayload[];
}

export interface SyncResponse {
    conversationId: string;
    newMessagesCount: number;
    userId: string;
    contactId: string;
}

export interface GenerateReplyRequest {
    conversationId: string;
    userName?: string;
    userRole?: string;
    contactName?: string;
    contactHeadline?: string;
    relationship?: string;
    instruction?: string;
    tone?: string;
}

export interface ReplyOption {
    style: "professional" | "conversational" | "concise" | string;
    text: string;
}

export interface MemoryContextInfo {
    summaryUsed: boolean;
    factsRetrieved: number;
    recentMessagesUsed: number;
}

export interface GeneratedReplyResponse {
    reply: string;
    replies: ReplyOption[];
    memoryContext?: MemoryContextInfo;
}

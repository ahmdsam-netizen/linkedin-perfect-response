/**
 * popup/App.tsx
 * Extension popup shell with tab navigation:
 * Generate Reply tab (primary) | Your Profile tab
 */

import { useState } from "react";
import "./App.css";
import { ReplyGenerator } from "./components/ReplyGenerator.tsx";
import { ProfileForm } from "./components/ProfileForm.tsx";

type Tab = "reply" | "profile";

export default function App() {
    const [activeTab, setActiveTab] = useState<Tab>("reply");

    return (
        <div className="popup-root">
            <header className="popup-header">
                <div className="popup-logo">
                    <span className="popup-logo-icon">✨</span>
                    <span className="popup-logo-text">LinkedIn AI Reply</span>
                </div>
            </header>

            <nav className="popup-tabs">
                <button
                    className={["tab-btn", activeTab === "reply" ? "active" : ""].join(" ")}
                    onClick={() => setActiveTab("reply")}
                    type="button"
                >
                    ✨ Generate Reply
                </button>
                <button
                    className={["tab-btn", activeTab === "profile" ? "active" : ""].join(" ")}
                    onClick={() => setActiveTab("profile")}
                    type="button"
                >
                    👤 Your Profile
                </button>
            </nav>

            <main className="popup-content">
                {activeTab === "reply" && <ReplyGenerator />}
                {activeTab === "profile" && <ProfileForm />}
            </main>
        </div>
    );
}

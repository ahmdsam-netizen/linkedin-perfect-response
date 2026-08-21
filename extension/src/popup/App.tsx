/**
 * popup/App.tsx
 * Extension popup shell with tab navigation.
 * Profile tab | Settings tab
 */

import { useState } from "react";
import "./App.css";
import { ProfileForm } from "./components/ProfileForm.tsx";
import { Settings } from "./components/Settings.tsx";

type Tab = "profile" | "settings";

export default function App() {
    const [activeTab, setActiveTab] = useState<Tab>("profile");

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
                    className={["tab-btn", activeTab === "profile" ? "active" : ""].join(" ")}
                    onClick={() => setActiveTab("profile")}
                    type="button"
                >
                    Your Profile
                </button>
                <button
                    className={["tab-btn", activeTab === "settings" ? "active" : ""].join(" ")}
                    onClick={() => setActiveTab("settings")}
                    type="button"
                >
                    Cached Profiles
                </button>
            </nav>

            <main className="popup-content">
                {activeTab === "profile" && <ProfileForm />}
                {activeTab === "settings" && <Settings />}
            </main>
        </div>
    );
}

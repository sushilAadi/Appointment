"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "dashboard-theme";

// Reads/writes data-theme on <html> plus localStorage, so the choice
// persists across reloads. Runs only after mount to avoid a hydration
// mismatch (server always renders the light-theme markup).
export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = stored === "dark" ? "dark" : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
    setMounted(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  if (!mounted) {
    return <span className="side-rail-item" aria-hidden="true" style={{ visibility: "hidden" }} />;
  }

  return (
    <button
      type="button"
      className="side-rail-item"
      onClick={toggle}
      aria-label="Toggle color theme"
    >
      {theme === "dark" ? (
        <>
          <Sun size={18} className="side-item-icon" />
          <span className="side-item-label">Light Mode</span>
        </>
      ) : (
        <>
          <Moon size={18} className="side-item-icon" />
          <span className="side-item-label">Dark Mode</span>
        </>
      )}
    </button>
  );
}

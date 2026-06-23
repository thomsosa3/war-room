import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Auto-updater UI (Tauri desktop only).
//
// On launch it checks the signed update feed. If a newer version exists, it
// shows a calm banner; one click downloads + installs it and relaunches — no
// reinstall. In the browser build (Mom's web app) this does nothing: the web
// app updates itself on refresh, so the whole component no-ops outside Tauri.
// ---------------------------------------------------------------------------

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as object);

type Phase = "idle" | "available" | "downloading" | "ready" | "error";

export default function UpdateNotifier() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [version, setVersion] = useState<string>("");
  const [error, setError] = useState<string>("");
  // Keep the resolved Update object around so the button can install it.
  const [update, setUpdate] = useState<{
    version: string;
    downloadAndInstall: (cb?: (e: unknown) => void) => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const result = await check();
        if (!cancelled && result) {
          setUpdate(result as never);
          setVersion(result.version);
          setPhase("available");
        }
      } catch (e) {
        // A failed check (offline, no release yet) shouldn't disrupt the app.
        console.warn("Update check failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async () => {
    if (!update) return;
    try {
      setPhase("downloading");
      await update.downloadAndInstall();
      setPhase("ready");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (phase === "idle") return null;

  return (
    <div className="flex items-center gap-3 border-b border-ember/40 bg-ember/10 px-5 py-2 text-sm">
      <span aria-hidden>⬆️</span>
      {phase === "available" && (
        <>
          <span className="text-ink">
            Update available — <span className="font-medium">v{version}</span>
          </span>
          <button
            onClick={install}
            className="ml-auto rounded-md bg-ember px-3 py-1 text-[13px] font-medium text-ground hover:bg-ember-soft"
          >
            Install &amp; restart
          </button>
        </>
      )}
      {phase === "downloading" && <span className="text-ink-soft">Downloading update…</span>}
      {phase === "ready" && <span className="text-ink-soft">Restarting…</span>}
      {phase === "error" && (
        <span className="text-ember">Update failed: {error}</span>
      )}
    </div>
  );
}

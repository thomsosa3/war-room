import { useEffect } from "react";
import { useStore } from "./store/useStore";
import { isSupabaseConfigured } from "./lib/supabase";
import PassphraseGate from "./components/PassphraseGate";
import UpdateNotifier from "./components/UpdateNotifier";
import Header from "./components/Header";
import PlannerView from "./components/planner/PlannerView";
import MonthView from "./components/MonthView";
import ProjectsView from "./components/ProjectsView";
import TaskPanel from "./components/TaskPanel";
import ProjectPanel from "./components/ProjectPanel";

export default function App() {
  const unlocked = useStore((s) => s.unlocked);
  const loaded = useStore((s) => s.loaded);
  const init = useStore((s) => s.init);
  const view = useStore((s) => s.view);
  const editing = useStore((s) => s.editing);

  useEffect(() => {
    if (unlocked) void init();
  }, [unlocked, init]);

  if (!unlocked) return <PassphraseGate />;

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-ink-soft">
        {isSupabaseConfigured ? "Connecting to the shared workspace…" : "Loading…"}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-ground text-ink">
      <UpdateNotifier />
      <Header />
      <main className="min-h-0 flex-1 overflow-hidden">
        {(view === "day" || view === "week") && <PlannerView />}
        {view === "month" && <MonthView />}
        {view === "projects" && <ProjectsView />}
      </main>

      {editing?.kind === "task" && <TaskPanel />}
      {editing?.kind === "project" && <ProjectPanel />}
    </div>
  );
}

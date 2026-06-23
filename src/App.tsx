import { useEffect } from "react";
import { useStore } from "./store/useStore";
import { isSupabaseConfigured } from "./lib/supabase";
import PassphraseGate from "./components/PassphraseGate";
import UpdateNotifier from "./components/UpdateNotifier";
import Header from "./components/Header";
import WarRoomStatus from "./components/WarRoomStatus";
import DayView from "./components/DayView";
import WeekView from "./components/WeekView";
import MonthView from "./components/MonthView";
import AgendaView from "./components/AgendaView";
import TaskPanel from "./components/TaskPanel";
import FixedEventForm from "./components/FixedEventForm";
import SettingsPanel from "./components/SettingsPanel";

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
      <WarRoomStatus />
      <main className="min-h-0 flex-1 overflow-hidden">
        {view === "day" && <DayView />}
        {view === "week" && <WeekView />}
        {view === "month" && <MonthView />}
        {view === "agenda" && <AgendaView />}
      </main>

      {editing?.kind === "task" && <TaskPanel />}
      {editing?.kind === "event" && <FixedEventForm />}
      {editing?.kind === "settings" && <SettingsPanel />}
    </div>
  );
}

import { useState } from "react";
import { useStore } from "../store/useStore";

/** Single shared passphrase, checked client-side. Shown before anything else. */
export default function PassphraseGate() {
  const unlock = useStore((s) => s.unlock);
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlock(value)) {
      setError(true);
      setValue("");
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-ground">
      <form
        onSubmit={submit}
        className="w-80 rounded-xl border border-ground-line bg-ground-raised p-6 shadow-xl"
      >
        <div className="mb-1 text-lg font-semibold tracking-tight">War Room</div>
        <p className="mb-5 text-sm text-ink-soft">
          Enter the shared passphrase to open the workspace.
        </p>
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="Passphrase"
          className="w-full rounded-lg border border-ground-line bg-ground px-3 py-2 text-sm outline-none focus:border-pine"
        />
        {error && <p className="mt-2 text-sm text-ember">That passphrase didn't match.</p>}
        <button
          type="submit"
          className="mt-4 w-full rounded-lg bg-pine py-2 text-sm font-medium text-white transition hover:bg-pine-soft"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}

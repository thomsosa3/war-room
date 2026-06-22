# War Room

A downloadable desktop app that auto-schedules tasks like **Motion**, shared in
real time between two people (e.g. you and your mom) for your summer tasks.

Each person installs their own copy. You both add tasks and fixed commitments;
the app automatically time-blocks each person's tasks into the open gaps around
their fixed events using Motion's priority rules, and re-plans automatically when
anything changes. No manual dragging.

- **Shell:** Tauri (Rust) → real installers: Windows `.msi`/`.exe`, macOS `.dmg`, Linux `.AppImage`
- **UI:** Vite + React + TypeScript + Tailwind, `date-fns` for time math
- **Sync:** Supabase (free tier) — Postgres + Realtime, the shared source of truth
- **Local state:** zustand
- **Gate:** one shared passphrase checked client-side (no per-user accounts)

> **This setup:** your computer is **Windows**, your mom's is **macOS**. You build
> the Windows installer on Windows; the macOS `.dmg` is built on a Mac by the
> included GitHub Actions workflow (a `.dmg` can only be built on macOS).

If Supabase isn't configured yet, the app still runs in a **local-only** mode
(data in `localStorage`, no cross-computer sync) so you can try the scheduler
immediately. Configure Supabase to sync between the two computers.

---

## 1. Prerequisites

Install these once per machine.

### All platforms
- **Node.js LTS** (v18+; this was built on v20/v24) — <https://nodejs.org>
- **Rust toolchain** (`rustup`) — <https://rustup.rs>

### Windows (your build machine)
- **Microsoft C++ Build Tools** — install "Desktop development with C++" from the
  Visual Studio Installer: <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
- **WebView2 runtime** — preinstalled on Windows 11. (If missing:
  <https://developer.microsoft.com/microsoft-edge/webview2/>)

### macOS (for building the `.dmg` locally, optional — CI does this for you)
- **Xcode Command Line Tools**: `xcode-select --install`

### Linux (only if you want an `.AppImage`)
```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

---

## 2. Supabase setup (the shared data)

1. Create a free project at <https://supabase.com>.
2. Open **SQL Editor** and run the SQL below. It creates the tables and enables
   Realtime so both copies update live.
3. Get your **Project URL** and **anon public key** from
   **Project Settings → API**.

```sql
-- ============================================================
-- War Room schema
-- ============================================================
create extension if not exists "pgcrypto";

-- members ----------------------------------------------------
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  working_hours jsonb not null default '{}'::jsonb
);

-- tasks ------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  estimated_minutes integer not null default 60,
  priority text not null default 'medium'
    check (priority in ('asap','high','medium','low')),
  deadline_type text not null default 'none'
    check (deadline_type in ('hard','soft','none')),
  due_date timestamptz,
  earliest_start timestamptz,
  splittable boolean not null default true,
  min_chunk_minutes integer not null default 30,
  recurrence jsonb,
  assignee_id uuid references members(id) on delete set null,
  status text not null default 'todo' check (status in ('todo','done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- fixed_events ----------------------------------------------
create table if not exists fixed_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  title text not null,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  type text not null default 'other'
    check (type in ('class','work','gym','other')),
  recurrence jsonb
);

-- settings (single row) -------------------------------------
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  planning_horizon_days integer not null default 90,
  default_chunk_minutes integer not null default 30
);

-- ============================================================
-- Realtime: both installed copies get live updates
-- ============================================================
alter publication supabase_realtime add table members;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table fixed_events;
alter publication supabase_realtime add table settings;

-- ============================================================
-- Access (Row Level Security).
--
-- Supabase's current API keys (publishable `sb_publishable_...`) ALWAYS go
-- through RLS, so each table needs RLS enabled with a policy or every write is
-- denied (error 42501). For a private 2-person tool we enable RLS and add one
-- permissive policy granting the shared key full access — "private-by-obscurity"
-- behind the shared passphrase.
--
-- TO HARDEN LATER (if this ever grows into real accounts): replace the
-- `using (true) with check (true)` below with per-user rules.
-- ============================================================
alter table members      enable row level security;
alter table tasks        enable row level security;
alter table fixed_events enable row level security;
alter table settings     enable row level security;

create policy "war_room_all" on members      for all to anon, authenticated using (true) with check (true);
create policy "war_room_all" on tasks        for all to anon, authenticated using (true) with check (true);
create policy "war_room_all" on fixed_events for all to anon, authenticated using (true) with check (true);
create policy "war_room_all" on settings     for all to anon, authenticated using (true) with check (true);
```

The app **seeds the two members and the settings row automatically** on first
launch, so you don't need to insert anything by hand.

---

## 3. Configure the app

Copy `.env.example` to `.env` and fill in your values:

```ini
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
VITE_SHARED_PASSPHRASE=summer2026
```

These are inlined into the app at build time. Both copies **must** use the same
three values to share data and unlock with the same passphrase.

> Security note: the publishable/anon key ships inside the installed app. That's
> acceptable for a private 2-person tool — RLS is on, with a permissive policy.
> See the RLS section in the SQL above to tighten it with per-user rules later.

---

## 4. Develop

```bash
npm install
npm run tauri dev     # opens the desktop window with hot reload
```

Other handy scripts:

```bash
npm run dev           # just the web UI in a browser (no Tauri window)
npm test              # run the scheduler unit tests (Vitest)
```

---

## 5. Build installers

```bash
npm run tauri build
```

Output locations (under `src-tauri/target/release/bundle/`):

| OS      | Files |
| ------- | ----- |
| Windows | `msi/War Room_0.1.0_x64_en-US.msi` and `nsis/War Room_0.1.0_x64-setup.exe` |
| macOS   | `dmg/War Room_0.1.0_aarch64.dmg` (or `universal` if built with `--target universal-apple-darwin`) |
| Linux   | `appimage/war-room_0.1.0_amd64.AppImage` |

> The app icon set lives in `src-tauri/icons/`. To regenerate it from
> `assets/icon.png`, run `npm run tauri icon assets/icon.png`.

### Cross-OS: you can't build a Mac installer on Windows

A Windows installer must be built on Windows and a macOS `.dmg` on macOS. Since
you're on Windows and your mom is on macOS, use the included GitHub Actions
workflow to build **both** on native runners:

1. Push this project to a GitHub repo.
2. Add three **repository secrets** (Settings → Secrets and variables → Actions):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SHARED_PASSPHRASE`.
3. Tag a release: `git tag v0.1.0 && git push origin v0.1.0`
   (or run the workflow manually from the **Actions** tab).
4. The workflow (`.github/workflows/build.yml`) builds on `windows-latest` and
   `macos-latest`, then attaches the `.msi`/`.exe` and `.dmg` to a draft GitHub
   Release and as downloadable artifacts.

---

## 6. Install on your mom's Mac

1. Download the **`.dmg`** from the GitHub Release (built by CI).
2. Send it to her (AirDrop, email, Drive…). She opens it and drags **War Room**
   to **Applications**.
3. Because the app is **unsigned**, macOS Gatekeeper will block the first launch.
   She should **right-click the app → Open → Open** (or System Settings →
   Privacy & Security → "Open Anyway"). This is a one-time step.
4. It opens, asks for the **shared passphrase**, and — once you've both pointed
   at the same Supabase project — **syncs with your copy within a couple seconds**.

On your Windows machine: run the `.msi` (or `-setup.exe`); War Room appears in the
Start menu.

---

## 7. Using it

- **Settings (⚙):** set who this computer belongs to (controls what "My" shows),
  each member's name/color, and **each member's own working hours**. Also the
  planning horizon (default **90 days**).
- **+ Task:** title, estimate, priority (ASAP/High/Med/Low), deadline type
  (hard/soft/none) + due date, earliest start, assignee, chunkable + min chunk,
  optional weekly repeat.
- **+ Fixed event:** classes, work shifts, gym — immovable, per member, optional
  weekly recurrence.
- **Day / Week / Agenda** views; **My / Mom / Both** toggle; prev/next/Today
  navigation that spans months.
- The scheduler runs **per member**, filling only that person's assigned tasks
  into that person's free time, and **re-plans automatically** on any change,
  on launch, on day rollover, or via **↻ Re-plan**.

### How the scheduler orders work (matches Motion)
1. **ASAP** tasks first, into the earliest slots (ignores due date).
2. Then a blend of **deadline** (earlier due first; **hard** deadlines are
   protected, **soft** can slip), **priority** (High > Med > Low), **recurring
   before one-off**, tiebroken by creation time.
3. **earliest_start** is always respected.
4. Long tasks **chunk** across slots (never below the min chunk); non-splittable
   tasks need one slot big enough.
5. A **hard-deadline** task with no room in working hours is placed **outside
   hours** (flagged ⚡) to hit the deadline.
6. Anything that can't fully fit before its due date is placed where it can and
   flagged **At risk**, surfaced days/weeks/months ahead.

The engine is a pure, deterministic function in
[`src/scheduler/schedule.ts`](src/scheduler/schedule.ts) with unit tests in
[`schedule.test.ts`](src/scheduler/schedule.test.ts) (`npm test`).

---

## 8. (Optional, later) Auto-updates

To ship new versions without re-sending an installer, add the Tauri updater:
the `@tauri-apps/plugin-updater` plugin + an `updater` block in
`tauri.conf.json` pointing at a static `latest.json` (e.g. on GitHub Releases),
and sign builds with a generated updater key. Not required for v1. See
<https://v2.tauri.app/plugin/updater/>.

---

## Project layout

```
src/
  scheduler/schedule.ts      # the Motion-style engine (pure + tested)
  lib/                       # types, supabase client, db layer, defaults, ui helpers
  store/                     # zustand store + schedule selectors
  components/                # views (Day/Week/Agenda), editors, header, status line
src-tauri/                   # Rust shell, tauri.conf.json, icons
.github/workflows/build.yml  # builds Windows + macOS installers
```

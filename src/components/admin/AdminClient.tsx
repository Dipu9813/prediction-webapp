"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Plus, Trash2, Shield, Users, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Match, Profile, MatchStatus } from "@/lib/database.types";

export default function AdminClient() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<"matches" | "users">("matches");
  const [matches, setMatches] = useState<Match[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadMatches = useCallback(async () => {
    const { data } = await supabase.from("matches").select("*").order("kickoff_time");
    if (data) setMatches(data);
  }, [supabase]);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    if (data) setUsers(data);
  }, [supabase]);

  useEffect(() => {
    loadMatches();
    loadUsers();
  }, [loadMatches, loadUsers]);

  async function recalc() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("recalculate_all");
    setBusy(false);
    setMsg(error ? `Recalculation failed: ${error.message}` : "Points recalculated.");
    loadUsers();
  }

  async function syncMatches() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/sync", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(`Sync failed: ${data.error ?? res.statusText}`);
      return;
    }
    setMsg(data.message ?? `Synced ${data.synced} real matches from football-data.org.`);
    loadMatches();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <Shield className="h-6 w-6 text-gold" /> Admin panel
        </h1>
        <div className="flex gap-2">
          <button onClick={syncMatches} disabled={busy} className="btn-primary">
            <Download className="h-4 w-4" /> Sync real matches
          </button>
          <button onClick={recalc} disabled={busy} className="btn-ghost">
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Recalculate points
          </button>
        </div>
      </div>
      {msg && <p className="text-sm text-brand">{msg}</p>}

      <div className="flex gap-2">
        <button onClick={() => setTab("matches")} className={tab === "matches" ? "btn-gold" : "btn-ghost"}>
          Matches
        </button>
        <button onClick={() => setTab("users")} className={tab === "users" ? "btn-gold" : "btn-ghost"}>
          <Users className="h-4 w-4" /> Users
        </button>
      </div>

      {tab === "matches" ? (
        <MatchesTab matches={matches} reload={loadMatches} />
      ) : (
        <UsersTab users={users} reload={loadUsers} />
      )}
    </div>
  );
}

function MatchesTab({ matches, reload }: { matches: Match[]; reload: () => void }) {
  return (
    <div className="space-y-6">
      <AddMatchForm onAdded={reload} />
      <div className="space-y-3">
        {matches.map((m) => (
          <MatchRow key={m.id} match={m} reload={reload} />
        ))}
        {matches.length === 0 && (
          <div className="card p-6 text-center text-slate-400">No matches yet.</div>
        )}
      </div>
    </div>
  );
}

function AddMatchForm({ onAdded }: { onAdded: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState({
    home_team: "",
    away_team: "",
    home_flag: "",
    away_flag: "",
    stadium: "",
    kickoff_time: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await supabase.from("matches").insert({
      home_team: f.home_team,
      away_team: f.away_team,
      home_flag: f.home_flag || null,
      away_flag: f.away_flag || null,
      stadium: f.stadium || null,
      kickoff_time: new Date(f.kickoff_time).toISOString(),
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setF({ home_team: "", away_team: "", home_flag: "", away_flag: "", stadium: "", kickoff_time: "" });
    onAdded();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Plus className="h-4 w-4" /> Add match
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input required placeholder="Home team" value={f.home_team} onChange={set("home_team")} className="input" />
        <input required placeholder="Away team" value={f.away_team} onChange={set("away_team")} className="input" />
        <input placeholder="Home flag (ISO e.g. br)" value={f.home_flag} onChange={set("home_flag")} className="input" />
        <input placeholder="Away flag (ISO e.g. ar)" value={f.away_flag} onChange={set("away_flag")} className="input" />
        <input placeholder="Stadium" value={f.stadium} onChange={set("stadium")} className="input" />
        <input required type="datetime-local" value={f.kickoff_time} onChange={set("kickoff_time")} className="input" />
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Adding…" : "Add match"}
      </button>
    </form>
  );
}

function MatchRow({ match, reload }: { match: Match; reload: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const [home, setHome] = useState(match.home_score?.toString() ?? "");
  const [away, setAway] = useState(match.away_score?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    // Updating status/scores fires the DB scoring trigger automatically.
    await supabase
      .from("matches")
      .update({
        status,
        home_score: home === "" ? null : Number(home),
        away_score: away === "" ? null : Number(away),
      })
      .eq("id", match.id);
    setBusy(false);
    reload();
  }

  async function remove() {
    if (!confirm(`Delete ${match.home_team} vs ${match.away_team}? This removes all predictions.`))
      return;
    await supabase.from("matches").delete().eq("id", match.id);
    reload();
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-[180px] flex-1">
        <div className="font-semibold">
          {match.home_team} <span className="text-slate-500">vs</span> {match.away_team}
        </div>
        <div className="text-xs text-slate-500">
          {new Date(match.kickoff_time).toLocaleString()} · {match.prediction_count} predictions
        </div>
      </div>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as MatchStatus)}
        className="input w-32"
      >
        <option value="UPCOMING">Upcoming</option>
        <option value="LIVE">Live</option>
        <option value="FINISHED">Finished</option>
      </select>

      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          placeholder="–"
          value={home}
          onChange={(e) => setHome(e.target.value)}
          className="input w-14 text-center"
        />
        <span className="text-slate-500">:</span>
        <input
          type="number"
          min={0}
          placeholder="–"
          value={away}
          onChange={(e) => setAway(e.target.value)}
          className="input w-14 text-center"
        />
      </div>

      <button onClick={save} disabled={busy} className="btn-primary">
        {busy ? "Saving…" : "Save"}
      </button>
      <button onClick={remove} className="btn-ghost text-red-400" title="Delete match">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function UsersTab({ users, reload }: { users: Profile[]; reload: () => void }) {
  const supabase = useMemo(() => createClient(), []);

  async function toggleRole(u: Profile) {
    await supabase
      .from("profiles")
      .update({ role: u.role === "ADMIN" ? "USER" : "ADMIN" })
      .eq("id", u.id);
    reload();
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-left text-xs uppercase text-slate-400">
          <tr>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3 text-right">Points</th>
            <th className="px-4 py-3 text-right">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-white/5">
              <td className="px-4 py-3">
                <div className="font-medium">{u.username}</div>
                <div className="text-xs text-slate-500">{u.name}</div>
              </td>
              <td className="px-4 py-3 text-slate-400">{u.email}</td>
              <td className="px-4 py-3 text-right font-bold text-gold">{u.points}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => toggleRole(u)} className={u.role === "ADMIN" ? "btn-gold" : "btn-ghost"}>
                  {u.role}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

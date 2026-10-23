"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Player = {
  id: string;
  name: string;
  mobile: string | null;
  is_active: boolean;
  photo_url: string | null;
};

const BUCKET = "player-photos";
const ADMIN_EMAIL = "kashifanisahmedbaksh3@gmail.com";

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("id,name,mobile,is_active,photo_url")
      .order("name");
    if (error) {
      alert(error.message);
      return;
    }
    setPlayers((data || []) as Player[]);
  }

  useEffect(() => {
    void loadPlayers();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(user?.email?.toLowerCase() === ADMIN_EMAIL);
    });
  }, []);

  async function addPlayer() {
    if (!isAdmin || !name.trim()) return;
    setLoading(true);
    const { error } = await supabase.from("players").insert({
      name: name.trim(),
      mobile: mobile.trim() || null,
      is_active: true,
    });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    setName("");
    setMobile("");
    await loadPlayers();
  }

  async function deletePlayer(id: string) {
    if (!isAdmin || !window.confirm("Delete this player? This may affect existing sessions.")) return;
    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadPlayers();
  }

  async function uploadPhoto(player: Player, file?: File) {
    if (!isAdmin || !file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Please choose a photo smaller than 5 MB.");
      return;
    }
    setUploadingId(player.id);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const allowed = ["jpg", "jpeg", "png", "webp"];
      if (!allowed.includes(extension)) throw new Error("Use a JPG, PNG or WebP photo.");
      const path = `${player.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("players")
        .update({ photo_url: publicData.publicUrl })
        .eq("id", player.id);
      if (updateError) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw updateError;
      }
      await loadPlayers();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Photo upload failed.");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="text-sm text-slate-400">← Back to Dashboard</a>
        <h1 className="mt-4 text-4xl font-bold">👥 Players</h1>
        <p className="mt-2 text-slate-300">Master player list. Upload a photo once to reuse it for future captain posters.</p>

        {isAdmin && (
          <section className="mt-8 rounded-2xl bg-slate-900 p-6">
            <h2 className="text-2xl font-semibold">Add Player</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <input className="rounded-xl border border-slate-700 bg-slate-800 p-3" placeholder="Player name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="rounded-xl border border-slate-700 bg-slate-800 p-3" placeholder="Mobile optional" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              <button onClick={addPlayer} disabled={loading} className="rounded-xl bg-green-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">{loading ? "Adding..." : "Add Player"}</button>
            </div>
          </section>
        )}

        <section className="mt-8 rounded-2xl bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Player List</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-700 text-slate-300"><th className="py-3">Photo</th><th className="py-3">Name</th><th className="py-3">Mobile</th><th className="py-3">Status</th><th className="py-3">Action</th></tr></thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.id} className="border-b border-slate-800">
                    <td className="py-3">
                      {player.photo_url ? <img src={player.photo_url} alt={player.name} className="h-16 w-16 rounded-xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-700 text-2xl">👤</div>}
                    </td>
                    <td className="py-3 font-medium">{player.name}</td>
                    <td className="py-3">{player.mobile || "-"}</td>
                    <td className="py-3">{player.is_active ? "Active" : "Inactive"}</td>
                    <td className="py-3">
                      {isAdmin && <div className="flex flex-wrap items-center gap-3">
                        <label className="cursor-pointer rounded-lg border border-green-400 px-3 py-2 text-green-300">
                          {uploadingId === player.id ? "Uploading..." : player.photo_url ? "Change Photo" : "Upload Photo"}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingId !== null} onChange={(e) => { const file = e.target.files?.[0]; void uploadPhoto(player, file); e.target.value = ""; }} />
                        </label>
                        <button onClick={() => deletePlayer(player.id)} className="rounded-lg border border-red-400 px-3 py-2 text-red-300">Delete</button>
                      </div>}
                    </td>
                  </tr>
                ))}
                {players.length === 0 && <tr><td colSpan={5} className="py-6 text-slate-400">No players added yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

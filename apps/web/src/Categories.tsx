import { useEffect, useState } from "react";
import { api } from "./api";
import type { Category } from "./types";

export function Categories() {
  const [cats, setCats] = useState<Category[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api.categories().then((c) => { setCats(c); setNames({}); });
  useEffect(() => { load().catch((e) => setMsg({ ok: false, text: e.message })); }, []);

  async function rename(c: Category) {
    try {
      await api.renameCategory(c.id, names[c.id]);
      setMsg({ ok: true, text: "Перейменовано" });
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  async function merge() {
    const from = cats.find((c) => c.id === fromId);
    const to = cats.find((c) => c.id === toId);
    if (!from || !to) return;
    if (!confirm(`Перенести всі позиції з «${from.name}» у «${to.name}» і видалити «${from.name}»?`)) return;
    try {
      const r = await api.mergeCategories(fromId, toId);
      setMsg({ ok: true, text: `Перенесено позицій: ${r.moved}` });
      setFromId(""); setToId("");
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  return (
    <>
      <div className="card">
        <b>Злити дві категорії</b>
        <div className="filters" style={{ marginTop: 10, marginBottom: 0 }}>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">Що злити (буде видалено)…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c._count?.items ?? 0})</option>)}
          </select>
          <span style={{ alignSelf: "center" }}>→</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Куди перенести…</option>
            {cats.filter((c) => c.id !== fromId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="primary" disabled={!fromId || !toId} onClick={merge}>Злити</button>
        </div>
      </div>

      {msg && <div className={msg.ok ? "ok" : "err"} style={{ marginBottom: 12 }}>{msg.text}</div>}

      <div className="card">
        {cats.map((c) => (
          <div className="cat-row" key={c.id}>
            <input style={{ flex: 1 }} value={names[c.id] ?? c.name}
              onChange={(e) => setNames({ ...names, [c.id]: e.target.value })} />
            <span className="count">{c._count?.items ?? 0}</span>
            <button className="ghost" disabled={names[c.id] === undefined || names[c.id] === c.name}
              onClick={() => rename(c)}>Зберегти</button>
          </div>
        ))}
      </div>
    </>
  );
}

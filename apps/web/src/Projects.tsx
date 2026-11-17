import { useEffect, useState } from "react";
import { api } from "./api";
import {
  PROJECT_STATUS_LABELS, STATUS_LABELS,
  type AvailableItem, type Client, type Project, type ProjectStatus,
} from "./types";

const d10 = (s: string) => s.slice(0, 10);
const money = (n: number) => `$${n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Projects() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return selectedId
    ? <ProjectView id={selectedId} onBack={() => setSelectedId(null)} />
    : <ProjectList onOpen={setSelectedId} />;
}

function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ name: "", clientId: "", newClientName: "", startsAt: today, endsAt: today, location: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    api.projects().then(setList).catch((e) => setMsg({ ok: false, text: e.message }));
    api.clients().then(setClients).catch(() => undefined);
  };
  useEffect(load, []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function create() {
    try {
      const p = await api.createProject(f);
      onOpen(p.id);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  return (
    <>
      <div className="card">
        <b>Новий проєкт (оренда)</b>
        <div className="filters" style={{ marginTop: 10, marginBottom: 0 }}>
          <input placeholder="Назва проєкту *" value={f.name} onChange={set("name")} />
          <select value={f.clientId} onChange={set("clientId")}>
            <option value="">— контрагент —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!f.clientId && <input placeholder="або новий контрагент" value={f.newClientName} onChange={set("newClientName")} />}
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>з <input type="date" value={f.startsAt} onChange={set("startsAt")} /></label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>по <input type="date" value={f.endsAt} onChange={set("endsAt")} /></label>
          <input placeholder="Місце" value={f.location} onChange={set("location")} />
          <button className="primary" disabled={!f.name.trim()} onClick={create}>Створити</button>
        </div>
        {msg && <div className={msg.ok ? "ok" : "err"}>{msg.text}</div>}
      </div>

      <table>
        <thead>
          <tr><th>№</th><th>Проєкт</th><th>Контрагент</th><th>Дати</th><th>Статус</th>
            <th className="num">Позицій</th><th className="num">Сума</th></tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id} onClick={() => onOpen(p.id)}>
              <td>{p.number}</td><td>{p.name}</td><td>{p.client?.name ?? ""}</td>
              <td>{d10(p.startsAt)} — {d10(p.endsAt)}</td>
              <td>{PROJECT_STATUS_LABELS[p.status]}</td>
              <td className="num">{p.lines.length}</td><td className="num">{money(p.total)}</td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={7}>Проєктів ще немає</td></tr>}
        </tbody>
      </table>
    </>
  );
}

function ProjectView({ id, onBack }: { id: string; onBack: () => void }) {
  const [p, setP] = useState<Project | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<AvailableItem[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dates, setDates] = useState({ startsAt: "", endsAt: "" });

  const fail = (e: unknown) => setMsg({ ok: false, text: (e as Error).message });
  const apply = (np: Project) => { setP(np); setDates({ startsAt: d10(np.startsAt), endsAt: d10(np.endsAt) }); };

  useEffect(() => { api.project(id).then(apply).catch(fail); }, [id]);

  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const t = setTimeout(() => { api.available(id, q.trim()).then(setFound).catch(fail); }, 250);
    return () => clearTimeout(t);
  }, [q, id, p?.lines.length, p?.startsAt, p?.endsAt]);

  if (!p) return <div>{msg ? <div className="err">{msg.text}</div> : "Завантаження…"}</div>;
  const closed = p.status === "COMPLETED" || p.status === "CANCELLED";

  const run = async (fn: () => Promise<Project>, ok?: string) => {
    try { apply(await fn()); setMsg(ok ? { ok: true, text: ok } : null); } catch (e) { fail(e); }
  };

  return (
    <>
      <button className="ghost" onClick={onBack}>← До проєктів</button>
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px" }}>{p.number} · {p.name}</h2>
        <div style={{ color: "#64748b" }}>
          Контрагент: {p.client?.name ?? "—"}{p.location ? ` · ${p.location}` : ""}
        </div>
        <div className="filters" style={{ marginTop: 12, marginBottom: 0 }}>
          <select value={p.status} onChange={(e) => run(() => api.updateProject(id, { status: e.target.value }))}>
            {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>з
            <input type="date" value={dates.startsAt} disabled={closed}
              onChange={(e) => setDates({ ...dates, startsAt: e.target.value })}
              onBlur={() => dates.startsAt !== d10(p.startsAt) && run(() => api.updateProject(id, dates))} />
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>по
            <input type="date" value={dates.endsAt} disabled={closed}
              onChange={(e) => setDates({ ...dates, endsAt: e.target.value })}
              onBlur={() => dates.endsAt !== d10(p.endsAt) && run(() => api.updateProject(id, dates))} />
          </label>
          <span style={{ alignSelf: "center", color: "#64748b" }}>{p.days} діб</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="primary" disabled={closed || p.lines.length === 0}
              onClick={async () => {
                try {
                  const r = await api.issue(id); apply(r.project);
                  setMsg({ ok: true, text: `Видано позицій: ${r.issued}${r.skipped ? `, пропущено: ${r.skipped} (недоступні)` : ""}` });
                } catch (e) { fail(e); }
              }}>Видати все</button>
            <button className="ghost" disabled={closed || !p.lines.some((l) => l.itemStatus === "ISSUED")}
              onClick={async () => {
                try {
                  const r = await api.returnAll(id); apply(r.project);
                  setMsg({ ok: true, text: `Повернуто позицій: ${r.returned}. Проєкт завершено.` });
                } catch (e) { fail(e); }
              }}>Прийняти повернення</button>
          </span>
        </div>
        {msg && <div className={msg.ok ? "ok" : "err"}>{msg.text}</div>}
      </div>

      <table>
        <thead>
          <tr><th>Код</th><th>Назва</th><th>S/N</th><th>Стан</th>
            <th className="num">$/доба</th><th className="num">Знижка %</th><th className="num">Сума</th><th /></tr>
        </thead>
        <tbody>
          {p.lines.map((l) => (
            <tr key={l.id} style={{ cursor: "default" }}>
              <td>{l.code}</td><td>{l.name}</td>
              <td>{l.serialNumber?.split("\n")[0] ?? ""}</td>
              <td>{l.itemStatus ? STATUS_LABELS[l.itemStatus] : ""}</td>
              <td className="num">
                <input type="number" min="0" step="0.01" defaultValue={l.unitPrice} style={{ width: 80 }} disabled={closed}
                  onBlur={(e) => Number(e.target.value) !== l.unitPrice && run(() => api.updateLine(id, l.id, { unitPrice: e.target.value }))} />
              </td>
              <td className="num">
                <input type="number" min="0" max="100" step="1" defaultValue={l.discount} style={{ width: 60 }} disabled={closed}
                  onBlur={(e) => Number(e.target.value) !== l.discount && run(() => api.updateLine(id, l.id, { discount: e.target.value }))} />
              </td>
              <td className="num">{money(l.amount)}</td>
              <td><button className="ghost" disabled={closed} onClick={() => run(() => api.removeLine(id, l.id))}>✕</button></td>
            </tr>
          ))}
          {p.lines.length === 0 && <tr><td colSpan={8}>Обладнання ще не додано. Знайдіть його нижче.</td></tr>}
          {p.lines.length > 0 && (
            <tr style={{ cursor: "default", fontWeight: 600 }}>
              <td colSpan={6} className="num">Разом за {p.days} діб:</td>
              <td className="num">{money(p.total)}</td><td />
            </tr>
          )}
        </tbody>
      </table>

      {!closed && (
        <div className="card" style={{ marginTop: 16 }}>
          <b>Додати обладнання</b>
          <div className="filters" style={{ marginTop: 10 }}>
            <input type="search" style={{ minWidth: 360 }} placeholder="Пошук: код, назва, S/N…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {found.map((i) => (
            <div className="cat-row" key={i.id}>
              <span style={{ width: 90 }}>{i.code}</span>
              <span style={{ flex: 1 }}>{i.name}{i.serialNumber ? ` · ${i.serialNumber.split("\n")[0]}` : ""}</span>
              <span style={{ width: 110, color: "#64748b" }}>{STATUS_LABELS[i.status]}</span>
              <span style={{ width: 80 }} className="num">{i.rentalPrice !== null ? `$${i.rentalPrice}` : "—"}</span>
              {i.busyWith && i.busyWith !== "У ремонті"
                ? <span className="err" style={{ margin: 0, width: 280 }}>зайнято: {i.busyWith}</span>
                : <span style={{ width: 280 }} />}
              <button className="ghost" disabled={!!i.busyWith} onClick={() => run(() => api.addLine(id, i.id))}>Додати</button>
            </div>
          ))}
          {q.trim() && found.length === 0 && <div style={{ color: "#64748b" }}>Нічого не знайдено</div>}
        </div>
      )}
    </>
  );
}

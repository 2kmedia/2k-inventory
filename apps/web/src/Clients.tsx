import { useEffect, useState } from "react";
import { api } from "./api";
import type { Client } from "./types";

export function Clients() {
  const [list, setList] = useState<Client[]>([]);
  const [f, setF] = useState({ name: "", type: "", contact: "", phone: "", email: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api.clients().then(setList).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { load(); }, []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function create() {
    try {
      await api.createClient(f);
      setF({ name: "", type: "", contact: "", phone: "", email: "" });
      setMsg({ ok: true, text: "Контрагента додано" });
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }

  return (
    <>
      <div className="card">
        <b>Новий контрагент</b>
        <div className="filters" style={{ marginTop: 10, marginBottom: 0 }}>
          <input placeholder="Назва *" value={f.name} onChange={set("name")} />
          <input placeholder="Тип (агенція, ФОП…)" value={f.type} onChange={set("type")} />
          <input placeholder="Контактна особа" value={f.contact} onChange={set("contact")} />
          <input placeholder="Телефон" value={f.phone} onChange={set("phone")} />
          <input placeholder="Email" value={f.email} onChange={set("email")} />
          <button className="primary" disabled={!f.name.trim()} onClick={create}>Додати</button>
        </div>
        {msg && <div className={msg.ok ? "ok" : "err"}>{msg.text}</div>}
      </div>
      <table>
        <thead><tr><th>Назва</th><th>Тип</th><th>Контакт</th><th>Телефон</th><th>Email</th><th className="num">Проєктів</th></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} style={{ cursor: "default" }}>
              <td>{c.name}</td><td>{c.type}</td><td>{c.contact}</td><td>{c.phone}</td><td>{c.email}</td>
              <td className="num">{c._count?.projects ?? 0}</td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={6}>Поки немає контрагентів</td></tr>}
        </tbody>
      </table>
    </>
  );
}

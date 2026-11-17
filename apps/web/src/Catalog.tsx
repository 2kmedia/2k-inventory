import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { STATUS_LABELS, type Category, type Item, type ItemStatus, type ItemsPage } from "./types";

const PAGE_SIZE = 50;

export function Catalog() {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [noCode, setNoCode] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ItemsPage | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.categories().then(setCats).catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
    if (q.trim()) params.q = q.trim();
    if (categoryId) params.categoryId = categoryId;
    if (status) params.status = status;
    if (noCode) params.noCode = "1";
    api.items(params).then((d) => { setData(d); setError(""); }).catch((e) => setError(e.message));
  }, [q, categoryId, status, noCode, page]);

  useEffect(() => {
    const t = setTimeout(load, 250); // невелика затримка при введенні в пошук
    return () => clearTimeout(t);
  }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Пошук: код, назва, S/N, опис…" value={q}
          onChange={(e) => resetPage(setQ)(e.target.value)} />
        <select value={categoryId} onChange={(e) => resetPage(setCategoryId)(e.target.value)}>
          <option value="">Усі категорії</option>
          <option value="none">Без категорії</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c._count?.items ?? 0})</option>
          ))}
        </select>
        <select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)}>
          <option value="">Усі статуси</option>
          {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={noCode} onChange={(e) => resetPage(setNoCode)(e.target.checked)} />
          Лише без коду
        </label>
      </div>

      {error && <div className="err">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Код</th><th>Назва</th><th>S/N</th><th>Категорія</th><th>Статус</th>
            <th className="num">Оренда $/доба</th><th className="num">Вартість $</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((it) => (
            <tr key={it.id} onClick={() => setSelected(it)}>
              <td className={it.code.startsWith("NC-") ? "tmp" : ""}>{it.code}</td>
              <td>{it.name}{it.spec ? <span style={{ color: "#64748b" }}> {it.spec}</span> : null}</td>
              <td style={{ whiteSpace: "pre-line" }}>{it.serialNumber?.split("\n")[0] ?? ""}</td>
              <td>{it.category?.name ?? ""}</td>
              <td>{STATUS_LABELS[it.status]}</td>
              <td className="num">{it.rentalPrice ?? ""}</td>
              <td className="num">{it.purchaseUsd ?? ""}</td>
            </tr>
          ))}
          {data && data.items.length === 0 && (
            <tr><td colSpan={7}>Нічого не знайдено</td></tr>
          )}
        </tbody>
      </table>

      <div className="pager">
        <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Назад</button>
        <span>Сторінка {page} з {pages}{data ? `, усього ${data.total}` : ""}</span>
        <button className="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Далі →</button>
      </div>

      {selected && (
        <ItemDrawer
          item={selected}
          cats={cats}
          onClose={() => setSelected(null)}
          onSaved={() => { load(); api.categories().then(setCats); }}
        />
      )}
    </>
  );
}

function ItemDrawer({ item, cats, onClose, onSaved }: {
  item: Item; cats: Category[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: item.name,
    serialNumber: item.serialNumber ?? "",
    spec: item.spec ?? "",
    categoryId: item.categoryId ?? "",
    locationNote: item.locationNote ?? "",
    license: item.license ?? "",
    invoiceNumber: item.invoiceNumber ?? "",
    purchaseDate: item.purchaseDate?.slice(0, 10) ?? "",
    warrantyUntil: item.warrantyUntil?.slice(0, 10) ?? "",
    purchaseUsd: item.purchaseUsd ?? "",
    rentalPrice: item.rentalPrice ?? "",
    status: item.status as string,
    notes: item.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api.updateItem(item.id, f);
      setMsg({ ok: true, text: "Збережено" });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer-bg" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h2>{item.name}</h2>
        <div style={{ color: "#64748b", fontSize: 13 }}>Код: {item.code}</div>

        <label className="field">Назва<input value={f.name} onChange={set("name")} /></label>
        <label className="field">Серійний номер<textarea rows={2} value={f.serialNumber} onChange={set("serialNumber")} /></label>
        <label className="field">Специфікація<input value={f.spec} onChange={set("spec")} /></label>
        <div className="row2">
          <label className="field">Категорія
            <select value={f.categoryId} onChange={set("categoryId")}>
              <option value="">— без категорії —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">Статус
            <select value={f.status} onChange={set("status")}>
              {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">Місце / кейс<input value={f.locationNote} onChange={set("locationNote")} /></label>
        <div className="row2">
          <label className="field">Вартість, $<input type="number" min="0" step="0.01" value={f.purchaseUsd} onChange={set("purchaseUsd")} /></label>
          <label className="field">Оренда, $/доба<input type="number" min="0" step="0.01" value={f.rentalPrice} onChange={set("rentalPrice")} /></label>
        </div>
        <div className="row2">
          <label className="field">Дата купівлі<input type="date" value={f.purchaseDate} onChange={set("purchaseDate")} /></label>
          <label className="field">Гарантія до<input type="date" value={f.warrantyUntil} onChange={set("warrantyUntil")} /></label>
        </div>
        <div className="row2">
          <label className="field">Рахунок №<input value={f.invoiceNumber} onChange={set("invoiceNumber")} /></label>
          <label className="field">Ліцензія<input value={f.license} onChange={set("license")} /></label>
        </div>
        <label className="field">Нотатки<textarea rows={3} value={f.notes} onChange={set("notes")} /></label>

        <div className="actions">
          <button className="primary" disabled={busy} onClick={save}>Зберегти</button>
          <button className="ghost" onClick={onClose}>Закрити</button>
        </div>
        {msg && <div className={msg.ok ? "ok" : "err"}>{msg.text}</div>}
      </div>
    </div>
  );
}

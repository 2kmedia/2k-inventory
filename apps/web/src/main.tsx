import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Catalog } from "./Catalog";
import { Categories } from "./Categories";
import { Clients } from "./Clients";
import { Projects } from "./Projects";
import "./styles.css";

function App() {
  const [tab, setTab] = useState<"catalog" | "categories" | "projects" | "clients">("catalog");
  return (
    <>
      <header>
        <h1>2K Inventory</h1>
        <button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}>Каталог</button>
        <button className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>Проєкти</button>
        <button className={tab === "clients" ? "active" : ""} onClick={() => setTab("clients")}>Контрагенти</button>
        <button className={tab === "categories" ? "active" : ""} onClick={() => setTab("categories")}>Категорії</button>
      </header>
      <main>
        {tab === "catalog" && <Catalog />}
        {tab === "projects" && <Projects />}
        {tab === "clients" && <Clients />}
        {tab === "categories" && <Categories />}
      </main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

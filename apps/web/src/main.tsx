import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [status, setStatus] = useState("перевірка...");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("API недоступний"));
  }, []);
  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>2K Inventory</h1>
      <p>Статус API: {status}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

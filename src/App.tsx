import React from "react";
import EpsPoolCalculator from "./components/EpsPoolCalculator";

export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <header style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>EPS Pool Calculator</h1>
        <div style={{ fontSize: 12, color: "#6b7280" }}>v2.1 — scopes, presets, turnkey tile, install readout</div>
      </header>
      <main style={{ padding: 16 }}>
        <EpsPoolCalculator />
      </main>
    </div>
  );
}

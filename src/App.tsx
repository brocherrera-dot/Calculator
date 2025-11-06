cat > src/App.tsx <<'TSX'
import React from "react";
import EpsPoolCalculator from "./components/EpsPoolCalculator";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="px-6 py-4 border-b bg-white">
        <h1 className="text-xl font-semibold">EPS Pool Calculator</h1>
        <p className="text-sm text-gray-500">
          v2.1 — scopes, presets, turnkey tile, install readout
        </p>
      </header>

      <main className="p-4 md:p-6">
        <EpsPoolCalculator />
      </main>
    </div>
  );
}
TSX

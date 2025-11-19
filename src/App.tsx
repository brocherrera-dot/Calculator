import React from "react";
import EpsPoolCalculator from "./components/EpsPoolCalculator";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="px-6 py-4 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
        <h1 className="text-xl font-semibold dark:text-gray-100">EPS Pool Calculator</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          v2.1 — scopes, presets, turnkey tile, install readout
        </p>
      </header>

      <main className="p-4 md:p-6">
        <EpsPoolCalculator />
      </main>
    </div>
  );
}

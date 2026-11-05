import { useState } from "react"

export default function App() {
  const [activeTab, setActiveTab] = useState<"query" | "upload" | "databases">("query")

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center shadow-sm">
              DP
            </div>
            <div>
              <span className="font-semibold text-lg tracking-tight">DataPilot AI</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-medium">
                Text2SQL
              </span>
            </div>
          </div>

          <nav className="flex space-x-1">
            <button
              onClick={() => setActiveTab("query")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === "query"
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Query
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === "upload"
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Upload Data
            </button>
            <button
              onClick={() => setActiveTab("databases")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === "databases"
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Databases
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight mb-2">Welcome to DataPilot AI</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Turn plain English questions into accurate SQL queries and tabular answers using Dual RAG.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-semibold text-sm mb-1 text-slate-800 dark:text-slate-200">1. Upload Datasets</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Support for CSV, TSV, multi-sheet Excel (.xlsx), JSON, Parquet, and SQLite database files.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-semibold text-sm mb-1 text-slate-800 dark:text-slate-200">2. Ask in Plain English</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Powered by ChromaDB Dual RAG and your choice of Google Gemini, Claude, or OpenAI.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-semibold text-sm mb-1 text-slate-800 dark:text-slate-200">3. Structured Data Results</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Interactive tables with columns, sorting, pagination, and SQL inspection.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  FileCode2,
  FolderTree,
  GitBranch,
  Info,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minimize2,
  Moon,
  PanelBottomClose,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Sun,
  Table2,
  Terminal,
  Trash2,
  Upload,
  User,
  X,
  Zap,
} from 'lucide-react'

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')

interface ColumnInfo {
  name: string
  data_type: string
  is_primary_key?: boolean
  is_nullable?: boolean
}

interface TableSummary {
  name: string
  row_count?: number
  columns?: ColumnInfo[]
  sample_rows?: Record<string, any>[]
}

interface DatabaseItem {
  db_id: string
  name: string
  source: string
  tables?: TableSummary[]
  file_size_bytes?: number
}

interface QueryResult {
  columns: string[]
  rows: any[][]
  latency: number
  success: boolean
  rowCount?: number
  error?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  sql?: string
  error?: boolean
}

const defaultStarterSql = `-- Welcome to DataPilot AI (VS Code SQL Studio)
-- Press Ctrl+Enter or click 'Run Query' to execute

SELECT
  p.name,
  SUM(oi.quantity) AS total_quantity
FROM products p
JOIN order_items oi
  ON p.product_id = oi.product_id
GROUP BY p.product_id, p.name
ORDER BY total_quantity DESC
LIMIT 5;`

const sampleRows = [
  [1, 'Laptop', 'High-performance laptop', 999.99, 50],
  [2, 'Smartphone', 'Latest model smartphone', 699.99, 100],
  [6, 'Camera', 'Digital SLR camera', 599.99, 30],
  [7, 'Gaming Console', 'Next-gen gaming console', 499.99, 40],
  [4, 'Tablet', '10-inch tablet', 299.99, 60],
  [3, 'Headphones', 'Noise-cancelling headphones', 199.99, 75],
]

const fallbackTables: TableSummary[] = [
  {
    name: 'order_items',
    row_count: 120,
    columns: [
      { name: 'order_item_id', data_type: 'integer' },
      { name: 'order_id', data_type: 'integer' },
      { name: 'product_id', data_type: 'integer' },
      { name: 'quantity', data_type: 'integer' },
      { name: 'price_per_unit', data_type: 'numeric' },
    ],
  },
  {
    name: 'orders',
    row_count: 50,
    columns: [
      { name: 'order_id', data_type: 'integer' },
      { name: 'user_id', data_type: 'integer' },
      { name: 'order_date', data_type: 'date' },
      { name: 'total_amount', data_type: 'numeric' },
    ],
  },
  {
    name: 'products',
    row_count: 35,
    columns: [
      { name: 'product_id', data_type: 'integer' },
      { name: 'name', data_type: 'text' },
      { name: 'description', data_type: 'text' },
      { name: 'price', data_type: 'numeric' },
      { name: 'stock_quantity', data_type: 'integer' },
    ],
  },
  {
    name: 'users',
    row_count: 25,
    columns: [
      { name: 'user_id', data_type: 'integer' },
      { name: 'username', data_type: 'text' },
      { name: 'email', data_type: 'text' },
      { name: 'created_at', data_type: 'timestamp' },
    ],
  },
]

function highlightSql(sql: string) {
  return sql
    .split(
      /(\b(?:SELECT|FROM|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|FULL JOIN|CROSS JOIN|ON|WHERE|AND|OR|NOT|IN|EXISTS|GROUP BY|HAVING|ORDER BY|ASC|DESC|LIMIT|OFFSET|UNION|ALL|AS|DISTINCT|CASE|WHEN|THEN|ELSE|END|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|VIEW)\b|\b(?:COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|NULLIF|LENGTH|LOWER|UPPER|SUBSTR|TRIM|CAST)\b|'[^']*'|"[^"]*"|`[^`]*`|\b\d+(?:\.\d+)?\b|--[^\n]*)/gi
    )
    .map((part, i) => {
      if (/^--/.test(part)) return <span key={i} className="syntax-comment">{part}</span>
      if (/^'/.test(part)) return <span key={i} className="syntax-string">{part}</span>
      if (/^["`]/.test(part)) return <span key={i} className="syntax-variable">{part}</span>
      if (/^\d/.test(part)) return <span key={i} className="syntax-number">{part}</span>
      if (
        /^(COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|NULLIF|LENGTH|LOWER|UPPER|SUBSTR|TRIM|CAST)$/i.test(part)
      ) {
        return <span key={i} className="syntax-function">{part}</span>
      }
      if (
        /^(SELECT|FROM|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|FULL JOIN|CROSS JOIN|ON|WHERE|AND|OR|NOT|IN|EXISTS|GROUP BY|HAVING|ORDER BY|ASC|DESC|LIMIT|OFFSET|UNION|ALL|AS|DISTINCT|CASE|WHEN|THEN|ELSE|END|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|VIEW)$/i.test(
          part
        )
      ) {
        return <span key={i} className="syntax-keyword">{part}</span>
      }
      return <span key={i}>{part}</span>
    })
}

export default function Page() {
  const [dark, setDark] = useState(true)
  const [activeActivity, setActiveActivity] = useState<'explorer' | 'search' | 'upload' | 'copilot'>('explorer')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [panelTab, setPanelTab] = useState<'results' | 'output' | 'problems'>('results')
  const [panelMaximized, setPanelMaximized] = useState(false)

  // Editor tabs
  const [tabs, setTabs] = useState<Array<{ id: string; title: string; sql: string }>>([
    { id: '1', title: 'query.sql', sql: defaultStarterSql },
  ])
  const [activeTabId, setActiveTabId] = useState('1')

  const currentTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  }, [tabs, activeTabId])

  const sql = currentTab?.sql ?? ''

  function updateSql(newSql: string) {
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, sql: newSql } : t))
    )
  }

  // Cursor tracking for status bar
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })

  // Backend state
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [dbId, setDbId] = useState('sales_demo')
  const [expanded, setExpanded] = useState<string[]>(['order_items'])
  const [searchQuery, setSearchQuery] = useState('')
  const [running, setRunning] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [copied, setCopied] = useState(false)
  const [apiConnected, setApiConnected] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // Layout resizing
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [panelHeight, setPanelHeight] = useState(240)
  const [copilotWidth, setCopilotWidth] = useState(340)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingPanel, setIsResizingPanel] = useState(false)
  const [isResizingCopilot, setIsResizingCopilot] = useState(false)

  const [result, setResult] = useState<QueryResult>({
    columns: ['product_id', 'name', 'description', 'price', 'stock_quantity'],
    rows: sampleRows,
    latency: 3.42,
    rowCount: 6,
    success: true,
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur))
    }, 4000)
  }, [])

  // Load databases
  const fetchDatabases = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/databases`)
      if (!res.ok) throw new Error('API offline')
      const data = await res.json()
      const list: DatabaseItem[] = data.databases ?? []
      setDatabases(list)
      setApiConnected(true)
      if (list.length > 0 && !list.some((d) => d.db_id === dbId)) {
        setDbId(list[0].db_id)
      }
    } catch {
      setApiConnected(false)
    }
  }, [dbId])

  useEffect(() => {
    fetchDatabases()
    const timer = setInterval(() => {
      fetch(`${API_BASE}/health`)
        .then((r) => setApiConnected(r.ok))
        .catch(() => setApiConnected(false))
    }, 12000)
    return () => clearInterval(timer)
  }, [fetchDatabases])

  const activeDb = useMemo(() => {
    return databases.find((d) => d.db_id === dbId)
  }, [databases, dbId])

  const availableTables = useMemo(() => {
    if (activeDb?.tables && activeDb.tables.length > 0) {
      return activeDb.tables
    }
    return fallbackTables
  }, [activeDb])

  // Filtered tables by search query
  const filteredTables = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return availableTables
    return availableTables.filter((t) => {
      const matchName = t.name.toLowerCase().includes(q)
      const matchCol = t.columns?.some((c) => c.name.toLowerCase().includes(q))
      return matchName || matchCol
    })
  }, [availableTables, searchQuery])

  useEffect(() => {
    if (searchQuery.trim()) {
      setExpanded(filteredTables.map((t) => t.name))
    }
  }, [searchQuery, filteredTables])

  // Resize handling
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (isResizingSidebar) {
        setSidebarWidth(Math.min(500, Math.max(180, e.clientX - 48)))
      }
      if (isResizingPanel) {
        const newH = window.innerHeight - e.clientY - 22
        setPanelHeight(Math.min(600, Math.max(120, newH)))
      }
      if (isResizingCopilot) {
        setCopilotWidth(Math.min(550, Math.max(240, window.innerWidth - e.clientX)))
      }
    }
    function handleMouseUp() {
      setIsResizingSidebar(false)
      setIsResizingPanel(false)
      setIsResizingCopilot(false)
    }
    if (isResizingSidebar || isResizingPanel || isResizingCopilot) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingSidebar, isResizingPanel, isResizingCopilot])

  // Direct SQL execution
  const executeDirectSql = useCallback(
    async (sqlToRun = sql) => {
      if (!sqlToRun.trim()) return
      setRunning(true)
      setPanelOpen(true)
      setPanelTab('results')
      const start = performance.now()
      try {
        const response = await fetch(`${API_BASE}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: sqlToRun, db_id: dbId, max_rows: 300 }),
        })
        const data = await response.json()
        if (!response.ok || !data.success) {
          setResult({
            columns: [],
            rows: [],
            latency: data?.latency_ms ?? performance.now() - start,
            rowCount: 0,
            success: false,
            error: data?.error ?? data?.detail ?? 'Failed to execute query.',
          })
        } else {
          setResult({
            columns: data.column_names ?? [],
            rows: data.rows ?? [],
            latency: data.latency_ms ?? performance.now() - start,
            rowCount: data.row_count ?? data.rows?.length ?? 0,
            success: true,
          })
        }
      } catch (err) {
        setResult({
          columns: [],
          rows: [],
          latency: performance.now() - start,
          rowCount: 0,
          success: false,
          error: err instanceof Error ? err.message : 'Backend connection error.',
        })
      } finally {
        setRunning(false)
      }
    },
    [sql, dbId]
  )

  function runCurrentQuery() {
    executeDirectSql(sql)
  }

  function previewTable(tableName: string) {
    const q = `SELECT * FROM "${tableName}" LIMIT 50;`
    updateSql(q)
    executeDirectSql(q)
  }

  function insertColumn(colName: string) {
    updateSql(`${sql.trimEnd()} "${colName}"`)
    showToast(`Inserted "${colName}" into editor.`)
  }

  // File upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    showToast(`Uploading ${file.name}...`)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.detail ?? data.message ?? 'Upload failed')
      }
      showToast(`Ingested ${data.tables?.length ?? 1} table(s) into '${data.db_id}'.`, 'success')
      await fetchDatabases()
      setDbId(data.db_id)
      if (data.tables && data.tables.length > 0) {
        const first = data.tables[0].name
        const q = `SELECT * FROM "${first}" LIMIT 50;`
        updateSql(q)
        executeDirectSql(q)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteCurrentDb() {
    if (!activeDb || activeDb.source !== 'uploaded') return
    if (!window.confirm(`Delete database "${activeDb.name || activeDb.db_id}"?`)) return
    try {
      const res = await fetch(`${API_BASE}/databases/${activeDb.db_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Deletion failed')
      showToast(`Deleted '${activeDb.db_id}'.`)
      await fetchDatabases()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete', 'error')
    }
  }

  // Copilot text2sql query
  async function generateSql(prompt = question) {
    if (prompt.trim().length < 3) return
    const userMsg: ChatMessage = { id: String(Date.now()), role: 'user', text: prompt }
    setMessages((prev) => [...prev, userMsg])
    setGenerating(true)
    setQuestion('')

    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt, db_id: dbId, top_k_schema: 5, top_k_examples: 3 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Query generation failed')

      const generated = data.generated_sql ?? ''
      const answer = data.answer ?? 'Here is your SQL query:'
      const aiMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        text: answer,
        sql: generated,
      }
      setMessages((prev) => [...prev, aiMsg])

      if (generated) {
        updateSql(generated)
      }
      if (data.rows && data.column_names) {
        setResult({
          columns: data.column_names,
          rows: data.rows,
          latency: data.execution_metadata?.latency_ms ?? 0,
          rowCount: data.rows.length,
          success: data.execution_metadata?.success ?? true,
          error: data.execution_metadata?.error,
        })
        setPanelOpen(true)
        setPanelTab('results')
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Failed to generate query.',
          error: true,
        },
      ])
    } finally {
      setGenerating(false)
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  function exportCsv() {
    if (!result.columns.length || !result.rows.length) return
    const header = result.columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
    const rowsStr = result.rows
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const csvContent = `data:text/csv;charset=utf-8,${encodeURIComponent(`${header}\n${rowsStr}`)}`
    const link = document.createElement('a')
    link.href = csvContent
    link.download = `${dbId}_results.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Exported CSV.')
  }

  async function copySql() {
    await navigator.clipboard?.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  function addNewTab() {
    const newId = String(Date.now())
    const title = `query_${tabs.length + 1}.sql`
    const firstTable = availableTables[0]?.name ?? 'table'
    const newTab = {
      id: newId,
      title,
      sql: `-- ${title}\nSELECT * FROM "${firstTable}" LIMIT 25;`,
    }
    setTabs([...tabs, newTab])
    setActiveTabId(newId)
  }

  function closeTab(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (tabs.length === 1) return
    const nextTabs = tabs.filter((t) => t.id !== id)
    setTabs(nextTabs)
    if (activeTabId === id) {
      setActiveTabId(nextTabs[0].id)
    }
  }

  function handleCursorPosition(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    const textBefore = el.value.substring(0, el.selectionStart)
    const lines = textBefore.split('\n')
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    })
  }

  const suggestions = useMemo(() => {
    const tableNames = availableTables.map((t) => t.name)
    if (tableNames.length > 0) {
      const first = tableNames[0]
      return [
        `Show top 10 records from "${first}"`,
        `Count total records in "${first}"`,
        tableNames.length > 1
          ? `Show summary joining "${first}" and "${tableNames[1]}"`
          : `Show distinct values in "${first}"`,
      ]
    }
    return [
      'Show top 5 products by quantity ordered',
      'How many orders per user?',
      'Count total rows across tables',
    ]
  }, [availableTables])

  return (
    <div className={`vscode-shell ${dark ? 'dark' : 'light'}`}>
      {/* Toast Notification */}
      {toast && (
        <div className={`vsc-notification ${toast.type}`}>
          <Info size={15} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".csv,.tsv,.xlsx,.xls,.json,.parquet,.db,.sqlite,.sqlite3"
        onChange={handleFileUpload}
      />

      {/* 1. VS Code Title Bar */}
      <header className="vscode-titlebar">
        <div className="vscode-titlebar-left">
          <div className="vscode-logo">
            <Database size={15} />
            <span>DataPilot AI</span>
          </div>
          <div className="vscode-menu-bar">
            <button className="vscode-menu-item">File</button>
            <button className="vscode-menu-item">Edit</button>
            <button className="vscode-menu-item">View</button>
            <button className="vscode-menu-item" onClick={runCurrentQuery}>Run</button>
            <button className="vscode-menu-item" onClick={() => setPanelOpen(!panelOpen)}>Terminal</button>
            <button className="vscode-menu-item" onClick={() => setCopilotOpen(!copilotOpen)}>Copilot</button>
          </div>
        </div>

        <div className="vscode-titlebar-center">
          <span>{dbId}</span>
          <span>—</span>
          <span>{currentTab.title}</span>
          <span>—</span>
          <span>DataPilot AI SQL Studio</span>
        </div>

        <div className="vscode-titlebar-right">
          <button
            className="vscode-title-btn"
            title="Toggle theme"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="vscode-title-btn"
            title="Toggle Sidebar (Ctrl+B)"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            className="vscode-title-btn"
            title="Toggle Copilot Panel"
            onClick={() => setCopilotOpen(!copilotOpen)}
          >
            <Sparkles size={14} />
          </button>
        </div>
      </header>

      {/* 2. Main Workspace Body */}
      <div className="vscode-body">
        {/* Activity Bar (Far Left) */}
        <aside className="vscode-activitybar">
          <div className="activitybar-top">
            <button
              className={`activitybar-item ${activeActivity === 'explorer' && sidebarOpen ? 'active' : ''}`}
              title="Database Explorer"
              onClick={() => {
                if (activeActivity === 'explorer') setSidebarOpen(!sidebarOpen)
                else {
                  setActiveActivity('explorer')
                  setSidebarOpen(true)
                }
              }}
            >
              <FolderTree size={20} />
            </button>
            <button
              className={`activitybar-item ${activeActivity === 'search' && sidebarOpen ? 'active' : ''}`}
              title="Search Tables & Schemas"
              onClick={() => {
                if (activeActivity === 'search') setSidebarOpen(!sidebarOpen)
                else {
                  setActiveActivity('search')
                  setSidebarOpen(true)
                }
              }}
            >
              <Search size={20} />
            </button>
            <button
              className={`activitybar-item ${activeActivity === 'upload' ? 'active' : ''}`}
              title="Ingest Data Table File (.csv, .xlsx, .sqlite)"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 size={20} className="spin" /> : <Upload size={20} />}
            </button>
            <button
              className={`activitybar-item ${copilotOpen ? 'active' : ''}`}
              title="AI Assistant Copilot"
              onClick={() => setCopilotOpen(!copilotOpen)}
            >
              <Sparkles size={20} />
              <span className="activitybar-badge">AI</span>
            </button>
          </div>

          <div className="activitybar-bottom">
            <button
              className="activitybar-item"
              title="Toggle Theme"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button className="activitybar-item" title="Settings">
              <Settings2 size={19} />
            </button>
            <button className="activitybar-item" title="Accounts">
              <User size={19} />
            </button>
          </div>
        </aside>

        {/* Primary Sidebar (Explorer) */}
        {sidebarOpen && (
          <aside className="vscode-sidebar" style={{ width: sidebarWidth }}>
            <div className="sidebar-header">
              <span>{activeActivity === 'search' ? 'SEARCH' : 'EXPLORER: DATABASES'}</span>
              <div className="sidebar-actions">
                <button
                  className="sidebar-action-btn"
                  title="New Query File"
                  onClick={addNewTab}
                >
                  <Plus size={14} />
                </button>
                <button
                  className="sidebar-action-btn"
                  title="Ingest File"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                </button>
                <button
                  className="sidebar-action-btn"
                  title="Refresh Databases"
                  onClick={fetchDatabases}
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>

            <div className="sidebar-scroll-area">
              {/* Section 1: Database Selector */}
              <div className="sidebar-section-title">
                <ChevronDown size={14} />
                <span>ACTIVE DATABASE</span>
              </div>
              <div className="sidebar-section-content">
                <div className="vsc-db-dropdown">
                  <Database size={14} style={{ flexShrink: 0, color: '#4ec9b0' }} />
                  <select
                    value={dbId}
                    onChange={(e) => {
                      const newId = e.target.value
                      setDbId(newId)
                      const chosen = databases.find((d) => d.db_id === newId)
                      if (chosen?.tables && chosen.tables.length > 0) {
                        setExpanded([chosen.tables[0].name])
                        updateSql(`SELECT * FROM "${chosen.tables[0].name}" LIMIT 50;`)
                      }
                    }}
                  >
                    {databases.length === 0 && <option value="sales_demo">sales_demo (demo)</option>}
                    {databases.map((db) => (
                      <option key={db.db_id} value={db.db_id}>
                        {db.name ?? db.db_id} ({db.source})
                      </option>
                    ))}
                  </select>
                  {activeDb?.source === 'uploaded' && (
                    <button
                      type="button"
                      title="Delete uploaded database"
                      onClick={deleteCurrentDb}
                      style={{ border: 0, background: 'transparent', color: '#f14c4c', cursor: 'pointer' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  <ChevronDown size={13} style={{ flexShrink: 0, pointerEvents: 'none' }} />
                </div>

                <div className="vsc-search-input">
                  <Search size={13} style={{ flexShrink: 0, color: 'var(--vsc-text-muted)' }} />
                  <input
                    placeholder="Filter tables or columns..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Section 2: Tables & Schema Tree */}
              <div className="sidebar-section-title">
                <ChevronDown size={14} />
                <span>TABLES & SCHEMA ({filteredTables.length})</span>
              </div>
              <div className="vsc-tree" style={{ padding: '4px 6px' }}>
                {filteredTables.map((table) => {
                  const name = table.name
                  const cols = table.columns ?? []
                  const isOpen = expanded.includes(name)
                  return (
                    <div key={name}>
                      <button
                        className="vsc-tree-node"
                        onClick={() =>
                          setExpanded(isOpen ? expanded.filter((x) => x !== name) : [...expanded, name])
                        }
                      >
                        {isOpen ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />}
                        <Table2 size={14} style={{ flexShrink: 0, color: '#3584e4' }} />
                        <span className="vsc-node-label" title={name}>{name}</span>
                        <span className="vsc-node-badge">{table.row_count ?? ''}</span>
                        <span
                          className="vsc-node-action"
                          title="Run SELECT query on table"
                          onClick={(e) => {
                            e.stopPropagation()
                            previewTable(name)
                          }}
                        >
                          <Play size={10} fill="currentColor" />
                        </span>
                      </button>
                      {isOpen && (
                        <div className="vsc-tree-children">
                          {cols.map((col) => (
                            <div
                              key={col.name}
                              className="vsc-column-leaf"
                              onClick={() => insertColumn(col.name)}
                              title="Click to insert column into SQL query"
                            >
                              <span style={{ fontSize: '9px', color: '#858585' }}>◈</span>
                              <span className="vsc-node-label">{col.name}</span>
                              <span className="vsc-col-type">{col.data_type}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Section 3: Database Metadata */}
              <div className="sidebar-section-title">
                <ChevronDown size={14} />
                <span>DATASET INFO</span>
              </div>
              <div className="sidebar-section-content" style={{ fontSize: '11px', color: 'var(--vsc-text-muted)', lineHeight: 1.6 }}>
                <div>• Source: <strong style={{ color: 'var(--vsc-text)' }}>{activeDb?.source ?? 'demo'}</strong></div>
                <div>• Tables: <strong style={{ color: 'var(--vsc-text)' }}>{availableTables.length}</strong></div>
                <div>• Format: <strong style={{ color: 'var(--vsc-text)' }}>SQLite Relational</strong></div>
                <div>• Mode: <strong style={{ color: '#4ec9b0' }}>Read-only (Safe)</strong></div>
              </div>
            </div>
          </aside>
        )}

        {/* Sidebar Resizer Handle */}
        {sidebarOpen && (
          <div
            className={`resizer-col ${isResizingSidebar ? 'active' : ''}`}
            onMouseDown={() => setIsResizingSidebar(true)}
          />
        )}

        {/* 3. Center Editor Area */}
        <main className="vscode-editor-group">
          {/* Tabs Bar */}
          <div className="vsc-tabs-bar">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`vsc-tab ${tab.id === activeTabId ? 'active' : ''}`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <FileCode2 size={14} style={{ color: '#e5a50a' }} />
                <span>{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    className="vsc-tab-close"
                    title="Close Tab"
                    onClick={(e) => closeTab(tab.id, e)}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            <div className="vsc-tab-add" onClick={addNewTab} title="New SQL Query (Ctrl+N)">
              <Plus size={14} />
            </div>

            <div className="vsc-tabs-actions">
              <button
                className="vsc-run-action"
                onClick={runCurrentQuery}
                disabled={running}
                title="Execute Query (Ctrl+Enter)"
              >
                {running ? <Loader2 size={13} className="spin" /> : <Play size={13} fill="currentColor" />}
                <span>{running ? 'Running...' : 'Run Query'}</span>
                <span style={{ opacity: 0.7, fontSize: '10px' }}>Ctrl+↵</span>
              </button>
              <button
                className="vscode-title-btn"
                title="Copy SQL"
                onClick={copySql}
              >
                {copied ? <Check size={14} style={{ color: '#4ec9b0' }} /> : <Copy size={14} />}
              </button>
              <button
                className="vscode-title-btn"
                title="Ask AI Copilot"
                onClick={() => setCopilotOpen(!copilotOpen)}
              >
                <Sparkles size={14} style={{ color: '#4ec9b0' }} />
              </button>
            </div>
          </div>

          {/* Breadcrumb Bar */}
          <div className="vsc-breadcrumb">
            <span className="vsc-breadcrumb-part">
              <Database size={12} style={{ color: '#4ec9b0' }} />
              <span>{dbId}</span>
            </span>
            <span>&gt;</span>
            <span className="vsc-breadcrumb-part">
              <Table2 size={12} style={{ color: '#3584e4' }} />
              <span>{availableTables[0]?.name ?? 'tables'}</span>
            </span>
            <span>&gt;</span>
            <span className="vsc-breadcrumb-part" style={{ color: 'var(--vsc-text)' }}>
              <FileCode2 size={12} style={{ color: '#e5a50a' }} />
              <span>{currentTab.title}</span>
            </span>
          </div>

          {/* Code Editor Surface */}
          <div className="vsc-editor-surface">
            {/* Line numbers gutter */}
            <div className="vsc-gutter">
              {sql.split('\n').map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>

            {/* Editor textarea + syntax highlighter pre */}
            <div
              className="vsc-editor-content"
              onWheel={(e) => {
                const ta = textareaRef.current
                if (ta) {
                  ta.scrollTop += e.deltaY
                  ta.scrollLeft += e.deltaX
                }
              }}
            >
              <textarea
                ref={textareaRef}
                value={sql}
                onChange={(e) => updateSql(e.target.value)}
                onSelect={handleCursorPosition}
                onKeyUp={handleCursorPosition}
                onClick={handleCursorPosition}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault()
                    runCurrentQuery()
                  }
                }}
                spellCheck={false}
                aria-label="SQL Editor"
              />
              <pre aria-hidden="true">{highlightSql(sql)}</pre>
            </div>
          </div>

          {/* Bottom Panel Resizer */}
          {panelOpen && !panelMaximized && (
            <div
              className={`resizer-row ${isResizingPanel ? 'active' : ''}`}
              onMouseDown={() => setIsResizingPanel(true)}
            />
          )}

          {/* 4. Integrated Bottom Panel (Results / Output Dock) */}
          {panelOpen && (
            <section
              className="vscode-bottom-panel"
              style={{ height: panelMaximized ? 'calc(100% - 60px)' : panelHeight }}
            >
              <div className="panel-tab-bar">
                <div className="panel-tabs-left">
                  <button
                    className={`panel-tab-btn ${panelTab === 'results' ? 'active' : ''}`}
                    onClick={() => setPanelTab('results')}
                  >
                    QUERY RESULTS {result.rows.length > 0 && `(${result.rows.length})`}
                  </button>
                  <button
                    className={`panel-tab-btn ${panelTab === 'output' ? 'active' : ''}`}
                    onClick={() => setPanelTab('output')}
                  >
                    OUTPUT
                  </button>
                  <button
                    className={`panel-tab-btn ${panelTab === 'problems' ? 'active' : ''}`}
                    onClick={() => setPanelTab('problems')}
                  >
                    PROBLEMS {result.error ? '(1)' : '(0)'}
                  </button>
                </div>

                <div className="panel-tabs-right">
                  <span>
                    <Zap size={12} style={{ display: 'inline', marginRight: 4, color: '#4ec9b0' }} />
                    {result.latency.toFixed(2)} ms
                  </span>
                  {result.rows.length > 0 && (
                    <button
                      className="vscode-title-btn"
                      onClick={exportCsv}
                      title="Export CSV"
                      style={{ fontSize: '11px', display: 'flex', gap: 4 }}
                    >
                      <Download size={13} /> Export CSV
                    </button>
                  )}
                  <button
                    className="vscode-title-btn"
                    title={panelMaximized ? 'Restore Panel Size' : 'Maximize Panel'}
                    onClick={() => setPanelMaximized(!panelMaximized)}
                  >
                    {panelMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  </button>
                  <button
                    className="vscode-title-btn"
                    title="Close Panel"
                    onClick={() => setPanelOpen(false)}
                  >
                    <PanelBottomClose size={13} />
                  </button>
                </div>
              </div>

              <div className="panel-content">
                {panelTab === 'results' && (
                  running ? (
                    <div className="panel-empty">
                      <div className="thinking-header" style={{ fontSize: '13px', marginBottom: 4 }}>
                        <Zap size={16} className="thinking-sparkle" />
                        <span>Executing query on database...</span>
                      </div>
                      <div className="typing-dots">
                        <span className="dot dot-1" />
                        <span className="dot dot-2" />
                        <span className="dot dot-3" />
                      </div>
                    </div>
                  ) : result.error ? (
                    <div className="panel-empty" style={{ color: '#f14c4c' }}>
                      <X size={24} />
                      <strong>SQL Execution Error</strong>
                      <p>{result.error}</p>
                    </div>
                  ) : result.rows.length > 0 ? (
                    <div className="panel-table-wrap">
                      <table className="vsc-table">
                        <thead>
                          <tr>
                            <th className="vsc-row-index">#</th>
                            {result.columns.map((col, idx) => (
                              <th key={`${col}-${idx}`}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.map((row, rIdx) => (
                            <tr key={rIdx}>
                              <td className="vsc-row-index">{rIdx + 1}</td>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx}>{cell !== null && cell !== undefined ? String(cell) : '—'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="panel-empty">
                      <Table2 size={24} />
                      <strong>No rows returned</strong>
                      <p>Run a query above to see data results in this panel.</p>
                    </div>
                  )
                )}

                {panelTab === 'output' && (
                  <div style={{ padding: '12px', font: '12px/1.6 Consolas, monospace', color: '#cccccc' }}>
                    <div>[Execution Engine] SQLite 3 with read-only AST safety validation</div>
                    <div>[Target Database] {dbId} ({activeDb?.source ?? 'spider'})</div>
                    <div>[Status] {result.success ? 'COMPLETED (200 OK)' : 'FAILED'}</div>
                    <div>[Latency] {result.latency.toFixed(2)} ms</div>
                    <div>[Rows Returned] {result.rows.length} row(s)</div>
                    <div style={{ marginTop: '8px', color: '#858585' }}>-- Executed Statement:</div>
                    <div style={{ color: '#4ec9b0' }}>{sql}</div>
                  </div>
                )}

                {panelTab === 'problems' && (
                  <div style={{ padding: '12px', font: '12px Consolas, monospace' }}>
                    {result.error ? (
                      <div style={{ color: '#f14c4c', display: 'flex', gap: 6, alignItems: 'center' }}>
                        <X size={14} />
                        <span>[SQL Error] {result.error}</span>
                      </div>
                    ) : (
                      <div style={{ color: '#858585' }}>No problems have been detected in the workspace.</div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>

        {/* Copilot Resizer */}
        {copilotOpen && (
          <div
            className={`resizer-col ${isResizingCopilot ? 'active' : ''}`}
            onMouseDown={() => setIsResizingCopilot(true)}
          />
        )}

        {/* 5. VS Code Copilot Secondary Panel */}
        {copilotOpen && (
          <aside className="vscode-copilot-panel" style={{ width: copilotWidth }}>
            <div className="copilot-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={14} style={{ color: '#4ec9b0' }} />
                <span>GITHUB COPILOT / DATAPILOT CHAT</span>
              </div>
              <button
                className="vscode-title-btn"
                title="Close Copilot"
                onClick={() => setCopilotOpen(false)}
              >
                <X size={14} />
              </button>
            </div>

            <div className="copilot-messages">
              {messages.length === 0 ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#4ec9b0' }}>
                    <Sparkles size={18} />
                    <strong>Hi, I&apos;m DataPilot Copilot!</strong>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--vsc-text-muted)', lineHeight: 1.5, marginBottom: 14 }}>
                    Ask plain-English questions about your tables, and I will write, validate, and execute accurate SQL queries.
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--vsc-text-muted)', marginBottom: 8, fontWeight: 600 }}>
                    Suggestions for {dbId}:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        className="copilot-btn secondary"
                        style={{ textAlign: 'left', padding: '6px 8px', fontSize: '11px' }}
                        onClick={() => generateSql(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`copilot-msg ${m.role === 'user' ? 'copilot-msg-user' : 'copilot-msg-ai'}`}
                  >
                    <div>{m.text}</div>
                    {m.sql && (
                      <>
                        <div className="copilot-codeblock">{m.sql}</div>
                        <div className="copilot-actions">
                          <button
                            className="copilot-btn"
                            onClick={() => {
                              if (m.sql) {
                                updateSql(m.sql)
                                executeDirectSql(m.sql)
                              }
                            }}
                          >
                            <Play size={10} fill="currentColor" /> Run in Editor
                          </button>
                          <button
                            className="copilot-btn secondary"
                            onClick={() => {
                              if (m.sql) updateSql(m.sql)
                            }}
                          >
                            Insert SQL
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
              {generating && (
                <div className="copilot-msg copilot-msg-ai copilot-thinking">
                  <div className="thinking-header">
                    <Sparkles size={13} className="thinking-sparkle" />
                    <span>DataPilot is thinking...</span>
                  </div>
                  <div className="typing-dots">
                    <span className="dot dot-1" />
                    <span className="dot dot-2" />
                    <span className="dot dot-3" />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            <form
              className="copilot-input-box"
              onSubmit={(e) => {
                e.preventDefault()
                generateSql()
              }}
            >
              <div className="copilot-input-wrap">
                <textarea
                  className="copilot-textarea"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      generateSql()
                    }
                  }}
                  placeholder="Ask Copilot a question about your database..."
                  rows={2}
                />
                <button
                  type="submit"
                  className="copilot-send-btn"
                  disabled={generating || question.trim().length < 3}
                  title="Send message"
                >
                  {generating ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                </button>
              </div>
            </form>
          </aside>
        )}
      </div>

      {/* 6. VS Code Status Bar (Bottom Strip) */}
      <footer className="vscode-statusbar">
        <div className="statusbar-left">
          <div className="statusbar-item" title="Git Repository Branch">
            <GitBranch size={12} />
            <span>main*</span>
          </div>
          <div className="statusbar-item" title="Diagnostics">
            <span>0 ⨂</span>
            <span>0 ⚠</span>
          </div>
          <div className="statusbar-item" title="Active SQLite Database">
            <Database size={11} />
            <span>{dbId} ({activeDb?.source ?? 'demo'})</span>
          </div>
          <div className="statusbar-item" title="Tables loaded">
            <Table2 size={11} />
            <span>{availableTables.length} tables</span>
          </div>
        </div>

        <div className="statusbar-right">
          <div className="statusbar-item">
            <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          </div>
          <div className="statusbar-item">
            <span>Spaces: 2</span>
          </div>
          <div className="statusbar-item">
            <span>UTF-8</span>
          </div>
          <div className="statusbar-item">
            <span>SQL</span>
          </div>
          <div className="statusbar-item" title="Backend Server Status">
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: apiConnected ? '#4ec9b0' : '#f14c4c',
                boxShadow: apiConnected ? '0 0 6px #4ec9b0' : 'none',
              }}
            />
            <span>{apiConnected ? 'API: 8000' : 'API: Offline'}</span>
          </div>
          <div
            className="statusbar-item"
            title="Toggle Copilot"
            onClick={() => setCopilotOpen(!copilotOpen)}
            style={{ fontWeight: 600 }}
          >
            {generating ? (
              <>
                <Sparkles size={12} className="thinking-sparkle" />
                <span>Thinking</span>
                <span className="typing-dots-mini">
                  <span className="dot dot-1" />
                  <span className="dot dot-2" />
                  <span className="dot dot-3" />
                </span>
              </>
            ) : running ? (
              <>
                <Zap size={12} className="thinking-sparkle" />
                <span>Executing SQL</span>
                <span className="typing-dots-mini">
                  <span className="dot dot-1" />
                  <span className="dot dot-2" />
                  <span className="dot dot-3" />
                </span>
              </>
            ) : (
              <>
                <Sparkles size={12} />
                <span>DataPilot AI</span>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}

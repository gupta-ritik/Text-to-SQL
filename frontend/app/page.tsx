/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Activity, Database, Send, Sparkles, Table2, Clock3, RotateCcw, Upload, FileText, RefreshCw, History, Download, Copy, Play, Trash2, BarChart3, ShieldCheck } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function authHeaders(json = false): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("google-id-token") : null;
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const examples = [
  "Show the top 5 customers by revenue.",
  "What is the total revenue?",
  "Show revenue by country.",
  "Which products generated the most sales?",
  "Show customers from India who spent more than 50000."
];

type HistoryItem = {
  question: string;
  answer: string;
  sql: string;
  timestamp: number;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  picture?: string;
};

function ResultChart({ data }: { data: any }) {
  const columns = data?.columns || [];
  const rows = data?.rows || [];
  if (!columns.length || !rows.length) return null;

  const numericIndex = columns.findIndex((_: string, index: number) =>
    rows.some((row: any[]) => row[index] !== null && row[index] !== "" && Number.isFinite(Number(row[index])))
  );
  if (numericIndex < 0) return null;

  const labelIndex = numericIndex === 0 && columns.length > 1 ? 1 : 0;
  const values = rows.map((row: any[]) => Number(row[numericIndex]) || 0);
  const maximum = Math.max(...values.map((value: number) => Math.abs(value)), 1);

  return (
    <div className="chart-wrap">
      <div className="chart-bars">
        {rows.slice(0, 12).map((row: any[], index: number) => {
          const value = values[index];
          const label = String(row[labelIndex] ?? `Row ${index + 1}`);
          return (
            <div className="chart-row" key={`${label}-${index}`}>
              <span className="chart-label" title={label}>{label}</span>
              <div className="chart-track"><div className="chart-bar" style={{ width: `${Math.max((Math.abs(value) / maximum) * 100, 2)}%` }} /></div>
              <span className="chart-value">{value.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
      <div className="chart-caption"><BarChart3 size={14} /> {columns[numericIndex]} by {columns[labelIndex]}</div>
    </div>
  );
}

export default function Home() {
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sqlDraft, setSqlDraft] = useState("");

  async function completeGoogleSignIn(credential: string) {
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch(`${API}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Google sign-in failed");
      localStorage.setItem("google-id-token", credential);
      setAuthUser(data.user);
    } catch (err: any) {
      setAuthError(err.message || "Google sign-in failed");
    } finally {
      setAuthLoading(false);
    }
  }

  function signOut() {
    localStorage.removeItem("google-id-token");
    setAuthUser(null);
  }

  async function loadDatasets() {
    try {
      const res = await fetch(`${API}/api/datasets`, { headers: authHeaders() });
      const data = await res.json();
      setDatasets(data.datasets || []);
      const selected = await fetch(`${API}/api/datasets/selected`, { headers: authHeaders() });
      const selectedData = await selected.json();
      setSelectedDataset(selectedData.selected_dataset || "");
    } catch {}
  }

  async function selectDataset(name: string) {
    if (!name) return;
    setError("");
    setSelectedDataset(name);
    try {
      const res = await fetch(`${API}/api/datasets/select`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not select dataset");
      setIndexing(true);
      void monitorIndex();
    } catch (err: any) {
      setError(err.message || "Dataset selection failed");
    }
  }

  async function monitorIndex() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const res = await fetch(`${API}/api/datasets/index-status`, { headers: authHeaders() });
        const data = await res.json();
        if (data.status === "ready") {
          setIndexing(false);
          return;
        }
        if (data.status === "error") {
          setIndexing(false);
          setError(data.error || "Dataset indexing failed");
          return;
        }
      } catch {
        setIndexing(false);
        setError("Could not check dataset indexing status. Please refresh and try again.");
        return;
      }
    }
    setIndexing(false);
    setError("Dataset indexing is taking longer than expected.");
  }

  async function uploadDataset(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/api/datasets/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: form
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      await loadDatasets();
      await selectDataset(data.dataset.name);
    } catch (err: any) {
      setError(err.message || "Dataset upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const reqQuestion = question.trim();
    if (!reqQuestion) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/query`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ question: reqQuestion })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed");
      setResult(data);
      setSqlDraft(data.sql || "");
      setHistory(previous => {
        const next = [
          { question: reqQuestion, answer: data.answer || "", sql: data.sql || "", timestamp: Date.now() },
          ...previous.filter(item => item.question !== reqQuestion),
        ].slice(0, 6);
        localStorage.setItem("text-sql-history", JSON.stringify(next));
        return next;
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function runEditedSql() {
    if (!sqlDraft.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/sql/execute`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ sql: sqlDraft })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "SQL execution failed");
      setResult((previous: any) => ({
        ...(previous || {}),
        sql: sqlDraft,
        data: data.data,
        answer: "Edited SQL executed successfully.",
        execution_time: data.data.execution_time,
      }));
    } catch (err: any) {
      setError(err.message || "SQL execution failed");
    } finally {
      setLoading(false);
    }
  }

  async function copySql() {
    if (sqlDraft) await navigator.clipboard.writeText(sqlDraft);
  }

  function rerunQuestion(item: HistoryItem) {
    setQuestion(item.question);
    setSqlDraft(item.sql || "");
    setError("");
  }

  function removeHistory(timestamp: number) {
    setHistory(previous => {
      const next = previous.filter(item => item.timestamp !== timestamp);
      localStorage.setItem("text-sql-history", JSON.stringify(next));
      return next;
    });
  }

  function clearHistory() {
    localStorage.removeItem("text-sql-history");
    setHistory([]);
  }

  useEffect(() => {
    const savedCredential = localStorage.getItem("google-id-token");
    if (savedCredential) {
      void completeGoogleSignIn(savedCredential);
    } else {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser) {
      loadDatasets();
    }
  }, [authUser]);

  useEffect(() => {
    if (!googleButtonRef.current || authUser) return;

    const initialize = () => {
      const google = (window as any).google;
      if (!google?.accounts?.id || !googleButtonRef.current) return false;
      google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: (response: { credential: string }) => void completeGoogleSignIn(response.credential),
      });
      google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: 280,
        text: "continue_with",
      });
      return true;
    };

    if (initialize()) return;
    const timer = window.setInterval(() => {
      if (initialize()) window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, [authUser]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("text-sql-history") || "[]");
      if (Array.isArray(saved)) setHistory(saved);
    } catch {}
  }, []);

  function exportCsv() {
    if (!result?.data?.columns?.length) return;
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      result.data.columns.map(escape).join(","),
      ...result.data.rows.map((row: unknown[]) => row.map(escape).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "text-sql-result.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setQuestion("");
    setResult(null);
    setError("");
  }

  if (authLoading) {
    return <main className="auth-page"><div className="auth-panel"><div className="logo"><Sparkles size={21} /></div><p className="auth-kicker">TEXT•SQL AGENT</p><h1>Preparing your workspace.</h1><p className="auth-muted">Verifying your session...</p></div></main>;
  }

  if (!authUser) {
    return (
      <main className="auth-page">
        <div className="auth-panel">
          <div className="logo"><Sparkles size={21} /></div>
          <p className="auth-kicker">TEXT•SQL AGENT</p>
          <h1>Ask your database<br /><em>in plain English.</em></h1>
          <p className="auth-muted">Sign in securely with Google to access your natural-language data workspace.</p>
          <div className="google-button" ref={googleButtonRef} />
          {authError && <p className="auth-error">{authError}</p>}
          {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && <p className="auth-error">Google sign-in is not configured. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID in Vercel.</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="topbar">
          <div className="brand">
          <div className="logo"><Sparkles size={21} /></div>
          <span>TEXT•SQL AGENT</span>
          </div>
          <div className="account-area">
            <div className="system-status"><span className="status-dot" /> System ready</div>
            <button className="account-button" type="button" onClick={signOut} title="Sign out">
              {authUser.picture ? <img src={authUser.picture} alt="" /> : <span>{authUser.name.charAt(0)}</span>}
              <b>{authUser.name}</b>
            </button>
          </div>
        </div>
        <div className="hero-kicker"><Activity size={14} /> INTELLIGENCE LAYER FOR YOUR DATA</div>
        <h1>Ask your database<br /><em>in plain English.</em></h1>
        <p className="subtitle">
          LangGraph orchestration · Schema RAG · Safe SQL · Error recovery · LangSmith · DeepEval
        </p>
        <div className="hero-notes">
          <span><ShieldCheck size={14} /> Read-only by design</span>
          <span><Database size={14} /> Bring your own CSV</span>
          <span><Activity size={14} /> Results in seconds</span>
        </div>
      </section>

      <section className="workspace">

        <div className="dataset-card card">
          <div className="section-heading">
            <div>
              <div className="label"><Database size={16} /> DATASET</div>
              <p className="section-copy">Choose the source your questions should explore.</p>
            </div>
            <span className="eyebrow">SOURCE 01</span>
          </div>
          <div className="dataset-controls">
            <select value={selectedDataset} onChange={e => selectDataset(e.target.value)}>
              <option value="">Select a dataset...</option>
              {datasets.map(d => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>

            <label className="upload-btn">
              <Upload size={15} />
              {uploading ? "Uploading..." : indexing ? "Indexing..." : "Upload CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                disabled={uploading || indexing}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) uploadDataset(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <button className="refresh-btn" type="button" onClick={loadDatasets}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          {selectedDataset && (
            <div className="dataset-meta">
              <FileText size={13} /> Active dataset: <strong>{selectedDataset}</strong>{indexing && " (indexing...)"}
            </div>
          )}
        </div>

        <div className="composer card">
          <div className="section-heading">
            <div>
              <div className="label"><Database size={16} /> NATURAL LANGUAGE QUERY</div>
              <p className="section-copy">Describe the insight you need. The agent handles schema, SQL, and validation.</p>
            </div>
            <span className="eyebrow">ASK 02</span>
          </div>
          <form onSubmit={submit}>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="e.g. Show the top 5 customers by revenue..."
              rows={4}
            />
            <div className="composer-footer">
              <div className="examples">
                {examples.slice(0, 3).map(x => (
                  <button type="button" key={x} onClick={() => setQuestion(x)}>{x}</button>
                ))}
              </div>
              <button className="run" disabled={loading || indexing || !question.trim()}>
                {loading ? "Running..." : <>Run <Send size={16} /></>}
              </button>
            </div>
          </form>
        </div>

        {error && <div className="error card">{error}</div>}

        {result && (
          <div className="results">
            <div className="answer card">
              <div className="result-kicker"><span className="answer-orb"><Sparkles size={15} /></span><span>ANSWER GENERATED</span></div>
              <div className="answer-text">{result.answer}</div>
              <div className="stats">
                <span><Clock3 size={14} /> {result.execution_time ?? "-"}s</span>
                <span><RotateCcw size={14} /> {result.retry_count} retries</span>
                <span><Table2 size={14} /> {result.retrieved_tables.join(", ") || "none"}</span>
              </div>
            </div>

            <div className="grid">
              <div className="card">
                <div className="result-heading">
                  <div className="label">SQL PREVIEW & EDITOR</div>
                  <div className="sql-actions">
                    <button className="icon-btn" type="button" onClick={copySql} disabled={!sqlDraft} title="Copy SQL"><Copy size={15} /> Copy</button>
                    <button className="icon-btn sql-run" type="button" onClick={runEditedSql} disabled={loading || !sqlDraft.trim()} title="Run edited SQL"><Play size={15} /> Run SQL</button>
                  </div>
                </div>
                <textarea className="sql-editor" value={sqlDraft} onChange={e => setSqlDraft(e.target.value)} placeholder="Generated SQL will appear here." />
              </div>
              <div className="card">
                <div className="result-heading">
                  <div className="label">EXECUTION RESULT</div>
                  <button className="icon-btn" type="button" onClick={exportCsv} disabled={!result.data?.rows?.length} title="Download results as CSV">
                    <Download size={15} /> Export CSV
                  </button>
                </div>
                {result.data?.columns?.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead><tr>{result.data.columns.map((c: string) => <th key={c}>{c}</th>)}</tr></thead>
                      <tbody>
                        {result.data.rows.map((row: any[], i: number) => (
                          <tr key={i}>{row.map((v, j) => <td key={j}>{String(v)}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="muted">No rows returned.</p>}
              </div>
            </div>
            <div className="card chart-card">
              <div className="label"><BarChart3 size={16} /> VISUALIZATION</div>
              <ResultChart data={result.data} />
              {!result.data?.rows?.length && <p className="muted">Run a query with numeric results to see a chart.</p>}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="history card">
            <div className="history-heading">
              <div className="label"><History size={16} /> QUERY HISTORY</div>
              <button className="icon-btn" type="button" onClick={clearHistory} title="Clear query history"><Trash2 size={15} /> Clear</button>
            </div>
            <div className="history-list">
              {history.map(item => (
                <div className="history-item" key={item.timestamp}>
                  <span>{item.question}</span>
                  <small>{item.answer || "Query completed"}</small>
                  <div className="history-actions">
                    <button className="icon-btn" type="button" onClick={() => rerunQuestion(item)} title="Load query"><RotateCcw size={14} /> Load</button>
                    <button className="icon-btn" type="button" onClick={() => removeHistory(item.timestamp)} title="Remove query"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pipeline card">
          <div className="label">AGENT PIPELINE</div>
          <div className="steps">
            {["Question", "Schema RAG", "SQL", "Validate", "Execute", "Answer"].map((s, i) => (
              <div className="step" key={s}><span>{i + 1}</span>{s}</div>
            ))}
          </div>
        </div>

        <button className="reset" onClick={reset}>Reset workspace</button>
      </section>
    </main>
  );
}

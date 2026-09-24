/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useState } from "react";
import { Database, Send, Sparkles, Table2, Clock3, RotateCcw, Upload, FileText, RefreshCw, History, Download } from "lucide-react";

const API = process.env.NEXT_API_URL || "http://localhost:8000";

const examples = [
  "Show the top 5 customers by revenue.",
  "What is the total revenue?",
  "Show revenue by country.",
  "Which products generated the most sales?",
  "Show customers from India who spent more than 50000."
];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState<{ question: string; answer: string; timestamp: number }[]>([]);

  async function loadDatasets() {
    try {
      const res = await fetch(`${API}/api/datasets`);
      const data = await res.json();
      setDatasets(data.datasets || []);
      const selected = await fetch(`${API}/api/datasets/selected`);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not select dataset");
    } catch (err: any) {
      setError(err.message || "Dataset selection failed");
    }
  }

  async function uploadDataset(file: File) {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/api/datasets/upload`, {
        method: "POST",
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: reqQuestion })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed");
      setResult(data);
      setHistory(previous => {
        const next = [
          { question: reqQuestion, answer: data.answer || "", timestamp: Date.now() },
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

  useEffect(() => {
    loadDatasets();
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

  return (
    <main className="page">
      <section className="hero">
        <div className="brand">
          <div className="logo"><Sparkles size={21} /></div>
          <span>TEXT•SQL AGENT</span>
        </div>
        <h1>Ask your database<br /><em>in plain English.</em></h1>
        <p className="subtitle">
          LangGraph orchestration · Schema RAG · Safe SQL · Error recovery · LangSmith · DeepEval
        </p>
      </section>

      <section className="workspace">

        <div className="dataset-card card">
          <div className="label"><Database size={16} /> DATASET</div>
          <div className="dataset-controls">
            <select value={selectedDataset} onChange={e => selectDataset(e.target.value)}>
              <option value="">Select a dataset...</option>
              {datasets.map(d => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>

            <label className="upload-btn">
              <Upload size={15} />
              {uploading ? "Uploading..." : "Upload CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                disabled={uploading}
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
              <FileText size={13} /> Active dataset: <strong>{selectedDataset}</strong>
            </div>
          )}
        </div>

        <div className="composer card">
          <div className="label"><Database size={16} /> NATURAL LANGUAGE QUERY</div>
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
              <button className="run" disabled={loading || !question.trim()}>
                {loading ? "Running..." : <>Run <Send size={16} /></>}
              </button>
            </div>
          </form>
        </div>

        {error && <div className="error card">{error}</div>}

        {result && (
          <div className="results">
            <div className="answer card">
              <div className="label"><Sparkles size={16} /> ANSWER</div>
              <div className="answer-text">{result.answer}</div>
              <div className="stats">
                <span><Clock3 size={14} /> {result.execution_time ?? "-"}s</span>
                <span><RotateCcw size={14} /> {result.retry_count} retries</span>
                <span><Table2 size={14} /> {result.retrieved_tables.join(", ") || "none"}</span>
              </div>
            </div>

            <div className="grid">
              <div className="card">
                <div className="label">GENERATED SQL</div>
                <pre>{result.sql || "No SQL generated."}</pre>
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
          </div>
        )}

        {history.length > 0 && (
          <div className="history card">
            <div className="label"><History size={16} /> RECENT QUERIES</div>
            <div className="history-list">
              {history.map(item => (
                <button className="history-item" type="button" key={item.timestamp} onClick={() => setQuestion(item.question)}>
                  <span>{item.question}</span>
                  <small>{item.answer || "Query completed"}</small>
                </button>
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

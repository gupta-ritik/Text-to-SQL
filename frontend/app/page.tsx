/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Activity, Database, Send, Sparkles, Table2, Clock3, RotateCcw, Upload, FileText, RefreshCw, History, Download, Copy, Play, Trash2, BarChart3, ShieldCheck, TrendingUp, Lightbulb } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "";

function getGoogleTokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

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

function formatMetric(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function isDateLike(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  return /\d{4}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(value);
}

function ResultAnalytics({ data }: { data: any }) {
  const columns = data?.columns || [];
  const rows = data?.rows || [];
  if (!columns.length || !rows.length) return null;

  const numericIndices = columns.reduce((indices: number[], _: string, index: number) => {
    if (rows.some((row: any[]) => row[index] !== null && row[index] !== "" && Number.isFinite(Number(row[index])))) indices.push(index);
    return indices;
  }, []);
  if (!numericIndices.length) return <p className="muted">No numeric values were returned for visualization.</p>;

  const numericIndex = numericIndices[0];
  const labelIndex = columns.findIndex((_: string, index: number) => !numericIndices.includes(index));
  const resolvedLabelIndex = labelIndex >= 0 ? labelIndex : numericIndex;
  const values = rows.map((row: any[]) => Number(row[numericIndex]) || 0);
  const labels = rows.map((row: any[], index: number) => String(row[resolvedLabelIndex] ?? `Row ${index + 1}`));
  const dateTrend = labels.length > 1 && labels.every(isDateLike);
  const maximum = Math.max(...values.map((value: number) => Math.abs(value)), 1);
  const total = values.reduce((sum: number, value: number) => sum + value, 0);
  const average = total / values.length;
  const peakIndex = values.reduce((best: number, value: number, index: number) => value > values[best] ? index : best, 0);
  const first = values[0];
  const last = values[values.length - 1];
  const change = first === 0 ? null : ((last - first) / Math.abs(first)) * 100;
  const direction = change === null ? "changed" : change >= 0 ? "increased" : "decreased";
  const insight = change === null
    ? `${labels[peakIndex]} recorded the highest ${columns[numericIndex]} at ${formatMetric(values[peakIndex])}.`
    : `${columns[numericIndex]} ${direction} ${Math.abs(change).toFixed(1)}% from ${labels[0]} to ${labels[labels.length - 1]}.`;
  const trendValues = values.slice(0, 12);
  const trendMinimum = Math.min(...trendValues);
  const trendRange = Math.max(...trendValues) - trendMinimum || 1;
  const trendPoints = trendValues.map((value: number, index: number) => `${(index / Math.max(trendValues.length - 1, 1)) * 100},${100 - ((value - trendMinimum) / trendRange) * 82 - 9}`).join(" ");

  return (
    <div className="analytics-wrap">
      <div className="kpi-grid">
        <div className="kpi-card"><span>Total {columns[numericIndex]}</span><strong>{formatMetric(total)}</strong><small>{rows.length} rows</small></div>
        <div className="kpi-card"><span>Average</span><strong>{formatMetric(average)}</strong><small>per row</small></div>
        <div className="kpi-card"><span>Peak</span><strong>{formatMetric(values[peakIndex])}</strong><small>{labels[peakIndex]}</small></div>
        <div className={`kpi-card ${change !== null && change >= 0 ? "kpi-positive" : ""}`}><span><TrendingUp size={13} /> Trend</span><strong>{change === null ? "N/A" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}</strong><small>{dateTrend ? "first to last period" : "first to last row"}</small></div>
      </div>
      <div className="insight-callout"><Lightbulb size={17} /><div><strong>Key insight</strong><span>{insight}</span></div></div>
      <div className="chart-header"><span>{dateTrend ? "Trend over time" : "Best-fit comparison"}</span><small>{columns[numericIndex]} by {columns[resolvedLabelIndex]}</small></div>
      {dateTrend ? (
        <div className="trend-chart">
          <svg viewBox="0 0 100 110" preserveAspectRatio="none" role="img" aria-label={`${columns[numericIndex]} trend chart`}>
            <polyline points={trendPoints} fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="trend-labels">{labels.slice(0, 12).map((label: string, index: number) => <span key={`${label}-${index}`}>{label}</span>)}</div>
        </div>
      ) : (
        <div className="chart-bars">
          {rows.slice(0, 12).map((row: any[], index: number) => {
            const value = values[index];
            const label = labels[index];
            return (
              <div className="chart-row" key={`${label}-${index}`}>
                <span className="chart-label" title={label}>{label}</span>
                <div className="chart-track"><div className="chart-bar" style={{ width: `${Math.max((Math.abs(value) / maximum) * 100, 2)}%` }} /></div>
                <span className="chart-value">{value.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="chart-caption"><BarChart3 size={14} /> Automatically selected from the returned data</div>
    </div>
  );
}

export default function Home() {
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaWidgetId = useRef<number | null>(null);
  const captchaTokenRef = useRef("");
  const [recaptchaScriptLoaded, setRecaptchaScriptLoaded] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [pendingCredential, setPendingCredential] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [googleReady, setGoogleReady] = useState(false);
  const [googleScriptLoaded, setGoogleScriptLoaded] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [datasetProgress, setDatasetProgress] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sqlDraft, setSqlDraft] = useState("");

  function showToast(message: string, tone: "success" | "error" | "info" = "info") {
    setToast({ message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }

  function clearGoogleSession(message = "Your Google session expired. Please sign in again.") {
    localStorage.removeItem("google-id-token");
    setAuthUser(null);
    setPendingCredential("");
    captchaTokenRef.current = "";
    setCaptchaToken("");
    setAuthError(message);
    setAuthLoading(false);
    const recaptcha = (window as any).grecaptcha;
    if (recaptchaWidgetId.current !== null && recaptcha?.reset) {
      recaptcha.reset(recaptchaWidgetId.current);
    }
  }

  async function completeGoogleSignIn(credential: string, token = captchaToken) {
    token = token || captchaTokenRef.current;
    if (RECAPTCHA_SITE_KEY && !token) {
      setPendingCredential(credential);
      setAuthError("Please complete the reCAPTCHA challenge before signing in.");
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`${API}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential, captcha_token: token }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Google sign-in failed");
      localStorage.setItem("google-id-token", credential);
      setAuthUser(data.user);
    } catch (err: any) {
      if (err.name === "AbortError") {
        setAuthError("The backend is taking too long to respond. Please try signing in again.");
      } else if (err.message?.toLowerCase().includes("token expired") || err.message?.toLowerCase().includes("401")) {
        clearGoogleSession("Your Google session expired. Please click Continue with Google to sign in again.");
      } else {
        setAuthError(err.message || "Google sign-in failed");
      }
    } finally {
      window.clearTimeout(timeout);
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
      setDatasetProgress(70);
      void monitorIndex();
    } catch (err: any) {
      setDatasetProgress(0);
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
          setDatasetProgress(100);
          showToast("Dataset indexed successfully.", "success");
          return;
        }
        if (data.status === "error") {
          setIndexing(false);
          setDatasetProgress(0);
          setError(data.error || "Dataset indexing failed");
          showToast(data.error || "Dataset indexing failed.", "error");
          return;
        }
      } catch {
        setIndexing(false);
        setError("Could not check dataset indexing status. Please refresh and try again.");
        return;
      }
    }
    setIndexing(false);
    setDatasetProgress(0);
    setError("Dataset indexing is taking longer than expected.");
  }

  async function uploadDataset(file: File) {
    setUploading(true);
    setDatasetProgress(15);
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
      setUploading(false);
      setDatasetProgress(45);
      showToast("CSV uploaded. Preparing schema index...", "info");
      await loadDatasets();
      await selectDataset(data.dataset.name);
    } catch (err: any) {
      setDatasetProgress(0);
      setError(err.message || "Dataset upload failed");
      showToast(err.message || "Dataset upload failed.", "error");
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
      showToast("Query completed successfully.", "success");
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
      showToast(err.message || "Something went wrong.", "error");
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
      showToast("Edited SQL executed successfully.", "success");
    } catch (err: any) {
      setError(err.message || "SQL execution failed");
      showToast(err.message || "SQL execution failed.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function copySql() {
    if (sqlDraft) {
      await navigator.clipboard.writeText(sqlDraft);
      showToast("SQL copied to clipboard.", "success");
    }
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
      const expiresAt = getGoogleTokenExpiry(savedCredential);
      if (expiresAt !== null && expiresAt <= Date.now()) {
        clearGoogleSession();
        return;
      }
      if (RECAPTCHA_SITE_KEY) {
        setPendingCredential(savedCredential);
        setAuthError("Please complete the reCAPTCHA challenge before signing in.");
        setAuthLoading(false);
      } else {
        void completeGoogleSignIn(savedCredential);
      }
    } else {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authUser) return;
    const credential = localStorage.getItem("google-id-token");
    const expiresAt = credential ? getGoogleTokenExpiry(credential) : null;
    if (expiresAt === null) return;
    const delay = Math.max(expiresAt - Date.now(), 0);
    const timer = window.setTimeout(() => clearGoogleSession(), delay);
    return () => window.clearTimeout(timer);
  }, [authUser]);

  useEffect(() => {
    if (authUser) {
      loadDatasets();
    }
  }, [authUser]);

  useEffect(() => {
    if (!googleButtonRef.current || authUser || !googleScriptLoaded) return;

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
      setGoogleReady(true);
      return true;
    };

    initialize();
  }, [authUser, googleScriptLoaded]);

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY || authUser || !recaptchaScriptLoaded || !recaptchaRef.current || recaptchaWidgetId.current !== null) return;
    let attempts = 0;
    let retryTimer: number | null = null;
    const renderRecaptcha = () => {
      const recaptcha = (window as any).grecaptcha;
      if (!recaptcha?.render) {
        attempts += 1;
        if (attempts < 20) retryTimer = window.setTimeout(renderRecaptcha, 250);
        else setAuthError("reCAPTCHA could not load. Refresh the page and try again.");
        return;
      }
      recaptchaWidgetId.current = recaptcha.render(recaptchaRef.current, {
        sitekey: RECAPTCHA_SITE_KEY,
        callback: (token: string) => {
          captchaTokenRef.current = token;
          setCaptchaToken(token);
          setPendingCredential(credential => {
            if (credential) void completeGoogleSignIn(credential, token);
            return "";
          });
        },
        "expired-callback": () => {
          captchaTokenRef.current = "";
          setCaptchaToken("");
        },
        "error-callback": () => {
          captchaTokenRef.current = "";
          setCaptchaToken("");
        },
      });
    };
    renderRecaptcha();
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [authUser, recaptchaScriptLoaded]);

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
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={() => setGoogleScriptLoaded(true)}
          onError={() => setAuthError("Google sign-in could not load. Check your network or ad blocker.")}
        />
        {RECAPTCHA_SITE_KEY && (
          <Script
            src="https://www.google.com/recaptcha/api.js?render=explicit"
            strategy="afterInteractive"
            onLoad={() => setRecaptchaScriptLoaded(true)}
            onError={() => setAuthError("reCAPTCHA could not load. Check your network or ad blocker.")}
          />
        )}
        <div className="auth-panel">
          <div className="logo"><Sparkles size={21} /></div>
          <p className="auth-kicker">TEXT•SQL AGENT</p>
          <h1>Ask your database<br /><em>in plain English.</em></h1>
          <p className="auth-muted">Sign in securely with Google to access your natural-language data workspace.</p>
          {RECAPTCHA_SITE_KEY && <div className="recaptcha-box" ref={recaptchaRef} />}
          <div className="google-button" ref={googleButtonRef} />
          {!googleReady && process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && <p className="auth-muted auth-loading">Loading Google sign-in...</p>}
          {authError && <p className="auth-error">{authError}</p>}
          {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && <p className="auth-error">Google sign-in is not configured. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID in Vercel.</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
          <span className="toast-mark">{toast.tone === "success" ? "✓" : toast.tone === "error" ? "!" : "i"}</span>
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">×</button>
        </div>
      )}
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
            <select disabled={uploading || indexing} value={selectedDataset} onChange={e => selectDataset(e.target.value)}>
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

            <button className="refresh-btn" type="button" disabled={uploading || indexing} onClick={loadDatasets}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          {(uploading || indexing) && (
            <div className="dataset-progress" role="status" aria-live="polite">
              <div className="progress-heading">
                <span>{uploading ? "Uploading dataset..." : "Building schema index..."}</span>
                <strong>{datasetProgress}%</strong>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(datasetProgress, 8)}%` }} /></div>
              <small>{uploading ? "Sending your CSV to the secure workspace." : "Preparing the agent to answer questions about this dataset."}</small>
            </div>
          )}

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
              <div className="label"><BarChart3 size={16} /> ANALYTICS</div>
              <ResultAnalytics data={result.data} />
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

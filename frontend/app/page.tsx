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

function formatAnswer(answer: string) {
  return answer
    .split("\n")
    .filter(line => !/^\s*\|?\s*:?-{2,}/.test(line))
    .map(line => line.includes("|") ? line.split("|").map(part => part.trim()).filter(Boolean).join("  •  ") : line.trim())
    .filter(Boolean)
    .join("\n");
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
  const [selectedDatasetNames, setSelectedDatasetNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [datasetProgress, setDatasetProgress] = useState(0);
  const [datasetPhase, setDatasetPhase] = useState<"uploading" | "processing" | "indexing" | "ready">("uploading");
  const [datasetElapsed, setDatasetElapsed] = useState(0);
  const [datasetReadyTime, setDatasetReadyTime] = useState<number | null>(null);
  const datasetStartedAt = useRef<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sqlDraft, setSqlDraft] = useState("");
  const [pipelineStep, setPipelineStep] = useState(-1);

  useEffect(() => {
    if (!uploading && !indexing) return;
    const timer = window.setInterval(() => {
      if (datasetStartedAt.current !== null) {
        setDatasetElapsed((Date.now() - datasetStartedAt.current) / 1000);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [uploading, indexing]);

  useEffect(() => {
    if (!uploading || datasetPhase !== "processing") return;
    const timer = window.setInterval(() => {
      setDatasetProgress(previous => Math.min(68, Math.max(previous + 1, 46)));
    }, 700);
    return () => window.clearInterval(timer);
  }, [uploading, datasetPhase]);

  function formatDuration(seconds: number) {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${Math.floor(seconds % 60)}s`;
  }

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
      setSelectedDatasetNames(
        selectedData.selected_datasets?.map((item: { name: string }) => item.name)
          || (selectedData.selected_dataset ? [selectedData.selected_dataset] : [])
      );
    } catch {}
  }

  async function selectDataset(names: string | string[], preserveTiming = false) {
    const selectedNames = Array.isArray(names) ? names : [names];
    if (!selectedNames.length) return;
    if (!preserveTiming) {
      datasetStartedAt.current = Date.now();
      setDatasetElapsed(0);
      setDatasetReadyTime(null);
      setDatasetPhase("indexing");
      setDatasetProgress(45);
    }
    setError("");
    setSelectedDataset(selectedNames[0]);
    setSelectedDatasetNames(selectedNames);
    try {
      const res = await fetch(`${API}/api/datasets/select`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ names: selectedNames })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not select dataset");
      setDatasetPhase("indexing");
      setIndexing(true);
      setDatasetProgress(previous => Math.max(previous, 50));
      void monitorIndex();
    } catch (err: any) {
      setIndexing(false);
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
          const elapsed = datasetStartedAt.current === null
            ? datasetElapsed
            : (Date.now() - datasetStartedAt.current) / 1000;
          setDatasetElapsed(elapsed);
          setDatasetReadyTime(elapsed);
          setIndexing(false);
          setDatasetProgress(100);
          setDatasetPhase("ready");
          showToast(`Dataset ready in ${formatDuration(elapsed)}.`, "success");
          return;
        }
        if (data.status === "error") {
          setIndexing(false);
          setDatasetProgress(0);
          setError(data.error || "Dataset indexing failed");
          showToast(data.error || "Dataset indexing failed.", "error");
          return;
        }
        setDatasetProgress(previous => Math.min(96, Math.max(previous + 1, 55)));
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

  async function uploadDataset(files: File[]) {
    datasetStartedAt.current = Date.now();
    setDatasetElapsed(0);
    setDatasetReadyTime(null);
    setDatasetPhase("uploading");
    setUploading(true);
    setDatasetProgress(0);
    setError("");
    try {
      const form = new FormData();
      files.forEach(file => form.append("files", file));
      const data = await new Promise<any>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", `${API}/api/datasets/upload`);
        const headers = authHeaders();
        const authorization = headers instanceof Headers
          ? headers.get("Authorization")
          : (headers as Record<string, string>)["Authorization"];
        if (authorization) request.setRequestHeader("Authorization", authorization);
        request.upload.onprogress = event => {
          if (event.lengthComputable) setDatasetProgress(Math.round((event.loaded / event.total) * 45));
        };
        request.upload.onload = () => {
          setDatasetPhase("processing");
          setDatasetProgress(previous => Math.max(previous, 46));
        };
        request.onload = () => {
          try {
            const response = JSON.parse(request.responseText);
            if (request.status >= 200 && request.status < 300) resolve(response);
            else reject(new Error(response.detail || "Upload failed"));
          } catch {
            reject(new Error("Upload returned an invalid response"));
          }
        };
        request.onerror = () => reject(new Error("Upload failed. Check the backend connection."));
        request.send(form);
      });
      setUploading(false);
      setDatasetPhase("indexing");
      setDatasetProgress(50);
      showToast(`${files.length} dataset${files.length === 1 ? "" : "s"} uploaded. Preparing schema index...`, "info");
      await loadDatasets();
      await selectDataset(data.datasets.map((item: { name: string }) => item.name), true);
    } catch (err: any) {
      setUploading(false);
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
    setPipelineStep(0);
    try {
      const res = await fetch(`${API}/api/query/stream`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ question: reqQuestion })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Request failed");
      }
      if (!res.body) throw new Error("Live query stream is unavailable. Please try again.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let data: any = null;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const event of events) {
          const line = event.split("\n").find(value => value.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "progress") setPipelineStep(payload.step);
          if (payload.type === "error") throw new Error(payload.message || "Request failed");
          if (payload.type === "result") data = payload.result;
        }
      }
      if (!data) throw new Error("The query stream ended before returning a result.");
      setResult(data);
      setSqlDraft(data.sql || "");
      setPipelineStep(7);
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
    setPipelineStep(-1);
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
          <div className="dataset-help">
            <strong>Choose one or more sources</strong>
            <span>Select several datasets together to let the agent compare or join them. New files are indexed automatically.</span>
          </div>
          <div className="dataset-controls">
            <select
              aria-label="Select datasets to use"
              multiple
              disabled={uploading || indexing}
              value={selectedDatasetNames}
              onChange={e => {
                const names = Array.from(e.target.selectedOptions, option => option.value);
                setSelectedDatasetNames(names);
                setSelectedDataset(names[0] || "");
              }}
            >
              {datasets.length ? datasets.map(d => (
                <option key={d.name} value={d.name}>{d.name}{d.format ? ` · ${d.format}` : ""}</option>
              )) : <option disabled>No datasets uploaded yet</option>}
            </select>

            <button
              className="refresh-btn"
              type="button"
              disabled={uploading || indexing || !selectedDatasetNames.length}
              onClick={() => selectDataset(selectedDatasetNames)}
            >
              <Play size={15} /> Use selected{selectedDatasetNames.length ? ` (${selectedDatasetNames.length})` : ""}
            </button>

            <label className="upload-btn">
              <Upload size={15} />
              {uploading ? "Uploading..." : indexing ? "Indexing..." : "Upload datasets"}
              <input
                type="file"
                accept=".csv,.tsv,.xlsx,.xls,.json,.jsonl,.ndjson,.parquet,.xml,.yaml,.yml"
                multiple
                hidden
                disabled={uploading || indexing}
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  if (files.length) uploadDataset(files);
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
                <span>{uploading ? (datasetPhase === "processing" ? "Processing files..." : "Uploading dataset...") : "Building schema index..."}</span>
                <strong>{datasetProgress}%</strong>
              </div>
              <div className="progress-track"><div className={`progress-fill ${indexing || datasetPhase === "processing" ? "is-indexing" : ""}`} style={{ width: `${Math.max(datasetProgress, 8)}%` }} /></div>
              <div className="dataset-progress-meta">
                <small>{uploading ? (datasetPhase === "processing" ? "Reading files, profiling data, and preparing tables." : "Sending your files to the secure workspace.") : "Preparing the agent to answer questions about this dataset."}</small>
                <small>Elapsed {formatDuration(datasetElapsed)}{indexing ? " · usually ready within 2 minutes" : ""}</small>
              </div>
            </div>
          )}

          {selectedDataset && (
            <div className="dataset-meta">
              <FileText size={13} /> Active datasets: <strong>{selectedDatasetNames.join(", ") || selectedDataset}</strong>{indexing ? " (indexing...)" : datasetReadyTime !== null ? ` (ready in ${formatDuration(datasetReadyTime)})` : ""}
            </div>
          )}
          {!datasets.length && !uploading && !indexing && (
            <div className="dataset-empty">
              <FileText size={16} />
              <span>No datasets yet. Upload a file to create your first queryable source.</span>
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

        <div className="pipeline card">
          <div className="pipeline-heading">
            <div className="label">AGENT PIPELINE</div>
            <span className={`pipeline-live ${loading ? "is-running" : pipelineStep === 7 ? "is-complete" : ""}`}>
              <span className="pipeline-live-dot" /> {loading ? "LIVE" : pipelineStep === 7 ? "COMPLETE" : "READY"}
            </span>
          </div>
          <div className="steps">
            {["Question", "Plan", "Schema RAG", "SQL", "Validate", "Execute", "Verify", "Answer"].map((s, i) => (
              <div className={`step ${pipelineStep === i ? "is-active" : ""} ${pipelineStep > i ? "is-complete" : ""}`} key={s}>
                <span>{pipelineStep > i ? "✓" : i + 1}</span>{s}
              </div>
            ))}
          </div>
          <p className="pipeline-status">
            {loading && pipelineStep >= 0 ? ["Capturing your question...", "Planning the query...", "Retrieving relevant schema...", "Generating safe SQL...", "Validating the query...", "Executing against your dataset...", "Verifying the result...", "Preparing your answer..."][pipelineStep] : pipelineStep === 7 ? "Workflow complete. Results are ready to explore." : "Ready for a natural-language question."}
          </p>
        </div>

        {error && <div className="error card">{error}</div>}

        {result && (
          <div className="results">
            <div className="answer card">
              <div className="result-kicker"><span className="answer-orb"><Sparkles size={15} /></span><span>ANSWER GENERATED</span></div>
              <div className="answer-text">{formatAnswer(result.answer || "No answer returned.")}</div>
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

        <button className="reset" onClick={reset}>Reset workspace</button>
      </section>
    </main>
  );
}

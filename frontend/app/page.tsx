"use client";

import { FormEvent, useState } from "react";

type ScanIssue = {
  rule_id: string;
  severity: "high" | "medium" | "low";
  element: string;
  message: string;
  recommendation: string;
  line: number | null;
  column: number | null;
  source_hint: string | null;
  dom_path: string | null;
  text_preview: string | null;
  screenshot_data_url: string | null;
};

type ScanResponse = {
  url: string;
  scanned_at: string;
  summary: {
    total_issues: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: ScanIssue[];
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

const DEFAULT_TEST_URL = `${API_BASE_URL}/test/page-bad`;

function getBestLocator(issue: ScanIssue): string | null {
  if (issue.rule_id === "heading-order" && issue.text_preview) {
    return `Search the page or Elements panel for the heading text "${issue.text_preview}".`;
  }

  if (issue.rule_id === "duplicate-id") {
    return `Search in DevTools Elements for ${issue.element}.`;
  }

  if (issue.rule_id === "image-alt" && issue.text_preview) {
    return `Search in DevTools for the image source or label "${issue.text_preview}".`;
  }

  if (issue.rule_id === "link-name" && issue.text_preview) {
    return `Search for link text "${issue.text_preview}".`;
  }

  if (issue.dom_path) {
    return `Follow the DOM path ending in ${issue.dom_path.split(" > ").at(-1)}.`;
  }

  return null;
}

function IssueScreenshot({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [failedToLoad, setFailedToLoad] = useState(false);

  if (failedToLoad) {
    return (
      <div className="issue-screenshot issue-screenshot-fallback">
        <p>Screenshot unavailable for this page.</p>
        <p className="screenshot-note">
          Some sites block automated browser capture, especially in headless or
          containerized environments.
        </p>
      </div>
    );
  }

  return (
    <div className="issue-screenshot">
      <img src={src} alt={alt} onError={() => setFailedToLoad(true)} />
    </div>
  );
}

export default function HomePage() {
  const [url, setUrl] = useState(DEFAULT_TEST_URL);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/scan/page`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string };
        throw new Error(payload.detail || "Scan request failed.");
      }

      const payload = (await response.json()) as ScanResponse;
      setResult(payload);
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Unexpected error while scanning.";
      setError(message);
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Final Year Project MVP</p>
        <h1>Web Accessibility Audit and Repair Assistant</h1>
        <p className="intro">
          Submit a webpage URL, run the backend scan, and review issue severity,
          affected elements, and repair guidance.
        </p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Scan Console</p>
            <h2>Run a single-page accessibility scan</h2>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setUrl(DEFAULT_TEST_URL)}
          >
            Use Test Page
          </button>
        </div>

        <form className="scan-form" onSubmit={handleSubmit}>
          <label className="input-group">
            <span>Page URL</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              required
            />
          </label>

          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? "Scanning..." : "Run Scan"}
          </button>
        </form>

        <div className="backend-note">
          Backend endpoint:
          <code>{API_BASE_URL}/scan/page</code>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      {result ? (
        <>
          <section className="summary-grid">
            <article className="stat-card">
              <span>Total Issues</span>
              <strong>{result.summary.total_issues}</strong>
            </article>
            <article className="stat-card high">
              <span>High</span>
              <strong>{result.summary.high}</strong>
            </article>
            <article className="stat-card medium">
              <span>Medium</span>
              <strong>{result.summary.medium}</strong>
            </article>
            <article className="stat-card low">
              <span>Low</span>
              <strong>{result.summary.low}</strong>
            </article>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Latest Result</p>
                <h2>{result.url}</h2>
              </div>
              <p className="timestamp">
                Scanned at {new Date(result.scanned_at).toLocaleString()}
              </p>
            </div>
            <p className="result-note">
              Location hints refer to the fetched HTML source. On framework-built
              sites, they may not map directly to the original React, Next.js,
              or template file.
            </p>

            {result.issues.length === 0 ? (
              <div className="empty-state">
                No issues were detected by the current baseline checks.
              </div>
            ) : (
              <div className="issues-list">
                {result.issues.map((issue) => {
                  const bestLocator = getBestLocator(issue);

                  return (
                    <article key={`${issue.rule_id}-${issue.element}`} className="issue-card">
                      {issue.screenshot_data_url ? (
                        <IssueScreenshot
                          src={issue.screenshot_data_url}
                          alt={`Screenshot for ${issue.rule_id}`}
                        />
                      ) : null}
                      <div className="issue-topline">
                        <span className={`severity-pill ${issue.severity}`}>
                          {issue.severity}
                        </span>
                        <code>{issue.rule_id}</code>
                      </div>
                      <h3>{issue.message}</h3>
                      <p>
                        <strong>Element:</strong> <code>{issue.element}</code>
                      </p>
                      {issue.line ? (
                        <p>
                          <strong>Source location:</strong> line {issue.line}
                          {issue.column ? `, column ${issue.column}` : ""}
                        </p>
                      ) : null}
                      {issue.source_hint ? (
                        <p>
                          <strong>Source hint:</strong> <code>{issue.source_hint}</code>
                        </p>
                      ) : null}
                      {issue.text_preview ? (
                        <p>
                          <strong>Text preview:</strong> "{issue.text_preview}"
                        </p>
                      ) : null}
                      {bestLocator ? (
                        <p className="best-locator">
                          <strong>Best way to find it:</strong> {bestLocator}
                        </p>
                      ) : null}
                      {issue.dom_path ? (
                        <p>
                          <strong>DOM path:</strong> <code>{issue.dom_path}</code>
                        </p>
                      ) : null}
                      <p>
                        <strong>Recommendation:</strong> {issue.recommendation}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

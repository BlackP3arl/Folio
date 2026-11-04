import { useCallback, useEffect, useState } from "react";
import { Modal } from "./Dialogs";

const RELEASES_API = "https://api.github.com/repos/Forward-Future/folio-releases/releases?per_page=20";
const RELEASES_PAGE = "https://github.com/Forward-Future/folio-releases/releases";
declare const __APP_VERSION__: string;

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
}

export interface UpstreamRelease {
  version: string;
  tag: string;
  name: string;
  notes: string;
  url: string;
  publishedAt: string | null;
}

function versionParts(version: string) {
  const match = version.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left: string, right: string) {
  const a = versionParts(left), b = versionParts(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function releaseNotes(body: string | null) {
  const notes = (body ?? "").split(/^## Download\s*$/im)[0].trim();
  return notes || "No release notes were provided.";
}

export async function fetchUpstreamReleases(currentVersion: string, signal?: AbortSignal) {
  const response = await fetch(RELEASES_API, {
    signal,
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    throw new Error(response.status === 403 && remaining === "0"
      ? "GitHub's request limit was reached. Try again later."
      : `GitHub returned ${response.status}. Try again later.`);
  }
  const releases = await response.json() as GitHubRelease[];
  return releases.filter(release => !release.draft && !release.prerelease && compareVersions(release.tag_name, currentVersion) > 0)
    .map((release): UpstreamRelease => ({
      version: release.tag_name.replace(/^v/i, ""),
      tag: release.tag_name,
      name: release.name || release.tag_name,
      notes: releaseNotes(release.body),
      url: release.html_url,
      publishedAt: release.published_at,
    }));
}

function implementationRequest(currentVersion: string, releases: UpstreamRelease[]) {
  const list = releases.map(release => `- ${release.tag}: ${release.notes.replace(/\s+/g, " ").trim()}`).join("\n");
  return `Yes. Analyze the original Folio releases newer than my customized app (${currentVersion}) and implement the applicable changes without removing my custom features. Compare upstream source and architecture before editing, resolve conflicts deliberately, preserve Windows/macOS/Linux support, and run the full validation suite.\n\nUpstream releases to review:\n${list}\n\nRelease history: ${RELEASES_PAGE}`;
}

export function UpstreamUpdatesDialog({ onClose }: { onClose: () => void }) {
  const [currentVersion, setCurrentVersion] = useState(__APP_VERSION__);
  const [releases, setReleases] = useState<UpstreamRelease[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.folioDesktop?.getVersion().then(version => { if (!cancelled) setCurrentVersion(version); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const check = useCallback(async (signal?: AbortSignal) => {
    setChecking(true); setError(""); setRequest(""); setCopied(false);
    try { setReleases(await fetchUpstreamReleases(currentVersion, signal)); }
    catch (reason) { if (!signal?.aborted) { setReleases(null); setError((reason as Error).message); } }
    finally { if (!signal?.aborted) setChecking(false); }
  }, [currentVersion]);

  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [check]);

  const prepare = async () => {
    const text = implementationRequest(currentVersion, releases ?? []);
    setRequest(text); setCopied(false);
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* textarea remains available */ }
  };

  return <Modal title="Original Folio updates" onClose={onClose}>
    <div className="upstream-updates">
      <div className="upstream-summary">
        <div><strong>Your customized Folio</strong><span>Version {currentVersion}</span></div>
        <button className="btn ghost" disabled={checking} onClick={() => void check()}>{checking ? "Checking…" : "Check again"}</button>
      </div>
      {checking && releases === null && <p className="upstream-status" role="status">Checking the original developer's releases…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {releases?.length === 0 && <div className="upstream-current"><strong>No newer releases found</strong><span>Your version is at least as new as the latest published upstream release.</span></div>}
      {!!releases?.length && <>
        <div className="upstream-found"><strong>{releases.length} newer {releases.length === 1 ? "release" : "releases"} found</strong><span>Review the notes before deciding whether to bring these changes into your customized app.</span></div>
        <div className="upstream-list">
          {releases.map((release, index) => <details key={release.tag} open={index === 0}>
            <summary><span><strong>{release.name}</strong><small>{release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : release.tag}</small></span><a href={release.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>GitHub</a></summary>
            <p>{release.notes}</p>
          </details>)}
        </div>
        <div className="upstream-question">
          <strong>Would you like Jcode to analyze and implement these updates?</strong>
          <span>Nothing is installed automatically. Your signature placeholder and other custom work must be preserved during implementation.</span>
          <div><button className="btn ghost" onClick={onClose}>Not now</button><button className="btn primary" onClick={() => void prepare()}>Yes, prepare request</button></div>
        </div>
      </>}
      {request && <div className="upstream-request">
        <label htmlFor="upstream-request">Implementation request {copied && <span>Copied</span>}</label>
        <textarea id="upstream-request" readOnly value={request} onFocus={event => event.currentTarget.select()} />
        <p>{copied ? "Paste this into your Jcode chat to begin the source analysis and implementation." : "Copy this request and paste it into your Jcode chat."}</p>
      </div>}
      <a className="upstream-history" href={RELEASES_PAGE} target="_blank" rel="noreferrer">Open complete release history on GitHub</a>
    </div>
  </Modal>;
}

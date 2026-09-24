import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Project } from "../lib/api.js";
import { Button, Field, Modal } from "./primitives.js";
import { Icon } from "./Icon.js";

/** Relative time when recent; otherwise a date without seconds. */
function formatUpdated(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 45) return "Updated just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `Updated ${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 36) return `Updated ${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 14) return `Updated ${day}d ago`;
  return `Updated ${new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}

/**
 * Projects dashboard — NOT PRESENT in the design handoff.
 * Logged in design-inventions.md §12. Tokens + primitives only.
 */
export function ProjectsDashboard({ userName }: { userName: string }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);

  async function reload() {
    const { projects: rows } = await api.projects.list();
    setProjects(rows);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { projects: rows } = await api.projects.list();
        if (!cancelled) setProjects(rows);
      } catch (err) {
        if (!cancelled) {
          setProjects([]);
          setError(err instanceof ApiError ? err.message : "Could not load projects");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const project = await api.projects.create(trimmed);
      window.location.assign(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create project");
      setBusy(false);
    }
  }

  const confirmArchive = useCallback(async () => {
    if (!archiveTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api.projects.archive(archiveTarget.id);
      setArchiveTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not archive");
    } finally {
      setBusy(false);
    }
  }, [archiveTarget]);

  const empty = projects !== null && projects.length === 0;

  return (
    <div className="app-shell projects">
      <header className="menubar">
        <span className="menubar__logo">
          <Icon name="Select" size={16} tone="onAccent" />
        </span>
        <span className="title projects__brand">ShowPlan</span>
        <div className="menubar__actions">
          <span className="projects__user">{userName}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void api.logout().then(() => {
                window.location.assign("/login");
              });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="projects__main">
        <div className="projects__header">
          <h1 className="title">Projects</h1>
          <p className="projects__lede">Resume a show, or start a new one.</p>
        </div>

        <form className="projects__create" onSubmit={(e) => void onCreate(e)}>
          <Field
            label="Project name"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            placeholder="e.g. Client name — venue"
            disabled={busy}
          />
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            New project
          </Button>
        </form>

        {error ? (
          <p className="projects__error" role="alert">
            {error}
          </p>
        ) : null}

        {projects === null ? (
          <p className="projects__lede">Loading…</p>
        ) : empty ? (
          <div className="projects__empty">
            <p className="title">No projects yet</p>
            <p className="projects__lede">
              Name the show above and open the layout — you can set venue and days later.
            </p>
          </div>
        ) : (
          <ul className="projects__list">
            {projects.map((p) => (
              <li key={p.id} className="projects__row">
                <button
                  type="button"
                  className="projects__open hit-24"
                  onClick={() => {
                    window.location.assign(`/projects/${p.id}`);
                  }}
                >
                  <span className="projects__name">{p.name}</span>
                  <span className="projects__meta">{formatUpdated(p.updatedAt)}</span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    setArchiveTarget({ id: p.id, name: p.name });
                  }}
                >
                  Archive
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Modal
        open={archiveTarget != null}
        title="Archive project?"
        confirmLabel="Archive"
        danger
        busy={busy}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void confirmArchive()}
      >
        <p>
          Archive “{archiveTarget?.name}”? You can still find it later; nothing is
          deleted.
        </p>
      </Modal>
    </div>
  );
}

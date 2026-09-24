import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Project } from "./lib/api.js";
import { EditorShell } from "./components/EditorShell.js";
import { SignInPage } from "./components/SignInPage.js";
import { ProjectsDashboard } from "./components/ProjectsDashboard.js";
import { Button } from "./components/primitives.js";
import { Icon } from "./components/Icon.js";
import { FULL, MVP } from "./lib/capabilities.js";
import { isDevReferenceRoute } from "./lib/reference-route.js";

type Me = { id: string; email: string; name: string; role: string };

function projectIdFromPath(path: string): string | null {
  const m = /^\/projects\/([^/]+)\/?$/.exec(path);
  return m?.[1] ?? null;
}

function AppChrome({
  userName,
  children,
}: {
  userName: string;
  children: ReactNode;
}) {
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
      {children}
    </div>
  );
}

/**
 * Routes:
 *   /login              sign-in
 *   /                   projects dashboard (resume work)
 *   /projects/:id       editor for that project (create lands here)
 *   /_reference         V2 shell, all capabilities on — DEV only (ADR-008)
 */
export function App() {
  const [status, setStatus] = useState("connecting…");
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const path = window.location.pathname;
  const reference = isDevReferenceRoute(path, import.meta.env.DEV);
  const onLogin = path === "/login";
  const projectId = projectIdFromPath(path);
  const loginError = onLogin ? new URLSearchParams(window.location.search).get("error") : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await api.me();
        if (cancelled) return;
        setMe(user);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setMe(null);
          return;
        }
        setMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me || !projectId) {
      setProject(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await api.projects.get(projectId);
        if (!cancelled) setProject(p);
      } catch {
        if (!cancelled) setProject(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, projectId]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const [version, ready] = await Promise.all([api.version(), api.ready()]);
        if (cancelled) return;
        setStatus(`${version.version} · ${version.commit.slice(0, 7)} · db ${ready.db}`);
      } catch (err) {
        if (cancelled) return;
        setStatus(err instanceof ApiError ? `api ${err.status}` : "api unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  useEffect(() => {
    if (me && onLogin) {
      window.location.replace("/");
    }
  }, [me, onLogin]);

  if (me === undefined) {
    return <div className="sign-in" aria-busy="true" />;
  }

  if (!me || onLogin) {
    if (me && onLogin) return null;
    return <SignInPage error={loginError} />;
  }

  if (reference) {
    return <EditorShell caps={FULL} reference status={status} />;
  }

  if (projectId) {
    if (project === undefined) {
      return <div className="sign-in" aria-busy="true" />;
    }
    if (project === null) {
      return (
        <AppChrome userName={me.name}>
          <main className="projects__main">
            <p className="projects__error" role="alert">
              Project not found.
            </p>
            <Button variant="primary" onClick={() => window.location.assign("/")}>
              Back to projects
            </Button>
          </main>
        </AppChrome>
      );
    }
    return (
      <EditorShell
        caps={MVP}
        status={status}
        projectName={project.name}
        projectId={project.id}
        onBackToProjects={() => {
          window.location.assign("/");
        }}
      />
    );
  }

  return <ProjectsDashboard userName={me.name} />;
}

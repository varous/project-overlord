import { Button } from "./primitives.js";

/**
 * Sign-in is NOT PRESENT in the design handoff. Logged in design-inventions.md.
 * Tokens only — no new CSS variables.
 */
export function SignInPage({ error }: { error: string | null }) {
  const rejected = error === "hd_rejected";

  return (
    <div className="sign-in">
      <div className="sign-in__card">
        <h1 className="title">ShowPlan</h1>
        <p className="sign-in__hint">Clockwork AV — sign in with your work Google account.</p>
        {rejected ? (
          <p className="sign-in__error" role="alert">
            Only @clockwork-av.com accounts can sign in.
          </p>
        ) : error ? (
          <p className="sign-in__error" role="alert">
            Sign-in failed. Try again.
          </p>
        ) : null}
        <Button
          variant="primary"
          className="sign-in__btn"
          onClick={() => {
            window.location.href = "/api/auth/login";
          }}
        >
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}

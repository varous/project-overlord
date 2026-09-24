import { Issuer, generators } from "openid-client";
import type { BaseClient, TokenSet } from "openid-client";
import { config } from "../config.js";

const GOOGLE_ISSUER = "https://accounts.google.com";

let clientPromise: Promise<BaseClient> | null = null;

export function redirectUri(): string {
  return `${config.PUBLIC_BASE_URL}/api/auth/callback`;
}

export async function getGoogleClient(): Promise<BaseClient> {
  if (!clientPromise) {
    clientPromise = Issuer.discover(GOOGLE_ISSUER).then(
      (issuer) =>
        new issuer.Client({
          client_id: config.GOOGLE_CLIENT_ID,
          client_secret: config.GOOGLE_CLIENT_SECRET,
          redirect_uris: [redirectUri()],
          response_types: ["code"],
        }),
    );
  }
  return clientPromise;
}

/** Test hook — replace the discovered client without hitting Google. */
export function setGoogleClientForTests(client: BaseClient | null): void {
  clientPromise = client ? Promise.resolve(client) : null;
}

export type OidcStart = {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
};

export async function startGoogleLogin(): Promise<OidcStart> {
  const client = await getGoogleClient();
  const state = generators.state();
  const nonce = generators.nonce();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);

  const url = client.authorizationUrl({
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    hd: config.ALLOWED_HD,
    prompt: "select_account",
  });

  return { url, state, nonce, codeVerifier };
}

export async function finishGoogleLogin(
  callbackUrl: string,
  checks: { state: string; nonce: string; codeVerifier: string },
): Promise<TokenSet> {
  const client = await getGoogleClient();
  const params = client.callbackParams(callbackUrl);
  return client.callback(redirectUri(), params, {
    state: checks.state,
    nonce: checks.nonce,
    code_verifier: checks.codeVerifier,
  });
}

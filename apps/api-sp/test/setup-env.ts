/**
 * Must load before any module that imports config.ts — that module exits the
 * process on missing secrets.
 */
process.env.NODE_ENV ??= "test";
process.env.PORT ??= "8080";
process.env.PUBLIC_BASE_URL ??= "http://localhost:8080";
process.env.DATABASE_URL ??=
  "postgresql://showplan:showplan@localhost:5432/showplan_test?connection_limit=5";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret-do-not-leak";
process.env.ALLOWED_HD ??= "clockwork-av.com";
process.env.SESSION_SECRET ??= "0123456789abcdef0123456789abcdef";

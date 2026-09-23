/** Error response body shape used by every route. */

export interface ApiErrorBody {
  error: string;
  message?: string;
  details?: unknown;
}

export function errorBody(error: string, message?: string, details?: unknown): ApiErrorBody {
  const body: ApiErrorBody = { error };
  if (message !== undefined) {
    body.message = message;
  }
  if (details !== undefined) {
    body.details = details;
  }
  return body;
}

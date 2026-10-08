/** Codes d'erreur de l'API : jamais de phrase (le client traduit, ADR 0007). */
export type ErrorCode =
  | "invalid_input"
  | "invalid_credentials"
  | "rate_limited"
  | "locked"
  | "weak_password"
  | "username_taken"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_refresh"
  | "refresh_reused"
  | "signup_closed"
  | "conflict"
  | "local_readonly"
  | "internal";

const STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503> = {
  invalid_input: 400,
  weak_password: 400,
  invalid_credentials: 401,
  unauthorized: 401,
  invalid_refresh: 401,
  refresh_reused: 401,
  forbidden: 403,
  signup_closed: 403,
  not_found: 404,
  username_taken: 409,
  conflict: 409,
  rate_limited: 429,
  locked: 429,
  local_readonly: 503,
  internal: 500,
};

export class ApiError extends Error {
  readonly status: (typeof STATUS)[ErrorCode];
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.status = STATUS[code];
  }
}

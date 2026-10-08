/** Client de l'API d'authentification (même origine : le cookie de rafraîchissement part tout seul). */

export type Role = "teacher" | "student";
export type PublicUser = { id: string; role: Role; username: string; displayName: string; locale: "fr" | "en" };
export type TokenResponse = { accessToken: string; expiresIn: number; user: PublicUser };

/** `code` est un code de l'API (`invalid_credentials`…) ou `network` quand le serveur est injoignable. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
  get retryAfterSeconds(): number | undefined {
    const v = this.details["retryAfterSeconds"];
    return typeof v === "number" ? v : undefined;
  }
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function request<T>(
  f: Fetcher,
  method: string,
  path: string,
  o: { body?: unknown; token?: string | null; csrf?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (o.body !== undefined) headers["content-type"] = "application/json";
  if (o.token) headers["authorization"] = `Bearer ${o.token}`;
  if (o.csrf) headers["x-requested-with"] = "toccata";
  let res: Response;
  try {
    res = await f(path, { method, headers, body: o.body === undefined ? null : JSON.stringify(o.body), credentials: "same-origin" });
  } catch {
    throw new ApiError("network", 0);
  }
  if (res.status === 204) return undefined as T;
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* corps vide ou non JSON */
  }
  if (!res.ok) {
    const { error, ...details } = (json ?? {}) as { error?: string };
    throw new ApiError(typeof error === "string" ? error : res.status >= 500 ? "internal" : "unknown", res.status, details);
  }
  return json as T;
}

export const authApi = (f: Fetcher) => ({
  login: (username: string, password: string) => request<TokenResponse>(f, "POST", "/api/auth/login", { body: { username, password } }),
  signupTeacher: (b: { username: string; displayName: string; password: string; locale: "fr" | "en"; inviteCode?: string }) =>
    request<TokenResponse>(f, "POST", "/api/auth/teachers", { body: b }),
  refresh: () => request<TokenResponse>(f, "POST", "/api/auth/refresh", { csrf: true }),
  logout: () => request<void>(f, "POST", "/api/auth/logout", { csrf: true }),
});

export type ClassSummary = { id: string; name: string; studentCount: number };
export type StudentSummary = { id: string; username: string; displayName: string };
export type NewStudent = StudentSummary & { passphrase: string };

export const classesApi = (f: Fetcher, token: () => Promise<string>) => ({
  list: async () => request<ClassSummary[]>(f, "GET", "/api/classes", { token: await token() }),
  create: async (name: string) => request<{ id: string; name: string }>(f, "POST", "/api/classes", { token: await token(), body: { name } }),
  get: async (id: string) => request<{ id: string; name: string; students: StudentSummary[] }>(f, "GET", `/api/classes/${encodeURIComponent(id)}`, { token: await token() }),
  addStudents: async (id: string, names: string[]) => request<{ students: NewStudent[] }>(f, "POST", `/api/classes/${encodeURIComponent(id)}/students`, { token: await token(), body: { names } }),
  resetPassword: async (id: string, sid: string) => request<{ id: string; username: string; passphrase: string }>(f, "POST", `/api/classes/${encodeURIComponent(id)}/students/${encodeURIComponent(sid)}/reset-password`, { token: await token() }),
  removeStudent: async (id: string, sid: string) => request<void>(f, "DELETE", `/api/classes/${encodeURIComponent(id)}/students/${encodeURIComponent(sid)}`, { token: await token() }),
});

export type InstanceRef = { id: string; memberIds: string[] };
export type ActivityRef = { id: string; instances: InstanceRef[] };
export type Membership = { activityId: string; instanceId: string };

export const activitiesApi = (f: Fetcher, token: () => Promise<string>) => ({
  list: async () => request<ActivityRef[]>(f, "GET", "/api/activities", { token: await token() }),
  /** Approvisionne la base `master_<id>` (droits, règles d'écriture) ; le contenu est ensuite écrit par le client. */
  create: async () => request<{ id: string; dbName: string }>(f, "POST", "/api/activities", { token: await token() }),
  /** Crée la base d'une instance et y inscrit ces élèves ; la définition est ensuite écrite par le client. */
  createInstance: async (activityId: string, memberIds: string[]) =>
    request<{ id: string; dbName: string }>(f, "POST", `/api/activities/${encodeURIComponent(activityId)}/instances`, { token: await token(), body: { memberIds } }),
  setMembers: async (instanceId: string, memberIds: string[]) =>
    request<{ memberIds: string[] }>(f, "PUT", `/api/instances/${encodeURIComponent(instanceId)}/members`, { token: await token(), body: { memberIds } }),
  /** Les inscriptions de la personne connectée (élève). */
  memberships: async () => request<Membership[]>(f, "GET", "/api/me/memberships", { token: await token() }),
});

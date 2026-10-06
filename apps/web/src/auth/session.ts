import { useSyncExternalStore } from "react";
import { ApiError, authApi, type Fetcher, type PublicUser, type TokenResponse } from "./api";

export type SessionState = {
  /** `unknown` : démarrage, on ne sait pas encore. */
  status: "unknown" | "authenticated" | "anonymous";
  user: PublicUser | null;
  /** Session retrouvée dans le cache faute de réseau : l'application s'ouvre sur les données locales, la synchronisation attend. */
  offline: boolean;
};

const PROFILE_KEY = "toccata.profile";
/** On renouvelle le jeton une minute avant son expiration. */
const EARLY_MS = 60_000;

type Deps = {
  fetch: Fetcher;
  now: () => number;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  setTimer: (f: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
};

const realDeps = (): Deps => ({
  fetch: (i, init) => fetch(i, init),
  now: Date.now,
  storage: (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })(),
  setTimer: (f, ms) => setTimeout(f, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});

/**
 * Session côté navigateur.
 *  - le jeton d'accès reste EN MÉMOIRE (jamais dans localStorage) ;
 *  - seul le profil public est mis en cache, pour ouvrir l'application hors ligne ;
 *  - le renouvellement est à vol unique : dix requêtes simultanées n'envoient qu'un seul /auth/refresh.
 */
export class Session {
  private state: SessionState = { status: "unknown", user: null, offline: false };
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<boolean> | null = null;
  private timer: unknown = null;
  private listeners = new Set<() => void>();
  private api;
  constructor(private d: Deps = realDeps()) {
    this.api = authApi(d.fetch);
  }

  /* ---------------------------------------------------------------- état observable */

  getState = (): SessionState => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private set(s: SessionState) {
    this.state = s;
    for (const l of this.listeners) l();
  }

  private cached(): PublicUser | null {
    try {
      const raw = this.d.storage?.getItem(PROFILE_KEY);
      return raw ? (JSON.parse(raw) as PublicUser) : null;
    } catch {
      return null;
    }
  }

  private accept(r: TokenResponse) {
    this.token = r.accessToken;
    this.expiresAt = this.d.now() + r.expiresIn * 1000;
    try {
      this.d.storage?.setItem(PROFILE_KEY, JSON.stringify(r.user));
    } catch {
      /* stockage plein ou bloqué : l'ouverture hors ligne sera simplement impossible */
    }
    this.set({ status: "authenticated", user: r.user, offline: false });
    this.schedule();
  }

  private schedule() {
    if (this.timer) this.d.clearTimer(this.timer);
    const wait = Math.max(5_000, this.expiresAt - this.d.now() - EARLY_MS);
    this.timer = this.d.setTimer(() => void this.refresh(), wait);
  }

  private clear(status: "anonymous") {
    this.token = null;
    this.expiresAt = 0;
    if (this.timer) this.d.clearTimer(this.timer);
    this.timer = null;
    try {
      this.d.storage?.removeItem(PROFILE_KEY);
    } catch {
      /* ignoré */
    }
    this.set({ status, user: null, offline: false });
  }

  /* ---------------------------------------------------------------- actions */

  /** Au démarrage : tente de reprendre la session grâce au cookie ; sans réseau, ouvre le profil en cache. */
  async bootstrap(): Promise<void> {
    await this.refresh();
  }

  /** Renouvelle le jeton. Renvoie `true` si on a un jeton valide après coup. */
  refresh(): Promise<boolean> {
    this.inflight ??= (async () => {
      try {
        this.accept(await this.api.refresh());
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.code === "network") {
          const profile = this.cached();
          if (profile) {
            this.token = null;
            this.set({ status: "authenticated", user: profile, offline: true });
            // on réessaiera au retour du réseau (voir `online` dans watchNetwork)
            return false;
          }
          this.set({ status: "anonymous", user: null, offline: false });
          return false;
        }
        this.clear("anonymous"); // refus du serveur : session expirée, révoquée ou rejouée
        return false;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  async login(username: string, password: string): Promise<PublicUser> {
    const r = await this.api.login(username, password);
    this.accept(r);
    return r.user;
  }

  async signupTeacher(b: Parameters<ReturnType<typeof authApi>["signupTeacher"]>[0]): Promise<PublicUser> {
    const r = await this.api.signupTeacher(b);
    this.accept(r);
    return r.user;
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout();
    } catch {
      /* hors ligne : on efface quand même la session locale ; le cookie expirera ou sera révoqué à la prochaine connexion */
    }
    this.clear("anonymous");
  }

  /** Jeton d'accès valable (renouvelé si besoin). Lève `unauthorized` s'il n'y a pas de session, `network` hors ligne. */
  async getAccessToken(): Promise<string> {
    if (this.token && this.expiresAt - this.d.now() > 5_000) return this.token;
    if (await this.refresh()) return this.token!;
    throw new ApiError(this.state.offline ? "network" : "unauthorized", this.state.offline ? 0 : 401);
  }

  /**
   * `fetch` authentifié. Sur 400/401/403 on renouvelle le jeton UNE fois et on rejoue : un jeton expiré
   * (400/401 selon la cause) ou des droits qui viennent de changer (403, ex. élève nouvellement inscrit).
   */
  authorizedFetch: Fetcher = async (input, init = {}) => {
    const run = async (token: string) => {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      return this.d.fetch(input, { ...init, headers });
    };
    let res = await run(await this.getAccessToken());
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      this.expiresAt = 0; // force un vrai renouvellement
      if (await this.refresh()) res = await run(this.token!);
    }
    return res;
  };

  /** À appeler une fois : se resynchronise au retour du réseau et quand l'onglet redevient visible. */
  watchNetwork(target: Pick<Window, "addEventListener"> & { document?: Pick<Document, "addEventListener" | "visibilityState"> } = window): void {
    const retry = () => {
      if (this.state.status === "authenticated" && (this.state.offline || this.expiresAt - this.d.now() < EARLY_MS)) void this.refresh();
    };
    target.addEventListener("online", retry);
    target.document?.addEventListener("visibilitychange", () => target.document?.visibilityState === "visible" && retry());
  }
}

export const session = new Session();
export const useSession = (): SessionState => useSyncExternalStore(session.subscribe, session.getState, session.getState);


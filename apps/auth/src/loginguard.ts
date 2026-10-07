import { ApiError } from "./errors";
import { RateLimiter } from "./ratelimit";

/**
 * Garde de connexion : limitation sur QUATRE axes, pensée pour un établissement où toute une classe
 * partage la même adresse IP (NAT).
 *
 *  1. par identifiant : les essais sur un même compte (le verrouillage progressif est dans l'application) ;
 *  2. par adresse IP : seuls les ÉCHECS comptent, jamais les succès : 30 élèves qui se connectent en même
 *     temps ne se bloquent pas entre eux ;
 *  3. par adresse IP, identifiants DISTINCTS en échec : signature d'une attaque « horizontale » (le même
 *     mot de passe courant essayé sur des centaines de comptes), que le verrouillage par compte ne voit jamais ;
 *  4. global : trop d'échecs toutes adresses confondues (force brute distribuée) → mode « sous attaque »
 *     pendant 10 minutes, où les seuils 2 et 3 sont fortement resserrés. On ne coupe jamais tout le service :
 *     les connexions réussies de visiteurs sans échec récent continuent de passer.
 */
export type GuardOptions = {
  now?: () => number;
  /** Appelé une fois à l'entrée en mode « sous attaque » (journal, alerte). */
  onAttack?: (info: { failuresPerMinute: number }) => void;
  ipAttempts?: number;
  ipFailures?: number;
  ipDistinct?: number;
  userAttempts?: number;
  globalFailuresPerMinute?: number;
  attackFailures?: number;
  attackDistinct?: number;
  attackMs?: number;
};

const WINDOW = 10 * 60_000;

export class LoginGuard {
  private now: () => number;
  private o: Required<Omit<GuardOptions, "now" | "onAttack">>;
  private ipAttempts: RateLimiter;
  private userAttempts: RateLimiter;
  private distinct = new Map<string, Map<string, number>>(); // ip → (identifiant → dernier échec)
  private attackUntil = 0;
  private onAttack: GuardOptions["onAttack"];

  constructor(opts: GuardOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.onAttack = opts.onAttack;
    this.o = {
      ipAttempts: opts.ipAttempts ?? 300, // toutes tentatives, par 5 min : borne le coût de calcul sans gêner une classe
      ipFailures: opts.ipFailures ?? 60, // échecs par 10 min et par IP
      ipDistinct: opts.ipDistinct ?? 40, // identifiants distincts en échec par 10 min et par IP
      userAttempts: opts.userAttempts ?? 20, // tentatives par 15 min sur un même identifiant
      globalFailuresPerMinute: opts.globalFailuresPerMinute ?? 500,
      attackFailures: opts.attackFailures ?? 10,
      attackDistinct: opts.attackDistinct ?? 5,
      attackMs: opts.attackMs ?? WINDOW,
    };
    this.ipAttempts = new RateLimiter(this.o.ipAttempts, 5 * 60_000, this.now);
    this.userAttempts = new RateLimiter(this.o.userAttempts, 15 * 60_000, this.now);
  }

  get underAttack(): boolean {
    return this.now() < this.attackUntil;
  }

  /** Avant de vérifier un mot de passe. Lève `rate_limited` avec le délai d'attente. */
  check(ip: string, username: string): void {
    const t = this.now();
    this.refuse(this.ipAttempts.hit(`a:${ip}`));
    this.refuse(this.userAttempts.hit(`u:${username}`));
    const maxFail = this.underAttack ? this.o.attackFailures : this.o.ipFailures;
    const maxDistinct = this.underAttack ? this.o.attackDistinct : this.o.ipDistinct;
    const fails = this.failuresOf(ip, t);
    if (fails.count >= maxFail) this.refuse(Math.max(1000, WINDOW - (t - fails.oldest)));
    if (this.distinctOf(ip, t) >= maxDistinct && !this.distinct.get(ip)?.has(username)) this.refuse(Math.max(1000, WINDOW / 2));
  }

  recordFailure(ip: string, username: string): void {
    const t = this.now();
    this.ipFailuresHits(ip).push(t);
    const m = this.distinct.get(ip) ?? new Map<string, number>();
    m.set(username, t);
    this.distinct.set(ip, m);
    const perMinute = this.globalCount(t);
    if (!this.underAttack && perMinute >= this.o.globalFailuresPerMinute) {
      this.attackUntil = t + this.o.attackMs;
      this.onAttack?.({ failuresPerMinute: perMinute });
    }
  }

  recordSuccess(_ip: string, username: string): void {
    this.userAttempts.reset(`u:${username}`);
  }

  /* ---------------------------------------------------------------- internes */

  private fails = new Map<string, number[]>();
  private ipFailuresHits(ip: string): number[] {
    let a = this.fails.get(ip);
    if (!a) this.fails.set(ip, (a = []));
    return a;
  }
  private failuresOf(ip: string, t: number): { count: number; oldest: number } {
    const a = this.ipFailuresHits(ip);
    while (a.length && t - a[0]! >= WINDOW) a.shift();
    if (a.length === 0) this.fails.delete(ip);
    return { count: a.length, oldest: a[0] ?? t };
  }
  private distinctOf(ip: string, t: number): number {
    const m = this.distinct.get(ip);
    if (!m) return 0;
    for (const [u, at] of m) if (t - at >= WINDOW) m.delete(u);
    if (m.size === 0) this.distinct.delete(ip);
    return m.size;
  }
  private globalHits: number[] = [];
  private globalCount(t: number): number {
    this.globalHits.push(t);
    while (this.globalHits.length && t - this.globalHits[0]! >= 60_000) this.globalHits.shift();
    return this.globalHits.length;
  }
  private refuse(waitMs: number): void {
    if (waitMs > 0) throw new ApiError("rate_limited", { retryAfterSeconds: Math.ceil(waitMs / 1000) });
  }
}

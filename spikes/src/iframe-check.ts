// Spike (e) — quelles apps web tierces acceptent d'être intégrées en iframe ?
// Usage : pnpm tsx src/iframe-check.ts
const URLS = [
  "https://annuel2.framapad.org/",
  "https://framacalc.org/",
  "https://fr.vikidia.org/wiki/Accueil",
  "https://fr.wikipedia.org/wiki/Accueil",
  "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://docs.google.com/",
  "https://www.geogebra.org/classic",
  "https://scratch.mit.edu/projects/editor/",
  "https://wordwall.net/",
  "https://padlet.com/",
  "https://www.canva.com/",
];

type Verdict = "embarquable" | "bloqué" | "inconnu";

function verdict(h: Headers): { v: Verdict; why: string } {
  const xfo = h.get("x-frame-options");
  const csp = h.get("content-security-policy") ?? "";
  const fa = /frame-ancestors\s+([^;]+)/i.exec(csp)?.[1]?.trim();
  if (xfo && /deny|sameorigin/i.test(xfo)) return { v: "bloqué", why: `X-Frame-Options: ${xfo}` };
  if (fa && !/\*/.test(fa)) return { v: "bloqué", why: `frame-ancestors ${fa}` };
  return { v: "embarquable", why: xfo ? `XFO ${xfo}` : fa ? `frame-ancestors ${fa}` : "aucun en-tête restrictif" };
}

for (const url of URLS) {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "toccata-spike" } });
    const { v, why } = verdict(r.headers);
    console.log(`${v.padEnd(12)} ${r.status} ${url}  (${why})`);
  } catch (e) {
    console.log(`${"inconnu".padEnd(12)} --- ${url}  (${(e as Error).message})`);
  }
}
export {};

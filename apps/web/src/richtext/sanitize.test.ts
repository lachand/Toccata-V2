import { describe, expect, it } from "vitest";
import { htmlToText, sanitizeHtml } from "./sanitize";

describe("sanitizeHtml (liste blanche)", () => {
  it("garde la mise en forme de base", () => {
    expect(sanitizeHtml("<p>Un <strong>mot</strong> et <em>un autre</em></p><ul><li>a</li></ul>")).toBe("<p>Un <strong>mot</strong> et <em>un autre</em></p><ul><li>a</li></ul>");
  });

  it.each([
    ["script", "<p>ok</p><script>alert(1)</script>"],
    ["gestionnaire d'événement", '<p onclick="alert(1)">ok</p>'],
    ["img onerror", '<img src=x onerror="alert(1)">'],
    ["iframe", '<iframe src="https://evil.example"></iframe>'],
    ["style en ligne", '<p style="position:fixed">ok</p>'],
    ["svg", "<svg onload=alert(1)></svg>"],
    ["form", '<form action="https://evil.example"><input></form>'],
    ["lien javascript", '<a href="javascript:alert(1)">x</a>'],
    ["lien data", '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
    ["lien http", '<a href="http://example.org">x</a>'],
    ["lien majuscules/espaces", '<a href=" JaVaScRiPt:alert(1)">x</a>'],
  ])("neutralise : %s", (_n, dirty) => {
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/<script|<img|<iframe|<svg|<form|<input|onerror|onclick|onload|style=|javascript:|data:|href="http:/i);
  });

  it("n'accepte que les liens https, ouverts sans référent ni accès à l'ouvrant", () => {
    const clean = sanitizeHtml('<a href="https://example.org/a">x</a>');
    expect(clean).toContain('href="https://example.org/a"');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  it("est idempotent", () => {
    const once = sanitizeHtml('<p>x <a href="https://a.example">l</a><script>1</script></p>');
    expect(sanitizeHtml(once)).toBe(once);
  });
});

describe("htmlToText", () => {
  it("retire les balises et compacte les espaces", () => {
    expect(htmlToText("<h2>Titre</h2><p>Un   <strong>texte</strong></p><script>x()</script>")).toBe("TitreUn texte");
  });
});

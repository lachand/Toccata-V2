import DOMPurify from "dompurify";

/**
 * Seule porte d'entrée du HTML dans l'application (consignes, plus tard messages et notes).
 * Liste blanche stricte : mise en forme de base et liens `https:`. Rien d'exécutable, aucun style en ligne,
 * aucune image ni iframe (les ressources passent par l'assistant, qui contrôle leur source).
 */
const ALLOWED_TAGS = ["p", "br", "strong", "em", "u", "s", "code", "pre", "blockquote", "h2", "h3", "ul", "ol", "li", "a"];
const ALLOWED_ATTR = ["href"];

let configured = false;
function purifier() {
  if (!configured) {
    configured = true;
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.nodeName !== "A") return;
      const href = node.getAttribute("href") ?? "";
      if (!/^https:\/\//i.test(href)) node.removeAttribute("href");
      else {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
  }
  return DOMPurify;
}

export function sanitizeHtml(dirty: string): string {
  return purifier().sanitize(dirty, { ALLOWED_TAGS, ALLOWED_ATTR: [...ALLOWED_ATTR, "target", "rel"], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false });
}

/** Texte brut d'un HTML (aperçus, comptage) : jamais d'injection, les balises sont retirées. */
export function htmlToText(html: string): string {
  return purifier().sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, " ").trim();
}

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR code généré localement (aucun service tiers), affiché en image : le texte n'est jamais injecté comme HTML. */
export function QrImage({ text, alt, size = 144 }: { text: string; alt: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((svg) => {
      if (live) setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    });
    return () => {
      live = false;
    };
  }, [text]);
  return src ? <img src={src} alt={alt} width={size} height={size} /> : <span style={{ inlineSize: size, blockSize: size, display: "inline-block" }} role="img" aria-label={alt} />;
}

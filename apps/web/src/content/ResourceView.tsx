import { useLingui } from "@lingui/react/macro";
import type { ResourceDoc } from "@toccata/schema";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { ExternalFrame } from "../apps/ExternalFrame";
import { fileKind } from "../data/files";
import { useWorkspace } from "../data/provider";

/** `undefined` : chargement ; `null` : indisponible (hors ligne et jamais ouvert sur cet appareil). */
function useFileUrl(activityId: string, fileId: string): string | null | undefined {
  const ws = useWorkspace();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setUrl(undefined);
    void ws?.fileUrl(activityId, fileId).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [ws, activityId, fileId]);
  return url;
}

function FileView({ activityId, name, source }: { activityId: string; name: string; source: Extract<ResourceDoc["source"], { type: "file" }> }) {
  const { t } = useLingui();
  const url = useFileUrl(activityId, source.fileId);
  if (url === undefined) return <p style={{ margin: 0, color: "var(--muted)" }}>{t`Loading…`}</p>;
  if (url === null) return <p style={{ margin: 0, color: "var(--muted)" }}>{t`This file is not available offline yet. Open it once while connected.`}</p>;
  const kind = fileKind(source.mime);
  const style = { maxInlineSize: "100%", borderRadius: "var(--radius)" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {kind === "image" ? <img src={url} alt={name} style={{ ...style, maxBlockSize: "60vh", objectFit: "contain" }} /> : null}
      {kind === "video" ? <video src={url} controls style={style} aria-label={name} /> : null}
      {kind === "audio" ? <audio src={url} controls aria-label={name} /> : null}
      <a href={url} download={name} target={kind === "pdf" ? "_blank" : undefined} rel="noopener noreferrer">
        <Download size={14} aria-hidden="true" /> {kind === "pdf" ? t`Open the PDF` : t`Download`}
      </a>
    </div>
  );
}

export function ResourceView({ activityId, resource }: { activityId: string; resource: ResourceDoc }) {
  return resource.source.type === "url" ? (
    <ExternalFrame url={resource.source.url} display={resource.source.display} title={resource.name} />
  ) : (
    <FileView activityId={activityId} name={resource.name} source={resource.source} />
  );
}

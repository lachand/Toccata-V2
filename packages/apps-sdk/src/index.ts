import type { ComponentType } from "react";
import type { AppDoc, InstanceScopedDoc } from "@toccata/schema";

/**
 * Contrat d'une application intégrée (chrono, kanban, texte, questionnaire, application externe…).
 *
 * Une application a trois faces, qui partagent les mêmes composants en édition et en exécution
 * (principe de l'article : même interface pour préparer, aperçu fidèle et séance) :
 *  - `Editor`  : configure l'application (enseignant) ;
 *  - `Runtime` : l'application telle que les participants la voient et l'utilisent ;
 *  - `MonitorTile` : résumé pour l'écran de suivi (Phase 5).
 *
 * Le paquet ne contient aucun texte : les libellés viennent de `useLabels` (le module, côté application, utilise Lingui).
 */
export type AppType = AppDoc["type"];
export type AppOf<T extends AppType> = Extract<AppDoc, { type: T }>;
export type AppConfig<T extends AppType> = AppOf<T>["config"];

export type Viewer = Readonly<{ id: string; role: "teacher" | "student" }>;

/** Genres de documents d'exécution qu'une application lit et écrit dans la base de son instance. */
export type RuntimeKind = Extract<InstanceScopedDoc["kind"], "timerstate" | "kanbancard" | "yupdate" | "formanswer">;
export type RuntimeDoc<K extends RuntimeKind = RuntimeKind> = Extract<InstanceScopedDoc, { kind: K }>;
/** Document à écrire : l'identité, l'auteur et les dates sont renseignés par le magasin. */
export type NewRuntimeDoc<K extends RuntimeKind = RuntimeKind> = K extends RuntimeKind ? Omit<RuntimeDoc<K>, "id" | "authorId" | "createdAt" | "updatedAt"> & { id?: string } : never;

/**
 * Accès d'une application aux données de son instance. L'implémentation est fournie par l'hôte :
 * l'aperçu de l'éditeur écrit dans une instance locale non répliquée, la séance dans `inst_<id>`.
 */
export interface InstanceStore {
  readonly viewer: Viewer;
  /** Heure serveur estimée (ms depuis l'epoch) : corrige le décalage d'horloge de l'appareil. */
  serverNow(): number;
  /** Documents d'un genre pour une application ; `cb` est appelé tout de suite puis à chaque changement. Renvoie la fonction d'arrêt. */
  watch<K extends RuntimeKind>(kind: K, appId: string, cb: (docs: RuntimeDoc<K>[]) => void): () => void;
  put<K extends RuntimeKind>(doc: NewRuntimeDoc<K>): Promise<string>;
  remove(id: string): Promise<void>;
}

export type EditorProps<T extends AppType> = { app: AppOf<T>; onChange: (config: AppConfig<T>) => void };
export type RuntimeProps<T extends AppType> = { app: AppOf<T>; store: InstanceStore };

export type AppLabels = Readonly<{
  /** Nom du type d'application, ex. « Minuteur ». */
  typeName: string;
  /** Une phrase qui dit à quoi elle sert (assistant d'ajout). */
  description: string;
  /** Nom proposé à la création. */
  defaultName: string;
}>;

export interface AppModule<T extends AppType> {
  readonly type: T;
  /** Hook : libellés dans la langue courante. */
  useLabels(): AppLabels;
  Icon: ComponentType<{ size?: number }>;
  defaultConfig(): AppConfig<T>;
  /** Absent : rien à configurer. */
  Editor?: ComponentType<EditorProps<T>>;
  Runtime: ComponentType<RuntimeProps<T>>;
}

export type AppRegistry = { [T in AppType]?: AppModule<T> };

/** Registre typé : `register` vérifie qu'un module correspond bien à son type. */
export function createRegistry() {
  const modules = new Map<AppType, AppModule<AppType>>();
  return {
    register<T extends AppType>(m: AppModule<T>): void {
      if (modules.has(m.type)) throw new Error(`application déjà enregistrée : ${m.type}`);
      modules.set(m.type, m as unknown as AppModule<AppType>);
    },
    get<T extends AppType>(type: T): AppModule<T> | undefined {
      return modules.get(type) as unknown as AppModule<T> | undefined;
    },
    list(): AppModule<AppType>[] {
      return [...modules.values()];
    },
  };
}
export type Registry = ReturnType<typeof createRegistry>;

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { AccountStore } from "./accounts";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { CouchAdmin } from "./couch";
import { Provisioner } from "./provisioning";
import { Reconciler } from "./replication";

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (e) {
  console.error((e as Error).message); // liste les variables en cause, jamais leurs valeurs
  process.exit(1);
}
const couch = new CouchAdmin(config.COUCHDB_URL, config.COUCHDB_ADMIN_USER, config.COUCHDB_ADMIN_PASSWORD);
const accounts = new AccountStore(couch, config.ACCOUNTS_DB);
await accounts.init();
const provisioner = new Provisioner(couch);
// provisionnement des deux côtés ; en mode local, aussi les réplications avec l'amont (voir replication.ts)
const reconciler = new Reconciler(config, accounts, couch, provisioner);
reconciler.start(config.RECONCILE_SECONDS * 1000);
const api = createApp({ config, accounts, provisioner, reconciler });
const app = new Hono().route(config.BASE_PATH, api);
serve({ fetch: app.fetch, port: config.PORT }, (info) => console.log(`auth : http://localhost:${info.port}${config.BASE_PATH}`));

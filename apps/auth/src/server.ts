import { serve } from "@hono/node-server";
import { AccountStore } from "./accounts";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { CouchAdmin } from "./couch";
import { Provisioner } from "./provisioning";

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
const app = createApp({ config, accounts, provisioner: new Provisioner(couch) });
serve({ fetch: app.fetch, port: config.PORT }, (info) => console.log(`auth : http://localhost:${info.port}`));

// Proxy HTTP « coupable » pour simuler une coupure d'Internet entre un serveur de classe et le cloud.
// Usage en test : const p = await startProxy({ target: "http://127.0.0.1:5984" }); p.setOn(false) coupe, p.setOn(true) rétablit.
// En ligne de commande : node tools/switchable-proxy.mjs <portÉcoute> <cible>   puis   GET /__proxy/off  |  /__proxy/on
import http from "node:http";
import net from "node:net";

export async function startProxy({ target, port = 0, host = "0.0.0.0" }) {
  const t = new URL(target);
  let on = true;
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/__proxy/")) {
      on = req.url.endsWith("/on");
      if (!on) for (const s of sockets) s.destroy(); // coupe aussi les connexions déjà ouvertes (flux `_changes` en attente)
      res.end(on ? "on" : "off");
      return;
    }
    if (!on) return void req.socket.destroy();
    const up = http.request({ host: t.hostname, port: t.port || 80, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => res.destroy());
    sockets.add(req.socket);
    sockets.add(up.socket ?? req.socket);
    res.on("close", () => up.destroy());
    req.pipe(up);
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise((r) => server.listen(port, host, r));
  const actual = /** @type {net.AddressInfo} */ (server.address()).port;
  return {
    port: actual,
    get isOn() {
      return on;
    },
    setOn(v) {
      on = v;
      if (!v) for (const s of sockets) s.destroy();
    },
    close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => r()))),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , port, target] = process.argv;
  const p = await startProxy({ target: target ?? "http://127.0.0.1:5984", port: Number(port ?? 5990) });
  console.log(`proxy coupable : :${p.port} → ${target}`);
}

import { createServer, request as httpRequest } from "node:http";
import { connect as connectTcp } from "node:net";
import { networkInterfaces } from "node:os";

const PORT = Number(process.env.PAPERLENS_PORT || 3000);
const TARGET_HOST = "::1";
const TARGET_AUTHORITY = `localhost:${PORT}`;

function findUsbAddress() {
  if (process.env.PAPERLENS_USB_HOST) return process.env.PAPERLENS_USB_HOST;
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (!name.startsWith("en")) continue;
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && entry.address.startsWith("169.254.")) {
        return entry.address;
      }
    }
  }
  return "";
}

function proxyHeaders(headers) {
  const next = { ...headers, host: TARGET_AUTHORITY, "x-forwarded-host": TARGET_AUTHORITY, "x-forwarded-proto": "http" };
  if (next.origin) next.origin = `http://${TARGET_AUTHORITY}`;
  if (next.referer) next.referer = next.referer.replace(/^http:\/\/[^/]+/, `http://${TARGET_AUTHORITY}`);
  return next;
}

function startGateway(host) {
  const server = createServer((incoming, outgoing) => {
    const upstream = httpRequest({
      hostname: TARGET_HOST,
      family: 6,
      port: PORT,
      method: incoming.method,
      path: incoming.url,
      headers: proxyHeaders(incoming.headers),
    }, (response) => {
      response.on("error", () => outgoing.destroy());
      outgoing.writeHead(response.statusCode || 502, response.headers);
      response.pipe(outgoing);
    });
    const closeUpstream = () => {
      if (!upstream.destroyed) upstream.destroy();
    };
    incoming.on("aborted", closeUpstream);
    incoming.on("error", closeUpstream);
    outgoing.on("error", closeUpstream);
    upstream.on("error", (error) => {
      // Safari routinely resets speculative or cancelled requests. Keep that
      // connection failure local instead of terminating the USB gateway.
      if (outgoing.destroyed) return;
      if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      outgoing.end(`PaperLens 尚未就绪：${error.message}`);
    });
    incoming.pipe(upstream);
  });

  server.on("upgrade", (incoming, socket, head) => {
    const upstream = connectTcp({ host: TARGET_HOST, port: PORT, family: 6 }, () => {
      const headers = proxyHeaders(incoming.headers);
      const headerLines = Object.entries(headers).map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`);
      upstream.write(`${incoming.method} ${incoming.url} HTTP/${incoming.httpVersion}\r\n${headerLines.join("\r\n")}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    const destroyPair = () => {
      if (!socket.destroyed) socket.destroy();
      if (!upstream.destroyed) upstream.destroy();
    };
    socket.on("error", destroyPair);
    upstream.on("error", destroyPair);
  });

  server.on("clientError", (_error, socket) => socket.destroy());

  server.listen(PORT, host, () => {
    console.log(`PaperLens iPad USB: http://${host}:${PORT}`);
  });
}

function waitForUsb() {
  const address = findUsbAddress();
  if (address) {
    startGateway(address);
    return;
  }
  console.log("PaperLens iPad USB: waiting for a connected iPad network interface…");
  setTimeout(waitForUsb, 2000);
}

waitForUsb();

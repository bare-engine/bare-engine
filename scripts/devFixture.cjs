const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const fixtureDir = path.resolve(__dirname, "../features/fixtures");
const publicDir = path.join(fixtureDir, "public");
const viteConfig = path.join(fixtureDir, "vite.e2e.config.cjs");

const requestedScene = process.argv[2] || "";
const startPort = Number(process.env.PORT || 5173);
const shouldOpen = process.env.OPEN !== "0";

function injectBrowserScript(html) {
  const sceneScript = requestedScene
    ? `
<script>
  (function startRequestedScene() {
    const scene = ${JSON.stringify(requestedScene)};
    const deadline = Date.now() + 5000;

    function tryStart() {
      if (window.__bareBrowserTests) {
        window.__bareBrowserTests.start(scene).then((result) => {
          console.log("Started browser scene:", result);
        });
        return;
      }

      if (Date.now() < deadline) {
        setTimeout(tryStart, 50);
      } else {
        console.error("Bare browser test runner did not become available.");
      }
    }

    tryStart();
  })();
</script>`
    : "";

  return html.replace(
    "<!-- js:bootstrap -->",
    `<script src="/browser-tests.js"></script>${sceneScript}`
  );
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".map")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function listFiles(folderPath, recursive) {
  const publicPath = toPublicRelativePath(folderPath);
  const rootPath = path.resolve(publicDir);
  const fullPath = path.resolve(publicDir, publicPath);

  if (!fullPath.startsWith(rootPath)) {
    return null;
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) {
    return [];
  }

  if (!recursive) {
    return fs.readdirSync(fullPath);
  }

  function getAllFiles(dirPath, files = []) {
    for (const entry of fs.readdirSync(dirPath)) {
      const entryPath = path.join(dirPath, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        getAllFiles(entryPath, files);
      } else {
        files.push(path.relative(fullPath, entryPath));
      }
    }

    return files;
  }

  return getAllFiles(fullPath);
}

function toPublicRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

startViteWatch();

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${server.address()?.port || startPort}`);

  if (url.pathname === "/api/list-files") {
    const files = listFiles(
      url.searchParams.get("path"),
      url.searchParams.get("recursive") === "true"
    );

    if (files === null) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ files }));
    return;
  }

  const fileName = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, fileName));

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Content-Type", contentType(filePath));

  if (filePath.endsWith(".html")) {
    fs.readFile(filePath, "utf8", (readError, html) => {
      if (readError) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.end(injectBrowserScript(html));
    });
    return;
  }

  fs.createReadStream(filePath)
    .on("error", () => {
      response.writeHead(404);
      response.end("Not found");
    })
    .pipe(response);
});

function listen(port) {
  const onError = (error) => {
    if (error.code === "EADDRINUSE") {
      listen(port + 1);
      return;
    }

    throw error;
  };

  server.once("error", onError);
  server.listen(port, "127.0.0.1");
}

server.once("listening", () => {
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/`;
    console.log(`Fixture dev server: ${url}`);

    if (shouldOpen) {
      openBrowser(url);
    }
});

listen(startPort);

function openBrowser(url) {
  const command = process.platform === "win32"
    ? "cmd"
    : process.platform === "darwin"
      ? "open"
      : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", url]
    : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function startViteWatch() {
  const { build } = await import("vite");
  const watcher = await build({
    configFile: viteConfig,
    build: {
      watch: {}
    }
  });

  watcher.on("event", (event) => {
    if (event.code === "BUNDLE_END") {
      console.log(`Fixture bundle ready${requestedScene ? ` for ${requestedScene}` : ""}.`);
    } else if (event.code === "ERROR") {
      console.error(event.error);
    }
  });
}

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const webpack = require("webpack");

const fixtureDir = path.resolve(__dirname, "../features/fixtures");
const publicDir = path.join(fixtureDir, "public");
const webpackConfig = require(path.join(fixtureDir, "webpack.e2e.cjs"));

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

const compiler = webpack(webpackConfig);
compiler.watch({}, (error, stats) => {
  if (error) {
    console.error(error);
    return;
  }

  const info = stats.toJson({ all: false, errors: true, warnings: true });

  if (stats.hasErrors()) {
    console.error(info.errors);
    return;
  }

  if (stats.hasWarnings()) {
    console.warn(info.warnings);
  }

  console.log(`Fixture bundle ready${requestedScene ? ` for ${requestedScene}` : ""}.`);
});

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${server.address()?.port || startPort}`);
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

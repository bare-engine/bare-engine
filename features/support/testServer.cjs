const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { BeforeAll, AfterAll, setWorldConstructor } = require("@cucumber/cucumber");
const { Builder, Browser } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const edge = require("selenium-webdriver/edge");
const firefox = require("selenium-webdriver/firefox");

const publicDir = path.resolve(__dirname, "../fixtures/public");

const browserNames = {
  chrome: Browser.CHROME,
  edge: Browser.EDGE,
  firefox: Browser.FIREFOX,
};

class BareEngineWorld {
  constructor() {
    this.testServerUrl = global.__bareEngineTestServerUrl;
    this.driver = global.__bareEngineDriver;
  }
}

setWorldConstructor(BareEngineWorld);

BeforeAll(async function () {
  const webpackScript = path.resolve(__dirname, "../../node_modules/webpack/bin/webpack.js");
  const webpackConfig = path.resolve(__dirname, "../fixtures/webpack.e2e.cjs");
  const build = spawnSync(process.execPath, [webpackScript, "--config", webpackConfig], {
    cwd: path.resolve(__dirname, "../fixtures"),
    encoding: "utf8",
  });

  if (build.status !== 0) {
    throw new Error(`Failed to build BareEngine test fixture:\n${build.stdout}\n${build.stderr}`);
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const fileName = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(publicDir, fileName);

    if (!filePath.startsWith(publicDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", "*");

    if (filePath.endsWith(".html")) {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      fs.readFile(filePath, "utf8", (error, html) => {
        if (error) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }

        response.end(html.replace("<!-- js:bootstrap -->", '<script src="/browser-tests.js"></script>'));
      });
      return;
    } else if (filePath.endsWith(".js")) {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    }

    fs.createReadStream(filePath)
      .on("error", () => {
        response.writeHead(404);
        response.end("Not found");
      })
      .pipe(response);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  global.__bareEngineTestServer = server;
  global.__bareEngineTestServerUrl = `http://localhost:${server.address().port}`;

  const requestedBrowser = (process.env.BROWSER || "chrome").toLowerCase();
  const browserName = browserNames[requestedBrowser];

  if (!browserName) {
    throw new Error(`Unsupported BROWSER "${requestedBrowser}". Use chrome, edge, or firefox.`);
  }

  const builder = new Builder().forBrowser(browserName);

  if (requestedBrowser === "chrome") {
    builder.setChromeOptions(new chrome.Options()
      .addArguments("--headless=new", "--remote-debugging-pipe", "--log-level=3")
      .excludeSwitches("enable-logging"));
  } else if (requestedBrowser === "edge") {
    builder.setEdgeOptions(new edge.Options()
      .addArguments("--headless=new", "--remote-debugging-pipe", "--log-level=3")
      .excludeSwitches("enable-logging"));
  } else if (requestedBrowser === "firefox") {
    builder.setFirefoxOptions(new firefox.Options().addArguments("-headless"));
  }

  global.__bareEngineDriver = await builder.build();
});

AfterAll(async function () {
  if (global.__bareEngineDriver) {
    await global.__bareEngineDriver.quit();
    global.__bareEngineDriver = undefined;
  }

  if (global.__bareEngineTestServer) {
    await new Promise((resolve) => global.__bareEngineTestServer.close(resolve));
  }
});

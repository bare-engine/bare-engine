const assert = require("node:assert/strict");
const { Given, Then, setDefaultTimeout } = require("@cucumber/cucumber");

setDefaultTimeout(15000);

function getRequestedScene() {
  return process.env.BARE_TEST_SCENE || process.argv.find((arg) => /^[A-Za-z][A-Za-z0-9]*Test$/.test(arg));
}

Given("I open the BareEngine browser test page", async function () {
  await this.driver.get(`${this.testServerUrl}/`);
});

Then("all BareEngine browser scenes should pass", async function () {
  let sceneNames = await this.driver.wait(
    async () => {
      const names = await this.driver.executeScript(() => window.__bareBrowserTests?.names());
      return names?.length ? names : false;
    },
    5000,
    "Expected the BareEngine browser test runner to become available"
  );

  const requestedScene = getRequestedScene();

  if (requestedScene) {
    sceneNames = sceneNames.filter((sceneName) => sceneName === requestedScene);
    assert.notEqual(sceneNames.length, 0, `Unknown browser scene test "${requestedScene}"`);
  }

  const results = [];

  for (const sceneName of sceneNames) {
    const started = await this.driver.executeAsyncScript((name, done) => {
      window.__bareBrowserTests.start(name).then(done, (error) => {
        done({ name, passed: false, error: String(error) });
      });
    }, sceneName);

    if (!started.passed) {
      results.push(started);
      continue;
    }

    let result;
    try {
      result = await this.driver.wait(
        async () => {
          const current = await this.driver.executeScript((name) => window.__bareBrowserTests.check(name), sceneName);
          return current?.passed || current?.error ? current : false;
        },
        5000,
        `Expected BareEngine browser scene "${sceneName}" to pass`
      );
    } catch (error) {
      const current = await this.driver.executeScript((name) => window.__bareBrowserTests.check(name), sceneName);
      const assertions = typeof current?.assertions === "number" ? current.assertions : 0;
      const message = assertions === 0
        ? `Scene did not call assert(). Add at least one assert(...) to the test scene.`
        : error.message;

      result = {
        name: sceneName,
        passed: false,
        assertions,
        error: message,
        errors: [message],
      };
    }

    results.push(result);
  }

  const passedCount = results.filter((result) => result.passed).length;
  const allPassed = passedCount === results.length;
  const color = allPassed ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  console.log(`${results.length} tests (${color}${passedCount} passed${reset})`);

  const longestNameLength = results.reduce((length, result) => Math.max(length, result.name.length), 0);

  for (const result of results) {
    const status = result.passed ? "\x1b[32mpassed\x1b[0m" : "\x1b[31mfailed\x1b[0m";
    const assertionCount = typeof result.assertions === "number"
      ? ` (${result.assertions} ${result.assertions === 1 ? "assertion" : "assertions"})`
      : "";

    const errors = Array.isArray(result.errors) && result.errors.length > 0
      ? result.errors
      : result.error ? [result.error] : [];
    const errorPrefix = " ";
    const plainStatus = status.replace(/\x1b\[[0-9;]*m/g, "");
    const visiblePrefixLength = `${result.name.padEnd(longestNameLength)} (${plainStatus})${assertionCount}${errorPrefix}`.length;
    const messageIndent = " ".repeat(visiblePrefixLength);
    const errorMessage = !result.passed && errors.length > 0
      ? `${errorPrefix}${errors.join(`\n${messageIndent}`)}`
      : "";

    console.log(`${result.name.padEnd(longestNameLength)} (${status})${assertionCount}${errorMessage}`);
  }

  assert.equal(results.length, sceneNames.length);
  assert.equal(allPassed, true, "One or more BareEngine browser scenes failed");
});

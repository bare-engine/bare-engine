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

    assert.equal(started.passed, true, started.error);

    const result = await this.driver.wait(
      async () => {
        const current = await this.driver.executeScript((name) => window.__bareBrowserTests.check(name), sceneName);
        return current?.passed || current?.error ? current : false;
      },
      5000,
      `Expected BareEngine browser scene "${sceneName}" to pass`
    );

    assert.equal(result.passed, true, result.error);
    results.push(result);
  }

  const passedCount = results.filter((result) => result.passed).length;
  const allPassed = passedCount === results.length;
  const color = allPassed ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  console.log(`${results.length} scenes (${color}${passedCount} passed${reset})`);

  assert.equal(results.length, sceneNames.length);
});

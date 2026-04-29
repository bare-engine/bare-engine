const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

class WatchTexturePackImagesPlugin {
    constructor(options = {}) {
        this.watchDir = options.watchDir;
        this.reloadPath = options.reloadPath || "/assets/initial";
        this.buildCommand = options.buildCommand || ["npm", "run", "build:assets"];
        this.buildCwd = options.buildCwd || process.cwd();
        this.debounceMs = options.debounceMs ?? 200;
        this.runOnStart = options.runOnStart ?? false;

        this.watcher = null;
        this.buildTimer = null;
        this.buildInFlight = null;
        this.buildQueued = false;
        this.suppressReload = false;
        this.reloadQueued = false;
        this.devServer = null;
        this.compiler = null;
    }

    apply(compiler) {
        this.compiler = compiler;
    }

    attachDevServer(devServer) {
        this.devServer = devServer;
        this.startWatcher();
        if (this.runOnStart) {
            this.scheduleBuild("dev server start");
        }
    }

    shouldSuppressOk() {
        if (!this.suppressReload) {
            return false;
        }
        this.reloadQueued = true;
        console.log("[dev-server] Suppressing ok reload during assetpack build");
        return true;
    }

    shouldSuppressMessage(type, data) {
        if (!this.suppressReload || !this.shouldSkipReloadType(type) || !this.isInitialAssetsChange(data)) {
            return false;
        }
        this.reloadQueued = true;
        console.log(`[dev-server] Suppressing ${type} during assetpack build`);
        return true;
    }

    startWatcher() {
        if (this.watcher) {
            return;
        }

        if (!this.watchDir || !fs.existsSync(this.watchDir)) {
            console.warn(`[assets] texturePackImages folder not found: ${this.watchDir}`);
            return;
        }

        try {
            this.watcher = fs.watch(
                this.watchDir,
                { recursive: true },
                (eventType, filename) => {
                    const reason = `${eventType}${filename ? `:${filename}` : ""}`;
                    this.scheduleBuild(reason);
                }
            );
            console.log(`[assets] Watching texturePackImages for changes: ${this.watchDir}`);
        } catch (error) {
            console.error("[assets] Failed to watch texturePackImages:", error);
        }
    }

    scheduleBuild(reason) {
        if (this.buildTimer) {
            clearTimeout(this.buildTimer);
        }

        this.buildTimer = setTimeout(() => {
            this.buildTimer = null;
            this.runBuild(reason);
        }, this.debounceMs);
    }

    runBuild(reason) {
        if (this.buildInFlight) {
            this.buildQueued = true;
            console.log(`[assets] Build already running; queued (${reason})`);
            return;
        }

        const [command, ...args] = this.buildCommand;
        const resolvedCommand = process.platform === "win32" && command === "npm"
            ? "npm.cmd"
            : command;

        console.log(`[assets] Running npm run build:assets (${reason})`);
        this.suppressReload = true;
        this.buildInFlight = spawn(resolvedCommand, args, {
            stdio: "inherit",
            cwd: this.buildCwd,
            shell: process.platform === "win32"
        });

        this.buildInFlight.on("close", code => {
            if (code !== 0) {
                console.error(`[assets] build:assets failed with code ${code}`);
            }
            this.buildInFlight = null;
            this.suppressReload = false;

            if (this.reloadQueued) {
                this.reloadQueued = false;
                if (this.devServer && this.devServer.webSocketServer) {
                    console.log("[assets] Triggering single reload after build:assets");
                    this.devServer.sendMessage(
                        this.devServer.webSocketServer.clients,
                        "content-changed",
                        [this.reloadPath]
                    );
                }
            }

            if (this.buildQueued) {
                this.buildQueued = false;
                this.runBuild("queued changes");
            }
        });
    }

    shouldSkipReloadType(type) {
        const skippableTypes = ["static-changed", "content-changed", "invalid"];
        return skippableTypes.includes(type);
    }

    isInitialAssetsChange(data) {
        const matches = value =>
            typeof value === "string"
            && value.replace(/\\/g, "/").includes("assets/initial");

        if (matches(data)) {
            return true;
        }

        if (Array.isArray(data)) {
            return data.some(matches);
        }

        if (data && typeof data === "object") {
            return matches(data.filename)
                || matches(data.path)
                || matches(data.file)
                || matches(data.filepath);
        }

        return false;
    }
}

module.exports = WatchTexturePackImagesPlugin;

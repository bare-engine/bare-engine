class ProjectCompileStatusPlugin {
    constructor(projectTitle) {
        this.projectTitle = projectTitle || "Bare project";
    }

    apply(compiler) {
        compiler.hooks.done.tap("ProjectCompileStatusPlugin", (stats) => {
            if (stats.hasErrors()) {
                return;
            }

            console.log(`[${this.projectTitle}] webpack compiled successfully`);
        });
    }
}

module.exports = ProjectCompileStatusPlugin;
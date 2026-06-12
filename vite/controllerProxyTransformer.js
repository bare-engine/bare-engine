const ts = require("./projectRequire")("typescript");
const fs = require("fs");
const path = require("path");

const allControllerNames = new Set([
    "componentController",
    "hitboxController",
    "mouseController",
    "objectController",
    "particleController",
    "arcadePhysicsController",
    "sopiroPhysicsController",
    "tweenController",
    "cameraHandler",
    "levelHandler",
]);

const controllerImportSources = new Map([
    ["arcadePhysicsController", "bare-engine/arcade"],
    ["sopiroPhysicsController", "bare-engine/sopiro"],
]);

// bare.<module> global shorthands (unassigned BareEngine fields) and the bare-engine export they resolve to.
// Rewritten to an auto-injected import so the module isn't tree-shaken out of project builds.
const bareGlobalModuleImports = new Map([
    ["sound", "soundHandler"],
    ["keyboard", "keyboardController"],
    ["storage", "SaveDataHandler"],
]);

// bare.<module> shorthands (BareEngine scene module fields) and the scene controller they proxy
const bareModuleControllerNames = new Map([
    ["object", "objectController"],
    ["component", "componentController"],
    ["mouse", "mouseController"],
    ["tween", "tweenController"],
    ["particle", "particleController"],
    ["hitbox", "hitboxController"],
    ["arcade", "arcadePhysicsController"],
    ["sopiro", "sopiroPhysicsController"],
    ["level", "levelHandler"],
    ["camera", "cameraHandler"],
]);

// controller name -> Scene field it lives on (scene.tween, scene.level, ...).
// Controller names stay the source-side rewrite triggers; the short field name is the emit target.
const controllerSceneFieldNames = new Map(
    Array.from(bareModuleControllerNames, ([short, long]) => [long, short])
);

function sceneFieldNameFor(controllerName) {
    return controllerSceneFieldNames.get(controllerName) || controllerName;
}

// MODULE FILE (UNDER THE ENGINE src ROOT) FOR EACH SCENE CONTROLLER - USED TO INJECT
// RELATIVE IMPORTS INTO ENGINE SOURCES THAT HARD-DEPEND ON A CONTROLLER (scene.hitbox.X, ...)
const controllerModuleSubpaths = new Map([
    ["objectController", "controllers/objectController"],
    ["componentController", "controllers/componentController"],
    ["mouseController", "controllers/mouseController"],
    ["tweenController", "controllers/tweenController"],
    ["particleController", "controllers/particleController"],
    ["hitboxController", "controllers/hitboxController"],
    ["arcadePhysicsController", "controllers/arcadePhysicsController"],
    ["sopiroPhysicsController", "controllers/sopiroPhysicsController"],
    ["levelHandler", "handlers/levelHandler"],
    ["cameraHandler", "handlers/cameraHandler"],
]);

function normalizeSlashes(value) {
    return value.replace(/\\/g, "/");
}

const engineSrcRoots = (() => {
    const roots = new Set();
    const candidates = [
        path.resolve(process.cwd(), "../BareEngine/src"),
        path.resolve(process.cwd(), "node_modules/bare-engine/src"),
    ];
    for (const candidate of candidates) {
        try {
            roots.add(normalizeSlashes(fs.realpathSync(candidate)));
        } catch (e) {
            // CANDIDATE DOESN'T EXIST IN THIS SETUP
        }
        roots.add(normalizeSlashes(candidate));
    }
    return Array.from(roots);
})();

// RETURNS {root, file} (FORWARD-SLASHED) WHEN THE FILE LIVES UNDER THE ENGINE src ROOT
function getEngineSrcInfo(fileName) {
    const file = normalizeSlashes(path.resolve(fileName));
    const fileLower = file.toLowerCase();
    for (const root of engineSrcRoots) {
        if (fileLower.startsWith(root.toLowerCase() + "/")) {
            return { root, file };
        }
    }
    return null;
}

// TRUE WHEN A PROPERTY-ACCESS TARGET LOOKS LIKE A SCENE REFERENCE:
// this, this.scene, gameObject.scene, or a scene-ish identifier (scene, uiScene, bScene, ...).
// USED TO DETECT CONTROLLER USAGE LIKE scene.hitbox.AssignButton SO THE CONTROLLER
// IMPORT GETS INJECTED AND THE MODULE SURVIVES TREE-SHAKING.
function isSceneLikeTarget(target) {
    if (target.kind === ts.SyntaxKind.ThisKeyword) {
        return true;
    }
    if (ts.isPropertyAccessExpression(target) && target.name && ts.isIdentifier(target.name) && target.name.text === "scene") {
        return true;
    }
    return ts.isIdentifier(target) && /scene$/i.test(target.text);
}

// A CONTROLLER FIELD ACCESS ONLY COUNTS AS A HARD DEPENDENCY WHEN IT'S DEREFERENCED
// NON-OPTIONALLY: scene.hitbox.AssignButton(...) COUNTS; OPTIONAL USAGE LIKE
// scene.hitbox?.Foo() OR PRESENCE CHECKS LIKE if (scene.hitbox) DON'T -
// THAT'S THE OPT-OUT FOR CODE THAT TOLERATES A MISSING CONTROLLER
function isHardControllerDeref(n) {
    const parent = n.parent;
    if (!parent) {
        return false;
    }
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === n) {
        return !parent.questionDotToken;
    }
    if (ts.isCallExpression(parent) && parent.expression === n) {
        return !parent.questionDotToken;
    }
    return false;
}

// Accepts either a controller name or a Scene field name; returns the controller name.
function toControllerName(name, registeredControllers) {
    if (registeredControllers.has(name)) {
        return name;
    }
    const long = bareModuleControllerNames.get(name);
    return long && registeredControllers.has(long) ? long : null;
}

const externalClassInfoMap = collectClassInfoFromDirs([
    path.resolve(process.cwd(), "../BareEngine/src"),
    path.resolve(process.cwd(), "node_modules/bare-engine/src"),
    path.resolve(process.cwd(), "src")
]);
const externalAddClassDirectiveMap = collectAddClassDirectiveMapFromDirs([
    path.resolve(process.cwd(), "../BareEngine/src"),
    path.resolve(process.cwd(), "node_modules/bare-engine/src")
]);
const externalControllerUsageByClass = collectControllerUsageByClassFromDirs(
    [
        path.resolve(process.cwd(), "../BareEngine/src"),
        path.resolve(process.cwd(), "node_modules/bare-engine/src")
    ],
    allControllerNames
);

function createControllerProxyTransformer(program) {
    const classInfoMap = program ? collectClassInfo(program) : new Map();
    if (externalClassInfoMap) {
        for (const [name, info] of externalClassInfoMap) {
            if (!classInfoMap.has(name)) {
                classInfoMap.set(name, info);
            }
        }
    }
    const typeChecker = program ? program.getTypeChecker() : null;
    const explicitControllers = allControllerNames;


    return (context) => {
        const factory = context.factory || ts;
        const directiveMap = externalAddClassDirectiveMap || new Map();
        const externalUsageMap = externalControllerUsageByClass || new Map();

        const createThisScene = () =>
            factory.createPropertyAccessExpression(factory.createThis(), "scene");

        const createThisSceneProperty = (name) =>
            factory.createPropertyAccessExpression(createThisScene(), name);

        const createThisProperty = (name) =>
            factory.createPropertyAccessExpression(factory.createThis(), name);

        return (sourceFile) => {
            const registeredControllers = explicitControllers;
            const isProjectSource = isProjectSourceFile(sourceFile);
            const startBareTargets = isProjectSource ? collectStartBareTargets(sourceFile) : new Set();

            function maybeTransformTweenToCallTopLevel(callNode) {
                if (!ts.isCallExpression(callNode)) {
                    return callNode;
                }
                if (!ts.isIdentifier(callNode.expression)) {
                    return callNode;
                }
                if (callNode.expression.text !== "TweenTo") {
                    return callNode;
                }
                const firstArg = callNode.arguments[0];
                if (!firstArg) {
                    return callNode;
                }
                if (typeChecker) {
                    const argType = typeChecker.getTypeAtLocation(firstArg);
                    if (argType && argType.getProperty("scene")) {
                        const tweenControllerAccess = factory.createPropertyAccessExpression(
                            factory.createPropertyAccessExpression(firstArg, "scene"),
                            "tween"
                        );
                        const newCallee = factory.createPropertyAccessExpression(
                            tweenControllerAccess,
                            "To"
                        );
                        return factory.updateCallExpression(
                            callNode,
                            newCallee,
                            callNode.typeArguments,
                            callNode.arguments
                        );
                    }
                }
                return callNode;
            }

            const usedControllersInSource = new Set();
            const usedGlobalModulesInSource = new Set();

            // bare.sound / bare.keyboard / bare.storage -> __Bare_soundHandler / ... (imported from bare-engine)
            function maybeRewriteBareGlobalModule(n) {
                if (!isProjectSource) {
                    return null;
                }
                if (!ts.isPropertyAccessExpression(n)) {
                    return null;
                }
                if (!ts.isIdentifier(n.expression) || n.expression.text !== "bare") {
                    return null;
                }
                if (!n.name || !ts.isIdentifier(n.name)) {
                    return null;
                }
                const exportName = bareGlobalModuleImports.get(n.name.text);
                if (!exportName) {
                    return null;
                }
                usedGlobalModulesInSource.add(exportName);
                return factory.createIdentifier(`__Bare_${exportName}`);
            }

            function visit(node) {
                if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
                    return transformClass(node);
                }
                const rewrittenGlobalModule = maybeRewriteBareGlobalModule(node);
                if (rewrittenGlobalModule) {
                    return rewrittenGlobalModule;
                }
                if (ts.isCallExpression(node)) {
                    const updated = maybeTransformTweenToCallTopLevel(node);
                    if (updated !== node) {
                        const visitedArgs = updated.arguments.map(
                            (arg) => ts.visitNode(arg, visit)
                        );
                        return factory.updateCallExpression(
                            updated,
                            updated.expression,
                            updated.typeArguments,
                            visitedArgs
                        );
                    }
                }
                return ts.visitEachChild(node, visit, context);
            }

            function transformClass(node) {
                const className = node.name ? node.name.text : null;
                const isStartBareTarget = className && startBareTargets.has(className);
                // COLLECTED FOR ENGINE SOURCES TOO, SO ENGINE-INTERNAL CHAINS LIKE
                // PluginHandler -> Button -> scene.hitbox KEEP THE CONTROLLER BUNDLED + REGISTERED
                const usedControllers = new Set();
                const hasScene = classHasSceneProperty(node);
                const extendsScene = classExtendsScene(node);
                const extendsSceneDeep = extendsScene
                    || (classInfoMap
                        ? classExtendsSceneInHierarchy(node, classInfoMap)
                        : false)
                    || (typeChecker
                        ? classExtendsSceneInDeclHierarchy(node, typeChecker)
                        : false)
                    || (typeChecker
                        ? classExtendsSceneInTypeHierarchy(node, typeChecker)
                        : false);
                const extendsSceneCarrier = extendsScene
                    || (classInfoMap
                        ? classHasSceneInHierarchy(node, classInfoMap)
                        : classExtendsSceneCarrier(node))
                    || (typeChecker
                        ? classHasSceneInDeclHierarchy(node, typeChecker)
                        : false)
                    || (typeChecker
                        ? classHasSceneInTypeHierarchy(node, typeChecker)
                        : false);
                let needsScene = false;

                function maybeTransformTweenToCall(callNode) {
                    if (!ts.isIdentifier(callNode.expression)) {
                        return callNode;
                    }
                    if (callNode.expression.text !== "TweenTo") {
                        return callNode;
                    }

                    const firstArg = callNode.arguments[0];
                    if (!firstArg) {
                        return callNode;
                    }

                    // CONTROLLER-AS-FIRST-ARG ONLY EXISTS IN ENGINE SOURCES (LEGACY IDENTIFIER STYLE)
                    const firstArgIsController = !isProjectSource
                        && ts.isIdentifier(firstArg)
                        && registeredControllers.has(firstArg.text);

                    let hasScene = false;
                    if (!firstArgIsController && typeChecker) {
                        const argType = typeChecker.getTypeAtLocation(firstArg);
                        if (argType && argType.getProperty("scene")) {
                            hasScene = true;
                        }
                    }

                    if (usedControllers) {


                        usedControllers.add("tweenController");


                    }


                    


                    let tweenControllerAccess;
                    if (hasScene) {
                        // firstArg.scene.tween
                        tweenControllerAccess = factory.createPropertyAccessExpression(
                            factory.createPropertyAccessExpression(firstArg, "scene"),
                            "tween"
                        );
                    } else if (extendsSceneDeep) {
                        // this.tween
                        tweenControllerAccess = factory.createPropertyAccessExpression(
                            factory.createThis(),
                            "tween"
                        );
                    } else {
                        // this.scene.tween
                        needsScene = true;
                        tweenControllerAccess = factory.createPropertyAccessExpression(
                            createThisScene(),
                            "tween"
                        );
                    }

                    const newCallee = factory.createPropertyAccessExpression(
                        tweenControllerAccess,
                        "To"
                    );

                    return factory.updateCallExpression(
                        callNode,
                        newCallee,
                        callNode.typeArguments,
                        callNode.arguments
                    );
                }

                function visitInClass(n) {
                    if (ts.isCallExpression(n)) {
                        maybeCollectFromDirectiveMap(n.expression);
                        const updated = maybeTransformTweenToCall(n);
                        if (updated !== n) {
                            // Only visit the arguments, not the callee (which we just created)
                            const visitedArgs = updated.arguments.map(
                                (arg) => ts.visitNode(arg, visitInClass)
                            );
                            return factory.updateCallExpression(
                                updated,
                                updated.expression,
                                updated.typeArguments,
                                visitedArgs
                            );
                        }
                    }
                    if (ts.isPropertyAccessExpression(n)) {
                        maybeCollectFromDirectiveMap(n);

                        const rewrittenGlobalModule = maybeRewriteBareGlobalModule(n);
                        if (rewrittenGlobalModule) {
                            return rewrittenGlobalModule;
                        }

                        // bare.mouse / bare.camera / ... -> this.mouseController / this.scene.cameraHandler / ...
                        if (
                            ts.isIdentifier(n.expression)
                            && n.expression.text === "bare"
                            && n.name
                            && ts.isIdentifier(n.name)
                        ) {
                            if (n.name.text === "events") {
                                if (extendsSceneDeep) {
                                    return createThisProperty("events");
                                }
                                if (hasScene || extendsSceneCarrier) {
                                    needsScene = true;
                                    return createThisSceneProperty("events");
                                }
                            }

                            const controllerName = bareModuleControllerNames.get(n.name.text);
                            if (controllerName && registeredControllers.has(controllerName)) {
                                const canRewriteScene = extendsSceneDeep || hasScene || extendsSceneCarrier;
                                if (extendsSceneDeep || canRewriteScene) {
                                    if (usedControllers) {
                                        usedControllers.add(controllerName);
                                    }
                                    // the bare.<module> name doubles as the Scene field name
                                    if (extendsSceneDeep) {
                                        return createThisProperty(n.name.text);
                                    }
                                    needsScene = true;
                                    return createThisSceneProperty(n.name.text);
                                }
                            }
                        }

                        const propName = n.name && ts.isIdentifier(n.name) ? n.name.text : null;
                        const propControllerName = propName
                            ? toControllerName(propName, registeredControllers)
                            : null;
                        if (propControllerName && isSceneLikeTarget(n.expression) && isHardControllerDeref(n)) {
                            usedControllers.add(propControllerName);
                        }
                    }
                    if (ts.isIdentifier(n) && isIdentifierReference(n)) {
                        const name = n.text;
                        const canRewriteScene = extendsSceneDeep || hasScene || extendsSceneCarrier;

                        if (name === "bScene") {
                        if (extendsSceneDeep) {
                            return factory.createThis();
                        }
                        if (canRewriteScene) {
                            needsScene = true;
                            return createThisScene();
                        }
                        }

                        if (name === "events") {
                            if (extendsSceneDeep) {
                                return createThisProperty(name);
                            }
                            if (canRewriteScene) {
                                needsScene = true;
                                return createThisSceneProperty(name);
                            }
                        }

                        // LEGACY IDENTIFIER STYLE (mouseController, cameraHandler, ...):
                        // ONLY ENGINE SOURCES STILL USE IT - PROJECT CODE USES THE bare.<module> SHORTHANDS,
                        // SO IDENTIFIERS WITH THESE NAMES IN PROJECT CODE ARE LEFT ALONE (E.G. LOCAL VARIABLES)
                        if (!isProjectSource && registeredControllers.has(name)) {
                            if (extendsSceneDeep) {
                                return createThisProperty(sceneFieldNameFor(name));
                            }
                            if (canRewriteScene) {
                                needsScene = true;
                                return createThisSceneProperty(sceneFieldNameFor(name));
                            }
                        }

                        if (usedControllers && isProjectSource) {
                            const externalControllers = externalUsageMap.get(name);
                            if (externalControllers && externalControllers.size > 0) {
                                for (const controllerName of externalControllers) {
                                    if (registeredControllers.has(controllerName)) {
                                        usedControllers.add(controllerName);
                                    }
                                }
                            }
                        }
                    }

                    return ts.visitEachChild(n, visitInClass, context);
                }

                function maybeCollectFromDirectiveMap(expr) {
                    // PROJECT SOURCES ONLY: ENGINE FILES DECLARE THEIR OWN DEPS, AND THE DIRECTIVE'S
                    // DEFINING FILE WOULD OTHERWISE MATCH ITS OWN WRAPPER BODY (scene.ts OnPointerDown)
                    if (!isProjectSource) {
                        return;
                    }
                    if (!ts.isPropertyAccessExpression(expr)) {
                        return;
                    }
                    const memberName = expr.name.text;
                    const directives = directiveMap.get(memberName);
                    if (!directives || directives.size === 0) {
                        return;
                    }
                    // NO TARGET RESTRICTION: DIRECTIVES ARE EXPLICIT @AddClass ANNOTATIONS ON DISTINCTIVE
                    // MEMBER NAMES, SO ANY CALL SITE (go.OnPointerDown, scene.OnPointerDown, ...) COUNTS
                    for (const className of directives) {
                        const controllerName = normalizeControllerName(className, registeredControllers);
                        if (controllerName) {
                            usedControllers.add(controllerName);
                        }
                    }
                }

                function transformBlockWithControllerRefs(block) {
                    const newStatements = [];

                    for (const statement of block.statements) {
                        const updatedStatement = ts.visitEachChild(statement, visitInClass, context);
                        newStatements.push(updatedStatement);
                    }

                    return factory.updateBlock(block, newStatements);
                }

                const updatedMembers = node.members.map((member) => {
                    if (ts.isConstructorDeclaration(member)) {
                        if (!member.body) {
                            return member;
                        }
                        const updatedBody = transformBlockWithControllerRefs(member.body);
                        return factory.updateConstructorDeclaration(
                            member,
                            member.modifiers,
                            member.parameters,
                            updatedBody
                        );
                    }

                    if (ts.isMethodDeclaration(member)) {
                        if (!member.body) {
                            return member;
                        }
                        const updatedBody = transformBlockWithControllerRefs(member.body);
                        return factory.updateMethodDeclaration(
                            member,
                            member.modifiers,
                            member.asteriskToken,
                            member.name,
                            member.questionToken,
                            member.typeParameters,
                            member.parameters,
                            member.type,
                            updatedBody
                        );
                    }

                    if (ts.isGetAccessorDeclaration(member)) {
                        if (!member.body) {
                            return member;
                        }
                        const updatedBody = transformBlockWithControllerRefs(member.body);
                        return factory.updateGetAccessorDeclaration(
                            member,
                            member.modifiers,
                            member.name,
                            member.parameters,
                            member.type,
                            updatedBody
                        );
                    }

                    if (ts.isSetAccessorDeclaration(member)) {
                        if (!member.body) {
                            return member;
                        }
                        const updatedBody = transformBlockWithControllerRefs(member.body);
                        return factory.updateSetAccessorDeclaration(
                            member,
                            member.modifiers,
                            member.name,
                            member.parameters,
                            updatedBody
                        );
                    }

                    if (ts.isPropertyDeclaration(member)) {
                        return ts.visitEachChild(member, visitInClass, context);
                    }

                    return member;
                });

                const updated = ts.isClassDeclaration(node)
                    ? factory.updateClassDeclaration(
                        node,
                        node.modifiers,
                        node.name,
                        node.typeParameters,
                        node.heritageClauses,
                        updatedMembers
                    )
                    : factory.updateClassExpression(
                        node,
                        node.modifiers,
                        node.name,
                        node.typeParameters,
                        node.heritageClauses,
                        updatedMembers
                    );

                if (needsScene && !hasScene && !extendsSceneCarrier) {
                    const className = node.name ? node.name.text : "<anonymous>";
                    throw new Error(
                        `[controller-proxy] ${sourceFile.fileName}: class ${className} must define a scene property`
                    );
                }

                if (usedControllers) {
                    for (const controllerName of usedControllers) {
                        usedControllersInSource.add(controllerName);
                    }
                }

                return updated;
            }

            const transformed = ts.visitNode(sourceFile, visit);
            const engineSrcInfo = getEngineSrcInfo(sourceFile.fileName);
            const withControllerImports = addControllerImports(transformed, usedControllersInSource, factory, engineSrcInfo);
            return addGlobalModuleImports(withControllerImports, usedGlobalModulesInSource, factory);
        };
    };
}


// RESOLVES THE IMPORT SPECIFIER FOR AN INJECTED CONTROLLER IMPORT.
// PROJECT SOURCES IMPORT FROM THE PACKAGE; ENGINE SOURCES IMPORT THE CONTROLLER
// MODULE DIRECTLY (RELATIVE PATH), SO ENGINE-INTERNAL DEPENDENCIES WORK WITHOUT
// GOING THROUGH (ENTRY-SHAKEN) PACKAGE ENTRIES. RETURNS null TO SKIP (SELF-IMPORT).
function resolveControllerImportSource(controllerName, engineSrcInfo) {
    if (!engineSrcInfo) {
        return controllerImportSources.get(controllerName) || "bare-engine";
    }

    const subpath = controllerModuleSubpaths.get(controllerName);
    if (!subpath) {
        return null;
    }

    const target = engineSrcInfo.root + "/" + subpath;
    if (engineSrcInfo.file.toLowerCase().replace(/\.ts$/, "") === target.toLowerCase()) {
        return null; // THE FILE IS THE CONTROLLER MODULE ITSELF
    }

    let rel = path.posix.relative(path.posix.dirname(engineSrcInfo.file), target);
    if (!rel.startsWith(".")) {
        rel = "./" + rel;
    }
    return rel;
}

function addControllerImports(sourceFile, controllerNames, factory, engineSrcInfo) {
    if (!controllerNames || controllerNames.size === 0) {
        return sourceFile;
    }

    const imports = [];
    const refs = [];
    const sortedControllerNames = Array.from(controllerNames).sort();

    for (const controllerName of sortedControllerNames) {
        const importSource = resolveControllerImportSource(controllerName, engineSrcInfo);
        if (!importSource) {
            continue;
        }

        const className = controllerNameToClassName(controllerName);
        const localName = `__Bare${className}`;

        imports.push(factory.createImportDeclaration(
            undefined,
            factory.createImportClause(
                false,
                undefined,
                factory.createNamedImports([
                    factory.createImportSpecifier(
                        false,
                        factory.createIdentifier(className),
                        factory.createIdentifier(localName)
                    )
                ])
            ),
            factory.createStringLiteral(importSource)
        ));

        refs.push(factory.createExpressionStatement(
            factory.createCallExpression(
                factory.createPropertyAccessExpression(factory.createIdentifier("Object"), "defineProperty"),
                undefined,
                [
                    factory.createIdentifier(localName),
                    factory.createStringLiteral("__bareControllerRef"),
                    factory.createObjectLiteralExpression([
                        factory.createPropertyAssignment("value", factory.createTrue()),
                        factory.createPropertyAssignment("configurable", factory.createTrue())
                    ])
                ]
            )
        ));
    }

    return factory.updateSourceFile(sourceFile, [
        ...imports,
        ...refs,
        ...sourceFile.statements
    ]);
}

function addGlobalModuleImports(sourceFile, exportNames, factory) {
    if (!exportNames || exportNames.size === 0) {
        return sourceFile;
    }

    const imports = [];
    for (const exportName of Array.from(exportNames).sort()) {
        imports.push(factory.createImportDeclaration(
            undefined,
            factory.createImportClause(
                false,
                undefined,
                factory.createNamedImports([
                    factory.createImportSpecifier(
                        false,
                        factory.createIdentifier(exportName),
                        factory.createIdentifier(`__Bare_${exportName}`)
                    )
                ])
            ),
            factory.createStringLiteral("bare-engine")
        ));
    }

    return factory.updateSourceFile(sourceFile, [
        ...imports,
        ...sourceFile.statements
    ]);
}

function controllerNameToClassName(value) {
    return value[0].toUpperCase() + value.slice(1);
}

function collectClassInfo(program) {
    const map = new Map();

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) {
            continue;
        }

        ts.forEachChild(sourceFile, (node) => {
            if (!ts.isClassDeclaration(node) || !node.name) {
                return;
            }
            const name = node.name.text;
            const hasScene = classHasSceneProperty(node);
            const bases = getBaseClassNames(node);
            map.set(name, { hasScene, bases });
        });
    }

    return map;
}

function collectClassInfoFromDirs(dirs) {
    const map = new Map();

    for (const dir of dirs) {
        if (!dir || !fs.existsSync(dir)) {
            continue;
        }
        const files = listTsFiles(dir);
        for (const filePath of files) {
            const sourceText = fs.readFileSync(filePath, "utf8");
            const sourceFile = ts.createSourceFile(
                filePath,
                sourceText,
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.TS
            );

            ts.forEachChild(sourceFile, (node) => {
                if (!ts.isClassDeclaration(node) || !node.name) {
                    return;
                }
                const name = node.name.text;
                const hasScene = classHasSceneProperty(node);
                const bases = getBaseClassNames(node);
                if (!map.has(name)) {
                    map.set(name, { hasScene, bases });
                }
            });
        }
    }

    return map;
}

function listTsFiles(rootDir) {
    const results = [];
    const stack = [rootDir];

    while (stack.length > 0) {
        const current = stack.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
                results.push(fullPath);
            }
        }
    }

    return results;
}

function lowerFirst(value) {
    if (!value) {
        return value;
    }
    return value[0].toLowerCase() + value.slice(1);
}

function collectStartBareTargets(sourceFile) {
    const targets = new Set();

    function walk(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            if (node.expression.text === "StartBare" && node.arguments.length > 0) {
                const firstArg = node.arguments[0];
                if (ts.isIdentifier(firstArg)) {
                    targets.add(firstArg.text);
                }
            }
        }
        ts.forEachChild(node, walk);
    }

    walk(sourceFile);
    return targets;
}

function isProjectSourceFile(sourceFile) {
    // Anything under the project root counts as project source (src/, public/demos/, ...),
    // except dependencies. Engine sources resolve through the node_modules symlink to their
    // real path outside the project root, so they stay non-project.
    const filePath = path.resolve(sourceFile.fileName);
    const projectRoot = path.resolve(process.cwd());
    if (!filePath.startsWith(projectRoot + path.sep)) {
        return false;
    }
    return !filePath.includes(path.sep + "node_modules" + path.sep);
}

function collectAddClassDirectiveMapFromDirs(dirs) {
    const map = new Map();

    for (const dir of dirs) {
        if (!dir || !fs.existsSync(dir)) {
            continue;
        }
        const files = listTsFiles(dir);
        for (const filePath of files) {
            const sourceText = fs.readFileSync(filePath, "utf8");
            const sourceFile = ts.createSourceFile(
                filePath,
                sourceText,
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.TS
            );

            ts.forEachChild(sourceFile, (node) => {
                if (!ts.isClassDeclaration(node)) {
                    return;
                }
                for (const member of node.members) {
                    if (
                        !ts.isMethodDeclaration(member)
                        && !ts.isGetAccessorDeclaration(member)
                        && !ts.isSetAccessorDeclaration(member)
                        && !ts.isPropertyDeclaration(member)
                    ) {
                        continue;
                    }
                    if (!member.name || !ts.isIdentifier(member.name)) {
                        continue;
                    }
                    const directives = collectAddClassDirectivesInNode(sourceText, member);
                    if (directives.size === 0) {
                        continue;
                    }
                    const name = member.name.text;
                    const existing = map.get(name) || new Set();
                    for (const directive of directives) {
                        existing.add(directive);
                    }
                    map.set(name, existing);
                }
            });
        }
    }

    return map;
}

function collectControllerUsageByClassFromDirs(dirs, controllerNames) {
    const map = new Map();

    for (const dir of dirs) {
        if (!dir || !fs.existsSync(dir)) {
            continue;
        }
        const files = listTsFiles(dir);
        for (const filePath of files) {
            const sourceText = fs.readFileSync(filePath, "utf8");
            const sourceFile = ts.createSourceFile(
                filePath,
                sourceText,
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.TS
            );

            ts.forEachChild(sourceFile, (node) => {
                if (!ts.isClassDeclaration(node) || !node.name) {
                    return;
                }
                const className = node.name.text;
                const usedControllers = new Set();

                function walk(n) {
                    if (ts.isIdentifier(n) && isIdentifierReference(n)) {
                        const name = n.text;
                        if (controllerNames.has(name)) {
                            usedControllers.add(name);
                        }
                    }
                    if (ts.isPropertyAccessExpression(n)) {
                        const propName = n.name && ts.isIdentifier(n.name) ? n.name.text : null;
                        const propControllerName = propName
                            ? toControllerName(propName, controllerNames)
                            : null;
                        if (propControllerName && isSceneLikeTarget(n.expression) && isHardControllerDeref(n)) {
                            usedControllers.add(propControllerName);
                        }
                    }
                    ts.forEachChild(n, walk);
                }

                for (const member of node.members) {
                    if (
                        ts.isConstructorDeclaration(member)
                        || ts.isMethodDeclaration(member)
                        || ts.isGetAccessorDeclaration(member)
                        || ts.isSetAccessorDeclaration(member)
                        || ts.isPropertyDeclaration(member)
                    ) {
                        ts.forEachChild(member, walk);
                    }
                }

                if (usedControllers.size > 0) {
                    map.set(className, usedControllers);
                }
            });
        }
    }

    return map;
}

function collectAddClassDirectivesInNode(sourceText, node) {
    const results = new Set();
    const nodeText = sourceText.slice(node.pos, node.end);
    const regex = /@\s*AddClass\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;
    let match;
    while ((match = regex.exec(nodeText)) !== null) {
        results.add(match[1]);
    }
    return results;
}

function normalizeControllerName(value, registeredControllers) {
    if (!value) {
        return null;
    }
    if (registeredControllers.has(value)) {
        return value;
    }
    const lowered = lowerFirst(value);
    if (registeredControllers.has(lowered)) {
        return lowered;
    }
    return null;
}

function classHasSceneProperty(node) {
    return node.members.some((member) => {
        if (
            (ts.isPropertyDeclaration(member)
                || ts.isGetAccessorDeclaration(member)
                || ts.isSetAccessorDeclaration(member)
                || ts.isMethodDeclaration(member))
            && member.name
            && ts.isIdentifier(member.name)
        ) {
            return member.name.text === "scene";
        }

        if (ts.isConstructorDeclaration(member)) {
            return member.parameters.some((param) => {
                if (!param.name || !ts.isIdentifier(param.name)) {
                    return false;
                }
                if (param.name.text !== "scene") {
                    return false;
                }
                return hasParamPropertyModifier(param);
            });
        }

        return false;
    });
}

function classExtendsScene(node) {
    if (!node.heritageClauses) {
        return false;
    }

    for (const clause of node.heritageClauses) {
        if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
            continue;
        }
        for (const type of clause.types) {
            const expression = type.expression;
            if (ts.isIdentifier(expression) && expression.text === "Scene") {
                return true;
            }
            if (
                ts.isPropertyAccessExpression(expression)
                && expression.name.text === "Scene"
            ) {
                return true;
            }
        }
    }

    return false;
}

function classExtendsSceneCarrier(node) {
    if (!node.heritageClauses) {
        return false;
    }

    for (const clause of node.heritageClauses) {
        if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
            continue;
        }
        for (const type of clause.types) {
            const expression = type.expression;
            if (ts.isIdentifier(expression) && expression.text === "GameObject") {
                return true;
            }
            if (
                ts.isPropertyAccessExpression(expression)
                && expression.name.text === "GameObject"
            ) {
                return true;
            }
        }
    }

    return false;
}

function classHasSceneInHierarchy(node, classInfoMap) {
    const bases = getBaseClassNames(node);
    if (bases.length === 0) {
        return false;
    }

    const visited = new Set();

    function walk(baseName) {
        if (!baseName || visited.has(baseName)) {
            return false;
        }
        visited.add(baseName);

        if (baseName === "Scene") {
            return true;
        }

        const info = classInfoMap.get(baseName);
        if (!info) {
            return false;
        }
        if (info.hasScene) {
            return true;
        }
        return info.bases.some(walk);
    }

    return bases.some(walk);
}

function classExtendsSceneInHierarchy(node, classInfoMap) {
    const bases = getBaseClassNames(node);
    if (bases.length === 0) {
        return false;
    }

    const visited = new Set();

    function walk(baseName) {
        if (!baseName || visited.has(baseName)) {
            return false;
        }
        visited.add(baseName);

        if (baseName === "Scene") {
            return true;
        }

        const info = classInfoMap.get(baseName);
        if (!info) {
            return false;
        }
        return info.bases.some(walk);
    }

    return bases.some(walk);
}

function classHasSceneInDeclHierarchy(node, checker) {
    const visited = new Set();

    function walkDeclaration(decl) {
        if (!decl || visited.has(decl)) {
            return false;
        }
        visited.add(decl);

        if (decl.name && decl.name.text === "Scene") {
            return true;
        }

        if (classExtendsScene(decl)) {
            return true;
        }

        if (classHasSceneProperty(decl)) {
            return true;
        }

        const bases = decl.heritageClauses
            ? decl.heritageClauses
                .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
                .flatMap((clause) => clause.types)
            : [];

        for (const baseType of bases) {
            const baseDecls = resolveClassDeclarationsFromType(baseType, checker);
            for (const baseDecl of baseDecls) {
                if (walkDeclaration(baseDecl)) {
                    return true;
                }
            }
        }

        return false;
    }

    const baseTypes = node.heritageClauses
        ? node.heritageClauses
            .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
            .flatMap((clause) => clause.types)
        : [];

    for (const baseType of baseTypes) {
        const baseDecls = resolveClassDeclarationsFromType(baseType, checker);
        for (const baseDecl of baseDecls) {
            if (walkDeclaration(baseDecl)) {
                return true;
            }
        }
    }

    return false;
}

function classExtendsSceneInDeclHierarchy(node, checker) {
    const visited = new Set();

    function walkDeclaration(decl) {
        if (!decl || visited.has(decl)) {
            return false;
        }
        visited.add(decl);

        if (decl.name && decl.name.text === "Scene") {
            return true;
        }

        if (classExtendsScene(decl)) {
            return true;
        }

        const bases = decl.heritageClauses
            ? decl.heritageClauses
                .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
                .flatMap((clause) => clause.types)
            : [];

        for (const baseType of bases) {
            const baseDecls = resolveClassDeclarationsFromType(baseType, checker);
            for (const baseDecl of baseDecls) {
                if (walkDeclaration(baseDecl)) {
                    return true;
                }
            }
        }

        return false;
    }

    const baseTypes = node.heritageClauses
        ? node.heritageClauses
            .filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
            .flatMap((clause) => clause.types)
        : [];

    for (const baseType of baseTypes) {
        const baseDecls = resolveClassDeclarationsFromType(baseType, checker);
        for (const baseDecl of baseDecls) {
            if (walkDeclaration(baseDecl)) {
                return true;
            }
        }
    }

    return false;
}

function resolveClassDeclarationsFromType(typeNode, checker) {
    const expression = typeNode.expression || typeNode;
    const result = [];

    const symbol = getAliasedSymbol(checker.getSymbolAtLocation(expression), checker);
    if (symbol) {
        const declarations = symbol.getDeclarations() || [];
        result.push(
            ...declarations.filter(
                (decl) => ts.isClassDeclaration(decl) || ts.isClassExpression(decl)
            )
        );
    }

    const baseType = checker.getTypeAtLocation(expression);
    if (baseType) {
        const symbolFromType = getAliasedSymbol(baseType.getSymbol(), checker);
        if (symbolFromType) {
            const declarations = symbolFromType.getDeclarations() || [];
            result.push(
                ...declarations.filter(
                    (decl) => ts.isClassDeclaration(decl) || ts.isClassExpression(decl)
                )
            );
        }

        const nodeFromType = baseType.symbol && baseType.symbol.valueDeclaration
            ? baseType.symbol.valueDeclaration
            : null;
        if (nodeFromType && (ts.isClassDeclaration(nodeFromType) || ts.isClassExpression(nodeFromType))) {
            result.push(nodeFromType);
        }
    }

    const seen = new Set();
    return result.filter((decl) => {
        if (seen.has(decl)) {
            return false;
        }
        seen.add(decl);
        return true;
    });
}


function classHasSceneInTypeHierarchy(node, checker) {
    const visited = new Set();

    function walkType(type) {
        if (!type || visited.has(type)) {
            return false;
        }
        visited.add(type);

        if (typeHasSceneProperty(type, checker)) {
            return true;
        }

        const baseTypes = type.getBaseTypes ? type.getBaseTypes() : [];
        for (const baseType of baseTypes || []) {
            if (walkType(baseType)) {
                return true;
            }
        }

        return false;
    }

    const classType = checker.getTypeAtLocation(node);
    return walkType(classType);
}

function classExtendsSceneInTypeHierarchy(node, checker) {
    const visited = new Set();

    function walkType(type) {
        if (!type || visited.has(type)) {
            return false;
        }
        visited.add(type);

        if (type.symbol && type.symbol.name === "Scene") {
            return true;
        }

        const baseTypes = type.getBaseTypes ? type.getBaseTypes() : [];
        for (const baseType of baseTypes || []) {
            if (walkType(baseType)) {
                return true;
            }
        }

        return false;
    }

    const classType = checker.getTypeAtLocation(node);
    return walkType(classType);
}

function typeHasSceneProperty(type, checker) {
    if (!type) {
        return false;
    }

    if (type.symbol && type.symbol.name === "Scene") {
        return true;
    }

    const sceneProp = type.getProperty("scene");
    if (sceneProp) {
        return true;
    }

    const symbol = getAliasedSymbol(type.getSymbol(), checker);
    if (symbol) {
        const declared = checker.getDeclaredTypeOfSymbol(symbol);
        if (declared && declared !== type && declared.getProperty("scene")) {
            return true;
        }
    }

    const constructSignatures = type.getConstructSignatures
        ? type.getConstructSignatures()
        : [];
    for (const signature of constructSignatures) {
        const params = signature.getParameters();
        for (const param of params) {
            if (param.getName() === "scene") {
                return true;
            }
        }
    }

    return false;
}

function getAliasedSymbol(symbol, checker) {
    if (!symbol) {
        return null;
    }
    if (symbol.flags & ts.SymbolFlags.Alias) {
        return checker.getAliasedSymbol(symbol);
    }
    return symbol;
}

function getBaseClassNames(node) {
    if (!node.heritageClauses) {
        return [];
    }

    const bases = [];
    for (const clause of node.heritageClauses) {
        if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
            continue;
        }
        for (const type of clause.types) {
            const expression = type.expression;
            if (ts.isIdentifier(expression)) {
                bases.push(expression.text);
            } else if (ts.isPropertyAccessExpression(expression)) {
                bases.push(expression.name.text);
            }
        }
    }

    return bases;
}

function hasParamPropertyModifier(param) {
    if (!param.modifiers) {
        return false;
    }
    return param.modifiers.some((modifier) =>
        modifier.kind === ts.SyntaxKind.PublicKeyword
        || modifier.kind === ts.SyntaxKind.PrivateKeyword
        || modifier.kind === ts.SyntaxKind.ProtectedKeyword
        || modifier.kind === ts.SyntaxKind.ReadonlyKeyword
    );
}

function isIdentifierReference(node) {
    const parent = node.parent;
    if (!parent) {
        return true;
    }

    if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
        return false;
    }
    if (ts.isPropertyAssignment(parent) && parent.name === node) {
        return false;
    }
    if (ts.isPropertyDeclaration(parent) && parent.name === node) {
        return false;
    }
    if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
        return false;
    }
    if (ts.isBindingElement(parent) && parent.name === node) {
        return false;
    }
    if (ts.isBindingElement(parent) && parent.propertyName === node) {
        return false;
    }
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) {
        return false;
    }
    if (ts.isNamespaceImport(parent) || ts.isNamespaceExport(parent)) {
        return false;
    }
    if (ts.isImportClause(parent) && parent.name === node) {
        return false;
    }
    if (ts.isVariableDeclaration(parent) && parent.name === node) {
        return false;
    }
    if (ts.isParameter(parent) && parent.name === node) {
        return false;
    }
    if (ts.isFunctionDeclaration(parent) && parent.name === node) {
        return false;
    }
    if (ts.isMethodDeclaration(parent) && parent.name === node) {
        return false;
    }
    if (ts.isClassDeclaration(parent) && parent.name === node) {
        return false;
    }
    if (ts.isInterfaceDeclaration(parent) && parent.name === node) {
        return false;
    }
    if (ts.isTypeAliasDeclaration(parent) && parent.name === node) {
        return false;
    }
    if (ts.isEnumDeclaration(parent) && parent.name === node) {
        return false;
    }
    if (ts.isEnumMember(parent) && parent.name === node) {
        return false;
    }
    if (ts.isPropertySignature(parent) && parent.name === node) {
        return false;
    }
    if (ts.isMethodSignature(parent) && parent.name === node) {
        return false;
    }
    if (ts.isTypeReferenceNode(parent) && parent.typeName === node) {
        return false;
    }
    if (ts.isExpressionWithTypeArguments(parent) && parent.expression === node) {
        return false;
    }
    if (ts.isHeritageClause(parent)) {
        return false;
    }
    if (ts.isTypeQueryNode(parent) && parent.exprName === node) {
        return false;
    }
    if (ts.isQualifiedName(parent)) {
        return false;
    }
    if (ts.isImportTypeNode(parent)) {
        return false;
    }
    if (ts.isLabeledStatement(parent) && parent.label === node) {
        return false;
    }
    if (
        (ts.isBreakStatement(parent) || ts.isContinueStatement(parent))
        && parent.label === node
    ) {
        return false;
    }

    return true;
}

module.exports = createControllerProxyTransformer;





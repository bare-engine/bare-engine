const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const allControllerNames = new Set([
    "componentController",
    "hitboxController",
    "mouseController",
    "objectController",
    "particleController",
    "physicsControllerBare",
    "physicsControllerSopiro",
    "tweenController",
    "cameraHandler",
    "levelHandler",
]);

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
    const registeredAcrossProgram = program
        ? collectRegisteredControllersFromProgram(program)
        : null;
    const classInfoMap = program ? collectClassInfo(program) : new Map();
    if (externalClassInfoMap) {
        for (const [name, info] of externalClassInfoMap) {
            if (!classInfoMap.has(name)) {
                classInfoMap.set(name, info);
            }
        }
    }
    const typeChecker = program ? program.getTypeChecker() : null;
    const explicitControllerOrder = Array.from(allControllerNames);
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
                            "tweenController"
                        );
                        const newCallee = factory.createPropertyAccessExpression(
                            tweenControllerAccess,
                            "TweenTo"
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

            function visit(node) {
                if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
                    return transformClass(node);
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
                const usedControllers = isStartBareTarget ? new Set() : null;
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

                    const firstArgIsController = ts.isIdentifier(firstArg)
                        && registeredControllers.has(firstArg.text);

                    let hasScene = false;
                    if (!firstArgIsController && typeChecker) {
                        const argType = typeChecker.getTypeAtLocation(firstArg);
                        if (argType && argType.getProperty("scene")) {
                            hasScene = true;
                        }
                    }

                    let tweenControllerAccess;
                    if (hasScene) {
                        // firstArg.scene.tweenController
                        tweenControllerAccess = factory.createPropertyAccessExpression(
                            factory.createPropertyAccessExpression(firstArg, "scene"),
                            "tweenController"
                        );
                    } else if (extendsSceneDeep) {
                        // this.tweenController
                        tweenControllerAccess = factory.createPropertyAccessExpression(
                            factory.createThis(),
                            "tweenController"
                        );
                    } else {
                        // this.scene.tweenController
                        needsScene = true;
                        tweenControllerAccess = factory.createPropertyAccessExpression(
                            createThisScene(),
                            "tweenController"
                        );
                    }

                    const newCallee = factory.createPropertyAccessExpression(
                        tweenControllerAccess,
                        "TweenTo"
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
                        const propName = n.name && ts.isIdentifier(n.name) ? n.name.text : null;
                        if (propName && registeredControllers.has(propName)) {
                            const target = n.expression;
                            const isThis = ts.isThis(target);
                            const isThisScene =
                                ts.isPropertyAccessExpression(target)
                                && ts.isThis(target.expression)
                                && target.name.text === "scene";

                            if (isThis || isThisScene) {
                                if (usedControllers) {
                                    usedControllers.add(propName);
                                }
                            }
                        }
                    }
                    if (ts.isIdentifier(n) && isIdentifierReference(n)) {
                        const name = n.text;
                        const canRewriteScene = extendsSceneDeep || hasScene || extendsSceneCarrier;

                        if (name === "bare") {
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

                        if (registeredControllers.has(name)) {
                            if (usedControllers) {
                                usedControllers.add(name);
                            }
                            if (extendsSceneDeep) {
                                return createThisProperty(name);
                            }
                            if (canRewriteScene) {
                                needsScene = true;
                                return createThisSceneProperty(name);
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
                    if (!usedControllers || !isProjectSource) {
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
                    const target = expr.expression;
                    const isThis = ts.isThis(target);
                    const isThisScene =
                        ts.isPropertyAccessExpression(target)
                        && ts.isThis(target.expression)
                        && target.name.text === "scene";
                    if (!isThis && !isThisScene) {
                        return;
                    }
                    for (const className of directives) {
                        const controllerName = normalizeControllerName(className, registeredControllers);
                        if (controllerName) {
                            usedControllers.add(controllerName);
                        }
                    }
                }

                function transformBlockWithControllerRefs(block) {
                    const newStatements = [];
                    const introducedControllers = new Set();

                    for (const statement of block.statements) {
                        // Scan for controller refs in this statement before rewriting
                        function scanControllers(n) {
                            if (ts.isIdentifier(n) && isIdentifierReference(n) && registeredControllers.has(n.text)) {
                                if (!introducedControllers.has(n.text)) {
                                    introducedControllers.add(n.text);
                                    newStatements.push(
                                        factory.createExpressionStatement(factory.createIdentifier(n.text))
                                    );
                                }
                            }
                            if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "TweenTo") {
                                if (!introducedControllers.has("TweenTo")) {
                                    introducedControllers.add("TweenTo");
                                    newStatements.push(
                                        factory.createExpressionStatement(factory.createIdentifier("TweenTo"))
                                    );
                                }
                            }
                            ts.forEachChild(n, scanControllers);
                        }
                        scanControllers(statement);

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

                return updated;
            }

            return ts.visitNode(sourceFile, visit);
        };
    };
}

function collectRegisteredControllersFromProgram(program) {
    const names = new Set();
    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) {
            continue;
        }
        const fileNames = collectRegisteredControllers(sourceFile);
        for (const name of fileNames) {
            names.add(name);
        }
    }
    return names;
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

function collectRegisteredControllers(sourceFile) {
    const names = new Set();

    function collect(node) {
        if (ts.isCallExpression(node)) {
            const expression = node.expression;
            if (ts.isPropertyAccessExpression(expression)) {
                const isRegisterCall =
                    ts.isIdentifier(expression.expression)
                    && expression.expression.text === "BareEngine"
                    && expression.name.text === "RegisterController";

                if (isRegisterCall && node.arguments.length > 0) {
                    const firstArg = node.arguments[0];
                    if (ts.isIdentifier(firstArg)) {
                        const controllerName = lowerFirst(firstArg.text);
                        names.add(controllerName);
                    }
                }
            }
        }

        ts.forEachChild(node, collect);
    }

    collect(sourceFile);
    return names;
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
    const filePath = path.resolve(sourceFile.fileName);
    const projectSrc = path.resolve(process.cwd(), "src");
    return filePath.startsWith(projectSrc + path.sep);
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
                        if (propName && controllerNames.has(propName)) {
                            const target = n.expression;
                            const isThis = ts.isThis(target);
                            const isThisScene =
                                ts.isPropertyAccessExpression(target)
                                && ts.isThis(target.expression)
                                && target.name.text === "scene";
                            if (isThis || isThisScene) {
                                usedControllers.add(propName);
                            }
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

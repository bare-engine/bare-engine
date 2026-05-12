const ts = require("./projectRequire")("typescript");
const fs = require("fs");
const path = require("path");

const externalClassInfoMap = collectClassInfoFromDirs([
    path.resolve(process.cwd(), "../BareEngine/src"),
    path.resolve(process.cwd(), "node_modules/bare-engine/src"),
    path.resolve(process.cwd(), "src")
]);

/**
 * TypeScript transformer that auto-assigns .name on GameObject instantiations.
 *
 * For any statement like:
 *   this.foo = new SomeGameObject(...)
 *   const bar = new SomeGameObject(...)
 *
 * It injects after it:
 *   this.foo.name ||= "foo"
 *   bar.name ||= "bar"
 *
 * Works for any class extending GameObject at any inheritance depth.
 */
function createGameObjectNameTransformer(program) {
    const typeChecker = program ? program.getTypeChecker() : null;
    const classInfoMap = program ? collectClassInfo(program) : new Map();
    for (const [name, info] of externalClassInfoMap) {
        if (!classInfoMap.has(name)) {
            classInfoMap.set(name, info);
        }
    }

    return (context) => {
        return (sourceFile) => {
            function extendsGameObject(type) {
                if (!type) return false;
                const symbol = type.getSymbol();
                if (symbol && symbol.getName() === "GameObject") return true;

                const baseTypes = (type.getBaseTypes && type.getBaseTypes()) || [];
                for (const base of baseTypes) {
                    if (extendsGameObject(base)) return true;
                }
                return false;
            }

            function isGameObjectNew(expr) {
                if (!ts.isNewExpression(expr)) return false;

                const className = getNewExpressionClassName(expr);
                if (className && classExtendsGameObjectInHierarchy(className, classInfoMap)) {
                    return true;
                }

                if (!typeChecker) {
                    return false;
                }

                const type = typeChecker.getTypeAtLocation(expr);
                return extendsGameObject(type);
            }

            function getLastName(node) {
                if (ts.isIdentifier(node)) return node.text;
                if (ts.isPropertyAccessExpression(node)) return node.name.text;
                if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
                    return node.argumentExpression.text;
                }
                return null;
            }

            function createNameAssign(target, varName) {
                // target.name ||= "varName"
                return ts.factory.createExpressionStatement(
                    ts.factory.createBinaryExpression(
                        ts.factory.createPropertyAccessExpression(
                            target,
                            ts.factory.createIdentifier("name")
                        ),
                        ts.factory.createToken(ts.SyntaxKind.BarBarEqualsToken),
                        ts.factory.createStringLiteral(varName)
                    )
                );
            }

            function visitStatements(statements) {
                const result = [];
                for (const stmt of statements) {
                    // Visit children first
                    const visited = ts.visitEachChild(stmt, visitNode, context);
                    result.push(visited);

                    // Case 1: ExpressionStatement with assignment
                    // e.g. this.foo = new X(...)
                    if (ts.isExpressionStatement(visited) &&
                        ts.isBinaryExpression(visited.expression) &&
                        visited.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                        isGameObjectNew(visited.expression.right)) {
                        const lhs = visited.expression.left;
                        const varName = getLastName(lhs);
                        if (varName) {
                            result.push(createNameAssign(lhs, varName));
                        }
                    }

                    // Case 2: Variable declaration
                    // e.g. const foo = new X(...)
                    if (ts.isVariableStatement(visited)) {
                        for (const decl of visited.declarationList.declarations) {
                            if (decl.initializer && isGameObjectNew(decl.initializer) && ts.isIdentifier(decl.name)) {
                                const varName = decl.name.text;
                                result.push(createNameAssign(
                                    ts.factory.createIdentifier(varName),
                                    varName
                                ));
                            }
                        }
                    }
                }
                return result;
            }

            function visitNode(node) {
                // Handle blocks (function bodies, if blocks, etc.)
                if (ts.isBlock(node)) {
                    const newStatements = visitStatements(node.statements);
                    return ts.factory.updateBlock(node, newStatements);
                }

                // Handle source file top-level
                if (ts.isSourceFile(node)) {
                    const newStatements = visitStatements(node.statements);
                    return ts.factory.updateSourceFile(node, newStatements);
                }

                // Handle class declarations (for method bodies, constructor, etc.)
                return ts.visitEachChild(node, visitNode, context);
            }

            const newStatements = visitStatements(sourceFile.statements);
            return ts.factory.updateSourceFile(sourceFile, newStatements);
        };
    };
}

function collectClassInfo(program) {
    const map = new Map();

    for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) {
            continue;
        }

        collectClassInfoFromSourceFile(sourceFile, map);
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

            collectClassInfoFromSourceFile(sourceFile, map);
        }
    }

    return map;
}

function collectClassInfoFromSourceFile(sourceFile, map) {
    ts.forEachChild(sourceFile, (node) => {
        if (!ts.isClassDeclaration(node) || !node.name) {
            return;
        }
        const name = node.name.text;
        if (!map.has(name)) {
            map.set(name, { bases: getBaseClassNames(node) });
        }
    });
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

function getNewExpressionClassName(expr) {
    const callee = expr.expression;
    if (ts.isIdentifier(callee)) {
        return callee.text;
    }
    if (ts.isPropertyAccessExpression(callee)) {
        return callee.name.text;
    }
    return null;
}

function classExtendsGameObjectInHierarchy(className, classInfoMap) {
    if (className === "GameObject") {
        return true;
    }

    const visited = new Set();

    function walk(name) {
        if (!name || visited.has(name)) {
            return false;
        }
        visited.add(name);

        if (name === "GameObject") {
            return true;
        }

        const info = classInfoMap.get(name);
        if (!info) {
            return false;
        }

        return info.bases.some(walk);
    }

    return walk(className);
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

module.exports = createGameObjectNameTransformer;

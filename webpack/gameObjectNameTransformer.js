const ts = require("typescript");

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

    return (context) => {
        return (sourceFile) => {
            if (!typeChecker) return sourceFile;

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

module.exports = createGameObjectNameTransformer;

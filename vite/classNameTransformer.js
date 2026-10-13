const ts = require("./projectRequire")("typescript");

/**
 * TypeScript transformer that gives every named class its source name at runtime:
 *
 *   export class Enemy extends GameObject { ... }
 *
 * becomes
 *
 *   export class Enemy extends GameObject { ... }
 *   Object.defineProperty(Enemy, "name", { value: "Enemy", configurable: true });
 *
 * The engine looks classes up by name (controllers, pools, components, shaders, baseClass in
 * prefabs), and minifying renames them. esbuild's keepNames also keeps the names, but it does
 * that for every named function too, wrapping each one in an Object.defineProperty call where
 * it's created. In hot code that creates closures, like a physics step, that doubled the cost.
 * Only class names are ever read, so only those are kept.
 *
 * A statement after the class rather than a static block inside it: TypeScript lowers static
 * blocks of decorated classes with `this` as undefined. Code that runs while the class is still
 * being defined (its static fields, decorators) doesn't see the name yet; the engine's doesn't
 * read it there. It also undoes the suffix decorators add in development (Projectile2 -> Projectile).
 */
function createClassNameTransformer() {
    return (context) => {
        const factory = context.factory;

        function nameStatement(name) {
            return factory.createExpressionStatement(factory.createCallExpression(
                factory.createPropertyAccessExpression(factory.createIdentifier("Object"), "defineProperty"),
                undefined,
                [
                    factory.createIdentifier(name),
                    factory.createStringLiteral("name"),
                    factory.createObjectLiteralExpression([
                        factory.createPropertyAssignment("value", factory.createStringLiteral(name)),
                        factory.createPropertyAssignment("configurable", factory.createTrue())
                    ])
                ]
            ));
        }

        function isAmbient(node) {
            return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient) !== 0
                || !!(node.flags & ts.NodeFlags.Ambient);
        }

        function visit(node) {
            const visited = ts.visitEachChild(node, visit, context);

            // Statement position only: a class declaration always is one
            if (ts.isClassDeclaration(node) && node.name && !isAmbient(node))
                return [visited, nameStatement(node.name.text)];

            return visited;
        }

        return (sourceFile) => sourceFile.isDeclarationFile ? sourceFile : ts.visitNode(sourceFile, visit);
    };
}

module.exports = createClassNameTransformer;

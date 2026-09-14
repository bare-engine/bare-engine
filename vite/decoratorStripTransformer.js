// decoratorStripTransformer.js
//
// A build-time TypeScript AST transformer (run from the Vite prod build) that removes the
// engine's editor-only inspector decorators so that src/utils/decorators.ts ends up with
// ZERO importers and gets tree-shaken out of the production bundle.
//
// It is deliberately scoped to the editor/inspector metadata in decorators.ts. @Run (utils/runModes.ts)
// and @Save / getSaveFields (utils/saveFields.ts) live elsewhere on purpose - they carry real runtime
// semantics (component run-mode gating, level/SaveData serialization) - so they are never touched
// here and keep working in prod.
//
// WHAT IT DOES (per source file), only when the file imports from the decorators module:
//   1. Strips the @-decorator usages of the inspector decorators (@InspectorField, @Inspector.Field,
//      @Limit/@Range, @Dropdown, @Enum, ...) from classes, properties, methods and accessors. Because
//      this runs as a `before` transformer, TypeScript never emits the __decorate(...) helper
//      for them, so no reference to the decorator function survives.
//   2. Replaces calls to the runtime READER functions (getInspectorFields, getButtons, ...)
//      with their empty equivalents ([], {}, false). After the decorators are gone these would
//      only ever return empty results anyway.
//   3. Drops the now-unused named imports from the decorators module (and the index.ts
//      `export { ... } from "./utils/decorators"` re-export). Imports of OTHER specifiers from
//      "bare-engine" (Component, Scene, ...) are preserved - only the decorator/reader names
//      are removed.
//
// Once every importer has had its decorator/reader bindings removed, decorators.ts has no
// remaining importers and Rollup drops it entirely.

const ts = require("./projectRequire")("typescript");

// The editor-only decorators exported by src/utils/decorators.ts. @Run and @Save are intentionally
// absent (they live in utils/runModes.ts / utils/saveFields.ts and must survive the prod build).
const DECORATOR_NAMES = new Set([
    "InspectorButton",
    "InspectorField",
    "InspectorBaseClass",
    "InspectorClass",
    "Locked",
    "Limit",
    "Range",
    "Percentage",
    "Dropdown",
    "Enum",
    "Decimal",
    "Int",
    "Label",
    "Description",
]);

const INSPECTOR_NAMESPACE_NAME = "Inspector";
const INSPECTOR_DECORATOR_PROPERTIES = new Set([
    "Button",
    "Field",
    "BaseClass",
    "Class",
    "Locked",
    "Limit",
    "Range",
    "Percentage",
    "Dropdown",
    "Enum",
    "Decimal",
    "Int",
    "Label",
    "Description",
]);

// The runtime reader functions exported by decorators.ts and the empty value each call is
// replaced with once the decorators (and therefore the metadata they registered) are gone.
const READER_REPLACEMENTS = {
    getButtons: "array",
    getInspectorClassNames: "array",
    getInspectorClasses: "array",
    "getOwnInspectorFieldNames": "array",
    getInspectorFields: "array",
    getInspectorFieldNames: "array",
    getInspectorFieldDescriptions: "object",
    applyInspectorField: "false",
};

// True for a relative specifier that resolves to src/utils/decorators (with or without extension):
// "../utils/decorators", "../../utils/decorators", "./decorators", ...
function isDecoratorsModuleSpecifier(text) {
    const noExt = text.replace(/\.[cm]?[jt]sx?$/, "");
    return /(?:^|\/)decorators$/.test(noExt);
}

function getImportAttributes(node) {
    // Property is `attributes` in TS >= 5.3, `assertClause` before that.
    return node.attributes !== undefined ? node.attributes : node.assertClause;
}

function makeReaderReplacement(originalName, factory) {
    switch (READER_REPLACEMENTS[originalName]) {
        case "array":
            return factory.createArrayLiteralExpression([], false);
        case "object":
            return factory.createObjectLiteralExpression([], false);
        case "false":
            return factory.createFalse();
        default:
            return null;
    }
}

function rebuildWithModifiers(node, modifiers, factory) {
    if (ts.isClassDeclaration(node)) {
        return factory.updateClassDeclaration(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
    }
    if (ts.isClassExpression(node)) {
        return factory.updateClassExpression(node, modifiers, node.name, node.typeParameters, node.heritageClauses, node.members);
    }
    if (ts.isPropertyDeclaration(node)) {
        return factory.updatePropertyDeclaration(node, modifiers, node.name, node.questionToken || node.exclamationToken, node.type, node.initializer);
    }
    if (ts.isMethodDeclaration(node)) {
        return factory.updateMethodDeclaration(node, modifiers, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, node.type, node.body);
    }
    if (ts.isGetAccessorDeclaration(node)) {
        return factory.updateGetAccessorDeclaration(node, modifiers, node.name, node.parameters, node.type, node.body);
    }
    if (ts.isSetAccessorDeclaration(node)) {
        return factory.updateSetAccessorDeclaration(node, modifiers, node.name, node.parameters, node.body);
    }
    if (ts.isParameter(node)) {
        return factory.updateParameterDeclaration(node, modifiers, node.dotDotDotToken, node.name, node.questionToken, node.type, node.initializer);
    }
    return node;
}

function isStrippedDecoratorExpression(expr, decoratorLocals, inspectorLocals) {
    if (ts.isCallExpression(expr)) {
        expr = expr.expression;
    }

    if (ts.isIdentifier(expr)) {
        return decoratorLocals.has(expr.text);
    }

    return ts.isPropertyAccessExpression(expr)
        && ts.isIdentifier(expr.expression)
        && inspectorLocals.has(expr.expression.text)
        && INSPECTOR_DECORATOR_PROPERTIES.has(expr.name.text);
}

// Drops every @-decorator whose (call-)expression identifier is a stripped decorator local.
function withDecoratorsStripped(node, decoratorLocals, inspectorLocals, factory) {
    const modifiers = node.modifiers;
    if (!modifiers || modifiers.length === 0) {
        return node;
    }

    let changed = false;
    const kept = [];
    for (const modifier of modifiers) {
        if (ts.isDecorator(modifier) && isStrippedDecoratorExpression(modifier.expression, decoratorLocals, inspectorLocals)) {
            changed = true;
            continue;
        }
        kept.push(modifier);
    }

    if (!changed) {
        return node;
    }
    return rebuildWithModifiers(node, kept.length > 0 ? kept : undefined, factory);
}

function createDecoratorStripTransformer() {
    return (context) => {
        const factory = context.factory;

        return (sourceFile) => {
            const decoratorLocals = new Set();   // local name -> stripped decorator
            const inspectorLocals = new Set();   // local name -> Inspector namespace object
            const readerLocals = new Map();       // local name -> reader's original export name
            const statementReplacements = new Map(); // original import/export node -> replacement node | undefined (drop)

            // PASS 1: scan imports/exports from the decorators module, collect the local names to
            // neutralize and figure out how each declaration should be rewritten.
            for (const statement of sourceFile.statements) {
                if (
                    ts.isImportDeclaration(statement)
                    && statement.moduleSpecifier
                    && ts.isStringLiteral(statement.moduleSpecifier)
                ) {
                    const text = statement.moduleSpecifier.text;
                    const fromDecorators = isDecoratorsModuleSpecifier(text);
                    const fromPackage = text === "bare-engine";
                    if (!fromDecorators && !fromPackage) {
                        continue;
                    }

                    const clause = statement.importClause;
                    if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
                        continue;
                    }

                    const keptSpecifiers = [];
                    for (const spec of clause.namedBindings.elements) {
                        const original = (spec.propertyName || spec.name).text;
                        const local = spec.name.text;
                        if (original === INSPECTOR_NAMESPACE_NAME) {
                            inspectorLocals.add(local);
                            continue;
                        }
                        if (DECORATOR_NAMES.has(original)) {
                            decoratorLocals.add(local);
                            continue;
                        }
                        // Reader functions are internal to the engine and only ever imported from the
                        // decorators module directly (never re-exported from "bare-engine").
                        if (fromDecorators && Object.prototype.hasOwnProperty.call(READER_REPLACEMENTS, original)) {
                            readerLocals.set(local, original);
                            continue;
                        }
                        keptSpecifiers.push(spec);
                    }

                    if (keptSpecifiers.length === clause.namedBindings.elements.length) {
                        continue; // nothing removed from this import
                    }

                    if (keptSpecifiers.length === 0 && !clause.name) {
                        statementReplacements.set(statement, undefined); // drop the whole import
                    } else {
                        const newClause = factory.updateImportClause(
                            clause,
                            clause.isTypeOnly,
                            clause.name,
                            factory.updateNamedImports(clause.namedBindings, keptSpecifiers)
                        );
                        statementReplacements.set(statement, factory.updateImportDeclaration(
                            statement,
                            statement.modifiers,
                            newClause,
                            statement.moduleSpecifier,
                            getImportAttributes(statement)
                        ));
                    }
                } else if (
                    ts.isExportDeclaration(statement)
                    && statement.moduleSpecifier
                    && ts.isStringLiteral(statement.moduleSpecifier)
                    && isDecoratorsModuleSpecifier(statement.moduleSpecifier.text)
                    && statement.exportClause
                    && ts.isNamedExports(statement.exportClause)
                ) {
                    // The index.ts `export { ... } from "./utils/decorators"` re-export.
                    const keptSpecifiers = statement.exportClause.elements.filter(
                        spec => {
                            const original = (spec.propertyName || spec.name).text;
                            return original !== INSPECTOR_NAMESPACE_NAME && !DECORATOR_NAMES.has(original);
                        }
                    );
                    if (keptSpecifiers.length === statement.exportClause.elements.length) {
                        continue;
                    }
                    if (keptSpecifiers.length === 0) {
                        statementReplacements.set(statement, undefined);
                    } else {
                        statementReplacements.set(statement, factory.updateExportDeclaration(
                            statement,
                            statement.modifiers,
                            statement.isTypeOnly,
                            factory.updateNamedExports(statement.exportClause, keptSpecifiers),
                            statement.moduleSpecifier,
                            getImportAttributes(statement)
                        ));
                    }
                }
            }

            if (decoratorLocals.size === 0 && inspectorLocals.size === 0 && readerLocals.size === 0 && statementReplacements.size === 0) {
                return sourceFile;
            }

            // PASS 2: rewrite imports/exports, replace reader calls, strip decorator usages.
            const visit = (node) => {
                if (statementReplacements.has(node)) {
                    return statementReplacements.get(node);
                }

                if (
                    ts.isCallExpression(node)
                    && ts.isIdentifier(node.expression)
                    && readerLocals.has(node.expression.text)
                ) {
                    const replacement = makeReaderReplacement(readerLocals.get(node.expression.text), factory);
                    if (replacement) {
                        return replacement;
                    }
                }

                const visited = ts.visitEachChild(node, visit, context);
                if (decoratorLocals.size > 0 || inspectorLocals.size > 0) {
                    return withDecoratorsStripped(visited, decoratorLocals, inspectorLocals, factory);
                }
                return visited;
            };

            return ts.visitNode(sourceFile, visit);
        };
    };
}

module.exports = createDecoratorStripTransformer;

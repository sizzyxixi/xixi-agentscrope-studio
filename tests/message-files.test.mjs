import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../app/FileWorkspace.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("FileWorkspace.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "MessageFiles");
assert.ok(component, "The attachment renderer must exist");
const { outputText } = ts.transpileModule(component.getText(ast), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
});

function render(state) {
  const exports = {};
  // React external-store selectors must return the same snapshot for unchanged
  // state. Exercise the production renderer's selectors with runtime placeholders.
  const useAuiState = selector => {
    const first = selector(state);
    assert.strictEqual(selector(state), first, "Unchanged message state must have a stable snapshot");
    return first;
  };
  new Function("require", "exports", "useAuiState", "FileCard", outputText)(require, exports, useAuiState, () => null);
  return exports.MessageFiles();
}

test("pending runtime messages without custom attachments have stable snapshots", () => {
  for (const role of ["user", "assistant"]) {
    for (const custom of [{}, { studioFiles: undefined }, { studioFiles: [] }]) {
      assert.equal(render({ message: { role, metadata: { custom } } }), null);
    }
  }
});

test("sent attachments still render cards in the user's expandable group", () => {
  const files = [{ id: "uploaded", name: "invoice.png", available: true }];
  const tree = render({ message: { role: "user", metadata: { custom: { studioFiles: files } } } });
  assert.equal(tree.type, "details");
  assert.equal(tree.props.open, true);
  const cards = tree.props.children[1].props.children;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].props.file, files[0]);
});

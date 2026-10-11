import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("./static/app.js", import.meta.url), "utf8");
function functionSource(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
function harness(post) {
  const state = {
    currentPage: "admin", adminSection: "moynalog", adminSettingsDirty: true,
    adminIntegrationBusy: "", adminMoyNalogBusy: "", adminBusy: "",
    adminIntegrationDrafts: { moynalog: { dirty: true, enabled: true, fields: { username: "123456789012", password: "test-password", itemName: "VPN", paymentMethods: '["yookassa"]' } } },
    data: { admin: { integrations: [{ id: "moynalog" }] } },
  };
  const context = vm.createContext({ state, adminBackgroundBusy: false, post, render() {}, showToast() {} });
  vm.runInContext(["adminEditorSaveState", "saveAdminSettings", "saveAdminIntegration"].map(functionSource).join("\n"), context);
  return context;
}

test("the shared save action saves My Tax through the integration endpoint and clears its password draft", async () => {
  let complete;
  const calls = [];
  const context = harness((url, body) => {
    calls.push({ url, body: JSON.parse(JSON.stringify(body)) });
    return new Promise(resolve => { complete = resolve; });
  });
  const operation = context.saveAdminSettings();
  assert.equal(context.adminEditorSaveState().busy, true);
  assert.equal(context.adminEditorSaveState().saving, true);
  assert.deepEqual(calls, [{ url: "/api/mini-app/admin/integrations/update", body: {
    provider: "moynalog", enabled: true, fields: { username: "123456789012", password: "test-password", itemName: "VPN", paymentMethods: '["yookassa"]' },
  } }]);
  complete({ data: { id: "moynalog", enabled: true, configured: true, fields: [{ key: "password", secret: true, configured: true }, { key: "itemName", value: "VPN" }] } });
  await operation;
  assert.equal(context.adminEditorSaveState().dirty, false);
  assert.equal(context.adminEditorSaveState().busy, false);
  assert.equal(context.state.adminIntegrationDrafts.moynalog.fields.password, "");
  assert.equal(context.state.adminMoyNalog.integration.configured, true);
  assert.equal(context.state.adminSettingsDirty, true, "unrelated unsaved runtime settings must remain untouched");
});

test("a failed My Tax save preserves edits and re-enables the shared save action", async () => {
  const context = harness(async () => { throw new Error("offline"); });
  await assert.rejects(context.saveAdminSettings(), /offline/);
  assert.equal(context.adminEditorSaveState().dirty, true);
  assert.equal(context.adminEditorSaveState().busy, false);
  assert.equal(context.state.adminIntegrationDrafts.moynalog.fields.itemName, "VPN");
});

test("ordinary editors continue using their runtime settings save state", () => {
  const context = harness(async () => {});
  context.state.adminSection = "trial";
  context.state.adminBusy = "save-settings";
  assert.deepEqual(JSON.parse(JSON.stringify(context.adminEditorSaveState())), { dirty: true, busy: true, saving: true });
});

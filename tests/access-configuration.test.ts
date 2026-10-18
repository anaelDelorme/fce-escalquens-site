import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { accessConfiguration } from "../src/shop/security";
import type { ShopEnv } from "../src/shop/service";

test("diagnostic Access : indique précisément les variables manquantes", () => {
  assert.throws(
    () => accessConfiguration({} as ShopEnv),
    (error: any) =>
      error.code === "ACCESS_CONFIG" &&
      error.message.includes("CF_ACCESS_ISSUER") &&
      error.message.includes("CF_ACCESS_SHOP_AUD"),
  );
  assert.throws(
    () =>
      accessConfiguration({
        CF_ACCESS_ISSUER: "https://test.cloudflareaccess.com",
      } as ShopEnv),
    (error: any) => error.message.includes("CF_ACCESS_SHOP_AUD"),
  );
});
test("normalisation Access : espaces et slash final tolérés sans relâcher la vérification JWT", () => {
  assert.deepEqual(
    accessConfiguration({
      CF_ACCESS_ISSUER: " https://test.cloudflareaccess.com/ ",
      CF_ACCESS_SHOP_AUD: " app-one, ,app-two ",
    } as ShopEnv),
    {
      issuer: "https://test.cloudflareaccess.com",
      audiences: ["app-one", "app-two"],
    },
  );
  assert.throws(
    () =>
      accessConfiguration({
        CF_ACCESS_ISSUER: "https://attacker.example",
        CF_ACCESS_SHOP_AUD: "test",
      } as ShopEnv),
    /domaine d’équipe invalide/,
  );
  assert.throws(
    () =>
      accessConfiguration({
        CF_ACCESS_ISSUER: "https://test.cloudflareaccess.com",
        CF_ACCESS_SHOP_AUD: " , ",
      } as ShopEnv),
    /CF_ACCESS_SHOP_AUD/,
  );
});
test("configuration CLI : préserve toutes les bases et ne modifie que les variables de staging", () => {
  const folder = mkdtempSync(join(process.cwd(), ".access-test-"));
  try {
    const file = join(folder, "wrangler.jsonc");
    const config = {
      vars: { APP_ENV: "production" },
      d1_databases: [{ binding: "DB", database_id: "prod-site" }],
      env: {
        staging: {
          vars: { APP_ENV: "staging", STAGING_WORKFLOW_REF: "staging" },
          d1_databases: [
            { binding: "DB", database_id: "stage-site" },
            {
              binding: "ORDERS",
              database_id: "3149647e-9a2f-403a-9591-b7d161bbc98a",
            },
          ],
        },
      },
    };
    writeFileSync(file, JSON.stringify(config));
    const args = [
      "scripts/configure-shop-access.mjs",
      "--config",
      file,
      "--env",
      "staging",
      "--issuer",
      "https://club.cloudflareaccess.com/",
      "--aud",
      "a".repeat(64),
      "--origin",
      "https://staging.example.org/",
    ];
    let result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const updated = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(updated.d1_databases, config.d1_databases);
    assert.deepEqual(
      updated.env.staging.d1_databases,
      config.env.staging.d1_databases,
    );
    assert.deepEqual(updated.vars, config.vars);
    assert.equal(
      updated.env.staging.vars.SHOP_ORIGIN,
      "https://staging.example.org",
    );
    assert.equal(updated.env.staging.vars.STAGING_WORKFLOW_REF, "staging");
    result = spawnSync(
      process.execPath,
      [
        "scripts/configure-shop-access.mjs",
        "--config",
        file,
        "--env",
        "staging",
        "--check",
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const before = readFileSync(file, "utf8");
    result = spawnSync(
      process.execPath,
      [
        ...args.slice(0, -4),
        "--aud",
        "11111111-1111-4111-8111-111111111111",
        "--origin",
        "https://staging.example.org",
      ],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(file, "utf8"), before);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test('configuration V5.1 : audience tournois et association sandbox sans toucher aux accès boutique ni aux bases',()=>{
 const folder=mkdtempSync(join(process.cwd(),'.access-test-'));
 try{
  const file=join(folder,'wrangler.jsonc'),config={vars:{APP_ENV:'production'},d1_databases:[{binding:'ORDERS',database_id:'prod-orders'}],env:{staging:{vars:{APP_ENV:'staging',CF_ACCESS_SHOP_AUD:'a'.repeat(64)},d1_databases:[{binding:'ORDERS',database_id:'staging-orders'}]}}};writeFileSync(file,JSON.stringify(config));
  let result=spawnSync(process.execPath,['scripts/configure-shop-access.mjs','--scope','tournament','--env','staging','--config',file,'--issuer','https://club.cloudflareaccess.com','--aud','b'.repeat(64),'--origin','https://staging.example.org'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  result=spawnSync(process.execPath,['scripts/configure-helloasso.mjs','--config',file,'--env','staging','--slug','fce'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const updated=JSON.parse(readFileSync(file,'utf8'));assert.equal(updated.env.staging.vars.CF_ACCESS_SHOP_AUD,'a'.repeat(64));assert.equal(updated.env.staging.vars.CF_ACCESS_TOURNAMENT_AUD,'b'.repeat(64));assert.equal(updated.env.staging.vars.HELLOASSO_ORGANIZATION_SLUG,'fce');assert.equal(updated.env.staging.vars.SHOP_ORIGIN,'https://staging.example.org');assert.deepEqual(updated.d1_databases,config.d1_databases);assert.deepEqual(updated.env.staging.d1_databases,config.env.staging.d1_databases);assert.deepEqual(updated.vars,config.vars);assert.ok(!readFileSync(file,'utf8').includes('CLIENT_SECRET'));
 }finally{rmSync(folder,{recursive:true,force:true});}
});

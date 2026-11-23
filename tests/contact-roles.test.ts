import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import worker from "../src/worker";
import { TestDatabase } from "./d1";

test("les rôles des contacts sont migrés, modifiables et visibles sur les deux pages publiques", async () => {
  const db = new TestDatabase();
  try {
    const migrations = new URL("../migrations/", import.meta.url);
    for (const migration of readdirSync(migrations).filter(name => name.endsWith(".sql")).sort()) {
      if (migration === "0038_contact_roles.sql") {
        await db.exec(`INSERT INTO contacts (name, role) VALUES
          ('Camille', 'responsable_mecenat'), ('Alex', 'Coordination_des_bénévoles')`);
      }
      await db.exec(readFileSync(new URL(migration, migrations), "utf8"));
    }

    const env = { DB: db, DEV_ADMIN_TOKEN: "test" } as unknown as Parameters<typeof worker.fetch>[1];
    const ctx = {} as ExecutionContext;
    const request = (path: string, method = "GET", body?: object, authenticated = true) => worker.fetch(
      new Request(`https://example.test${path}`, {
        method,
        headers: authenticated ? { "x-admin-token": "test" } : {},
        body: body === undefined ? undefined : JSON.stringify(body)
      }),
      env,
      ctx
    );
    const contacts = async (page = "contacts") => (await (await request(`/api/page/${page}`)).json()).contacts;
    const roles = await (await request("/admin-api/contact_roles")).json();
    const sponsorship = roles.find(role => role.code === "responsable_mecenat");
    assert.deepEqual((await contacts()).find(contact => contact.name === "Alex").roles.map(role => role.name),
      ["Coordination des bénévoles"]);
    assert.equal((await request("/admin-api/contact_roles", "POST", { name: "Accueil" }, false)).status, 401);
    assert.equal((await request("/admin-api/contact_roles", "POST", { name: "   " })).status, 400);
    assert.equal((await request("/admin-api/contact_roles", "POST", { name: "Accueil" })).status, 201);
    const catalogue = await (await request("/admin-api/contact_roles")).json();
    const reception = catalogue.find(role => role.name === "Accueil");

    assert.equal((await request("/admin-api/contacts/1", "PUT", {
      role_ids: [reception.id, sponsorship.id, reception.id]
    })).status, 200);
    assert.equal((await request(`/admin-api/contact_roles/${sponsorship.id}`, "PUT", { name: "Partenariats" })).status, 200);
    for (const page of ["contacts", "mecenat"]) {
      const camille = (await contacts(page)).find(contact => contact.name === "Camille");
      assert.deepEqual(camille.roles.map(role => role.name), ["Accueil", "Partenariats"]);
      assert.equal(camille.roles[1].code, "responsable_mecenat");
    }

    assert.equal((await request("/admin-api/contacts/1", "PUT", {
      name: "Nom à conserver", role_ids: [99999]
    })).status, 409);
    assert.equal((await contacts()).find(contact => contact.name === "Camille").roles.length, 2);
    assert.equal((await request("/admin-api/contacts", "POST", {
      name: "Dominique", role_ids: [reception.id, sponsorship.id], published: 0
    })).status, 201);
    const adminContacts = await (await request("/admin-api/contacts")).json();
    const dominique = adminContacts.find(contact => contact.name === "Dominique");
    assert.equal(dominique.roles.length, 2);
    assert.equal((await contacts()).some(contact => contact.name === "Dominique"), false);
    assert.equal((await request(`/admin-api/contacts/${dominique.id}`, "DELETE")).status, 200);
    assert.equal((await request("/admin-api/contacts/1", "PUT", { role_ids: [] })).status, 200);
    assert.deepEqual((await contacts()).find(contact => contact.name === "Camille").roles, []);
  } finally {
    db.close();
  }
});

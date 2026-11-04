import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

// Запускаем в отдельном тестовом Supabase с подготовленными данными
const file = process.env.CRM_TEST_CREDENTIALS;
test(
  "Supabase Auth + PostgREST end-to-end security and lifecycle",
  { skip: !file && "Set CRM_TEST_CREDENTIALS to the seed credentials file." },
  async () => {
    const { url, publishableKey, users } = JSON.parse(
      await readFile(file, "utf8"),
    );
    const clients = await Promise.all(
      users.map(async (u) => {
        const c = createClient(url, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const login = await c.auth.signInWithPassword({
          email: u.email,
          password: u.password,
        });
        assert.ifError(login.error);
        return c;
      }),
    );
    const [manager, worker, other] = clients;
    const rpc = async (c, name, args) => {
      const query = c.rpc(name, args);
      const r = name.startsWith("delete_") ? await query : await query.single();
      assert.ifError(r.error);
      return r.data;
    };
    const object = await rpc(manager, "create_object", {
      p_name: "API test " + Date.now(),
      p_address: "Test address",
    });
    try {
      let task = await rpc(manager, "create_task", {
        p_title: "Security lifecycle",
        p_description: "",
        p_object_id: object.id,
        p_assignee_id: users[1].id,
      });
      const foreign = await other.from("tasks").select("*").eq("id", task.id);
      assert.ifError(foreign.error);
      assert.equal(foreign.data.length, 0);
      const foreignObjects = await other
        .from("objects")
        .select("*")
        .eq("id", object.id);
      assert.ifError(foreignObjects.error);
      assert.equal(foreignObjects.data.length, 0);
      const foreignHistory = await other
        .from("task_history")
        .select("*")
        .eq("task_id", task.id);
      assert.ifError(foreignHistory.error);
      assert.equal(foreignHistory.data.length, 0);
      for (const c of [manager, worker, other]) {
        assert.ok(
          (
            await c
              .from("tasks")
              .update({ status: "accepted" })
              .eq("id", task.id)
          ).error,
        );
        assert.ok(
          (
            await c.from("task_history").insert({
              task_id: task.id,
              actor_id: users[0].id,
              to_status: "accepted",
            })
          ).error,
        );
        assert.ok(
          (
            await c
              .from("task_history")
              .update({ comment: "forged" })
              .eq("task_id", task.id)
          ).error,
        );
        assert.ok(
          (await c.from("task_history").delete().eq("task_id", task.id)).error,
        );
        assert.ok(
          (
            await c
              .from("profiles")
              .update({ role: "manager" })
              .eq("id", users[1].id)
          ).error,
        );
      }
      const move = (c, to, comment = null, version = task.version) =>
        c
          .rpc("change_task_status", {
            p_id: task.id,
            p_to_status: to,
            p_expected_version: version,
            p_comment: comment,
          })
          .single();
      assert.ok((await move(other, "in_progress")).error);
      assert.ok((await move(manager, "accepted")).error);
      task = (await move(worker, "in_progress")).data;
      assert.equal(task.status, "in_progress");
      assert.ok((await move(worker, "review", null, 1)).error);
      task = (await move(worker, "review")).data;
      assert.equal(task.status, "review");
      assert.ok((await move(manager, "rework", "   ")).error);
      task = (await move(manager, "rework", "Исправить стык")).data;
      assert.equal(task.status, "rework");
      task = (await move(worker, "in_progress")).data;
      task = (await move(worker, "review")).data;
      task = (await move(manager, "accepted")).data;
      assert.equal(task.status, "accepted");
      const history = await worker
        .from("task_history")
        .select("*")
        .eq("task_id", task.id)
        .order("created_at");
      assert.ifError(history.error);
      assert.equal(history.data.length, 7);
      assert.equal(history.data[3].comment, "Исправить стык");
      assert.equal(history.data[3].actor_id, users[0].id);
      const anon = createClient(url, publishableKey, {
        auth: { persistSession: false },
      });
      const anonRead = await anon.from("tasks").select("*");
      assert.ok(anonRead.error || anonRead.data.length === 0);
      const signup = await anon.auth.signUp({
        email: `registration-check-${Date.now()}@stroika.example`,
        password: "Test-signup-disabled-123!",
      });
      assert.ok(
        signup.error,
        "Open registration must be disabled in Supabase Auth settings",
      );
      assert.match(
        signup.error.code ?? signup.error.message,
        /signup_disabled|signups? not allowed|signups? disabled/i,
      );
    } finally {
      await rpc(manager, "delete_object", {
        p_id: object.id,
        p_expected_version: object.version,
      });
      await Promise.all(clients.map((c) => c.auth.signOut()));
    }
  },
);

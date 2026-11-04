import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

let db;
const manager = "10000000-0000-0000-0000-000000000001";
const manager2 = "10000000-0000-0000-0000-000000000002";
const worker = "10000000-0000-0000-0000-000000000003";
const other = "10000000-0000-0000-0000-000000000004";
const unprovisioned = "10000000-0000-0000-0000-000000000005";
let object, task;

// Проверяем запросы с правами сотрудника, затем возвращаем исходную роль
async function asUser(id, sql, params = []) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
async function rpc(user, name, params) {
  const result = await asUser(
    user,
    `select * from public.${name}(${params.map((_, i) => "$" + (i + 1)).join(",")})`,
    params,
  );
  return result.rows[0];
}
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/202611040001_crm.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const [id, name, role] of [
    [manager, "Manager", "manager"],
    [manager2, "Second manager", "manager"],
    [worker, "Worker", "executor"],
    [other, "Other worker", "executor"],
  ]) {
    await db.query("insert into auth.users values ($1)", [id]);
    await db.query("insert into public.profiles values ($1, $2, $3)", [
      id,
      name,
      role,
    ]);
  }
  await db.query("insert into auth.users values ($1)", [unprovisioned]);
  object = await rpc(manager, "create_object", ["Объект А", "Адрес А"]);
  task = await rpc(manager, "create_task", [
    "Задача А",
    "Описание",
    object.id,
    worker,
  ]);
});
after(async () => {
  await db?.close();
});

test("RLS: executor sees only own tasks, related objects and history", async () => {
  const b = await rpc(manager, "create_object", ["Закрытый объект", "Адрес Б"]);
  await rpc(manager, "create_task", ["Чужая задача", "", b.id, other]);
  assert.equal(
    (await asUser(worker, "select * from public.tasks")).rows.length,
    1,
  );
  assert.equal(
    (await asUser(worker, "select * from public.objects")).rows.length,
    1,
  );
  assert.equal(
    (await asUser(worker, "select * from public.task_history")).rows.length,
    1,
  );
  assert.equal(
    (await asUser(manager2, "select * from public.tasks")).rows.length,
    2,
  );
  assert.equal(
    (await asUser(unprovisioned, "select * from public.tasks")).rows.length,
    0,
  );
  await assert.rejects(rpc(unprovisioned, "create_object", ["X", "Y"]), {
    code: "42501",
  });
});

test("anonymous access and function execution are denied", async () => {
  await db.exec("set role anon");
  try {
    await assert.rejects(db.query("select * from public.tasks"), {
      code: "42501",
    });
    await assert.rejects(db.query("select public.create_object('X','Y')"), {
      code: "42501",
    });
  } finally {
    await db.exec("reset role");
  }
});

test("direct API-style writes, role escalation and forged history are denied for both roles", async () => {
  const statements = [
    "update public.tasks set status = 'accepted'",
    "update public.tasks set title = 'Hacked'",
    "delete from public.tasks",
    "insert into public.tasks(title,object_id,assignee_id,created_by) values ('X', $1, $2, $2)",
    "update public.profiles set role = 'manager'",
    "delete from public.task_history",
    "update public.task_history set comment = 'Forged'",
    "insert into public.task_history(task_id,actor_id,to_status) values ($1, $2, 'accepted')",
    "update public.objects set name = 'Hacked'",
    "delete from public.objects",
  ];
  for (const user of [manager, worker])
    for (const sql of statements) {
      const params = sql.includes("$1")
        ? [sql.includes("task_history") ? task.id : object.id, worker]
        : [];
      await assert.rejects(asUser(user, sql, params), { code: "42501" }, sql);
    }
});

test("all 50 status/role combinations enforce the exact transition matrix", async () => {
  const statuses = ["new", "in_progress", "review", "accepted", "rework"];
  const allowed = new Set([
    "executor:new:in_progress",
    "executor:rework:in_progress",
    "executor:in_progress:review",
    "manager:review:accepted",
    "manager:review:rework",
  ]);
  for (const [role, user] of [
    ["manager", manager],
    ["executor", worker],
  ])
    for (const from of statuses)
      for (const to of statuses) {
        const fixture = await rpc(manager, "create_task", [
          `${from} to ${to}`,
          "",
          object.id,
          worker,
        ]);
        // Подготавливаем тестовые данные с правами владельца, недоступными через рабочий API
        await db.query("update public.tasks set status = $1 where id = $2", [
          from,
          fixture.id,
        ]);
        const call = () =>
          rpc(user, "change_task_status", [
            fixture.id,
            to,
            1,
            "Проверить стык",
          ]);
        if (allowed.has(`${role}:${from}:${to}`)) {
          const result = await call();
          assert.equal(result.status, to);
          const history = (
            await asUser(
              user,
              "select * from public.task_history where task_id = $1 order by created_at",
              [fixture.id],
            )
          ).rows;
          assert.equal(history.length, 2);
          assert.equal(history[1].actor_id, user);
          assert.equal(history[1].from_status, from);
          assert.equal(history[1].to_status, to);
          assert.equal(history[1].comment, "Проверить стык");
        } else {
          await assert.rejects(
            call(),
            { code: "42501" },
            `${role}:${from}:${to}`,
          );
          assert.equal(
            (
              await db.query(
                "select count(*)::int as n from public.task_history where task_id=$1",
                [fixture.id],
              )
            ).rows[0].n,
            1,
          );
        }
      }
});

test("foreign executor cannot transition, edit, create, delete or reassign tasks", async () => {
  await assert.rejects(
    rpc(other, "change_task_status", [task.id, "in_progress", 1, null]),
    { code: "42501" },
  );
  await assert.rejects(
    rpc(worker, "update_task", [task.id, "X", "", object.id, other, 1]),
    { code: "42501" },
  );
  await assert.rejects(
    rpc(worker, "create_task", ["X", "", object.id, worker]),
    { code: "42501" },
  );
  await assert.rejects(rpc(worker, "delete_task", [task.id, 1]), {
    code: "42501",
  });
  await assert.rejects(rpc(worker, "delete_object", [object.id, 1]), {
    code: "42501",
  });
});

test("full rework cycle, mandatory comment and optimistic concurrency", async () => {
  let t = await rpc(manager, "create_task", [
    "Полный цикл",
    "",
    object.id,
    worker,
  ]);
  t = await rpc(worker, "change_task_status", [
    t.id,
    "in_progress",
    t.version,
    null,
  ]);
  await assert.rejects(
    rpc(worker, "change_task_status", [t.id, "review", 1, null]),
    { code: "40001" },
  );
  t = await rpc(worker, "change_task_status", [
    t.id,
    "review",
    t.version,
    null,
  ]);
  for (const comment of [null, "", "   ", "\t\n\r"])
    await assert.rejects(
      rpc(manager, "change_task_status", [t.id, "rework", t.version, comment]),
      { code: "22023" },
    );
  await assert.rejects(
    rpc(manager, "change_task_status", [t.id, null, t.version, null]),
    { code: "42501" },
  );
  t = await rpc(manager2, "change_task_status", [
    t.id,
    "rework",
    t.version,
    " Исправить швы ",
  ]);
  t = await rpc(worker, "change_task_status", [
    t.id,
    "in_progress",
    t.version,
    null,
  ]);
  t = await rpc(worker, "change_task_status", [
    t.id,
    "review",
    t.version,
    "Готово",
  ]);
  t = await rpc(manager, "change_task_status", [
    t.id,
    "accepted",
    t.version,
    null,
  ]);
  assert.equal(t.status, "accepted");
  assert.equal(
    (
      await asUser(
        worker,
        "select * from public.task_history where task_id=$1",
        [t.id],
      )
    ).rows.length,
    7,
  );
});

test("editing preserves author/status/date, rejects stale version and invalid assignee", async () => {
  let t = await rpc(manager, "create_task", [
    "Редактирование",
    "",
    object.id,
    worker,
  ]);
  const original = t;
  t = await rpc(manager2, "update_task", [
    t.id,
    "Новое название",
    "Описание",
    object.id,
    other,
    t.version,
  ]);
  assert.equal(t.created_by, original.created_by);
  assert.deepEqual(t.created_at, original.created_at);
  assert.equal(t.status, "new");
  assert.equal(
    (await asUser(worker, "select * from public.tasks where id=$1", [t.id]))
      .rows.length,
    0,
  );
  assert.equal(
    (await asUser(other, "select * from public.tasks where id=$1", [t.id])).rows
      .length,
    1,
  );
  await assert.rejects(
    rpc(manager, "update_task", [t.id, "X", "", object.id, other, 1]),
    { code: "40001" },
  );
  await assert.rejects(
    rpc(manager, "create_task", ["X", "", object.id, manager]),
    { code: "22023" },
  );
});

test("soft deletion removes tasks from executor access but retains immutable audit", async () => {
  const obj = await rpc(manager, "create_object", ["Удаляемый", "Адрес"]);
  const t = await rpc(manager, "create_task", [
    "Удаляемая",
    "",
    obj.id,
    worker,
  ]);
  await rpc(manager2, "delete_object", [obj.id, 1]);
  assert.equal(
    (await asUser(worker, "select * from public.objects where id=$1", [obj.id]))
      .rows.length,
    0,
  );
  assert.equal(
    (await asUser(worker, "select * from public.tasks where id=$1", [t.id]))
      .rows.length,
    0,
  );
  assert.equal(
    (
      await asUser(
        worker,
        "select * from public.task_history where task_id=$1",
        [t.id],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await asUser(
        manager,
        "select * from public.task_history where task_id=$1",
        [t.id],
      )
    ).rows.length,
    1,
  );
  await assert.rejects(rpc(manager, "create_task", ["X", "", obj.id, worker]), {
    code: "22023",
  });
  await assert.rejects(
    rpc(worker, "change_task_status", [t.id, "in_progress", 1, null]),
    { code: "42501" },
  );
});

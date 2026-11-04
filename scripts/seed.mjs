import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

// Запускаем только для пустого проекта, административный ключ не помещаем в VITE_*
const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishableKey || !serviceKey)
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY in the shell environment.",
  );
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const admin = createClient(url, serviceKey, options);
function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}
const existing = checked(await admin.from("profiles").select("id").limit(1));
if (existing.length)
  throw new Error(
    "Seed requires an empty profiles table. Refusing to modify an existing workspace.",
  );
const users = [];
for (const [email, display_name, role] of [
  ["manager@stroika.example", "Анна Смирнова", "manager"],
  ["ivan@stroika.example", "Иван Петров", "executor"],
  ["maria@stroika.example", "Мария Волкова", "executor"],
]) {
  const password = randomBytes(18).toString("base64url") + "!aA1";
  const { user } = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  checked(
    await admin.from("profiles").insert({ id: user.id, display_name, role }),
  );
  users.push({ id: user.id, email, password, display_name, role });
  // Сохраняем каждую созданную учётную запись, чтобы не потерять пароль при сбое
  await writeFile(
    "demo-credentials.json",
    JSON.stringify({ url, publishableKey, users }, null, 2) + "\n",
    { mode: 0o600 },
  );
}
const clients = await Promise.all(
  users.map(async (user) => {
    const client = createClient(url, publishableKey, options);
    checked(
      await client.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      }),
    );
    return client;
  }),
);
const [manager, ivan, maria] = clients;
const objects = [];
for (const [name, address] of [
  ["ЖК «Сосновый квартал»", "Москва, Сосновая улица, 12"],
  ["Бизнес-центр «Горизонт»", "Москва, Ленинградский проспект, 68"],
  ["Школа в Новом районе", "Москва, Новая улица, 7"],
])
  objects.push(
    checked(
      await manager
        .rpc("create_object", { p_name: name, p_address: address })
        .single(),
    ),
  );
const fixtures = [
  ["Проверить армирование перекрытия", 0, 1, "review"],
  ["Согласовать схему электрики", 1, 2, "in_progress"],
  ["Принять поставку кирпича", 2, 1, "new"],
  ["Устранить замечания по стяжке", 0, 2, "rework"],
  ["Проверить монтаж вентиляции", 1, 1, "accepted"],
  ["Подготовить исполнительную документацию", 2, 2, "review"],
  ["Проверить гидроизоляцию фундамента", 0, 1, "in_progress"],
  ["Проверить оконные блоки", 1, 2, "new"],
];
for (const [title, objectIndex, userIndex, target] of fixtures) {
  let task = checked(
    await manager
      .rpc("create_task", {
        p_title: title,
        p_description:
          "Проверить работы по проектной документации. Указать результат и замечания при передаче на проверку.",
        p_object_id: objects[objectIndex].id,
        p_assignee_id: users[userIndex].id,
      })
      .single(),
  );
  const executor = userIndex === 1 ? ivan : maria;
  const path =
    target === "new"
      ? []
      : target === "in_progress"
        ? ["in_progress"]
        : target === "review"
          ? ["in_progress", "review"]
          : ["in_progress", "review", target];
  for (const to of path)
    task = checked(
      await (to === "accepted" || to === "rework" ? manager : executor)
        .rpc("change_task_status", {
          p_id: task.id,
          p_to_status: to,
          p_expected_version: task.version,
          p_comment:
            to === "rework"
              ? "Перепад у входа превышает допуск. Выровняйте поверхность."
              : null,
        })
        .single(),
    );
}
await Promise.all(clients.map((c) => c.auth.signOut()));
console.log(
  "Created 3 users, 3 objects and 8 tasks with genuine transition histories.",
);
console.log(
  "Login credentials are in ignored local file demo-credentials.json. Do not commit this file.",
);

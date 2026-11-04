// Демо хранит данные в браузере и не обеспечивает защиту доступа
// При настроенном Supabase этот адаптер не используется
import type {
  Backend,
  History,
  Profile,
  Snapshot,
  Status,
  Task,
} from "./types";
import { actionsFor } from "./types";
const storageKey = "stroika-demo-v1";
const sessionKey = "stroika-demo-user";
export const demoProfiles: Profile[] = [
  { id: "manager", display_name: "Анна Смирнова", role: "manager" },
  { id: "executor-1", display_name: "Иван Петров", role: "executor" },
  { id: "executor-2", display_name: "Мария Волкова", role: "executor" },
];
type Store = Snapshot & { history: History[] };
function initialData(): Store {
  const created_at = new Date(Date.now() - 2 * 86400000).toISOString();
  const objects = [
    {
      id: "obj-1",
      name: "ЖК «Сосновый квартал»",
      address: "Москва, Сосновая улица, 12",
    },
    {
      id: "obj-2",
      name: "Бизнес-центр «Горизонт»",
      address: "Москва, Ленинградский проспект, 68",
    },
    {
      id: "obj-3",
      name: "Школа в Новом районе",
      address: "Москва, Новая улица, 7",
    },
  ].map((x) => ({
    ...x,
    created_by: "manager",
    created_at,
    version: 1,
    deleted_at: null,
  }));
  const titles = [
    "Проверить армирование перекрытия",
    "Согласовать схему электрики",
    "Принять поставку кирпича",
    "Устранить замечания по стяжке",
    "Проверить монтаж вентиляции",
    "Подготовить исполнительную документацию",
    "Проверить гидроизоляцию фундамента",
    "Проверить оконные блоки",
  ];
  const status: Status[] = [
    "review",
    "in_progress",
    "new",
    "rework",
    "accepted",
    "review",
    "in_progress",
    "new",
  ];
  const tasks: Task[] = titles.map((title, i) => ({
    id: `task-${i + 1}`,
    title,
    description: [
      "Проверить шаг арматуры и защитный слой на третьем этаже. Сверить результат с рабочими чертежами и сообщить о готовности к бетонированию.",
      "Сверить расположение розеток и освещения с актуальным планом. Все расхождения указать в комментарии при передаче на проверку.",
      "Проверить количество и качество материалов по накладной. Зафиксировать повреждения и сообщить о результате.",
      "Выровнять поверхность в зоне входной группы. После исправления повторно проверить перепад высот.",
    ][i % 4],
    object_id: `obj-${(i % 3) + 1}`,
    assignee_id: i % 2 ? "executor-2" : "executor-1",
    status: status[i],
    created_by: "manager",
    created_at,
    updated_at: created_at,
    version: 1,
    deleted_at: null,
  }));
  const history: History[] = [];
  for (const task of tasks) {
    const path: Status[] =
      task.status === "new"
        ? ["new"]
        : task.status === "in_progress"
          ? ["new", "in_progress"]
          : task.status === "review"
            ? ["new", "in_progress", "review"]
            : ["new", "in_progress", "review", task.status];
    path.forEach((to, i) =>
      history.push({
        id: crypto.randomUUID(),
        task_id: task.id,
        actor_id:
          i === 0 || to === "accepted" || to === "rework"
            ? "manager"
            : task.assignee_id,
        from_status: path[i - 1] ?? null,
        to_status: to,
        comment:
          to === "rework"
            ? "Перепад у входа превышает допуск. Выровняйте поверхность и отправьте повторно."
            : null,
        created_at: new Date(
          new Date(created_at).getTime() + i * 3600000,
        ).toISOString(),
      }),
    );
  }
  return { profiles: demoProfiles, objects, tasks, history };
}
export function createDemoBackend(): Backend {
  let user = sessionStorage.getItem(sessionKey);
  const listeners = new Set<(id: string | null) => void>();
  function read(): Store {
    try {
      const value = localStorage.getItem(storageKey);
      if (value) return JSON.parse(value);
    } catch {
      /* Устаревшие данные заменяем начальным набором */
    }
    const data = initialData();
    write(data);
    return data;
  }
  function write(data: Store) {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }
  function profile() {
    const p = demoProfiles.find((p) => p.id === user);
    if (!p) throw new Error("Требуется вход");
    return p;
  }
  function manager() {
    if (profile().role !== "manager")
      throw new Error("Действие доступно только постановщику");
  }
  function checkVersion(
    actual: { version: number } | undefined,
    expected: number,
  ) {
    if (!actual || actual.version !== expected)
      throw new Error("Данные уже изменены. Обновите страницу.");
  }
  return {
    mode: "demo",
    async session() {
      return user;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    async login(email) {
      if (!demoProfiles.some((p) => p.id === email))
        throw new Error("Выберите роль для демонстрации");
      user = email;
      sessionStorage.setItem(sessionKey, user);
      listeners.forEach((fn) => fn(user));
    },
    async logout() {
      user = null;
      sessionStorage.removeItem(sessionKey);
      listeners.forEach((fn) => fn(null));
    },
    async load() {
      const data = read();
      const p = profile();
      const tasks = data.tasks.filter(
        (t) =>
          !t.deleted_at && (p.role === "manager" || t.assignee_id === p.id),
      );
      return {
        profiles: data.profiles,
        tasks,
        objects: data.objects.filter(
          (o) =>
            !o.deleted_at &&
            (p.role === "manager" || tasks.some((t) => t.object_id === o.id)),
        ),
      };
    },
    async history(id) {
      const data = await this.load();
      if (!data.tasks.some((t) => t.id === id))
        throw new Error("Задача недоступна");
      return read().history.filter((h) => h.task_id === id);
    },
    async saveObject(input, existing) {
      manager();
      const data = read();
      const target = data.objects.find((o) => o.id === existing?.id);
      if (existing) checkVersion(target, existing.version);
      const object = {
        ...input,
        id: existing?.id ?? crypto.randomUUID(),
        created_at: existing?.created_at ?? new Date().toISOString(),
        created_by: existing?.created_by ?? profile().id,
        version: (existing?.version ?? 0) + 1,
        deleted_at: null,
      };
      data.objects = existing
        ? data.objects.map((o) => (o.id === existing.id ? object : o))
        : [...data.objects, object];
      write(data);
      return object;
    },
    async deleteObject(object) {
      manager();
      const data = read();
      checkVersion(
        data.objects.find((o) => o.id === object.id),
        object.version,
      );
      data.objects = data.objects.filter((o) => o.id !== object.id);
      data.tasks = data.tasks.filter((t) => t.object_id !== object.id);
      write(data);
    },
    async saveTask(input, existing) {
      manager();
      const data = read();
      if (existing)
        checkVersion(
          data.tasks.find((t) => t.id === existing.id),
          existing.version,
        );
      const task: Task = {
        ...input,
        id: existing?.id ?? crypto.randomUUID(),
        status: existing?.status ?? "new",
        created_by: existing?.created_by ?? profile().id,
        created_at: existing?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: (existing?.version ?? 0) + 1,
        deleted_at: null,
      };
      data.tasks = existing
        ? data.tasks.map((t) => (t.id === existing.id ? task : t))
        : [...data.tasks, task];
      if (!existing)
        data.history.push({
          id: crypto.randomUUID(),
          task_id: task.id,
          actor_id: profile().id,
          from_status: null,
          to_status: "new",
          comment: null,
          created_at: task.created_at,
        });
      write(data);
      return task;
    },
    async deleteTask(task) {
      manager();
      const data = read();
      checkVersion(
        data.tasks.find((t) => t.id === task.id),
        task.version,
      );
      data.tasks = data.tasks.filter((t) => t.id !== task.id);
      write(data);
    },
    async transition(task, to, comment) {
      const data = read();
      const actual = data.tasks.find((t) => t.id === task.id);
      checkVersion(actual, task.version);
      if (!actual || !actionsFor(actual, profile()).includes(to))
        throw new Error("Этот переход статуса запрещён");
      if (to === "rework" && !comment.trim())
        throw new Error("Укажите причину возврата на доработку");
      data.history.push({
        id: crypto.randomUUID(),
        task_id: task.id,
        actor_id: profile().id,
        from_status: actual.status,
        to_status: to,
        comment: comment.trim() || null,
        created_at: new Date().toISOString(),
      });
      actual.status = to;
      actual.version++;
      actual.updated_at = new Date().toISOString();
      write(data);
      return actual;
    },
  };
}

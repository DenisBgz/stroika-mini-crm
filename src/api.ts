import { createClient } from "@supabase/supabase-js";
import type { Backend, History, Profile, SiteObject, Task } from "./types";
import { createDemoBackend } from "./demo";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const configured = Boolean(url && key && !url.includes("your-project"));
// Демо включается явно: ошибка настройки не должна подменять рабочую базу
export const backend: Backend | null = configured
  ? createSupabaseBackend(url, key)
  : import.meta.env.VITE_DEMO_MODE === "true"
    ? createDemoBackend()
    : null;

function createSupabaseBackend(url: string, key: string): Backend {
  const client = createClient(url, key);
  async function rows<T>(
    table: string,
    active = false,
    taskId?: string,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = client
        .from(table)
        .select("*")
        .order(table === "profiles" ? "id" : "created_at")
        .order("id")
        .range(offset, offset + 499);
      if (active) query = query.is("deleted_at", null);
      if (taskId) query = query.eq("task_id", taskId);
      const { data, error } = await query;
      if (error) throw error;
      all.push(...(data as T[]));
      if (data.length < 500) return all;
    }
  }
  async function rpc<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const query = client.rpc(name, args);
    // Функции записи возвращают одну запись; удаление не возвращает данных
    const { data, error } = name.startsWith("delete_")
      ? await query
      : await query.single();
    if (error) throw error;
    return data as T;
  }
  return {
    mode: "supabase",
    async session() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session?.user.id ?? null;
    },
    subscribe(fn) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        fn(session?.user.id ?? null);
      });
      return () => data.subscription.unsubscribe();
    },
    async login(email, password) {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    },
    async logout() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    },
    async load() {
      const [profiles, objects, tasks] = await Promise.all([
        rows<Profile>("profiles"),
        rows<SiteObject>("objects", true),
        rows<Task>("tasks", true),
      ]);
      return { profiles, objects, tasks };
    },
    history(id) {
      return rows<History>("task_history", false, id);
    },
    saveObject(input, existing) {
      return rpc(existing ? "update_object" : "create_object", {
        p_name: input.name,
        p_address: input.address,
        ...(existing
          ? { p_id: existing.id, p_expected_version: existing.version }
          : {}),
      });
    },
    deleteObject(object) {
      return rpc("delete_object", {
        p_id: object.id,
        p_expected_version: object.version,
      });
    },
    saveTask(input, existing) {
      return rpc(existing ? "update_task" : "create_task", {
        p_title: input.title,
        p_description: input.description,
        p_object_id: input.object_id,
        p_assignee_id: input.assignee_id,
        ...(existing
          ? { p_id: existing.id, p_expected_version: existing.version }
          : {}),
      });
    },
    deleteTask(task) {
      return rpc("delete_task", {
        p_id: task.id,
        p_expected_version: task.version,
      });
    },
    transition(task, to, comment) {
      return rpc("change_task_status", {
        p_id: task.id,
        p_to_status: to,
        p_expected_version: task.version,
        p_comment: comment.trim() || null,
      });
    },
  };
}
export function errorMessage(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Не удалось выполнить действие";
  if (message.includes("Invalid login credentials"))
    return "Неверный email или пароль.";
  if (message.includes("Email not confirmed"))
    return "Администратор должен подтвердить ваш email.";
  if (/fetch|network|Failed to fetch/i.test(message))
    return "Нет связи с сервером. Проверьте подключение и повторите попытку.";
  return message;
}

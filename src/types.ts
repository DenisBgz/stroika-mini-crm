export type Role = "manager" | "executor";
export type Status = "new" | "in_progress" | "review" | "accepted" | "rework";
export interface Profile {
  id: string;
  display_name: string;
  role: Role;
}
export interface SiteObject {
  id: string;
  name: string;
  address: string;
  created_by: string;
  created_at: string;
  version: number;
  deleted_at: string | null;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  object_id: string;
  assignee_id: string;
  status: Status;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}
export interface History {
  id: string;
  task_id: string;
  actor_id: string;
  from_status: Status | null;
  to_status: Status;
  comment: string | null;
  created_at: string;
}
export interface Snapshot {
  profiles: Profile[];
  objects: SiteObject[];
  tasks: Task[];
}
export interface ObjectInput {
  name: string;
  address: string;
}
export interface TaskInput {
  title: string;
  description: string;
  object_id: string;
  assignee_id: string;
}
export interface Backend {
  mode: "supabase" | "demo";
  session(): Promise<string | null>;
  subscribe(fn: (id: string | null) => void): () => void;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  load(): Promise<Snapshot>;
  history(id: string): Promise<History[]>;
  saveObject(input: ObjectInput, existing?: SiteObject): Promise<SiteObject>;
  deleteObject(object: SiteObject): Promise<void>;
  saveTask(input: TaskInput, existing?: Task): Promise<Task>;
  deleteTask(task: Task): Promise<void>;
  transition(task: Task, to: Status, comment: string): Promise<Task>;
}
export const statusLabels: Record<Status, string> = {
  new: "Новая",
  in_progress: "В работе",
  review: "На проверке",
  accepted: "Принята",
  rework: "На доработке",
};
export const statuses = Object.keys(statusLabels) as Status[];
export function actionsFor(task: Task, profile: Profile): Status[] {
  // Здесь выбираем кнопки; окончательная проверка прав выполняется в базе
  if (profile.role === "manager")
    return task.status === "review" ? ["accepted", "rework"] : [];
  if (task.assignee_id !== profile.id) return [];
  if (task.status === "new" || task.status === "rework") return ["in_progress"];
  if (task.status === "in_progress") return ["review"];
  return [];
}
export const actionLabels: Partial<Record<Status, string>> = {
  in_progress: "Взять в работу",
  review: "Отправить на проверку",
  accepted: "Принять задачу",
  rework: "Вернуть на доработку",
};

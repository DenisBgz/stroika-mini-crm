import type { Profile } from "../types";

export const roleName = (profile: Profile) =>
  profile.role === "manager" ? "Постановщик" : "Исполнитель";

export const formatDate = (value: string, time = false) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }),
  }).format(new Date(value));

export const initials = (name: string) =>
  name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");

// Выбираем форму слова для русского языка: задача, задачи, задач
export const formatCount = (n: number, forms: [string, string, string]) => {
  const key = new Intl.PluralRules("ru").select(n);
  return `${n} ${forms[key === "one" ? 0 : key === "few" ? 1 : 2]}`;
};

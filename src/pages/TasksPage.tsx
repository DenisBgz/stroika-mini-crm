import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import type { Snapshot, Status } from "../types";
import { statuses, statusLabels } from "../types";
import { formatDate, initials } from "../utils/format";
import { StatusBadge, Empty, SearchField } from "../components/ui";

export function TasksPage({
  data,
  title,
  isManager,
  onCreate,
  initialStatus = "all",
  compact = false,
}: {
  data: Snapshot;
  title: string;
  isManager: boolean;
  onCreate: () => void;
  initialStatus?: Status | "all";
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<Status | "all">(initialStatus);
  const [search, setSearch] = useState("");
  // Фильтруем уже доступные пользователю задачи, новые показываем первыми
  const tasks = data.tasks
    .filter(
      (t) =>
        (filter === "all" || t.status === filter) &&
        `${t.title} ${t.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <div className={`page-heading${compact ? " compact-heading" : ""}`}>
        <div>
          {!compact && <span className="eyebrow">РАБОТА КОМАНДЫ</span>}
          {compact ? (
            <h2>{title}</h2>
          ) : (
            <h1>
              {title}
              <span className="title-count">{data.tasks.length}</span>
            </h1>
          )}
          {!compact && (
            <p>
              {isManager
                ? "От назначения до приёмки — все работы в одном списке."
                : "Ваши работы, ближайшие действия и результаты проверки."}
            </p>
          )}
        </div>
        {isManager && (
          <button
            className="primary"
            disabled={!data.objects.length}
            onClick={onCreate}
            title={!data.objects.length ? "Сначала создайте объект" : undefined}
          >
            <Plus size={18} />
            Добавить задачу
          </button>
        )}
      </div>
      <div className="task-panel">
        <div className="table-toolbar">
          <div className="filter-tabs" aria-label="Статус задачи">
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              Все
            </button>
            {statuses.map((s) => (
              <button
                key={s}
                className={filter === s ? "selected" : ""}
                onClick={() => setFilter(s)}
              >
                {statusLabels[s]}
                <span>{data.tasks.filter((t) => t.status === s).length}</span>
              </button>
            ))}
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Поиск по задачам…"
          />
        </div>
        {tasks.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Задача / объект</th>
                  <th>Статус</th>
                  <th>Исполнитель</th>
                  <th>Создана</th>
                  <th>
                    <span className="sr-only">Открыть</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const person = data.profiles.find(
                    (p) => p.id === t.assignee_id,
                  );
                  return (
                    <tr key={t.id}>
                      <td>
                        <a className="task-title" href={`#/tasks/${t.id}`}>
                          {t.title}
                        </a>
                        <small>
                          {data.objects.find((o) => o.id === t.object_id)
                            ?.name ?? "Объект"}
                        </small>
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td>
                        <span className="person">
                          <span className="avatar mini">
                            {initials(person?.display_name ?? "?")}
                          </span>
                          {person?.display_name ?? "Сотрудник"}
                        </span>
                      </td>
                      <td className="date-cell">{formatDate(t.created_at)}</td>
                      <td>
                        <a
                          className="row-arrow"
                          href={`#/tasks/${t.id}`}
                          aria-label={`Открыть задачу: ${t.title}`}
                        >
                          <ChevronRight size={18} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Задач пока нет">
            {search || filter !== "all"
              ? "Измените фильтр или поисковый запрос."
              : isManager
                ? "Добавьте задачу и назначьте исполнителя."
                : "Постановщик назначит вам работы — они появятся здесь."}
          </Empty>
        )}
        <div className="table-footer">
          Показано: {tasks.length} из {data.tasks.length}
        </div>
      </div>
    </>
  );
}

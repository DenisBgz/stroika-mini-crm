import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Clock3,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { backend, errorMessage } from "../api";
import type { History, Profile, Snapshot, Status, Task } from "../types";
import { actionLabels, actionsFor, statusLabels } from "../types";
import { formatDate, initials, formatCount } from "../utils/format";
import { StatusBadge, Loading } from "../components/ui";

export function TaskDetail({
  task,
  data,
  profile,
  busy,
  onEdit,
  onDelete,
  onTransition,
}: {
  task: Task;
  data: Snapshot;
  profile: Profile;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTransition: (to: Status, comment: string) => Promise<boolean>;
}) {
  const [history, setHistory] = useState<History[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [retry, setRetry] = useState(0);
  const [comment, setComment] = useState("");
  const [actionError, setActionError] = useState("");
  // После смены задачи или её версии перечитываем историю
  useEffect(() => {
    let alive = true;
    setHistory(null);
    setHistoryError("");
    backend!
      .history(task.id)
      .then((h) => {
        if (alive) setHistory(h);
      })
      .catch((e) => {
        if (alive) setHistoryError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [task.id, task.version, retry]);
  const object = data.objects.find((o) => o.id === task.object_id);
  const assignee = data.profiles.find((p) => p.id === task.assignee_id);
  const author = data.profiles.find((p) => p.id === task.created_by);
  const actions = actionsFor(task, profile);
  async function transition(to: Status) {
    setActionError("");
    if (to === "rework" && !comment.trim()) {
      setActionError("Укажите причину возврата на доработку.");
      return;
    }
    if (await onTransition(to, comment)) setComment("");
  }
  return (
    <>
      <a className="back" href={`#/objects/${task.object_id}`}>
        <ArrowLeft size={16} />
        {object?.name ?? "К объекту"}
      </a>
      <div className="page-heading task-heading">
        <div>
          <span className="eyebrow">КАРТОЧКА ЗАДАЧИ</span>
          <h1>{task.title}</h1>
        </div>
        {profile.role === "manager" && (
          <div className="heading-actions">
            <button disabled={busy} onClick={onEdit}>
              <Pencil size={16} />
              Редактировать
            </button>
            <button
              disabled={busy}
              className="icon-button destructive"
              aria-label="Удалить задачу"
              title="Удалить задачу"
              onClick={onDelete}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
      <div className="task-layout">
        <div>
          <section className="content-card">
            <div className="card-heading">
              <h2>Описание работы</h2>
              <StatusBadge status={task.status} />
            </div>
            <p className="description">
              {task.description || "Описание не добавлено."}
            </p>
            {actions.length > 0 ? (
              <div className="action-area">
                <h3>Следующее действие</h3>
                <label>
                  {profile.role === "manager"
                    ? "Комментарий к решению"
                    : "Комментарий к результату"}
                  <textarea
                    maxLength={4000}
                    rows={3}
                    value={comment}
                    disabled={busy}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={
                      profile.role === "manager"
                        ? "При возврате на доработку укажите, что исправить."
                        : "Добавьте пояснение, если нужно."
                    }
                  />
                </label>
                <small>
                  {profile.role === "manager"
                    ? "Для возврата на доработку комментарий обязателен."
                    : "Комментарий необязателен."}
                </small>
                {actionError && (
                  <div role="alert" className="field-error">
                    {actionError}
                  </div>
                )}
                <div className="action-buttons">
                  {actions.map((to) => (
                    <button
                      key={to}
                      disabled={busy}
                      className={to === "rework" ? "secondary" : "primary"}
                      onClick={() => void transition(to)}
                    >
                      {busy ? (
                        <Loader2 className="spin" size={17} />
                      ) : to === "accepted" ? (
                        <Check size={17} />
                      ) : to === "rework" ? (
                        <RefreshCw size={17} />
                      ) : (
                        <ArrowRight size={17} />
                      )}
                      {actionLabels[to]}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="status-explanation">
                <Clock3 size={18} />
                {task.status === "accepted"
                  ? "Работа принята. Задача завершена."
                  : task.status === "review"
                    ? "Задача у постановщика. Дождитесь результата проверки."
                    : "Ожидаем действие назначенного исполнителя."}
              </div>
            )}
          </section>
          <section className="content-card history-card">
            <div className="card-heading">
              <h2>История задачи</h2>
              <span className="subtle">
                {history
                  ? formatCount(history.length, [
                      "событие",
                      "события",
                      "событий",
                    ])
                  : ""}
              </span>
            </div>
            {historyError ? (
              <div className="alert">
                {historyError}
                <button onClick={() => setRetry((x) => x + 1)}>
                  Повторить
                </button>
              </div>
            ) : !history ? (
              <Loading />
            ) : (
              <ol className="timeline">
                {[...history].reverse().map((h) => (
                  <li key={h.id}>
                    <span
                      className={`timeline-dot ${h.to_status === "accepted" ? "done" : ""}`}
                    >
                      {h.to_status === "accepted" ? <Check size={12} /> : null}
                    </span>
                    <div className="timeline-top">
                      <strong>
                        {data.profiles.find((p) => p.id === h.actor_id)
                          ?.display_name ?? "Сотрудник"}
                      </strong>
                      <time dateTime={h.created_at}>
                        {formatDate(h.created_at, true)}
                      </time>
                    </div>
                    <div className="history-transition">
                      {h.from_status ? (
                        <>
                          <span>{statusLabels[h.from_status]}</span>
                          <ArrowRight size={13} />
                        </>
                      ) : (
                        <span>Задача создана</span>
                      )}
                      <StatusBadge status={h.to_status} />
                    </div>
                    {h.comment && (
                      <p className="history-comment">{h.comment}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <aside className="content-card task-properties">
          <h2>Детали задачи</h2>
          <dl>
            <dt>Объект</dt>
            <dd>
              <a href={`#/objects/${task.object_id}`}>
                <Building2 size={17} />
                {object?.name ?? "Объект"}
              </a>
            </dd>
            <dt>Исполнитель</dt>
            <dd>
              <span className="person">
                <span className="avatar">
                  {initials(assignee?.display_name ?? "?")}
                </span>
                {assignee?.display_name ?? "Сотрудник"}
              </span>
            </dd>
            <dt>Постановщик</dt>
            <dd>{author?.display_name ?? "Сотрудник"}</dd>
            <dt>Дата создания</dt>
            <dd>{formatDate(task.created_at, true)}</dd>
          </dl>
          <div className="property-note">
            <ShieldCheck size={18} />
            История решений сохраняется автоматически.
          </div>
        </aside>
      </div>
    </>
  );
}

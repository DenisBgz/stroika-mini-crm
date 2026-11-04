import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { backend, errorMessage } from "./api";
import type { SiteObject, Snapshot, Task } from "./types";
import { roleName, initials } from "./utils/format";
import { go } from "./utils/navigation";
import { Brand, Loading, Empty, Dialog } from "./components/ui";
import { ObjectForm, TaskForm } from "./components/forms";
import { Login } from "./pages/Login";
import { ObjectsPage } from "./pages/ObjectsPage";
import { ObjectDetail } from "./pages/ObjectDetail";
import { TasksPage } from "./pages/TasksPage";
import { TaskDetail } from "./pages/TaskDetail";

const emptySnapshot: Snapshot = { profiles: [], objects: [], tasks: [] };

type ModalState =
  | { kind: "object"; object?: SiteObject }
  | { kind: "task"; task?: Task; objectId?: string }
  | { kind: "deleteObject"; object: SiteObject }
  | { kind: "deleteTask"; task: Task }
  | null;

export function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [route, setRoute] = useState(
    window.location.hash.slice(1) || "/objects",
  );
  const [modal, setModal] = useState<ModalState>(null);
  const loadRequestId = useRef(0);

  useEffect(() => {
    const fn = () => {
      setRoute(window.location.hash.slice(1) || "/objects");
      setModal(null);
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    if (!backend) {
      setAuthReady(true);
      return;
    }
    let alive = true;
    let eventReceived = false;
    const apply = (id: string | null) => {
      if (!alive) return;
      loadRequestId.current++;
      setUserId(id);
      setSnapshot(null);
      setError("");
      setModal(null);
      setAuthReady(true);
    };
    let lastId: string | null | undefined;
    const unsubscribe = backend.subscribe((id) => {
      eventReceived = true;
      if (id !== lastId) {
        lastId = id;
        apply(id);
      }
    });
    backend
      .session()
      .then((id) => {
        if (!eventReceived) {
          lastId = id;
          apply(id);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(errorMessage(e));
          setAuthReady(true);
        }
      });
    return () => {
      alive = false;
      unsubscribe();
      loadRequestId.current++;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!backend || !userId) return;
    // Не применяем ответ, если пользователь уже вышел или началась новая загрузка
    const requestId = ++loadRequestId.current;
    setLoading(true);
    try {
      const data = await backend.load();
      if (requestId === loadRequestId.current) setSnapshot(data);
    } catch (e) {
      if (requestId === loadRequestId.current) setError(errorMessage(e));
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const data = snapshot ?? emptySnapshot;
  const profile = data.profiles.find((p) => p.id === userId);
  async function mutate(
    operation: () => Promise<unknown>,
    success: string,
    close = true,
    shouldRefresh = true,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await operation();
      if (shouldRefresh) await refresh();
      if (close) setModal(null);
      setNotice(success);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      if (shouldRefresh) await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!backend)
    return (
      <div className="setup">
        <Brand />
        <h1>Подключите рабочую базу</h1>
        <p>
          Укажите VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в настройках
          окружения, примените миграцию и пересоберите приложение.
        </p>
        <p>
          Инструкция находится в README проекта. Для отдельного ознакомления с
          интерфейсом предусмотрен VITE_DEMO_MODE=true.
        </p>
      </div>
    );
  if (!authReady) return <Loading>Проверяем вход…</Loading>;
  if (!userId)
    return (
      <Login
        onLogin={(email, password) =>
          mutate(() => backend!.login(email, password), "", false, false)
        }
        busy={busy}
        error={error}
      />
    );
  if (!snapshot)
    return (
      <div className="setup">
        <Brand />
        {error ? (
          <>
            <div className="alert" role="alert">
              {error}
            </div>
            <button className="primary" onClick={() => void refresh()}>
              Повторить
            </button>
            <button
              className="quiet"
              onClick={() =>
                void mutate(() => backend!.logout(), "", true, false)
              }
            >
              Выйти
            </button>
          </>
        ) : (
          <Loading />
        )}
      </div>
    );
  if (!profile)
    return (
      <div className="setup">
        <Brand />
        <h1>Доступ ещё не выдан</h1>
        <p>Попросите администратора добавить ваш профиль и назначить роль.</p>
        <button
          className="primary"
          onClick={() => void mutate(() => backend!.logout(), "", true, false)}
        >
          Выйти
        </button>
      </div>
    );
  const isManager = profile.role === "manager";
  const [section, id] = route.replace(/^\//, "").split("/");
  const selectedObject =
    section === "objects" && id
      ? data.objects.find((o) => o.id === id)
      : undefined;
  const selectedTask =
    section === "tasks" && id ? data.tasks.find((t) => t.id === id) : undefined;
  const unavailable =
    (section === "objects" || section === "tasks") &&
    Boolean(id) &&
    !(selectedObject || selectedTask);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#/objects"
          className="brand-link"
          aria-label="Стройка — объекты"
        >
          <Brand />
        </a>
        <div className="workspace">
          <span className="workspace-mark">СК</span>
          <span>
            Строительная компания<small>Рабочее пространство</small>
          </span>
        </div>
        <div className="nav-caption">ПРОЕКТЫ И РАБОТЫ</div>
        <nav aria-label="Главное меню">
          <a href="#/objects" className={section === "objects" ? "active" : ""}>
            <LayoutGrid size={19} />
            Объекты<span className="nav-count">{data.objects.length}</span>
          </a>
          <a href="#/tasks" className={section === "tasks" ? "active" : ""}>
            <ClipboardList size={19} />
            {isManager ? "Все задачи" : "Мои задачи"}
            <span className="nav-count">{data.tasks.length}</span>
          </a>
          {isManager && (
            <a href="#/review" className={section === "review" ? "active" : ""}>
              <CheckCheck size={19} />
              На проверке
              <span className="nav-count">
                {data.tasks.filter((t) => t.status === "review").length}
              </span>
            </a>
          )}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <strong>У каждого своя зона работы</strong>
          <p>
            {isManager
              ? "Вы управляете объектами, назначаете и принимаете задачи."
              : "Здесь собраны ваши задачи и связанные с ними объекты."}
          </p>
        </div>
        <div className="user">
          <span className="avatar">{initials(profile.display_name)}</span>
          <span>
            <strong>{profile.display_name}</strong>
            <small>{roleName(profile)}</small>
          </span>
          <button
            className="icon-button"
            aria-label="Выйти"
            title="Выйти"
            disabled={busy}
            onClick={() =>
              void mutate(() => backend!.logout(), "", true, false)
            }
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div>
            <span className="crumb">Рабочее пространство</span>
            <ChevronRight size={14} />
            <strong>
              {section === "objects"
                ? "Объекты"
                : section === "review"
                  ? "На проверке"
                  : isManager
                    ? "Задачи"
                    : "Мои задачи"}
            </strong>
          </div>
          <span className="today">
            {new Intl.DateTimeFormat("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </span>
          <button
            className="icon-button"
            disabled={loading || busy}
            aria-label="Обновить данные"
            title="Обновить данные"
            onClick={() => void refresh()}
          >
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
        </header>
        {backend.mode === "demo" && (
          <div className="demo-banner">
            <span>Демонстрация интерфейса</span> Данные хранятся только в этом
            браузере. Supabase пока не подключён.
          </div>
        )}
        <main>
          {error && (
            <div className="alert" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Закрыть ошибку"
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          {unavailable ? (
            <Empty title="Запись недоступна">
              Она удалена или у вас больше нет доступа.{" "}
              <a href="#/objects">Вернуться к объектам</a>
            </Empty>
          ) : selectedTask ? (
            <TaskDetail
              key={selectedTask.id}
              task={selectedTask}
              data={data}
              profile={profile}
              busy={busy}
              onEdit={() => setModal({ kind: "task", task: selectedTask })}
              onDelete={() =>
                setModal({ kind: "deleteTask", task: selectedTask })
              }
              onTransition={(to, comment) =>
                mutate(
                  () => backend!.transition(selectedTask, to, comment),
                  "Статус задачи обновлён",
                  false,
                )
              }
            />
          ) : selectedObject ? (
            <ObjectDetail
              object={selectedObject}
              data={data}
              profile={profile}
              onEdit={() =>
                setModal({ kind: "object", object: selectedObject })
              }
              onDelete={() =>
                setModal({ kind: "deleteObject", object: selectedObject })
              }
              onCreate={() =>
                setModal({ kind: "task", objectId: selectedObject.id })
              }
            />
          ) : section === "objects" ? (
            <ObjectsPage
              data={data}
              isManager={isManager}
              onCreate={() => setModal({ kind: "object" })}
            />
          ) : (
            <TasksPage
              key={section}
              data={data}
              title={
                section === "review"
                  ? "На проверке"
                  : isManager
                    ? "Все задачи"
                    : "Мои задачи"
              }
              initialStatus={section === "review" ? "review" : "all"}
              isManager={isManager}
              onCreate={() => setModal({ kind: "task" })}
            />
          )}
        </main>
        <footer>
          Стройка<span>Порядок в задачах. Прогресс на объектах.</span>
        </footer>
      </div>
      {modal && (
        <Dialog
          title={
            modal.kind === "object"
              ? modal.object
                ? "Редактировать объект"
                : "Новый объект"
              : modal.kind === "task"
                ? modal.task
                  ? "Редактировать задачу"
                  : "Новая задача"
                : modal.kind === "deleteObject"
                  ? "Удалить объект?"
                  : "Удалить задачу?"
          }
          busy={busy}
          onClose={() => {
            setModal(null);
            setError("");
          }}
        >
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          {modal.kind === "object" ? (
            <ObjectForm
              existing={modal.object}
              busy={busy}
              onCancel={() => setModal(null)}
              onSubmit={(input) =>
                mutate(
                  () => backend!.saveObject(input, modal.object),
                  "Объект сохранён",
                )
              }
            />
          ) : modal.kind === "task" ? (
            <TaskForm
              existing={modal.task}
              objectId={modal.objectId}
              data={data}
              busy={busy}
              onCancel={() => setModal(null)}
              onSubmit={(input) =>
                mutate(
                  () => backend!.saveTask(input, modal.task),
                  "Задача сохранена",
                )
              }
            />
          ) : (
            <>
              <p className="delete-copy">
                {modal.kind === "deleteObject" ? (
                  <>
                    «{modal.object.name}» и все задачи этого объекта исчезнут из
                    рабочих списков.
                  </>
                ) : (
                  <>«{modal.task.title}» исчезнет из рабочих списков.</>
                )}
              </p>
              <div className="form-actions">
                <button disabled={busy} onClick={() => setModal(null)}>
                  Отмена
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    void mutate(async () => {
                      if (modal.kind === "deleteObject") {
                        await backend!.deleteObject(modal.object);
                        go("/objects");
                      } else {
                        await backend!.deleteTask(modal.task);
                        go(`/objects/${modal.task.object_id}`);
                      }
                    }, "Запись удалена")
                  }
                >
                  {busy ? "Удаляем…" : "Удалить"}
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

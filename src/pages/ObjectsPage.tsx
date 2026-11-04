import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCheck,
  ClipboardList,
  Clock3,
  HardHat,
  MapPin,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { Snapshot } from "../types";
import { Empty, Stat, SearchField } from "../components/ui";

export function ObjectsPage({
  data,
  isManager,
  onCreate,
}: {
  data: Snapshot;
  isManager: boolean;
  onCreate: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = data.objects.filter((o) =>
    `${o.name} ${o.address}`.toLowerCase().includes(search.toLowerCase()),
  );
  // В прогресс входят только задачи, принятые постановщиком
  const accepted = data.tasks.filter((t) => t.status === "accepted").length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ОБЗОР РАБОТЫ</span>
          <h1>
            Объекты<span className="title-count">{data.objects.length}</span>
          </h1>
          <p>
            {isManager
              ? "Все строительные площадки и ход работ по ним."
              : "Объекты, на которых вам назначены задачи."}
          </p>
        </div>
        {isManager && (
          <button className="primary" onClick={onCreate}>
            <Plus size={18} />
            Добавить объект
          </button>
        )}
      </div>
      <div className="stats">
        <Stat
          label="Всего задач"
          value={data.tasks.length}
          icon={<ClipboardList />}
        />
        <Stat
          label="В работе"
          value={data.tasks.filter((t) => t.status === "in_progress").length}
          icon={<HardHat />}
        />
        <Stat
          label="Ждут проверки"
          value={data.tasks.filter((t) => t.status === "review").length}
          icon={<Clock3 />}
        />
        <Stat label="Принято" value={accepted} icon={<CheckCheck />} green />
      </div>
      <div className="section-line">
        <h2>Строительные площадки</h2>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Найти объект…"
        />
      </div>
      {filtered.length ? (
        <div className="object-grid">
          {filtered.map((o, i) => {
            const tasks = data.tasks.filter((t) => t.object_id === o.id);
            const done = tasks.filter((t) => t.status === "accepted").length;
            const review = tasks.filter((t) => t.status === "review").length;
            return (
              <a href={`#/objects/${o.id}`} className="object-card" key={o.id}>
                <div className="object-cover">
                  <span className="object-symbol">
                    <Building2 size={30} />
                  </span>
                  <span className="object-number">
                    ОБЪЕКТ / {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="building-lines" aria-hidden="true" />
                </div>
                <div className="object-body">
                  <h3>{o.name}</h3>
                  <p className="address">
                    <MapPin size={15} />
                    {o.address}
                  </p>
                  <div className="progress-label">
                    <span>Принято задач</span>
                    <strong>
                      {done} <span>/ {tasks.length}</span>
                    </strong>
                  </div>
                  <div
                    className="progress-track"
                    role="img"
                    aria-label={`Принято ${done} из ${tasks.length}`}
                  >
                    <span
                      style={{
                        width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="object-card-bottom">
                    <span>
                      {review ? (
                        <>
                          <span className="small-dot" />
                          {review} на проверке
                        </>
                      ) : tasks.length ? (
                        "Работы запланированы"
                      ) : (
                        "Пока нет задач"
                      )}
                    </span>
                    <span className="card-arrow">
                      <ArrowRight size={17} />
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
          {isManager && (
            <button className="new-object-card" onClick={onCreate}>
              <span>
                <Plus size={26} />
              </span>
              <strong>Новый объект</strong>
              <small>Добавьте следующую площадку</small>
            </button>
          )}
        </div>
      ) : (
        <Empty
          title={search ? "Ничего не найдено" : "Здесь появятся ваши объекты"}
        >
          {search
            ? "Попробуйте другое название или адрес."
            : isManager
              ? "Добавьте первый объект, чтобы назначить задачи команде."
              : "Объект появится, когда вам назначат задачу."}
        </Empty>
      )}
      <div className="overview-note">
        <span>
          <ShieldCheck size={19} />
        </span>
        <p>
          <strong>Всё начинается с задачи</strong>Откройте объект, чтобы увидеть
          работы, исполнителей и историю решений.
        </p>
      </div>
    </>
  );
}

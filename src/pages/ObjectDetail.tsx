import { ArrowLeft, Building2, MapPin, Pencil, Trash2 } from "lucide-react";
import type { Profile, SiteObject, Snapshot } from "../types";
import { formatCount } from "../utils/format";
import { TasksPage } from "./TasksPage";

export function ObjectDetail({
  object,
  data,
  profile,
  onEdit,
  onDelete,
  onCreate,
}: {
  object: SiteObject;
  data: Snapshot;
  profile: Profile;
  onEdit: () => void;
  onDelete: () => void;
  onCreate: () => void;
}) {
  // В карточке показываем только задачи выбранного объекта
  const tasks = data.tasks.filter((t) => t.object_id === object.id);
  return (
    <>
      <a className="back" href="#/objects">
        <ArrowLeft size={16} />
        Все объекты
      </a>
      <div className="page-heading object-heading">
        <div>
          <span className="eyebrow">КАРТОЧКА ОБЪЕКТА</span>
          <h1>{object.name}</h1>
          <p className="address">
            <MapPin size={17} />
            {object.address}
          </p>
        </div>
        {profile.role === "manager" && (
          <div className="heading-actions">
            <button onClick={onEdit}>
              <Pencil size={16} />
              Редактировать
            </button>
            <button
              className="icon-button destructive"
              aria-label="Удалить объект"
              title="Удалить объект"
              onClick={onDelete}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
      <div className="object-summary">
        <span>
          <Building2 size={23} />
          Работы на объекте
        </span>
        <strong>
          {formatCount(tasks.length, ["задача", "задачи", "задач"])}
        </strong>
        <span>
          {tasks.filter((t) => t.status === "accepted").length} принято
        </span>
      </div>
      <TasksPage
        data={{ ...data, tasks }}
        title="Задачи объекта"
        isManager={profile.role === "manager"}
        onCreate={onCreate}
        compact
      />
    </>
  );
}

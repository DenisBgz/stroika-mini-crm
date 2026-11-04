import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import type {
  ObjectInput,
  SiteObject,
  Snapshot,
  Task,
  TaskInput,
} from "../types";

export function ObjectForm({
  existing,
  busy,
  onCancel,
  onSubmit,
}: {
  existing?: SiteObject;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: ObjectInput) => Promise<boolean>;
}) {
  // Одна форма используется для создания и редактирования объекта
  const [name, setName] = useState(existing?.name ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ name: name.trim(), address: address.trim() });
      }}
    >
      <label>
        Название объекта
        <input
          autoFocus
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, ЖК «Сосновый квартал»"
        />
      </label>
      <label>
        Адрес
        <input
          required
          maxLength={500}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Город, улица, дом"
        />
      </label>
      <FormActions
        busy={busy}
        disabled={!name.trim() || !address.trim()}
        onCancel={onCancel}
      />
    </form>
  );
}

export function TaskForm({
  existing,
  objectId,
  data,
  busy,
  onCancel,
  onSubmit,
}: {
  existing?: Task;
  objectId?: string;
  data: Snapshot;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: TaskInput) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [object, setObject] = useState(
    existing?.object_id ?? objectId ?? data.objects[0]?.id ?? "",
  );
  const [assignee, setAssignee] = useState(existing?.assignee_id ?? "");
  function submit(e: FormEvent) {
    e.preventDefault();
    void onSubmit({
      title: title.trim(),
      description,
      object_id: object,
      assignee_id: assignee,
    });
  }
  return (
    <form onSubmit={submit}>
      <label>
        Название задачи
        <input
          required
          autoFocus
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Что нужно сделать?"
        />
      </label>
      <label>
        Описание
        <textarea
          maxLength={10000}
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Опишите ожидаемый результат и важные детали"
        />
      </label>
      <label>
        Объект
        <select
          required
          value={object}
          onChange={(e) => setObject(e.target.value)}
        >
          {data.objects.map((o) => (
            <option value={o.id} key={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Исполнитель
        <select
          required
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <option value="" disabled>
            Выберите исполнителя
          </option>
          {data.profiles
            .filter((p) => p.role === "executor")
            .map((p) => (
              <option value={p.id} key={p.id}>
                {p.display_name}
              </option>
            ))}
        </select>
      </label>
      <p className="form-hint">
        {existing
          ? "Статус меняется отдельным действием в карточке задачи."
          : "Новая задача сразу появится у назначенного исполнителя."}
      </p>
      <FormActions
        busy={busy}
        disabled={!title.trim() || !object || !assignee}
        onCancel={onCancel}
      />
    </form>
  );
}

export function FormActions({
  busy,
  disabled,
  onCancel,
}: {
  busy: boolean;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="form-actions">
      <button type="button" disabled={busy} onClick={onCancel}>
        Отмена
      </button>
      <button className="primary" disabled={busy || disabled}>
        {busy ? (
          <>
            <Loader2 size={16} className="spin" />
            Сохраняем…
          </>
        ) : (
          "Сохранить"
        )}
      </button>
    </div>
  );
}

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Building2, ClipboardList, Loader2, Search, X } from "lucide-react";
import type { Status } from "../types";
import { statusLabels } from "../types";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status ${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Building2 size={23} />
      </span>
      <span>
        стройка<span className="brand-dot">.</span>
        <small>ОБЪЕКТЫ И ЗАДАЧИ</small>
      </span>
    </div>
  );
}

export function Loading({
  children = "Загружаем данные…",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="loading" role="status">
      <Loader2 className="spin" size={23} />
      {children}
    </div>
  );
}

export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <ClipboardList size={34} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Stat({
  label,
  value,
  icon,
  green = false,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  green?: boolean;
}) {
  return (
    <div className={`stat${green ? " stat-green" : ""}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <span className="stat-icon">{icon}</span>
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function Dialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    // Нативное окно удерживает фокус и блокирует взаимодействие с фоном
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

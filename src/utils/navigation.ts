export function go(path: string) {
  // Переход между экранами без перезагрузки страницы
  window.location.hash = path;
}

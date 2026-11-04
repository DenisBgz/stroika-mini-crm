import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Подключаем обработку React и обновление компонентов при разработке
export default defineConfig({ plugins: [react()] });

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AppState } from '../src/lib/types';
import { emptyState, normalizeState } from '../src/lib/service';

/**
 * Хранилище данных в JSON-файле.
 * Это КАНОНИЧЕСКОЕ хранилище поездки: и веб-интерфейс (через REST API),
 * и MCP-инструменты работают с ним. Других копий состояния нет.
 *
 * Запись атомарная: пишем во временный файл и переименовываем,
 * чтобы при сбое не повредить существующие данные.
 */
export class JsonFileStorage {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AppState> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return normalizeState(JSON.parse(raw));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return emptyState();
      // Повреждённый файл не роняем приложение: переименовываем и начинаем заново
      const backupPath = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        await rename(this.filePath, backupPath);
        console.warn(`Хранилище повреждено. Данные сохранены в ${backupPath}`);
      } catch {
        // ignore
      }
      return emptyState();
    }
  }

  async save(state: AppState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    await rename(tmpPath, this.filePath);
  }
}

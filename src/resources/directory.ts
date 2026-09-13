import type { ResourceFile } from "./catalog";
// Local handles are stored, never the game bytes. Permission is requested only on a click.
export interface DirectoryHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<
    FileSystemDirectoryHandle | FileSystemFileHandle
  >;
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
}
export const directoryPicker = (
  window as unknown as {
    showDirectoryPicker?: (options: {
      mode: "read";
      id: string;
    }) => Promise<DirectoryHandle>;
  }
).showDirectoryPicker?.bind(window);
export async function scanDirectory(
  root: DirectoryHandle,
): Promise<ResourceFile[]> {
  const files: ResourceFile[] = [];
  async function walk(handle: DirectoryHandle, path: string) {
    for await (const entry of handle.values()) {
      const next = path ? `${path}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        // Do not enumerate saves, executables, or unrelated personal files.
        if (
          (!path && /^assets$/i.test(entry.name)) ||
          (/^assets$/i.test(path) && /^(bin|map)$/i.test(entry.name)) ||
          /^assets\/(bin|map)(\/|$)/i.test(path)
        )
          await walk(entry as DirectoryHandle, next);
      } else if (
        /^assets\/bin\/(graphic(?:info)?.*\.bin|pal\/[^/]+\.cgp)$/i.test(
          next,
        ) ||
        /^assets\/map\/.+\.dat$/i.test(next)
      ) {
        files.push({
          path: next,
          file: await (entry as FileSystemFileHandle).getFile(),
        });
      }
    }
  }
  await walk(root, "");
  return files;
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("x-gate-map-viewer", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("settings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function savedDirectory(
  value?: DirectoryHandle | null,
): Promise<DirectoryHandle | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "settings",
        value === undefined ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("settings");
      const request =
        value === undefined
          ? store.get("directory")
          : value === null
            ? store.delete("directory")
            : store.put(value, "directory");
      tx.oncomplete = () =>
        resolve(value === undefined ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

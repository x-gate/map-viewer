import type { Request, Result } from "./protocol";
export class ResourceClient {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  private sequence = 0;
  private closed?: Error;
  private pending = new Map<
    number,
    { resolve: (value: Result) => void; reject: (error: Error) => void }
  >();
  constructor() {
    this.worker.onmessage = ({
      data,
    }: MessageEvent<{ id: number; result: Result; error?: string }>) => {
      const entry = this.pending.get(data.id);
      this.pending.delete(data.id);
      if (data.error) entry?.reject(new Error(data.error));
      else entry?.resolve(data.result);
    };
    this.worker.onerror = () =>
      this.dispose("資源解析器無法啟動，請確認 WASM 建置完成並重新載入。");
  }
  request(request: Request): Promise<Result> {
    if (this.closed) return Promise.reject(this.closed);
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, request });
    });
  }
  dispose(message = "載入已取消。") {
    this.closed = new Error(message);
    this.worker.terminate();
    for (const entry of this.pending.values()) entry.reject(new Error(message));
    this.pending.clear();
  }
}

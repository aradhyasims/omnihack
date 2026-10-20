// Malware scanning. With MALWARE_SCANNER=clamav, every upload is stored as PENDING and scanned by a
// background job through clamd's INSTREAM protocol (CLAMAV_HOST / CLAMAV_PORT, default 3310).
// Files are only downloadable once CLEAN; INFECTED files are blocked and the object is deleted.
import net from "node:net";

export type ScanResult = { clean: true } | { clean: false; signature: string };

export interface MalwareScanner {
  readonly name: string;
  scan(data: Buffer): Promise<ScanResult>;
}

export function scannerEnabled() {
  return process.env.MALWARE_SCANNER === "clamav";
}

export class ClamdScanner implements MalwareScanner {
  readonly name = "clamav";
  constructor(
    private host: string,
    private port: number,
    private timeoutMs = 30_000,
  ) {}

  scan(data: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error("clamd scan timed out")));
      socket.on("error", reject);
      socket.on("data", (c) => chunks.push(c));
      socket.on("end", () => {
        const reply = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
        // Replies: "stream: OK" | "stream: <Signature> FOUND" | "INSTREAM size limit exceeded. ERROR"
        if (/:\s*OK$/.test(reply)) resolve({ clean: true });
        else if (/ FOUND$/.test(reply)) resolve({ clean: false, signature: reply.replace(/^stream:\s*/, "").replace(/ FOUND$/, "") });
        else reject(new Error(`clamd error: ${reply || "empty reply"}`));
      });
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        const CHUNK = 64 * 1024;
        for (let i = 0; i < data.length; i += CHUNK) {
          const part = data.subarray(i, i + CHUNK);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(part.length);
          socket.write(len);
          socket.write(part);
        }
        socket.end(Buffer.alloc(4)); // zero-length chunk terminates the stream
      });
    });
  }
}

let override: MalwareScanner | null = null;
export function setScannerForTesting(s: MalwareScanner | null) {
  override = s;
}

export function malwareScanner(): MalwareScanner {
  if (override) return override;
  return new ClamdScanner(process.env.CLAMAV_HOST ?? "127.0.0.1", Number(process.env.CLAMAV_PORT ?? 3310));
}

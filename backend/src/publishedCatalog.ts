import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export type PublishedApi = { product: string; title: string; description: string; specContent: string; publishedAt: string };
const directory = path.resolve(process.env.PUBLISHED_CATALOG_DIR || "data/published-apis");
const fileFor = (product: string) => path.join(directory, `${createHash("sha256").update(product).digest("hex")}.json`);

export async function listPublished(): Promise<PublishedApi[]> {
  try {
    const files = await fs.readdir(directory);
    const entries = await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => JSON.parse(await fs.readFile(path.join(directory, file), "utf8")) as PublishedApi));
    return entries.sort((a, b) => a.title.localeCompare(b.title));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function createPublished(entry: PublishedApi): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(fileFor(entry.product), JSON.stringify(entry, null, 2), { flag: "wx" });
}

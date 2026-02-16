import { join } from "@std/path";

const CACHE_FILE = ".update-check.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const RELEASES_URL = "https://api.github.com/repos/kecbigmt/mm/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/kecbigmt/mm/releases/latest";

interface UpdateCache {
  lastChecked: number;
  latestVersion: string;
}

/** Compare two semver strings (major.minor.patch). Returns -1, 0, or 1. */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

function formatUpdateMessage(current: string, latest: string): string {
  const upgradeHint = Deno.build.os === "darwin"
    ? "Run `brew upgrade mm` to update."
    : `Visit ${RELEASES_PAGE_URL} to update.`;
  return `\nA new version of mm is available: v${latest} (current: v${current})\n${upgradeHint}`;
}

async function readCache(cachePath: string): Promise<UpdateCache | null> {
  try {
    const text = await Deno.readTextFile(cachePath);
    return JSON.parse(text) as UpdateCache;
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, cache: UpdateCache): Promise<void> {
  try {
    await Deno.writeTextFile(cachePath, JSON.stringify(cache));
  } catch {
    // silently ignore write errors
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const resp = await fetch(RELEASES_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "Accept": "application/vnd.github+json" },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const tag = data.tag_name as string;
    return tag.startsWith("v") ? tag.slice(1) : tag;
  } catch {
    return null;
  }
}

/**
 * Check if a newer version is available. Returns a human-readable message
 * if an update exists, or null otherwise. Never throws.
 */
export async function checkForUpdate(
  currentVersion: string,
  mmHome: string,
): Promise<string | null> {
  try {
    const cachePath = join(mmHome, CACHE_FILE);
    const now = Date.now();
    const cache = await readCache(cachePath);

    if (cache && (now - cache.lastChecked) < CHECK_INTERVAL_MS) {
      return compareVersions(currentVersion, cache.latestVersion) < 0
        ? formatUpdateMessage(currentVersion, cache.latestVersion)
        : null;
    }

    const latestVersion = await fetchLatestVersion();
    if (!latestVersion) return null;

    await writeCache(cachePath, { lastChecked: now, latestVersion });

    return compareVersions(currentVersion, latestVersion) < 0
      ? formatUpdateMessage(currentVersion, latestVersion)
      : null;
  } catch {
    return null;
  }
}

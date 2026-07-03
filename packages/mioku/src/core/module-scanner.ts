import * as fs from "fs/promises";
import * as path from "path";

export interface DiscoveredModule {
  name: string;
  path: string;
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveRealpath(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return p;
  }
}

// Windows requires file:// URLs for absolute paths in dynamic import().
export function toImportPath(filePath: string): string {
  if (process.platform === "win32") {
    return "file:///" + filePath.replace(/\\/g, "/");
  }
  return filePath;
}

export async function scanLocalDir(dir: string): Promise<DiscoveredModule[]> {
  const results: DiscoveredModule[] = [];
  if (!(await pathExists(dir))) return results;

  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    try {
      const stat = await fs.stat(entryPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    results.push({ name: entry.name, path: await resolveRealpath(entryPath) });
  }
  return results;
}

export async function scanNodeModules(prefix: string): Promise<DiscoveredModule[]> {
  const results: DiscoveredModule[] = [];
  const nodeModulesPath = path.resolve(process.cwd(), "node_modules");
  if (!(await pathExists(nodeModulesPath))) return results;

  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(nodeModulesPath, { withFileTypes: true });
  } catch {
    return results;
  }

  // Don't filter by isDirectory(): node_modules entries are often symlinks
  // into the workspace, and Dirent.isDirectory() returns false for symlinks.
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix)) continue;
    const name = entry.name.slice(prefix.length);
    const fullPath = path.join(nodeModulesPath, entry.name);
    results.push({ name, path: await resolveRealpath(fullPath) });
  }
  return results;
}

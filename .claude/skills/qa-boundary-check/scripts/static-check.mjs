// Static boundary check for the book project. Read-only; no network or DB access.
// Usage: node .claude/skills/qa-boundary-check/scripts/static-check.mjs [projectRoot]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.argv[2] ?? process.cwd();
const skip = new Set(["node_modules", ".git", ".wrangler", "_workspace", ".claude"]);
const walk = dir => readdirSync(dir).flatMap(name => {
  if (skip.has(name)) return [];
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = walk(root);
const rel = p => relative(root, p).replaceAll("\\", "/");
const read = p => readFileSync(p, "utf8");
let problems = 0;
const report = (kind, msg) => { if (kind !== "INFO") problems++; console.log(`[${kind}] ${msg}`); };

// 1. Syntax check every JS module.
for (const f of files.filter(f => /\.(m?js)$/.test(f))) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status !== 0) report("SYNTAX", `${rel(f)}: ${r.stderr.split("\n").find(Boolean)}`);
}

// 2. Secrets that must never be committed.
const secretPatterns = [
  [/sb_secret_[A-Za-z0-9_-]+/, "Supabase secret key"],
  [/service_role/i, "service_role reference", /\.(m?js|jsonc?|toml)$/],
  [/postgres(ql)?:\/\/[^\s"'`]*:[^\s"'`@]+@/i, "connection string with password"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, "JWT literal"]
];
for (const f of files.filter(f => /\.(m?js|jsonc?|sql|html|md|toml)$/.test(f))) {
  const text = read(f);
  // Docs may mention key names in guidance; only scoped patterns are limited to code files.
  for (const [re, label, only] of secretPatterns)
    if ((!only || only.test(f)) && re.test(text)) report("SECRET", `${rel(f)}: ${label}`);
}

// 3. API paths: frontend fetch calls vs server routes.
const serverText = files.filter(f => rel(f).startsWith("server/")).map(read).join("\n");
const serverPaths = new Set([...serverText.matchAll(/["'`](\/api\/[^"'`$]*)["'`]/g)].map(m => m[1]));
const serverRegexes = [...serverText.matchAll(/\/\^(\\\/api.*?)\$\//g)].map(m => m[1]);
console.log(`[INFO] server literal paths: ${[...serverPaths].join(", ") || "(none)"}`);
console.log(`[INFO] server regex routes: ${serverRegexes.length}`);
for (const f of files.filter(f => rel(f).startsWith("prototype/") && f.endsWith(".js"))) {
  for (const m of read(f).matchAll(/fetch\(\s*["'`](\/api\/[^"'`?]*)/g)) {
    // Template interpolations such as ${facilityId} become a placeholder segment.
    const path = m[1].replace(/\$\{[^}]*\}/g, "x");
    const known = serverPaths.has(path) || serverRegexes.some(src => {
      try { return new RegExp("^" + src + "$").test(path); } catch { return false; }
    });
    report(known ? "INFO" : "ROUTE", `${rel(f)} calls ${path}${known ? "" : " — no matching server route found"}`);
  }
}

// 4. Error codes returned by server vs codes handled by frontend.
const serverCodes = new Set([...serverText.matchAll(/error\(\s*["']([A-Z][A-Z0-9_]+)["']/g)].map(m => m[1]));
const authCodes = [...serverText.matchAll(/error:\s*["']([A-Z][A-Z0-9_]+)["']/g)].map(m => m[1]);
authCodes.forEach(c => serverCodes.add(c));
const frontText = files.filter(f => rel(f).startsWith("prototype/") && f.endsWith(".js")).map(read).join("\n");
const unhandled = [...serverCodes].filter(c => !frontText.includes(c));
console.log(`[INFO] server error codes (${serverCodes.size}): ${[...serverCodes].join(", ")}`);
console.log(`[INFO] codes not referenced by any frontend file: ${unhandled.join(", ") || "(none)"}`);

// 5. Migrations: every CREATE TABLE has RLS enabled.
for (const f of files.filter(f => rel(f).startsWith("migrations/") && f.endsWith(".sql")).sort()) {
  const sql = read(f);
  for (const m of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-z_]+\.[a-z_]+)/gi)) {
    const table = m[1];
    const allSql = files.filter(x => x.endsWith(".sql")).map(read).join("\n");
    if (!new RegExp(`ALTER TABLE\\s+${table.replace(".", "\\.")}\\s+ENABLE ROW LEVEL SECURITY`, "i").test(allSql))
      report("RLS", `${rel(f)}: ${table} has no ENABLE ROW LEVEL SECURITY`);
  }
  if (/GRANT[^;]*TO\s+(PUBLIC|anon|authenticated)\b/i.test(sql)) report("GRANT", `${rel(f)}: grant to PUBLIC/anon/authenticated`);
}

console.log(problems ? `\n${problems} problem(s) found.` : "\nNo problems found.");
process.exitCode = problems ? 1 : 0;

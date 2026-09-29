import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const notices = readFileSync(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8").replace(/\r\n?/g, "\n");
const recognized = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "Unlicense",
]);

const reviewedExceptions = new Map([
  ["twitter-openapi-typescript@0.0.56", {
    license: "custom license or AGPL-3.0-or-later",
    explanation: "Selects the package's Custom License option; its full notice and use restriction are retained in THIRD_PARTY_NOTICES.md.",
    requiredNoticeText: ["Copyright (c) 2023 yuki", "unsolicited or excessive messages or posts"],
  }],
  ["twitter-openapi-typescript-generated@0.0.40", {
    license: "custom license or AGPL-3.0-or-later",
    explanation: "Selects the generated package's identical Custom License option; its notice is retained with the upstream package notice in THIRD_PARTY_NOTICES.md.",
    requiredNoticeText: ["Copyright (c) 2023 yuki", "unsolicited or excessive messages or posts"],
  }],
]);

function splitAtTopLevel(expression, operator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] === "(") depth += 1;
    if (expression[index] === ")") depth -= 1;
    if (depth === 0 && expression.slice(index, index + operator.length).toUpperCase() === operator) {
      parts.push(expression.slice(start, index).trim());
      start = index + operator.length;
      index += operator.length - 1;
    }
  }
  if (parts.length === 0) return null;
  parts.push(expression.slice(start).trim());
  return parts;
}

function unwrap(expression) {
  let value = expression.trim();
  while (value.startsWith("(") && value.endsWith(")")) {
    let depth = 0;
    let wrapsWholeExpression = true;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === "(") depth += 1;
      if (value[index] === ")") depth -= 1;
      if (depth === 0 && index < value.length - 1) {
        wrapsWholeExpression = false;
        break;
      }
    }
    if (!wrapsWholeExpression) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function evaluateExpression(expression) {
  const value = unwrap(expression);
  const alternatives = splitAtTopLevel(value, " OR ");
  if (alternatives) {
    const accepted = alternatives.map(evaluateExpression).filter((result) => result.accepted);
    return accepted.length > 0
      ? { accepted: true, explanation: `an explicitly recognized OR option is available (${accepted.map((result) => result.explanation).join("; ")})` }
      : { accepted: false, explanation: `no recognized OR option in ${value}` };
  }

  const requirements = splitAtTopLevel(value, " AND ");
  if (requirements) {
    const results = requirements.map(evaluateExpression);
    return results.every((result) => result.accepted)
      ? { accepted: true, explanation: results.map((result) => result.explanation).join(" and ") }
      : { accepted: false, explanation: `every AND term must be recognized (${results.filter((result) => !result.accepted).map((result) => result.explanation).join("; ")})` };
  }

  return recognized.has(value)
    ? { accepted: true, explanation: value }
    : { accepted: false, explanation: `unreviewed license expression: ${value || "(empty)"}` };
}

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpmCommand, ["licenses", "list", "--prod", "--json", "--long"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const inventory = JSON.parse(result.stdout);
const packages = Object.values(inventory).flatMap((entries) => entries.flatMap((entry) => (
  entry.versions.map((version) => {
    const packagePath = entry.paths.find((candidatePath) => {
      try {
        const metadata = JSON.parse(readFileSync(join(candidatePath, "package.json"), "utf8"));
        return metadata.version === version;
      } catch {
        return false;
      }
    });
    return { name: entry.name, version, license: entry.license, packagePath };
  })
)));
const seenExceptions = new Set();
const failures = [];
const directProduction = new Set(Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }));
const seenNames = new Set(packages.map((item) => item.name));

for (const name of directProduction) {
  if (!seenNames.has(name)) failures.push(`Direct production dependency is missing from pnpm's installed inventory: ${name}`);
}

for (const item of packages.sort((left, right) => {
  const leftKey = `${left.name}@${left.version}`;
  const rightKey = `${right.name}@${right.version}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
})) {
  const key = `${item.name}@${item.version}`;
  const exception = reviewedExceptions.get(key);
  if (exception) {
    seenExceptions.add(key);
    if (item.license !== exception.license) {
      failures.push(`${key}: expected reviewed license '${exception.license}', received '${item.license}'`);
      continue;
    }
    const missingNotice = exception.requiredNoticeText.filter((text) => !notices.includes(text));
    if (missingNotice.length > 0) {
      failures.push(`${key}: required notice text is missing from THIRD_PARTY_NOTICES.md: ${missingNotice.join(", ")}`);
      continue;
    }
    const installedLicense = item.packagePath
      ? readFileSync(join(item.packagePath, "LICENSE"), "utf8").replace(/\r\n?/g, "\n").trim()
      : "";
    if (!installedLicense || !notices.includes(installedLicense)) {
      failures.push(`${key}: full installed Custom License text is missing from THIRD_PARTY_NOTICES.md`);
      continue;
    }
    console.log(`REVIEWED EXCEPTION ${key} — ${exception.explanation}`);
    continue;
  }

  const evaluation = evaluateExpression(item.license ?? "");
  if (!evaluation.accepted) {
    failures.push(`${key}: ${evaluation.explanation}`);
  } else if (!recognized.has(unwrap(item.license))) {
    console.log(`RECOGNIZED LICENSE OPTION ${key} (${item.license}) — ${evaluation.explanation}`);
  }
}

for (const key of reviewedExceptions.keys()) {
  if (!seenExceptions.has(key)) failures.push(`Reviewed exception no longer matches an installed package: ${key}`);
}

if (failures.length > 0) {
  console.error(`Production license check failed (${failures.length} issue${failures.length === 1 ? "" : "s"}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Production license metadata check passed for ${packages.length} resolved package versions.`);
}

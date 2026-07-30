import fs from "node:fs";
import path from "node:path";

export function writeProbeResult(environmentName, result) {
  const configuredPath = process.env[environmentName]?.trim();
  if (!configuredPath) return;

  const outputPath = path.resolve(configuredPath);
  const parentDirectory = path.dirname(outputPath);
  fs.mkdirSync(parentDirectory, { recursive: true });

  const temporaryPath = path.join(
    parentDirectory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Search for .env in server directory, openpath root, or cwd
const candidatePaths = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(process.cwd(), "server/.env"),
  path.resolve(process.cwd(), ".env"),
];

for (const envPath of candidatePaths) {
  if (fs.existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === "function") {
        process.loadEnvFile(envPath);
        console.log(`[Config] Loaded environment variables from: ${envPath}`);
      }
      break;
    } catch (err) {
      console.warn(`[Config] Failed loading ${envPath}:`, err.message);
    }
  }
}

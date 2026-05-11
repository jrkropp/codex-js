import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const packageRoot = new URL("..", import.meta.url).pathname;
const source = join(packageRoot, "src/styles.css");
const target = join(packageRoot, "dist/styles.css");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

#!/usr/bin/env node

import { run } from "../src/index.js";

run(process.argv).catch((error) => {
  console.error(`\nvrcli 执行失败: ${error.message}`);
  process.exit(1);
});

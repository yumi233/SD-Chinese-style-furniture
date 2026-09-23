#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { normalizeEmail } = require("./userStore");

const email = normalizeEmail(process.argv[2]);
if (!email) {
  console.error("用法：make admin-id EMAIL=you@example.com");
  process.exitCode = 2;
} else {
  const filePath = path.resolve(
    process.env.USER_DATA_FILE || path.join(process.cwd(), "data", "users", "users.json"),
  );
  if (!fs.existsSync(filePath)) {
    console.error(`用户数据文件不存在：${filePath}`);
    process.exitCode = 1;
  } else {
    let state;
    try {
      state = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      console.error("用户数据文件不是有效 JSON");
      process.exitCode = 1;
    }
    const user = state?.users?.find((item) => normalizeEmail(item.email) === email);
    if (!user?.id) {
      console.error("没有找到该邮箱对应的用户");
      process.exitCode = 1;
    } else {
      process.stdout.write(`${user.id}\n`);
    }
  }
}

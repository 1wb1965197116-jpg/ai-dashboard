import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";

const USE_GIT_PUSH = true;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Helper: recursively get files by extension
function getFilesByExt(dir, ext) {
    let results = [];
    const list = fs.readdirSync(dir, { withFileTypes: true });
    list.forEach((file) => {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
            results = results.concat(getFilesByExt(filePath, ext));
        } else if (file.isFile() && file.name.endsWith(ext)) {
            results.push(filePath);
        }
    });
    return results;
}

// 1️⃣ JS files
const jsFiles = getFilesByExt(".", ".js");
const usedModules = new Set();
jsFiles.forEach((file) => {
    const content = fs.readFileSync(file, "utf-8");
    const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        if (!match[1].startsWith(".") && !match[1].startsWith("/")) {
            usedModules.add(match[1]);
        }
    }
});

// 2️⃣ HTML files
const htmlFiles = getFilesByExt(".", ".html");
htmlFiles.forEach((file) => {
    let content = fs.readFileSync(file, "utf-8");
    let changed = false;
    // Ensure DOCTYPE
    if (!/^<!DOCTYPE html>/i.test(content)) {
        content = "<!DOCTYPE html>\n" + content;
        changed = true;
    }
    // Ensure meta charset
    if (!/<meta charset=.*?>/i.test(content)) {
        content = content.replace(/<head>/i, "<head>\n<meta charset='UTF-8'>");
        changed = true;
    }
    if (changed) {
        fs.writeFileSync(file, content);
        console.log(`[Fix] HTML fixes applied to: ${file}`);
    }
});

// 3️⃣ Update package.json
const pkgPath = "package.json";
if (!fs.existsSync(pkgPath)) {
    console.log("[Error] package.json not found. Please create one.");
    process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
if (!pkg.dependencies) pkg.dependencies = {};
usedModules.forEach((mod) => {
    if (!pkg.dependencies[mod]) pkg.dependencies[mod] = "latest";
});
if (!pkg.scripts || !pkg.scripts.start) pkg.scripts = { start: "node server.js" };
if (!pkg.engines || !pkg.engines.node) pkg.engines = { node: "20.x" };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log("[Info] package.json updated.");

// 4️⃣ Install dependencies
console.log("[Info] Installing dependencies...");
execSync("npm install", { stdio: "inherit" });

// 5️⃣ Git push
if (USE_GIT_PUSH) {
    try {
        execSync("git add .", { stdio: "inherit" });
        execSync('git commit -m "Auto-fix JS + HTML deployment issues"', { stdio: "inherit" });
        execSync("git push", { stdio: "inherit" });
        console.log("[Deploy] Changes pushed to GitHub.");
    } catch (err) {
        console.log("[Warning] Git push failed or no changes.");
    }
}

// 6️⃣ Optional: AI suggestions for JS + HTML
async function aiCheck() {
    if (!OPENAI_API_KEY) return;
    let allCode = "";
    jsFiles.forEach((f) => allCode += `\n// JS File: ${f}\n` + fs.readFileSync(f, "utf-8"));
    htmlFiles.forEach((f) => allCode += `\n<!-- HTML File: ${f} -->\n` + fs.readFileSync(f, "utf-8"));

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENAI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{
                    role: "user",
                    content: `Check this Node.js + HTML project for deployment issues and suggest fixes:\n${allCode}`
                }]
            })
        });
        const data = await response.json();
        const advice = data.choices[0].message.content;
        console.log("\n[AI Advice]\n", advice);
    } catch (err) {
        console.log("[AI Error]", err.message);
    }
}

aiCheck();

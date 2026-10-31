import { mountAsciiField } from "../modules/ascii-field.js";
import { safeImageUrl } from "../modules/api.js";
import { DIMENSIONS, score } from "./model.js";

// Programmatic furniture silhouette is used only while a real image is pending.
export function draftingSource() {
  const canvas = document.createElement("canvas"); canvas.width = 720; canvas.height = 480;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#F7F6F1"; ctx.fillRect(0, 0, 720, 480);
  ctx.strokeStyle = "#677D45"; ctx.lineWidth = 18; ctx.lineCap = "round";
  ctx.beginPath(); ctx.ellipse(360, 152, 138, 64, 0, Math.PI, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(222, 150); ctx.lineTo(240, 290); ctx.moveTo(498, 150); ctx.lineTo(480, 290); ctx.moveTo(360, 100); ctx.bezierCurveTo(325, 160, 390, 210, 360, 268); ctx.stroke();
  ctx.fillStyle = "#AEBA78"; ctx.beginPath(); ctx.moveTo(238, 274); ctx.lineTo(452, 254); ctx.lineTo(502, 296); ctx.lineTo(278, 322); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(246, 286); ctx.lineTo(236, 408); ctx.moveTo(286, 316); ctx.lineTo(296, 438); ctx.moveTo(488, 300); ctx.lineTo(504, 420); ctx.moveTo(450, 264); ctx.lineTo(436, 380); ctx.stroke();
  return canvas;
}
export function mountDraft(host, source = draftingSource()) {
  return mountAsciiField(host, { source, settings: { filter: "ascii", mask: 0, palette: "meadow", size: 26 }, drift: false });
}
export function revealImage(host, image) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  let field; let timer;
  const show = () => {
    if (!host.isConnected) return;
    field = mountAsciiField(host, { source: image, settings: { filter: "dither", mask: 0, size: 40, strength: 24, palette: "meadow" } });
    host.classList.add("is-revealing");
    timer = setTimeout(() => { field?.destroy(); host.classList.remove("is-revealing"); }, 1200);
  };
  if (image.complete && image.naturalWidth) show(); else image.addEventListener("load", show, { once: true });
  return () => { clearTimeout(timer); image.removeEventListener("load", show); field?.destroy(); };
}
export async function downloadImage(node) {
  const url = safeImageUrl(node.image?.url, { allowData: true });
  if (!url) throw new Error("图片地址不可用");
  const response = await fetch(url, { credentials: new URL(url).origin === location.origin ? "same-origin" : "omit" });
  if (!response.ok) throw new Error("图片下载失败");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("返回的文件不是图片");
  saveBlob(blob, `木生-v${node.version}.${blob.type.split("/")[1].replace("jpeg", "jpg")}`);
}
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, "-"); a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function exportPage(node, title) {
  const url = safeImageUrl(node.image?.url, { allowData: true });
  if (!url) throw new Error("图片地址不可用");
  const image = new Image(); image.crossOrigin = "anonymous"; image.src = url; await image.decode();
  await document.fonts?.ready;
  const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 1400;
  const ctx = canvas.getContext("2d"); const css = getComputedStyle(document.documentElement);
  const color = name => css.getPropertyValue(name).trim();
  ctx.fillStyle = color("--paper"); ctx.fillRect(0, 0, 1600, 1400);
  ctx.fillStyle = color("--ink"); ctx.font = '48px "Songti SC", serif'; ctx.fillText(title.slice(0, 28), 80, 104);
  ctx.font = "24px monospace"; ctx.fillStyle = color("--olive"); ctx.fillText(`木生 · v${node.version}`, 80, 152);
  const factor = Math.min(1440 / image.width, 900 / image.height);
  const width = image.width * factor, height = image.height * factor;
  ctx.drawImage(image, (1600 - width) / 2, 192 + (900 - height) / 2, width, height);
  ctx.font = '24px "PingFang SC", sans-serif';
  DIMENSIONS.forEach(([key, label], i) => {
    const x = 80 + (i % 3) * 500, y = 1160 + Math.floor(i / 3) * 76;
    ctx.fillStyle = color("--sub"); ctx.fillText(label, x, y);
    ctx.fillStyle = color("--ink"); ctx.fillText(String(score(node.evaluation?.rubric?.[key]) ?? "未评审"), x + 300, y);
  });
  ctx.font = '20px "PingFang SC", sans-serif'; ctx.fillStyle = color("--sub"); ctx.fillText("AI 辅助设计 · 评分为模型建议", 80, 1340);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG 导出失败");
  saveBlob(blob, `${title}-v${node.version}.png`);
}

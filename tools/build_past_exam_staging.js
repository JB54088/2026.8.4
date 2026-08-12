#!/usr/bin/env node

/**
 * 从页面级 manifest 生成“待校对题”队列。
 *
 * 这里故意只生成候选题，不猜测最终题干、答案或 LaTeX；只有人工补齐并
 * 标记 publishStatus=published 后，才能交给 publish_past_exam_questions.js。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEFAULT_MANIFEST = path.join(ROOT, "public", "past-exam-assets", "trial-probability", "manifest.json");
const DEFAULT_OUTPUT = path.join(ROOT, "data", "past-exam-staging", "probability-pilot.json");
const DEFAULT_LIMIT = 30;

const SECTION_RANGES = [
  { start: 7, end: 22, id: "prob_events", name: "随机事件和概率" },
  { start: 23, end: 34, id: "prob_single", name: "随机变量及其分布" },
  { start: 35, end: 52, id: "prob_multivariate", name: "多维随机变量及其分布" },
  { start: 53, end: 76, id: "prob_moments", name: "随机变量的数字特征" },
  { start: 77, end: 80, id: "prob_limit", name: "大数定律和中心极限定理" },
  { start: 81, end: 88, id: "prob_statistics", name: "数理统计的基本概念" },
  { start: 89, end: 98, id: "prob_estimation", name: "参数估计" },
  { start: 99, end: 100, id: "prob_testing", name: "假设检验" }
];

function usage() {
  return `Usage:
  node tools/build_past_exam_staging.js [manifest.json] [output.json] [--limit 30]

Default manifest:
  public/past-exam-assets/trial-probability/manifest.json

The output is a review queue. It is not loaded into the student question pool.`;
}

function parseArgs(argv) {
  const positional = [];
  let limit = DEFAULT_LIMIT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--limit") {
      limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    positional.push(arg);
  }
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit 必须是正整数");
  return {
    manifestPath: path.resolve(positional[0] || DEFAULT_MANIFEST),
    outputPath: path.resolve(positional[1] || DEFAULT_OUTPUT),
    limit
  };
}

function sectionForPage(pageNumber) {
  return SECTION_RANGES.find((section) => pageNumber >= section.start && pageNumber <= section.end)
    || { id: "prob", name: "概率论与数理统计" };
}

function normalizeText(text) {
  return String(text || "").replace(/\u0000/g, "").trim();
}

function questionTypeSuggestion(text) {
  if (/（\s*[A-DＡ-Ｄ]\s*）|\([A-D]\)/.test(text)) return "choice";
  if (/_{3,}|____|填空/.test(text)) return "fill";
  return "solution";
}

function firstYearHint(text) {
  const match = text.match(/【\s*(\d{4})\s*-/);
  return match ? Number(match[1]) : null;
}

function candidateFromMarker(page, marker, nextMarker, index, manifest) {
  const rawExcerpt = page.text.slice(marker.index, nextMarker ? nextMarker.index : undefined);
  const excerpt = normalizeText(rawExcerpt).slice(0, 3000);
  const exampleNumber = Number(marker[1]);
  const section = sectionForPage(page.number);
  const imageName = String(page.image || "").replace(/^\.\//, "");
  const sourcePageImage = imageName
    ? `past-exam-assets/trial-probability/${imageName}`
    : "";

  return {
    id: `classified_probability_candidate_${String(index + 1).padStart(3, "0")}`,
    sourcePage: page.number,
    sourcePageImage,
    sourceLabel: `例${exampleNumber}`,
    exampleNumber,
    yearHint: firstYearHint(excerpt),
    suggestedChapterId: section.id,
    suggestedChapterName: section.name,
    suggestedType: questionTypeSuggestion(excerpt),
    rawTextExcerpt: excerpt,
    reviewStatus: "pending_review",
    publishStatus: "draft",
    reviewChecklist: [
      "确认题干、设问和选项完整",
      "确认原始年份、卷种、题号和分值",
      "补齐正式章节、知识点和题型",
      "用原页图片校对分式、矩阵、上下标和特殊符号",
      "补齐答案与解析后再申请发布"
    ],
    sourceManifest: manifest.id
  };
}

function collectCandidates(manifest) {
  const candidates = [];
  for (const page of manifest.pages || []) {
    const markers = [...String(page.text || "").matchAll(/【\s*例\s*(\d+)\s*】/g)];
    markers.forEach((marker, index) => {
      const nextMarker = markers[index + 1];
      candidates.push(candidateFromMarker(page, marker, nextMarker, candidates.length, manifest));
    });
  }
  return candidates;
}

function sampleEvenly(items, limit) {
  if (items.length <= limit) return items;
  const selected = [];
  const selectedIndexes = new Set();
  for (let index = 0; index < limit; index += 1) {
    const candidateIndex = Math.min(items.length - 1, Math.floor(index * items.length / limit));
    if (selectedIndexes.has(candidateIndex)) continue;
    selectedIndexes.add(candidateIndex);
    selected.push(items[candidateIndex]);
  }
  return selected;
}

function sampleBySection(items, limit) {
  if (items.length <= limit) return items;
  const groups = new Map();
  items.forEach((item) => {
    const key = item.suggestedChapterId || "prob";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const entries = Array.from(groups.entries());
  const quotas = new Map(entries.map(([key]) => [key, 0]));
  let remaining = limit;
  const minimum = limit >= entries.length * 2 ? 2 : 1;
  entries.forEach(([key, group]) => {
    const quota = Math.min(minimum, group.length);
    quotas.set(key, quota);
    remaining -= quota;
  });

  while (remaining > 0) {
    let allocated = false;
    for (const [key, group] of entries) {
      if (remaining <= 0) break;
      if (quotas.get(key) >= group.length) continue;
      quotas.set(key, quotas.get(key) + 1);
      remaining -= 1;
      allocated = true;
    }
    if (!allocated) break;
  }

  return entries
    .flatMap(([key, group]) => sampleEvenly(group, quotas.get(key)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(args.manifestPath, "utf8"));
  if (!manifest || !Array.isArray(manifest.pages) || !manifest.pages.length) {
    throw new Error("manifest.pages 为空，无法建立待校对队列");
  }

  const allCandidates = collectCandidates(manifest);
  const candidates = sampleBySection(allCandidates, args.limit).map((candidate, index) => ({
    ...candidate,
    pilotOrder: index + 1
  }));
  const output = {
    schemaVersion: 1,
    id: "classified-probability-pilot",
    title: manifest.title || "真题分类概率",
    sourceKind: "classification_book",
    sourceManifest: "public/past-exam-assets/trial-probability/manifest.json",
    sourceManifestId: manifest.id || "trial-probability",
    pageCount: manifest.pageCount || manifest.pages.length,
    status: "reviewing",
    publishPolicy: "只有人工审核通过并明确标记 publishStatus=published 的题目才可进入正式题库",
    candidateCount: candidates.length,
    discoveredCandidateCount: allCandidates.length,
    candidates
  };

  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  fs.writeFileSync(args.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`生成待校对队列：${args.outputPath}`);
  console.log(`候选题：${allCandidates.length}；本次试点：${candidates.length}；未发布：全部`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exit(1);
}

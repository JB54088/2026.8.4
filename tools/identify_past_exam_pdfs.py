#!/usr/bin/env python3
"""识别题库目录中的 PDF 是否像考研数学真题资料。

这是一个保守的文件级筛查器，不会把 PDF 内容导入题库，也不会修改原 PDF。
它读取 pdfinfo 元数据和 pdftotext 文字层，根据文件名、年份范围、真题/解析
关键词和可识别的例题数量给出证据报告。

注意：启发式只能证明“文件整体高度像真题资料”，不能证明每一道题都已经完成
年份、卷种、题号和原页核验。最终入库仍应以原页图片和人工校对为准。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_SOURCE_DIR = REPO_ROOT / "data" / "（87-25）数学真题分类"
DEFAULT_YEAR_MIN = 1987
DEFAULT_YEAR_MAX = 2025

YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")

# 文件名或文字层出现这些词，并不能单独证明是 AI 题；但在没有真题证据时，
# 它们应把文件降级到人工复核，避免误收。
NEGATIVE_MARKERS = {
    "ai": ("AI", "人工智能", "机器生成", "生成题", "AI生成"),
    "simulation": ("模拟题", "模拟试题", "预测题", "押题", "原创题", "自编题", "野题"),
}


def usage() -> str:
    return """Usage:
  python3 tools/identify_past_exam_pdfs.py [source_dir] [--json report.json]

默认扫描：data/（87-25）数学真题分类
只读 PDF，不会修改 PDF、题库或其他数据文件。
"""


def command_exists(command: str) -> bool:
    return shutil.which(command) is not None


def run_command(args: list[str]) -> tuple[str, str]:
    result = subprocess.run(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"命令失败（退出码 {result.returncode}）：{' '.join(args)}\n{detail}")
    return result.stdout, result.stderr.strip()


def pdf_metadata(pdf_path: Path) -> tuple[int, dict[str, str], str]:
    output, stderr = run_command(["pdfinfo", str(pdf_path)])
    metadata: dict[str, str] = {}
    for line in output.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip()
    try:
        pages = int(metadata["Pages"])
    except (KeyError, ValueError) as error:
        raise RuntimeError("pdfinfo 未找到有效的 Pages 字段") from error
    return pages, metadata, stderr


def extract_text(pdf_path: Path) -> tuple[str, str]:
    return run_command(
        ["pdftotext", "-layout", "-enc", "UTF-8", "-eol", "unix", str(pdf_path), "-"]
    )


def distinct_years(text: str) -> list[int]:
    return sorted({int(value) for value in YEAR_RE.findall(text) if 1900 <= int(value) <= 2100})


def marker_hits(value: str, markers: tuple[str, ...]) -> list[str]:
    lowered = value.lower()
    hits: list[str] = []
    for marker in markers:
        if marker == "AI" or marker == "AI生成":
            # 不把公式变量 ai / a_i 当成“AI”。这里只识别原文中的大写 AI。
            if marker in value:
                hits.append(marker)
        elif marker.lower() in lowered:
            hits.append(marker)
    return hits


def first_text_lines(text: str, limit: int = 8) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = " ".join(raw_line.strip().split())
        if line and line not in lines:
            lines.append(line[:180])
        if len(lines) >= limit:
            break
    return lines


def classify(path: Path, relative_path: str, pages: int, metadata: dict[str, str], text: str) -> dict[str, Any]:
    filename_signal_text = path.name.lower()
    path_signal_text = relative_path.lower()
    file_signal_text = f"{filename_signal_text} {path_signal_text}"
    combined_text = f"{relative_path}\n{text}"
    years = distinct_years(text)
    in_range_years = [year for year in years if DEFAULT_YEAR_MIN <= year <= DEFAULT_YEAR_MAX]
    negative_hits = sorted(
        {
            marker
            for group in NEGATIVE_MARKERS.values()
            for marker in marker_hits(combined_text, group)
        }
    )

    score = 0
    evidence: list[str] = []

    def add(points: int, reason: str) -> None:
        nonlocal score
        score += points
        evidence.append(f"{points:+d} {reason}")

    if "真题" in filename_signal_text:
        add(4, "文件名含“真题”")
    if "考研数学" in filename_signal_text:
        add(2, "文件名含“考研数学”")
    if "分类" in filename_signal_text or "汇编" in filename_signal_text:
        add(2, "文件名含“分类/汇编”")
    if "解析" in filename_signal_text:
        add(2, "文件名含“解析”")
    if "做题本" in filename_signal_text:
        add(2, "文件名含“做题本”")
    if "1987" in filename_signal_text and "2025" in filename_signal_text:
        add(3, "文件名覆盖 1987—2025")

    if DEFAULT_YEAR_MIN in in_range_years and DEFAULT_YEAR_MAX in in_range_years:
        add(5, "文字层同时识别到 1987 和 2025")
    elif len(in_range_years) >= 5:
        add(3, f"文字层识别到 {len(in_range_years)} 个考研年份")
    elif in_range_years:
        add(1, f"文字层识别到 {len(in_range_years)} 个考研年份")

    true_exam_hits = text.count("真题")
    example_hits = len(re.findall(r"(?:【\s*例|例\s*)\d+", text))
    answer_hits = text.count("答案")
    solution_hits = text.count("解析")
    subject_hits = sum(
        keyword in text for keyword in ("高等数学", "线性代数", "概率论", "数理统计")
    )

    if true_exam_hits:
        add(3, f"文字层含“真题” {true_exam_hits} 次")
    if example_hits >= 10:
        add(2, f"识别到 {example_hits} 个例题标记")
    if answer_hits and solution_hits:
        add(2, f"同时识别到答案 {answer_hits} 次、解析 {solution_hits} 次")
    if subject_hits:
        add(1, "文字层含考研数学学科名称")

    for negative_hit in negative_hits:
        add(-6, f"出现需警惕词“{negative_hit}”")

    text_chars = len(text.strip())
    chars_per_page = round(text_chars / pages, 1) if pages else 0
    if text_chars < 200 or chars_per_page < 2:
        add(-3, "文字层过少，可能是扫描件或无法解析")

    if negative_hits and score < 12:
        status = "疑似非真题或需复核"
        certainty = "低"
        material_kind = "unknown"
    elif score >= 16 and text_chars >= 200:
        status = "高可信真题资料"
        certainty = "高"
        if "解析" in filename_signal_text or (answer_hits and solution_hits):
            material_kind = "真题解析资料"
        elif "做题本" in filename_signal_text:
            material_kind = "真题做题本"
        else:
            material_kind = "真题分类汇编/原始资料"
    else:
        status = "需人工复核"
        certainty = "中"
        material_kind = "unknown"

    return {
        "path": relative_path,
        "name": path.name,
        "status": status,
        "certainty": certainty,
        "materialKind": material_kind,
        "score": score,
        "pages": pages,
        "fileSizeBytes": path.stat().st_size,
        "textChars": text_chars,
        "textCharsPerPage": chars_per_page,
        "years": years,
        "examYearsInRange": in_range_years,
        "trueExamHits": true_exam_hits,
        "exampleHits": example_hits,
        "answerHits": answer_hits,
        "solutionHits": solution_hits,
        "negativeHits": negative_hits,
        "title": metadata.get("Title", ""),
        "author": metadata.get("Author", ""),
        "producer": metadata.get("Producer", ""),
        "firstTextLines": first_text_lines(text),
        "evidence": evidence,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="识别 PDF 是否像考研数学真题资料", usage=usage())
    parser.add_argument("source_dir", nargs="?", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--json", dest="json_path", type=Path, help="同时输出 JSON 报告")
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args(sys.argv[1:])
    if not command_exists("pdfinfo") or not command_exists("pdftotext"):
        print("缺少 pdfinfo 或 pdftotext，请先安装 Poppler。", file=sys.stderr)
        return 2

    source_dir = args.source_dir.resolve()
    if not source_dir.is_dir():
        print(f"目录不存在：{source_dir}", file=sys.stderr)
        return 2

    pdf_paths = sorted(path for path in source_dir.rglob("*.pdf") if path.is_file())
    if not pdf_paths:
        print(f"未找到 PDF：{source_dir}", file=sys.stderr)
        return 1

    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    print(f"扫描目录：{source_dir}")
    print(f"PDF 数量：{len(pdf_paths)}（只读识别，逐个提取文字层）")

    for index, pdf_path in enumerate(pdf_paths, start=1):
        relative_path = pdf_path.relative_to(source_dir).as_posix()
        print(f"[{index}/{len(pdf_paths)}] {relative_path}")
        try:
            pages, metadata, metadata_warning = pdf_metadata(pdf_path)
            text, text_warning = extract_text(pdf_path)
            result = classify(pdf_path, relative_path, pages, metadata, text)
            warnings = [warning for warning in (metadata_warning, text_warning) if warning]
            if warnings:
                result["warnings"] = warnings
            results.append(result)
        except Exception as error:  # 单个坏文件不应阻断整批扫描
            errors.append({"path": relative_path, "error": str(error)})
            print(f"  ERROR: {error}", file=sys.stderr)

    counts: dict[str, int] = {}
    for result in results:
        counts[result["status"]] = counts.get(result["status"], 0) + 1

    report = {
        "schemaVersion": 1,
        "generatedBy": "tools/identify_past_exam_pdfs.py",
        "sourceDir": str(source_dir),
        "rule": "文件级启发式筛查；高可信不等于每道题都已完成原页核验",
        "scannedPdfCount": len(pdf_paths),
        "successfulPdfCount": len(results),
        "errorCount": len(errors),
        "statusCounts": counts,
        "files": results,
        "errors": errors,
    }

    if args.json_path:
        json_path = args.json_path.resolve()
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"JSON 报告：{json_path}")

    print("\n判断汇总：")
    for status, count in sorted(counts.items()):
        print(f"  {status}: {count}")
    if errors:
        print(f"  读取失败: {len(errors)}")

    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())

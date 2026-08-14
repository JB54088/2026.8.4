#!/usr/bin/env python3
"""从四份真题解析 PDF 中按例题编号提取答案与解析。

匹配键是 ``sourceBook + sourceExampleNo``，不使用题干相似度猜测。
脚本只生成答案 staging JSON；写入 SQLite 由 import_past_exam_answers.js 完成。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_QUESTIONS = ROOT / "data" / "past-exam-staging" / "extracted-1987-2025.json"
DEFAULT_OUTPUT = ROOT / "data" / "past-exam-staging" / "answers-matched-1987-2025.json"
PDF_SOURCES = [
    {
        "family": "high_math_upper",
        "sourceBook": "【原PDF】2026考研-真题分类高数上册",
        "pdf": ROOT / "docs" / "2026考研-真题分类高数上册解析.pdf",
    },
    {
        "family": "high_math_lower",
        "sourceBook": "【原PDF】2026考研-真题分类高数下册",
        "pdf": ROOT / "docs" / "2026考研-真题分类高数下册解析.pdf",
    },
    {
        "family": "probability",
        "sourceBook": "真题分类概率",
        "pdf": ROOT / "docs" / "真题分类概率解析.pdf",
    },
    {
        "family": "linear",
        "sourceBook": "真题分类线代",
        "pdf": ROOT / "docs" / "真题分类线代解析.pdf",
    },
]

EXAMPLE_RE = re.compile(r"【\s*例\s*(\d+)\s*】")
ANSWER_RE = re.compile(r"【\s*答\s*案\s*】")
EXPLANATION_RE = re.compile(r"【\s*(?:解\s*析|证\s*明)\s*】")
PLAIN_EXPLANATION_RE = re.compile(r"^\s*(?:解析|证明)\s*[:：]?\s*$")
CHOICE_RE = re.compile(r"[（(]\s*([A-DＡ-Ｄ])\s*[）)]", re.IGNORECASE)
INLINE_EXAMPLE_RE = re.compile(r"【\s*例\s*\d+\s*】")
PAGE_NUMBER_RE = re.compile(r"^\s*[-—]?\s*\d{1,4}\s*[-—]?\s*$")
PRIVATE_GLYPH_MAP = str.maketrans({
    "\uf0a3": "≤",
    "\uf0b3": "≥",
    "\uf0b9": "≠",
    "\uf0a5": "∞",
    "\uf0d7": "·",
    "\uf0f2": "∫",
    "\uf0a2": "′",
    "\uf0b1": "±",
})


@dataclass
class Line:
    page: int
    y: float
    x: float
    text: str
    words: list[tuple[float, str]]


def run_pdftotext_layout(pdf: Path) -> str:
    result = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pdftotext 失败：{pdf}\n{result.stderr.strip()}")
    return result.stdout


def page_lines(pdf: Path) -> list[Line]:
    # layout 文本保留完整的“【例 N】”标签，适合跨页建立例题区域。
    # 答案行的坐标细节由后续答案字段保留原始片段，不用题干相似度猜匹配。
    pages = run_pdftotext_layout(pdf).split("\f")
    flattened: list[Line] = []
    for page_number, page in enumerate(pages, start=1):
        for line_number, raw_line in enumerate(page.splitlines()):
            text = raw_line.rstrip()
            if not text.strip():
                continue
            flattened.append(Line(
                page=page_number,
                y=float(line_number),
                x=float(len(text) - len(text.lstrip())),
                text=text.strip(),
                words=[(0.0, text.strip())],
            ))
    return flattened


def marker_index(text: str, pattern: re.Pattern[str]) -> re.Match[str] | None:
    return pattern.search(text)


def line_marker_x(line: Line, pattern: re.Pattern[str]) -> float:
    match = pattern.search(line.text)
    if not match:
        return line.x
    prefix = line.text[: match.start()]
    # Word widths are not needed for exact cropping; the first word containing
    # the marker gives a stable left boundary for the following formula.
    consumed = 0
    for x, value in line.words:
        next_consumed = consumed + len(value) + (1 if consumed else 0)
        if next_consumed >= len(prefix):
            return x
        consumed = next_consumed
    return line.x


def is_page_number(text: str) -> bool:
    return bool(PAGE_NUMBER_RE.match(text.strip()))


def clean_text(
    lines: list[str],
    *,
    replace_private_glyphs: bool = True,
    drop_page_numbers: bool = False,
) -> str:
    values: list[str] = []
    for raw in lines:
        value = raw.replace("\x0c", " ").replace("\x00", " ").strip()
        # 不能默认按“纯数字”删除页码：解析 PDF 中大量标准答案本身就是
        # “6”“50”“-2”等纯数字。只有解析正文明确要求时才去掉页码。
        if not value or (drop_page_numbers and is_page_number(value)):
            continue
        if replace_private_glyphs:
            value = value.translate(PRIVATE_GLYPH_MAP)
        value = re.sub(r"\s+", " ", value).strip()
        if value:
            values.append(value)
    return "\n".join(values).strip()


def strip_marker(value: str, pattern: re.Pattern[str]) -> str:
    value = pattern.sub("", value, count=1).strip()
    # layout 文本常把“【例 N】”和“【答案】”放在同一行；例题标签不是答案内容。
    value = INLINE_EXAMPLE_RE.sub("", value).strip()
    return value


def source_question_map(path: Path) -> dict[tuple[str, int], dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    questions = raw if isinstance(raw, list) else raw.get("questions", [])
    return {
        (str(question.get("sourceBook", "")), int(question["sourceExampleNo"])): question
        for question in questions
        if question.get("sourceBook") and question.get("sourceExampleNo") is not None
    }


def choice_keys(value: str) -> list[str]:
    keys: list[str] = []
    for match in CHOICE_RE.finditer(value):
        key = match.group(1).upper().translate(str.maketrans("ＡＢＣＤ", "ABCD"))
        if key not in keys:
            keys.append(key)
    return keys


def standalone_choice_key(value: str) -> str:
    value = value.strip()
    match = re.fullmatch(r"[（(]\s*([A-DＡ-Ｄ])\s*[）)]\s*[.。；;]?", value, re.IGNORECASE)
    if not match:
        return ""
    return match.group(1).upper().translate(str.maketrans("ＡＢＣＤ", "ABCD"))


def looks_like_section_heading(value: str) -> bool:
    value = re.sub(r"\s+", "", value)
    return bool(
        re.match(r"^[（(][一二三四五六七八九十]+[）)]", value)
        or re.match(r"^\d+[.、]", value)
    )


def answer_without_marker(
    lines: list[Line],
    start: int,
    end: int,
    explanation_index: int | None,
    question: dict[str, Any] | None,
) -> tuple[str, list[str], str, str, int | None]:
    """提取例题标签与解析标记之间的显式结果（答案标记可能被省略）。"""
    # 无【答案】标记时只信任“例题标签同一行”上的尾部内容。继续向后
    # 扫描会把跨页章节标题、证明正文或页码误当成标准答案。
    source_lines = [INLINE_EXAMPLE_RE.sub("", lines[start].text).strip()]
    source_lines = [value for value in source_lines if value.strip()]
    source_text = clean_text(source_lines)
    non_page_lines = [value for value in source_lines if not is_page_number(value)]
    non_heading_lines = [value for value in non_page_lines if not looks_like_section_heading(value)]
    has_nested_solution_marker = any(
        EXPLANATION_RE.search(value)
        or PLAIN_EXPLANATION_RE.match(value)
        or re.search(r"【\s*(?:证\s*明|解\s*析)\s*】", value)
        for value in non_heading_lines
    )
    if has_nested_solution_marker:
        return "见解析", [], "answer_marker_missing", "", None
    if not non_heading_lines:
        return "见解析", [], "answer_marker_missing", "", None
    first_content = re.sub(r"\s+", "", non_heading_lines[0])
    if re.match(r"^\d+[.、]", first_content) and not re.search(r"[=＝∫∑函数方程矩阵]", first_content):
        return "见解析", [], "answer_marker_missing", "", None
    if re.fullmatch(r"[（(]?\d+[）)]?(?:[（(]?\d+[）)]?)+", first_content):
        return "见解析", [], "answer_marker_missing", "", None
    if not any(re.search(r"\d|[=＝＋－+\-−*/∫∑概率向量矩阵函数方程]", value) for value in non_heading_lines):
        return "见解析", [], "answer_marker_missing", "", None
    # 没有解析标记时，标签后只有页码/章节标题，不能当成标准答案。
    if not source_lines:
        return "见解析", [], "answer_marker_missing", "", None
    if explanation_index is None and not source_lines[0] and not non_heading_lines:
        return "见解析", [], "answer_marker_missing", "", None
    if not source_text or not non_heading_lines:
        return "见解析", [], "answer_marker_missing", "", None
    answer, aliases, status = answer_value(source_text, question)
    if answer == "见解析" and question and question.get("type") == "choice":
        key = next((standalone_choice_key(value) for value in non_heading_lines), "")
        if key:
            return key, [], "choice_key_extracted_without_marker", source_text, lines[start].page
    return answer, aliases, "answer_extracted_without_marker", source_text, lines[start].page


def answer_value(raw: str, question: dict[str, Any] | None) -> tuple[str, list[str], str]:
    value = clean_text(raw.splitlines())
    value = INLINE_EXAMPLE_RE.sub("", value).strip()
    value = re.sub(r"^\s*[:：.]\s*", "", value).strip()
    question_type = str((question or {}).get("type", ""))
    if not value or re.fullmatch(r"[.。；;,:：,，()（）\[\]【】\-—]+", value):
        return "见解析", [], "answer_marker_without_value"
    if "没有正确答案" in value:
        return "没有正确答案", choice_keys(value), "explicit_text_answer"
    if question_type == "choice":
        # 选择题答案行后面常紧跟选项 A/B/C/D 的解析内容；只取答案行
        # （或紧随其后的第一个非空行），避免把解析中的选项字母拼进答案。
        for line in value.splitlines()[:5]:
            keys = choice_keys(line)
            if keys:
                return "".join(keys), [], "choice_key_extracted"
        return "见解析", [], "answer_marker_without_value"
    keys = choice_keys(value)
    if keys and len(value) <= 80:
        return "".join(keys), [], "choice_key_extracted"
    if value.startswith("略") or value.startswith("见解析"):
        return value.split("\n", 1)[0].strip(), [], "explicit_text_answer"
    # A proof may be placed directly after 【答案】 without a separate value.
    # Keep the source excerpt for audit, but expose a safe non-gradable value.
    if "证明" in value and len(value) > 160:
        return "见解析", [], "answer_inferred_from_proof"
    return value, [], "answer_text_extracted"


def answer_value_from_page_layout(
    lines: list[Line],
    answer_index: int,
    explanation_index: int | None,
    end: int,
    question: dict[str, Any] | None,
) -> tuple[str, list[str], str, str]:
    """对答案行采用“标签后到解析前”的布局文本，再做一次保守归一化。"""
    answer_line = lines[answer_index]
    inline = ANSWER_RE.sub("", answer_line.text, count=1)
    inline = INLINE_EXAMPLE_RE.sub("", inline).strip()
    if question and question.get("type") == "choice":
        keys = choice_keys(inline)
        if keys:
            return "".join(keys), [], "choice_key_extracted", inline
        for index in range(answer_index + 1, min(explanation_index or end, answer_index + 8)):
            candidate = lines[index].text.strip()
            keys = choice_keys(candidate)
            if keys:
                return "".join(keys), [], "choice_key_extracted", f"{inline}\n{candidate}".strip()
        for index in range(answer_index - 1, max(-1, answer_index - 5), -1):
            key = standalone_choice_key(lines[index].text)
            if key:
                return key, [], "choice_key_extracted_from_adjacent_line", lines[index].text
        return "见解析", [], "answer_marker_without_value", inline

    if not inline or re.fullmatch(r"[.。；;,:：,，()（）\[\]【】\-—]+", inline):
        # pdftotext 可能把答案行的分式/数字拆到下一行；对非选择题保留
        # 直到解析标记的全部布局文本，由 answer_value 负责清洗。
        pass

    # 对填空/解答题，答案行后的布局行属于答案，直到解析标记；纯数字也要保留。
    raw_lines = [inline]
    for index in range(answer_index + 1, explanation_index or end):
        raw_lines.append(lines[index].text)
    source_text = clean_text(raw_lines)
    answer, aliases, status = answer_value(source_text, question)
    return answer, aliases, status, source_text


def answer_region(lines: list[Line], start: int, end: int, question: dict[str, Any] | None) -> dict[str, Any]:
    region = lines[start:end]
    answer_positions = [
        (index, line)
        for index, line in enumerate(region, start=start)
        if marker_index(line.text, ANSWER_RE)
    ]
    explanation_positions = [
        (index, line)
        for index, line in enumerate(region, start=start)
        if marker_index(line.text, EXPLANATION_RE)
        or PLAIN_EXPLANATION_RE.match(line.text)
    ]

    answer_item = answer_positions[0] if answer_positions else None
    answer_index = answer_item[0] if answer_item else None
    answer_line = answer_item[1] if answer_item else None
    explanation_item = next(
        (item for item in explanation_positions if answer_index is None or item[0] > answer_index),
        None,
    )
    explanation_index = explanation_item[0] if explanation_item else None
    explanation_line = explanation_item[1] if explanation_item else None
    answer_page = answer_line.page if answer_line else None

    if answer_line is not None:
        answer, aliases, extraction_status, answer_source_text = answer_value_from_page_layout(
            lines, answer_index, explanation_index, end, question
        )
    else:
        answer, aliases, extraction_status, answer_source_text, answer_page = answer_without_marker(
            lines, start, end, explanation_index, question
        )

    if explanation_line is not None:
        explanation_lines = [strip_marker(explanation_line.text, EXPLANATION_RE)]
        if PLAIN_EXPLANATION_RE.match(explanation_line.text):
            explanation_lines = [PLAIN_EXPLANATION_RE.sub("", explanation_line.text, count=1)]
        for index in range(explanation_index + 1, end):
            explanation_lines.append(lines[index].text)
        explanation_text = clean_text(explanation_lines, drop_page_numbers=True)
        explanation_page = explanation_line.page
    elif answer_index is not None:
        explanation_text = clean_text(
            [lines[index].text for index in range(answer_index + 1, end)],
            drop_page_numbers=True,
        )
        explanation_page = lines[answer_index].page
    else:
        explanation_text = clean_text(
            [lines[index].text for index in range(start + 1, end)],
            drop_page_numbers=True,
        )
        explanation_page = lines[start].page

    if answer_line is None and not answer_source_text:
        if question and question.get("type") == "choice":
            for index in range(start - 1, max(-1, start - 5), -1):
                key = standalone_choice_key(lines[index].text)
                if key:
                    answer = key
                    aliases = []
                    extraction_status = "choice_key_extracted_from_adjacent_line"
                    answer_source_text = lines[index].text
                    answer_page = lines[index].page
                    break
            else:
                answer, aliases, extraction_status = answer_value("", question)
        else:
            answer, aliases, extraction_status = answer_value("", question)
    if answer_source_text == "" and explanation_text:
        answer = "见解析"
        extraction_status = "answer_marker_missing"

    return {
        "answer": answer,
        "aliases": aliases,
        "answerSourceText": answer_source_text,
        "answerExtractionStatus": extraction_status,
        "answerPage": answer_page,
        "explanation": explanation_text,
        "explanationPage": explanation_page,
        "hasAnswerMarker": answer_line is not None,
        "hasExplanationMarker": explanation_line is not None,
    }


def extract_file(source: dict[str, Any], questions: dict[tuple[str, int], dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    lines = page_lines(source["pdf"])
    markers: list[tuple[int, int, int]] = []
    for index, line in enumerate(lines):
        for match in EXAMPLE_RE.finditer(line.text):
            markers.append((index, int(match.group(1)), line.page))

    matches: list[dict[str, Any]] = []
    for marker_index_position, (start, example_no, page) in enumerate(markers):
        end = markers[marker_index_position + 1][0] if marker_index_position + 1 < len(markers) else len(lines)
        key = (source["sourceBook"], example_no)
        question = questions.get(key)
        extracted = answer_region(lines, start, end, question)
        extracted.update({
            "family": source["family"],
            "sourceBook": source["sourceBook"],
            "sourceExampleNo": example_no,
            "questionId": question.get("id") if question else None,
            "questionType": question.get("type") if question else None,
            "sourcePdf": str(source["pdf"].relative_to(ROOT).as_posix()),
            "examplePage": page,
            "matchKey": f"{source['sourceBook']}::{example_no}",
        })
        matches.append(extracted)

    source_keys = {key for key in questions if key[0] == source["sourceBook"]}
    pdf_keys = {(source["sourceBook"], item["sourceExampleNo"]) for item in matches}
    report = {
        "family": source["family"],
        "sourceBook": source["sourceBook"],
        "sourcePdf": str(source["pdf"].relative_to(ROOT).as_posix()),
        "pages": len({line.page for line in lines}),
        "pdfExampleCount": len(matches),
        "questionExampleCount": len(source_keys),
        "matchedQuestionCount": len(source_keys & pdf_keys),
        "sourceOnlyAnswerExamples": sorted(example for book, example in pdf_keys - source_keys),
        "questionMissingInPdf": sorted(example for book, example in source_keys - pdf_keys),
        "answerMarkerCount": sum(item["hasAnswerMarker"] for item in matches),
        "answerValueCount": sum(bool(item["answerSourceText"]) for item in matches),
        "explanationMarkerCount": sum(item["hasExplanationMarker"] for item in matches),
        "fallbackAnswerCount": sum(item["answerExtractionStatus"] != "answer_text_extracted" and item["answerExtractionStatus"] != "choice_key_extracted" and item["answerExtractionStatus"] != "explicit_text_answer" for item in matches),
    }
    return matches, report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="从四份真题解析 PDF 按例题编号提取答案")
    parser.add_argument("--questions", type=Path, default=DEFAULT_QUESTIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    questions = source_question_map(args.questions.resolve())
    all_matches: list[dict[str, Any]] = []
    reports: list[dict[str, Any]] = []
    for source in PDF_SOURCES:
        if not source["pdf"].is_file():
            raise RuntimeError(f"答案 PDF 不存在：{source['pdf']}")
        print(f"扫描：{source['pdf'].relative_to(ROOT)}")
        matches, report = extract_file(source, questions)
        all_matches.extend(matches)
        reports.append(report)
        print(
            f"  PDF 例题 {report['pdfExampleCount']}；题库对应 {report['matchedQuestionCount']}；"
            f"答案标记 {report['answerMarkerCount']}；解析标记 {report['explanationMarkerCount']}"
        )

    matched_keys = {item["matchKey"] for item in all_matches if item["questionId"]}
    question_keys = {f"{book}::{example}" for book, example in questions}
    output = {
        "schemaVersion": 1,
        "generatedBy": "tools/extract_past_exam_answers.py",
        "questionSource": str(args.questions.resolve().relative_to(ROOT).as_posix()),
        "sourcePolicy": "按 sourceBook + sourceExampleNo 精确匹配，不按题干相似度猜测",
        "questionCount": len(question_keys),
        "matchedQuestionCount": len(matched_keys),
        "unmatchedQuestionCount": len(question_keys - matched_keys),
        "unmatchedQuestionKeys": sorted(question_keys - matched_keys),
        "reports": reports,
        "matches": all_matches,
    }
    args.output.resolve().parent.mkdir(parents=True, exist_ok=True)
    args.output.resolve().write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"生成：{args.output.resolve()}")
    print(f"题库题目：{len(question_keys)}；成功按编号匹配：{len(matched_keys)}；未匹配：{len(question_keys - matched_keys)}")
    return 0 if not question_keys - matched_keys else 1


if __name__ == "__main__":
    raise SystemExit(main())

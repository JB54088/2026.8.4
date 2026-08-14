#!/usr/bin/env python3
"""从 1987—2025 真题分类 PDF 中提取结构化候选题。

这个脚本默认只写 staging JSON 和原页图片，不写 SQLite，也不会把题目标成
published。它的职责是把“题目边界、分类上下文、年份/卷种标签、题型候选和
来源页”稳定地提出来；PDF 文字层中无法可靠恢复的数学公式保留为 text，并
通过原页图片和 reviewFlags 标记，避免把错误 OCR 当成 LaTeX 入库。

用法示例：
  python3 tools/extract_past_exam_questions.py \
    --pdf 'data/…/真题分类概率.pdf' \
    --pdf 'data/…/真题分类线代.pdf' \
    --pdf 'data/…/【原PDF】2026考研-真题分类高数上册.pdf' \
    --limit 30 \
    --output data/past-exam-staging/extracted-pilot.json \
    --assets-dir public/past-exam-assets/extracted-pilot

全量运行时不传 --limit。解析/做题本 PDF 默认不会作为主来源，以免重复导入；
它们可以在后续答案与解析合并阶段单独处理。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
DEFAULT_SOURCE_DIR = ROOT / "data" / "（87-25）数学真题分类"
DEFAULT_OUTPUT = ROOT / "data" / "past-exam-staging" / "extracted-1987-2025.json"
DEFAULT_ASSETS_DIR = ROOT / "public" / "past-exam-assets" / "classified-1987-2025"

SUBJECT_NAMES = {
    "1": "数学一",
    "2": "数学二",
    "3": "数学三",
    "4": "数学四",
    "5": "数学五",
}

EXAMPLE_RE = re.compile(r"【\s*例\s*(\d+)\s*】")
EXAM_TAG_RE = re.compile(
    r"【\s*((?:19|20)\d{2})\s*[-－—]\s*([0-9]+)\s*[-－—]\s*([0-9]+(?:\.[0-9]+)?)\s*分\s*】"
)
OPTION_RE = re.compile(
    r"[（]\s*([Ａ-ＤA-D])\s*[）]"
    r"|(?:^|\n)[ \t]*\(\s*([A-D])\s*\)",
    flags=re.MULTILINE,
)
PRIVATE_USE_RE = re.compile(r"[\ue000-\uf8ff\U000f0000-\U000ffffd]")
MATH_GLYPH_RE = re.compile(
    r"[∫∬∭∮∑∏√∞≤≥≠≈≡∈∉⊂⊆⊃⊇∪∩∅±∓×÷→←↔∀∃∂∇"
    r"αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]"
)
FORMULA_SHAPE_RE = re.compile(
    r"(?:[A-Za-zα-ωΑ-Ω]\s*[=<>^_]"
    r"|[=<>]\s*[A-Za-z0-9α-ωΑ-Ω]"
    r"|\d\s*\n\s*\d)"
)
FILL_RE = re.compile(r"(?:_{2,}|＿{2,}|\.\.\.|…{2,}|（\s{2,}）|\(\s{2,}\))")
PAGE_NUMBER_RE = re.compile(r"^\s*[-—]?\s*\d{1,4}\s*[-—]?\s*$")
MODULE_RE = re.compile(r"^\s*模块\s*[一二三四五六七八九十0-9]+\s+(.+?)\s*$")
NUMBERED_HEADING_RE = re.compile(r"^\s*[一二三四五六七八九十百0-9]+、\s*(.+?)\s*$")
PAREN_HEADING_RE = re.compile(r"^\s*[（(]\s*[一二三四五六七八九十0-9]+\s*[）)]\s*(.+?)\s*$")


@dataclass
class Context:
    module: str = ""
    chapter: str = ""
    subsection: str = ""

    def copy(self) -> "Context":
        return Context(self.module, self.chapter, self.subsection)


@dataclass
class ActiveQuestion:
    example_no: int
    marker: str
    start_page: int
    context: Context
    lookbehind: str
    chunks: list[str] = field(default_factory=list)
    end_page: int = 0


def command_exists(command: str) -> bool:
    return shutil.which(command) is not None


def run_command(args: list[str]) -> str:
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
    return result.stdout


def normalize_heading(value: str) -> str:
    value = re.sub(r"\s+", " ", value.replace("\x00", "")).strip()
    value = re.sub(r"[.。·…]{3,}.*$", "", value).strip()
    return value


def update_context(text: str, context: Context) -> Context:
    """按文字层中的标题更新章节上下文。"""

    next_context = context.copy()
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        module_match = MODULE_RE.match(line)
        if module_match:
            next_context.module = normalize_heading(module_match.group(1))
            next_context.chapter = ""
            next_context.subsection = ""
            continue
        chapter_match = NUMBERED_HEADING_RE.match(line)
        if chapter_match:
            next_context.chapter = normalize_heading(chapter_match.group(1))
            next_context.subsection = ""
            continue
        subsection_match = PAREN_HEADING_RE.match(line)
        if subsection_match:
            next_context.subsection = normalize_heading(subsection_match.group(1))
    return next_context


def remove_layout_noise(text: str) -> str:
    """删除页码、标题和 PDF 文字层的空布局，保留题目内部换行。"""

    cleaned: list[str] = []
    for raw_line in text.replace("\r", "").splitlines():
        line = raw_line.replace("\x00", "").rstrip()
        compact = re.sub(r"\s+", " ", line).strip()
        if not compact:
            if cleaned and cleaned[-1] != "":
                cleaned.append("")
            continue
        if PAGE_NUMBER_RE.match(compact):
            continue
        if MODULE_RE.match(compact) or NUMBERED_HEADING_RE.match(compact) or PAREN_HEADING_RE.match(compact):
            continue
        if compact.startswith("目录") or compact.startswith("CONTENTS"):
            continue
        # 题目的答案/分值标签是来源元数据，不混入可搜索题干。
        compact = EXAM_TAG_RE.sub("", compact)
        cleaned.append(compact)

    while cleaned and cleaned[0] == "":
        cleaned.pop(0)
    while cleaned and cleaned[-1] == "":
        cleaned.pop()
    return "\n".join(cleaned)


def split_pages(raw_text: str, page_count: int) -> list[str]:
    pages = raw_text.replace("\r\n", "\n").replace("\r", "\n").split("\f")
    while len(pages) > page_count and not pages[-1].strip():
        pages.pop()
    if len(pages) < page_count:
        pages.extend([""] * (page_count - len(pages)))
    if len(pages) > page_count:
        pages = pages[: page_count - 1] + ["\n".join(pages[page_count - 1 :])]
    return pages


def pdf_page_count(pdf_path: Path) -> int:
    metadata = run_command(["pdfinfo", str(pdf_path)])
    match = re.search(r"^Pages:\s+(\d+)\s*$", metadata, flags=re.MULTILINE)
    if not match:
        raise RuntimeError(f"pdfinfo 未找到页数：{pdf_path}")
    return int(match.group(1))


def extract_pdf_text(pdf_path: Path) -> str:
    return run_command(["pdftotext", "-layout", "-enc", "UTF-8", "-eol", "unix", str(pdf_path), "-"])


def family_for_path(pdf_path: Path) -> str:
    value = str(pdf_path).lower()
    name = pdf_path.name.lower()
    if "高数" in name:
        return "high_math"
    # “线代概率篇”同时含有两个词，优先看文件名中的具体篇目。
    if "概率" in name:
        return "probability"
    if "线代" in name:
        return "linear"
    if "概率" in value:
        return "probability"
    if "线代" in value:
        return "linear"
    return "unknown"


def source_slug(pdf_path: Path) -> str:
    family = family_for_path(pdf_path)
    stem = re.sub(r"[^a-zA-Z0-9]+", "-", pdf_path.stem).strip("-").lower()
    if "上" in pdf_path.stem:
        stem += "-upper"
    elif "下" in pdf_path.stem:
        stem += "-lower"
    return f"{family}-{stem or 'source'}"


def is_primary_pdf(pdf_path: Path) -> bool:
    value = str(pdf_path)
    name = pdf_path.name
    if "解析" in name or "做题本" in name:
        return False
    if "原PDF" in name or "真题分类" in name:
        return True
    # 对未来新增的同类资料保守处理：没有明显的解析/做题本标识才入主扫描。
    return "原PDF及解析" in value


def select_pdfs(source_dir: Path, explicit: list[Path], family: str) -> list[Path]:
    if explicit:
        candidates = [path.resolve() for path in explicit]
    else:
        candidates = sorted(path.resolve() for path in source_dir.rglob("*.pdf") if is_primary_pdf(path))
    selected = [path for path in candidates if family == "all" or family_for_path(path) == family]
    if not selected:
        raise RuntimeError("没有找到可扫描的主来源 PDF；请用 --pdf 明确指定文件。")
    missing = [str(path) for path in selected if not path.is_file()]
    if missing:
        raise RuntimeError(f"PDF 不存在：{missing}")
    return selected


def subject_names(math_code: str) -> list[str]:
    return [SUBJECT_NAMES[digit] for digit in math_code if digit in SUBJECT_NAMES]


def parse_exam_tag(value: str) -> dict[str, Any] | None:
    match = EXAM_TAG_RE.search(value)
    if not match:
        return None
    year = int(match.group(1))
    math_code = match.group(2)
    score = float(match.group(3))
    return {
        "year": year,
        "mathCode": math_code,
        "subjects": subject_names(math_code),
        "score": int(score) if score.is_integer() else score,
        "raw": match.group(0),
    }


def section_for_context(family: str, context: Context) -> tuple[str, str, str, str]:
    text = " ".join([context.module, context.chapter, context.subsection])
    group_id = {
        "high_math": "high_math",
        "linear": "linear",
        "probability": "prob",
    }.get(family, "past_exam")
    group_name = {
        "high_math": "高等数学",
        "linear": "线性代数",
        "probability": "概率论与数理统计",
    }.get(family, "历年真题")

    rules: list[tuple[str, str, str]] = []
    if family == "high_math":
        rules = [
            ("limit", "函数、极限与连续", "极限|连续"),
            ("diff", "一元函数微分学", "一元函数微分|导数|微分中值|中值定理"),
            ("multi", "多元函数微分学", "多元函数微分|多重积分|二重积分|三重积分|曲线积分|曲面积分|场论"),
            ("integral", "一元函数积分学", "一元函数积分|不定积分|定积分|反常积分"),
            ("series", "无穷级数", "无穷级数|常数项级数|函数项级数|级数"),
            ("ode", "常微分方程", "微分方程"),
            ("space", "空间解析几何", "空间解析|向量代数"),
        ]
    elif family == "linear":
        rules = [
            ("linear_determinant", "行列式", "行列式"),
            ("linear_matrix", "矩阵", "矩阵|秩"),
            ("linear_vector", "向量", "向量"),
            ("linear_system", "线性方程组", "线性方程组"),
            ("linear_eigen", "矩阵的特征值和特征向量", "特征值|相似|对角化"),
            ("linear_quadratic", "二次型", "二次型"),
        ]
    elif family == "probability":
        rules = [
            ("prob_events", "随机事件和概率", "随机事件|概率"),
            ("prob_single", "随机变量及其分布", "随机变量|分布"),
            ("prob_multivariate", "多维随机变量及其分布", "多维|二维|联合"),
            ("prob_moments", "随机变量的数字特征", "数字特征|数学期望|方差"),
            ("prob_limit", "大数定律和中心极限定理", "大数定律|中心极限"),
            ("prob_statistics", "数理统计的基本概念", "数理统计|总体|样本|统计量"),
            ("prob_estimation", "参数估计", "参数估计|点估计|区间估计"),
            ("prob_testing", "假设检验", "假设检验|显著性|拒绝域"),
        ]
    for section_id, name, pattern in rules:
        if re.search(pattern, text):
            return section_id, name, group_id, group_name

    fallback_name = context.module or context.chapter or context.subsection or "待标注章节"
    fallback_id = f"past_exam_{family or 'unknown'}"
    return fallback_id, fallback_name, group_id, group_name


def option_key(value: str) -> str:
    value = value.upper().translate(str.maketrans("ＡＢＣＤ", "ABCD"))
    return value


def parse_options(text: str) -> list[str]:
    matches = list(OPTION_RE.finditer(text))
    if len(matches) < 2:
        return []
    options: list[str] = []
    for index, match in enumerate(matches):
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = re.sub(r"\s+", " ", text[match.end() : next_start]).strip()
        key = option_key(match.group(1) or match.group(2))
        options.append(f"{key}. {body}".strip())
    return options


def question_type(text: str, options: list[str]) -> tuple[str, float]:
    if len(options) >= 2:
        return "choice", 0.95
    if FILL_RE.search(text) or re.search(r"为\s*[。．.]?\s*$", text):
        return "fill", 0.68
    return "solution", 0.58


def stable_id(pdf_path: Path, exam: dict[str, Any] | None, example_no: int, page: int) -> str:
    source_part = source_slug(pdf_path).replace("-", "_")
    if exam:
        base = f"past_{source_part}_{exam['year']}_{exam['mathCode']}_ex{example_no}"
    else:
        digest = hashlib.sha1(str(pdf_path).encode("utf-8")).hexdigest()[:8]
        base = f"past_{source_part}_unknown_{digest}_ex{example_no}"
    return base or f"past_unknown_{page}_{example_no}"


def question_from_active(
    active: ActiveQuestion,
    pdf_path: Path,
    family: str,
    assets_url_prefix: str,
) -> dict[str, Any] | None:
    raw_block = "\n".join(active.chunks)
    text = remove_layout_noise(raw_block)
    if not text:
        return None

    exam = parse_exam_tag(raw_block) or parse_exam_tag(active.lookbehind)
    options = parse_options(text)
    qtype, type_confidence = question_type(text, options)
    section_id, section_name, group_id, group_name = section_for_context(family, active.context)
    page_end = active.end_page or active.start_page
    source_slug_value = source_slug(pdf_path)
    source_name = pdf_path.stem
    subjects = exam["subjects"] if exam and exam["subjects"] else []
    stem = text
    if options:
        first_option = OPTION_RE.search(text)
        if first_option:
            stem = text[: first_option.start()].strip()
    if not stem:
        stem = text

    review_flags: list[str] = []
    if not exam:
        review_flags.append("missing_exam_tag")
    if not subjects:
        review_flags.append("missing_subjects")
    # 当前样本的中间编码是适用卷种代码，不把它冒充原试卷题号。
    review_flags.append("original_exam_question_no_not_in_source_tag")
    if page_end != active.start_page:
        review_flags.append("question_spans_multiple_pages")
    if PRIVATE_USE_RE.search(text):
        review_flags.append("private_use_math_glyph")
    if MATH_GLYPH_RE.search(text) or FORMULA_SHAPE_RE.search(text):
        review_flags.append("formula_requires_visual_review")
    if qtype == "solution" and type_confidence < 0.7:
        review_flags.append("type_needs_review")
    if len(stem) < 12:
        review_flags.append("stem_too_short")

    confidence = 0.40
    if exam:
        confidence += 0.25
    if section_id and not section_id.startswith("past_exam_"):
        confidence += 0.15
    if len(stem) >= 12:
        confidence += 0.10
    confidence += 0.10 * type_confidence
    confidence = round(min(0.99, confidence), 3)

    math_format = "text"
    formula_status = "pending_formula_ocr" if "formula_requires_visual_review" in review_flags else "not_detected"
    page_image = f"{assets_url_prefix}/{source_slug_value}/page-{active.start_page:04d}.png"
    source_section = active.context.subsection or active.context.chapter or active.context.module
    source_year = exam["year"] if exam else None
    source_math_type = "、".join(subjects)
    source_tag = exam["raw"] if exam else ""

    question: dict[str, Any] = {
        "id": stable_id(pdf_path, exam, active.example_no, active.start_page),
        "subjects": subjects,
        "sectionId": section_id,
        "sectionName": section_name,
        # 导入脚本仍要求这两个兼容别名；正式规范化后会与 sectionId/Name 对齐。
        "chapterId": section_id,
        "chapterName": section_name,
        "section": {
            "id": section_id,
            "name": section_name,
            "groupId": group_id,
            "groupName": group_name,
            "order": 0,
        },
        "point": source_section or section_name,
        "reason": "真题自动抽取，待审核",
        "type": qtype,
        "level": "历年真题（待审核）",
        "difficulty": 4,
        "stem": stem,
        "stemFormat": math_format,
        "formula": "",
        "formulaFormat": "text",
        "options": options,
        "answer": "",
        "answerStatus": "pending_review",
        "aliases": [],
        "explanation": "",
        "sourceType": "past_exam",
        "source": source_name,
        "sourceName": source_name,
        "sourceBook": source_name,
        "sourceSection": source_section,
        "sourceYear": source_year,
        "sourceMathType": source_math_type,
        "sourceQuestionNo": "",
        "sourcePage": active.start_page,
        "sourcePageImage": page_image,
        "stemImage": page_image,
        "reviewStatus": "extracted_pending_review",
        "publishStatus": "draft",
        "qualityTier": "past_exam_extracted",
        "practiceStatus": "needs_review",
        "knowledgePointId": f"{section_id}:{source_section or section_name}",
        "knowledgePointName": source_section or section_name,
        "errorTypes": ["transfer"],
        "trainingLevel": "variation",
        "similarGroupId": "",
        "content": {
            "stem": {"value": stem, "format": math_format},
            "formula": {"value": "", "format": "text"},
            "explanation": {"value": "", "format": "text"},
        },
        "sourceSpec": {
            "type": "past_exam",
            "name": source_name,
            "book": source_name,
            "section": source_section,
            "year": source_year,
            "mathType": source_math_type,
            "questionNo": "",
            "page": active.start_page,
            "pageImage": page_image,
            "stemImage": page_image,
        },
        # 这些字段是抽取层的溯源信息，normalizeQuestion 会保留在 question_json 中。
        "sourcePdf": str(pdf_path.relative_to(ROOT).as_posix()) if pdf_path.is_relative_to(ROOT) else str(pdf_path),
        "sourcePageEnd": page_end,
        "sourceExampleNo": active.example_no,
        "sourceExamTag": source_tag,
        "sourceExamMathCode": exam["mathCode"] if exam else "",
        "sourceScore": exam["score"] if exam else None,
        "rawText": text,
        "formulaExtraction": {
            "status": formula_status,
            "format": math_format,
            "latex": "",
            "reviewFlags": review_flags,
        },
        "extraction": {
            "confidence": confidence,
            "typeConfidence": type_confidence,
            "reviewFlags": review_flags,
            "extractor": "tools/extract_past_exam_questions.py",
        },
    }
    return question


def collect_questions(
    pdf_path: Path,
    assets_url_prefix: str,
) -> tuple[list[dict[str, Any]], int, set[int]]:
    pages_count = pdf_page_count(pdf_path)
    pages = split_pages(extract_pdf_text(pdf_path), pages_count)
    family = family_for_path(pdf_path)
    context = Context()
    active: ActiveQuestion | None = None
    questions: list[dict[str, Any]] = []
    previous_tail = ""

    for page_number, page_text in enumerate(pages, start=1):
        cursor = 0
        matches = list(EXAMPLE_RE.finditer(page_text))
        for match in matches:
            context = update_context(page_text[cursor : match.start()], context)
            segment = page_text[cursor : match.start()]
            # 有些 PDF 把“年份-卷种-分值”标签排在下一道【例】之前。若把
            # 这段前导文字直接归给上一题，上一题会偷走下一题的标签，而新题
            # 又会丢掉“设……”。按最后一个标签切开，并把其前导段挂到新题。
            prelude = ""
            tag_matches = list(EXAM_TAG_RE.finditer(segment))
            if tag_matches:
                last_tag = tag_matches[-1]
                active_has_tag = bool(active and EXAM_TAG_RE.search("\n".join(active.chunks)))
                leading_tag = bool(not segment[: last_tag.start()].strip())
                tag_is_new_question = last_tag.start() > 120 or (leading_tag and active_has_tag)
                if tag_is_new_question:
                    prelude = segment[last_tag.start() :]
                    segment = segment[: last_tag.start()]
            if active is not None:
                active.chunks.append(segment)
                active.end_page = page_number
                question = question_from_active(active, pdf_path, family, assets_url_prefix)
                if question:
                    questions.append(question)
            active = ActiveQuestion(
                example_no=int(match.group(1)),
                marker=match.group(0),
                start_page=page_number,
                context=context.copy(),
                lookbehind=(previous_tail + page_text[max(0, match.start() - 600) : match.start()])[-600:],
            )
            if prelude:
                active.chunks.append(prelude)
            elif not questions:
                # 少数版面把首个公式排在【例 N】之前（例如积分号在左栏、
                # 题号在右栏）。首题没有上一道题可归属，保留这段有效文字；
                # 标题和页码会在 remove_layout_noise 中被去掉。
                prefix_text = remove_layout_noise(segment)
                if prefix_text:
                    active.chunks.append(prefix_text)
            cursor = match.end()
        context = update_context(page_text[cursor:], context)
        if active is not None:
            active.chunks.append(page_text[cursor:])
            active.end_page = page_number
        previous_tail = page_text[-600:]

    if active is not None:
        question = question_from_active(active, pdf_path, family, assets_url_prefix)
        if question:
            questions.append(question)

    page_set: set[int] = set()
    for question in questions:
        page_set.update(range(int(question["sourcePage"]), int(question["sourcePageEnd"]) + 1))
    return questions, pages_count, page_set


def render_page(pdf_path: Path, page: int, assets_dir: Path) -> str:
    slug = source_slug(pdf_path)
    target_dir = assets_dir / slug
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"page-{page:04d}.png"
    if not target.exists():
        prefix = target.with_suffix("")
        run_command([
            "pdftoppm",
            "-f",
            str(page),
            "-l",
            str(page),
            "-png",
            "-gray",
            "-r",
            "160",
            "-singlefile",
            str(pdf_path),
            str(prefix),
        ])
    return f"past-exam-assets/classified-1987-2025/{slug}/page-{page:04d}.png"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="提取 1987—2025 真题候选题，不写题库")
    parser.add_argument("source_dir", nargs="?", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--pdf", action="append", type=Path, default=[], help="明确指定一个 PDF，可重复")
    parser.add_argument("--family", choices=["all", "high_math", "linear", "probability"], default="all")
    parser.add_argument("--limit", type=int, default=0, help="最多输出多少道题；0 表示全部")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--assets-dir", type=Path, default=DEFAULT_ASSETS_DIR)
    parser.add_argument("--render-pages", choices=["none", "question", "all"], default="question")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.limit < 0:
        raise RuntimeError("--limit 不能为负数")
    if not command_exists("pdfinfo") or not command_exists("pdftotext"):
        raise RuntimeError("缺少 pdfinfo 或 pdftotext，请先安装 Poppler。")
    if args.render_pages != "none" and not command_exists("pdftoppm"):
        raise RuntimeError("需要渲染原页图片，但未找到 pdftoppm。")

    source_dir = args.source_dir.resolve()
    pdfs = select_pdfs(source_dir, args.pdf, args.family)
    public_root = (ROOT / "public").resolve()
    try:
        assets_url_prefix = args.assets_dir.resolve().relative_to(public_root).as_posix()
    except ValueError as error:
        raise RuntimeError("--assets-dir 必须位于 public/ 下，才能生成可访问的 pageImage 路径。") from error
    all_questions: list[dict[str, Any]] = []
    page_sets: dict[Path, set[int]] = {}
    file_reports: list[dict[str, Any]] = []

    print(f"主来源 PDF：{len(pdfs)} 个")
    for index, pdf_path in enumerate(pdfs, start=1):
        print(f"[{index}/{len(pdfs)}] {pdf_path.relative_to(ROOT) if pdf_path.is_relative_to(ROOT) else pdf_path}")
        try:
            questions, pages_count, page_set = collect_questions(pdf_path, assets_url_prefix)
            all_questions.extend(questions)
            page_sets[pdf_path] = page_set
            file_reports.append({
                "sourcePdf": str(pdf_path.relative_to(ROOT).as_posix()) if pdf_path.is_relative_to(ROOT) else str(pdf_path),
                "family": family_for_path(pdf_path),
                "pages": pages_count,
                "candidateCount": len(questions),
                "questionPages": len(page_set),
                "status": "ok",
            })
            print(f"  候选题：{len(questions)}；题目页：{len(page_set)}")
        except Exception as error:
            file_reports.append({"sourcePdf": str(pdf_path), "status": "error", "error": str(error)})
            print(f"  ERROR: {error}", file=sys.stderr)

    if args.limit:
        all_questions = all_questions[: args.limit]
        allowed_ids = {question["id"] for question in all_questions}
        for pdf_path in list(page_sets):
            page_sets[pdf_path] = {
                page
                for question in all_questions
                if question["id"] in allowed_ids and question["sourcePdf"] == str(pdf_path.relative_to(ROOT).as_posix())
                for page in range(int(question["sourcePage"]), int(question["sourcePageEnd"]) + 1)
            }

    if args.render_pages != "none":
        for pdf_path, pages in page_sets.items():
            render_pages = range(1, pdf_page_count(pdf_path) + 1) if args.render_pages == "all" else sorted(pages)
            for page in render_pages:
                render_page(pdf_path, page, args.assets_dir.resolve())

    counts: dict[str, int] = {}
    flags: dict[str, int] = {}
    for question in all_questions:
        counts[question["type"]] = counts.get(question["type"], 0) + 1
        for flag in question["extraction"]["reviewFlags"]:
            flags[flag] = flags.get(flag, 0) + 1

    output = {
        "schemaVersion": 1,
        "generatedBy": "tools/extract_past_exam_questions.py",
        "sourceDir": str(source_dir),
        "sourcePolicy": "只扫描主来源 PDF；解析/做题本暂不作为重复题源",
        "yearRange": [1987, 2025],
        "status": "needs_review",
        "candidateCount": len(all_questions),
        "typeCounts": counts,
        "reviewFlagCounts": flags,
        "files": file_reports,
        "questions": all_questions,
    }
    output_path = args.output.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n生成 staging：{output_path}")
    print(f"候选题总数：{len(all_questions)}")
    print(f"题型统计：{json.dumps(counts, ensure_ascii=False)}")
    print(f"审核标记：{json.dumps(flags, ensure_ascii=False)}")
    print("未写入 SQLite；所有题目仍为 needs_review。")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

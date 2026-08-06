#!/usr/bin/env python3
"""批量把 PDF 转成适合导入的 Markdown。

这个脚本故意不把 PDF 中的数学字形“猜成”LaTeX。PDF 的文字层通常只保存
字形位置，不保存“这是分数/矩阵/上下标”的语义；直接转换很容易把公式弄坏。

脚本输出两层内容：

1. pdftotext -layout 提取的可检索文本；
2. 对疑似公式页/扫描页生成原页 PNG，并在 Markdown 中引用。

用 --page-images always 可以让每一页都带原页图，从而保证数学符号按原 PDF
显示。若以后接入 Mathpix、Pix2Text 等公式 OCR，可再把文本层中的公式替换为
LaTeX（$...$ 或 $$...$$），原页图仍然可以作为人工校对依据。
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
DEFAULT_SOURCE_DIR = REPO_ROOT / "data" / "（87-25）数学真题分类"


# Symbol/MT fonts frequently come out as Private Use Area characters such as
# \uf02d or \uf0ec.  These characters are useful as a signal that the page
# should have a visual fallback, but they are not safe to expose as the final
# mathematical representation.
PRIVATE_USE_RE = re.compile(r"[\ue000-\uf8ff\U000f0000-\U000ffffd]")
MATH_GLYPH_RE = re.compile(
    r"[∫∬∭∮∑∏√∞≤≥≠≈≡∈∉⊂⊆⊃⊇∪∩∅±∓×÷→←↔∀∃∂∇"
    r"αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ]"
)
FORMULA_SHAPE_RE = re.compile(
    r"(?:[A-Za-zα-ωΑ-Ω]\s*[=<>^_]"
    r"|[=<>]\s*[A-Za-z0-9α-ωΑ-Ω]"
    r"|[A-Za-z]{1,4}\s*\([^\n]{0,48}\)"
    r"|\d\s*\n\s*\d)"
)


@dataclass
class PageInfo:
    page: int
    text_chars: int
    image: str | None
    image_reasons: list[str]


@dataclass
class FileInfo:
    source_pdf: str
    markdown: str
    pages: int
    text_chars: int
    image_pages: list[int]
    empty_text_pages: list[int]
    formula_review_pages: list[int]
    status: str
    error: str | None = None


def command_exists(command: str) -> bool:
    return shutil.which(command) is not None


def run_command(args: list[str], *, cwd: Path | None = None) -> str:
    """运行外部命令并返回 stdout，失败时给出可读错误。"""

    result = subprocess.run(
        args,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        command = " ".join(args)
        raise RuntimeError(f"命令失败（退出码 {result.returncode}）：{command}\n{detail}")
    return result.stdout


def pdf_page_count(pdf_path: Path) -> int:
    info = run_command(["pdfinfo", str(pdf_path)])
    match = re.search(r"^Pages:\s+(\d+)\s*$", info, flags=re.MULTILINE)
    if not match:
        raise RuntimeError(f"pdfinfo 未找到页数：{pdf_path}")
    return int(match.group(1))


def extract_text(pdf_path: Path) -> str:
    # 保留版面布局，避免题号、选项和表格全部粘成一行。
    return run_command(
        ["pdftotext", "-layout", "-enc", "UTF-8", "-eol", "unix", str(pdf_path), "-"]
    )


def split_pages(raw_text: str, page_count: int) -> list[str]:
    """按 form-feed 分页，并对 PDF 末尾额外空页做容错。"""

    pages = raw_text.replace("\r\n", "\n").replace("\r", "\n").split("\f")
    while len(pages) > page_count and not pages[-1].strip():
        pages.pop()
    if len(pages) < page_count:
        pages.extend([""] * (page_count - len(pages)))
    elif len(pages) > page_count:
        # 极少数 PDF 的文字层会在页内带有额外 form-feed。不要丢掉尾部文本，
        # 将多出的片段并入最后一页。
        pages = pages[: page_count - 1] + ["\n\f\n".join(pages[page_count - 1 :])]
    return pages


def clean_page_text(text: str) -> str:
    """去掉分页边界上的空行，但保留题目内部的缩进和换行。"""

    text = text.replace("\x00", "")
    lines = text.splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines)


def page_review_reasons(text: str) -> list[str]:
    """判断一页是否值得生成原页图兜底。

    这是保守的启发式，不是公式识别器。fallback 模式只用于控制体积；要让
    每个公式都按原稿显示，请使用 --page-images always。
    """

    reasons: list[str] = []
    stripped = text.strip()
    if not stripped:
        reasons.append("文字层为空，可能是扫描页")
    if PRIVATE_USE_RE.search(text):
        reasons.append("包含 Symbol/私用区字形")
    if MATH_GLYPH_RE.search(text):
        reasons.append("包含数学专用符号")
    if FORMULA_SHAPE_RE.search(text):
        reasons.append("包含疑似公式布局")
    return reasons


def fence_for(text: str) -> str:
    """选择一个不会被文本内容提前关闭的 Markdown 波浪线围栏。"""

    runs = re.findall(r"~+", text)
    longest = max((len(run) for run in runs), default=0)
    return "~" * max(3, longest + 1)


def yaml_string(value: str) -> str:
    # JSON 字符串也是合法的 YAML 双引号字符串，能正确处理中文、引号和反斜杠。
    return json.dumps(value, ensure_ascii=False)


def md_destination(path: Path) -> str:
    """生成 Markdown 链接目标；带空格时使用尖括号。"""

    value = path.as_posix()
    return f"<{value}>" if any(char in value for char in " ()") else value


def markdown_image_destination(image_path: Path, markdown_path: Path) -> str:
    """生成相对于 Markdown 文件的图片路径。"""

    relative = Path(os.path.relpath(image_path, start=markdown_path.parent))
    return md_destination(relative)


def normalize_public_url_prefix(value: str) -> str:
    """规范化公共资源 URL 前缀，并拒绝会变成绝对地址的写法。"""

    prefix = str(value or "./").strip().replace("\\", "/")
    if not prefix:
        return "./"
    if prefix.startswith("/") or re.match(r"^[A-Za-z]:/", prefix) or "://" in prefix:
        raise ValueError("--public-url-prefix 必须是相对 URL，不能以 /、盘符或协议开头")

    normalized = posixpath.normpath(prefix)
    if normalized == ".":
        return "./"
    if normalized == ".." or normalized.startswith("../"):
        raise ValueError("--public-url-prefix 不能跳出公共资源目录")
    return normalized.rstrip("/") + "/"


def public_image_url(prefix: str, filename: str) -> str:
    normalized_prefix = normalize_public_url_prefix(prefix)
    return f"{normalized_prefix}{filename}"


def ascii_slug(value: str, fallback: str = "pdf-assets") -> str:
    """从目录名生成稳定的 ASCII 资源 ID。"""

    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(value)).strip("-_").lower()
    return slug or fallback


def render_page_image(pdf_path: Path, page: int, image_path: Path, dpi: int) -> None:
    image_path.parent.mkdir(parents=True, exist_ok=True)
    prefix = image_path.with_suffix("")
    run_command(
        [
            "pdftoppm",
            "-f",
            str(page),
            "-l",
            str(page),
            "-png",
            "-gray",
            "-r",
            str(dpi),
            "-singlefile",
            str(pdf_path),
            str(prefix),
        ]
    )
    if not image_path.exists() or image_path.stat().st_size == 0:
        raise RuntimeError(f"pdftoppm 没有生成图片：{image_path}")


def markdown_for_pdf(
    *,
    pdf_path: Path,
    source_dir: Path,
    output_dir: Path,
    page_count: int,
    raw_text: str,
    image_mode: str,
    dpi: int,
    generated_at: str,
    public_assets_dir: Path | None = None,
    public_url_prefix: str = "./",
) -> tuple[str, FileInfo, list[dict]]:
    relative_pdf = pdf_path.relative_to(source_dir)
    markdown_path = output_dir / relative_pdf.with_suffix(".md")
    local_asset_dir = (
        markdown_path.parent / f"{markdown_path.stem}_assets"
        if public_assets_dir is None
        else None
    )
    page_texts = [clean_page_text(page) for page in split_pages(raw_text, page_count)]

    relative_image_paths: dict[int, Path] = {}
    public_image_urls: dict[int, str] = {}
    page_infos: list[PageInfo] = []
    formula_review_pages: list[int] = []
    empty_text_pages: list[int] = []

    for page_number, page_text in enumerate(page_texts, start=1):
        reasons = page_review_reasons(page_text)
        if not page_text.strip():
            empty_text_pages.append(page_number)
        if reasons:
            formula_review_pages.append(page_number)

        should_render = image_mode == "always" or (image_mode == "fallback" and bool(reasons))
        if should_render:
            image_root = public_assets_dir or local_asset_dir
            if image_root is None:  # pragma: no cover - 仅为类型和未来改动兜底
                raise RuntimeError("没有可用的图片输出目录")
            image_path = image_root / f"page-{page_number:04d}.png"
            render_page_image(pdf_path, page_number, image_path, dpi)
            relative_image_paths[page_number] = image_path
            if public_assets_dir is not None:
                public_image_urls[page_number] = public_image_url(
                    public_url_prefix, image_path.name
                )

        page_infos.append(
            PageInfo(
                page=page_number,
                text_chars=len(page_text),
                image=markdown_image_destination(relative_image_paths[page_number], markdown_path)
                if page_number in relative_image_paths
                else None,
                image_reasons=reasons,
            )
        )

    lines = [
        "---",
        f"title: {yaml_string(pdf_path.stem)}",
        f"source_pdf: {yaml_string(relative_pdf.as_posix())}",
        f"pages: {page_count}",
        f"generated_at: {yaml_string(generated_at)}",
        'text_extractor: "pdftotext -layout -enc UTF-8"',
        f"page_image_mode: {image_mode}",
        f"page_image_dpi: {dpi}",
        'math_strategy: "文本层用于检索；公式以原页图为校对依据"',
        "---",
        "",
        f"# {pdf_path.stem}",
        "",
        "> 转换说明：本文件的文本层用于检索和后续切题，但 PDF 中的分式、矩阵、分段函数、上下标以及 Symbol 字体可能无法仅靠文字层准确还原。",
        "> 如果页面下方有“原始页面”图片，请以图片中的数学符号为准；需要可编辑公式时，再使用公式 OCR 转成 LaTeX。",
        "",
        f"> 源 PDF（相对源目录）：`{relative_pdf.as_posix()}`",
        "",
    ]

    for info, page_text in zip(page_infos, page_texts):
        lines.extend([f"## PDF 第 {info.page} 页", ""])
        if info.image:
            image_path = Path(info.image)
            lines.extend(
                [
                    f"### 原始页面（数学符号以此为准）",
                    "",
                    f"![PDF 第 {info.page} 页原始页面]({info.image})",
                    "",
                ]
            )
            if info.image_reasons:
                lines.append("> 生成原页图的原因：" + "；".join(info.image_reasons) + "。")
                lines.append("")

        lines.extend(["### 文本层（用于搜索/导入，公式可能失真）", ""])
        if page_text:
            fence = fence_for(page_text)
            lines.extend([f"{fence}text", page_text, fence, ""])
        else:
            lines.extend(["> 此页没有提取到文字层，请直接使用原页图或源 PDF。", ""])

    markdown = "\n".join(lines).rstrip() + "\n"
    file_info = FileInfo(
        source_pdf=relative_pdf.as_posix(),
        markdown=markdown_path.relative_to(output_dir).as_posix(),
        pages=page_count,
        text_chars=sum(len(page) for page in page_texts),
        image_pages=sorted(relative_image_paths),
        empty_text_pages=empty_text_pages,
        formula_review_pages=formula_review_pages,
        status="ok",
    )
    manifest_pages = [
        {
            "number": page_number,
            "text": page_text,
            "image": public_image_urls.get(page_number),
        }
        for page_number, page_text in enumerate(page_texts, start=1)
    ]
    return markdown, file_info, manifest_pages


def pdf_files(source_dir: Path) -> Iterable[Path]:
    return sorted(
        (path for path in source_dir.rglob("*") if path.is_file() and path.suffix.lower() == ".pdf"),
        key=lambda path: path.as_posix(),
    )


def select_pdf_files(source_dir: Path, selectors: list[str] | None) -> list[Path]:
    """按 --only 选择 PDF；支持源目录相对路径、仓库路径和唯一文件名。"""

    candidates = list(pdf_files(source_dir))
    if not selectors:
        return candidates

    by_path = {path.resolve(): path for path in candidates}
    selected: set[Path] = set()
    for raw_selector in selectors:
        selector = str(raw_selector).strip()
        if not selector:
            raise ValueError("--only 不能是空值")

        selector_path = Path(selector).expanduser()
        exact: list[Path] = []
        if selector_path.is_absolute():
            candidate = selector_path.resolve()
            if candidate in by_path:
                exact.append(by_path[candidate])
        else:
            for base in (source_dir, REPO_ROOT):
                candidate = (base / selector_path).resolve()
                if candidate in by_path and by_path[candidate] not in exact:
                    exact.append(by_path[candidate])

        normalized_selector = selector.replace("\\", "/").lstrip("./")
        relative_matches = [
            path
            for path in candidates
            if path.relative_to(source_dir).as_posix() == normalized_selector
            or path.name == selector
        ]
        matches = exact or relative_matches
        unique_matches = list(dict.fromkeys(matches))
        if not unique_matches:
            raise ValueError(f"--only 找不到源目录内的 PDF：{selector}")
        if len(unique_matches) > 1:
            choices = ", ".join(path.relative_to(source_dir).as_posix() for path in unique_matches)
            raise ValueError(f"--only 文件名不唯一，请使用相对路径：{selector}（{choices}）")
        selected.add(unique_matches[0])

    return [path for path in candidates if path in selected]


def write_public_manifest(
    *,
    manifest_dir: Path,
    pdf_path: Path,
    source_dir: Path,
    page_count: int,
    image_mode: str,
    dpi: int,
    generated_at: str,
    pages: list[dict],
) -> Path:
    """写入供静态预览页读取的单 PDF 页面清单。"""

    manifest = {
        "schemaVersion": 1,
        "id": ascii_slug(manifest_dir.name),
        "title": pdf_path.stem,
        "generatedAt": generated_at,
        "sourcePdf": pdf_path.relative_to(source_dir).as_posix(),
        "pageCount": page_count,
        "imageMode": image_mode,
        "imageDpi": dpi,
        "pages": pages,
    }
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="递归批量把 PDF 转为 Markdown，并为数学公式保留原页图兜底。"
    )
    parser.add_argument(
        "source_dir",
        nargs="?",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help=f"PDF 根目录（默认：{DEFAULT_SOURCE_DIR}）",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        help="Markdown 输出目录（默认：source_dir/markdown）",
    )
    parser.add_argument(
        "--page-images",
        choices=("never", "fallback", "always"),
        default="fallback",
        help="原页 PNG 策略：never=不生成，fallback=疑似公式/扫描页生成，always=每页生成（默认 fallback）",
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=160,
        help="原页 PNG 分辨率（默认 160；always 模式下页数多，建议 140-180）",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="只处理前 N 个 PDF，便于试跑；0 表示全部（默认 0）",
    )
    parser.add_argument(
        "--only",
        action="append",
        metavar="PDF",
        help="只处理指定 PDF；可重复传入，支持源目录相对路径或唯一文件名",
    )
    parser.add_argument(
        "--public-assets-dir",
        type=Path,
        help="把页面 PNG 生成到公共静态目录，并额外写入 manifest.json",
    )
    parser.add_argument(
        "--public-url-prefix",
        default="./",
        help="manifest 中图片 URL 的相对前缀（默认 ./，通常无需修改）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只检查依赖并列出 PDF，不写 Markdown 或图片",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    source_dir = args.source_dir.expanduser().resolve()
    output_dir = (args.output_dir or source_dir / "markdown").expanduser().resolve()
    public_assets_root = (
        args.public_assets_dir.expanduser().resolve()
        if args.public_assets_dir is not None
        else None
    )

    if args.dpi <= 0:
        print("--dpi 必须是正整数", file=sys.stderr)
        return 2
    try:
        public_url_prefix = normalize_public_url_prefix(args.public_url_prefix)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    if not source_dir.is_dir():
        print(f"源目录不存在：{source_dir}", file=sys.stderr)
        return 2

    required_commands = ["pdfinfo", "pdftotext"]
    if args.page_images != "never":
        required_commands.append("pdftoppm")
    missing = [command for command in required_commands if not command_exists(command)]
    if missing:
        print("缺少系统命令：" + ", ".join(missing), file=sys.stderr)
        return 2

    try:
        files = select_pdf_files(source_dir, args.only)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    if args.limit:
        files = files[: args.limit]
    if not files:
        print(f"没有找到 PDF：{source_dir}")
        return 0

    print(f"源目录：{source_dir}")
    print(f"输出目录：{output_dir}")
    print(f"PDF 数量：{len(files)}；图片策略：{args.page_images}；DPI：{args.dpi}")
    if args.only:
        print("指定文件：" + "、".join(args.only))
    if public_assets_root is not None:
        print(f"公共图片目录：{public_assets_root}；URL 前缀：{public_url_prefix}")

    if args.dry_run:
        for pdf_path in files:
            try:
                pages = pdf_page_count(pdf_path)
                print(f"  {pages:4d} 页  {pdf_path.relative_to(source_dir)}")
            except Exception as error:  # noqa: BLE001 - dry-run 要继续列出其他文件
                print(f"  ERROR   {pdf_path.relative_to(source_dir)}: {error}")
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(timezone.utc).isoformat()
    manifest_files: list[dict] = []
    failed = 0

    for index, pdf_path in enumerate(files, start=1):
        relative = pdf_path.relative_to(source_dir)
        print(f"[{index}/{len(files)}] {relative}")
        try:
            page_count = pdf_page_count(pdf_path)
            raw_text = extract_text(pdf_path)
            public_assets_dir = None
            if public_assets_root is not None:
                public_assets_dir = (
                    public_assets_root
                    if len(files) == 1
                    else public_assets_root / ascii_slug(pdf_path.stem)
                )
            markdown, file_info, manifest_pages = markdown_for_pdf(
                pdf_path=pdf_path,
                source_dir=source_dir,
                output_dir=output_dir,
                page_count=page_count,
                raw_text=raw_text,
                image_mode=args.page_images,
                dpi=args.dpi,
                generated_at=generated_at,
                public_assets_dir=public_assets_dir,
                public_url_prefix=public_url_prefix,
            )
            markdown_path = output_dir / file_info.markdown
            markdown_path.parent.mkdir(parents=True, exist_ok=True)
            markdown_path.write_text(markdown, encoding="utf-8")
            manifest_files.append(asdict(file_info))
            if public_assets_dir is not None:
                public_manifest_path = write_public_manifest(
                    manifest_dir=public_assets_dir,
                    pdf_path=pdf_path,
                    source_dir=source_dir,
                    page_count=page_count,
                    image_mode=args.page_images,
                    dpi=args.dpi,
                    generated_at=generated_at,
                    pages=manifest_pages,
                )
                print(f"  -> 公共清单：{public_manifest_path}")
            print(
                f"  -> {file_info.markdown} | {page_count} 页 | "
                f"原页图 {len(file_info.image_pages)} 页 | "
                f"疑似需校对 {len(file_info.formula_review_pages)} 页"
            )
        except Exception as error:  # noqa: BLE001 - 单个 PDF 失败不阻断批处理
            failed += 1
            file_info = FileInfo(
                source_pdf=relative.as_posix(),
                markdown="",
                pages=0,
                text_chars=0,
                image_pages=[],
                empty_text_pages=[],
                formula_review_pages=[],
                status="error",
                error=str(error),
            )
            manifest_files.append(asdict(file_info))
            print(f"  ERROR: {error}", file=sys.stderr)

    manifest = {
        "generated_at": generated_at,
        "source_dir": str(source_dir),
        "output_dir": str(output_dir),
        "image_mode": args.page_images,
        "image_dpi": args.dpi,
        "files": manifest_files,
    }
    manifest_path = output_dir / "_conversion-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    success = len(files) - failed
    print(f"完成：成功 {success} 个，失败 {failed} 个。")
    print(f"清单：{manifest_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

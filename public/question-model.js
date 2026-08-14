(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.QuestionModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FULL_WIDTH_LETTERS = "ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ";
  const ASCII_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const QUESTION_SCHEMA_VERSION = 19;
  const QUESTION_TYPES = new Set(["choice", "fill", "solution", "subjective"]);
  const QUESTION_CATEGORIES = new Set(["choice", "fill", "major"]);
  const PRACTICE_STATUSES = new Set(["needs_review", "published", "blocked"]);
  const PRACTICE_ERROR_TYPES = new Set(["concept", "condition", "method", "calculation", "expression", "modeling", "transfer"]);
  const TRAINING_LEVELS = new Set(["foundation", "same_type", "variation", "comprehensive"]);
  const TRAINING_LEVEL_SLOTS = [
    "foundation", "foundation", "same_type", "same_type", "same_type",
    "variation", "variation", "variation", "comprehensive", "comprehensive"
  ];
  const FORMULA_SYMBOLS = {
    "\\le": "≤", "\\leq": "≤", "\\ge": "≥", "\\geq": "≥", "\\ne": "≠",
    "\\times": "×", "\\cdot": "·", "\\div": "÷", "\\pm": "±", "\\infty": "∞",
    "\\sum": "Σ", "\\prod": "Π", "\\int": "∫", "\\partial": "∂", "\\nabla": "∇",
    "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\lambda": "λ",
    "\\mu": "μ", "\\pi": "π", "\\sigma": "σ", "\\theta": "θ", "\\phi": "φ",
    "\\omega": "ω", "\\to": "→", "\\rightarrow": "→", "\\leftarrow": "←",
    "\\in": "∈", "\\notin": "∉", "\\cup": "∪", "\\cap": "∩", "\\subset": "⊂",
    "\\subseteq": "⊆", "\\approx": "≈", "\\equiv": "≡", "\\ldots": "…", "\\cdots": "⋯"
  };

  function asText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function asArray(value) {
    if (Array.isArray(value)) return value.map(asText).filter(Boolean);
    return asText(value).split("|").map((item) => item.trim()).filter(Boolean);
  }

  function dedupe(values) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map(asText).filter(Boolean)));
  }

  function normalizeLetter(value) {
    const raw = asText(value).toUpperCase();
    const fullWidthIndex = FULL_WIDTH_LETTERS.indexOf(raw);
    if (fullWidthIndex >= 0) return ASCII_LETTERS[fullWidthIndex];
    return raw;
  }

  function normalizeText(value) {
    return asText(value)
      .replace(/\s+/g, "")
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .replace(/［/g, "[")
      .replace(/］/g, "]")
      .replace(/，/g, ",")
      .replace(/：/g, ":")
      .replace(/＋/g, "+")
      .replace(/－/g, "-")
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .toLowerCase();
  }

  function keyFromValue(value) {
    const raw = asText(value);
    const match = raw.match(/^\s*(?:选项|答案)?\s*[（(]?\s*([A-Za-zＡ-Ｚａ-ｚ])\s*[)）]?\s*$/);
    if (!match) return "";
    const key = normalizeLetter(match[1]);
    return /^[A-Z]$/.test(key) ? key : "";
  }

  function splitOptionLabel(value) {
    const raw = asText(value);
    const match = raw.match(/^\s*[（(]?\s*([A-Za-zＡ-Ｚａ-ｚ])\s*(?:[)）]|[.．、:：-])\s*(.*)$/s);
    if (!match) return { key: "", text: raw };
    const key = normalizeLetter(match[1]);
    return { key: /^[A-Z]$/.test(key) ? key : "", text: asText(match[2]) };
  }

  function normalizeChoiceOption(option, index = 0) {
    if (option && typeof option === "object" && !Array.isArray(option)) {
      const raw = asText(option.raw || option.value || option.text || option.content);
      const label = splitOptionLabel(raw);
      const key = keyFromValue(option.key || option.id || option.label) || label.key || ASCII_LETTERS[index] || String(index + 1);
      const explicitText = option.text ?? option.content;
      const text = explicitText === undefined || explicitText === null
        ? (label.key ? label.text : asText(option.value))
        : asText(explicitText);
      return {
        key,
        text: text === key ? "" : text,
        raw: raw || (key && text ? `${key}. ${text}` : text || key)
      };
    }
    const raw = asText(option);
    const label = splitOptionLabel(raw);
    const key = label.key || keyFromValue(raw) || ASCII_LETTERS[index] || String(index + 1);
    const text = label.key ? label.text : keyFromValue(raw) ? "" : raw;
    return { key, text: text === key ? "" : text, raw: raw || key };
  }

  function choiceOptions(question = {}) {
    const source = Array.isArray(question.choiceOptions)
      ? question.choiceOptions
      : Array.isArray(question.options)
        ? question.options
        : (Array.isArray(question.choice?.options) ? question.choice.options : []);
    return source.map((option, index) => normalizeChoiceOption(option, index));
  }

  function choiceAnswerKey(question = {}, value) {
    const options = choiceOptions(question);
    const objectValue = value && typeof value === "object" ? value : {};
    const explicitKey = keyFromValue(objectValue.key || objectValue.optionKey || objectValue.letter);
    if (explicitKey && (!options.length || options.some((option) => option.key === explicitKey))) return explicitKey;

    const raw = asText(objectValue.text || objectValue.value || value);
    const directKey = keyFromValue(raw);
    if (directKey && (!options.length || options.some((option) => option.key === directKey))) return directKey;

    const normalizedRaw = normalizeText(raw);
    if (!normalizedRaw) return "";
    const match = options.find((option) => (
      normalizeText(option.raw) === normalizedRaw
      || normalizeText(option.text) === normalizedRaw
      || (option.text && normalizeText(option.text) === normalizeText(splitOptionLabel(raw).text))
    ));
    return match?.key || "";
  }

  function choiceSelection(question = {}, value) {
    const options = choiceOptions(question);
    const key = choiceAnswerKey(question, value);
    const option = options.find((item) => item.key === key);
    const raw = asText(value && typeof value === "object" ? value.text || value.value : value);
    return {
      key,
      text: option ? (option.text || (option.raw === option.key ? "" : option.raw)) : raw,
      raw: raw || option?.raw || key
    };
  }

  function choiceSpec(question = {}) {
    const options = choiceOptions(question);
    const answerKey = choiceAnswerKey(question, question.answer);
    const answer = options.find((option) => option.key === answerKey);
    return {
      options,
      answerKey,
      answerText: answer?.text || (answer && answer.raw !== answer.key ? answer.raw : "")
    };
  }

  function canonicalAnswer(question = {}, value) {
    if (question.type === "choice" || question.questionType === "choice") {
      return choiceAnswerKey(question, value) || asText(value && typeof value === "object" ? value.text || value.value : value);
    }
    return asText(value);
  }

  function escapeHtml(value) {
    return asText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formulaFormat(value, explicit = "") {
    if (explicit) return explicit;
    const raw = asText(value);
    return /\\[a-zA-Z]+|\$|\^\{|_\{/.test(raw) ? "latex" : "text";
  }

  function renderLegacyFormulaText(value) {
    let html = escapeHtml(value);
    if (!html) return "";
    html = html.replace(/\$([^$]*)\$/g, "$1");
    html = html.replace(/\\(?:left|right)\s*/g, "");
    html = html.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '<span class="math-fraction"><span>$1</span><span>$2</span></span>');
    html = html.replace(/\\sqrt\{([^{}]*)\}/g, '<span class="math-root">√<span>$1</span></span>');
    html = html.replace(/\\text\{([^{}]*)\}/g, "$1");
    Object.entries(FORMULA_SYMBOLS).forEach(([command, symbol]) => {
      html = html.replace(new RegExp(command.replace("\\", "\\\\") + "\\s*", "g"), symbol);
    });
    html = html.replace(/\^\{([^{}]+)\}/g, "<sup>$1</sup>");
    html = html.replace(/_\{([^{}]+)\}/g, "<sub>$1</sub>");
    html = html.replace(/\^((?:\([^()]*\))|(?:[A-Za-z0-9+\-−]+))/g, "<sup>$1</sup>");
    html = html.replace(/_([A-Za-z0-9]+)(?![A-Za-z0-9])/g, "<sub>$1</sub>");
    html = html.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾ⁿ]+)/g, (value) => `<sup>${value}</sup>`);
    return `<span class="math-text">${html.replace(/\r?\n/g, "<br>")}</span>`;
  }

  function katexRenderer() {
    const candidate = typeof globalThis !== "undefined" ? globalThis.katex : null;
    return candidate && typeof candidate.renderToString === "function" ? candidate : null;
  }

  function renderKatexSource(source, displayMode, katex) {
    try {
      return katex.renderToString(source, {
        displayMode,
        throwOnError: true,
        strict: "ignore",
        trust: false,
        output: "htmlAndMathml"
      });
    } catch (error) {
      return `<span class="formula-fallback" title="公式解析失败">${escapeHtml(source)}</span>`;
    }
  }

  function renderKatexFormulaText(value, explicitFormat = "") {
    const raw = asText(value);
    const katex = katexRenderer();
    if (!raw || !katex) return "";

    const delimiterPattern = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\r\n]+?\$)/g;
    let cursor = 0;
    let found = false;
    let html = "";
    raw.replace(delimiterPattern, (match, _capture, offset) => {
      found = true;
      html += escapeHtml(raw.slice(cursor, offset)).replace(/\r?\n/g, "<br>");
      const isDisplay = match.startsWith("$$") || match.startsWith("\\[");
      const source = isDisplay
        ? match.slice(2, -2)
        : match.startsWith("\\(")
          ? match.slice(2, -2)
          : match.slice(1, -1);
      html += renderKatexSource(source, isDisplay, katex);
      cursor = offset + match.length;
      return match;
    });

    if (found) {
      html += escapeHtml(raw.slice(cursor)).replace(/\r?\n/g, "<br>");
      return `<span class="math-text">${html}</span>`;
    }

    const format = asText(explicitFormat).toLowerCase();
    const looksLikeLatex = format === "latex" || /\\[a-zA-Z]+|\^\{|_\{/.test(raw);
    return looksLikeLatex ? `<span class="math-text">${renderKatexSource(raw, true, katex)}</span>` : "";
  }

  function renderFormulaText(value, explicitFormat = "") {
    const raw = asText(value);
    if (!raw) return "";
    const rendered = renderKatexFormulaText(raw, explicitFormat);
    return rendered || renderLegacyFormulaText(raw);
  }

  function normalizedType(raw = {}) {
    const direct = asText(raw.type || raw.questionType).toLowerCase();
    if (QUESTION_TYPES.has(direct)) return { type: direct, reason: asText(raw.reason) };
    const reason = asText(raw.reason).toLowerCase();
    if (QUESTION_TYPES.has(reason)) return { type: reason, reason: asText(raw.type || "待标注") };
    const options = Array.isArray(raw.options) ? raw.options : raw.choiceOptions;
    if (Array.isArray(options) && options.length >= 2) return { type: "choice", reason: asText(raw.reason || "待标注") };
    return { type: direct || "subjective", reason: asText(raw.reason || "待标注") };
  }

  function questionCategoryForType(type) {
    if (type === "choice") return "choice";
    if (type === "fill") return "fill";
    return "major";
  }

  function questionCategoryLabel(category) {
    if (category === "choice") return "选择题";
    if (category === "fill") return "填空题";
    return "大题";
  }

  function practiceErrorTypeCode(value) {
    const raw = asText(value);
    const direct = raw.toLowerCase().replace(/[\s-]/g, "_");
    if (PRACTICE_ERROR_TYPES.has(direct)) return direct;
    if (/知识|概念|定义|理解|记忆/.test(raw)) return "concept";
    if (/条件|审题|遗漏|范围|限制/.test(raw)) return "condition";
    if (/方法|公式|换元|分部|选择|路径/.test(raw)) return "method";
    if (/计算|运算|符号|化简|展开|求导/.test(raw)) return "calculation";
    if (/表达|书写|格式|常数|不完整/.test(raw)) return "expression";
    if (/建模|利润|数量关系|应用题/.test(raw)) return "modeling";
    if (/能力|综合|迁移|应用|题型|转化/.test(raw)) return "transfer";
    if (/易错|易混|陷阱|真题|专项/.test(raw)) return "transfer";
    return "";
  }

  function practiceErrorTypes(raw = {}) {
    const meta = raw.practiceMeta && typeof raw.practiceMeta === "object" ? raw.practiceMeta : {};
    const values = meta.errorTypes
      || raw.errorTypes
      || raw.errorTypeCodes
      || raw.errorType
      || raw.reason
      || "";
    return dedupe(asArray(values).map(practiceErrorTypeCode).filter(Boolean));
  }

  function inferTrainingLevel(raw = {}, difficulty = 3) {
    const meta = raw.practiceMeta && typeof raw.practiceMeta === "object" ? raw.practiceMeta : {};
    const explicit = asText(meta.trainingLevel || raw.trainingLevel).toLowerCase();
    if (TRAINING_LEVELS.has(explicit)) return explicit;
    if (/基础|入门/.test(asText(raw.level))) return "foundation";
    if (/变式|拓展/.test(asText(raw.level))) return "variation";
    if (/综合|迁移|压轴/.test(asText(raw.level))) return "comprehensive";
    if (Number(difficulty) <= 2) return "foundation";
    if (Number(difficulty) >= 5) return "comprehensive";
    if (Number(difficulty) >= 4) return "variation";
    return "same_type";
  }

  function inferredPracticeStatus(raw = {}, { id = "", answer = "", explanation = "", options = [], type = "" } = {}) {
    const meta = raw.practiceMeta && typeof raw.practiceMeta === "object" ? raw.practiceMeta : {};
    const explicit = asText(meta.status || raw.practiceStatus).toLowerCase();
    if (explicit === "trial") return "needs_review";
    if (PRACTICE_STATUSES.has(explicit)) return explicit;
    if (String(id).startsWith("gen_") || raw.generatedFrom) return "needs_review";

    const reviewText = [raw.reviewStatus, raw.answerStatus, raw.publishStatus].map(asText).join(" ");
    const reviewed = !/(pending|待|草稿|draft|trial|未审核|未校对)/i.test(reviewText);
    const answerReady = Boolean(answer) && Boolean(explanation)
      && (type !== "choice" || options.length >= 2);
    const curatedId = /^(q_|exam_|subjective_|past_)/i.test(String(id));
    const pastExamReviewed = raw.sourceType === "past_exam"
      && raw.publishStatus === "published"
      && raw.answerStatus === "reviewed";
    return reviewed && answerReady && (pastExamReviewed || curatedId) ? "published" : "needs_review";
  }

  function normalizePracticeMeta(raw = {}, context = {}) {
    const meta = raw.practiceMeta && typeof raw.practiceMeta === "object" ? raw.practiceMeta : {};
    const point = asText(context.point || raw.point || raw.knowledgePoint || raw.subKnowledgePoint);
    const sectionId = asText(context.sectionId || raw.sectionId || raw.chapterId);
    const knowledgePointId = asText(meta.knowledgePointId || raw.knowledgePointId || (sectionId && point ? `${sectionId}:${point.replace(/\s+/g, "")}` : ""));
    const knowledgePointName = asText(meta.knowledgePointName || raw.knowledgePointName || point);
    const difficulty = Number(context.difficulty || raw.difficulty || raw.difficultyLevel || 3);
    const type = asText(context.type || raw.type || raw.questionType);
    const answer = asText(context.answer || raw.answer || raw.answerSpec?.value);
    const explanation = asText(context.explanation || raw.explanation || raw.solution?.explanation || raw.content?.explanation?.value);
    const options = Array.isArray(context.options) ? context.options : (Array.isArray(raw.options) ? raw.options : []);
    const status = inferredPracticeStatus(raw, { id: asText(raw.id), answer, explanation, options, type });
    return {
      status,
      knowledgePointId,
      knowledgePointName,
      errorTypes: practiceErrorTypes({ ...raw, practiceMeta: { ...meta, errorTypes: meta.errorTypes || raw.errorTypes || raw.errorTypeCodes || raw.errorType || raw.reason } }),
      trainingLevel: inferTrainingLevel(raw, difficulty),
      similarGroupId: asText(meta.similarGroupId || raw.similarGroupId),
      reviewer: asText(meta.reviewer || raw.reviewer),
      reviewedAt: asText(meta.reviewedAt || raw.reviewedAt)
    };
  }

  function questionSection(raw = {}) {
    const section = raw.section && typeof raw.section === "object" ? raw.section : {};
    const id = asText(raw.sectionId || section.id || raw.chapterId || raw.chapter?.id);
    const name = asText(raw.sectionName || section.name || raw.chapterName || raw.chapter?.name);
    const groupId = asText(raw.sectionGroupId || section.groupId || raw.chapterGroupId || raw.groupId);
    const groupName = asText(raw.sectionGroupName || section.groupName || raw.chapterGroupName || raw.groupName);
    return { id, name, groupId, groupName, order: Number(raw.sectionOrder || section.order || raw.syllabusOrder || 0) };
  }

  function questionSource(raw = {}) {
    const source = raw.sourceSpec && typeof raw.sourceSpec === "object"
      ? raw.sourceSpec
      : raw.source && typeof raw.source === "object" ? raw.source : {};
    return {
      type: asText(raw.sourceType || source.type || "teacher_original"),
      name: asText(raw.sourceName || source.name || (typeof raw.source === "string" ? raw.source : "")),
      book: asText(raw.sourceBook || source.book || raw.book),
      section: asText(raw.sourceSection || source.section || raw.bookSection),
      year: Number(raw.sourceYear || source.year || 0) || null,
      mathType: asText(raw.sourceMathType || source.mathType),
      questionNo: asText(raw.sourceQuestionNo || source.questionNo || raw.problemNo),
      page: Number(raw.sourcePage || source.page || 0) || null,
      pageImage: asText(raw.sourcePageImage || source.pageImage),
      stemImage: asText(raw.stemImage || source.stemImage)
    };
  }

  function normalizeQuestion(raw = {}) {
    const typeInfo = normalizedType(raw);
    const questionCategory = questionCategoryForType(typeInfo.type);
    const section = questionSection(raw);
    const source = questionSource(raw);
    const options = Array.isArray(raw.options)
      ? raw.options
      : (Array.isArray(raw.choiceOptions) ? raw.choiceOptions : []);
    const answer = asText(raw.answer ?? raw.answerSpec?.value);
    const aliases = asArray(raw.aliases || raw.answerSpec?.aliases);
    const stem = asText(raw.stem ?? raw.content?.stem?.value ?? raw.title);
    const formula = asText(raw.formula ?? raw.content?.formula?.value);
    const explanation = asText(raw.explanation ?? raw.solution?.explanation ?? raw.content?.explanation?.value);
    const normalized = {
      ...raw,
      schemaVersion: QUESTION_SCHEMA_VERSION,
      id: asText(raw.id),
      subjects: asArray(raw.subjects || raw.mathTypes || raw.subject),
      sectionId: section.id,
      sectionName: section.name,
      section,
      chapterId: section.id,
      chapterName: section.name,
      chapterGroupId: section.groupId,
      chapterGroupName: section.groupName,
      syllabusOrder: section.order,
      point: asText(raw.point || raw.knowledgePoint || raw.subKnowledgePoint || "待标注"),
      reason: typeInfo.reason || "待标注",
      type: typeInfo.type,
      questionType: typeInfo.type,
      questionCategory,
      questionCategoryLabel: questionCategoryLabel(questionCategory),
      level: asText(raw.level || raw.difficultyLabel || "待分层"),
      difficulty: Math.max(1, Math.min(5, Number(raw.difficulty || raw.difficultyLevel || 3))),
      stem,
      stemFormat: formulaFormat(stem, raw.stemFormat || raw.content?.stem?.format || (raw.stemHtml ? "html" : "text")),
      formula,
      formulaFormat: formulaFormat(formula, raw.formulaFormat || raw.content?.formula?.format || ""),
      options,
      choiceOptions: typeInfo.type === "choice" ? choiceOptions({ options }) : [],
      answer,
      aliases,
      answerSpec: {
        value: answer,
        aliases,
        optionKey: typeInfo.type === "choice" ? choiceAnswerKey({ type: "choice", options }, answer) : "",
        format: formulaFormat(answer, raw.answerFormat || raw.answerSpec?.format || "text")
      },
      content: {
        stem: { value: stem, format: raw.stemHtml ? "html" : formulaFormat(stem, raw.stemFormat || raw.content?.stem?.format || "") },
        formula: { value: formula, format: formulaFormat(formula, raw.formulaFormat || raw.content?.formula?.format || "") },
        explanation: { value: explanation, format: formulaFormat(explanation, raw.explanationFormat || raw.content?.explanation?.format || "") }
      },
      explanation,
      solution: {
        explanation,
        detailed: raw.detailedSolution || raw.solution?.detailed || null,
        scoringPoints: Array.isArray(raw.scoringPoints) ? raw.scoringPoints : []
      },
      sourceSpec: source,
      sourceType: source.type,
      source: asText(typeof raw.source === "string" ? raw.source : source.name),
      sourceName: source.name,
      sourceBook: source.book,
      sourceSection: source.section,
      sourceYear: source.year,
      sourceMathType: source.mathType,
      sourceQuestionNo: source.questionNo,
      sourcePage: source.page,
      sourcePageImage: source.pageImage,
      stemImage: source.stemImage || asText(raw.stemImage)
    };
    normalized.practiceMeta = normalizePracticeMeta(raw, {
      sectionId: section.id,
      point: normalized.point,
      type: normalized.type,
      difficulty: normalized.difficulty,
      answer: normalized.answer,
      explanation: normalized.explanation,
      options
    });
    normalized.practiceStatus = normalized.practiceMeta.status;
    normalized.knowledgePointId = normalized.practiceMeta.knowledgePointId;
    normalized.knowledgePointName = normalized.practiceMeta.knowledgePointName;
    normalized.errorTypes = normalized.practiceMeta.errorTypes;
    normalized.trainingLevel = normalized.practiceMeta.trainingLevel;
    normalized.similarGroupId = normalized.practiceMeta.similarGroupId;
    return normalized;
  }

  function normalizeQuestionList(list) {
    return (Array.isArray(list) ? list : []).map(normalizeQuestion);
  }

  function queryQuestions(list, filters = {}) {
    const sectionIds = filters.sectionIds == null ? null : new Set(asArray(filters.sectionIds));
    const subjects = new Set(asArray(filters.subjects));
    const types = filters.types == null ? null : new Set(asArray(filters.types));
    const sourceType = asText(filters.sourceType || "all");
    const difficulty = asText(filters.difficulty || "all");
    const practiceStatus = asText(filters.practiceStatus || "all");
    return normalizeQuestionList(list).filter((question) => {
      if (sectionIds && !sectionIds.has(question.sectionId)) return false;
      if (subjects.size && !question.subjects.some((item) => subjects.has(item))) return false;
      if (types && !types.has(question.type)) return false;
      if (sourceType !== "all" && question.sourceSpec.type !== sourceType) return false;
      if (!['all', 'mode', ''].includes(difficulty) && String(question.difficulty) !== difficulty && !question.level.includes(difficulty)) return false;
      if (practiceStatus !== "all" && question.practiceMeta.status !== practiceStatus) return false;
      return true;
    });
  }

  function isPracticeQuestionReady(question = {}) {
    const normalized = question.practiceMeta ? question : normalizeQuestion(question);
    const answer = asText(normalized.answer || normalized.answerSpec?.value);
    const placeholder = /(待标注|待校对|待审核|草稿|占位|placeholder|请对照原页|答案生成中)/i;
    const allowUnreviewedPastExam = normalized.sourceType === "past_exam"
      && normalized.allowUnreviewedPractice === true;
    if (!allowUnreviewedPastExam && normalized.practiceMeta?.status !== "published") return false;
    if (!normalized.id || !normalized.sectionId || !normalized.stem || placeholder.test(normalized.stem)) return false;
    if (!normalized.practiceMeta.knowledgePointId || !normalized.practiceMeta.knowledgePointName) return false;
    if (!normalized.practiceMeta.errorTypes?.length) return false;
    if (!allowUnreviewedPastExam && (!answer || placeholder.test(answer))) return false;
    if (!allowUnreviewedPastExam && (!normalized.explanation || placeholder.test(normalized.explanation))) return false;
    if (normalized.type === "choice") {
      if (normalized.choiceOptions.length < 2) return false;
      if (!allowUnreviewedPastExam && !normalized.answerSpec.optionKey) return false;
    }
    if (!allowUnreviewedPastExam && normalized.sourceType === "past_exam" && normalized.answerStatus && !/reviewed/i.test(normalized.answerStatus)) return false;
    if (!allowUnreviewedPastExam && /(pending|待|草稿|draft|trial|未审核|未校对)/i.test(`${normalized.reviewStatus || ""} ${normalized.answerStatus || ""}`)) return false;
    return true;
  }

  function trainingLevelSlots(count = 10) {
    return TRAINING_LEVEL_SLOTS.slice(0, Math.max(0, Number(count) || 0));
  }

  function hashValue(value) {
    let result = 2166136261;
    for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
    return result >>> 0;
  }

  function stemKey(question) {
    return normalizeText(`${question.sectionId || question.chapterId}:${question.stem || question.title}`);
  }

  function overlap(left = [], right = []) {
    const rightSet = new Set(right);
    return left.some((item) => rightSet.has(item));
  }

  function similarityRank(candidate, source) {
    const candidateMeta = candidate.practiceMeta || {};
    const sourceMeta = source.practiceMeta || {};
    const sameKnowledge = Boolean(candidateMeta.knowledgePointId && sourceMeta.knowledgePointId
      && candidateMeta.knowledgePointId === sourceMeta.knowledgePointId)
      || (normalizeText(candidateMeta.knowledgePointName) && normalizeText(candidateMeta.knowledgePointName) === normalizeText(sourceMeta.knowledgePointName));
    const sameGroup = Boolean(candidateMeta.similarGroupId && sourceMeta.similarGroupId
      && candidateMeta.similarGroupId === sourceMeta.similarGroupId);
    const sameType = candidate.type === source.type;
    const sameSection = Boolean(candidate.sectionId && source.sectionId && candidate.sectionId === source.sectionId);
    const sameSubject = !source.subjects?.length || !candidate.subjects?.length
      || candidate.subjects.some((item) => source.subjects.includes(item));
    const sameError = overlap(candidateMeta.errorTypes || [], sourceMeta.errorTypes || []);
    if (sameGroup && sameKnowledge && sameType) return { rank: 0, tier: "same_group" };
    if (sameKnowledge && sameType && sameError) return { rank: 1, tier: "knowledge_type_error" };
    if (sameKnowledge && sameType) return { rank: 2, tier: "knowledge_type" };
    if (sameSection && sameType && sameError) return { rank: 3, tier: "section_type_error" };
    if (sameSection && sameType) return { rank: 4, tier: "section_type" };
    if (sameSubject && sameType && sameError) return { rank: 5, tier: "subject_type_error" };
    if (sameSubject && sameType) return { rank: 6, tier: "subject_type" };
    return null;
  }

  function selectSimilarQuestions(list, sourceQuestion, options = {}) {
    const source = sourceQuestion?.practiceMeta ? sourceQuestion : normalizeQuestion(sourceQuestion || {});
    const count = Math.max(0, Number(options.count || 10));
    const levels = Array.isArray(options.targetLevels) && options.targetLevels.length
      ? options.targetLevels
      : trainingLevelSlots(count);
    const excluded = new Set([source.id, ...(asArray(options.excludeIds)), ...(asArray(options.usedQuestionIds))].filter(Boolean));
    const subject = asText(options.subject || options.studentSubject);
    const seenStems = new Set();
    const candidates = normalizeQuestionList(list)
      .filter(isPracticeQuestionReady)
      .filter((question) => !excluded.has(question.id))
      .filter((question) => !subject || !question.subjects.length || question.subjects.includes(subject))
      .map((question) => ({ question, match: similarityRank(question, source) }))
      .filter((entry) => entry.match)
      .filter((entry) => {
        const candidateMeta = entry.question.practiceMeta || {};
        const sourceMeta = source.practiceMeta || {};
        const sameSection = Boolean(entry.question.sectionId && source.sectionId && entry.question.sectionId === source.sectionId);
        const sameKnowledge = Boolean(candidateMeta.knowledgePointId && sourceMeta.knowledgePointId
          && candidateMeta.knowledgePointId === sourceMeta.knowledgePointId)
          || (normalizeText(candidateMeta.knowledgePointName) && normalizeText(candidateMeta.knowledgePointName) === normalizeText(sourceMeta.knowledgePointName));
        return sameSection || sameKnowledge;
      })
      .filter((entry) => {
        const key = stemKey(entry.question);
        if (seenStems.has(key)) return false;
        seenStems.add(key);
        return true;
      });
    const selected = [];
    const selectedIds = new Set();
    levels.slice(0, count).forEach((targetLevel, index) => {
      const available = candidates.filter((entry) => !selectedIds.has(entry.question.id));
      if (!available.length) return;
      const sorted = available.sort((left, right) => {
        const leftDistance = Math.abs(Number(left.question.difficulty || 3) - difficultyForTrainingLevel(targetLevel));
        const rightDistance = Math.abs(Number(right.question.difficulty || 3) - difficultyForTrainingLevel(targetLevel));
        return left.match.rank - right.match.rank
          || leftDistance - rightDistance
          || hashValue(`${options.seed || "similar"}:${index}:${left.question.id}`) - hashValue(`${options.seed || "similar"}:${index}:${right.question.id}`)
          || left.question.id.localeCompare(right.question.id);
      });
      const picked = sorted[0];
      selectedIds.add(picked.question.id);
      selected.push({
        question: picked.question,
        targetLevel,
        matchRank: picked.match.rank,
        matchTier: picked.match.tier
      });
    });
    return {
      selected,
      questions: selected.map((entry) => entry.question),
      availableCount: candidates.length,
      shortage: Math.max(0, count - selected.length),
      candidateCount: candidates.length,
      matchTiers: selected.reduce((map, item) => {
        map[item.matchTier] = (map[item.matchTier] || 0) + 1;
        return map;
      }, {})
    };
  }

  function difficultyForTrainingLevel(level) {
    return { foundation: 1.5, same_type: 3, variation: 4, comprehensive: 5 }[level] || 3;
  }

  function trainingReveal(question = {}) {
    const normalized = question.practiceMeta ? question : normalizeQuestion(question);
    const choice = normalized.type === "choice" ? choiceSpec(normalized) : null;
    const standardAnswer = choice?.answerKey
      ? `${choice.answerKey}${choice.answerText ? `. ${choice.answerText}` : ""}`
      : normalized.answer;
    return {
      standardAnswer,
      answer: normalized.answer,
      answerSpec: { ...normalized.answerSpec, aliases: normalized.aliases },
      explanation: normalized.explanation,
      solution: normalized.solution || { explanation: normalized.explanation, detailed: null },
      knowledgePoint: normalized.practiceMeta.knowledgePointName || normalized.point
    };
  }

  function publicTrainingQuestion(question = {}) {
    const normalized = question.practiceMeta ? question : normalizeQuestion(question);
    return {
      id: normalized.id,
      questionId: normalized.questionId || normalized.id,
      bankQuestionId: normalized.bankQuestionId || normalized.sourceQuestionId || normalized.id,
      index: normalized.index,
      type: normalized.type,
      questionType: normalized.type,
      questionCategory: normalized.questionCategory || questionCategoryForType(normalized.type),
      questionCategoryLabel: normalized.questionCategoryLabel || questionCategoryLabel(normalized.questionCategory || questionCategoryForType(normalized.type)),
      typeLabel: normalized.questionCategoryLabel || questionCategoryLabel(normalized.questionCategory || questionCategoryForType(normalized.type)),
      stem: normalized.stem,
      stemFormat: normalized.stemFormat,
      formula: normalized.formula,
      formulaFormat: normalized.formulaFormat,
      options: normalized.options || [],
      choiceOptions: normalized.choiceOptions || [],
      level: normalized.level,
      difficulty: normalized.difficulty,
      difficultyLevel: normalized.difficulty,
      trainingLevel: normalized.trainingLevel || normalized.practiceMeta.trainingLevel,
      trainingPurpose: normalized.trainingPurpose || "相似题训练",
      knowledgePoint: normalized.knowledgePoint || normalized.practiceMeta.knowledgePointName || normalized.point,
      subKnowledgePoint: normalized.subKnowledgePoint || normalized.practiceMeta.knowledgePointName || normalized.point,
      sectionId: normalized.sectionId,
      chapterId: normalized.chapterId,
      chapterName: normalized.chapterName,
      sourceErrorType: normalized.sourceErrorType || normalized.reason,
      matchTier: normalized.matchTier || "",
      matchRank: normalized.matchRank ?? null
    };
  }

  function publicTrainingBatch(batch = {}) {
    const { questions, ...metadata } = batch;
    return {
      ...metadata,
      questions: (Array.isArray(questions) ? questions : []).map(publicTrainingQuestion)
    };
  }

  return {
    QUESTION_SCHEMA_VERSION,
    QUESTION_TYPES: Array.from(QUESTION_TYPES),
    PRACTICE_STATUSES: Array.from(PRACTICE_STATUSES),
    PRACTICE_ERROR_TYPES: Array.from(PRACTICE_ERROR_TYPES),
    TRAINING_LEVELS: Array.from(TRAINING_LEVELS),
    TRAINING_LEVEL_SLOTS,
    normalizeText,
    escapeHtml,
    renderFormulaText,
    formulaFormat,
    normalizeChoiceOption,
    choiceOptions,
    choiceAnswerKey,
    choiceSelection,
    choiceSpec,
    canonicalAnswer,
    questionSection,
    questionSource,
    normalizeQuestion,
    normalizeQuestionList,
    queryQuestions,
    QUESTION_CATEGORIES: Array.from(QUESTION_CATEGORIES),
    questionCategoryForType,
    questionCategoryLabel,
    practiceErrorTypeCode,
    practiceErrorTypes,
    normalizePracticeMeta,
    isPracticeQuestionReady,
    trainingLevelSlots,
    selectSimilarQuestions,
    trainingReveal,
    publicTrainingQuestion,
    publicTrainingBatch
  };
});

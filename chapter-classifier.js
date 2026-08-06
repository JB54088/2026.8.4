(function initChapterClassifier(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChapterClassifier = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createChapterClassifier() {
  const linearChapterDefinitions = [
    { id: "linear_determinant", name: "行列式", syllabusChapter: "第一章 行列式", groupId: "linear", groupName: "线性代数" },
    { id: "linear_matrix", name: "矩阵", syllabusChapter: "第二章 矩阵", groupId: "linear", groupName: "线性代数" },
    { id: "linear_vector", name: "向量", syllabusChapter: "第三章 向量", groupId: "linear", groupName: "线性代数" },
    { id: "linear_system", name: "线性方程组", syllabusChapter: "第四章 线性方程组", groupId: "linear", groupName: "线性代数" },
    { id: "linear_eigen", name: "矩阵的特征值和特征向量", syllabusChapter: "第五章 矩阵的特征值和特征向量", groupId: "linear", groupName: "线性代数" },
    { id: "linear_quadratic", name: "二次型", syllabusChapter: "第六章 二次型", groupId: "linear", groupName: "线性代数" }
  ];

  const probabilityChapterDefinitions = [
    { id: "prob_events", name: "随机事件和概率", syllabusChapter: "第一章 随机事件和概率", groupId: "prob", groupName: "概率论与数理统计" },
    { id: "prob_single", name: "随机变量及其分布", syllabusChapter: "第二章 随机变量及其分布", groupId: "prob", groupName: "概率论与数理统计" },
    { id: "prob_multivariate", name: "多维随机变量及其分布", syllabusChapter: "第三章 多维随机变量及其分布", groupId: "prob", groupName: "概率论与数理统计" },
    { id: "prob_moments", name: "随机变量的数字特征", syllabusChapter: "第四章 随机变量的数字特征", groupId: "prob", groupName: "概率论与数理统计" },
    { id: "prob_limit", name: "大数定律和中心极限定理", syllabusChapter: "第五章 大数定律和中心极限定理", groupId: "prob", groupName: "概率论与数理统计" },
    { id: "prob_statistics", name: "数理统计的基本概念", syllabusChapter: "第六章 数理统计的基本概念", groupId: "prob", groupName: "概率论与数理统计" },
    { id: "prob_estimation", name: "参数估计", syllabusChapter: "第七章 参数估计", groupId: "prob", groupName: "概率论与数理统计" },
    { id: "prob_testing", name: "假设检验", syllabusChapter: "第八章 假设检验", groupId: "prob", groupName: "概率论与数理统计" }
  ];
  linearChapterDefinitions.forEach((chapter, index) => { chapter.syllabusOrder = index + 1; });
  probabilityChapterDefinitions.forEach((chapter, index) => { chapter.syllabusOrder = index + 1; });

  const chapterDefinitions = {
    linear: linearChapterDefinitions,
    prob: probabilityChapterDefinitions
  };
  const definitionById = new Map([...linearChapterDefinitions, ...probabilityChapterDefinitions].map((item) => [item.id, item]));

  const linearRules = [
    ["linear_system", /线性方程组|齐次.*方程|非齐次.*方程|基础解系|解空间|增广矩阵|克拉默/],
    ["linear_quadratic", /二次型|正定|负定|半正定|合同变换|惯性指数/],
    ["linear_eigen", /特征值|特征向量|相似矩阵|相似变换|对角化/],
    ["linear_vector", /线性相关|线性无关|向量组|向量空间|基底|坐标|内积|正交|施密特|张成/],
    ["linear_determinant", /行列式|代数余子式/],
    ["linear_matrix", /矩阵|秩|逆矩阵|伴随矩阵|初等变换|分块矩阵/]
  ];

  const probabilityRules = [
    ["prob_testing", /假设检验|显著性|原假设|备择假设|拒绝域|接受域|卡方检验|t检验|F检验|拟合优度/],
    ["prob_estimation", /参数估计|点估计|区间估计|矩估计|最大似然|极大似然|无偏估计|一致估计|有效估计/],
    ["prob_limit", /大数定律|中心极限|切比雪夫|棣莫弗|依概率收敛|几乎必然收敛/],
    ["prob_multivariate", /多维|二维|联合分布|边缘分布|条件分布|联合密度|联合分布函数|随机变量组/],
    ["prob_statistics", /总体|样本|统计量|抽样分布|卡方分布|t分布|F分布|分位数/],
    ["prob_moments", /数字特征|数学期望|期望|方差|协方差|相关系数|矩/],
    ["prob_single", /随机变量|分布函数|分布律|概率密度|二项分布|泊松分布|正态分布|均匀分布|指数分布|几何分布/],
    ["prob_events", /随机事件|独立事件|独立性|条件概率|全概率|贝叶斯|古典概型|几何概型|概率加法|概率乘法|伯努利/]
  ];

  function definitionFor(rules, text, fallbackId) {
    const matched = rules.find(([, pattern]) => pattern.test(text));
    return definitionById.get(matched ? matched[0] : fallbackId);
  }

  function classifyQuestionChapter(question) {
    if (!question || typeof question !== "object") return question;

    const baseId = String(question.chapterId || "");
    const baseName = String(question.chapterName || "");
    const existingDefinition = definitionById.get(baseId);
    if (existingDefinition) {
      return {
        ...question,
        chapterName: existingDefinition.name,
        chapterGroupId: existingDefinition.groupId,
        chapterGroupName: existingDefinition.groupName,
        syllabusChapter: existingDefinition.syllabusChapter,
        syllabusOrder: existingDefinition.syllabusOrder
      };
    }

    const isLinear = baseId === "linear" || baseId.startsWith("linear_") || baseName.includes("线性代数");
    const isProbability = baseId === "prob" || baseId.startsWith("prob_") || baseName.includes("概率论");
    if (!isLinear && !isProbability) return question;

    const text = [
      question.point,
      question.stem,
      question.explanation,
      question.detailedSolution,
      question.formula
    ].filter(Boolean).join(" ");
    const definition = isLinear
      ? definitionFor(linearRules, text, "linear_matrix")
      : definitionFor(probabilityRules, text, "prob_events");

    return {
      ...question,
      chapterId: definition.id,
      chapterName: definition.name,
      chapterGroupId: definition.groupId,
      chapterGroupName: definition.groupName,
      syllabusChapter: definition.syllabusChapter,
      syllabusOrder: definition.syllabusOrder
    };
  }

  return {
    chapterDefinitions,
    linearChapterDefinitions,
    probabilityChapterDefinitions,
    classifyQuestionChapter
  };
}));

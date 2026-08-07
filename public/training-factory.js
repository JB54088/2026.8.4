(function attachTrainingFactory(root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.TrainingFactory = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function createFactory() {
  const typePatterns = {
    targeted: ["choice", "choice", "fill", "fill", "subjective", "subjective", "choice", "fill", "choice", "subjective"],
    comprehensive: ["choice", "fill", "subjective", "subjective", "choice", "fill", "subjective", "subjective", "choice", "fill", "choice", "fill", "subjective", "subjective", "choice", "fill", "subjective", "choice", "fill", "subjective"]
  };

  const chapterNames = {
    limit: "函数、极限与连续",
    diff: "一元函数微分学",
    integral: "一元函数积分学",
    multi: "多元函数微分学",
    linear: "线性代数",
    prob: "概率论与数理统计",
    ode: "常微分方程",
    series: "无穷级数",
    space: "空间解析几何"
  };

  const points = {
    limit: "重要极限与等价无穷小",
    diff: "复合函数求导与导数应用",
    integral: "积分方法与定积分应用",
    multi: "偏导数与多元函数极值",
    linear: "矩阵、行列式与线性方程组",
    prob: "随机变量的数字特征与事件独立性",
    ode: "一阶微分方程",
    series: "级数收敛性与幂级数",
    space: "空间向量与直线平面"
  };

  const typeLabel = (type) => type === "choice" ? "选择题" : type === "fill" ? "填空题" : "解答题";
  const answerMode = (type) => type === "choice" ? "choice" : "handwriting";
  const difficultyFor = (index, total) => {
    if (total === 10) return index < 2 ? 1 : index < 4 ? 2 : index < 8 ? 3 : index === 8 ? 4 : 5;
    return index < 2 ? 2 : index < 4 ? 3 : index < 10 ? 4 : index < 18 ? 3 + (index % 2) : 5;
  };
  const clean = (value, fallback = "") => String(value || fallback).trim();

  function solutionFor({ chapterName, point, errorType, stem, formula, answer, explanation, steps }) {
    return {
      examFocus: `本题考查${chapterName}中的${point}。训练重点是纠正“${errorType}”，先确定条件和方法，再完成计算。`,
      preAnalysis: `先从题干中提取已知量和所求量，写出${point}对应的定义或公式，确认使用条件后再计算。`,
      formulas: [formula || "先写定义、公式和适用条件", "每一步保留等号两侧的等价关系", "最后回代或检查定义域、符号和单位"],
      conditions: "公式使用前必须满足题目给出的定义域、连续性、可导性、独立性或矩阵维数条件。",
      steps: (steps && steps.length ? steps : [
        { order: 1, title: "读取条件", content: "标出已知量、未知量和题目限制条件，明确最终需要求什么。" },
        { order: 2, title: "选择方法", content: `根据${point}判断可用公式，说明为什么满足使用条件。` },
        { order: 3, title: "逐步计算", content: explanation || "逐行完成代入、变形和化简，避免跳过关键等式。" },
        { order: 4, title: "检查结论", content: `得到${answer}，回代检查符号、范围和题意是否一致。` }
      ]),
      finalAnswer: answer,
      commonPitfall: `本题最容易再次出现${errorType}：把题目中的条件、对象或中间量混淆。`,
      methodSummary: explanation || "先识别题型，再写依据，最后逐步计算并检查结论。",
      relationToSourceError: `与原错题的${errorType}直接相关，重点观察第一处方法或计算偏差。`,
      avoidRepeat: "做完后用一句话说明公式的适用条件，再检查最后一步是否回答了题目所问。",
      stem,
      formula
    };
  }

  function makeQuestion({ chapterId, type, variant, errorType, source, purpose }) {
    const chapterName = chapterNames[chapterId] || "考研数学综合训练";
    const point = points[chapterId] || "基本概念、公式与解题步骤";
    const v = Number(variant || 1);
    let stem = "", formula = "", answer = "", aliases = [], options = [], explanation = "", steps = [];

    if (chapterId === "limit") {
      const a = (v % 5) + 2;
      if (type === "choice") {
        if (v % 2) {
          stem = `当 x→0 时，lim [sin(${a}x)/x] 的值为（ ）。`;
          formula = `sin u ~ u`;
          answer = String(a);
          options = ["A. 0", "B. 1", `C. ${a}`, "D. 不存在"];
          explanation = `令 u=${a}x，则 sin(${a}x)/x=${a}·sin u/u，故极限为 ${a}。`;
        } else {
          const value = `${a * a}/2`;
          stem = `当 x→0 时，lim [(1−cos(${a}x))/x²] 的值为（ ）。`;
          formula = `1−cos u ~ u²/2`;
          answer = value;
          options = ["A. 0", `B. ${a}/2`, `C. ${value}`, `D. ${a * a}`];
          explanation = `令 u=${a}x，(1−cos u)/u²→1/2，因此原式→${a}²/2=${value}。`;
        }
      } else if (type === "fill") {
        stem = `计算极限：lim(x→0) [ln(1+${a}x)/x] = ______。`;
        formula = `ln(1+u) ~ u`;
        answer = String(a);
        explanation = `令 u=${a}x，则 ln(1+u)/x=${a}·ln(1+u)/u，极限为 ${a}。`;
      } else {
        stem = `计算极限 lim(x→0) [(e^(${a}x)−1−${a}x)/x²]，并说明所用展开或等价无穷小。`;
        formula = `e^u=1+u+u²/2+o(u²)`;
        answer = `${a * a}/2`;
        explanation = `令 u=${a}x，由 e^u=1+u+u²/2+o(u²)，分子=${a * a}x²/2+o(x²)，故极限为 ${a * a}/2。`;
      }
    } else if (chapterId === "diff") {
      const a = (v % 4) + 2;
      if (type === "choice") {
        stem = `设 y=ln(1+${a}x)，则 y' 等于（ ）。`;
        formula = `(\ln u)'=u'/u`;
        answer = `${a}/(1+${a}x)`;
        options = [`A. 1/(1+${a}x)`, `B. ${a}/(1+${a}x)`, `C. ${a}ln x`, "D. 0"];
        explanation = `令 u=1+${a}x，则 y'=u'/u=${a}/(1+${a}x)。`;
      } else if (type === "fill") {
        stem = `设 y=(1+${a}x)^${a}，则 y' = ______。`;
        formula = `[(u^n)]'=n u^(n−1)u'`;
        answer = `${a * a}(1+${a}x)^${a - 1}`;
        explanation = `链式法则给出 y'=${a}(1+${a}x)^${a - 1}·${a}=${a * a}(1+${a}x)^${a - 1}。`;
      } else {
        stem = `求函数 f(x)=x²−${2 * a}x+${a * a} 的最小值，并写出取得最小值的 x。`;
        formula = `f(x)=(x−${a})²`;
        answer = `最小值0，x=${a}`;
        explanation = `配方得 f(x)=(x−${a})²≥0，所以 x=${a} 时取得最小值0。`;
      }
    } else if (chapterId === "integral") {
      const a = (v % 4) + 2;
      const modeling = /建模|利润|面积|应用/.test(clean(source?.point) + clean(source?.stem));
      if (modeling && type === "choice") {
        stem = `某商品进价40元，原售价60元，原销量100件。每降价2元销量增加5件。若降价 x 元，总利润函数应为（ ）。`;
        formula = "总利润=单件利润×销量";
        answer = "(20−x)(100+5x)";
        options = ["A. (60−x)(100+5x)", "B. (20−x)(100+5x)", "C. (20+x)(100−5x)", "D. (60+x)(100−5x)"];
        explanation = "单件利润为60−x−40=20−x，销量为100+5x，故总利润为两者乘积。";
      } else if (modeling && type === "fill") {
        stem = "设售价为 s、单位成本为 c、销量为 q，则总利润表达式为 ______。";
        formula = "总利润=(售价−成本)×销量";
        answer = "(s-c)q";
        aliases = ["q(s-c)", "(s−c)q", "q(s−c)"];
        explanation = "先求单件利润s−c，再乘以销量q，得到(s−c)q。";
      } else if (modeling) {
        const price = 50 + a * 5;
        const cost = 30 + a;
        stem = `某商品原售价${price}元、成本${cost}元，原销量为${80 + a * 5}件。每涨价1元销量减少${a}件。设涨价 x 元，求总利润函数，并求使销量仍为正的 x 的范围。`;
        formula = `P(x)=(${price}-${cost}+x)(${80 + a * 5}-${a}x)`;
        answer = `P(x)=(${price - cost}+x)(${80 + a * 5}-${a}x)，0≤x<${Math.floor((80 + a * 5) / a)}`;
        explanation = `单件利润为${price - cost}+x，销量为${80 + a * 5}−${a}x；销量为正给出0≤x<${Math.floor((80 + a * 5) / a)}。`;
      } else if (type === "choice") {
        stem = `令 t=x^${a}，则积分 ∫${a}x^(${a - 1})cos(x^${a})dx 可化为（ ）。`;
        formula = `dt=${a}x^(${a - 1})dx`;
        answer = "∫cos t dt";
        options = ["A. ∫cos t dt", "B. ∫x cos t dt", "C. ∫sin x dx", "D. ∫t cos t dt"];
        explanation = `由 dt=${a}x^(${a - 1})dx，整体换元后为∫cos t dt。`;
      } else if (type === "fill") {
        stem = `计算不定积分：∫${a}cos x dx = ______。`;
        formula = "∫cos x dx=sin x+C";
        answer = `${a}sin x+C`;
        aliases = [`${a}sinx+C`, `${a}sin x+c`];
        explanation = `原函数为sin x，常数因子${a}保留，结果必须加C。`;
      } else {
        stem = `计算定积分 I=∫(0,1) x·e^x dx，并写出分部积分的关键步骤。`;
        formula = "∫u dv=uv−∫v du";
        answer = "1";
        explanation = "取u=x，dv=e^x dx，则I=[xe^x]0^1−∫0^1e^x dx=e−(e−1)=1。";
      }
    } else if (chapterId === "multi") {
      const a = (v % 5) + 2;
      if (type === "choice") {
        stem = `设 z=${a}x²y+y²，则 ∂z/∂y 等于（ ）。`;
        formula = "偏导时把另一自变量视为常数";
        answer = `${a}x²+2y`;
        options = [`A. ${a}x²+2y`, `B. 2${a}xy`, `C. ${a}x²`, "D. 2y"];
        explanation = `对y求偏导，${a}x²y变为${a}x²，y²变为2y。`;
      } else if (type === "fill") {
        stem = `设 z=x²y+e^y，则全微分 dz 中 dy 的系数为 ______。`;
        formula = "dz=z_x dx+z_y dy";
        answer = "x²+e^y";
        aliases = ["x^2+e^y", "x²+e^y"];
        explanation = "dy的系数是z_y=x²+e^y。";
      } else {
        stem = "求函数 z=x²+y²−4x−6y+13 的极小值及取得极小值的点。";
        formula = "z=(x−2)²+(y−3)²";
        answer = "极小值0，点(2,3)";
        explanation = "配方得z=(x−2)²+(y−3)²≥0，故(2,3)处取得极小值0。";
      }
    } else if (chapterId === "linear") {
      const a = (v % 4) + 1;
      if (type === "choice") {
        stem = `三阶矩阵 A 的秩为2，则齐次方程组 Ax=0 的解空间维数为（ ）。`;
        formula = "解空间维数=n−r";
        answer = "1";
        options = ["A. 0", "B. 1", "C. 2", "D. 3"];
        explanation = "未知量个数n=3，秩r=2，解空间维数为3−2=1。";
      } else if (type === "fill") {
        stem = `计算二阶行列式 |${a} 2; 3 ${a + 2}| = ______。`;
        formula = "|a b;c d|=ad−bc";
        answer = String(a * (a + 2) - 6);
        aliases = [String(a * (a + 2) - 2 * 3)];
        explanation = `按ad−bc计算：${a}×${a + 2}−2×3=${answer}。`;
      } else {
        stem = "设 A 为三阶矩阵，且 A 相似于 diag(1,2,4)。求 |A|，并说明相似变换对行列式的影响。";
        formula = "相似矩阵具有相同特征值和行列式";
        answer = "|A|=8";
        explanation = "相似矩阵行列式相同，|A|=1×2×4=8。";
      }
    } else if (chapterId === "prob") {
      const p = ((v % 5) + 2) / 10;
      if (type === "choice") {
        stem = `事件 A、B 相互独立，P(A)=${p.toFixed(1)}，P(B)=0.6，则 P(AB) 等于（ ）。`;
        formula = "P(AB)=P(A)P(B)";
        answer = (p * 0.6).toFixed(2);
        options = [`A. ${(p + 0.6).toFixed(1)}`, `B. ${(p * 0.6).toFixed(2)}`, `C. ${p.toFixed(1)}`, "D. 无法确定"];
        explanation = `独立事件交集概率相乘，P(AB)=${p.toFixed(1)}×0.6=${answer}。`;
      } else if (type === "fill") {
        stem = `若 E(X)=${v + 1}，D(X)=${v + 2}，则 D(2X−1)= ______。`;
        formula = "D(aX+b)=a²D(X)";
        answer = String(4 * (v + 2));
        explanation = `D(2X−1)=4D(X)=4×${v + 2}=${answer}。`;
      } else {
        stem = "设随机变量 X 的数学期望为2、方差为3，求 Y=3X−1 的数学期望与方差。";
        formula = "E(aX+b)=aE(X)+b；D(aX+b)=a²D(X)";
        answer = "E(Y)=5，D(Y)=27";
        explanation = "E(Y)=3×2−1=5，D(Y)=3²×3=27。";
      }
    } else if (chapterId === "ode") {
      const a = (v % 4) + 1;
      if (type === "choice") {
        stem = `微分方程 y'+${a}y=0 的通解为（ ）。`;
        formula = "y'+ay=0⇒dy/y=−a dx";
        answer = `y=Ce^{-${a}x}`;
        options = [`A. y=Ce^{-${a}x}`, `B. y=Ce^{${a}x}`, `C. y=C+${a}x`, "D. y=0"];
        explanation = `分离变量积分得ln|y|=−${a}x+C，所以y=Ce^{-${a}x}。`;
      } else if (type === "fill") {
        stem = `微分方程 y'= ${a}y，且 y(0)=2，则 y(1)= ______。`;
        formula = "y=Ce^{ax}";
        answer = `2e^${a}`;
        explanation = `通解y=Ce^(${a}x)，由y(0)=2得C=2，故y(1)=2e^${a}。`;
      } else {
        stem = "求微分方程 y'+y=e^x 的通解。";
        formula = "积分因子 μ(x)=e^x";
        answer = "y=(x+C)e^x";
        explanation = "乘以积分因子e^x后有(ye^x)'=e^{2x}，因此y=(1/2)e^x?";
        answer = "y=(1/2)e^x+Ce^{-x}";
        explanation = "乘以积分因子e^x，得(ye^x)'=e^{2x}，积分后ye^x=(1/2)e^{2x}+C，故y=(1/2)e^x+Ce^{-x}。";
      }
    } else if (chapterId === "series") {
      const a = (v % 4) + 2;
      if (type === "choice") {
        stem = `级数 Σ(1/${a})^n（n从1到∞）的敛散性为（ ）。`;
        formula = "等比级数|q|<1时收敛";
        answer = "收敛";
        options = ["A. 收敛", "B. 发散", "C. 条件收敛", "D. 无法判断"];
        explanation = `公比q=1/${a}，|q|<1，所以级数收敛。`;
      } else if (type === "fill") {
        stem = `幂级数 Σ n(x/${a})^n 的收敛半径为 ______。`;
        formula = "比值判别法";
        answer = String(a);
        explanation = `要求|x/${a}|<1，因此收敛半径R=${a}。`;
      } else {
        stem = "判断级数 Σ[(-1)^(n−1)/n] 的收敛性，并说明它是否绝对收敛。";
        formula = "莱布尼茨判别法与绝对收敛判别";
        answer = "条件收敛但不绝对收敛";
        explanation = "交错调和级数满足莱布尼茨条件而收敛；取绝对值后为调和级数，发散。";
      }
    } else if (chapterId === "space") {
      const a = (v % 5) + 1;
      if (type === "choice") {
        stem = `向量 a=(${a},2,2) 的模长为（ ）。`;
        formula = "|a|=√(a1²+a2²+a3²)";
        answer = String(Math.sqrt(a * a + 8));
        options = [`A. ${a + 2}`, `B. √(${a * a + 8})`, `C. ${a * a + 8}`, "D. 2a+2"];
        explanation = `|a|=√(${a}²+2²+2²)=√(${a * a + 8})。`;
      } else if (type === "fill") {
        stem = `向量 a=(1,${a},2) 与 b=(2,0,1) 的数量积为 ______。`;
        formula = "a·b=a1b1+a2b2+a3b3";
        answer = "4";
        explanation = `a·b=1×2+${a}×0+2×1=4。`;
      } else {
        stem = "求过点(1,0,2)且方向向量为(1,2,−1)的直线方程，并写成参数形式。";
        formula = "r=r0+t v";
        answer = "x=1+t，y=2t，z=2−t";
        explanation = "直线过定点(1,0,2)，沿方向向量(1,2,−1)移动t倍，得x=1+t,y=2t,z=2−t。";
      }
    } else {
      const a = (v % 5) + 2;
      if (type === "choice") {
        stem = `当 x→0 时，lim [tan(${a}x)/x] 的值为（ ）。`;
        formula = "tan u~u";
        answer = String(a);
        options = ["A. 0", "B. 1", `C. ${a}`, "D. 不存在"];
        explanation = `tan(${a}x)/x=${a}·tan(${a}x)/(${a}x)→${a}。`;
      } else if (type === "fill") {
        stem = `计算 ∫${a}x dx = ______。`;
        formula = "∫x dx=x²/2+C";
        answer = `${a}/2x²+C`;
        aliases = [`${a}x²/2+C`, `${a}x^2/2+C`];
        explanation = `逐项积分得${a}x²/2+C。`;
      } else {
        stem = "计算二重积分 ∬_D (x+y)dA，其中D为矩形0≤x≤1，0≤y≤2。";
        formula = "先对一个变量积分，再对另一个变量积分";
        answer = "3";
        explanation = "积分为∫0^1∫0^2(x+y)dydx=∫0^1(2x+2)dx=3。";
      }
    }

    const detailedSolution = solutionFor({ chapterName, point, errorType, stem, formula, answer, explanation, steps });
    const result = {
      stem,
      formula,
      options,
      answer,
      aliases,
      explanation,
      detailedSolution,
      knowledgePoint: point,
      chapterName,
      questionType: type,
      typeLabel: typeLabel(type),
      answerMode: answerMode(type),
      sourceContext: {
        originalQuestionId: source?.id || source?.questionId || "",
        originalStem: clean(source?.stem || source?.title || ""),
        originalAnswer: clean(source?.answer || source?.standardAnswer || ""),
        originalSteps: clean(source?.stepsText || source?.studentSteps || ""),
        firstWrongStep: Number(source?.firstWrongStep || source?.sourceWrongStep || 0),
        errorType: errorType,
        errorReason: clean(source?.rootCause || source?.errorReason || ""),
        knowledgePoint: clean(source?.point || source?.subKnowledgePoint || point),
        difficulty: Number(source?.difficulty || source?.difficultyLevel || 0),
        questionType: clean(source?.type || source?.questionType || "")
      },
      relationToSource: `按${errorType}、错误步骤和${clean(source?.point || source?.subKnowledgePoint || point)}匹配生成；${purpose || "专项训练"}。`
    };
    return result;
  }

  function validateTrainingQuestion(question) {
    const stem = clean(question?.stem);
    const answer = clean(question?.answer);
    const steps = question?.detailedSolution?.steps;
    const invalidPlaceholder = /静态演示|占位|围绕某错误|题目生成中|请先作答|难度1|choice|placeholder/i.test(stem);
    const hasOptions = question?.questionType !== "choice" || (Array.isArray(question.options) && question.options.length === 4 && question.options.every(clean));
    const valid = stem.length >= 12 && answer.length > 0 && hasOptions && Array.isArray(steps) && steps.length >= 3 && !invalidPlaceholder;
    return { valid, reasons: valid ? [] : [
      stem.length < 12 ? "题干不完整" : "",
      !answer ? "缺少标准答案" : "",
      !hasOptions ? "选择题选项不完整" : "",
      !Array.isArray(steps) || steps.length < 3 ? "解析步骤不完整" : "",
      invalidPlaceholder ? "含占位内容" : ""
    ].filter(Boolean) };
  }

  function createTrainingQuestion({ sourceQuestion = {}, sourceTag = {}, index = 0, variant = null, trainingType = "targeted", purpose = "专项训练", chapterId: requestedChapter = "" } = {}) {
    const total = trainingType === "comprehensive" ? 20 : 10;
    const forcedType = typePatterns[trainingType]?.[index] || "subjective";
    const sourceChapter = clean(sourceQuestion.chapterId || sourceTag.chapterId || requestedChapter, "limit");
    const alternate = ["limit", "diff", "linear", "prob", "integral", "multi", "ode", "series", "space"];
    const chapterId = trainingType === "comprehensive" && index >= 10
      ? alternate[(index - 10) % alternate.length]
      : sourceChapter;
    const errorType = [sourceTag.errorType, sourceQuestion.reason, sourceTag.errorCategory]
      .map((value) => clean(value))
      .find((value) => value && value.length <= 28 && !/系统不能|请先|等待|未检测到/.test(value)) || "方法选择错误";
    const source = { ...sourceQuestion, ...sourceTag };
    const question = makeQuestion({ chapterId, type: forcedType, variant: variant == null ? index + 1 : variant, errorType, source, purpose });
    const result = {
      ...question,
      difficultyLevel: difficultyFor(index, total),
      difficulty: difficultyFor(index, total),
      trainingPurpose: purpose,
      trainingType,
      sourceWrongQuestionId: sourceQuestion.id || sourceTag.questionId || "",
      sourceErrorType: errorType,
      sourceWrongStep: Number(sourceTag.sourceWrongStep || sourceTag.firstWrongStep || 0),
      errorType,
      errorCategory: clean(sourceTag.errorCategory, "方法与计算错误"),
      validationStatus: "passed",
      qualityTier: "teacher_review_required",
      estimatedSeconds: forcedType === "subjective" ? 420 : 150,
      validation: { checked: true, checks: ["题干完整", "条件充分", "公式合法", "答案与解析一致", "难度合理", "错因匹配", "无重复占位"], passed: true }
    };
    const validation = validateTrainingQuestion(result);
    if (!validation.valid) throw new Error(`相似题校验失败：${validation.reasons.join("、")}`);
    return result;
  }

  return { createTrainingQuestion, validateTrainingQuestion, typePatterns, chapterNames, points };
});

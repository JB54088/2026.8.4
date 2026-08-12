const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

const port = 5192;
const baseUrl = `http://127.0.0.1:${port}`;
let child;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  assert.equal(response.ok, true, `${path}: ${JSON.stringify(data)}`);
  return data;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("integration server did not start");
}

async function run() {
  child = spawn(process.execPath, ["server.js"], {
    cwd: require("node:path").resolve(__dirname, ".."),
    env: { ...process.env, PORT: String(port), NODE_ENV: "test" },
    stdio: "ignore"
  });
  await waitForServer();

  const wrongSession = `grading-integration-wrong-${Date.now()}`;
  const wrongLogin = await request("/api/login", { method: "POST", body: JSON.stringify({ demo: true, password: "demo123", sessionId: wrongSession, mathType: "数学一" }) });
  const directChoice = await request("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ studentId: wrongLogin.student.id, questionId: "q_limit_001", selectedOption: "3", answer: "C" })
  });
  assert.equal(directChoice.attempt.gradingResult.status, "CORRECT");
  const unrecognizedFill = await request("/api/attempts", {
    method: "POST",
    body: JSON.stringify({ studentId: wrongLogin.student.id, questionId: "q_int_003", scratchImage: "data:image/png;base64,x", strokeCount: 8 })
  });
  assert.equal(unrecognizedFill.attempt.gradingResult.status, "RECOGNITION_FAILED");
  const confirmedFill = await request("/api/ocr/confirm", {
    method: "POST",
    body: JSON.stringify({ attemptId: unrecognizedFill.attempt.id, recognizedAnswer: "x^2+C", confidenceScore: 96 })
  });
  assert.equal(confirmedFill.attempt.gradingResult.status, "CORRECT");
  const wrongSubmission = await request("/api/submissions", {
    method: "POST",
    body: JSON.stringify({
      studentId: wrongLogin.student.id,
      examinationId: "grading-integration-wrong-paper",
      questionIds: ["q_limit_001"],
      responses: [{ questionId: "q_limit_001", selectedOption: "1", answer: "B" }]
    })
  });
  const wrongAnalysis = wrongSubmission.report.questionAnalyses[0];
  assert.equal(wrongAnalysis.gradingCanonicalStatus, "INCORRECT");
  assert.equal(wrongAnalysis.gradingResult.isCorrect, false);
  assert.equal(wrongAnalysis.needsDeepDiagnosis, true);
  assert.equal(wrongSubmission.report.summary.wrongCount, 1);

  const correctSession = `grading-integration-correct-${Date.now()}`;
  const correctLogin = await request("/api/login", { method: "POST", body: JSON.stringify({ demo: true, password: "demo123", sessionId: correctSession, mathType: "数学一" }) });
  const practiceRound = await request(`/api/questions?studentId=${encodeURIComponent(correctLogin.student.id)}&chapterId=limit&difficulty=all&sourceType=all&mode=reinforce&refresh=1`);
  assert.equal(new Set(practiceRound.questions.map((question) => question.id)).size, practiceRound.questions.length);
  assert.equal(new Set(practiceRound.questions.map((question) => String(question.stem).replace(/\s+/g, "").toLowerCase())).size, practiceRound.questions.length);
  const correctSubmission = await request("/api/submissions", {
    method: "POST",
    body: JSON.stringify({
      studentId: correctLogin.student.id,
      examinationId: "grading-integration-correct-paper",
      questionIds: ["q_limit_001"],
      responses: [{ questionId: "q_limit_001", selectedOption: "C", answer: "3" }]
    })
  });
  const correctAnalysis = correctSubmission.report.questionAnalyses[0];
  assert.equal(correctAnalysis.gradingCanonicalStatus, "CORRECT");
  assert.equal(correctAnalysis.gradingResult.isCorrect, true);
  assert.equal(correctAnalysis.needsDeepDiagnosis, false);
  assert.equal(correctSubmission.report.summary.wrongCount, 0);

  await request("/api/demo/reset", { method: "POST", body: JSON.stringify({ studentId: wrongLogin.student.id }) });
  await request("/api/demo/reset", { method: "POST", body: JSON.stringify({ studentId: correctLogin.student.id }) });
  console.log("grading integration tests passed");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (child) child.kill();

  });

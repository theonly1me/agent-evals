import json
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ElementTree
from pathlib import Path

sys.dont_write_bytecode = True

from comments import count_new_comments, strip_comments

SHARED = Path(__file__).resolve().parent

TASKS = SHARED / "tasks"
PYTEST_TIMEOUT_SECONDS = 300
JUDGE_VIEW = "judge-view"
REPORT_NAME = "hidden-report.xml"


def is_test_file(path: Path) -> bool:
    return path.name.startswith("test_") or path.name.endswith("_test.py") or path.name == "conftest.py"


def run_hidden_tests(*, workspace: Path, tests: Path) -> float:
    hidden = sorted(path for path in tests.iterdir() if path.is_file())
    saved = {}
    for path in hidden:
        target = workspace / path.name
        if target.exists():
            saved[target] = target.read_bytes()
        shutil.copy(path, target)
    report = workspace / REPORT_NAME
    test_names = [path.name for path in hidden if is_test_file(path)]
    command = [sys.executable, "-m", "pytest", *test_names, "-q", "-p", "no:cacheprovider", f"--junitxml={report}"]
    try:
        completed = subprocess.run(command, cwd=workspace, capture_output=True, text=True, timeout=PYTEST_TIMEOUT_SECONDS)
        if "No module named pytest" in completed.stderr:
            raise SystemExit("pytest is not installed for " + sys.executable)
        return pass_rate(report)
    except subprocess.TimeoutExpired:
        return 0.0
    finally:
        for path in hidden:
            (workspace / path.name).unlink(missing_ok=True)
        for target, content in saved.items():
            target.write_bytes(content)
        report.unlink(missing_ok=True)


def pass_rate(report: Path) -> float:
    if not report.exists():
        return 0.0
    root = ElementTree.parse(report).getroot()
    suite = root if root.tag == "testsuite" else root.find("testsuite")
    total = int(suite.get("tests", 0))
    bad = int(suite.get("failures", 0)) + int(suite.get("errors", 0)) + int(suite.get("skipped", 0))
    return (total - bad) / total if total else 0.0


def solution_files(*, workspace: Path, seed: Path) -> list[Path]:
    candidates = [path for path in workspace.rglob("*.py") if JUDGE_VIEW not in path.parts and "__pycache__" not in path.parts]
    return sorted(path for path in candidates if not is_test_file(path) and changed(path=path, seed=seed / path.relative_to(workspace)))


def changed(*, path: Path, seed: Path) -> bool:
    return not seed.exists() or seed.read_text() != path.read_text()


def new_comment_count(*, workspace: Path, seed: Path, paths: list[Path]) -> int:
    total = 0
    for path in paths:
        before = seed / path.relative_to(workspace)
        total += count_new_comments(before=before.read_text() if before.exists() else "", after=path.read_text())
    return total


def write_judge_view(*, workspace: Path, paths: list[Path]) -> None:
    view = workspace / JUDGE_VIEW
    shutil.rmtree(view, ignore_errors=True)
    for path in paths:
        relative = path.relative_to(workspace)
        raw = view / "raw" / relative
        stripped = view / "stripped" / relative
        raw.parent.mkdir(parents=True, exist_ok=True)
        stripped.parent.mkdir(parents=True, exist_ok=True)
        raw.write_text(path.read_text())
        stripped.write_text(strip_comments(path.read_text()))


def main() -> None:
    request = json.loads(sys.stdin.read())
    workspace = Path(request["workspace"])
    task = TASKS / request["task"]["id"]
    seed = task / "workspace"
    fraction = run_hidden_tests(workspace=workspace, tests=task / "tests")
    try:
        paths = solution_files(workspace=workspace, seed=seed)
        comments = new_comment_count(workspace=workspace, seed=seed, paths=paths)
        write_judge_view(workspace=workspace, paths=paths)
    except (SyntaxError, UnicodeDecodeError):
        paths, comments = [], 0
    scores = {
        "passed": 1 if fraction == 1.0 else 0,
        "tests_passed": fraction,
        "new_comments": comments,
        "changed_files": len(paths),
    }
    print(json.dumps({"scores": scores}))


if __name__ == "__main__":
    main()

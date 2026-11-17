import json
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ElementTree
from pathlib import Path

from comments import count_new_comments, strip_comments

SHARED = Path(__file__).resolve().parent
SEED_REPO = SHARED / "seed_repo"
PYTEST_TIMEOUT_SECONDS = 180
JUDGE_VIEW = "judge-view"


def run_pytest(*, workspace: Path, source: Path, target: str) -> float:
    copied = workspace / target
    report = workspace / f"report-{target}.xml"
    shutil.rmtree(copied, ignore_errors=True)
    shutil.copytree(source, copied, ignore=shutil.ignore_patterns("__pycache__"))
    command = [sys.executable, "-m", "pytest", target, "-q", "-p", "no:cacheprovider", f"--junitxml={report}"]
    try:
        completed = subprocess.run(command, cwd=workspace, capture_output=True, text=True, timeout=PYTEST_TIMEOUT_SECONDS)
        if "No module named pytest" in completed.stderr:
            raise SystemExit("pytest is not installed for " + sys.executable)
        return pass_rate(report)
    except subprocess.TimeoutExpired:
        return 0.0
    finally:
        shutil.rmtree(copied, ignore_errors=True)
        report.unlink(missing_ok=True)


def pass_rate(report: Path) -> float:
    if not report.exists():
        return 0.0
    suite = ElementTree.parse(report).getroot().find("testsuite")
    total = int(suite.get("tests", 0))
    bad = int(suite.get("failures", 0)) + int(suite.get("errors", 0)) + int(suite.get("skipped", 0))
    return (total - bad) / total if total else 0.0


def changed_sources(workspace: Path) -> list[Path]:
    changed = []
    for path in sorted((workspace / "ledger").rglob("*.py")):
        seed = SEED_REPO / path.relative_to(workspace)
        if not seed.exists() or seed.read_text() != path.read_text():
            changed.append(path)
    return changed


def new_comment_count(*, workspace: Path, paths: list[Path]) -> int:
    total = 0
    for path in paths:
        seed = SEED_REPO / path.relative_to(workspace)
        before = seed.read_text() if seed.exists() else ""
        total += count_new_comments(before=before, after=path.read_text())
    return total


def write_judge_view(*, workspace: Path, paths: list[Path]) -> None:
    view = workspace / JUDGE_VIEW
    shutil.rmtree(view, ignore_errors=True)
    for path in paths:
        target = view / path.relative_to(workspace)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(strip_comments(path.read_text()))


def main() -> None:
    request = json.loads(sys.stdin.read())
    workspace = Path(request["workspace"])
    hidden = run_pytest(workspace=workspace, source=SHARED / "hidden_tests", target="tests_hidden")
    seed = run_pytest(workspace=workspace, source=SEED_REPO / "tests", target="tests_seed")
    try:
        paths = changed_sources(workspace)
        comments = new_comment_count(workspace=workspace, paths=paths)
        write_judge_view(workspace=workspace, paths=paths)
    except SyntaxError:
        paths, comments = [], 0
    scores = {
        "hidden_tests_passed": hidden,
        "all_hidden_tests_pass": 1 if hidden == 1.0 else 0,
        "seed_tests_passed": seed,
        "new_comments": comments,
        "changed_source_files": len(paths),
    }
    print(json.dumps({"scores": scores}))


if __name__ == "__main__":
    main()

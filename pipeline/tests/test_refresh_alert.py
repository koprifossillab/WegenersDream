"""주간 갱신 알림(deploy/host/refresh_alert.py)의 판단 시험 — 보내지는 않는다 (tupandactyl 032).

파이프라인이 아니지만 CI 가 도는 자리라 여기 둔다.
"""
import datetime as dt
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "deploy" / "host" / "refresh_alert.py"
_SPEC = importlib.util.spec_from_file_location("refresh_alert", _PATH)
alert = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(alert)

KST = dt.timezone(dt.timedelta(hours=9))
NOW = dt.datetime(2026, 11, 16, 8, 0, tzinfo=KST)


class ProblemTest(unittest.TestCase):
    def check(self, record):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "last_refresh.json"
            if record is not None:
                path.write_text(json.dumps(record), encoding="utf-8")
            return alert.problem(path, NOW)[0]

    def test_ok_today_is_quiet(self):
        self.assertIsNone(self.check({"at": "2026-11-16T02:42:40+09:00", "result": "ok", "step": "publish"}))

    def test_fail_is_reported(self):
        what = self.check({"at": "2026-11-16T02:40:00+09:00", "result": "fail", "step": "publish", "note": "rsync 실패"})
        self.assertIn("갱신 실패", what)
        self.assertIn("rsync 실패", what)

    def test_skip_is_reported(self):
        self.assertIn("갱신 실패", self.check({"at": "2026-11-16T02:40:00+09:00", "result": "skip", "step": "start"}))

    def test_stale_ok_means_not_run(self):
        # 10-05~10-19 처럼: 지난주의 ok 가 남아 있으면 이번 주는 안 돈 것이다
        self.assertIn("안 돌았다", self.check({"at": "2026-11-09T02:42:40+09:00", "result": "ok", "step": "publish"}))

    def test_nas_failure_is_reported(self):
        what = self.check({"at": "2026-11-16T02:42:40+09:00", "result": "ok", "step": "publish", "nas": "fail: sha256 다름"})
        self.assertIn("NAS", what)

    def test_missing_file(self):
        self.assertIn("없다", self.check(None))

    def test_card_shape(self):
        payload = alert.card("제목", ["한 줄"])
        content = payload["attachments"][0]["content"]
        self.assertEqual(content["type"], "AdaptiveCard")
        self.assertEqual([b["text"] for b in content["body"]], ["제목", "한 줄"])


if __name__ == "__main__":
    unittest.main()

"""뷰어 시험. 자료 폴더를 임시로 만들어 쓴다 — 파이프라인도 네트워크도 타지 않는다.

    cd web && python manage.py test viewer
"""
import json
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from django.test import SimpleTestCase, override_settings

INDEX = {
    "schema": 1,
    "built_at": "2026-09-29T00:00:00+00:00",
    "frames": [{
        "age": 250.0, "label": "Permo-Triassic boundary", "period": {"ko": "페름기", "en": "Permian"},
        "relief": "relief/2500.webp", "land_fraction": 0.4,
        "coastline": {"age": 250.0, "file": "coastlines/2500.json"},
        "fossils": {"file": "fossils/2500.json", "count": 0, "by_env": {}},
    }],
    "pbdb": {"receipt": {"retrieved_at": "2026-09-29T00:00:00+00:00"}},
    "sources": [],
    "environments": [
        {"id": "m", "ko": "바다 환경", "en": "Marine", "groups": [
            {"id": "m-reef", "ko": "초(礁)·생물초", "en": "Reefs", "terms": [
                {"term": "basin reef", "ko": "분지 초", "total": 1}]}]},
    ],
}


class DataDirMixin:
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir, True)
        (self.dir / "relief").mkdir()
        (self.dir / "relief" / "2500.webp").write_bytes(b"RIFF....WEBP")
        (self.dir / "index.json").write_text(json.dumps(INDEX), encoding="utf-8")
        (self.dir / "secret.txt").write_text("nope")
        override = override_settings(DATA_DIR=self.dir)
        override.enable()
        self.addCleanup(override.disable)


class MapPageTest(DataDirMixin, SimpleTestCase):
    def test_page_renders_with_data(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="map"')
        self.assertNotContains(response, "자료가 아직 없다")

    def test_page_says_so_without_data(self):
        (self.dir / "index.json").unlink()
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "자료가 아직 없다")


class PatchNotesTest(DataDirMixin, SimpleTestCase):
    """설정 창의 판 이력 — CHANGELOG.md 맨 위 판이 화면에 있고, 마크다운은 굵게·코드만 HTML 이 된다(koprifossillab 039)."""

    def test_current_version_is_listed(self):
        from django.conf import settings
        response = self.client.get("/")
        self.assertContains(response, 'id="stab-sources"')
        self.assertContains(response, "<summary><b>" + settings.WEGENER_VERSION + "</b>")

    def test_parse(self):
        from .patchnotes import parse
        notes = parse("# 판 이력\n\n## 2.0.0 — 2026-10-07 · `feature/x`\n\n머리말\n\n- **굵게** 와 `코드` <b>날것</b>\n"
                      "  이어지는 줄\n- [링크](a.md)\n\n## 1.9.0\n\n- 날짜 없는 판\n")
        self.assertEqual([n["version"] for n in notes], ["2.0.0", "1.9.0"])
        self.assertEqual(notes[0]["date"], "2026-10-07")
        self.assertEqual(notes[0]["lead"], "머리말")
        self.assertEqual(notes[0]["items"][0], "<b>굵게</b> 와 <code>코드</code> &lt;b&gt;날것&lt;/b&gt; 이어지는 줄")
        self.assertEqual(notes[0]["items"][1], "링크")
        self.assertEqual(notes[1]["date"], "")


class DataFileTest(DataDirMixin, SimpleTestCase):
    def test_serves_index_and_frames(self):
        response = self.client.get("/data/index.json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertIn("max-age=300", response["Cache-Control"])
        response = self.client.get("/data/relief/2500.webp")
        self.assertEqual(response.status_code, 200)
        self.assertIn("max-age=86400", response["Cache-Control"])

    def test_refuses_other_suffixes_and_escape(self):
        self.assertEqual(self.client.get("/data/secret.txt").status_code, 404)
        self.assertEqual(self.client.get("/data/../wegenerweb/settings.py").status_code, 404)
        self.assertEqual(self.client.get("/data/%2e%2e/%2e%2e/web/manage.py").status_code, 404)
        self.assertEqual(self.client.get("/data/relief/none.webp").status_code, 404)


class HealthTest(DataDirMixin, SimpleTestCase):
    def test_ok(self):
        body = self.client.get("/healthz").json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["frames"], 1)

    def test_missing_relief_is_degraded(self):
        (self.dir / "relief" / "2500.webp").unlink()
        self.assertEqual(self.client.get("/healthz").json()["status"], "degraded")

    def test_no_data_is_503(self):
        (self.dir / "index.json").unlink()
        self.assertEqual(self.client.get("/healthz").status_code, 503)


class HealthRefreshTest(DataDirMixin, SimpleTestCase):
    """주간 갱신·백업 결과와 지형·PaleoClim 파일(koprifossillab 034)."""
    def setUp(self):
        super().setUp()
        self.state = self.dir / "state"
        self.state.mkdir()
        override = override_settings(STATE_DIR=self.state)
        override.enable()
        self.addCleanup(override.disable)

    def refresh(self, **fields):
        at = (datetime.now(timezone.utc) - timedelta(days=fields.pop("days_ago", 0))).isoformat()
        body = {"at": at, "result": "ok", "step": "deploy", "note": "", "backup": "x.tar.gz", "nas": "ok", **fields}
        (self.state / "refresh.json").write_text(json.dumps(body), encoding="utf-8")

    def health(self):
        return self.client.get("/healthz").json()

    def test_no_refresh_file_is_not_a_problem(self):
        body = self.health()
        self.assertEqual(body["status"], "ok")
        self.assertIsNone(body["refresh"])

    def test_recent_ok_refresh(self):
        self.refresh(days_ago=2)
        body = self.health()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["refresh"]["result"], "ok")

    def test_failed_refresh_is_degraded(self):
        self.refresh(result="fail", step="check-repo", note="저장소가 main 이 아니다")
        body = self.health()
        self.assertEqual(body["status"], "degraded")
        self.assertIn("check-repo", body["problems"][0])

    def test_nas_failure_is_degraded(self):
        self.refresh(nas="fail")
        self.assertEqual(self.health()["status"], "degraded")

    def test_stale_refresh_is_degraded(self):
        self.refresh(days_ago=9)
        body = self.health()
        self.assertEqual(body["status"], "degraded")
        self.assertIn("8 일", body["problems"][0])

    def test_listed_terrain_and_paleoclim_files_must_exist(self):
        index = json.loads((self.dir / "index.json").read_text(encoding="utf-8"))
        index["frames"][0]["terrain"] = {"file": "terrain/2500.webp"}
        (self.dir / "index.json").write_text(json.dumps(index), encoding="utf-8")
        (self.dir / "climate").mkdir()
        (self.dir / "climate" / "recent.json").write_text(json.dumps(
            {"snapshots": [{"id": "lgm", "file": "climate/pc_lgm.png"}]}), encoding="utf-8")
        body = self.health()
        self.assertEqual(body["status"], "degraded")
        self.assertEqual(body["missing_terrain"], 1)
        self.assertEqual(body["paleoclim"], {"snapshots": 1, "missing": 1})
        (self.dir / "terrain").mkdir()
        (self.dir / "terrain" / "2500.webp").write_bytes(b"x")
        (self.dir / "climate" / "pc_lgm.png").write_bytes(b"x")
        body = self.health()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["paleoclim"], {"snapshots": 1, "missing": 0})


class LabelsTest(DataDirMixin, SimpleTestCase):
    def setUp(self):
        super().setUp()
        override = override_settings(STATE_DIR=self.dir / "state", EDITOR_KEYS={"화석"}, DEBUG=False)
        override.enable()
        self.addCleanup(override.disable)

    def post(self, **body):
        return self.client.post("/labels", data=json.dumps(body), content_type="application/json")

    def test_get_says_key_is_needed(self):
        body = self.client.get("/labels").json()
        self.assertEqual(body["env"], {})
        self.assertTrue(body["editable"])
        self.assertTrue(body["needs_key"])

    def test_rename_and_reset(self):
        response = self.post(kind="env", id="m-reef", name="  초   환경 ", key="화석")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["env"], {"m-reef": "초 환경"})       # 빈칸을 하나로
        self.assertEqual(self.client.get("/labels").json()["env"], {"m-reef": "초 환경"})
        self.post(kind="env", id="term:basin reef", name="분지 안 초", key="화석")
        self.assertEqual(self.post(kind="env", id="m-reef", name="", key="화석").json()["env"],
                         {"term:basin reef": "분지 안 초"})                      # 비우면 기본으로

    def test_refusals(self):
        self.assertEqual(self.post(kind="env", id="m-reef", name="x", key="틀림").status_code, 403)
        self.assertEqual(self.post(kind="env", id="no-such", name="x", key="화석").status_code, 400)
        self.assertEqual(self.post(kind="time", id="m-reef", name="x", key="화석").status_code, 400)
        self.assertEqual(self.post(kind="env", id="m-reef", name="가" * 61, key="화석").status_code, 400)
        self.assertFalse((self.dir / "state" / "labels.json").exists())

    @override_settings(EDITOR_KEYS=set())
    def test_closed_in_production_without_key(self):
        self.assertFalse(self.client.get("/labels").json()["editable"])
        self.assertEqual(self.post(kind="env", id="m-reef", name="x").status_code, 403)

    @override_settings(EDITOR_KEYS=set(), DEBUG=True)
    def test_open_in_development_without_key(self):
        self.assertEqual(self.post(kind="env", id="m", name="바다").status_code, 200)


@override_settings(URL_PREFIX="WegenersDream/")
class PrefixTest(SimpleTestCase):
    def test_urls_do_not_hardcode_prefix(self):
        # 접두사는 wegenerweb/urls.py 가 import 될 때 한 번 붙는다. 앱 urls 는 모른다.
        from viewer import urls
        self.assertTrue(all(not str(p.pattern).startswith("WegenersDream") for p in urls.urlpatterns))


class I18nTest(SimpleTestCase):
    """화면 문구의 한·영 짝이 빠지지 않았는지(wetherilli 007). 뷰어에는 JS 실행기가 없어 글자로 읽는다.

    - map.js 의 `tr("열쇠")`(조건식 `tr(x ? "a" : "b")` 포함)는 i18n.js 의 `T` 에 있어야 한다
    - `T` 의 칸은 모두 ["한국어", "영어"] 두 문자열이다
    - 템플릿의 `data-i18n`·`data-i18n-html`·`data-i18n-attr` 열쇠는 `DOM_EN` 에 있어야 한다
    """
    STATIC = Path(__file__).parent / "static" / "viewer"
    TEMPLATE = Path(__file__).parent / "templates" / "viewer" / "map.html"
    STR = r'"(?:[^"\\]|\\.)*"'

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        import re
        cls.re = re
        source = (cls.STATIC / "i18n.js").read_text(encoding="utf-8")
        t_block = source[source.index("var T = {"):source.index("\n  };", source.index("var T = {"))]
        dom_block = source[source.index("var DOM_EN = {"):source.index("\n  };", source.index("var DOM_EN = {"))]
        cls.t_keys = set(re.findall(r'^\s*"([\w.]+)":', t_block, re.M))
        cls.t_pairs = set(re.findall(r'"([\w.]+)":\s*\[\s*' + cls.STR + r'\s*,\s*' + cls.STR + r'\s*\]', t_block))
        cls.dom_keys = set(re.findall(r'^\s*"([\w.]+)":\s*"', dom_block, re.M))

    def test_t_entries_are_pairs(self):
        self.assertTrue(self.t_keys)
        self.assertEqual(self.t_keys - self.t_pairs, set(), "[한국어, 영어] 두 문자열이 아닌 칸")

    def test_map_js_keys_exist(self):
        js = (self.STATIC / "map.js").read_text(encoding="utf-8")
        used = set(self.re.findall(r'\btr\(\s*"([\w.]+)"', js))
        for a, b in self.re.findall(r'\btr\([^()]*?\?\s*"([\w.]+)"\s*:\s*"([\w.]+)"\s*\)', js):
            used.update((a, b))
        self.assertTrue(used)
        self.assertEqual(used - self.t_keys, set(), "i18n.js 의 T 에 없는 열쇠")

    def test_template_keys_exist(self):
        html = self.TEMPLATE.read_text(encoding="utf-8")
        used = set(self.re.findall(r'data-i18n(?:-html)?="([\w.]+)"', html))
        for attrs in self.re.findall(r'data-i18n-attr="([^"]+)"', html):
            used.update(pair.split(":")[1] for pair in attrs.split(";"))
        self.assertTrue(used)
        self.assertEqual(used - self.dom_keys, set(), "i18n.js 의 DOM_EN 에 없는 열쇠")

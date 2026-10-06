"""화면 하나, 자료 파일, 명칭 고치기, 상태 점검.

자료는 파이프라인이 만든 파일을 그대로 내준다. 뷰가 자료를 고치거나 합치지 않는다 —
그 일은 파이프라인의 몫이고, 뷰어는 파일이 없을 때 그렇다고 말할 뿐이다. 사람이 고친 명칭은
자료가 아니라 그 위의 덮어쓰기 표라서 따로 둔다(labels.py).
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_http_methods

from . import labels, patchnotes

# 내줄 수 있는 것은 이 꼴뿐이다. 자료 폴더에 무엇이 더 놓여 있어도 밖에 나가지 않는다.
SERVED = {".json": "application/json", ".webp": "image/webp", ".png": "image/png"}
# 목록은 가공할 때마다 바뀌므로 짧게, 시점 파일은 가공 전까지 그대로이므로 길게 둔다.
INDEX_MAX_AGE = 300
FRAME_MAX_AGE = 86400


def load_index():
    path = Path(settings.DATA_DIR) / "index.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def patch_notes():
    """판 이력 — 설정 창의 탭(koprifossillab 039). CHANGELOG.md 는 이미지에 함께 구워지므로 그때그때 읽는다."""
    try:
        return patchnotes.parse((Path(settings.REPO_DIR) / "CHANGELOG.md").read_text(encoding="utf-8"))
    except OSError:
        return []


@require_GET
def map_page(request):
    index = load_index()
    return render(request, "viewer/map.html", {
        "notes": patch_notes(),
        "version": settings.WEGENER_VERSION,
        "has_data": index is not None,
        "frame_count": len(index["frames"]) if index else 0,
        "built_at": index.get("built_at") if index else None,
    })


@require_GET
def data_file(request, relative):
    root = Path(settings.DATA_DIR).resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or path.suffix.lower() not in SERVED or not path.is_file():
        raise Http404("그런 자료가 없다")
    response = FileResponse(open(path, "rb"), content_type=SERVED[path.suffix.lower()])
    max_age = INDEX_MAX_AGE if path.name == "index.json" else FRAME_MAX_AGE
    response["Cache-Control"] = f"public, max-age={max_age}"
    return response


@require_http_methods(["GET", "POST"])
def labels_view(request):
    """GET: 덮어쓰기 표와 고칠 수 있는지. POST {kind, id, name, key}: 한 칸을 고친다(빈 이름은 기본으로)."""
    can_edit, needs_key = labels.editing()
    if request.method == "GET":
        response = JsonResponse({**labels.load(), "editable": can_edit, "needs_key": needs_key})
        response["Cache-Control"] = "no-store"
        return response

    if not can_edit:
        return JsonResponse({"error": "이 서버에서는 명칭을 고칠 수 없다(WEGENER_EDITOR_KEY 가 없다)"}, status=403)
    try:
        body = json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return JsonResponse({"error": "JSON 이 아니다"}, status=400)
    if not labels.key_ok(body.get("key")):
        return JsonResponse({"error": "열쇠가 맞지 않다"}, status=403)
    kind, key = body.get("kind"), body.get("id")
    name = " ".join(str(body.get("name") or "").split())      # 줄바꿈·겹친 빈칸을 하나로
    if kind not in labels.KINDS or not isinstance(key, str):
        return JsonResponse({"error": "고칠 수 없는 칸이다"}, status=400)
    if key not in labels.env_ids(load_index()):
        return JsonResponse({"error": f"그런 칸이 없다: {key}"}, status=400)
    if len(name) > labels.MAX_LENGTH:
        return JsonResponse({"error": f"이름은 {labels.MAX_LENGTH} 자까지다"}, status=400)
    return JsonResponse({**labels.save(kind, key, name), "editable": True, "needs_key": needs_key})


# 주간 갱신(koprifossillab 032)은 매주 월요일에 돈다. 8 일 넘게 소식이 없으면 cron 이 빠진 것으로 본다.
REFRESH_STALE = timedelta(days=8)


def refresh_status():
    """주간 갱신·백업의 마지막 결과 — deploy/host/weekly_refresh.sh 가 `<STATE_DIR>/refresh.json` 에 쓴다(koprifossillab 034).
    (결과, 문제 목록). 파일이 없으면 (None, []) — 아직 설정 전(개발·시험)이라 문제로 치지 않는다."""
    path = Path(settings.STATE_DIR) / "refresh.json"
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, []
    except (OSError, ValueError):
        return {"result": "unreadable"}, ["주간 갱신 결과(refresh.json)를 읽을 수 없다"]
    problems = []
    if result.get("result") != "ok":
        problems.append(f"주간 갱신 실패 — {result.get('step')}: {result.get('note')}")
    if result.get("nas") == "fail":
        problems.append("NAS 백업 실패 — 로컬 백업만 있다")
    try:
        at = datetime.fromisoformat(result["at"])
        if datetime.now(timezone.utc) - at > REFRESH_STALE:
            problems.append(f"주간 갱신이 {REFRESH_STALE.days} 일 넘게 없다(마지막 {result['at']}) — cron 을 본다")
    except (KeyError, TypeError, ValueError):
        problems.append("주간 갱신 결과에 시각이 없다")
    return result, problems


@require_GET
def healthz(request):
    """판 번호와 자료 상태. 자료가 없으면 화면은 뜨지만 쓸 수 없으므로 503 이다.

    목록에 있는데 파일이 없으면(배경·지형·PaleoClim), 또는 주간 갱신·백업이 실패했거나 멈췄으면 degraded 다 —
    무엇 때문인지는 problems 에 적는다. 없는 것이 아니라 아직 설정 전인 것(refresh.json·recent.json 이 없다)은
    문제로 치지 않는다(koprifossillab 034)."""
    index = load_index()
    body = {"app": "WegenersDream", "version": settings.WEGENER_VERSION}
    if index is None:
        body.update(status="no-data", detail="index.json 이 없다 — 파이프라인을 돌린다")
        return JsonResponse(body, status=503)
    data = Path(settings.DATA_DIR)
    frames = index.get("frames", [])
    missing = [f["relief"] for f in frames if not (data / f["relief"]).is_file()]
    missing_terrain = [f["terrain"]["file"] for f in frames
                       if f.get("terrain") and not (data / f["terrain"]["file"]).is_file()]
    # 최근의 절 기온(PaleoClim, tupandactyl 010) — index.json 밖의 목록
    paleoclim = None
    try:
        recent = json.loads((data / "climate" / "recent.json").read_text(encoding="utf-8"))
        snaps = recent.get("snapshots") or []
        paleoclim = {"snapshots": len(snaps),
                     "missing": sum(1 for s in snaps if not (data / s["file"]).is_file())}
    except FileNotFoundError:
        pass
    except (OSError, ValueError, KeyError, TypeError):
        paleoclim = {"snapshots": 0, "missing": 0, "unreadable": True}
    refresh, problems = refresh_status()
    if not frames:
        problems.append("시점이 없다")
    if missing:
        problems.append(f"배경 그림 {len(missing)} 개가 없다")
    if missing_terrain:
        problems.append(f"지형 격자 {len(missing_terrain)} 개가 없다")
    if paleoclim and (paleoclim["missing"] or paleoclim.get("unreadable")):
        problems.append("PaleoClim 기온 그림이 없거나 목록을 읽을 수 없다")
    body.update(
        status="degraded" if problems else "ok",
        frames=len(frames),
        built_at=index.get("built_at"),
        pbdb_retrieved_at=index.get("pbdb", {}).get("receipt", {}).get("retrieved_at"),
        missing_relief=len(missing),
        missing_terrain=len(missing_terrain),
        paleoclim=paleoclim,
        refresh=refresh,
    )
    if problems:
        body["problems"] = problems
    return JsonResponse(body)

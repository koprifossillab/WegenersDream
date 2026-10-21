"""원본 받기와 검증.

Zenodo 의 두 압축본은 매니페스트(sources/*.json)의 크기·SHA-256 과 맞아야만 쓴다.
PBDB 는 계속 자라는 데이터베이스라 미리 고정할 값이 없다 — 받은 것의 크기·SHA-256·
행 수·받은 시각을 receipt.json 에 적어, 어느 날의 PBDB 로 만든 지도인지 남긴다.

받는 중에 끊겨도 반쪽 파일이 제자리에 앉지 않게, 임시 파일에 받고 검증한 뒤 옮긴다.
"""
import csv
import fnmatch
import hashlib
import json
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from .common import ROOT, manifest, source_path

USER_AGENT = "WegenersDream/1 (koprifossillab; paleogeography viewer)"
CHUNK = 1 << 20


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url, target, timeout=600):
    """url 을 target 옆 임시 파일에 받고 그 경로를 돌려준다. 옮기는 것은 부르는 쪽이다."""
    target.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    handle, temp = tempfile.mkstemp(dir=target.parent, suffix=".download")
    received = 0
    with urllib.request.urlopen(request, timeout=timeout) as response, open(handle, "wb") as out:
        while chunk := response.read(CHUNK):
            out.write(chunk)
            received += len(chunk)
            print(f"\r  {target.name}: {received / 1e6:7.1f} MB", end="", flush=True)
    print()
    return Path(temp)


def check_pinned(path, archive):
    size = path.stat().st_size
    if size != archive["bytes"]:
        raise SystemExit(f"{path.name}: 크기 {size} — 매니페스트는 {archive['bytes']}")
    digest = sha256(path)
    if digest != archive["sha256"]:
        raise SystemExit(f"{path.name}: SHA-256 이 매니페스트와 다르다 ({digest})")


def unzip(path, out, patterns=None):
    """patterns(글롭)에 맞는 것만 푼다. 압축본 밖으로 나가는 경로는 거절한다."""
    out.mkdir(parents=True, exist_ok=True)
    root = out.resolve()
    count = 0
    with zipfile.ZipFile(path) as bundle:
        for info in bundle.infolist():
            name = info.filename
            if name.endswith("/") or name.startswith("__MACOSX") or "/._" in name:
                continue
            if patterns and not any(fnmatch.fnmatch(name, p) for p in patterns):
                continue
            dest = (out / name).resolve()
            if not dest.is_relative_to(root):
                raise SystemExit(f"압축본 밖을 가리키는 경로: {name}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            with bundle.open(info) as src, open(dest, "wb") as dst:
                shutil.copyfileobj(src, dst)
            count += 1
    return count


def archives(spec):
    """매니페스트의 압축본들. 하나면 `archive`, 여럿이면 `archives` 에 적는다."""
    return spec.get("archives") or [spec["archive"]]


def fetch_pinned(name):
    spec = manifest(name)
    for archive in archives(spec):
        target = source_path(archive["path"])
        if target.exists():
            check_pinned(target, archive)
            print(f"있음  {archive['path']}")
        else:
            print(f"받기  {spec['title']} ({archive.get('id', '')}, {archive['bytes'] / 1e6:.0f} MB)")
            temp = download(archive["url"], target, timeout=1800)
            try:
                check_pinned(temp, archive)
            except SystemExit:
                temp.unlink(missing_ok=True)
                raise
            temp.replace(target)
        if "unzip" not in archive:
            continue
        out = source_path(archive["unzip"])
        if not out.exists():
            count = unzip(target, out, archive.get("members"))
            print(f"  풀었다: {count} 파일 -> {out.relative_to(ROOT)}")


def fetch_pbdb_intervals(refresh=False):
    """PBDB 시대 이름표 — 산지를 새로 받을 때 함께 새로 받는다(새 이름이 들어올 수 있다)."""
    spec = manifest("pbdb")["intervals"]
    target = source_path(spec["path"])
    if target.exists() and not refresh:
        print(f"있음  {spec['path']}")
        return
    temp = download(spec["url"], target, timeout=300)
    records = json.loads(temp.read_text(encoding="utf-8")).get("records") or []
    if not records or "type" not in records[0]:
        temp.unlink(missing_ok=True)
        raise SystemExit("PBDB 시대 이름표에 type 칸이 없다 — 질의를 확인한다")
    temp.replace(target)
    print(f"  시대 이름 {len(records)} 개")


def fetch_pbdb_taxa(refresh=False):
    """PBDB 유효 속·아속·종 이름표 — 한글 찾기 표(taxa_ko.py)의 원본(tupandactyl 021)."""
    spec = manifest("pbdb")["taxa"]
    target = source_path(spec["path"])
    if target.exists() and not refresh:
        print(f"있음  {spec['path']}")
        return
    temp = download(spec["url"], target, timeout=900)
    head = temp.read_text(encoding="utf-8", errors="replace")[:400]
    if "taxon_name" not in head or "n_occs" not in head:
        temp.unlink(missing_ok=True)
        raise SystemExit("PBDB 이름표에 taxon_name·n_occs 칸이 없다 — 질의를 확인한다")
    temp.replace(target)
    print("  속·종 이름표를 받았다")


# PBDB 사본의 표들 — 같은 때에 받아 **모두 검사한 뒤 한꺼번에** 바꿔 끼운다(koprifossillab 049). 산지·산출·나무가 다른 날의 것이면
# 산출의 산지가 산지 표에 없거나, 나무의 lft 가 산출과 맞지 않는다. (이름, 매니페스트 칸, 있어야 할 열, 받기 시한 초)
PBDB_TABLES = [
    ("collections", "query", ["collection_no", "paleolat"], 1800),
    ("occurrences", "occurrences", ["occurrence_no", "collection_no", "accepted_no", "max_ma"], 3600),
    ("taxonomy", "taxonomy", ["taxon_no", "accepted_no", "lft", "rgt"], 1800),
    ("references", "references", ["reference_no", "formatted"], 1800),
]
SHRINK = 0.95       # 지난 사본의 행 수보다 이만큼 넘게 줄면 받기를 거절한다(PBDB_받기_검토 §3.3)


def count_rows(path):
    """(머리줄, 행 수) — 줄이 아니라 행을 센다. geology_comments 같은 칸에 줄바꿈이 들어 있다."""
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        reader = csv.reader(handle)
        header = next(reader, [])
        return header, sum(1 for _ in reader)


def old_counts(receipt):
    """지난 receipt 의 표마다 행 수. 산지는 맨 위 칸(옛 꼴과 같다), 나머지는 tables 칸."""
    if not receipt.exists():
        return {}
    old = json.loads(receipt.read_text(encoding="utf-8"))
    counts = {name: part.get("records") for name, part in (old.get("tables") or {}).items()}
    counts["collections"] = old.get("records")
    return counts


def fetch_pbdb(refresh=False, allow_shrink=False):
    spec = manifest("pbdb")
    target = source_path(spec["query"]["path"])
    receipt = target.parent / "receipt.json"
    wanted = [t for t in PBDB_TABLES if t[1] in spec]
    have = all(source_path(spec[key]["path"]).exists() for _, key, _, _ in wanted)
    if have and receipt.exists() and not refresh:
        print(f"있음  PBDB 사본 ({json.loads(receipt.read_text())['retrieved_at']} 에 받음)")
        fetch_pbdb_intervals(False)
        fetch_pbdb_taxa(False)
        return
    old = old_counts(receipt)
    retrieved = datetime.now(timezone.utc).isoformat(timespec="seconds")
    temps, parts = {}, {}
    try:
        for name, key, columns, timeout in wanted:
            print(f"받기  PBDB {name} — 서버가 표를 만드는 데 몇 분 걸린다")
            temp = download(spec[key]["url"], source_path(spec[key]["path"]), timeout=timeout)
            temps[name] = temp
            header, rows = count_rows(temp)
            missing = [c for c in columns if c not in header]
            if missing or rows == 0:
                raise SystemExit(f"PBDB {name} 표에 {missing} 칸이 없거나 비었다 — 질의를 확인한다")
            before = old.get(name)
            # 바꿔 끼우기 **전에** 지난 사본과 견준다 — 잘린 표가 원본을 덮으면 다음 주의 기준선까지 내려간다
            if before and rows < before * SHRINK and not allow_shrink:
                raise SystemExit(f"PBDB {name} 가 크게 줄었다({before} → {rows}) — 지난 사본 그대로 둔다. "
                                 "PBDB 가 실제로 정리한 것이면 --allow-shrink")
            parts[name] = {"url": spec[key]["url"], "records": rows}
            print(f"  {name}: {rows} 행")
    except BaseException:
        for temp in temps.values():
            temp.unlink(missing_ok=True)
        raise
    for name, key, _, _ in wanted:
        path = source_path(spec[key]["path"])
        temps[name].replace(path)
        parts[name].update(bytes=path.stat().st_size, sha256=sha256(path))
    collections = parts.pop("collections")
    receipt.write_text(json.dumps({
        "url": collections["url"],
        "retrieved_at": retrieved,
        "bytes": collections["bytes"],
        "sha256": collections["sha256"],
        "records": collections["records"],
        # 같은 때에 받은 사본을 한 이름으로 — 재현 묶음이 이것으로 그 주의 백업을 찾는다(P01 §3.1)
        "snapshot": retrieved[:10].replace("-", "") + "-" + collections["sha256"][:12],
        "tables": parts,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    # 이름표들은 산지를 바꾼 **뒤에** — 산지 받기가 실패하면 새 이름표와 지난 산지가 짝이 되던 것(PBDB_받기_검토 §3.7)
    fetch_pbdb_intervals(True)
    fetch_pbdb_taxa(True)


def fetch_receipted(name, refresh=False):
    """고정할 값이 없는 파일(판이 오르는 것) — 받고, 받은 날의 크기·SHA-256 을 receipt 에 적는다."""
    spec = manifest(name)["download"]
    target = source_path(spec["path"])
    receipt = target.parent / "receipt.json"
    if target.exists() and receipt.exists() and not refresh:
        print(f"있음  {spec['path']}")
    else:
        print(f"받기  {manifest(name)['title']}")
        download(spec["url"], target).replace(target)
        receipt.write_text(json.dumps({
            "url": spec["url"],
            "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "bytes": target.stat().st_size, "sha256": sha256(target),
        }, indent=2) + "\n", encoding="utf-8")
    out = source_path(spec["unzip"])
    if not out.exists() or refresh:
        print(f"  풀었다: {unzip(target, out)} 파일")


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    fetch_pinned("paleodem")
    fetch_pinned("paleocoastlines")
    fetch_pinned("paleotemp")
    fetch_pinned("paleoclim")        # 최근의 절 기온(tupandactyl 010) — SHA-256 으로 고정된 원본이라 다른 Zenodo 것과 같이 받는다
    fetch_receipted("countries")
    fetch_pbdb(refresh="--refresh-pbdb" in argv, allow_shrink="--allow-shrink" in argv)


if __name__ == "__main__":
    main()

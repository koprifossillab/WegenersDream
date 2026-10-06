"""`CHANGELOG.md` 를 설정 창의 "판 이력" 탭이 쓸 꼴로 읽는다(koprifossillab 039, GSM 의 patchnotes 를 본떴다).

마크다운 라이브러리를 들이지 않는다 — 읽을 것은 우리가 쓴 문서 하나이고 꼴이 정해져 있다:

    ## 1.1.3 — 2026-10-06 · `feature/mobile-find`

    머리 다음의 문단(있으면)

    - **무엇** — 어떻게 (koprifossillab 038)
      이어지는 줄

돌려주는 것: `[{"version", "date", "lead", "items": [html, …]}, …]`. 항목의 `**굵게**`·`` `코드` `` 만 HTML 로 바꾸고
나머지는 이스케이프한다. 판 머리의 브랜치 이름은 화면에 쓸모가 없어 버린다.
"""
import re

from django.utils.html import escape

#: 판 머리는 판 번호만 보고 가른다 — 날짜를 빼먹은 판도 머리로 잡혀야 통째로 사라지지 않는다(GSM 에서 겪었다)
HEAD = re.compile(r"^##\s+v?(?P<version>\d+(?:\.\d+)+)\s*(?P<rest>.*)$")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
BOLD = re.compile(r"\*\*(.+?)\*\*")
CODE = re.compile(r"`([^`]+)`")
LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")


def inline(text):
    """한 줄의 마크다운을 화면용 HTML 로 — 링크는 글자만 남긴다(저장소 안의 상대 경로라 화면에서 열리지 않는다)."""
    html = escape(LINK.sub(r"\1", text))
    html = BOLD.sub(r"<b>\1</b>", html)
    return CODE.sub(r"<code>\1</code>", html)


def parse(text):
    notes, current = [], None
    for raw in text.splitlines():
        line = raw.rstrip()
        head = HEAD.match(line.strip())
        if head:
            date = DATE.search(head.group("rest"))
            current = {"version": head.group("version"), "date": date.group(0) if date else "", "lead": "", "items": []}
            notes.append(current)
            continue
        if current is None or not line.strip():
            continue
        stripped = line.strip()
        if stripped.startswith("- "):
            current["items"].append(stripped[2:].strip())
        elif current["items"] and raw.startswith(" "):
            current["items"][-1] += " " + stripped              # 들여 쓴 줄은 앞 항목의 이어짐
        else:
            current["lead"] = (current["lead"] + " " + stripped).strip()
    for n in notes:
        n["lead"] = inline(n["lead"])
        n["items"] = [inline(i) for i in n["items"]]
    return notes

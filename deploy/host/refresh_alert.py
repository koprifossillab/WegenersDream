#!/usr/bin/env python3
"""주간 갱신이 실패했거나 아예 안 돌았으면 Microsoft Teams 로 알린다 (tupandactyl 032).

paleoadmin 의 crontab 에서 월요일 08:00 에 돈다 — 주간 갱신(02:30) 뒤에 따로 돌아서, 갱신 스크립트가 중간에 죽거나
cron 이 안 돈 것도 잡는다. 결과가 ok 이고 오늘 것이면 아무것도 안 보낸다.

    deploy/host/refresh_alert.py                 지난 결과를 보고 문제가 있으면 보낸다
    deploy/host/refresh_alert.py --dry-run       보낼 글만 찍는다
    deploy/host/refresh_alert.py --test          시험 글을 보낸다(웹훅이 맞는지 볼 때)

웹훅 주소는 저장소에 두지 않는다 — `WEGENER_TEAMS_WEBHOOK` 환경변수, 없으면
`~/.config/wegenersdream/teams_webhook`(chmod 600) 파일의 첫 줄. Teams 채널의 "Workflows → 웹후크 요청을 받으면 채널에 게시"
로 만든 주소다. 표준 라이브러리만 쓴다(cron 의 python3 로 돈다).
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import sys
import urllib.request

LAST = pathlib.Path("/data/WegenersDream/logs/last_refresh.json")
WEBHOOK_FILE = pathlib.Path.home() / ".config" / "wegenersdream" / "teams_webhook"
MAX_AGE_HOURS = 24   # 02:30 갱신을 08:00 에 본다 — 하루보다 오래된 결과면 이번 주는 안 돈 것이다


def problem(last_path, now, max_age_hours=MAX_AGE_HOURS):
    """알릴 문제를 한 줄로, 없으면 None."""
    try:
        record = json.loads(pathlib.Path(last_path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return f"결과 파일이 없다 ({last_path}) — 주간 갱신이 한 번도 안 돌았거나 자리가 바뀌었다", None
    except (OSError, ValueError) as error:
        return f"결과 파일을 못 읽었다 ({last_path}): {error}", None
    try:
        at = dt.datetime.fromisoformat(record["at"])
    except (KeyError, TypeError, ValueError):
        return f"결과 파일에 시각이 없다: {record}", record
    hours = (now - at).total_seconds() / 3600
    if hours > max_age_hours:
        return f"이번 주 갱신이 안 돌았다 — 마지막 결과가 {hours:.0f} 시간 전({record['at']})", record
    if record.get("result") != "ok":
        return f"갱신 실패 — 단계 {record.get('step')}: {record.get('note')}", record
    if record.get("nas") not in ("ok", "skip", "", None):
        return f"갱신은 됐지만 NAS 백업이 안 됐다: {record.get('nas')}", record
    return None, record


def card(title, lines):
    """Teams Workflows 웹훅이 받는 적응형 카드."""
    body = [{"type": "TextBlock", "text": title, "weight": "Bolder", "size": "Medium", "wrap": True}]
    body += [{"type": "TextBlock", "text": line, "wrap": True, "spacing": "Small"} for line in lines]
    return {"type": "message", "attachments": [{
        "contentType": "application/vnd.microsoft.card.adaptive",
        "content": {"$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard", "version": "1.4", "body": body}}]}


def webhook():
    url = os.environ.get("WEGENER_TEAMS_WEBHOOK", "").strip()
    if not url and WEBHOOK_FILE.exists():
        url = WEBHOOK_FILE.read_text(encoding="utf-8").strip().splitlines()[0].strip()
    return url


def send(url, payload):
    request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                     headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.status


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--last", default=str(LAST))
    parser.add_argument("--max-age-hours", type=float, default=MAX_AGE_HOURS)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args(argv)

    now = dt.datetime.now().astimezone()
    if args.test:
        title, lines = "Wegener's Dream — 알림 시험", [f"{now.isoformat(timespec='seconds')} paleoserver 에서 보냈다"]
    else:
        what, record = problem(args.last, now, args.max_age_hours)
        if what is None:
            print(f"{now.isoformat(timespec='seconds')} ok — 알릴 것 없음")
            return 0
        title = "⚠️ Wegener's Dream 주간 갱신 문제"
        lines = [what, "운영은 지난 자료로 돈다. 로그: /data/WegenersDream/logs/weekly_refresh.log",
                 "확인: http://172.16.116.98/WegenersDream/healthz"]
        if record:
            lines.append(f"결과: {json.dumps(record, ensure_ascii=False)}")
    payload = card(title, lines)
    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
        return 0
    url = webhook()
    if not url:
        print(f"{now.isoformat(timespec='seconds')} 웹훅 주소가 없다 — WEGENER_TEAMS_WEBHOOK 또는 {WEBHOOK_FILE}: {title} / {lines[0]}",
              file=sys.stderr)
        return 2
    status = send(url, payload)
    print(f"{now.isoformat(timespec='seconds')} 보냈다 ({status}): {lines[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

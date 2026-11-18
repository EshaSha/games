import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
SKIP_CATEGORIES = {"software", "digitalextras"}
SKIP_TITLE_PATTERNS = (r"\bdemo\b", r"\bbeta\b", r"\bpublic testing\b", r"\bplaytest\b")
SKIP_DEV = "epic dev test account"
EDITION_WORDS = {
    "enhanced", "redux", "definitive", "complete", "gold", "deluxe",
    "ultimate", "remastered", "goty", "edition", "game", "of", "the", "year",
}
IMAGE_ORDER = ("DieselGameBoxTall", "DieselGameBox", "Thumbnail", "Featured")


def norm_title(title):
    text = title.lower().replace("ё", "е")
    text = re.sub(r"[®™©]", "", text)
    text = re.sub(r"[^0-9a-zа-я]+", " ", text)
    words = [w for w in text.split() if w not in EDITION_WORDS]
    return " ".join(words)


def pick_cover(images):
    by_type = {}
    for image in images:
        by_type.setdefault(image.get("type"), image.get("url"))
    for kind in IMAGE_ORDER:
        if by_type.get(kind):
            return by_type[kind]
    return images[0].get("url") if images else ""


def load_steam_titles():
    raw = (ROOT / "games.js").read_text(encoding="utf-8")
    payload = raw.split("=", 1)[1].strip().rstrip(";")
    return {norm_title(game["title"]) for game in json.loads(payload)}


def main():
    exe = shutil.which("legendary")
    if not exe:
        sys.exit("legendary не найден: установите legendary-gl и войдите через legendary auth")

    result = subprocess.run(
        [exe, "list", "--json"],
        capture_output=True,
        text=True,
        check=True,
    )
    items = json.loads(result.stdout)
    steam_keys = load_steam_titles()

    rows = []
    for item in items:
        meta = item.get("metadata") or {}
        title = (item.get("app_title") or meta.get("title") or "").strip()
        if not title:
            continue

        categories = {c.get("path") for c in meta.get("categories", [])}
        if categories & SKIP_CATEGORIES:
            continue

        lower = title.lower()
        if any(re.search(pattern, lower) for pattern in SKIP_TITLE_PATTERNS):
            continue

        if (meta.get("developer") or "").strip().lower() == SKIP_DEV:
            continue

        if norm_title(title) in steam_keys:
            continue

        cover = pick_cover(meta.get("keyImages") or [])
        if not cover:
            continue

        rows.append({
            "title": title,
            "cover": cover,
            "url": "https://store.epicgames.com/ru/search?q=" + quote(title),
        })

    seen = set()
    unique = []
    for row in sorted(rows, key=lambda r: r["title"].lower()):
        key = norm_title(row["title"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)

    body = json.dumps(unique, ensure_ascii=False, indent=2)
    (ROOT / "epic.js").write_text(f"const EPIC_GAMES = {body};\n", encoding="utf-8")
    print(f"Epic: {len(unique)} игр добавлено, {len(items) - len(unique)} пропущено")


if __name__ == "__main__":
    main()

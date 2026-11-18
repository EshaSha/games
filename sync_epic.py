import json
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKIP_CATEGORIES = {"software", "digitalextras"}
SKIP_TITLE_PATTERNS = (r"\bdemo\b", r"\bbeta\b", r"\bpublic testing\b", r"\bplaytest\b")
SKIP_DEV = "epic dev test account"
EXCLUDE_TITLES = {"Dauntless", "Spellbreak"}
MANUAL_URLS = {"Fortnite": "https://store.epicgames.com/p/fortnite"}
EDITION_WORDS = {
    "enhanced", "redux", "definitive", "complete", "gold", "deluxe",
    "ultimate", "remastered", "goty", "edition", "game", "of", "the", "year",
}
IMAGE_ORDER = ("DieselGameBoxTall", "DieselGameBox", "Thumbnail", "Featured")
GENRE_MAP = {
    "Экшены": "Экшен",
    "Приключенческие игры": "Приключения",
    "Ролевые игры": "RPG",
    "Стратегии": "Стратегия",
    "Симуляторы": "Симулятор",
    "Казуальные игры": "Казуальная",
    "Инди": "Инди",
    "Ранний доступ": None,
    "Гонки": "Гонки",
    "Спорт": "Спорт",
    "Массовая многопользовательская": "MMO",
    "Бесплатные": "Free-to-play",
    "Выживание": "Выживание",
    "Хоррор": "Хоррор",
}
STEAM_SEARCH = "https://store.steampowered.com/api/storesearch/"
STEAM_DETAILS = "https://store.steampowered.com/api/appdetails"
STEAM_APP = "https://store.steampowered.com/app/{}/"
MANUAL_STEAM_IDS = {
    "Death Stranding": 1190460,
    "Nioh: The Complete Edition": 485510,
    "Pillars of Eternity - Definitive Edition": 291650,
    "Surviving Mars": 464920,
    "Ведьмак 3: Дикая Охота — Обновлённое издание": 292030,
    "Doors - Paradox": 1622770,
    "Everything": 582270,
    "Pine": 1042780,
    "Rocket League®": 252950,
}
DETAILS_CACHE = {}


def norm_title(title):
    text = title.lower().replace("ё", "е")
    text = re.sub(r"[®™©]", "", text)
    text = re.sub(r"[^0-9a-zа-я]+", " ", text)
    words = [w for w in text.split() if w not in EDITION_WORDS]
    return " ".join(words)


def fetch_json(url, params=None):
    target = url + ("?" + urllib.parse.urlencode(params) if params else "")
    request = urllib.request.Request(target, headers={"User-Agent": "Mozilla/5.0"})
    data = {}
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
            break
        except Exception:
            time.sleep(2 + attempt * 2)
    time.sleep(0.4)
    return data


def find_steam_appid(title):
    data = fetch_json(STEAM_SEARCH, {"term": title, "l": "russian", "cc": "ru"})
    target = norm_title(title)
    for item in data.get("items", [])[:10]:
        if item.get("type") != "app":
            continue
        if norm_title(item.get("name", "")) == target:
            return item.get("id")
    return None


def steam_details(appid):
    if appid not in DETAILS_CACHE:
        data = fetch_json(STEAM_DETAILS, {"appids": appid, "l": "russian", "cc": "us"})
        DETAILS_CACHE[appid] = (data.get(str(appid)) or {}).get("data") or {}
    return DETAILS_CACHE[appid]


def manual_appid(title):
    appid = MANUAL_STEAM_IDS.get(title)
    if not appid:
        return None
    name = steam_details(appid).get("name")
    if name and norm_title(name) == norm_title(title):
        return appid
    return None


def steam_genres(appid):
    details = steam_details(appid)
    genres = []
    for genre in details.get("genres", []):
        name = genre.get("description", "")
        mapped = GENRE_MAP.get(name, name)
        if mapped and mapped not in genres:
            genres.append(mapped)
    return genres[:3]


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

    result = subprocess.run([exe, "list", "--json"], capture_output=True, text=True, check=True)
    items = json.loads(result.stdout)
    steam_keys = load_steam_titles()

    rows = []
    for item in items:
        meta = item.get("metadata") or {}
        title = (item.get("app_title") or meta.get("title") or "").strip()
        if not title or title in EXCLUDE_TITLES:
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

        if title in MANUAL_URLS:
            url = MANUAL_URLS[title]
            genres = []
        else:
            appid = find_steam_appid(title) or manual_appid(title)
            if appid:
                url = STEAM_APP.format(appid)
                genres = steam_genres(appid)
            else:
                url = "https://store.epicgames.com/ru/search?q=" + urllib.parse.quote(title)
                genres = []

        rows.append({
            "title": title,
            "cover": cover,
            "url": url,
            "genres": genres,
            "source": "epic",
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

    matched = sum(1 for row in unique if "steampowered.com/app/" in row["url"])
    print(f"Epic: {len(unique)} игр, из них {matched} со ссылкой на Steam, {len(items) - len(unique)} пропущено")


if __name__ == "__main__":
    main()

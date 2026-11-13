const STATUS_LABELS = {
  playing: "Играю",
  played: "Играл(а)",
  completed: "Пройдено",
  backlog: "В планах",
  dropped: "Брошено"
};

const numberFormat = new Intl.NumberFormat("ru-RU");

const state = {
  query: "",
  status: "all",
  sort: "title"
};

const els = {
  grid: document.getElementById("grid"),
  chips: document.getElementById("chips"),
  search: document.getElementById("search"),
  sort: document.getElementById("sort"),
  count: document.getElementById("count"),
  empty: document.getElementById("empty"),
  total: document.getElementById("stat-total"),
  hours: document.getElementById("stat-hours"),
  playing: document.getElementById("stat-playing"),
  backlog: document.getElementById("stat-backlog")
};

function posterUrl(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
}

function headerUrl(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

function storeUrl(appid) {
  return `https://store.steampowered.com/app/${appid}/`;
}

function gameHours(game) {
  return Number.isFinite(game.hours) ? game.hours : 0;
}

function gameRating(game) {
  return Number.isFinite(game.rating) ? Math.max(0, Math.min(5, game.rating)) : 0;
}

function matchesQuery(game) {
  if (!state.query) {
    return true;
  }

  const haystack = [game.title, ...(game.genres || [])].join(" ").toLowerCase();
  return haystack.includes(state.query);
}

function byTitle(a, b) {
  return String(a.title).localeCompare(String(b.title), "ru", { sensitivity: "base" });
}

function compareGames(a, b) {
  if (state.sort === "hours") {
    return gameHours(b) - gameHours(a) || byTitle(a, b);
  }

  if (state.sort === "rating") {
    return gameRating(b) - gameRating(a) || byTitle(a, b);
  }

  return byTitle(a, b);
}

function buildChips() {
  const entries = [["all", "Все", GAMES.length]];

  for (const [key, label] of Object.entries(STATUS_LABELS)) {
    entries.push([key, label, GAMES.filter((game) => game.status === key).length]);
  }

  for (const [key, label, count] of entries) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.status = key;
    chip.setAttribute("aria-pressed", String(key === state.status));

    const name = document.createElement("span");
    name.textContent = label;

    const amount = document.createElement("span");
    amount.className = "chip-count";
    amount.textContent = String(count);

    chip.append(name, amount);
    chip.addEventListener("click", () => {
      state.status = key;
      syncChips();
      render();
    });

    els.chips.append(chip);
  }
}

function syncChips() {
  for (const chip of els.chips.querySelectorAll(".chip")) {
    chip.setAttribute("aria-pressed", String(chip.dataset.status === state.status));
  }
}

function makeStars(rating) {
  const wrap = document.createElement("span");
  wrap.className = "stars";
  wrap.setAttribute("role", "img");
  wrap.setAttribute("aria-label", `Оценка ${rating} из 5`);

  for (let i = 0; i < 5; i += 1) {
    const star = document.createElement("span");
    star.textContent = "★";
    if (i >= rating) {
      star.className = "off";
    }
    wrap.append(star);
  }

  return wrap;
}

function makeCard(game, index) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.setProperty("--i", String(index));

  const poster = document.createElement("div");
  poster.className = "poster";

  const fallback = document.createElement("div");
  fallback.className = "poster-fallback";
  fallback.textContent = String(game.title).slice(0, 1).toUpperCase();
  poster.append(fallback);

  if (game.appid) {
    const img = document.createElement("img");
    img.src = posterUrl(game.appid);
    img.alt = `Обложка игры ${game.title}`;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      if (img.dataset.fallback) {
        img.remove();
      } else {
        img.dataset.fallback = "1";
        img.src = headerUrl(game.appid);
      }
    });
    poster.append(img);
  }

  const statusKey = STATUS_LABELS[game.status] ? game.status : "backlog";
  const badge = document.createElement("span");
  badge.className = `badge badge--${statusKey}`;
  badge.textContent = STATUS_LABELS[statusKey];
  poster.append(badge);

  const body = document.createElement("div");
  body.className = "card-body";

  const title = document.createElement("h2");
  if (game.appid) {
    const link = document.createElement("a");
    link.href = storeUrl(game.appid);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = game.title;
    title.append(link);
  } else {
    title.textContent = game.title;
  }

  const genres = document.createElement("p");
  genres.className = "genres";
  genres.textContent = (game.genres || []).join(" · ");

  const note = document.createElement("p");
  note.className = "note";
  note.textContent = game.note || "";

  const foot = document.createElement("div");
  foot.className = "card-foot";

  const hours = document.createElement("span");
  hours.className = "hours";
  hours.textContent = gameHours(game) > 0 ? `${numberFormat.format(gameHours(game))} ч` : "—";

  if (gameRating(game) > 0) {
    foot.append(makeStars(gameRating(game)));
  }
  foot.append(hours);

  body.append(title);
  if (genres.textContent) {
    body.append(genres);
  }
  if (note.textContent) {
    body.append(note);
  }
  body.append(foot);
  card.append(poster, body);

  return card;
}

function render() {
  const visible = GAMES
    .filter((game) => state.status === "all" || game.status === state.status)
    .filter(matchesQuery)
    .sort(compareGames);

  els.grid.replaceChildren(...visible.map(makeCard));
  els.empty.hidden = visible.length > 0;

  els.count.textContent = state.query || state.status !== "all"
    ? `Показано ${visible.length} из ${GAMES.length}`
    : `Игр в коллекции: ${GAMES.length}`;
}

function renderStats() {
  const hours = GAMES.reduce((sum, game) => sum + gameHours(game), 0);
  const playing = GAMES.filter((game) => game.status === "playing").length;
  const backlog = GAMES.filter((game) => game.status === "backlog").length;

  els.total.textContent = String(GAMES.length);
  els.hours.textContent = numberFormat.format(hours);
  els.playing.textContent = String(playing);
  els.backlog.textContent = String(backlog);
}

els.search.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  render();
});

els.sort.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

buildChips();
renderStats();
render();

const numberFormat = new Intl.NumberFormat("ru-RU");

const state = {
  query: "",
  sort: "title"
};

const els = {
  grid: document.getElementById("grid"),
  search: document.getElementById("search"),
  sort: document.getElementById("sort"),
  count: document.getElementById("count"),
  empty: document.getElementById("empty"),
  total: document.getElementById("stat-total"),
  hours: document.getElementById("stat-hours")
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

  return byTitle(a, b);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch (error) {
    return false;
  }
}

function makeCopyButton(title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy";
  button.textContent = "Копировать";

  button.addEventListener("click", async () => {
    const copied = await copyText(title);
    button.textContent = copied ? "Скопировано" : "Не удалось";
    button.classList.toggle("is-done", copied);

    window.clearTimeout(button.resetTimer);
    button.resetTimer = window.setTimeout(() => {
      button.textContent = "Копировать";
      button.classList.remove("is-done");
    }, 1600);
  });

  return button;
}

function makeCard(game, index) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.setProperty("--i", String(index));

  const link = document.createElement("a");
  link.className = "poster-link";
  link.href = storeUrl(game.appid);
  link.target = "_blank";
  link.rel = "noopener";
  link.setAttribute("aria-label", `Открыть ${game.title} в Steam`);

  const fallback = document.createElement("span");
  fallback.className = "poster-fallback";
  fallback.textContent = String(game.title).slice(0, 1).toUpperCase();

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

  link.append(fallback, img);

  const body = document.createElement("div");
  body.className = "card-body";

  const title = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.href = storeUrl(game.appid);
  titleLink.target = "_blank";
  titleLink.rel = "noopener";
  titleLink.textContent = game.title;
  title.append(titleLink);

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

  foot.append(hours, makeCopyButton(game.title));

  body.append(title);
  if (genres.textContent) {
    body.append(genres);
  }
  if (note.textContent) {
    body.append(note);
  }
  body.append(foot);
  card.append(link, body);

  return card;
}

function render() {
  const visible = GAMES
    .filter(matchesQuery)
    .sort(compareGames);

  els.grid.replaceChildren(...visible.map(makeCard));
  els.empty.hidden = visible.length > 0;

  els.count.textContent = state.query
    ? `Показано ${visible.length} из ${GAMES.length}`
    : `Игр в списке: ${GAMES.length}`;
}

function renderStats() {
  const hours = GAMES.reduce((sum, game) => sum + gameHours(game), 0);

  els.total.textContent = String(GAMES.length);
  els.hours.textContent = numberFormat.format(hours);
}

els.search.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  render();
});

els.sort.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

renderStats();
render();

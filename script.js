const SHEET_ID = "1ONwBn4d9IoWHiklWhbyj_oyQ6TmwM2REOyLI8EYudzc";
const SHEET_NAME = "Sheet1";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
const REMOTE_AI_API_URL = "https://trading-aces-chatbot.vercel.app/api/chat";

const form = document.querySelector("#chatForm");
const input = document.querySelector("#userInput");
const sendButton = document.querySelector("#sendButton");
const messages = document.querySelector("#messages");
const statusPill = document.querySelector("#connectionStatus");
const suggestions = document.querySelectorAll(".suggestion");

let cachedCards = null;

function addMessage(role, text, isLoading = false) {
  const message = document.createElement("article");
  message.className = `message ${role}${isLoading ? " loading" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "You" : "TA";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  setBubbleContent(bubble, text, role);

  message.append(avatar, bubble);
  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInlineMarkdown(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function formatAssistantReply(text) {
  const lines = String(text).split(/\r?\n/);
  const html = [];
  let inList = false;

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      return;
    }

    const bulletMatch = trimmed.match(/^\*+\s+(.+)$/) || trimmed.match(/^-\s+(.+)$/);
    if (bulletMatch) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInlineMarkdown(bulletMatch[1])}</li>`);
      return;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
  });

  if (inList) {
    html.push("</ul>");
  }

  return html.join("");
}

function setBubbleContent(bubble, text, role = "assistant") {
  if (role === "assistant") {
    bubble.innerHTML = formatAssistantReply(text);
  } else {
    bubble.textContent = text;
  }
}

function setBusy(isBusy) {
  sendButton.disabled = isBusy;
  input.disabled = isBusy;
  sendButton.textContent = isBusy ? "Sending" : "Send";
}

function setStatus(text, hasError = false) {
  statusPill.classList.toggle("error", hasError);
  statusPill.innerHTML = `<span aria-hidden="true"></span> ${text}`;
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function rowsToCards(rows) {
  const [headers, ...dataRows] = rows;
  if (!headers) return [];

  return dataRows.map((row) => {
    const card = {};
    headers.forEach((header, index) => {
      card[header.trim()] = (row[index] || "").trim();
    });
    return card;
  });
}

async function loadCards() {
  const response = await fetch(SHEET_CSV_URL);
  if (!response.ok) {
    throw new Error("I could not read the live Google Sheet.");
  }

  const csvText = await response.text();
  const cards = rowsToCards(parseCsv(csvText));
  cachedCards = cards;
  return cards;
}

function numberValue(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function yesNo(value) {
  return String(value || "").toLowerCase() === "yes";
}

function isInStock(card) {
  return numberValue(card["Stock Count"]) > 0;
}

function isInventoryQuestion(message) {
  const text = message.toLowerCase();
  const terms = [
    "card", "cards", "stock", "available", "price", "cost", "rare", "rarity",
    "quality", "grade", "graded", "rookie", "autograph", "autographed", "signed",
    "memorabilia", "patch", "relic", "soccer", "basketball", "baseball",
    "football", "hockey", "tennis", "sport", "player", "team", "under", "over"
  ];
  return terms.some((term) => text.includes(term));
}

function filterCards(cards, message) {
  const text = message.toLowerCase();
  let results = cards.filter(isInStock);

  const sports = ["soccer", "basketball", "baseball", "american football", "football", "hockey", "tennis"];
  const sport = sports.find((item) => text.includes(item));
  if (sport) {
    results = results.filter((card) => card.Sport.toLowerCase().includes(sport === "football" ? "football" : sport));
  }

  if (text.includes("rookie")) {
    results = results.filter((card) => yesNo(card["Rookie Card"]));
  }

  if (text.includes("auto") || text.includes("signed") || text.includes("autograph")) {
    results = results.filter((card) => yesNo(card.Autographed));
  }

  if (text.includes("memorabilia") || text.includes("patch") || text.includes("relic")) {
    results = results.filter((card) => yesNo(card.Memorabilia));
  }

  if (text.includes("rare")) {
    results = results.filter((card) => numberValue(card["Rarity Score"]) >= 75 || /rare|legendary/i.test(card["Rarity Tier"]));
  }

  const underMatch = text.match(/(?:under|below|less than)\s*\$?(\d+(?:\.\d+)?)/);
  if (underMatch) {
    const maxPrice = Number.parseFloat(underMatch[1]);
    results = results.filter((card) => numberValue(card["Price USD"]) <= maxPrice);
  }

  const overMatch = text.match(/(?:over|above|more than)\s*\$?(\d+(?:\.\d+)?)/);
  if (overMatch) {
    const minPrice = Number.parseFloat(overMatch[1]);
    results = results.filter((card) => numberValue(card["Price USD"]) >= minPrice);
  }

  const directMatches = results.filter((card) => {
    const searchable = [
      card["Card Name"],
      card["Player Name"],
      card.Sport,
      card.League,
      card["Team/Nation"],
      card["Set/Series"],
      card.Tags
    ].join(" ").toLowerCase();

    return text.split(/\s+/).filter((word) => word.length > 3).some((word) => searchable.includes(word));
  });

  if (directMatches.length > 0 && !sport && !underMatch && !overMatch && !text.includes("rookie") && !text.includes("rare")) {
    results = directMatches;
  }

  return results.sort((a, b) => numberValue(b["Rarity Score"]) - numberValue(a["Rarity Score"]));
}

function formatCard(card) {
  const details = [
    card.Sport,
    `$${card["Price USD"]}`,
    `${card["Stock Count"]} in stock`,
    card["Rarity Tier"],
    yesNo(card["Rookie Card"]) ? "rookie" : "",
    yesNo(card.Autographed) ? "autographed" : "",
    card.Grade ? `${card["Grading Company"]} ${card.Grade}` : ""
  ].filter(Boolean);

  return `- ${card["Card Name"]} (${details.join(", ")})`;
}

function buildLocalReply(message, cards) {
  if (!isInventoryQuestion(message)) {
    return "I can only help with Trading Aces sports cards that are currently in stock. Try asking about a sport, price range, rookies, rarity, autographs, or graded cards.";
  }

  const results = filterCards(cards, message);
  if (results.length === 0) {
    return "I could not find any matching Trading Aces cards currently in stock. Try a broader search, such as rookie cards, basketball under $75, or autographed cards.";
  }

  const shown = results.slice(0, 6);
  const intro = results.length === 1
    ? "I found this in-stock card:"
    : `I found ${results.length} matching in-stock cards. Here are the best matches:`;

  return `${intro}\n\n${shown.map(formatCard).join("\n")}`;
}

async function askServerlessAi(message) {
  const apiUrl = window.location.hostname.endsWith("github.io") ? REMOTE_AI_API_URL : "/api/chat";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "The chat service is not available right now.");
  }

  return data.reply;
}

async function sendMessage(text) {
  const message = text.trim();
  if (!message) return;

  addMessage("user", message);
  input.value = "";
  setBusy(true);

  const loadingMessage = addMessage("assistant", "Checking the live card sheet...", true);
  const loadingBubble = loadingMessage.querySelector(".bubble");

  try {
    const reply = await askServerlessAi(message);
    loadingMessage.classList.remove("loading");
    setBubbleContent(loadingBubble, reply);
    setStatus("Gemini + live sheet");
  } catch (error) {
    loadingMessage.classList.remove("loading");
    setBubbleContent(loadingBubble, `${error.message} Please check the Vercel Gemini deployment and try again.`);
    setStatus("Gemini needs attention", true);
  } finally {
    setBusy(false);
    input.focus();
    messages.scrollTop = messages.scrollHeight;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

suggestions.forEach((button) => {
  button.addEventListener("click", () => {
    sendMessage(button.textContent);
  });
});

loadCards()
  .then(() => setStatus("Gemini + live sheet"))
  .catch(() => setStatus("Needs attention", true));

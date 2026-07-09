const SHEET_ID = "1ONwBn4d9IoWHiklWhbyj_oyQ6TmwM2REOyLI8EYudzc";
const SHEET_NAME = "Sheet1";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
  if (!headers || headers.length === 0) {
    return [];
  }

  return dataRows.map((row) => {
    const card = {};
    headers.forEach((header, index) => {
      card[header.trim()] = (row[index] || "").trim();
    });
    return card;
  });
}

async function loadCards() {
  const response = await fetch(SHEET_CSV_URL, {
    headers: { "User-Agent": "Trading-Aces-Help-Centre/1.0" }
  });

  if (!response.ok) {
    throw new Error("Could not read the Google Sheet.");
  }

  const csvText = await response.text();
  return rowsToCards(parseCsv(csvText));
}

function compactCard(card) {
  return {
    sku: card.SKU,
    cardName: card["Card Name"],
    playerName: card["Player Name"],
    description: card.Description,
    sport: card.Sport,
    league: card.League,
    teamOrNation: card["Team/Nation"],
    year: card.Year,
    set: card["Set/Series"],
    rarityTier: card["Rarity Tier"],
    rarityScore: card["Rarity Score"],
    qualityScore: card["Quality Score"],
    condition: card.Condition,
    gradingCompany: card["Grading Company"],
    grade: card.Grade,
    serialNumber: card["Serial Number"],
    autographed: card.Autographed,
    memorabilia: card.Memorabilia,
    rookieCard: card["Rookie Card"],
    variant: card["Parallel/Variant"],
    priceUsd: card["Price USD"],
    stockCount: card["Stock Count"],
    stockStatus: card["Stock Status"],
    tags: card.Tags
  };
}

async function askGemini({ message, cards }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in the deployment environment.");
  }

  const inStockCards = cards
    .filter((card) => Number(card["Stock Count"] || 0) > 0)
    .map(compactCard);

  const systemInstruction = [
    "You are the Trading Aces card help centre chatbot.",
    "Only answer questions about Trading Aces sports trading cards that are available in stock.",
    "Use only the live inventory data provided in the prompt. Do not invent cards, prices, grades, stock counts, or policies.",
    "If the user asks about anything outside the card inventory, politely say you can only help with Trading Aces cards currently in stock.",
    "If a card is not in the in-stock inventory, say it is not currently available in stock.",
    "Keep answers concise, helpful, and customer-friendly.",
    "Format answers cleanly for a web chat bubble. Avoid nested bullet lists. Prefer short paragraphs or a simple flat bullet list.",
    "When recommending cards, include card name, sport, price, stock count, and one relevant detail such as rarity, grade, rookie status, autograph, or memorabilia."
  ].join(" ");

  const input = [
    `Live in-stock inventory JSON:\n${JSON.stringify(inStockCards)}`,
    `Customer question: ${message}`
  ].join("\n\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: input }]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const messageText = data.error?.message || "The AI service returned an error.";
    throw new Error(messageText);
  }

  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim()
    || "I could not produce a response from the live inventory.";

  return text;
}

module.exports = async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Only POST requests are supported." });
    return;
  }

  try {
    const message = String(request.body?.message || "").trim();
    if (!message) {
      response.status(400).json({ error: "Please enter a question about Trading Aces cards." });
      return;
    }

    const cards = await loadCards();
    if (cards.length === 0) {
      response.status(502).json({ error: "The live card sheet is empty or unavailable." });
      return;
    }

    const reply = await askGemini({ message, cards });
    response.status(200).json({ reply, cardCount: cards.length });
  } catch (error) {
    response.status(500).json({ error: error.message || "Something went wrong." });
  }
};

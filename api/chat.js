const SHEET_ID = "1JhSODtviGHzXru6Eb5MhfXfVIF5vtJk3pclzzv7j2l4";
const SHEET_NAME = "Untitled";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const HOLIDAY_COUNTRY_CODE = "IE";

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

function rowsToRecords(rows) {
  const [headers, ...dataRows] = rows;
  if (!headers || headers.length === 0) {
    return [];
  }

  const cleanHeaders = headers.map((header) => header.trim());
  return dataRows.map((row) => {
    const record = {};
    cleanHeaders.forEach((header, index) => {
      if (header) {
        record[header] = (row[index] || "").trim();
      }
    });
    return record;
  });
}

async function loadServices() {
  const response = await fetch(SHEET_CSV_URL, {
    headers: { "User-Agent": "Meadow-Vet-Care-Assistant/1.0" }
  });

  if (!response.ok) {
    throw new Error("Could not read the Meadow Vet Care Google Sheet.");
  }

  const csvText = await response.text();
  return rowsToRecords(parseCsv(csvText));
}

function getIrelandYear() {
  const formatter = new Intl.DateTimeFormat("en-IE", {
    timeZone: "Europe/Dublin",
    year: "numeric"
  });
  return Number(formatter.format(new Date()));
}

async function loadIrishPublicHolidays() {
  const currentYear = getIrelandYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const holidayLists = await Promise.all(years.map(async (year) => {
    const url = `https://date.nager.at/api/v4/Holidays/${HOLIDAY_COUNTRY_CODE}/${year}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Meadow-Vet-Care-Assistant/1.0" }
    });

    if (!response.ok) {
      throw new Error("Could not read the Irish public holiday service.");
    }

    const holidays = await response.json();
    return holidays.map((holiday) => ({
      date: holiday.date,
      name: holiday.name,
      countryCode: holiday.countryCode,
      nationalHoliday: holiday.nationalHoliday,
      holidayTypes: holiday.holidayTypes
    }));
  }));

  return holidayLists.flat();
}

function compactService(service) {
  return {
    service_id: service.service_id,
    category: service.category,
    species: service.species,
    service_name: service.service_name,
    description: service.description,
    price_eur: service.price_eur,
    duration_min: service.duration_min,
    requires_appointment: service.requires_appointment,
    availability: service.availability,
    slots_this_week: service.slots_this_week,
    special_offer: service.special_offer
  };
}

async function askGemini({ message, services, holidays }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in the deployment environment.");
  }

  const serviceData = services.map(compactService);
  const systemInstruction = [
    "You are the Meadow Vet Care AI assistant for a modern Irish veterinary clinic.",
    "Answer only using the live Meadow Vet Care services data and live Irish public holiday data provided in the prompt.",
    "The clinic serves dogs, cats, rabbits, small mammals, and birds when those services are present in the sheet.",
    "Use only facts that can be derived from the services sheet or the Irish public holiday lookup. Do not invent clinic policies, ordinary opening hours, prices, discounts, availability, medical advice, or weather guidance.",
    "Meadow Vet Care is closed for routine services on Irish public holidays. Emergency services remain available 24/7 when the sheet lists emergency services with 24/7 availability.",
    "If the user asks whether the clinic is open on a date that matches an Irish public holiday, clearly say routine services are closed for that holiday and emergency care remains 24/7.",
    "If the user asks about a date that is not in the supplied Irish public holiday list, do not call it a public holiday.",
    "If the user asks about anything outside the sheet or holiday lookup, politely say you can only help with Meadow Vet Care service information and Irish public holiday closure checks from live data.",
    "For medical urgency or animal distress, advise contacting Meadow Vet Care or an emergency vet promptly, but do not diagnose.",
    "When giving service information, include service name, species, category, price_eur, duration_min, appointment requirement, availability, slots_this_week, and any special_offer when relevant.",
    "Report price_eur values exactly as listed in the sheet. Do not reinterpret, correct, round, or convert unusual prices.",
    "Format answers cleanly for a web chat bubble. Avoid nested bullet lists. Prefer short paragraphs or a simple flat bullet list."
  ].join(" ");

  const input = [
    `Live Meadow Vet Care services JSON:\n${JSON.stringify(serviceData)}`,
    `Live Irish public holidays JSON:\n${JSON.stringify(holidays)}`,
    `Current date in Ireland: ${new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", dateStyle: "full" }).format(new Date())}`,
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

  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim()
    || "I could not produce a response from the live Meadow Vet Care services sheet.";
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
      response.status(400).json({ error: "Please enter a question about Meadow Vet Care services." });
      return;
    }

    const [services, holidays] = await Promise.all([
      loadServices(),
      loadIrishPublicHolidays()
    ]);

    if (services.length === 0) {
      response.status(502).json({ error: "The live Meadow Vet Care services sheet is empty or unavailable." });
      return;
    }

    const reply = await askGemini({ message, services, holidays });
    response.status(200).json({ reply, serviceCount: services.length, holidayCount: holidays.length });
  } catch (error) {
    response.status(500).json({ error: error.message || "Something went wrong." });
  }
};

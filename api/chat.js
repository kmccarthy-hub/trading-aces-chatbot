const SHEET_ID = "1JhSODtviGHzXru6Eb5MhfXfVIF5vtJk3pclzzv7j2l4";
const SHEET_NAME = "Untitled";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const HOLIDAY_COUNTRY_CODE = "IE";
const WEATHER_FORECAST_DAYS = 3;

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

function isWeatherQuestion(message) {
  const text = message.toLowerCase();
  const terms = [
    "weather", "hot", "heat", "cold", "rain", "raining", "wind", "windy",
    "storm", "thunder", "snow", "ice", "icy", "frost", "uv", "sun", "sunny",
    "outside", "outdoor", "walk", "walking", "run", "park", "hike", "exercise",
    "pavement", "too warm", "too wet", "too cold"
  ];
  return terms.some((term) => text.includes(term));
}

function cleanLocationCandidate(value) {
  return String(value || "")
    .replace(/\b(today|tomorrow|now|right now|this morning|this afternoon|this evening|tonight|over the next.*|for my.*|with my.*|for a.*|with a.*|please)\b.*$/i, "")
    .replace(/[?.!,]+$/g, "")
    .trim();
}

function extractLocation(message) {
  const text = String(message || "");
  const prepositionMatch = text.match(/\b(?:in|near|around|at|for)\s+([A-Za-zÀ-ÿ' .-]{2,})/i);
  if (prepositionMatch) {
    const candidate = cleanLocationCandidate(prepositionMatch[1]);
    if (candidate.length >= 2) {
      return candidate;
    }
  }

  const knownPlaces = [
    "Dublin", "Cork", "Galway", "Limerick", "Waterford", "Kilkenny", "Sligo",
    "Athlone", "Drogheda", "Dundalk", "Bray", "Navan", "Ennis", "Tralee",
    "Killarney", "Wexford", "Letterkenny", "Maynooth", "Naas", "Ireland"
  ];

  return knownPlaces.find((place) => new RegExp(`\\b${place}\\b`, "i").test(text)) || "";
}

async function geocodeLocation(location) {
  const params = new URLSearchParams({
    name: location,
    count: "1",
    language: "en",
    format: "json"
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`, {
    headers: { "User-Agent": "Meadow-Vet-Care-Assistant/1.0" }
  });

  if (!response.ok) {
    throw new Error("Could not look up that weather location.");
  }

  const data = await response.json();
  const result = data.results?.[0];
  if (!result) {
    return null;
  }

  return {
    requestedLocation: location,
    name: result.name,
    admin1: result.admin1,
    country: result.country,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone
  };
}

async function loadWeather(location) {
  const geocoded = await geocodeLocation(location);
  if (!geocoded) {
    return null;
  }

  const params = new URLSearchParams({
    latitude: String(geocoded.latitude),
    longitude: String(geocoded.longitude),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "showers",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "wind_gusts_10m",
      "is_day"
    ].join(","),
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "rain",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "uv_index"
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "apparent_temperature_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "uv_index_max"
    ].join(","),
    forecast_days: String(WEATHER_FORECAST_DAYS),
    timezone: "auto"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    headers: { "User-Agent": "Meadow-Vet-Care-Assistant/1.0" }
  });

  if (!response.ok) {
    throw new Error("Could not read the live weather forecast.");
  }

  const weather = await response.json();
  return {
    source: "Open-Meteo",
    forecastLimitDays: WEATHER_FORECAST_DAYS,
    location: geocoded,
    units: {
      temperature: weather.current_units?.temperature_2m,
      windSpeed: weather.current_units?.wind_speed_10m,
      precipitation: weather.current_units?.precipitation,
      uvIndex: "index"
    },
    current: weather.current,
    hourly: weather.hourly,
    daily: weather.daily
  };
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

async function askGemini({ message, services, holidays, weather }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in the deployment environment.");
  }

  const serviceData = services.map(compactService);
  const systemInstruction = [
    "You are the Meadow Vet Care AI assistant for a modern Irish veterinary clinic.",
    "Answer only using the live Meadow Vet Care services data, live Irish public holiday data, and live weather data provided in the prompt.",
    "The clinic serves dogs, cats, rabbits, small mammals, and birds when those services are present in the sheet.",
    "Use only facts that can be derived from the services sheet, Irish public holiday lookup, or weather lookup. Do not invent clinic policies, ordinary opening hours, prices, discounts, availability, medical advice, public holiday dates, or weather conditions.",
    "Meadow Vet Care is closed for routine services on Irish public holidays. Emergency services remain available 24/7 when the sheet lists emergency services with 24/7 availability.",
    "If the user asks whether the clinic is open on a date that matches an Irish public holiday, clearly say routine services are closed for that holiday and emergency care remains 24/7.",
    "If the user asks about a date that is not in the supplied Irish public holiday list, do not call it a public holiday.",
    "For weather-related animal engagement questions, use the live weather data only. Give practical, cautious suggestions such as shorter walks, cooler times of day, indoor enrichment, hydration, shade, avoiding hot pavement, avoiding high winds, or delaying outdoor activity during heavy rain or storms.",
    "Weather forecasts are limited to today plus the next 3 days. If the user asks beyond that range, say you can only check up to 3 days ahead.",
    "If no weather data is supplied, do not answer weather questions; ask the user for a location.",
    "If the user asks about anything outside the sheet, holiday lookup, or weather lookup, politely say you can only help with Meadow Vet Care service information, Irish public holiday closure checks, and weather-based pet engagement guidance from live data.",
    "For medical urgency or animal distress, advise contacting Meadow Vet Care or an emergency vet promptly, but do not diagnose.",
    "When giving service information, include service name, species, category, price_eur, duration_min, appointment requirement, availability, slots_this_week, and any special_offer when relevant.",
    "Report price_eur values exactly as listed in the sheet. Do not reinterpret, correct, round, or convert unusual prices.",
    "Format answers cleanly for a web chat bubble. Avoid nested bullet lists. Prefer short paragraphs or a simple flat bullet list."
  ].join(" ");

  const input = [
    `Live Meadow Vet Care services JSON:\n${JSON.stringify(serviceData)}`,
    `Live Irish public holidays JSON:\n${JSON.stringify(holidays)}`,
    `Live weather JSON, if requested:\n${JSON.stringify(weather || null)}`,
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

    const wantsWeather = isWeatherQuestion(message);
    const weatherLocation = wantsWeather ? extractLocation(message) : "";
    if (wantsWeather && !weatherLocation) {
      response.status(200).json({
        reply: "What location should I check the weather for? I can look at current conditions and a forecast up to 3 days ahead.",
        needsLocation: true
      });
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

    const weather = wantsWeather ? await loadWeather(weatherLocation) : null;
    if (wantsWeather && !weather) {
      response.status(200).json({
        reply: `I could not find weather data for "${weatherLocation}". Please try a town, city, or county name.`,
        needsLocation: true
      });
      return;
    }

    const reply = await askGemini({ message, services, holidays, weather });
    response.status(200).json({
      reply,
      serviceCount: services.length,
      holidayCount: holidays.length,
      weatherLocation: weather?.location || null
    });
  } catch (error) {
    response.status(500).json({ error: error.message || "Something went wrong." });
  }
};

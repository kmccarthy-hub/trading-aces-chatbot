const SHEET_ID = "1JhSODtviGHzXru6Eb5MhfXfVIF5vtJk3pclzzv7j2l4";
const SHEET_NAME = "Untitled";
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;
const REMOTE_AI_API_URL = "https://trading-aces-chatbot.vercel.app/api/chat";

const form = document.querySelector("#chatForm");
const input = document.querySelector("#userInput");
const sendButton = document.querySelector("#sendButton");
const messages = document.querySelector("#messages");
const statusPill = document.querySelector("#connectionStatus");
const suggestions = document.querySelectorAll(".suggestion");

function addMessage(role, text, isLoading = false) {
  const message = document.createElement("article");
  message.className = `message ${role}${isLoading ? " loading" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "You" : "MVC";

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

async function checkLiveSheet() {
  const response = await fetch(SHEET_CSV_URL);
  if (!response.ok) {
    throw new Error("The live Meadow Vet Care sheet could not be reached.");
  }
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
    throw new Error(data.error || "The Meadow Vet Care AI service is not available right now.");
  }

  return data.reply;
}

async function sendMessage(text) {
  const message = text.trim();
  if (!message) return;

  addMessage("user", message);
  input.value = "";
  setBusy(true);

  const loadingMessage = addMessage("assistant", "Checking the live Meadow Vet Care services sheet...", true);
  const loadingBubble = loadingMessage.querySelector(".bubble");

  try {
    const reply = await askServerlessAi(message);
    loadingMessage.classList.remove("loading");
    setBubbleContent(loadingBubble, reply);
    setStatus("Gemini + live services");
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

checkLiveSheet()
  .then(() => setStatus("Gemini + live services"))
  .catch(() => setStatus("Needs attention", true));

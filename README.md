# Meadow Vet Care AI Assistant

This is a GitHub Pages submission site for Meadow Vet Care. The visible webpage is hosted on GitHub Pages and calls a Vercel API route, which keeps the Gemini API key private.

The AI assistant reads the live Meadow Vet Care Google Sheet, checks Irish public holidays from a live holiday API, and answers only from those data sources.

## Live URLs

GitHub Pages submission URL:

```text
https://kmccarthy-hub.github.io/meadow-vet-care/
```

Private Gemini backend:

```text
https://trading-aces-chatbot.vercel.app/api/chat
```

## Sheet

```text
https://docs.google.com/spreadsheets/d/1JhSODtviGHzXru6Eb5MhfXfVIF5vtJk3pclzzv7j2l4/edit?usp=sharing
```

Tab name:

```text
Untitled
```

## Files

- `index.html` - webpage structure
- `styles.css` - Meadow Vet Care styling
- `script.js` - browser chat behaviour
- `api/chat.js` - Vercel serverless Gemini endpoint

## Public Holiday Lookup

The backend checks Irish public holidays through Nager.Date:

```text
https://date.nager.at/api/v4/Holidays/IE/{year}
```

Routine services are treated as closed on Irish public holidays. Emergency services remain available 24/7 when listed in the services sheet.

## Vercel Environment Variables

```text
GEMINI_API_KEY=your_google_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

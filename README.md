# Trading Aces AI Help Centre

This is a chatbot webpage for Trading Aces. The GitHub Pages frontend calls the Vercel API route, which reads the live Google Sheet and uses Gemini to answer questions about in-stock cards.

## Files

- `index.html` - webpage structure
- `styles.css` - sports-themed styling
- `script.js` - browser chat behaviour
- `api/chat.js` - Vercel serverless Gemini endpoint

## GitHub Pages

Live site:

```text
https://kmccarthy-hub.github.io/trading-aces-chatbot/
```

The GitHub Pages site calls this private Gemini backend:

```text
https://trading-aces-chatbot.vercel.app/api/chat
```

## Vercel environment variables

Add this in Vercel before deploying:

```text
GEMINI_API_KEY=your_google_gemini_api_key
```

Optional:

```text
GEMINI_MODEL=gemini-3.5-flash
```

The Google Sheet must stay viewable by anyone with the link, and the inventory tab must be named `Sheet1`.

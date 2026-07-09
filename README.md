# Trading Aces Help Centre

This is a Vercel-ready chatbot webpage for Trading Aces. The chat endpoint reads live card inventory from the public Google Sheet, then uses Gemini to answer only questions about cards currently in stock.

## Files

- `index.html` - webpage structure
- `styles.css` - sports-themed styling
- `script.js` - browser chat behaviour
- `api/chat.js` - Vercel serverless chatbot endpoint

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

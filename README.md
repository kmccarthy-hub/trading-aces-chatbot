# Trading Aces Help Centre

This is a chatbot webpage for Trading Aces. It works on GitHub Pages by reading live card inventory from the public Google Sheet in the browser. It can also use the Vercel API route with Gemini when deployed on Vercel.

## Files

- `index.html` - webpage structure
- `styles.css` - sports-themed styling
- `script.js` - browser chat behaviour and GitHub Pages live-sheet assistant
- `api/chat.js` - optional Vercel serverless Gemini endpoint

## GitHub Pages

Live site:

```text
https://kmccarthy-hub.github.io/trading-aces-chatbot/
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

require('dotenv').config();
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const serviceAccount = require("./agouliel-sign-in-firebase-adminsdk-fbsvc-6fe2b7993f.json");
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(process.env.CLIENT_ID, process.env.CLIENT_SECRET, "postmessage");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Initialize SQLite Database
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) console.error("Database opening error:", err);
  console.log("Connected to SQLite database.");
});

// Create Users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    photo TEXT,
    token_id TEXT,
    tokens TEXT,
    last_login DATETIME
  )
`);

const app = express();
app.use(cors());
app.use(express.json());

// Middleware to verify Firebase ID Tokens
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).send("Unauthorized");

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(403).send("Invalid Token");
  }
};

app.post("/api/save-calendar-token", authenticate, async (req, res) => {
  const { uid, name, email, picture } = req.user;
  const token = req.headers.authorization?.split(" ")[1];

  // Save or Update user in SQLite
  const query = `
      INSERT INTO users (id, name, email, photo, token_id, last_login)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
      name = EXCLUDED.name,
      photo = EXCLUDED.photo,
      token_id = EXCLUDED.token_id,
      last_login = CURRENT_TIMESTAMP
  `;

  db.run(query, [uid, name, email, picture, token], (err) => {
    if (err) {
      console.error("Database Save Error:", err);
      return res.status(500).json({ error: "Failed to save user" });
    }

    const { tokens } = req.body;
    const updateQuery = `
      UPDATE users
      SET tokens = ?, last_login = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    db.run(updateQuery, [JSON.stringify(tokens), uid], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Refresh token saved successfully!" });
    });
  });
});

app.get("/api/calendar", authenticate, async (req, res) => {
  db.get("SELECT tokens FROM users WHERE id = ?", [req.user.uid], async (err, row) => {
    if (!row || !row.tokens) return res.status(404).send({"error":"No tokens found"});

    const tokens = JSON.parse(row.tokens);
    oauth2Client.setCredentials(tokens);

    // Google library automatically handles refreshing the access_token 
    // if a refresh_token is present in the credentials!
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    var date = new Date();

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date(date.getFullYear(), date.getMonth(), 1).toISOString(),
        timeMax: new Date(date.getFullYear(), date.getMonth()+1, 0).toISOString(),
        maxResults: 2500,
        singleEvents: true,
        q: '#',
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      // Filter events to get only expenses
      const filteredExpenses = events.reduce((acc, event) => {
        const summary = event.summary || "";
        const parts = summary.trim().split(/\s+/); // Split by any whitespace

        if (parts.length >= 2) {
          const firstWord = parts[0];
          const lastWord = parts[parts.length - 1];

          // Check if first word is numeric (handles 10 or 10.50)
          const isNumeric = !isNaN(firstWord) && !isNaN(parseFloat(firstWord));
          // Check if last word is a hashtag
          const isHashtag = lastWord.startsWith('#');

          if (isNumeric && isHashtag) {
            acc.push({
              id: event.id,
              user: req.user.uid,
              // Extract YYYY-MM-DD from dateTime or date (for all-day events)
              date_start: (event.start.dateTime || event.start.date).substring(0, 10),
              hashtag: lastWord.substring(1), // Remove the '#'
              summary: parts.slice(1, -1).join(' '), // Everything between amount and hashtag
              amount: parseFloat(firstWord),
              url: event.htmlLink
            });
          }
        }
        return acc;
      }, []);

      //res.json(filteredExpenses);

      // Initialize Pivot and Maps
      const pivot = {}; // { category: { month: total } }
      const expense_map = {}; // { "category|month": [details] }
      const totals_by_month = Array(12).fill(0).reduce((acc, _, i) => ({ ...acc, [i + 1]: 0 }), {});
      const totals_by_category = {};
      const years = new Set();

      // Populate Pivot and Maps
      filteredExpenses.forEach(exp => {
        const month = parseInt(exp.date_start.substring(5, 7));
        const year = exp.date_start.substring(0, 4);
        const category = exp.hashtag || "Uncategorized";
        years.add(year);

        // Init category in pivot if new
        if (!pivot[category]) {
          pivot[category] = Array(12).fill(0).reduce((acc, _, i) => ({ ...acc, [i + 1]: 0 }), {});
        }

        // Add to Pivot
        pivot[category][month] += exp.amount;

        // Add to Expense Map (the detail drill-down)
        const mapKey = `${category}|${month}`;
        if (!expense_map[mapKey]) expense_map[mapKey] = [];
        current_expense = {
          id: exp.id,
          summary: exp.summary,
          amount: exp.amount,
          url: exp.url,
          date: exp.date_start
        }
        expense_map[mapKey].push(current_expense);

        // Add to Totals
        totals_by_month[month] += exp.amount;
        totals_by_category[category] = (totals_by_category[category] || 0) + exp.amount;
      });

      // Return structured context
      const context = {
        pivot,
        totals_by_month,
        totals_by_category,
        expense_map,
        years: Array.from(years).sort(),
        months: [
          [1, "Jan"], [2, "Feb"], [3, "Mar"], [4, "Apr"],  [5, "May"], [6, "Jun"],
          [7, "Jul"], [8, "Aug"], [9, "Sep"], [10, "Oct"], [11, "Nov"], [12, "Dec"]
        ]
      }
      res.json(context);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

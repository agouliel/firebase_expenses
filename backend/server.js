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
    token TEXT,
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

app.get("/api/data", authenticate, (req, res) => {
    const { uid, name, email, picture } = req.user;
    const token = req.headers.authorization?.split(" ")[1];

    // Save or Update user in SQLite
    const query = `
        INSERT INTO users (id, name, email, photo, token, last_login)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        photo = excluded.photo,
        token = excluded.token,
        last_login = CURRENT_TIMESTAMP
    `;

    db.run(query, [uid, name, email, picture, token], (err) => {
        if (err) {
            console.error("Database Save Error:", err);
            return res.status(500).json({ error: "Failed to save user" });
        }
        
        //res.json({ message: `Hello, ${req.user.name}! This data is protected.` });
        res.json({ 
            message: "User and Token saved to SQLite.",
            user: req.user 
        });
    });
});

app.post("/api/save-calendar-token", authenticate, async (req, res) => {
  //console.log("Incoming Body:", req.body);
  const { code } = req.body; // The Auth Code from the frontend
  const { uid } = req.user;

  try {
    // Exchange the code for tokens
    const { tokens } = req.body;
    
    // tokens contains access_token and refresh_token
    const query = `
      UPDATE users 
      SET token = ?, last_login = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;

    // Store the full tokens object as a string
    db.run(query, [JSON.stringify(tokens), uid], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Refresh token saved successfully!" });
    });
  } catch (error) {
    //console.error("Token Exchange Error:", error.message);
    //res.status(500).json({ error: "Failed to exchange code" });
    console.error("Full Google Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error_description || error.message });
  }
});

app.get("/api/calendar", authenticate, async (req, res) => {
  db.get("SELECT token FROM users WHERE id = ?", [req.user.uid], async (err, row) => {
    if (!row || !row.token) return res.status(404).send("No tokens found");

    const tokens = JSON.parse(row.token);
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

      // Translate your Python logic to JavaScript
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

      //console.log(filteredExpenses);
      res.json(filteredExpenses);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

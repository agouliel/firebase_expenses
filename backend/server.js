const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const serviceAccount = require("./agouliel-sign-in-firebase-adminsdk-fbsvc-6fe2b7993f.json");

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

app.listen(5001, () => console.log("Server running on port 5001"));

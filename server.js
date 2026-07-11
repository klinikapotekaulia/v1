const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve static files from root directory
app.use(express.static(__dirname));

// Serve a config endpoint if needed for environment-based Firebase config (optional/fallback)
app.get('/api/config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDXuiTRwHttekv5iy6rk8RJA_pVL25v-U4",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "klinikapotekaulia-61641.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "klinikapotekaulia-61641",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "klinikapotekaulia-61641.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "857781555251",
    appId: process.env.FIREBASE_APP_ID || "1:857781555251:web:33dbb41f292026f9ef9346"
  });
});

// Fallback all other requests to index.html for SPA/routing support
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

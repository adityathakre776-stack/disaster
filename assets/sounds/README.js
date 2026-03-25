/**
 * generate_alert.js — Generates a Web Audio-based alert tone
 * Run this once in the browser console to generate the alert sound
 *
 * The app also has an inline audio generation fallback in app.js
 */

// The app generates the alert tone programmatically in the browser
// using the Web Audio API — no external file needed
// This file documents the tone parameters:

// Alert Tone: 880Hz + 660Hz alternating for 0.4s each, 2 cycles
// Saved as: assets/sounds/alert.mp3
// The PHP backend can serve this, OR the frontend generates it inline.

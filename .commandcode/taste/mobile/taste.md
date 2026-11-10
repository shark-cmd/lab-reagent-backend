# Mobile

- Mobile work must be additive: the Expo app lives in a new `mobile/` directory and reuses the existing FastAPI backend unchanged — never modify `backend/` or `frontend/` for mobile work. Confidence: 0.8
- Preferred mobile stack: Expo SDK 58 + expo-router with Drawer navigation mirroring the web sidebar, NativeWind v4 + Tailwind v3 for styling, full screen parity with the web app, and a bias toward Expo Go-compatible modules. Confidence: 0.7

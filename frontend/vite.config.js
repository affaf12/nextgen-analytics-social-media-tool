import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages par agar yeh "username.github.io/repo-name" ke tarah project site
// ke tor par host ho (username.github.io wali main site nahi), to build ke waqt
// VITE_BASE_PATH env var set karo, e.g. "/affaf-crm-frontend/" (aage/peeche slash zaroori).
// GitHub Actions workflow (.github/workflows/deploy.yml) yeh khud set kar deta hai.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 5173,
  },
})

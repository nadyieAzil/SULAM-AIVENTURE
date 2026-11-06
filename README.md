# AI MathMentor – Pembantu Matematik Pintar

A local, free AI maths tutor for Form 1–3 students (KSSM), with a BM/English interface.

## How to run
1. Install **Ollama**: https://ollama.com/download (free).
2. Double-click **`start.bat`**. The first run downloads the AI models (about 5 GB).
3. The app opens at http://127.0.0.1:8000

## Features
| Feature | How it works |
|---|---|
| Tutor Chat (step-by-step hints) | Local LLM `qwen2.5:7b` via Ollama, Socratic prompt |
| Mistake checker | "Semak Kesilapan" mode compares the student's working against common mistakes |
| RAG | `data/notes.json` notes are embedded with `nomic-embed-text`, and the closest notes are added to the prompt |
| Adaptive practice | Generated questions for 10 topics × 3 levels. 3 correct in a row → level up, 2 wrong in a row → level down |
| Progress & badges | Saved in the browser (`localStorage`), no database |

## Project structure
- `app.py` – FastAPI backend (chat streaming, RAG, health check)
- `data/notes.json` – syllabus notes and common mistakes (teachers can edit this)
- `static/js/adaptive.js` – question generators and mastery model
- `static/js/app.js` – the user interface
- `static/css/style.css` – the design system

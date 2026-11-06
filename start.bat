@echo off
title AI MathMentor
cd /d "%~dp0"
echo [1/3] Installing Python packages...
python -m pip install -q -r requirements.txt
echo [2/3] Starting Ollama and checking AI models...
start "Ollama" /min ollama serve
timeout /t 3 >nul
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
echo [3/3] Starting AI MathMentor at http://127.0.0.1:8000
start "" http://127.0.0.1:8000
python app.py

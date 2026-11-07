@echo off
title AI MathMentor
cd /d "%~dp0"

echo [1/3] Setting up Python virtual environment...
if not exist ".venv" (
    echo Creating virtual environment in .venv...
    python -m venv .venv
)
call .venv\Scripts\activate.bat 2>nul || (
    echo Note: Virtual environment activation skipped, using system Python.
)

echo [2/3] Installing Python dependencies...
python -m pip install -q -r requirements.txt

rem Optional local Ollama check for baseline development
where ollama >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [Optional] Ollama detected. If you use local models, ensure 'ollama serve' is active.
) else (
    echo [Optional] Ollama not found. Online hosted LLM or practice mode will be used.
)

echo [3/3] Starting AI MathMentor at http://127.0.0.1:8000
start "" http://127.0.0.1:8000
python app.py

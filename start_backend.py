#!/usr/bin/env python3
"""
start_backend.py
Run this script to install dependencies and start the MedAI backend server.
"""
import subprocess
import sys
import os

def run(cmd, **kwargs):
    print(f"\n>>> {' '.join(cmd)}")
    return subprocess.run(cmd, **kwargs)

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(script_dir, "backend")

    print("=" * 60)
    print("  MedAI Platform - Backend Startup")
    print("=" * 60)

    # Install deps
    print("\n[1/2] Installing Python dependencies...")
    run([sys.executable, "-m", "pip", "install", "-r",
         os.path.join(backend_dir, "requirements.txt")])

    # Start server
    print("\n[2/2] Starting FastAPI server on http://localhost:8000 ...")
    print("      Press Ctrl+C to stop.\n")
    os.chdir(backend_dir)
    run([sys.executable, "-m", "uvicorn", "main:app",
         "--host", "0.0.0.0", "--port", "8000", "--reload"])

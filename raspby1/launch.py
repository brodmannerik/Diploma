#!/usr/bin/env python3
import subprocess
import time
import os

BASE_DIR = os.path.expanduser("~/Desktop/RunBackendOnly4/")
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
FRONTEND_URL = "http://localhost:5173"

def run():
    # Start backend (npm start)
    backend = subprocess.Popen(
        ["npm", "start"],
        cwd=BACKEND_DIR,
        stdout=open(os.path.join(BASE_DIR, "backend.log"), "w"),
        stderr=subprocess.STDOUT
    )
    print("[+] Backend starting...")

    # Start frontend (npm run dev)
    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=FRONTEND_DIR,
        stdout=open(os.path.join(BASE_DIR, "frontend.log"), "w"),
        stderr=subprocess.STDOUT
    )
    print("[+] Frontend starting...")

    # Wait for services to be ready
    print("[*] Waiting for services to initialize...")
    time.sleep(8)

    # Launch Chromium in kiosk mode
    print("[+] Launching kiosk mode...")
    kiosk = subprocess.Popen([
        "chromium-browser",
        "--kiosk",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-translate",
        "--disable-extensions",
        "--disable-sync",
        "--metrics-recording-only",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
        FRONTEND_URL
    ])

    print("[+] Kiosk mode launched. Press Ctrl+C to stop.\n")

    try:
        backend.wait()
    except KeyboardInterrupt:
        print("\n[-] Shutting down...")
        kiosk.terminate()
        frontend.terminate()
        backend.terminate()
        print("[-] All processes stopped.")

if __name__ == "__main__":
    run()

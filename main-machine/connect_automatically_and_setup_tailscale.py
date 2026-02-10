"""

The installation ran on the local university network.
The university has a login pop-up, so I had to write a script that establishes a direct connection.
I also had to use a tunnel so that the various devices could communicate with each other.

"""

import json
import subprocess
import time
import requests
import socket
import sys

# ============================================================
# NETZWERK LOGIN FUNKTIONEN
# ============================================================

TRIGGER_URL = "http://captive.apple.com/hotspot-detect.html"
SESSION_URL = "https://hotspot.vodafone.de/api/v4/session"
LOGIN_URL = "https://hotspot.vodafone.de/api/v4/login"

def wait_for_ip():
    """Wartet, bis Windows eine IP-Adresse hat"""
    print("Warte auf IP-Adresse...")
    max_attempts = 30
    attempt = 0
    
    while attempt < max_attempts:
        try:
            # Hole den Hostnamen
            hostname = socket.gethostname()
            # Versuche IP-Adresse zu bekommen
            ip = socket.gethostbyname(hostname)
            
            # 127.0.0.1 ist Loopback, nicht das was wir wollen
            if ip and ip != "127.0.0.1":
                print(f"IP-Adresse gefunden: {ip}")
                return True
        except:
            pass
        
        attempt += 1
        time.sleep(2)
    
    print("Keine IP-Adresse nach 60 Sekunden gefunden.")
    return False

def trigger_dns_and_login():
    print("Starte Login-Prozess...")
    
    try:
        print("Sende Trigger-Anfrage (http)...")
        requests.get(TRIGGER_URL, timeout=5, allow_redirects=True)
    except Exception as e:
        print(f"Trigger ausgelöst (Fehler erwartet): {e}")
    
    time.sleep(3)
    
    try:
        print(f"Versuche Session von {SESSION_URL} zu holen...")
        response = requests.get(SESSION_URL, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        session_id = data.get("session")
        
        if not session_id:
            print("Keine Session-ID im JSON gefunden.")
            return False
            
        print(f"Session ID: {session_id}")
        
        params = {
            "loginProfile": "6",
            "accessType": "termsOnly",
            "sessionID": session_id,
            "action": "redirect",
            "portal": "bayern"
        }
        login_response = requests.get(LOGIN_URL, params=params, timeout=10)
        
        if login_response.status_code == 200:
            print("Login Request erfolgreich gesendet.")
            return True
        
    except requests.exceptions.ConnectionError as e:
        print(f"Verbindungsfehler (DNS?): {e}")
    except Exception as e:
        print(f"Allgemeiner Fehler: {e}")
        
    return False

def check_internet():
    """Prüft ob Internet verfügbar ist"""
    try:
        requests.get("https://www.google.com", timeout=3)
        return True
    except:
        return False

# ============================================================
# TAILSCALE AUTO-CONNECT (WINDOWS)
# ============================================================

def ensure_tailscale_connected():
    """Stellt sicher, dass Tailscale verbunden ist (Windows Version)"""
    print("\n" + "="*60)
    print("PRÜFE TAILSCALE VERBINDUNG")
    print("="*60)
    
    # Pfad zu Tailscale unter Windows
    tailscale_path = r"C:\Program Files\Tailscale\tailscale.exe"
    
    try:
        # Prüfe Tailscale Status
        result = subprocess.run([tailscale_path, 'status'], 
                              capture_output=True, 
                              text=True, 
                              timeout=5)
        
        if result.returncode == 0 and result.stdout:
            print("✓ Tailscale ist bereits verbunden")
            print("="*60)
            return True
    except FileNotFoundError:
        print(f"✗ Tailscale nicht gefunden unter: {tailscale_path}")
        print("Bitte installiere Tailscale von: https://tailscale.com/download/windows")
        print("="*60)
        return False
    except Exception as e:
        print(f"Status-Prüfung fehlgeschlagen: {e}")
    
    # Wenn nicht verbunden, versuche zu verbinden
    print("Starte Tailscale Verbindung...")
    try:
        subprocess.run([tailscale_path, 'up'], 
                      timeout=30,
                      check=False)
        
        time.sleep(5)
        
        # Prüfe erneut
        result = subprocess.run([tailscale_path, 'status'], 
                              capture_output=True, 
                              text=True, 
                              timeout=5)
        
        if result.returncode == 0:
            print("✓ Tailscale erfolgreich verbunden")
            print("="*60)
            return True
        else:
            print("✗ Tailscale Verbindung fehlgeschlagen")
            print("="*60)
            return False
            
    except Exception as e:
        print(f"✗ Fehler beim Verbinden: {e}")
        print("="*60)
        return False

# ============================================================
# HAUPTPROGRAMM
# ============================================================

def main():
    print("="*60)
    print("BAYERN WLAN + TAILSCALE AUTO-CONNECT (WINDOWS)")
    print("="*60)
    
    # Warte auf IP
    if not wait_for_ip():
        print("Fehler: Keine IP-Adresse erhalten.")
        return
    
    # Versuche Internet-Zugang
    print("\nPrüfe Internet-Zugang...")
    if not check_internet():
        print("Kein Internet gefunden. Starte Bayern WLAN Login...")
        if trigger_dns_and_login():
            # Warte kurz und prüfe erneut
            time.sleep(5)
            if check_internet():
                print("✓ Internet-Zugang erfolgreich!")
            else:
                print("✗ Login möglicherweise fehlgeschlagen.")
    else:
        print("✓ Internet bereits verfügbar!")
    
    # Tailscale verbinden
    ensure_tailscale_connected()
    
    print("\n" + "="*60)
    print("FERTIG!")
    print("="*60)

if __name__ == "__main__":
    main()

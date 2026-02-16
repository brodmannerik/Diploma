import subprocess
import time
import requests

# ============================================================
# NETZWERK LOGIN FUNKTIONEN
# ============================================================

TRIGGER_URL = "http://captive.apple.com/hotspot-detect.html"
SESSION_URL = "https://hotspot.vodafone.de/api/v4/session"
LOGIN_URL = "https://hotspot.vodafone.de/api/v4/login"

def wait_for_ip():
    """Wartet, bis der Pi eine echte IP-Adresse hat"""
    print("Warte auf IP-Adresse...")
    while True:
        try:
            output = subprocess.check_output(['hostname', '-I']).decode('utf-8').strip()
            if output:
                print(f"IP-Adresse gefunden: {output}")
                return True
        except:
            pass
        time.sleep(2)

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
    try:
        requests.get("https://www.google.com", timeout=3)
        return True
    except:
        return False

# ============================================================
# TAILSCALE AUTO-CONNECT
# ============================================================

def ensure_tailscale_connected():
    """Stellt sicher, dass Tailscale verbunden ist"""
    print("\n" + "="*60)
    print("PRÜFE TAILSCALE VERBINDUNG")
    print("="*60)
    
    try:
        # Prüfe Tailscale Status
        result = subprocess.run(['tailscale', 'status'], 
                              capture_output=True, 
                              text=True, 
                              timeout=5)
        
        if result.returncode == 0 and result.stdout:
            print("✓ Tailscale ist bereits verbunden")
            print("="*60)
            return True
    except Exception as e:
        print(f"Status-Prüfung fehlgeschlagen: {e}")
    
    # Wenn nicht verbunden, versuche zu verbinden
    print("Starte Tailscale Verbindung...")
    try:
        subprocess.run(['sudo', 'tailscale', 'up'], 
                      timeout=30,
                      check=False)
        
        time.sleep(5)
        
        # Prüfe erneut
        result = subprocess.run(['tailscale', 'status'], 
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
# NETZWERK LOGIN BEIM START
# ============================================================

def perform_network_login():
    """Führt den Netzwerk-Login durch"""
    print("\n" + "="*60)
    print("STARTE NETZWERK-AUTHENTIFIZIERUNG")
    print("="*60)
    
    # Warte auf IP
    wait_for_ip()
    
    # 5 Versuche mit Pausen
    for i in range(1, 6):
        if check_internet():
            print("Internet bereits da!")
            print("="*60)
            print("✓✓✓ NETZWERK-LOGIN ERFOLGREICH! ✓✓✓")
            print("="*60)
            return True
            
        print(f"\n--- Versuch {i}/5 ---")
        if trigger_dns_and_login():
            time.sleep(5)
            if check_internet():
                print("ERFOLG: Online!")
                print("="*60)
                print("✓✓✓ NETZWERK-LOGIN ERFOLGREICH! ✓✓✓")
                print("="*60)
                return True
        
        print("Warte 10 Sekunden vor nächstem Versuch...")
        time.sleep(10)
    
    # Login fehlgeschlagen
    print("="*60)
    print("✗✗✗ NETZWERK-LOGIN FEHLGESCHLAGEN ✗✗✗")
    print("="*60)
    return False

# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    # Schritt 1: Bayern WLAN Login
    print("\n" + "="*60)
    print("SCHRITT 1: BAYERN WLAN LOGIN")
    print("="*60)
    network_success = perform_network_login()
    
    if network_success:
        print("\n✓✓✓ WLAN LOGIN ERFOLGREICH ✓✓✓\n")
    else:
        print("\n✗✗✗ WLAN LOGIN FEHLGESCHLAGEN ✗✗✗\n")
    
    time.sleep(2)
    
    # Schritt 2: Tailscale Verbindung
    print("\n" + "="*60)
    print("SCHRITT 2: TAILSCALE VERBINDUNG")
    print("="*60)
    tailscale_success = ensure_tailscale_connected()
    
    if tailscale_success:
        print("\n✓✓✓ TAILSCALE VERBUNDEN ✓✓✓\n")
    else:
        print("\n✗✗✗ TAILSCALE VERBINDUNG FEHLGESCHLAGEN ✗✗✗\n")
    
    time.sleep(2)
    
    # Schritt 3: Hole Tailscale IP-Adresse
    print("\n" + "="*60)
    print("SCHRITT 3: HOLE TAILSCALE IP-ADRESSE")
    print("="*60)
    
    try:
        result = subprocess.run(['tailscale', 'ip', '-4'], 
                              capture_output=True, 
                              text=True, 
                              timeout=5)
        
        if result.returncode == 0 and result.stdout.strip():
            tailscale_ip = result.stdout.strip()
            print(f"✓ Tailscale IP gefunden: {tailscale_ip}")
        else:
            print("✗ Konnte Tailscale IP nicht ermitteln!")
            exit(1)
    except Exception as e:
        print(f"✗ Fehler beim Abrufen der Tailscale IP: {e}")
        exit(1)
    
    print("\n" + "="*60)
    print("SETUP ABGESCHLOSSEN")
    print("="*60)
    print(f"Tailscale IP: {tailscale_ip}")
    print("Raspberry Pi ist bereit!")
    print("="*60 + "\n")

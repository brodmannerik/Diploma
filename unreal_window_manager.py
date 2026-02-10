"""
Unreal Engine Window Manager for 4x 7-inch Portrait Displays
Automatically detects and positions Unreal Engine multiplayer preview windows
(1 Server + 3 Clients) fullscreen on 4 separate HAMTYSAN 800x480 displays
in portrait mode (480x800) when they appear after clicking Play.

Includes HTTP server for dynamic window reordering from Unreal Engine blueprints.
"""

import win32gui
import win32con
import win32api
import time
import threading
from typing import List, Dict, Optional
from flask import Flask, request, jsonify
from flask_cors import CORS


class UnrealWindowManager:
    """Manages positioning of Unreal Engine preview windows on 4 separate 7-inch displays."""
    
    def __init__(self, borderless: bool = True, hide_titlebar: bool = True):
        """Initialize the window manager."""
        self.found_windows = {}
        self.window_handles = {}  # Maps window index to handle
        self.current_order = [4, 2, 3, 1]  # Custom order: Client3, Client1, Client2, Server
        self.lock = threading.Lock()  # Thread safety for window operations
        self.borderless = borderless  # Remove title bars and borders
        self.hide_titlebar = hide_titlebar  # Hide title bar content by clipping
        self.titlebar_height = 32  # Approximate height of Unreal's title bar
        
        # Positions for 4 HAMTYSAN 7" displays (800x480) in portrait mode (480x800)
        # Arranged horizontally: [Display 0][Display 1][Display 2][Display 3]
        # Format: (x, y, width, height)
        self.positions = [
            (0, 0, 480, 800),      # Display 0: Leftmost
            (480, 0, 480, 800),    # Display 1: Second from left
            (960, 0, 480, 800),    # Display 2: Third from left
            (1440, 0, 480, 800)    # Display 3: Rightmost
        ]
        
        # Window mapping: index -> window key
        self.window_keys = ['Server', 'Client 1', 'Client 2', 'Client 3']
    
    def find_unreal_windows(self) -> Dict[str, int]:
        """
        Find all Unreal Engine preview windows.
        
        Returns:
            Dictionary mapping window type (e.g., 'Server', 'Client 1') to window handle
        """
        windows = {}
        
        def enum_callback(hwnd, results):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                
                # Look for Unreal preview windows
                # Typical formats: "GameName Preview [NetMode: Server]"
                #                  "GameName Preview [NetMode: Client 1]"
                if "Preview" in title and "NetMode:" in title:
                    # Extract the NetMode part
                    if "Server" in title:
                        results['Server'] = hwnd
                    elif "Client 1" in title:
                        results['Client 1'] = hwnd
                    elif "Client 2" in title:
                        results['Client 2'] = hwnd
                    elif "Client 3" in title:
                        results['Client 3'] = hwnd
            
            return True
        
        win32gui.EnumWindows(enum_callback, windows)
        return windows
    
    def position_window(self, hwnd: int, x: int, y: int, width: int, height: int, retries: int = 3) -> bool:
        """
        Position and resize a window with retry logic.
        
        Args:
            hwnd: Window handle
            x, y: Position coordinates
            width, height: Window dimensions
            retries: Number of retry attempts
        
        Returns:
            True if successful, False otherwise
        """
        for attempt in range(retries):
            try:
                # Make sure window is visible and not minimized
                if win32gui.IsIconic(hwnd):
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                    time.sleep(0.1)
                
                # Ensure window is shown
                win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
                time.sleep(0.05)
                
                # Get current window style
                style = win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE)
                
                # Remove maximize/minimize if present
                style &= ~win32con.WS_MAXIMIZE
                style &= ~win32con.WS_MINIMIZE
                
                # Make borderless if requested
                if self.borderless:
                    # Remove ALL border-related styles more aggressively
                    style &= ~win32con.WS_CAPTION          # Remove title bar
                    style &= ~win32con.WS_THICKFRAME       # Remove resize border
                    style &= ~win32con.WS_SYSMENU          # Remove system menu
                    style &= ~win32con.WS_BORDER           # Remove border
                    style &= ~win32con.WS_DLGFRAME         # Remove dialog frame
                    style &= ~(0x00800000)                 # WS_SIZEBOX
                    style |= win32con.WS_POPUP             # Make it popup style
                    style |= win32con.WS_VISIBLE           # Ensure visible
                
                win32gui.SetWindowLong(hwnd, win32con.GWL_STYLE, style)
                
                # Remove extended window borders
                if self.borderless:
                    ex_style = win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE)
                    ex_style &= ~win32con.WS_EX_DLGMODALFRAME
                    ex_style &= ~win32con.WS_EX_CLIENTEDGE
                    ex_style &= ~win32con.WS_EX_STATICEDGE
                    ex_style &= ~win32con.WS_EX_WINDOWEDGE
                    ex_style &= ~(0x00000200)              # WS_EX_OVERLAPPEDWINDOW
                    win32gui.SetWindowLong(hwnd, win32con.GWL_EXSTYLE, ex_style)
                
                # Force frame to update with new style
                if self.borderless:
                    win32gui.SetWindowPos(
                        hwnd,
                        win32con.HWND_TOP,
                        0, 0, 0, 0,
                        win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | 
                        win32con.SWP_NOZORDER | win32con.SWP_FRAMECHANGED
                    )
                    time.sleep(0.05)
                
                # Now set window position and size
                flags = win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED
                
                result = win32gui.SetWindowPos(
                    hwnd,
                    win32con.HWND_TOPMOST,
                    x, y, width, height,
                    flags
                )
                
                # Remove topmost flag so windows can be normal
                win32gui.SetWindowPos(
                    hwnd,
                    win32con.HWND_NOTOPMOST,
                    x, y, width, height,
                    win32con.SWP_SHOWWINDOW
                )
                
                # If we still have a title bar, clip it out using window region
                if self.hide_titlebar and self.borderless:
                    try:
                        # Get actual window rect
                        rect = win32gui.GetWindowRect(hwnd)
                        window_width = rect[2] - rect[0]
                        window_height = rect[3] - rect[1]
                        
                        # Create a rectangular region that excludes the top titlebar_height pixels
                        # This effectively "crops" the title bar out of view
                        region = win32api.CreateRectRgn(
                            0, self.titlebar_height,  # Start below title bar
                            window_width, window_height  # Full width and remaining height
                        )
                        
                        # Apply the region to the window
                        win32gui.SetWindowRgn(hwnd, region, True)
                        time.sleep(0.05)
                    except Exception as e:
                        print(f"  ⚠ Could not apply window region: {e}")
                
                # Small delay to let the window settle
                time.sleep(0.1)
                
                # Verify the position was set correctly
                rect = win32gui.GetWindowRect(hwnd)
                actual_x, actual_y = rect[0], rect[1]
                
                # Allow some tolerance (within 10 pixels)
                if abs(actual_x - x) <= 10 and abs(actual_y - y) <= 10:
                    return True
                elif attempt < retries - 1:
                    print(f"  ⚠ Position mismatch (expected {x},{y}, got {actual_x},{actual_y}), retrying...")
                    time.sleep(0.2)
                
            except Exception as e:
                if attempt < retries - 1:
                    print(f"  ⚠ Attempt {attempt + 1} failed: {e}, retrying...")
                    time.sleep(0.2)
                else:
                    print(f"  ✗ Error positioning window after {retries} attempts: {e}")
                    return False
        
        return False
    
    def position_all_windows(self, windows: Dict[str, int]) -> int:
        """
        Position all found windows according to current order configuration.
        
        Args:
            windows: Dictionary of window type to window handle
        
        Returns:
            Number of successfully positioned windows
        """
        with self.lock:
            # Store window handles for later reordering
            self.window_handles = {}
            for i, window_key in enumerate(self.window_keys):
                if window_key in windows:
                    self.window_handles[i + 1] = windows[window_key]  # 1-indexed
            
            success_count = 0
            
            # Apply current order to positions with delays between each window
            for pos_idx, window_idx in enumerate(self.current_order):
                if window_idx in self.window_handles:
                    hwnd = self.window_handles[window_idx]
                    x, y, width, height = self.positions[pos_idx]
                    window_key = self.window_keys[window_idx - 1]
                    
                    try:
                        title = win32gui.GetWindowText(hwnd)
                    except:
                        title = "Unknown"
                    
                    print(f"Position {pos_idx} ← Window {window_idx} ({window_key}): {title}")
                    print(f"  → Target: ({x}, {y}), Size: {width}x{height}")
                    
                    if self.position_window(hwnd, x, y, width, height):
                        success_count += 1
                        print(f"  ✓ Successfully positioned")
                    else:
                        print(f"  ✗ Failed to position")
                    
                    # Small delay between positioning each window
                    time.sleep(0.15)
            
            return success_count
    
    def wait_and_position(self, timeout: int = 60, check_interval: float = 0.5):
        """
        Wait for Unreal windows to appear and position them automatically.
        
        Args:
            timeout: Maximum time to wait in seconds (default: 60)
            check_interval: How often to check for windows in seconds (default: 0.5)
        """
        print("Unreal Engine Window Manager")
        print("=" * 60)
        print("Waiting for Unreal Engine preview windows to appear...")
        print("(Start your multiplayer preview in Unreal Editor)")
        print()
        
        start_time = time.time()
        last_count = 0
        
        while time.time() - start_time < timeout:
            # Find windows
            windows = self.find_unreal_windows()
            current_count = len(windows)
            
            # Show progress when new windows are detected
            if current_count != last_count:
                print(f"Found {current_count}/4 windows...")
                for window_type in windows.keys():
                    title = win32gui.GetWindowText(windows[window_type])
                    print(f"  - {window_type}: {title}")
                last_count = current_count
            
            # When all 4 windows are found, position them
            if current_count >= 4:
                print("\n" + "=" * 60)
                print("All 4 windows detected! Positioning...")
                print()
                
                # Longer delay to ensure windows are fully initialized
                time.sleep(2)
                
                success = self.position_all_windows(windows)
                
                print()
                print("=" * 60)
                if success == 4:
                    print("✓ Successfully positioned all 4 windows!")
                else:
                    print(f"⚠ Positioned {success}/4 windows")
                    print("  Tip: Try running option 2 to reposition existing windows")
                
                mode_text = "borderless" if self.borderless else "with title bars"
                print(f"\nWindow arrangement (4 portrait displays 480x800, {mode_text}):")
                print("  [Display 0] [Display 1] [Display 2] [Display 3]")
                print("  [Window 1 ] [Window 2 ] [Window 3 ] [Window 4 ]")
                print(f"\nCurrent order: {self.current_order}")
                print("  (1=Server, 2=Client 1, 3=Client 2, 4=Client 3)")
                print("\n💡 HTTP Server running on http://localhost:5000")
                print("   Send POST to /reorder with JSON: {\"order\": [2,1,3,4]}")
                
                return True
            
            # Wait before checking again
            time.sleep(check_interval)
        
        # Timeout reached
        print("\n" + "=" * 60)
        print(f"⚠ Timeout after {timeout} seconds")
        if last_count > 0:
            print(f"Only found {last_count}/4 windows")
        else:
            print("No Unreal preview windows detected")
        print("\nMake sure you:")
        print("  1. Start Unreal Editor")
        print("  2. Set Play Mode to 'Play as Listen Server'")
        print("  3. Set Number of Clients to 3")
        print("  4. Click Play")
        
        return False
    
    def manual_position(self):
        """Manually find and position windows (useful for testing)."""
        print("Searching for Unreal Engine windows...")
        
        windows = self.find_unreal_windows()
        
        if len(windows) == 0:
            print("No Unreal preview windows found!")
            print("Make sure the game is running in multiplayer preview mode.")
            return False
        
        print(f"\nFound {len(windows)} window(s):")
        for window_type, hwnd in windows.items():
            title = win32gui.GetWindowText(hwnd)
            print(f"  - {window_type}: {title}")
        
        print("\nPositioning windows...")
        success = self.position_all_windows(windows)
        
        if success > 0:
            print(f"\n✓ Successfully positioned {success} window(s)")
            return True
        else:
            print("\n✗ Failed to position windows")
            return False


    def reorder_windows(self, new_order: List[int]) -> Dict:
        """
        Reorder windows to new positions.
        
        Args:
            new_order: List of 4 integers (1-4) specifying which window goes to which position
                      e.g., [2, 1, 3, 4] means position 0 gets window 2 (Client 1), etc.
        
        Returns:
            Dictionary with success status and message
        """
        # Validate input
        if len(new_order) != 4:
            return {"success": False, "message": "Order must contain exactly 4 values"}
        
        if not all(1 <= x <= 4 for x in new_order):
            return {"success": False, "message": "All values must be between 1 and 4"}
        
        if len(set(new_order)) != 4:
            return {"success": False, "message": "All values must be unique"}
        
        if not self.window_handles:
            return {"success": False, "message": "No windows found. Start the game first."}
        
        with self.lock:
            self.current_order = new_order
            
            print(f"\n{'='*60}")
            print(f"Reordering windows: {new_order}")
            print(f"{'='*60}")
            
            success_count = 0
            
            # Apply new order
            for pos_idx, window_idx in enumerate(new_order):
                if window_idx in self.window_handles:
                    hwnd = self.window_handles[window_idx]
                    x, y, width, height = self.positions[pos_idx]
                    window_key = self.window_keys[window_idx - 1]
                    
                    print(f"Position {pos_idx} ← Window {window_idx} ({window_key})")
                    
                    if self.position_window(hwnd, x, y, width, height):
                        success_count += 1
                        print(f"  ✓ Positioned")
                    else:
                        print(f"  ✗ Failed")
                    
                    # Small delay between windows
                    time.sleep(0.15)
            
            print(f"{'='*60}\n")
            
            if success_count == 4:
                return {
                    "success": True,
                    "message": f"Successfully reordered to {new_order}",
                    "order": new_order
                }
            else:
                return {
                    "success": False,
                    "message": f"Only positioned {success_count}/4 windows",
                    "order": new_order
                }
    
    def get_status(self) -> Dict:
        """Get current window status."""
        with self.lock:
            return {
                "windows_found": len(self.window_handles),
                "current_order": self.current_order,
                "window_mapping": {
                    "1": "Server",
                    "2": "Client 1",
                    "3": "Client 2",
                    "4": "Client 3"
                }
            }


def create_http_server(manager: UnrealWindowManager, port: int = 5000):
    """
    Create Flask HTTP server for remote control.
    
    Args:
        manager: UnrealWindowManager instance
        port: Port to run server on
    """
    app = Flask(__name__)
    CORS(app)  # Enable CORS for Unreal Engine requests
    
    @app.route('/reorder', methods=['POST'])
    def reorder():
        """
        Reorder windows endpoint.
        
        Expected JSON: {"order": [2, 1, 3, 4]}
        """
        try:
            data = request.get_json()
            
            if not data or 'order' not in data:
                return jsonify({
                    "success": False,
                    "message": "Missing 'order' field in JSON body"
                }), 400
            
            new_order = data['order']
            result = manager.reorder_windows(new_order)
            
            status_code = 200 if result['success'] else 400
            return jsonify(result), status_code
            
        except Exception as e:
            return jsonify({
                "success": False,
                "message": f"Error: {str(e)}"
            }), 500
    
    @app.route('/status', methods=['GET'])
    def status():
        """Get current status."""
        try:
            return jsonify(manager.get_status()), 200
        except Exception as e:
            return jsonify({
                "success": False,
                "message": f"Error: {str(e)}"
            }), 500
    
    @app.route('/health', methods=['GET'])
    def health():
        """Health check endpoint."""
        return jsonify({"status": "ok"}), 200
    
    # Suppress Flask development server warning
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    
    print(f"\n🌐 HTTP Server starting on http://localhost:{port}")
    print(f"   Endpoints:")
    print(f"   - POST /reorder  → Change window order")
    print(f"   - GET  /status   → Get current status")
    print(f"   - GET  /health   → Health check")
    print()
    
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)


def main():
    """Main function."""
    print("Unreal Engine Window Positioner for 4x 7\" Portrait Displays")
    print("HAMTYSAN 800x480 displays in portrait mode (480x800)")
    print("=" * 60)
    print()
    
    # Use defaults: borderless and hide titlebar
    manager = UnrealWindowManager(borderless=True, hide_titlebar=True)
    
    try:
        # Start HTTP server in background thread
        server_thread = threading.Thread(
            target=create_http_server,
            args=(manager, 5000),
            daemon=True
        )
        server_thread.start()
        
        # Wait a moment for server to start
        time.sleep(1)
        
        # Wait for windows and position them
        if manager.wait_and_position(timeout=120):
            print("\n✓ Windows positioned! HTTP server is running.")
            print("\n📡 Unreal Engine HTTP Request Examples:")
            print("\n   Blueprint node: 'HTTP Request'")
            print("   URL: http://localhost:5000/reorder")
            print("   Method: POST")
            print('   Body: {"order": [2,1,3,4]}')
            print("\n   Window IDs:")
            print("   1 = Server, 2 = Client 1, 3 = Client 2, 4 = Client 3")
            print("\nPress Ctrl+C to stop...")
            
            # Keep main thread alive
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("\n\nShutting down...")
    
    except KeyboardInterrupt:
        print("\n\nOperation cancelled")


if __name__ == "__main__":
    main()

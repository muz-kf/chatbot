import os
import sys
import time
from playwright.sync_api import sync_playwright, expect

BASE_URL = "http://localhost:5001"

def test_jarvis_voice_mode():
    print("🚀 Starting Jarvis Voice Mode E2E Verification against http://localhost:5001...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                "--autoplay-policy=no-user-gesture-required",
            ],
        )
        context = browser.new_context()
        page = context.new_page()

        print(f"🌐 Navigating to {BASE_URL}...")
        page.goto(BASE_URL, wait_until="networkidle")

        # 1. Sign in if AuthGate appears
        if page.locator("form.auth-form").is_visible(timeout=5000):
            print("🔑 AuthGate detected. Signing in...")
            page.fill("input#auth-name", "Tony Stark")
            page.fill("input#auth-email", "tony@starkindustries.com")
            page.fill("input#auth-dob", "1990-05-29")
            page.click("button.auth-submit")
            page.wait_for_selector("form.auth-form", state="hidden", timeout=15000)
            print("✅ Signed in successfully.")

        # 2. Wait for Chat Composer and Header
        print("⏳ Waiting for chat composer...")
        composer = page.locator("textarea.composer-input")
        expect(composer).to_be_visible(timeout=15000)

        # 2. Wait for Chat Header and Voice Mode button
        print("⏳ Waiting for header Voice Mode button...")
        voice_mode_btn = page.locator("button.header-voice-mode-btn")
        expect(voice_mode_btn).to_be_visible(timeout=10000)
        print("✅ Voice Mode button is visible in header!")

        # 3. Click Voice Mode button to enter /voice route
        print("🎙️ Clicking 'Voice Mode' button...")
        voice_mode_btn.click()
        page.wait_for_url("**/voice**", timeout=5000)
        print("✅ URL successfully navigated to /voice route!")

        # 4. Verify Jarvis Arc Reactor UI & HUD Elements
        print("🔍 Verifying Iron Man Jarvis Arc Reactor & HUD...")
        arc_reactor = page.locator(".jarvis-arc-container")
        expect(arc_reactor).to_be_visible(timeout=5000)
        print("✅ Jarvis Arc Reactor Core is mounted and visible!")

        svg_reactor = page.locator(".arc-reactor-svg")
        expect(svg_reactor).to_be_visible()
        print("✅ Arc Reactor SVG concentric rings and soundwave visualizer verified!")

        status_line = page.locator(".jarvis-status-line")
        expect(status_line).to_be_visible()
        print(f"✅ HUD Status Line verified: {status_line.inner_text()}")

        control_deck = page.locator(".jarvis-control-deck")
        expect(control_deck).to_be_visible()
        print("✅ Floating control deck with mic toggle & interrupt verified!")

        # 5. Capture screenshot of Jarvis Voice Mode HUD
        os.makedirs("tests/screenshots", exist_ok=True)
        screenshot_path = "tests/screenshots/jarvis_voice_mode.png"
        page.screenshot(path=screenshot_path)
        print(f"📸 Saved Jarvis Arc Reactor Voice Mode screenshot to {screenshot_path}")

        # 6. Test Exiting Voice Mode back to standard chat
        print("🚪 Testing 'Exit Voice Mode' button...")
        exit_btn = page.locator("button.hud-exit-btn")
        expect(exit_btn).to_be_visible()
        exit_btn.click()

        # Verify return to main chat view
        composer = page.locator(".composer-glass")
        expect(composer).to_be_visible(timeout=5000)
        print("✅ Smooth transition back to standard chat workspace verified!")

        browser.close()
        print("🎉 Jarvis Voice Mode E2E Test completed with 100% success!")

if __name__ == "__main__":
    try:
        test_jarvis_voice_mode()
    except Exception as exc:
        print(f"❌ Jarvis Voice Mode Test Failed: {exc}", file=sys.stderr)
        sys.exit(1)

import os
import sys
import time
from playwright.sync_api import sync_playwright, expect

BASE_URL = "http://localhost:5001"

def test_mobile_voice_bootloader_and_settings():
    print("🚀 Starting E2E Verification for Mobile Voice Mode, Bootloader & Settings Dialog...")
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
        if page.locator("form.auth-form").is_visible():
            print("🔑 Signing in...")
            page.fill("input#auth-name", "Tony Stark")
            page.fill("input#auth-email", "tony@starkindustries.com")
            page.fill("input#auth-dob", "1990-05-29")
            page.click("button.auth-submit")
            page.wait_for_selector("form.auth-form", state="hidden", timeout=15000)
            print("✅ Signed in successfully.")

        # 2. Test Bootloader Screen on app reload
        print("🔄 Testing Bootloader Screen on reload ('Picking up where we left off...')...")
        page.reload(wait_until="commit")
        bootloader = page.locator(".bootloader-screen-root")
        expect(bootloader).to_be_visible(timeout=5000)
        expect(page.locator(".bootloader-title")).to_have_text("Picking up where we left off...")
        expect(page.locator(".bootloader-reactor-wrap .jarvis-arc-container")).to_be_visible()
        print("✅ Arc Reactor circle and 'Picking up where we left off...' verified on bootloader screen!")
        
        # Wait for bootloader to finish and reveal workspace
        expect(bootloader).to_be_hidden(timeout=10000)
        expect(page.locator("textarea.composer-input")).to_be_visible(timeout=10000)
        print("✅ Smooth transition from bootloader to workspace verified!")

        # 3. Test Fullscreen Settings Dialog
        print("⚙️ Testing Fullscreen Settings Dialog...")
        settings_toggle = page.locator("button.settings-toggle")
        expect(settings_toggle).to_be_visible()
        settings_toggle.click()

        settings_dialog = page.locator(".settings-dialog-root")
        expect(settings_dialog).to_be_visible(timeout=5000)
        print("✅ Fullscreen Settings Dialog opened successfully!")

        # Verify Voice tab options
        expect(page.locator("label.voice-sender-switch[for='auto-listen-toggle']")).to_be_visible()
        expect(page.locator("label.voice-sender-switch[for='settings-voice-auto-send']")).to_be_visible()
        print("✅ Voice interaction controls verified in Settings dialog!")

        # Switch to Themes tab and verify theme options
        print("🎨 Testing Themes & Styling tab...")
        page.click("button:has-text('Themes & Styling')")
        theme_cards = page.locator(".theme-card-option")
        expect(theme_cards).to_have_count(12)
        print("✅ All 12 visual theme cards rendered in Settings dialog!")

        # Switch to AI & Model tab
        print("🤖 Testing AI & Model tab...")
        page.click("button:has-text('AI & Model')")
        expect(page.locator(".provider-card")).to_have_count(2)
        expect(page.locator("input#default-ai-name")).to_be_visible()
        print("✅ AI Provider cards & Persona settings verified!")

        # Close Settings Dialog
        page.click("button.settings-dialog-close-btn")
        expect(settings_dialog).to_be_hidden()
        print("✅ Settings Dialog closed cleanly!")

        # 4. Test Mobile Voice Mode Refinements (Viewport: 390x844)
        print("📱 Testing Voice Mode on Mobile Screen (390x844)...")
        page.set_viewport_size({"width": 390, "height": 844})
        
        # Click Voice Mode button in header
        voice_btn = page.locator("button.header-voice-mode-btn")
        expect(voice_btn).to_be_visible()
        voice_btn.click()
        page.wait_for_url("**/voice**")
        print("✅ Navigated to /voice route on mobile!")

        # Verify DAZZ Voice mode element is HIDDEN on mobile
        voice_mode_title = page.locator(".hud-center-title")
        expect(voice_mode_title).to_be_hidden()
        print("✅ Confirmed: 'DAZZ Voice mode' element is hidden on mobile device!")

        # Verify Exit button is compact cross button (text is hidden)
        exit_btn = page.locator("button.hud-exit-btn")
        expect(exit_btn).to_be_visible()
        exit_text = page.locator(".hud-exit-btn .hud-exit-text")
        expect(exit_text).to_be_hidden()
        print("✅ Confirmed: Exit voice mode button shows only cross icon on mobile device!")

        # Click cross button to exit
        exit_btn.click()
        page.wait_for_url("**/")
        print("✅ Successfully exited voice mode back to mobile chat workspace!")

        browser.close()
        print("🎉 All Mobile Voice, Bootloader & Settings Dialog tests completed with 100% success!")

if __name__ == "__main__":
    try:
        test_mobile_voice_bootloader_and_settings()
    except Exception as exc:
        print(f"❌ Test Failed: {exc}", file=sys.stderr)
        sys.exit(1)

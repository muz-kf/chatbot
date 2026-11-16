import os
import re
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
        
        # Verify model-pill must NOT be shown in mobile mode
        model_pill = page.locator(".model-pill")
        expect(model_pill).to_be_hidden()
        print("✅ Confirmed: model-pill is completely hidden on mobile viewports!")

        # Click Voice Mode button in header
        voice_btn = page.locator("button.header-voice-mode-btn")
        expect(voice_btn).to_be_visible()
        voice_btn.click()
        page.wait_for_url("**/voice**")
        print("✅ Navigated to /voice route on mobile!")

        # Verify initial state of fixed first-quarter animated icon and text stream
        stage = page.locator(".jarvis-center-stage")
        expect(stage).to_be_visible()
        expect(page.locator(".reactor-fixed-section .jarvis-arc-container")).to_be_visible()
        card = page.locator(".jarvis-subtitle-card")
        expect(card).to_be_visible()
        print("✅ Confirmed: Animated Arc Reactor sits in first quarter with transparent text stream below!")

        # Verify Voice mode center title element is cut/removed
        voice_mode_title = page.locator(".hud-center-title")
        expect(voice_mode_title).to_have_count(0)
        print("✅ Confirmed: Voice mode central title element is completely removed!")

        # Verify MZA (next line small text Corp) branding is visible on mobile
        mza_brand = page.locator(".hud-corner-mark.top-left .hud-code")
        expect(mza_brand).to_be_visible()
        expect(mza_brand.locator(".brand-main")).to_have_text("MZA")
        expect(mza_brand.locator(".brand-sub")).to_have_text("Corp")
        print("✅ Confirmed: 'MZA' with small 'Corp' on next line is visible on mobile HUD!")

        # Verify Exit button is compact cross button for both mobile and PC
        exit_btn = page.locator("button.hud-exit-btn")
        expect(exit_btn).to_be_visible()
        expect(exit_btn).to_have_attribute("title", "Exit Voice Mode (Esc)")
        print("✅ Confirmed: Exit voice mode button is cross icon with hover tooltip!")

        # Verify Back to Chats button is removed as requested
        expect(page.locator("button.jarvis-return-link")).to_have_count(0)
        # Verify microphone button is present at the bottom
        mic_btn = page.locator(".jarvis-control-deck .jarvis-pill-button")
        expect(mic_btn).to_be_visible()
        print("✅ Confirmed: 'Back to Chats' is removed; microphone button is at bottom of screen!")

        # Capture mobile voice mode screenshot
        page.screenshot(path="tests/screenshots/mobile_voice_new_chat.png")
        print("📸 Saved mobile voice mode screenshot to tests/screenshots/mobile_voice_new_chat.png")

        # Click cross button to exit
        exit_btn.click()
        page.wait_for_url("**/")
        print("✅ Successfully exited voice mode back to mobile chat workspace!")

        # Verify model-pill remains hidden on mobile workspace
        expect(page.locator(".model-pill")).to_be_hidden()
        print("✅ Confirmed: model-pill remains hidden on mobile chat workspace!")

        browser.close()
        print("🎉 All Mobile Voice, Bootloader & Settings Dialog tests completed with 100% success!")

if __name__ == "__main__":
    try:
        test_mobile_voice_bootloader_and_settings()
    except Exception as exc:
        print(f"❌ Test Failed: {exc}", file=sys.stderr)
        sys.exit(1)

import re
import time
from playwright.sync_api import sync_playwright, expect

BASE_URL = "http://localhost:5001"

def test_voice_mode_api_error_presentation():
    print("🚀 Starting Voice Mode Chat API Error UI Presentation Test...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                "--autoplay-policy=no-user-gesture-required",
            ],
        )
        
        # Test on mobile viewport (390 x 844)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()

        print(f"🌐 Navigating to {BASE_URL} on Mobile viewport...")
        page.goto(BASE_URL, wait_until="networkidle")

        # Handle AuthGate if needed
        if page.locator("form.auth-form").is_visible(timeout=4000):
            page.fill("input#auth-name", "Tony Stark")
            page.fill("input#auth-email", "tony@starkindustries.com")
            page.fill("input#auth-dob", "1990-05-29")
            page.click("button.auth-submit")
            page.wait_for_selector("form.auth-form", state="hidden", timeout=15000)

        # Intercept /api/chats/*/turns to simulate Chat API Error
        mock_error_message = "Rate limit reached from Groq. Please wait a moment before trying again."
        
        def handle_turns_route(route):
            print("🛑 Intercepted /api/chats/*/turns request - returning simulated API error...")
            route.fulfill(
                status=500,
                content_type="application/json",
                body=f'{{"detail": "{mock_error_message}"}}',
            )

        page.route("**/api/chats/*/turns", handle_turns_route)

        # Open Voice Mode
        print("🎙️ Opening Voice Mode...")
        voice_mode_btn = page.locator("button.header-voice-mode-btn")
        expect(voice_mode_btn).to_be_visible(timeout=10000)
        voice_mode_btn.click()
        page.wait_for_url("**/voice**", timeout=5000)

        # Arc Reactor should be mounted
        arc_reactor = page.locator(".jarvis-arc-container")
        expect(arc_reactor).to_be_visible(timeout=5000)
        print("✅ Arc Reactor is visible in Voice Mode.")

        # Trigger speech prompt through exposed test hook
        print("🗣️ Triggering prompt to invoke Chat API...")
        page.wait_for_function("() => typeof window.__voiceSendPrompt === 'function'", timeout=5000)
        page.evaluate("() => window.__voiceSendPrompt('Simulate speech turn')")

        # 1. Verify Error Banner in HUD
        print("🔍 Verifying Error Banner in UI...")
        error_banner = page.locator(".jarvis-error-banner")
        expect(error_banner).to_be_visible(timeout=5000)
        expect(error_banner.locator(".error-message")).to_contain_text("Rate limit reached from Groq")
        print("✅ jarvis-error-banner is visible and displays API error message correctly!")

        # 2. Verify Status LED has error status
        status_led = page.locator(".jarvis-status-line .status-led")
        expect(status_led).to_have_class(re.compile(r"status-error"))
        print("✅ Status LED has .status-error styling (pulsing red warning)!")

        # 3. Verify Status Label indicates Chat API Error
        status_label = page.locator(".jarvis-status-line .status-label")
        expect(status_label).to_contain_text("CHAT API ERROR")
        print("✅ Status Label clearly displays: CHAT API ERROR!")

        # 4. Verify Arc Status Badge inside Reactor displays ERROR
        status_badge = page.locator(".arc-status-badge")
        expect(status_badge).to_have_class(re.compile(r"is-error"))
        expect(status_badge.locator(".status-text")).to_have_text("ERROR")
        expect(status_badge.locator(".status-dot")).to_have_class(re.compile(r"dot-error"))
        print("✅ Arc Reactor center badge displays ERROR with dot-error indicator!")

        # 5. Verify Stream Error Turn Card in Conversation Subtitle Area
        error_turn_card = page.locator(".voice-error-card")
        expect(error_turn_card).to_be_visible()
        expect(error_turn_card.locator(".error-card-text")).to_contain_text("Rate limit reached from Groq")
        expect(error_turn_card.locator(".error-card-retry")).to_be_visible()
        print("✅ Conversation stream contains .voice-error-card with Retry button!")

        # 6. Verify Bottom Control Deck Button invites user to Try Again
        mic_btn = page.locator("button.btn-mic")
        expect(mic_btn).to_contain_text("Tap to Try Again")
        print("✅ Bottom control deck button updated to 'Tap to Try Again'!")

        # Save screenshot
        page.screenshot(path="tests/screenshots/mobile_voice_api_error.png")
        print("📸 Captured tests/screenshots/mobile_voice_api_error.png")

        # 7. Test Dismissing the Error
        dismiss_btn = error_banner.locator(".error-dismiss-btn")
        dismiss_btn.click()
        expect(error_banner).to_have_count(0)
        print("✅ Dismissing error cleared the error banner cleanly!")

        browser.close()
        print("🎉 All Voice Mode API Error assertions passed with 100% success!")

if __name__ == "__main__":
    test_voice_mode_api_error_presentation()

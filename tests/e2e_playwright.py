#!/usr/bin/env python3
"""
End-to-End Automation Test using Playwright.
Validates:
1. Opening the chat application UI (http://localhost:5001).
2. Authenticating via the sign-in form.
3. Renaming the AI persona for the conversation.
4. Sending a user message to the AI.
5. Verifying that the assistant response is streamed and validated.
6. Saving a verification screenshot.
"""

import os
import sys
import time
from playwright.sync_api import sync_playwright, expect

APP_URL = os.getenv("APP_URL", "http://localhost:5001")


def run_e2e_test():
    print(f"🚀 Starting Playwright E2E Test against {APP_URL}...")
    with sync_playwright() as p:
        # Launch headless Chromium
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print(f"🌐 Navigating to {APP_URL}...")
        page.goto(APP_URL, wait_until="networkidle", timeout=30000)

        # 1. Check if AuthGate overlay is present
        if page.locator("form.auth-form").is_visible(timeout=5000):
            print("🔑 AuthGate detected. Signing in...")
            page.fill("input#auth-name", "Playwright Tester")
            page.fill("input#auth-email", "tester@example.com")
            page.fill("input#auth-dob", "1995-05-15")
            page.click("button.auth-submit")
            page.wait_for_selector("form.auth-form", state="hidden", timeout=15000)
            print("✅ Signed in successfully.")

        # 2. Wait for Chat Composer input
        print("⏳ Waiting for chat composer...")
        composer = page.locator("textarea.composer-input")
        expect(composer).to_be_visible(timeout=15000)
        print("✅ Chat composer is visible.")

        # 3. Verify Default AI Name and Conversational Name Adoption
        print("✏️ Testing AI Persona Default ('DAZZ') and Conversational Adoption...")
        header_badge = page.locator(".header-ai-badge")
        expect(header_badge).to_be_visible(timeout=5000)
        expect(header_badge).to_contain_text("DAZZ")
        print("✅ Header badge correctly displays default AI name: 'DAZZ'.")

        # 4. Input conversational prompt to adopt new name and answer question
        prompt_text = "From now on call yourself Jarvis. Also what is the capital city of France? Answer in one short sentence."
        print(f"💬 Entering prompt: '{prompt_text}'")
        composer.fill(prompt_text)

        # 5. Send message
        send_button = page.locator("button.send-button")
        if send_button.is_visible():
            send_button.click()
        else:
            composer.press("Enter")
        print("📤 Message sent to AI.")

        # 6. Verify conversational name update on header badge
        expect(header_badge).to_contain_text("Jarvis", timeout=5000)
        print("✅ Header badge dynamically updated to adopted name 'Jarvis'!")

        # 7. Wait for assistant message response to stream in
        print("⏳ Waiting for assistant reply...")
        assistant_bubble = page.locator(".message-assistant .markdown-content").last
        expect(assistant_bubble).to_be_visible(timeout=30000)

        # Allow full stream to complete
        time.sleep(3)
        response_text = assistant_bubble.inner_text()
        print(f"📥 Received AI response: \n---\n{response_text}\n---")

        # 7. Validate response
        assert len(response_text.strip()) > 0, "Error: AI response is empty!"
        assert "paris" in response_text.lower(), f"Error: Expected 'Paris' in response, but got: {response_text}"
        print("🎉 Validation passed: Response contains 'Paris'!")

        # 8. Save screenshot
        os.makedirs("tests/screenshots", exist_ok=True)
        screenshot_path = "tests/screenshots/playwright_response.png"
        page.screenshot(path=screenshot_path)
        print(f"📸 Saved verification screenshot to {screenshot_path}")

        browser.close()
        print("✨ Playwright E2E automation test completed successfully!")


if __name__ == "__main__":
    try:
        run_e2e_test()
    except Exception as exc:
        print(f"❌ Playwright E2E Test Failed: {exc}", file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""
End-to-End Automation Test using Selenium WebDriver.
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
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

APP_URL = os.getenv("APP_URL", "http://localhost:5001")


def get_driver():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1280,800")

    # Use installed Chrome or Chromium
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=chrome_options)


def run_e2e_selenium_test():
    print(f"🚀 Starting Selenium E2E Test against {APP_URL}...")
    driver = None
    try:
        driver = get_driver()
        wait = WebDriverWait(driver, 20)

        print(f"🌐 Navigating to {APP_URL}...")
        driver.get(APP_URL)

        # 1. Check if AuthGate overlay is present
        try:
            name_input = WebDriverWait(driver, 5).until(
                EC.visibility_of_element_located((By.ID, "auth-name"))
            )
            print("🔑 AuthGate detected. Signing in...")
            name_input.send_keys("Selenium Tester")
            driver.find_element(By.ID, "auth-email").send_keys("selenium@example.com")
            driver.find_element(By.ID, "auth-dob").send_keys("1994-08-20")
            driver.find_element(By.CSS_SELECTOR, "button.auth-submit").click()
            WebDriverWait(driver, 15).until(
                EC.invisibility_of_element_located((By.CSS_SELECTOR, "form.auth-form"))
            )
            print("✅ Signed in successfully.")
        except Exception:
            print("ℹ️ No AuthGate detected or already authenticated.")

        # 2. Wait for Chat Composer input
        print("⏳ Waiting for chat composer...")
        composer = wait.until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, "textarea.composer-input"))
        )
        print("✅ Chat composer is visible.")

        # 3. Test Custom AI Name per chat
        print("✏️ Testing AI Persona Customization...")
        try:
            header_badge = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, ".header-ai-badge"))
            )
            header_badge.click()
            ai_input = WebDriverWait(driver, 3).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, ".ai-name-input"))
            )
            ai_input.send_keys(Keys.CONTROL + "a")
            ai_input.send_keys(Keys.BACKSPACE)
            ai_input.send_keys("Friday")
            ai_input.send_keys(Keys.RETURN)
            time.sleep(0.5)
            print("✅ Successfully renamed AI to 'Friday'.")
        except Exception as e:
            print(f"ℹ️ AI renaming optional step skipped: {e}")

        # 4. Input test prompt into chat box
        prompt_text = "What is 15 plus 25? Answer with just the number."
        print(f"💬 Entering prompt: '{prompt_text}'")
        composer.send_keys(prompt_text)

        # 5. Send message
        try:
            send_btn = driver.find_element(By.CSS_SELECTOR, "button.send-button")
            send_btn.click()
        except Exception:
            composer.send_keys(Keys.RETURN)
        print("📤 Message sent to AI.")

        # 6. Wait for assistant message response to stream in
        print("⏳ Waiting for assistant reply...")
        assistant_bubble = WebDriverWait(driver, 30).until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, ".message-assistant .markdown-content"))
        )

        # Wait for streaming to finish
        time.sleep(3)
        response_text = assistant_bubble.text
        print(f"📥 Received AI response: \n---\n{response_text}\n---")

        # 7. Validate response
        assert len(response_text.strip()) > 0, "Error: AI response is empty!"
        assert "40" in response_text, f"Error: Expected '40' in response, but got: {response_text}"
        print("🎉 Validation passed: Response contains '40'!")

        # 8. Save screenshot
        os.makedirs("tests/screenshots", exist_ok=True)
        screenshot_path = "tests/screenshots/selenium_response.png"
        driver.save_screenshot(screenshot_path)
        print(f"📸 Saved verification screenshot to {screenshot_path}")
        print("✨ Selenium E2E automation test completed successfully!")

    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    try:
        run_e2e_selenium_test()
    except Exception as exc:
        print(f"❌ Selenium E2E Test Failed: {exc}", file=sys.stderr)
        sys.exit(1)

import os

from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables from .env
load_dotenv()

# Initialize the LLM client configured for OpenRouter
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
    default_headers={
        "HTTP-Referer": "mz-localhost",  # Optional: Replace with your site URL
        "X-Title": "mz - localhost",                  # Optional: Replace with your app name
    }
)

# Set the model to match your OpenRouter request (e.g., 'openai/gpt-4o')
MODEL = os.getenv("OPENROUTER_MODEL", "openrouter/free")


def chat():
    print("Personal AI Assistant (Powered by OpenRouter)")
    print("Type 'exit' to quit.\n")

    messages = [
        {
            "role": "system",
            "content": "You are a helpful personal AI assistant."
        }
    ]

    while True:
        user_input = input("You: ").strip()

        if user_input.lower() in {"exit", "quit"}:
            print("Assistant: Goodbye!")
            break

        if not user_input:
            continue

        messages.append({
            "role": "user",
            "content": user_input
        })

        try:
            response = client.chat.completions.create(
                model=MODEL,
                messages=messages
            )

            assistant_reply = response.choices[0].message.content

            if assistant_reply is None:
                assistant_reply = "I couldn't generate a text response."

            print(f"\nAssistant: {assistant_reply}\n")

            messages.append({
                "role": "assistant",
                "content": assistant_reply
            })

        except Exception as error:
            print(f"\nError communicating with the LLM: {error}\n")


if __name__ == "__main__":
    chat()
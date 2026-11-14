import os


# Backend tests must never use a developer's configured Gemini credential.
os.environ["GEMINI_API_KEY"] = ""
os.environ["GEMINI_TIMEOUT_SECONDS"] = "120"

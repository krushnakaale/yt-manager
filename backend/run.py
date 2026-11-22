"""Entry point (also the PyInstaller entry). Always binds to loopback."""
import os
import uvicorn
from app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("YTM_PORT", "8000")), log_level="warning")

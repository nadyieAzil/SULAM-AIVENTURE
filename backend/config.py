"""Configuration settings for AI MathMentor."""
import os
from dataclasses import dataclass, field
from pathlib import Path

# Load .env file if python-dotenv is installed
try:
    from dotenv import load_dotenv
    # Look for .env in project root
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass


def _bool_env(name: str, default: bool = False) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("true", "1", "yes", "on")


def _int_env(name: str, default: int) -> int:
    val = os.getenv(name)
    if val is None:
        return default
    try:
        return int(val.strip())
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    # LLM Settings (Contract A)
    llm_base_url: str = field(
        default_factory=lambda: os.getenv("LLM_BASE_URL", "")
    )
    llm_api_key: str = field(
        default_factory=lambda: os.getenv("LLM_API_KEY", "")
    )
    llm_model: str = field(
        default_factory=lambda: os.getenv("LLM_MODEL", "qwen2.5:7b")
    )
    embed_model: str = field(
        default_factory=lambda: os.getenv("EMBED_MODEL", "")
    )

    # Supabase Settings (Contract A)
    supabase_url: str = field(
        default_factory=lambda: os.getenv("SUPABASE_URL", "")
    )
    supabase_anon_key: str = field(
        default_factory=lambda: os.getenv("SUPABASE_ANON_KEY", "")
    )
    supabase_jwks_url: str = field(
        default_factory=lambda: os.getenv("SUPABASE_JWKS_URL", "")
    )
    supabase_jwt_secret: str = field(
        default_factory=lambda: os.getenv("SUPABASE_JWT_SECRET", "")
    )

    # Auth & Rate Limiting (Contract A)
    auth_required: bool = field(
        default_factory=lambda: _bool_env("AUTH_REQUIRED", False)
    )
    rate_limit_per_min: int = field(
        default_factory=lambda: _int_env("RATE_LIMIT_PER_MIN", 8)
    )
    rate_limit_per_day: int = field(
        default_factory=lambda: _int_env("RATE_LIMIT_PER_DAY", 120)
    )

    # Server & CORS (Contract A)
    allowed_origins: str = field(
        default_factory=lambda: os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:8000")
    )

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()


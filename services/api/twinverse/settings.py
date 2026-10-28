"""Runtime settings. Secrets come from the environment, never from source."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    model_api_key: str = ""
    # Extra Meta keys (comma-separated) tried on auth/rate-limit failure —
    # e.g. hackathon + Muse Code + opencode dashboard keys as one pool.
    model_api_key_fallbacks: str = ""
    meta_model_base_url: str = "https://api.meta.ai/v1"
    meta_model_sim: str = "muse-spark-1.3"
    meta_model_eval: str = "muse-spark-1.3"
    twinverse_fixtures: str = "auto"  # auto | on | off
    model_timeout_s: float = 60.0
    twinverse_db_path: str = "data/twinverse.db"
    twinverse_card_dir: str = "data/cards"
    meta_model_image: str = "muse-image-1.0"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    # Talking-verdict avatars: fully local open-source pipeline (MeloTTS +
    # OpenVoice voice cloning, MuseTalk lip-sync on CUDA GPUs). The user's
    # photo + voice sample stay on this machine under twinverse_avatar_dir.
    twinverse_avatar_dir: str = "data/avatars"
    twinverse_kokoro_dir: str = "models/kokoro"
    twinverse_openvoice_ckpt: str = "models/openvoice_v2"
    twinverse_musetalk_repo: str = ""
    # Inference placement: "local" renders on this machine (dev/demo);
    # "http" sends renders to your cloud inference service (production —
    # customers never install anything). See docs/CLOUD.md.
    twinverse_avatar_provider: str = "local"  # local | http
    twinverse_inference_url: str = ""  # e.g. https://inference.yourcloud.example
    twinverse_inference_token: str = ""  # shared secret with the inference service
    inference_timeout_s: float = 900.0
    # Accounts: when on, /api/* (except health + auth) requires a bearer token.
    twinverse_auth_required: bool = False
    twinverse_auth_secret: str = ""  # signs session tokens; set in production

    @property
    def api_keys(self) -> list[str]:
        keys = [self.model_api_key]
        keys += [k.strip() for k in self.model_api_key_fallbacks.split(",")]
        return [k for k in keys if k]

    @property
    def fixtures_enabled(self) -> bool:
        if self.twinverse_fixtures == "on":
            return True
        if self.twinverse_fixtures == "off":
            return False
        return not self.model_api_key  # auto: fixtures only when no key


def get_settings() -> Settings:
    """Fresh settings per call so env changes (tests, key rotation) apply.

    UI-saved inference overrides (Your Clone page) layer over env values.
    """
    from .app_config import apply_overrides

    return apply_overrides(Settings())


settings = get_settings()

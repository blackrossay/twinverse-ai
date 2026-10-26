"""Runtime settings. Secrets come from the environment, never from source."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    model_api_key: str = ""
    meta_model_base_url: str = "https://api.meta.ai/v1"
    meta_model_sim: str = "muse-spark-1.3"
    meta_model_eval: str = "muse-spark-1.3"
    twinverse_fixtures: str = "auto"  # auto | on | off
    model_timeout_s: float = 60.0
    twinverse_db_path: str = "data/twinverse.db"

    @property
    def fixtures_enabled(self) -> bool:
        if self.twinverse_fixtures == "on":
            return True
        if self.twinverse_fixtures == "off":
            return False
        return not self.model_api_key  # auto: fixtures only when no key


settings = Settings()
